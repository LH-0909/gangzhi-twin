"""A bounded, deterministic operation model for a fictional Dalian-inspired terminal."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import random
import sqlite3

from . import cargo_flow
from .navigation import approach_path, departure_path, navigation, route_clear, travel_duration


SCENARIOS = {"normal", "fog", "wind", "road_block", "crane_fault", "channel_closed"}
BERTHS = {
    "B01": {"types": {"container", "reefer"}, "depth": 16.0},
    "B02": {"types": {"container", "reefer"}, "depth": 15.0},
    "B03": {"types": {"bulk"}, "depth": 15.5},
    "B04": {"types": {"tanker"}, "depth": 18.0},
}


def clock(seconds: float) -> str:
    total = 8 * 3600 + int(seconds)
    return f"{total//3600%24:02}:{total//60%60:02}:{total%60:02}"


def cold_initial(at: float = 0.0) -> dict:
    """One simulated frozen-seafood lot; values are teaching assumptions."""
    return {"lot_id":"SEAFOOD-DEMO-01","name":"冻藏水产品（演示）","mass_tonnes":18.0,
            "sensor_id":"TEMP-RF-01","equipment_id":"RF-01","temperature_c":-18.0,
            "setpoint_c":-18.0,"limit_c":-15.0,"peak_c":-18.0,"exposure_seconds":0.0,
            "fault_active":False,"sample_at":at,
            "samples":[{"time":clock(at),"sim_time":at,"temperature_c":-18.0}]}


class Simulation:
    def __init__(self, seed: int = 42):
        self.seed = seed
        self.schema_version = 5
        self.sim_time = 0.0
        self.running = False
        self.speed = 30.0
        self.scenario = "normal"
        self.energy_kwh = 0.0
        self.throughput = 0.0
        self.series: list[dict] = []
        self.alerts: list[dict] = []
        self.events: list[dict] = []
        self.vessels = []
        self.flows: list[dict] = []
        self.cold = cold_initial()
        self._counter = 0
        self._sample_at = -300.0
        rng = random.Random(seed)
        specs = [
            ("V001","辽海远航","container",0,980,12.5,1),
            ("V002","新大连号","container",0,760,11.8,2),
            ("V003","东北粮运","bulk",0,12000,13.2,1),
            ("V004","海洋能源","tanker",300,16000,15.0,1),
            ("V005","蓝湾冷链","reefer",600,420,9.6,3),
            ("V006","东北亚之星","container",1200,860,12.1,2),
            ("V007","黄海新程","container",2100,650,11.0,1),
            ("V008","海大探索","reefer",3000,380,9.2,3),
        ]
        for id_,name,kind,arrival,cargo,draft,priority in specs:
            self.vessels.append({"id":id_,"name":name,"type":kind,"arrival":arrival,
                "cargo_teu":cargo if kind in ("container","reefer") else 0,
                "cargo_tonnes":cargo if kind in ("bulk","tanker") else 0,
                "draft":draft,"priority":priority,"status":"waiting",
                "berth_id":None,"progress":0.0,"started_at":None,"work_started_at":None,
                "completed_at":None,"departed_at":None,"departure_duration":None,
                "worked":0.0,"duration":float(rng.randint(3600,6200)),
                "announced":False})
        self.equipment = []
        for i in range(6):
            self.equipment.append({"id":f"QC-{i+1:02}","name":f"岸桥 {i+1:02}","kind":"crane",
                "zone":f"B0{i//2+1}","status":"idle","utilization":0.0,"energy_kwh":0.0})
        for i in range(6):
            self.equipment.append({"id":f"AGV-{i+1:02}","name":f"智能集卡 {i+1:02}","kind":"agv",
                "zone":"集装箱堆场","status":"idle","utilization":0.0,"energy_kwh":0.0})
        self.equipment.extend([
            {"id":"RF-01","name":"海产品冷链中心","kind":"reefer","zone":"冷链港区","status":"working","utilization":68.0,"energy_kwh":0.0},
            {"id":"SP-01","name":"港区岸电站","kind":"shore_power","zone":"B04","status":"idle","utilization":0.0,"energy_kwh":0.0},
        ])
        self._event("港区仿真已初始化", "simulation", "info")
        self._allocate()
        # Keep the actual input intervals: replay preserves fractional ticker steps,
        # scenario changes and acknowledgements, rather than estimating old KPIs.
        self._history: list[dict] = []
        self._head = 0.0
        self._origin = copy.deepcopy(self._core_record())
        self._head_events = copy.deepcopy(self.events)
        self.advance(1200)
        self.running = False

    def _event(self, title: str, entity_id: str, level: str = "info", at: float | None = None) -> None:
        timestamp = self.sim_time if at is None else at
        self._counter += 1
        self.events.append({"id":f"EV-{self._counter:05}","title":title,"entity_id":entity_id,
                            "level":level,"time":clock(timestamp),"sim_time":timestamp})
        self.events = self.events[-200:]

    def _alert(self, key: str, level: str, title: str, detail: str, entity_id: str, at: float | None = None) -> None:
        if any(a["id"] == key for a in self.alerts):
            return
        self.alerts.append({"id":key,"level":level,"title":title,"detail":detail,
            "entity_id":entity_id,"acknowledged":False,"active":True,"created_at":clock(self.sim_time if at is None else at)})
        self._event(title,entity_id,level,at=at)

    def set_cold_fault(self, active: bool) -> None:
        if self.cold["fault_active"] == active:
            return
        self._branch()
        self._history.append({"at":self.sim_time,"kind":"cold_fault","value":active})
        self._set_cold_fault_raw(active)
        self._head_events = copy.deepcopy(self.events)

    def _set_cold_fault_raw(self, active: bool) -> None:
        self.cold["fault_active"] = active
        if active:
            self._alert(f"CF-RF-{self._counter+1}","critical","冷链设备 RF-01 停机",
                        "演示设定：制冷停机，库温将逐渐上升。请关注温度和累计超温时间。","RF-01")
        else:
            for alert in self.alerts:
                if alert["id"].startswith("CF-RF-"):
                    alert["active"] = False
            self._event("冷链设备 RF-01 已恢复制冷","RF-01")
        self._update_equipment(0)

    def _advance_cold(self, dt: float) -> None:
        cold = self.cold
        before,limit = cold["temperature_c"],cold["limit_c"]
        # Linear illustrative thermal model, not a food safety threshold or
        # calibrated refrigeration model. The target and rates are explicit.
        after = min(2.0,before+0.015*dt) if cold["fault_active"] else max(cold["setpoint_c"],before-0.012*dt)
        if before > limit and after > limit:
            cold["exposure_seconds"] += dt
        elif before <= limit < after:
            cold["exposure_seconds"] += dt*(after-limit)/(after-before)
            self._alert(f"TEMP-RF-{self._counter+1}","warning","水产品冷库温度超过演示阈值",
                        "批次 SEAFOOD-DEMO-01 开始累计超温时间；恢复后仍需检查本批次。","RF-01",at=self.sim_time+dt)
        elif before > limit >= after:
            cold["exposure_seconds"] += dt*(before-limit)/(before-after)
            for alert in self.alerts:
                if alert["id"].startswith("TEMP-RF-"):
                    alert["active"] = False
            self._event("冷库温度恢复至演示阈值内，超温记录保留","RF-01",at=self.sim_time+dt)
        cold["temperature_c"] = after
        cold["peak_c"] = max(cold["peak_c"],after)
        when = self.sim_time+dt
        if when-cold["sample_at"] >= 60:
            cold["samples"].append({"time":clock(when),"sim_time":when,"temperature_c":round(after,3)})
            cold["samples"] = cold["samples"][-121:]
            cold["sample_at"] = when

    def set_scenario(self, kind: str) -> None:
        if kind not in SCENARIOS:
            raise ValueError("未知仿真场景")
        self._branch()
        self._history.append({"at":self.sim_time,"kind":"scenario","value":kind})
        self._set_scenario_raw(kind)
        self._head_events = copy.deepcopy(self.events)

    def _set_scenario_raw(self, kind: str) -> None:
        road_changed = (self.scenario == "road_block") != (kind == "road_block")
        for alert in self.alerts:
            if alert["id"].startswith("SC-"):
                alert["active"] = False
        self.scenario = kind
        if road_changed:
            for flow in self.flows:
                cargo_flow.replan(flow,kind == "road_block")
        for flow in self.flows:
            cargo_flow.refresh(flow,self.vessels,kind)
        messages = {
            "fog": ("warning","海雾影响进出港","演示设定：能见度下降，靠泊时间延长，岸桥效率降至 72%。","B01"),
            "wind": ("critical","大风作业限制","演示设定：岸桥进入天气暂停；等待船舶重新计算作业窗口。","QC-01"),
            "road_block": ("warning","堆场主干道封闭","junction→yard 路段关闭；A* 路径改走外侧通道。","AGV-01"),
            "crane_fault": ("critical","岸桥 QC-02 故障","B01 两台岸桥中一台停机，装卸能力降低；恢复场景后解除。","QC-02"),
            "channel_closed": ("warning","港区航道临时关闭","新进出港预约暂停；已经在航道中的船舶先完成当前航行。","ZONE-CHANNEL"),
        }
        self._event(f"场景切换：{kind}", "scenario")
        if kind in messages:
            level,title,detail,entity = messages[kind]
            self._alert(f"SC-{kind}-{self._counter}",level,title,detail,entity)
        self._update_equipment(0)

    def acknowledge(self, alert_id: str) -> bool:
        if not any(a["id"] == alert_id for a in self.alerts):
            return False
        self._branch()
        if not any(a["id"] == alert_id and a["acknowledged"] for a in self.alerts):
            self._history.append({"at":self.sim_time,"kind":"ack","value":alert_id})
        result = self._acknowledge_raw(alert_id)
        self._head_events = copy.deepcopy(self.events)
        return result

    def _acknowledge_raw(self, alert_id: str) -> bool:
        for alert in self.alerts:
            if alert["id"] == alert_id:
                if not alert["acknowledged"]:
                    alert["acknowledged"] = True
                    self._event(f"已确认：{alert['title']}",alert["entity_id"])
                return True
        return False

    def _allocate(self) -> None:
        occupied = {v["berth_id"] for v in self.vessels if v["status"] in ("berthing","working","waiting_departure","sailing")}
        channel_busy = self.scenario == "channel_closed" or any(v["status"] in ("berthing","sailing") for v in self.vessels)
        queue = sorted([v for v in self.vessels if v["status"] == "waiting" and v["arrival"] <= self.sim_time],
                       key=lambda v:(-v["priority"],v["arrival"],v["id"]))
        for vessel in queue:
            if not vessel["announced"]:
                vessel["announced"] = True
                self._event(f"{vessel['name']} 到达锚地",vessel["id"])
            for berth_id,berth in BERTHS.items():
                if channel_busy:
                    break
                if berth_id not in occupied and vessel["type"] in berth["types"] and vessel["draft"] <= berth["depth"]:
                    duration = travel_duration(approach_path(vessel,berth_id),4.0,600.0)
                    duration = duration*1.5 if self.scenario == "fog" else duration
                    if self.sim_time < vessel.get("nav_retry_at",0):
                        continue
                    proposed = {**vessel,"status":"berthing","berth_id":berth_id,
                                "started_at":self.sim_time,"berthing_duration":duration}
                    if not route_clear(proposed,self.vessels,self.sim_time,duration):
                        vessel["nav_retry_at"] = self.sim_time+30
                        self._alert(f"NAV-{vessel['id']}","warning",f"{vessel['name']} 航道存在潜在冲突",
                                    "示范模型暂停分配，等待航道和泊位空间满足几何检查。",vessel["id"])
                        continue
                    vessel.update(status="berthing",berth_id=berth_id,started_at=self.sim_time,
                                  berthing_duration=duration)
                    for alert in self.alerts:
                        if alert["id"] == f"NAV-{vessel['id']}":
                            alert["active"] = False
                    occupied.add(berth_id)
                    channel_busy = True
                    for alert in self.alerts:
                        if alert["id"] == f"WAIT-{vessel['id']}":
                            alert["active"] = False
                    self._event(f"{vessel['name']} 获配 {berth_id}，开始靠泊",vessel["id"])
                    break
            if vessel["status"] == "waiting" and self.sim_time-vessel["arrival"] >= 900:
                self._alert(f"WAIT-{vessel['id']}","warning",f"{vessel['name']} 等泊超过 15 分钟",
                            "泊位资源繁忙，可在调度实验室比较资源配置策略。",vessel["id"])

    def _dispatch_channel(self) -> None:
        if self.scenario != "channel_closed" and not any(v["status"] in ("berthing","sailing") for v in self.vessels):
            waiting = sorted((v for v in self.vessels if v["status"] == "waiting_departure"),
                             key=lambda v:(v["completed_at"],v["id"]))
            if waiting:
                vessel = waiting[0]
                duration = travel_duration(departure_path(vessel),4.0,600.0)
                proposed = {**vessel,"status":"sailing","departed_at":self.sim_time,"departure_duration":duration}
                if self.sim_time >= vessel.get("nav_retry_at",0) and route_clear(proposed,self.vessels,self.sim_time,duration):
                    vessel.update(status="sailing",departed_at=self.sim_time,departure_duration=duration)
                    for alert in self.alerts:
                        if alert["id"] == f"NAV-{vessel['id']}":
                            alert["active"] = False
                    self._event(f"{vessel['name']} 获准离泊并进入航道",vessel["id"])
                elif self.sim_time >= vessel.get("nav_retry_at",0):
                    vessel["nav_retry_at"] = self.sim_time+30
                    self._alert(f"NAV-{vessel['id']}","warning",f"{vessel['name']} 离泊航道存在潜在冲突",
                                "示范模型暂缓离泊，等待航道空间满足几何检查。",vessel["id"])
        # Continue recording arrivals and waits even when another vessel is moving.
        self._allocate()

    def _work_rate(self, vessel: dict) -> float:
        if vessel["status"] != "working":
            return 0.0
        factor = 0.0 if self.scenario == "wind" and vessel["type"] != "tanker" else 0.72 if self.scenario == "fog" else 1.0
        if self.scenario == "crane_fault" and vessel["berth_id"] == "B01":
            factor *= 0.5
        if self.scenario == "road_block" and vessel["type"] in ("container","reefer"):
            factor *= 0.86
        return factor

    def _update_equipment(self, dt: float) -> None:
        working = [v for v in self.vessels if v["status"] == "working"]
        berths = {v["berth_id"] for v in working}
        for device in self.equipment:
            kind = device["kind"]
            if kind == "crane":
                status = "working" if device["zone"] in berths else "idle"
                if self.scenario == "wind":
                    status = "weather_hold"
                elif self.scenario == "crane_fault" and device["id"] == "QC-02":
                    status = "fault"
                utilization = 92 if status == "working" else 0
                if self.scenario == "fog" and status == "working":
                    utilization = 66
                power = 45 if status == "working" else 3
            elif kind == "agv":
                status = "working" if working and self.scenario != "wind" else "idle"
                if device["id"] == "AGV-01" and self.flows:
                    status = "working" if self.flows[0]["phase"] in ("drive_yard","drive_gate") else "idle"
                utilization = (79 if self.scenario == "road_block" else 64) if status == "working" else 0
                power = (8 if self.scenario == "road_block" else 6) if status == "working" else 1
            elif kind == "shore_power":
                status = "working" if berths else "idle"
                utilization = 70 if status == "working" else 0
                power = 150 if status == "working" else 5
            else:
                status,utilization,power = ("fault",0,1) if self.cold["fault_active"] else ("working",68,22)
            device["status"] = status
            device["utilization"] = utilization
            amount = power*dt/3600
            device["energy_kwh"] += amount
            self.energy_kwh += amount

    def _core_record(self) -> dict:
        return {k:copy.deepcopy(v) for k,v in self.__dict__.items()
                if k not in ("_history","_head","_origin","_head_events")}

    def start_flow(self) -> dict:
        if self.flows:
            return self.flows[0]
        eligible = [v for v in self.vessels if v["berth_id"] == "B01" and v["status"] in ("berthing","working")]
        if not eligible:
            raise ValueError("B01 暂无可用箱船，请回放到靠泊作业时段或重置本轮仿真")
        self._branch()
        vessel_id = eligible[0]["id"]
        self._history.append({"at":self.sim_time,"kind":"flow_start","value":vessel_id})
        flow = self._start_flow_raw(vessel_id)
        self._head_events = copy.deepcopy(self.events)
        return flow

    def _start_flow_raw(self, vessel_id: str) -> dict:
        flow = cargo_flow.new_flow(vessel_id,self.sim_time)
        cargo_flow.refresh(flow,self.vessels,self.scenario)
        self.flows.append(flow)
        self._event(f"{flow['box_id']} · 创建箱运示范任务",flow["box_id"])
        return flow

    def _branch(self) -> None:
        if self.sim_time >= self._head-1e-8:
            return
        kept = []
        for item in self._history:
            if item["at"] > self.sim_time+1e-8:
                break
            item = copy.deepcopy(item)
            if item["kind"] == "advance":
                end = item.get("until",item["at"]+item["seconds"])
                if self.sim_time < end-1e-8:
                    item["seconds"] = min(item["seconds"],self.sim_time-item["at"])
                    item["until"] = self.sim_time
                if item["seconds"] <= 1e-8:
                    continue
            kept.append(item)
        self._history = kept
        self._head = self.sim_time

    def seek(self, target: float) -> None:
        minimum = self._origin["sim_time"]
        if not minimum <= target <= self._head:
            raise ValueError("只能回放已记录的仿真时间")
        running,speed = self.running,self.speed
        self.__dict__.update(copy.deepcopy(self._origin))
        for item in self._history:
            if item["at"] > target+1e-8:
                break
            if item["kind"] == "advance":
                end = item.get("until",item["at"]+item["seconds"])
                duration = item["seconds"] if target >= end-1e-8 else min(item["seconds"],target-item["at"])
                if duration > 1e-8:
                    self._advance_raw(duration)
            elif item["kind"] == "scenario":
                self._set_scenario_raw(item["value"])
            elif item["kind"] == "ack":
                self._acknowledge_raw(item["value"])
            elif item["kind"] == "flow_start":
                self._start_flow_raw(item["value"])
            elif item["kind"] == "cold_fault":
                self._set_cold_fault_raw(item["value"])
        self.running,self.speed = running,speed

    def advance(self, seconds: float) -> None:
        if not 0 <= seconds <= 86400:
            raise ValueError("推进时长超出范围")
        if self.sim_time < self._head-1e-8:
            replay = min(seconds,self._head-self.sim_time)
            self.seek(self.sim_time+replay)
            seconds -= replay
        if seconds <= 1e-8:
            return
        interval = {"at":self.sim_time,"kind":"advance","seconds":seconds}
        self._history.append(interval)
        self._advance_raw(seconds)
        interval["until"] = self.sim_time
        self._head = self.sim_time
        self._head_events = copy.deepcopy(self.events)

    def _advance_raw(self, seconds: float) -> None:
        if seconds < 0 or seconds > 86400:
            raise ValueError("仿真步长必须介于 0 和 86400 秒")
        remaining = seconds
        while remaining > 1e-8:
            dt = min(5.0,remaining)
            self._dispatch_channel()
            for vessel in self.vessels:
                if vessel["status"] == "berthing":
                    delay = vessel.get("berthing_duration",600.0)
                    if self.sim_time-vessel["started_at"] >= delay:
                        vessel["status"] = "working"
                        vessel["work_started_at"] = self.sim_time
                        self._event(f"{vessel['name']} 靠泊完成，开始作业",vessel["id"])
                if vessel["status"] == "working":
                    factor = self._work_rate(vessel)
                    delta = min(dt*factor,vessel["duration"]-vessel["worked"])
                    vessel["worked"] += delta
                    vessel["progress"] = min(100,100*vessel["worked"]/vessel["duration"])
                    if vessel["type"] in ("container","reefer"):
                        self.throughput += vessel["cargo_teu"]*delta/vessel["duration"]
                    if vessel["progress"] >= 100-1e-8:
                        vessel.update(status="waiting_departure",completed_at=self.sim_time+dt)
                        self._event(f"{vessel['name']} 完成作业，等待离泊航道",vessel["id"],at=self.sim_time+dt)
                elif vessel["status"] == "sailing" and self.sim_time-vessel["departed_at"] >= vessel["departure_duration"]:
                    vessel["status"] = "departed"
                    self._event(f"{vessel['name']} 驶离港区",vessel["id"])
            for flow in self.flows:
                cargo_flow.update(flow,self.vessels,self.scenario,self.sim_time,dt,self._event)
            self._advance_cold(dt)
            self._update_equipment(dt)
            self.sim_time += dt
            remaining -= dt
            if self.sim_time-self._sample_at >= 300:
                self.series.append({"time":clock(self.sim_time)[:5],"throughput":round(self.throughput),
                                    "energy":round(self.energy_kwh,1)})
                self.series = self.series[-72:]
                self._sample_at = self.sim_time
        # Reproject inventory from bounded entity work to avoid cumulative float drift.
        self.throughput = sum(v["cargo_teu"]*min(1.0,v["worked"]/v["duration"])
                              for v in self.vessels if v["type"] in ("container","reefer"))
        self.energy_kwh = sum(device["energy_kwh"] for device in self.equipment)

    def public_state(self) -> dict:
        equipment = [{**e,"energy_kwh":round(e["energy_kwh"],2)} for e in self.equipment]
        displayed_energy = round(sum(e["energy_kwh"] for e in equipment),2)
        vessels = [{**{key:v[key] for key in ("id","name","type","status","berth_id","cargo_teu","draft")},
                    "cargo_tonnes":v["cargo_tonnes"],
                    "cargo_amount":v["cargo_tonnes"] if v["type"] in ("bulk","tanker") else v["cargo_teu"],
                    "cargo_unit":"t" if v["type"] in ("bulk","tanker") else "TEU",
                    "arrived":v["arrival"] <= self.sim_time,"eta_seconds":v["arrival"],
                    "eta":clock(v["arrival"]),"progress":round(v["progress"],1),
                    "work_seconds":v["worked"],"work_rate":self._work_rate(v),
                    "navigation":navigation(v,self.sim_time)} for v in self.vessels]
        tasks = []
        for vessel in self.vessels:
            status = "completed" if vessel["status"] in ("waiting_departure","sailing","departed") else "running" if vessel["status"] == "working" else "pending"
            tasks.append({"id":f"TASK-{vessel['id']}","vessel_id":vessel["id"],
                "kind":"冷链优先运输" if vessel["type"] == "reefer" else "能源装卸" if vessel["type"] == "tanker" else "散粮装卸" if vessel["type"] == "bulk" else "集装箱装卸",
                "source":vessel["berth_id"] or "锚地","target":"冷链中心" if vessel["type"] == "reefer" else "铁路/堆场",
                "status":status,"progress":round(vessel["progress"],1),"priority":vessel["priority"]})
        waits = [v["started_at"]-v["arrival"] for v in self.vessels if v["started_at"] is not None]
        active = sum(v["status"] in ("berthing","working","waiting_departure","sailing") for v in self.vessels)
        return {"sim_time":round(self.sim_time,2),"running":self.running,"speed":self.speed,
                "timeline":{"minimum":self._origin["sim_time"],"head":self._head,
                            "replaying":self.sim_time < self._head-0.05,
                            "events":copy.deepcopy(self._head_events)},
                "scenario":self.scenario,"seed":self.seed,"vessels":vessels,
                "flows":[cargo_flow.public(flow,self.scenario) for flow in self.flows],
                "cold_chain":{**copy.deepcopy(self.cold),"temperature_c":round(self.cold["temperature_c"],2),
                              "peak_c":round(self.cold["peak_c"],2),
                              "exposure_seconds":round(self.cold["exposure_seconds"],2),
                              "above_limit":self.cold["temperature_c"]>self.cold["limit_c"]},
                "data_basis":{"mode":"simulation","model_version":5,"coordinates":"illustrative_metres",
                              "tracked_cargo":"single_40hc_demonstration","bulk_kpis":"aggregate_estimates",
                              "carbon_factor_kg_per_kwh":0.57},
                "equipment":equipment,
                "tasks":tasks,"alerts":copy.deepcopy(self.alerts),"events":copy.deepcopy(self.events),
                "series":copy.deepcopy(self.series),
                "kpis":{"throughput_teu":round(self.throughput),"berth_utilization":active/len(BERTHS)*100,
                        "bulk_tonnes":round(sum(v["cargo_tonnes"]*min(1.0,v["worked"]/v["duration"])
                                                for v in self.vessels if v["type"] == "bulk"),2),
                        "liquid_tonnes":round(sum(v["cargo_tonnes"]*min(1.0,v["worked"]/v["duration"])
                                                  for v in self.vessels if v["type"] == "tanker"),2),
                        "avg_wait_minutes":round(sum(waits)/len(waits)/60,2) if waits else 0,
                        "energy_kwh":displayed_energy,"carbon_kg":round(displayed_energy*0.57,2),
                        "completed_tasks":sum(t["status"] == "completed" for t in tasks)}}

    def to_record(self) -> str:
        return json.dumps(self.__dict__,ensure_ascii=False)

    @classmethod
    def from_record(cls, record: str) -> "Simulation":
        instance = cls.__new__(cls)
        instance.__dict__.update(json.loads(record))
        if getattr(instance,"schema_version",1) < 2:
            for vessel in instance.vessels:
                if vessel["type"] in ("bulk","tanker"):
                    vessel["cargo_tonnes"] = vessel["cargo_teu"]*10
                    vessel["cargo_teu"] = 0
                else:
                    vessel["cargo_tonnes"] = 0
            instance.schema_version = 2
        if instance.schema_version < 3:
            # Preserve existing business state. Earlier histories used different
            # approach durations, so begin a new recording at this snapshot.
            instance.flows = []
            for vessel in instance.vessels:
                if vessel["started_at"] is not None:
                    vessel["berthing_duration"] = 120.0
            instance.schema_version = 3
            for key in ("_history","_head","_origin","_head_events"):
                instance.__dict__.pop(key,None)
        instance.running = False  # A server restart requires explicit operator resume.
        if not hasattr(instance,"_history"):
            # Old snapshots have no input history: retain their state and start
            # recording here, without inventing an earlier replay.
            instance._history = []
            instance._head = instance.sim_time
            instance._origin = instance._core_record()
            instance._head_events = copy.deepcopy(instance.events)
        if instance.schema_version < 5:
            # Old traffic rules allowed simultaneous manoeuvres and cannot be
            # replayed faithfully with the new channel reservation model.
            # Store.load archives the complete original record first.
            if not hasattr(instance,"cold"):
                instance.cold = cold_initial(instance.sim_time)
            berthing = sorted((v for v in instance.vessels if v["status"] == "berthing"),
                              key=lambda v:(v["started_at"],v["id"]))
            for vessel in instance.vessels:
                vessel.setdefault("departed_at",None)
                vessel.setdefault("departure_duration",None)
            for vessel in berthing:
                vessel.update(status="waiting",berth_id=None,started_at=None,work_started_at=None)
            instance.schema_version = 5
            instance._event("航道模型升级，旧轮次已归档；从当前时刻继续记录","simulation")
            instance._history = []
            instance._head = instance.sim_time
            instance._origin = instance._core_record()
            instance._head_events = copy.deepcopy(instance.events)
        return instance


class Store:
    def __init__(self, path: str):
        self.path = path
        Path(path).parent.mkdir(parents=True,exist_ok=True)
        with sqlite3.connect(path) as db:
            db.execute("CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS experiment_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)")
            db.execute("CREATE TABLE IF NOT EXISTS snapshot_archives (id INTEGER PRIMARY KEY AUTOINCREMENT, model_version INTEGER NOT NULL, payload TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)")

    def load(self) -> Simulation:
        with sqlite3.connect(self.path) as db:
            row = db.execute("SELECT payload FROM snapshots WHERE id=1").fetchone()
            if row:
                version = json.loads(row[0]).get("schema_version",1)
                if version < 5 and not db.execute("SELECT 1 FROM snapshot_archives WHERE payload=?",(row[0],)).fetchone():
                    db.execute("INSERT INTO snapshot_archives (model_version,payload) VALUES (?,?)",(version,row[0]))
        return Simulation.from_record(row[0]) if row else Simulation()

    def list_archives(self) -> list[dict]:
        with sqlite3.connect(self.path) as db:
            rows = db.execute("SELECT id,model_version,payload,created_at FROM snapshot_archives ORDER BY id DESC").fetchall()
        return [{"id":id_,"model_version":version,"sim_time":json.loads(payload).get("sim_time"),"created_at":created}
                for id_,version,payload,created in rows]

    def archive(self, simulation: Simulation) -> None:
        payload = simulation.to_record()
        with sqlite3.connect(self.path) as db:
            if not db.execute("SELECT 1 FROM snapshot_archives WHERE payload=?",(payload,)).fetchone():
                db.execute("INSERT INTO snapshot_archives (model_version,payload) VALUES (?,?)",(simulation.schema_version,payload))

    def archived_record(self, archive_id: int) -> dict | None:
        with sqlite3.connect(self.path) as db:
            row = db.execute("SELECT payload FROM snapshot_archives WHERE id=?",(archive_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def save(self, simulation: Simulation) -> None:
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO snapshots (id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",(simulation.to_record(),))

    def save_experiment(self, result: dict) -> None:
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO experiment_runs (payload) VALUES (?)",(json.dumps(result,ensure_ascii=False),))
