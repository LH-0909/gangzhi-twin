"""One traceable 40HC demonstration shipment, separate from aggregate cargo estimates."""
from __future__ import annotations

import copy
import heapq
import math

QUAY_Y = 4.2
NODES = {
    "quay":(-397.0,-35.0),"front":(-397.0,-72.0),"west":(-200.0,-72.0),
    "east":(147.5,-72.0),"bypass_w":(-200.0,-112.0),"bypass_e":(147.5,-112.0),
    "yard_turn":(147.5,-260.0),"yard":(85.6,-260.0),"gate":(640.0,-72.0),
}
EDGES = [("quay","front"),("front","west"),("west","east"),("west","bypass_w"),
         ("bypass_w","bypass_e"),("bypass_e","east"),("bypass_e","yard_turn"),
         ("yard_turn","yard"),("east","gate")]
PHASES = ["queued","quay_lift","drive_yard","yard_lift","stored","yard_pickup","drive_gate","gate_check","completed"]
PHASE_NAMES = {"queued":"等待岸桥", "quay_lift":"岸桥卸船", "drive_yard":"运往堆场", "yard_lift":"堆场落箱",
               "stored":"堆场暂存", "yard_pickup":"提箱装车", "drive_gate":"运往闸口", "gate_check":"闸口核验", "completed":"已出场"}
DURATIONS = {"quay_lift":160.0,"yard_lift":120.0,"stored":180.0,"yard_pickup":120.0,"gate_check":30.0}


def box_number(serial: int) -> str:
    stem = f"GZTU{serial:06}"
    values = '0123456789A?BCDEFGHIJK?LMNOPQRSTU?VWXYZ'
    return stem+str(sum(values.index(c)*2**i for i,c in enumerate(stem))%11%10)


def route(start: str, goal: str, blocked: bool) -> list[str]:
    queue,best,previous = [(math.dist(NODES[start],NODES[goal]),0.0,0,start)],{start:(0.0,0)},{}
    while queue:
        _,cost,detours,node = heapq.heappop(queue)
        if cost > best[node][0]+1e-8 or abs(cost-best[node][0]) <= 1e-8 and detours > best[node][1]:
            continue
        if node == goal:
            result = [goal]
            while result[-1] != start:
                result.append(previous[result[-1]])
            return result[::-1]
        for a,b in EDGES:
            if blocked and {a,b} == {"west","east"}:
                continue
            neighbor = b if node == a else a if node == b else None
            if neighbor is None:
                continue
            candidate = cost+math.dist(NODES[node],NODES[neighbor])
            rank = detours+int(neighbor == "bypass_w")
            old = best.get(neighbor,(math.inf,math.inf))
            # Equal-length alternatives prefer the main apron road; do not
            # invent extra kilometres just to make a closure look expensive.
            if candidate < old[0]-1e-8 or abs(candidate-old[0]) <= 1e-8 and rank < old[1]:
                best[neighbor],previous[neighbor] = (candidate,rank),node
                heapq.heappush(queue,(candidate+math.dist(NODES[neighbor],NODES[goal]),candidate,rank,neighbor))
    raise ValueError("没有可用的箱运路径")


def new_flow(vessel_id: str, now: float) -> dict:
    return {"id":"FLOW-001","box_id":box_number(900001),"vessel_id":vessel_id,"crane_id":"QC-02","vehicle_id":"AGV-01",
            "box_type":"40HC","weight_kg":23200,"cargo":"PP 树脂（演示）","phase":"queued","elapsed":0.0,
            "created_at":now,"position":[-397.0,QUAY_Y,-35.0],"heading":0.0,"distance_m":0.0,
            "target":{"block":"C4","bay":16,"row":6,"tier":5,"position":[85.6,17.528,-276.0]},
            "route_nodes":[],"route":[],"route_index":0,"route_goal":None,
            "history":[{"phase":"queued","at":now}],"hold_reason":None,"rate":0.0}


