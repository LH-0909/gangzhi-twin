"""Illustrative metre-scale navigation, shared with the renderer through the API."""
from __future__ import annotations

import math

BERTH_X = {"B01":-450.0,"B02":-150.0,"B03":150.0,"B04":450.0}


def on_path(points: list[list[float]], fraction: float) -> dict:
    lengths = [math.dist(a,b) for a,b in zip(points,points[1:])]
    distance = sum(lengths)*max(0.0,min(1.0,fraction))
    for index,length in enumerate(lengths):
        if distance <= length or index == len(lengths)-1:
            a,b = points[index:index+2]
            t = min(1.0,distance/max(length,1e-9))
            return {"position":[a[0]+(b[0]-a[0])*t,0,a[1]+(b[1]-a[1])*t],
                    "heading":-math.atan2(b[1]-a[1],b[0]-a[0])}
        distance -= length
    return {"position":[points[0][0],0,points[0][1]],"heading":0.0}


def navigation(vessel: dict, now: float) -> dict:
    index = int(vessel["id"][1:])-1
    anchor = [[-500,650],[0,700],[500,750],[-650,1100],[-100,1150],[450,1200],[-500,1650],[300,1700]][index%8]
    x = BERTH_X.get(vessel["berth_id"],0.0)
    duration = vessel.get("berthing_duration",600.0)
    if now < vessel["arrival"]:
        phase,at,span = "inbound",vessel["arrival"]-600,600.0
        path = [[0,2400],[0,1950],anchor]
    elif vessel["status"] == "waiting":
        phase,at,span,path = "anchored",vessel["arrival"],0.0,[anchor,anchor]
    elif vessel["status"] == "berthing":
        phase,at,span = "approaching",vessel["started_at"],duration
        path = [anchor,[anchor[0],250],[x+100,180],[x,28]]
    elif vessel["status"] == "working":
        phase,at,span,path = "working",vessel["work_started_at"],0.0,[[x,28],[x,28]]
    else:
        at,span = vessel["completed_at"],900.0
        phase = "outbound" if now < at+span else "departed"
        path = [[x,28],[x+100,180],[0,1300],[0,2400]]
    progress = max(0.0,min(1.0,(now-at)/span)) if span else 1.0
    pose = on_path(path,progress)
    if phase in ("anchored","working"):
        pose["heading"] = 0.0
    return {"phase":phase,"started_at":at,"duration":span,"progress":progress,
            "path":[[p[0],0,p[1]] for p in path],"visible":now >= at and phase != "departed",**pose}
