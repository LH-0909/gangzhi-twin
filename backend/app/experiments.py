"""Same seeded manifest, same constraints; FCFS/greedy versus workload-aware dispatch.

The numbers are outcomes of scheduling all jobs, not fixed improvement percentages.
All rates and distances are competition-demo assumptions, not Dalian production data.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
import random

from .routing import astar, distance


@dataclass(frozen=True)
class Job:
    id: str
    arrival: float
    cargo: int
    priority: int
    draft: float
    kind: str
    target: str


def manifest(seed: int, count: int) -> list[Job]:
    rng = random.Random(seed)
    jobs = []
    arrival = 0.0
    for i in range(count):
        arrival += rng.randint(3, 16)
        kind = rng.choice(["container", "container", "reefer", "container"])
        jobs.append(Job(f"EXP-{i+1:03}", arrival, rng.randint(80, 360),
                        3 if kind == "reefer" else rng.randint(1, 2),
                        round(rng.uniform(8.0, 14.0), 1), kind,
                        "cold" if kind == "reefer" else rng.choice(["yard", "rail", "gate"])))
    return jobs


BERTHS = [
    {"id": "B01", "depth": 15.5, "rate": 2.4},
    {"id": "B02", "depth": 14.5, "rate": 3.2},
    {"id": "B03", "depth": 13.0, "rate": 2.0},
]


def operating_duration(job: Job, berth: dict, scenario: str) -> float:
    factor = 0.72 if scenario == "fog" else 0.62 if scenario == "wind" else 1.0
    if scenario == "crane_fault" and berth["id"] == "B02":
        factor *= 0.48
    return 12.0 + job.cargo / (berth["rate"] * factor)


def fixed_route(target: str, blocked: bool) -> list[str]:
    """Baseline follows a fixed valid loop; a closure activates the outer bypass."""
    if blocked:
        paths = {"yard": ["quay","bulk","bypass","cold","yard"],
                 "cold": ["quay","bulk","bypass","cold"],
                 "rail": ["quay","bulk","bypass","cold","rail"],
                 "gate": ["quay","bulk","bypass","cold","rail","gate"]}
    else:
        paths = {"yard": ["quay","junction","yard"],
                 "cold": ["quay","junction","yard","gate","rail","cold"],
                 "rail": ["quay","junction","yard","gate","rail"],
                 "gate": ["quay","junction","yard","gate"]}
    return paths[target]


def route_path(job: Job, scenario: str, optimized: bool) -> list[str]:
    if optimized:
        return astar("quay", job.target, scenario == "road_block")["path"]
    return fixed_route(job.target,scenario == "road_block")


def route_distance(job: Job, scenario: str, optimized: bool) -> float:
    path = route_path(job,scenario,optimized)
    # Use unrounded edge lengths in both policies; A* output is rounded for display only.
    return sum(distance(a,b) for a,b in zip(path,path[1:]))


def schedule(jobs: list[Job], scenario: str, optimized: bool) -> tuple[dict,list[dict]]:
    available = {b["id"]: 0.0 for b in BERTHS}
    timeline = []
    total_distance = 0.0
    energy = 0.0
    unassigned = list(jobs)
    now = min(j.arrival for j in jobs)
    while unassigned:
        arrived = [j for j in unassigned if j.arrival <= now]
        free = [b for b in BERTHS if available[b["id"]] <= now]
        pairs = [(j,b) for j in arrived for b in free if b["depth"] >= j.draft]
        if not pairs:
            next_events = [j.arrival for j in unassigned if j.arrival > now]
            next_events += [value for value in available.values() if value > now]
            now = min(next_events)
            continue
        if optimized:
            job,berth = min(pairs,key=lambda pair:(operating_duration(pair[0],pair[1],scenario)/(pair[0].priority**0.25),pair[0].arrival,pair[0].id))
        else:
            job,berth = min(pairs,key=lambda pair:(pair[0].arrival,pair[0].id,pair[1]["id"]))
        start = now
        duration = operating_duration(job,berth,scenario)
        finish = start + duration
        available[berth["id"]] = finish
        unassigned.remove(job)
        trips = (job.cargo + 1)//2
        km = route_distance(job,scenario,optimized) * 2 * trips
        wait = start - job.arrival
        job_energy = duration * 7.8 + km * 1.15 + wait * 2.8
        total_distance += km
        energy += job_energy
        timeline.append({"vessel_id":job.id,"berth_id":berth["id"],"arrival":round(job.arrival,2),
                         "start":round(start,2),"finish":round(finish,2),"wait_minutes":round(wait,2),
                         "start_exact":start,"finish_exact":finish,"duration_minutes":duration,
                         "wait_minutes_exact":wait,"distance_km_exact":km,"energy_kwh_exact":job_energy,
                         "cargo_teu":job.cargo,"draft":job.draft,"route_target":job.target,
                         "route_path":route_path(job,scenario,optimized),"trip_count":trips,
                         "distance_km":round(km,4),"energy_kwh":round(job_energy,4)})
    makespan = max(available.values())
    work = sum(row["duration_minutes"] for row in timeline)
    metrics = {"avg_wait_minutes":round(sum(r["wait_minutes_exact"] for r in timeline)/len(jobs),2),
               "makespan_minutes":round(makespan,2),"distance_km":round(total_distance,2),
               "energy_kwh":round(energy,2),"completed_tasks":len(jobs),
               "berth_utilization":round(100*work/(makespan*len(BERTHS)),2)}
    return metrics,timeline


def compare(seed: int, count: int, scenario: str) -> dict:
    jobs = manifest(seed,count)
    baseline, bt = schedule(jobs,scenario,False)
    optimized, ot = schedule(jobs,scenario,True)
    def reduction(key):
        return round(100*(baseline[key]-optimized[key])/baseline[key],2) if baseline[key] else 0.0
    return {"seed":seed,"scenario":scenario,"vessel_count":count,
            "model":"container_dispatch_benchmark","cargo_unit":"TEU","total_cargo_teu":sum(j.cargo for j in jobs),
            "baseline":baseline,"optimized":optimized,
            "improvement":{"wait_pct":reduction("avg_wait_minutes"),"makespan_pct":reduction("makespan_minutes"),
                           "distance_pct":reduction("distance_km"),"energy_pct":reduction("energy_kwh")},
            "explanation":["本实验只模拟集装箱与冷藏箱作业，全部货量单位为 TEU；采用三个抽象箱运泊位，不代表实时综合港的四个专用泊位。",
                           "两种策略使用同一随机种子、船舶到达序列、货量、吃水和港区约束。",
                           "基线：先到先服务，选择最先空闲的兼容泊位，车辆使用固定通行环线。",
                           "优化：在已到达船舶与空闲兼容泊位间，选择考虑优先级的最短作业时间组合；车辆采用 A* 路径。",
                           "能耗=岸桥作业分钟×7.8 + 车辆公里×1.15 + 等泊分钟×2.8；系数为仿真设定。",
                           "正百分比表示下降；个别指标可能变差。结果仅解释本次仿真，不代表真实港口收益。"],
            "manifest":[asdict(j) for j in jobs],"baseline_timeline":bt,"optimized_timeline":ot}
