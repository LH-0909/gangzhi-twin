import copy
import math

import pytest
from fastapi.testclient import TestClient

from app.cargo_flow import NODES, PHASES, route
from app.main import create_app
from app.simulation import Simulation, Store


def test_vessel_moves_through_approach_and_retains_outbound_visibility():
    sim = Simulation()
    sim.seek(30)
    vessel = next(v for v in sim.public_state()['vessels'] if v['berth_id'] == 'B01')
    assert vessel['navigation']['phase'] == 'approaching'
    first = vessel['navigation']['position']
    sim.seek(300)
    middle = next(v for v in sim.public_state()['vessels'] if v['id'] == vessel['id'])
    assert math.dist(first,middle['navigation']['position']) > 50
    sim.seek(1200)
    sim.advance(8000)
    internal = next(v for v in sim.vessels if v['id'] == vessel['id'])
    sim.seek(internal['completed_at']+100)
    leaving = next(v for v in sim.public_state()['vessels'] if v['id'] == vessel['id'])
    assert leaving['status'] == 'departed'
    assert leaving['navigation']['phase'] == 'outbound' and leaving['navigation']['visible']


def test_one_box_chain_occupancy_fault_recovery_and_replay(tmp_path):
    sim = Simulation()
    flow = sim.start_flow()
    assert sim.start_flow() is flow
    sim.advance(40)
    sim.set_scenario('crane_fault')
    previous = copy.deepcopy(flow)
    sim.advance(120)
    assert flow['phase'] == 'quay_lift' and flow['elapsed'] == previous['elapsed']
    assert flow['hold_reason']
    paused_at = sim.sim_time
    sim.set_scenario('normal')
    sim.advance(1200)
    assert flow['phase'] == 'completed'
    assert [h['phase'] for h in flow['history']] == PHASES
    assert len(sim.flows) == 1
    assert flow['distance_m'] > 1000
    final = sim.public_state()
    store = Store(str(tmp_path/'cargo.sqlite3'))
    store.save(sim)
    restored = store.load()
    restored.seek(paused_at-1)
    assert restored.flows[0]['phase'] == 'quay_lift'
    assert restored.flows[0]['hold_reason']
    restored.seek(final['timeline']['head'])
    assert restored.public_state() == final


def test_road_replan_keeps_pose_and_uses_open_edges():
    sim = Simulation()
    sim.start_flow()
    sim.advance(240)
    flow = sim.flows[0]
    assert flow['phase'] == 'drive_yard'
    before = list(flow['position'])
    sim.set_scenario('road_block')
    assert flow['position'] == before
    assert 'bypass_w' in flow['route_nodes']
    assert not any({a,b} == {'west','east'} for a,b in zip(flow['route_nodes'],flow['route_nodes'][1:]))
    sim.advance(1200)
    assert flow['phase'] == 'completed'
    normal = Simulation()
    normal.start_flow()
    normal.advance(1440)
    assert flow['distance_m'] > normal.flows[0]['distance_m']
    blocked_route = route('quay','yard',True)
    assert sum(math.dist(NODES[a],NODES[b]) for a,b in zip(blocked_route,blocked_route[1:])) > 800


def test_cargo_api_requires_an_available_berth(tmp_path):
    with TestClient(create_app(str(tmp_path/'api.sqlite3'))) as client:
        state = client.post('/api/cargo/start').json()
        assert state['flows'][0]['scope'] == 'single_box_demonstration'
        assert client.post('/api/cargo/start').json()['flows'] == state['flows']
        client.post('/api/simulation/control',json={'action':'reset'})
        for _ in range(8):
            client.post('/api/simulation/control',json={'action':'step','seconds':3600})
        assert client.post('/api/cargo/start').status_code == 409


def test_closure_does_not_send_vehicle_back_across_barrier_it_already_passed():
    sim = Simulation()
    sim.start_flow()
    sim.advance(285)
    flow = sim.flows[0]
    assert flow['phase'] == 'drive_yard' and flow['position'][0] > 0
    position = list(flow['position'])
    sim.set_scenario('road_block')
    assert flow['position'] == position
    assert flow['route_nodes'][1] == 'east'
    assert 'west' not in flow['route_nodes']
    assert all(point[0] > 0 for point in flow['route'])


def test_event_marker_restores_its_recorded_cargo_phase():
    sim = Simulation()
    sim.advance(3.417)
    sim.start_flow()
    sim.advance(1300.237)
    final = sim.public_state()
    events = [e for e in sim.events if e['entity_id'] == sim.flows[0]['box_id']]
    for event in events:
        sim.seek(event['sim_time'])
        phase = sim.flows[0]['phase']
        if '创建' not in event['title']:
            assert sim.public_state()['flows'][0]['phase_name'] in event['title']
    sim.seek(final['timeline']['head'])
    assert sim.public_state() == final
