import math
import json
from pathlib import Path
import subprocess

import pytest

from app.navigation import approach_path, navigation, route_clear, travel_duration
from app.simulation import Simulation
from app.vessel_geometry import BREAKWATERS, DIMENSIONS, FENDER_CLEARANCE, FENDER_EDGE_Z, QUAY, SECTIONS, WATER_Y, hull_polygon, intersects


@pytest.mark.parametrize('scenario', ['normal','fog','wind','crane_fault','road_block'])
def test_sampled_full_voyages_keep_hull_out_of_quay_breakwaters_and_other_ships(scenario):
    sim = Simulation()
    sim.seek(0)
    if scenario != 'normal':
        sim._set_scenario_raw(scenario)
    seen = set()
    for seconds in range(0,42001,10):
        if seconds:
            sim._advance_raw(10)
        # Release prolonged wind so arrival, berthing and departure are all exercised.
        if scenario == 'wind' and seconds == 1800:
            sim._set_scenario_raw('normal')
        assert sum(v['status'] in ('berthing','sailing') for v in sim.vessels) <= 1
        vessels = [(v,navigation(v,sim.sim_time)) for v in sim.vessels]
        vessels = [(v,n) for v,n in vessels if n['visible']]
        for index,(v,nav) in enumerate(vessels):
            seen.add(nav['phase'])
            hull = hull_polygon(v['type'],nav['position'],nav['heading'])
            assert not intersects(hull,QUAY),(scenario,seconds,v['id'],nav)
            assert all(not intersects(hull,wall) for wall in BREAKWATERS),(scenario,seconds,v['id'],nav)
            if nav['phase'] in ('working','waiting_departure'):
                assert abs(nav['heading']) < 1e-10
                assert min(z for _,z in hull) >= FENDER_EDGE_Z+FENDER_CLEARANCE-1e-8
            for other,other_nav in vessels[index+1:]:
                assert not intersects(hull,hull_polygon(other['type'],other_nav['position'],other_nav['heading'])),(scenario,seconds,v['id'],other['id'])
    assert {'approaching','working','outbound'} <= seen
    assert all(v['status']=='departed' for v in sim.vessels)


def test_public_position_and_orientation_are_derived_from_the_same_clock():
    sim = Simulation()
    for _ in range(90):
        sim.advance(173.17)
        state = sim.public_state()
        for actual,raw in zip(state['vessels'],sim.vessels):
            pose = navigation(raw,sim.sim_time)
            assert actual['navigation']==pose
            if actual['status']=='departed':
                assert not pose['visible']
            if actual['status']=='sailing':
                assert pose['phase']=='outbound'
    head = sim.public_state()
    sim.seek(5000.25)
    mid = sim.public_state()
    assert mid['timeline']['replaying'] and not any(v['status']=='departed' and v['navigation']['visible'] for v in mid['vessels'])
    sim.seek(head['timeline']['head'])
    assert sim.public_state()==head


def test_route_guard_rejects_an_occupied_berth_and_accepts_clear_water():
    sim = Simulation()
    mover = next(v for v in sim.vessels if v['id']=='V002')
    duration = travel_duration(approach_path(mover,'B01'),4.0,600)
    candidate = {**mover,'status':'berthing','berth_id':'B01','started_at':sim.sim_time,'berthing_duration':duration}
    occupant = {**next(v for v in sim.vessels if v['id']=='V001'),
                'status':'working','berth_id':'B01','work_started_at':0}
    assert not route_clear(candidate,[candidate,occupant],sim.sim_time,duration)
    occupant['berth_id'] = 'B02'
    assert route_clear(candidate,[candidate,occupant],sim.sim_time,duration)


def test_server_positions_match_actual_typescript_geometry_and_motion(tmp_path):
    sim = Simulation()
    sim.seek(0)
    poses=[]
    for _ in range(140):
        sim._advance_raw(97.0)
        for vessel in sim.vessels:
            nav=navigation(vessel,sim.sim_time)
            if nav['visible']:
                poses.append({'nav':nav,'time':sim.sim_time})
    specs=[{'length':DIMENSIONS[v['type']][0],'beam':DIMENSIONS[v['type']][1],'draft':v['draft']} for v in sim.vessels]
    fixture=tmp_path/'poses.json'
    fixture.write_text(json.dumps({'sections':SECTIONS,'water_level':WATER_Y,'specs':specs,'poses':poses}),encoding='utf-8')
    script=Path(__file__).resolve().parents[2]/'scripts'/'verify-vessel-sync.mjs'
    result=subprocess.run(['node',str(script),str(fixture)],text=True,capture_output=True,timeout=30)
    assert result.returncode==0,result.stderr
    assert len(poses)>100
