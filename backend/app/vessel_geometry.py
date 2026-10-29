"""2D hull safety geometry shared by navigation and its regression checks.

Coordinates are illustrative metres, not surveyed berth or navigation data.
The narrow-phase polygon follows the maximum beam of the generated 3D hull.
"""
from __future__ import annotations

import math

DIMENSIONS = {"container":(278.0,42.0),"reefer":(278.0,42.0),"bulk":(220.0,34.0),"tanker":(235.0,38.0)}
BERTH_X = {"B01":-450.0,"B02":-150.0,"B03":150.0,"B04":450.0}
WATER_Y = -0.12
FENDER_EDGE_Z = 1.05
FENDER_CLEARANCE = 3.0
SECTIONS = [(-.5,.8),(-.47,.98),(-.35,1.0),(.2,1.0),(.33,.95),(.42,.69),(.48,.28),(.5,.015)]


def dimensions(kind: str) -> tuple[float,float]:
    return DIMENSIONS.get(kind,DIMENSIONS['container'])


def berth_center(kind: str, berth: str) -> tuple[float,float]:
    _,beam = dimensions(kind)
    return BERTH_X[berth],FENDER_EDGE_Z+FENDER_CLEARANCE+beam/2


def hull_polygon(kind: str, position: list[float], heading: float, margin: float = 0.0) -> list[tuple[float,float]]:
    length,beam = dimensions(kind)
    length,beam = length+2*margin,beam+2*margin
    x,_,z = position
    c,s = math.cos(heading),math.sin(heading)
    side = [(along*length,-width*beam/2) for along,width in SECTIONS]
    other = [(along*length,width*beam/2) for along,width in reversed(SECTIONS)]
    return [(x+px*c+pz*s,z-px*s+pz*c) for px,pz in side+other]


def oriented_rectangle(x: float, z: float, width: float, length: float, heading: float) -> list[tuple[float,float]]:
    c,s = math.cos(heading),math.sin(heading)
    return [(x+px*c+pz*s,z-px*s+pz*c)
            for px,pz in [(-width/2,-length/2),(width/2,-length/2),(width/2,length/2),(-width/2,length/2)]]


QUAY = [(-650.0,-650.0),(650.0,-650.0),(650.0,FENDER_EDGE_Z),(-650.0,FENDER_EDGE_Z)]
BREAKWATERS = [oriented_rectangle(side*760,120,30,600,side*.16) for side in (-1,1)]


def intersects(first: list[tuple[float,float]], second: list[tuple[float,float]]) -> bool:
    # AABB broad phase, then separating-axis narrow phase for convex outlines.
    if (max(p[0] for p in first) <= min(p[0] for p in second) or
        max(p[0] for p in second) <= min(p[0] for p in first) or
        max(p[1] for p in first) <= min(p[1] for p in second) or
        max(p[1] for p in second) <= min(p[1] for p in first)):
        return False
    for polygon in (first,second):
        for a,b in zip(polygon,polygon[1:]+polygon[:1]):
            nx,nz = -(b[1]-a[1]),b[0]-a[0]
            one = [x*nx+z*nz for x,z in first]
            two = [x*nx+z*nz for x,z in second]
            if max(one) <= min(two) or max(two) <= min(one):
                return False
    return True
