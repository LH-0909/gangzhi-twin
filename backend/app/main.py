from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
import os
from pathlib import Path
import time
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from .experiments import compare
from .routing import route_response
from .simulation import Simulation, Store

Scenario = Literal["normal","fog","wind","road_block","crane_fault"]
PortScenario = Literal["normal","fog","wind","road_block","crane_fault","channel_closed"]


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Control(StrictInput):
    action: Literal["play","pause","reset","step"]
    speed: float | None = Field(default=None,ge=1,le=120)
    seconds: float = Field(default=60,ge=1,le=3600)


class ScenarioInput(StrictInput):
    kind: PortScenario


class SeekInput(StrictInput):
    seconds: float = Field(ge=0,allow_inf_nan=False)


class ColdFaultInput(StrictInput):
    active: bool = Field(strict=True)


class CompareInput(StrictInput):
    seed: int = Field(default=42,ge=0,le=2147483647,strict=True)
    vessel_count: int = Field(default=12,ge=3,le=60,strict=True)
    scenario: Scenario = "normal"


def create_app(db_path: str | None = None) -> FastAPI:
    database = db_path or os.environ.get("GANGZHI_DB_PATH",str(Path(__file__).resolve().parent.parent/"data"/"gangzhi.sqlite3"))

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.store = Store(database)
        application.state.engine = application.state.store.load()
        application.state.lock = asyncio.Lock()
        application.state.store.save(application.state.engine)

        async def ticker():
            last = time.monotonic()
            while True:
                await asyncio.sleep(1)
                now = time.monotonic()
                elapsed = min(5.0,now-last)
                last = now
                async with application.state.lock:
                    engine = application.state.engine
                    if engine.running:
                        engine.advance(elapsed*engine.speed)
                        application.state.store.save(engine)

        task = asyncio.create_task(ticker())
        try:
            yield
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            application.state.store.save(application.state.engine)

    application = FastAPI(title="港智孪生 · 大连综合港仿真 API",version="0.5.0",lifespan=lifespan,
        description="竞赛教学仿真。港区、货量、效率与能耗系数均为演示设定；非实港生产系统。")
    application.add_middleware(CORSMiddleware,
        allow_origins=[f"http://{host}:{port}" for host in ("localhost","127.0.0.1")
                       for port in (5180,5173,8080,4173,3000)],
        allow_credentials=False,allow_methods=["GET","POST"],allow_headers=["Content-Type"])

    @application.get("/api/health")
    async def health():
        return {"status":"ok","service":"gangzhi-twin","version":"0.5.0","data_mode":"simulation"}

    @application.get("/api/state")
    async def state():
        async with application.state.lock:
            return application.state.engine.public_state()

    @application.get("/api/simulation/archives")
    async def archives():
        return application.state.store.list_archives()

    @application.get("/api/simulation/archives/{archive_id}")
    async def archive(archive_id: int):
        record = application.state.store.archived_record(archive_id)
        if record is None:
            raise HTTPException(404,"历史轮次不存在")
        return record

    @application.post("/api/simulation/archives/{archive_id}/restore")
    async def restore_archive(archive_id: int):
        async with application.state.lock:
            record = application.state.store.archived_record(archive_id)
            if record is None:
                raise HTTPException(404,"历史轮次不存在")
            if record.get("schema_version",1) != 5:
                raise HTTPException(409,"旧模型记录可下载，并需使用对应旧版模型重现")
            application.state.store.archive(application.state.engine)
            application.state.engine = Simulation.from_record(json.dumps(record,ensure_ascii=False))
            application.state.store.save(application.state.engine)
            return application.state.engine.public_state()

    @application.post("/api/simulation/control")
    async def control(payload: Control):
        async with application.state.lock:
            if payload.action == "reset":
                application.state.store.archive(application.state.engine)
                application.state.engine = Simulation(application.state.engine.seed)
            engine = application.state.engine
            if payload.speed is not None:
                engine.speed = payload.speed
            if payload.action == "play":
                engine.running = True
            elif payload.action == "pause":
                engine.running = False
            elif payload.action == "step":
                engine.running = False
                engine.advance(payload.seconds)
            application.state.store.save(engine)
            return engine.public_state()

    @application.post("/api/scenarios")
    async def scenario(payload: ScenarioInput):
        async with application.state.lock:
            engine = application.state.engine
            engine.set_scenario(payload.kind)
            application.state.store.save(engine)
            return engine.public_state()

    @application.post("/api/simulation/seek")
    async def seek(payload: SeekInput):
        async with application.state.lock:
            engine = application.state.engine
            try:
                engine.seek(payload.seconds)
            except ValueError as error:
                raise HTTPException(422,str(error)) from error
            engine.running = False
            application.state.store.save(engine)
            return engine.public_state()

    @application.post("/api/simulation/live")
    async def live():
        async with application.state.lock:
            engine = application.state.engine
            engine.seek(engine._head)
            engine.running = True
            application.state.store.save(engine)
            return engine.public_state()

    @application.post("/api/cargo/start")
    async def start_cargo():
        async with application.state.lock:
            engine = application.state.engine
            try:
                engine.start_flow()
            except ValueError as error:
                raise HTTPException(409,str(error)) from error
            application.state.store.save(engine)
            return engine.public_state()

    @application.post("/api/cold-chain/fault")
    async def cold_fault(payload: ColdFaultInput):
        async with application.state.lock:
            engine = application.state.engine
            engine.set_cold_fault(payload.active)
            application.state.store.save(engine)
            return engine.public_state()

    @application.post("/api/alerts/{alert_id}/ack")
    async def acknowledge(alert_id: str):
        async with application.state.lock:
            engine = application.state.engine
            if not engine.acknowledge(alert_id):
                raise HTTPException(404,"告警不存在")
            application.state.store.save(engine)
            return engine.public_state()

    @application.post("/api/experiments/compare")
    async def experiment(payload: CompareInput):
        result = compare(payload.seed,payload.vessel_count,payload.scenario)
        application.state.store.save_experiment(result)
        return result

    @application.get("/api/routes")
    async def routes(blocked: bool = Query(default=False)):
        return route_response(blocked)

    return application


app = create_app()
