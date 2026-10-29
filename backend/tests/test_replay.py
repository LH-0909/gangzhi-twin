import copy

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.simulation import Simulation, Store


def business(state):
    return {k:v for k,v in state.items() if k not in ('timeline','running','speed')}


def test_replay_restores_fractional_steps_scenarios_and_acknowledgements(tmp_path):
    sim = Simulation()
    sim.advance(17.314)
    before = business(sim.public_state())
    before_at = sim.sim_time
    sim.set_scenario('wind')
    alert = sim.alerts[-1]['id']
    sim.advance(33.177)
    sim.acknowledge(alert)
    during = business(sim.public_state())
    during_at = sim.sim_time
    sim.advance(1)
    sim.set_scenario('normal')
    sim.advance(600.123)
    head = copy.deepcopy(sim.public_state())
    store = Store(str(tmp_path/'replay.sqlite3'))
    store.save(sim)
    sim = store.load()
    # At the scenario timestamp, actions at that timestamp have happened.
    sim.seek(before_at-0.001)
    assert sim.scenario == 'normal'
    assert all(e['sim_time'] <= sim.sim_time+0.01 for e in sim.events)
    assert sim.throughput <= before['kpis']['throughput_teu']+1
    sim.seek(during_at)
    assert business(sim.public_state())['alerts'] == during['alerts']
    assert sim.scenario == 'wind'
    assert sim.public_state()['timeline']['replaying']
    sim.advance(head['timeline']['head']-sim.sim_time)
    assert sim.public_state() == head


def test_replay_mid_interval_roundtrip_and_new_scenario_branches():
    sim = Simulation()
    sim.advance(37.817)
    sim.set_scenario('fog')
    sim.advance(402.561)
    head = sim.public_state()
    sim.seek(1234.567)
    first = business(sim.public_state())
    sim.seek(head['timeline']['head'])
    assert sim.public_state() == head
    sim.seek(1234.567)
    assert business(sim.public_state()) == first
    sim.set_scenario('road_block')
    assert sim.public_state()['timeline']['head'] == sim.sim_time
    sim.advance(600)
    assert sim.scenario == 'road_block'
    assert not any(e['title'] == '场景切换：fog' for e in sim.events)
    with pytest.raises(ValueError):
        sim.seek(sim.sim_time+1)


def test_seek_api_rejects_future_and_live_recovers_recorded_state(tmp_path):
    with TestClient(create_app(str(tmp_path/'api.sqlite3'))) as client:
        head = client.post('/api/simulation/control',json={'action':'step','seconds':600}).json()
        assert client.post('/api/simulation/seek',json={'seconds':head['sim_time']+1}).status_code == 422
        assert client.post('/api/simulation/seek',json={'seconds':-1}).status_code == 422
        past = client.post('/api/simulation/seek',json={'seconds':600}).json()
        assert past['sim_time'] == 600 and not past['running']
        assert past['timeline']['head'] == head['timeline']['head']
        latest = client.post('/api/simulation/live').json()
        assert latest['running'] and not latest['timeline']['replaying']
        assert business(latest) == business(head)
