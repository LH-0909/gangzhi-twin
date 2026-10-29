"""Illustrative navigable paths, in metres, for the shared simulation clock."""
from __future__ import annotations

import math

from .vessel_geometry import BREAKWATERS, QUAY, berth_center, dimensions, hull_polygon, intersects


def anchorage(vessel: dict) -> list[float]:
    # Dedicated offshore holding positions keep parked vessels separated.
    index = int(vessel["id"][1:])-1
    return [1000.0+index*350.0,1200.0]


def approach_path(vessel: dict, berth: str) -> list[list[float]]:
    anchor = anchorage(vessel)
    x,z = berth_center(vessel["type"],berth)
    return [anchor,[anchor[0],600.0],[x,600.0],[x,z]]


def departure_path(vessel: dict) -> list[list[float]]:
    anchor = anchorage(vessel)
    x,z = berth_center(vessel["type"],vessel["berth_id"])
    return [[x,z],[x,600.0],[anchor[0],600.0],[anchor[0],2000.0]]


def travel_duration(points: list[list[float]], speed: float, minimum: float) -> float:
    return max(minimum,math.ceil(sum(math.dist(a,b) for a,b in zip(points,points[1:]))/speed))


def on_path(points: list[list[float]], fraction: float) -> dict:
    lengths = [math.dist(a,b) for a,b in zip(points,points[1:])]
    distance = sum(lengths)*max(0.0,min(1.0,fraction))
    for index,length in enumerate(lengths):
        if distance <= length or index == len(lengths)-1:
            a,b = points[index:index+2]
            t = min(1.0,distance/max(length,1e-9))
            heading = -math.atan2(b[1]-a[1],b[0]-a[0])
            # Ease the heading on either side of a bend; use the shortest arc.
            blend = min(100.0,length/2)
            if index > 0:
                blend_in = min(blend,lengths[index-1]/2)
                if blend_in and distance < blend_in:
                    before = -math.atan2(a[1]-points[index-1][1],a[0]-points[index-1][0])
                    delta = math.atan2(math.sin(heading-before),math.cos(heading-before))
                    u = .5+.5*distance/blend_in
                    heading = before+delta*(u*u*(3-2*u))
            if index < len(lengths)-1:
                blend_out = min(blend,lengths[index+1]/2)
                if blend_out and length-distance < blend_out:
                    after = -math.atan2(points[index+2][1]-b[1],points[index+2][0]-b[0])
                    delta = math.atan2(math.sin(after-heading),math.cos(after-heading))
                    u = .5*(1-(length-distance)/blend_out)
                    heading += delta*(u*u*(3-2*u))
            return {"position":[a[0]+(b[0]-a[0])*t,0,a[1]+(b[1]-a[1])*t],"heading":heading}
        distance -= length
    return {"position":[points[0][0],0,points[0][1]],"heading":0.0}


def safe_heading(heading: float, z: float, length: float) -> float:
    """Finish turning offshore; align parallel before the hull nears the quay."""
    t = max(0.0,min(1.0,(z-(length/2+10.0))/70.0))
    return math.atan2(math.sin(heading),math.cos(heading))*(t*t*(3-2*t))


def navigation(vessel: dict, now: float) -> dict:
    anchor = anchorage(vessel)
    length,beam = dimensions(vessel["type"])
    duration = vessel.get("berthing_duration",600.0)
    if now < vessel["arrival"]:
        phase,at,span = "inbound",vessel["arrival"]-600,600.0
        path = [[anchor[0],2000.0],anchor]
    elif vessel["status"] == "waiting":
        phase,at,span,path = "anchored",vessel["arrival"],0.0,[anchor,anchor]
    elif vessel["status"] == "berthing":
        phase,at,span = "approaching",vessel["started_at"],duration
        path = approach_path(vessel,vessel["berth_id"])
    elif vessel["status"] in ("working","waiting_departure"):
        phase = "working" if vessel["status"] == "working" else "waiting_departure"
        at,span = vessel["work_started_at"],0.0
        x,z = berth_center(vessel["type"],vessel["berth_id"])
        path = [[x,z],[x,z]]
    elif vessel["status"] == "sailing":
        at,span = vessel["departed_at"],vessel["departure_duration"]
        phase,path = "outbound",departure_path(vessel)
    else:
        phase,at,span,path = "departed",vessel.get("completed_at") or now,0.0,[anchor,anchor]
    progress = max(0.0,min(1.0,(now-at)/span)) if span else 1.0
    pose = on_path(path,progress)
    if phase in ("anchored","working","waiting_departure"):
        pose["heading"] = 0.0
    elif phase in ("approaching","outbound"):
        pose["heading"] = safe_heading(pose["heading"],pose["position"][2],length)
    return {"phase":phase,"started_at":at,"duration":span,"progress":progress,
            "length_m":length,"beam_m":beam,"path":[[p[0],0,p[1]] for p in path],
            "visible":now >= at and phase != "departed",**pose}


def route_clear(candidate: dict, vessels: list[dict], start: float, duration: float) -> bool:
    """Check a proposed movement at 5-second intervals with a 1 m hull buffer.

    The channel is reserved to this ship; other ships remain at their berth or
    anchorage, apart from their preplanned approaches to an offshore anchor.
    This is conservative discrete checking, not certified swept-volume physics.
    """
    offsets = list(range(0,math.ceil(duration),5)) + [duration]
    for offset in offsets:
        now = start+offset
        pose = navigation(candidate,now)
        hull = hull_polygon(candidate['type'],pose['position'],pose['heading'],margin=1.0)
        if intersects(hull,QUAY) or any(intersects(hull,wall) for wall in BREAKWATERS):
            return False
        for other in vessels:
            if other['id'] == candidate['id']:
                continue
            other_pose = navigation(other,now)
            if other_pose['visible'] and intersects(hull,hull_polygon(other['type'],other_pose['position'],other_pose['heading'],margin=1.0)):
                return False
    return True