def plan(flow: dict, start: str, goal: str, blocked: bool, current: list[float] | None = None) -> None:
    nodes = route(start,goal,blocked)
    points = [[NODES[n][0],QUAY_Y,NODES[n][1]] for n in nodes]
    if current is not None and math.dist(current,points[0]) > 1e-6:
        points.insert(0,list(current))
        nodes.insert(0,"current")
    flow.update(route_nodes=nodes,route=points,route_index=1,route_goal=goal)


def replan(flow: dict, blocked: bool) -> None:
    if flow["phase"] not in ("drive_yard","drive_gate"):
        return
    index = min(flow["route_index"],len(flow["route_nodes"])-1)
    previous,next_node = flow["route_nodes"][max(0,index-1)],flow["route_nodes"][index]
    # Continue to the next safe junction. When closure is on the occupied edge,
    # leave from this side of the new barrier rather than crossing it to retreat.
    if blocked and {previous,next_node} == {"west","east"}:
        start = "west" if flow["position"][0] <= 0 else "east"
    else:
        start = next_node
    plan(flow,start,flow["route_goal"],blocked,flow["position"])


def _drive(flow: dict, seconds: float, speed: float) -> bool:
    budget = seconds*speed
    while budget > 1e-8 and flow["route_index"] < len(flow["route"]):
        target = flow["route"][flow["route_index"]]
        pos = flow["position"]
        distance = math.dist(pos,target)
        delta = min(distance,budget)
        if distance > 1e-8:
            flow["position"] = [a+(b-a)*delta/distance for a,b in zip(pos,target)]
            flow["heading"] = -math.atan2(target[2]-pos[2],target[0]-pos[0])
        flow["distance_m"] += delta
        budget -= delta
        if distance <= delta+1e-8:
            flow["route_index"] += 1
    return flow["route_index"] >= len(flow["route"])


def refresh(flow: dict, vessels: list[dict], scenario: str) -> None:
    phase = flow["phase"]
    vessel = next(v for v in vessels if v["id"] == flow["vessel_id"])
    holding = None
    if phase == "queued" and vessel["status"] != "working":
        holding = "等待关联船舶靠泊并开始作业"
    elif phase == "quay_lift" and scenario == "crane_fault":
        holding = "QC-02 故障，吊装暂停"
    elif phase in ("quay_lift","yard_lift","yard_pickup") and scenario == "wind":
        holding = "大风情境，吊装暂停"
    rate = 0.0 if holding else .72 if scenario == "fog" and phase in ("quay_lift","yard_lift","yard_pickup") else 1.0
    flow.update(hold_reason=holding,rate=rate)


def update(flow: dict, vessels: list[dict], scenario: str, now: float, dt: float, event) -> None:
    refresh(flow,vessels,scenario)
    phase,holding,rate = flow["phase"],flow["hold_reason"],flow["rate"]
    if holding or phase == "completed":
        return
    flow["elapsed"] += dt*rate
    finished = phase == "queued"
    if phase in ("drive_yard","drive_gate"):
        finished = _drive(flow,dt,2.5 if scenario == "fog" else 4.5)
    elif phase in DURATIONS:
        finished = flow["elapsed"] >= DURATIONS[phase]
    if not finished:
        return
    new_phase = PHASES[PHASES.index(phase)+1]
    flow.update(phase=new_phase,elapsed=0.0)
    flow["history"].append({"phase":new_phase,"at":now+dt})
    if new_phase in ("drive_yard","drive_gate"):
        plan(flow,"quay" if new_phase == "drive_yard" else "yard","yard" if new_phase == "drive_yard" else "gate",scenario == "road_block")
    refresh(flow,vessels,scenario)
    event(f"{flow['box_id']} · {PHASE_NAMES[new_phase]}",flow["box_id"],at=now+dt)


def public(flow: dict, scenario: str) -> dict:
    result = copy.deepcopy(flow)
    result["phase_name"] = PHASE_NAMES[flow["phase"]]
    result["phase_duration"] = DURATIONS.get(flow["phase"],0.0)
    result["drive_speed"] = 2.5 if scenario == "fog" else 4.5
    result["scope"] = "single_box_demonstration"
    return result
