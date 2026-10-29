"""A* routing on a small metric road graph; coordinates are illustrative kilometres."""
from __future__ import annotations

import heapq
import math

NODES = {
    "quay": (0.0, 0.0), "junction": (0.4, 0.0), "yard": (0.8, 0.0),
    "cold": (0.8, 0.5), "gate": (1.2, 0.0), "rail": (1.2, 0.5),
    "bypass": (0.4, 0.65), "bulk": (0.0, 0.65),
}
EDGES = [
    ("quay", "junction"), ("junction", "yard"), ("yard", "gate"),
    ("yard", "cold"), ("cold", "rail"), ("gate", "rail"),
    ("junction", "bypass"), ("bypass", "cold"), ("quay", "bulk"),
    ("bulk", "bypass"),
]
BLOCKED_EDGE = frozenset(("junction", "yard"))


def distance(a: str, b: str) -> float:
    return math.dist(NODES[a], NODES[b])


def astar(start: str, goal: str, blocked: bool = False) -> dict:
    if start not in NODES or goal not in NODES:
        raise ValueError("未知道路节点")
    frontier = [(distance(start, goal), 0.0, start)]
    best = {start: 0.0}
    previous: dict[str, str] = {}
    while frontier:
        _, cost, current = heapq.heappop(frontier)
        if cost > best.get(current, math.inf):
            continue
        if current == goal:
            path = [goal]
            while path[-1] != start:
                path.append(previous[path[-1]])
            return {"path": path[::-1], "distance_km": round(cost, 4)}
        for a, b in EDGES:
            if blocked and frozenset((a, b)) == BLOCKED_EDGE:
                continue
            neighbor = b if current == a else a if current == b else None
            if neighbor is None:
                continue
            new_cost = cost + distance(current, neighbor)
            if new_cost < best.get(neighbor, math.inf):
                previous[neighbor] = current
                best[neighbor] = new_cost
                heapq.heappush(frontier, (new_cost + distance(neighbor, goal), new_cost, neighbor))
    raise ValueError("道路不连通")


def route_response(blocked: bool = False) -> dict:
    return {
        "coordinate_unit": "illustrative_km", "blocked": blocked,
        "nodes": [{"id": key, "x": xy[0], "y": xy[1]} for key, xy in NODES.items()],
        "edges": [{"source": a, "target": b, "distance_km": round(distance(a,b),4),
                   "closed": blocked and frozenset((a,b)) == BLOCKED_EDGE} for a,b in EDGES],
        "routes": {target: astar("quay", target, blocked) for target in ("yard", "cold", "gate", "rail")},
    }
