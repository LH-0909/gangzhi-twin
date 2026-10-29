"""A bounded, deterministic operation model for a fictional Dalian-inspired terminal."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import random
import sqlite3


SCENARIOS = {"normal", "fog", "wind", "road_block", "crane_fault"}
BERTHS = {
    "B01": {"types": {"container", "reefer"}, "depth": 16.0},
    "B02": {"types": {"container", "reefer"}, "depth": 15.0},
    "B03": {"types": {"bulk"}, "depth": 15.5},
    "B04": {"types": {"tanker"}, "depth": 18.0},
}


def clock(seconds: float) -> str:
    total = 8 * 3600 + int(seconds)
    return f"{total//3600%24:02}:{total//60%60:02}:{total%60:02}"


class Simulation:
    def __init__(self, seed: int = 42):
        self.seed = seed
        self.schema_version = 2
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
                "completed_at":None,"worked":0.0,"duration":float(rng.randint(3600,6200)),
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
        self.advance(1200)
        self.running = False

    def _event(self, title: str, entity_id: str, level: str = "info") -> None:
        self._counter += 1
        self.events.append({"id":f"EV-{self._counter:05}","title":title,"entity_id":entity_id,
                            "level":level,"time":clock(self.sim_time),"sim_time":round(self.sim_time,2)})
        self.events = self.events[-200:]

    def _alert(self, key: str, level: str, title: str, detail: str, entity_id: str) -> None:
        if any(a["id"] == key for a in self.alerts):
            return
        self.alerts.append({"id":key,"level":level,"title":title,"detail":detail,
            "entity_id":entity_id,"acknowledged":False,"active":True,"created_at":clock(self.sim_time)})
        self._event(title,entity_id,level)

    def set_scenario(self, kind: str) -> None:
        if kind not in SCENARIOS:
            raise ValueError("未知仿真场景")
        for alert in self.alerts:
            if alert["id"].startswith("SC-"):
                alert["active"] = False
        self.scenario = kind
        messages = {
            "fog": ("warning","海雾影响进出港","演示设定：能见度下降，靠泊时间延长，岸桥效率降至 72%。","B01"),
            "wind": ("critical","大风作业限制","演示设定：岸桥进入天气暂停；等待船舶重新计算作业窗口。","QC-01"),
            "road_block": ("warning","堆场主干道封闭","junction→yard 路段关闭；A* 路径改走外侧通道。","AGV-01"),
            "crane_fault": ("critical","岸桥 QC-02 故障","B01 两台岸桥中一台停机，装卸能力降低；恢复场景后解除。","QC-02"),
        }
        self._event(f"场景切换：{kind}", "scenario")
        if kind in messages:
            level,title,detail,entity = messages[kind]
            self._alert(f"SC-{kind}-{self._counter}",level,title,detail,entity)
        self._update_equipment(0)

    def acknowledge(self, alert_id: str) -> bool:
        for alert in self.alerts:
            if alert["id"] == alert_id:
                if not alert["acknowledged"]:
                    alert["acknowledged"] = True
                    self._event(f"已确认：{alert['title']}",alert["entity_id"])
                return True
        return False

    def _allocate(self) -> None:
        occupied = {v["berth_id"] for v in self.vessels if v["status"] in ("berthing","working")}
        queue = sorted([v for v in self.vessels if v["status"] == "waiting" and v["arrival"] <= self.sim_time],
                       key=lambda v:(-v["priority"],v["arrival"],v["id"]))
        for vessel in queue:
            if not vessel["announced"]:
                vessel["announced"] = True
                self._event(f"{vessel['name']} 到达锚地",vessel["id"])
            for berth_id,berth in BERTHS.items():
                if berth_id not in occupied and vessel["type"] in berth["types"] and vessel["draft"] <= berth["depth"]:
                    vessel.update(status="berthing",berth_id=berth_id,started_at=self.sim_time)
                    occupied.add(berth_id)
                    for alert in self.alerts:
                        if alert["id"] == f"WAIT-{vessel['id']}":
                            alert["active"] = False
                    self._event(f"{vessel['name']} 获配 {berth_id}，开始靠泊",vessel["id"])
                    break
            if vessel["status"] == "waiting" and self.sim_time-vessel["arrival"] >= 900:
                self._alert(f"WAIT-{vessel['id']}","warning",f"{vessel['name']} 等泊超过 15 分钟",
                            "泊位资源繁忙，可在调度实验室比较资源配置策略。",vessel["id"])

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
                utilization = (79 if self.scenario == "road_block" else 64) if status == "working" else 0
                power = (8 if self.scenario == "road_block" else 6) if status == "working" else 1
            elif kind == "shore_power":
                status = "working" if berths else "idle"
                utilization = 70 if status == "working" else 0
                power = 150 if status == "working" else 5
            else:
                status,utilization,power = "working",68,22
            device["status"] = status
            device["utilization"] = utilization
            amount = power*dt/3600
            device["energy_kwh"] += amount
            self.energy_kwh += amount

    def advance(self, seconds: float) -> None:
        if seconds < 0 or seconds > 86400:
            raise ValueError("仿真步长必须介于 0 和 86400 秒")
        remaining = seconds
        while remaining > 1e-8:
            dt = min(5.0,remaining)
            self._allocate()
            for vessel in self.vessels:
                if vessel["status"] == "berthing":
                    delay = 240 if self.scenario == "fog" else 120
                    if self.sim_time-vessel["started_at"] >= delay:
                        vessel["status"] = "working"
                        vessel["work_started_at"] = self.sim_time
                        self._event(f"{vessel['name']} 靠泊完成，开始作业",vessel["id"])
                if vessel["status"] == "working":
                    factor = 0 if self.scenario == "wind" and vessel["type"] != "tanker" else 0.72 if self.scenario == "fog" else 1.0
                    if self.scenario == "crane_fault" and vessel["berth_id"] == "B01":
                        factor *= 0.5
                    if self.scenario == "road_block" and vessel["type"] in ("container","reefer"):
                        factor *= 0.86
                    delta = min(dt*factor,vessel["duration"]-vessel["worked"])
                    vessel["worked"] += delta
                    vessel["progress"] = min(100,100*vessel["worked"]/vessel["duration"])
                    if vessel["type"] in ("container","reefer"):
                        self.throughput += vessel["cargo_teu"]*delta/vessel["duration"]
                    if vessel["progress"] >= 100-1e-8:
                        vessel.update(status="departed",completed_at=self.sim_time+dt)
                        self._event(f"{vessel['name']} 完成作业并离泊",vessel["id"])
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
                    "eta":clock(v["arrival"]),"progress":round(v["progress"],1)} for v in self.vessels]
        tasks = []
        for vessel in self.vessels:
            status = "completed" if vessel["status"] == "departed" else "running" if vessel["status"] == "working" else "pending"
            tasks.append({"id":f"TASK-{vessel['id']}","vessel_id":vessel["id"],
                "kind":"冷链优先运输" if vessel["type"] == "reefer" else "能源装卸" if vessel["type"] == "tanker" else "散粮装卸" if vessel["type"] == "bulk" else "集装箱装卸",
                "source":vessel["berth_id"] or "锚地","target":"冷链中心" if vessel["type"] == "reefer" else "铁路/堆场",
                "status":status,"progress":round(vessel["progress"],1),"priority":vessel["priority"]})
        waits = [v["started_at"]-v["arrival"] for v in self.vessels if v["started_at"] is not None]
        active = sum(v["status"] in ("berthing","working") for v in self.vessels)
        return {"sim_time":round(self.sim_time,2),"running":self.running,"speed":self.speed,
                "scenario":self.scenario,"seed":self.seed,"vessels":vessels,
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
        instance.running = False  # A server restart requires explicit operator resume.
        return instance


class Store:
    def __init__(self, path: str):
        self.path = path
        Path(path).parent.mkdir(parents=True,exist_ok=True)
        with sqlite3.connect(path) as db:
            db.execute("CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS experiment_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)")

    def load(self) -> Simulation:
        with sqlite3.connect(self.path) as db:
            row = db.execute("SELECT payload FROM snapshots WHERE id=1").fetchone()
        return Simulation.from_record(row[0]) if row else Simulation()

    def save(self, simulation: Simulation) -> None:
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO snapshots (id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",(simulation.to_record(),))

    def save_experiment(self, result: dict) -> None:
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO experiment_runs (payload) VALUES (?)",(json.dumps(result,ensure_ascii=False),))
