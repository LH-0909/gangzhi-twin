from fastapi.testclient import TestClient

from app.main import create_app
from app.simulation import Simulation


def test_closing_channel_allows_underway_ship_to_clear_but_blocks_new_reservations():
    sim = Simulation()
    at_closure = {v['id']:v['started_at'] for v in sim.vessels}
    moving = [v['id'] for v in sim.vessels if v['status']=='berthing']
    assert len(moving)==1
    sim.set_scenario('channel_closed')
    sim.advance(9000)
    assert not any(v['status'] in ('berthing','sailing') for v in sim.vessels)
    assert any(v['status']=='waiting_departure' for v in sim.vessels)
    assert all(v['started_at']==at_closure[v['id']] for v in sim.vessels)
    assert any(a['entity_id']=='ZONE-CHANNEL' and a['active'] for a in sim.alerts)
    sim.set_scenario('normal')
    sim.advance(1200)
    assert any(v['status'] in ('sailing','departed') for v in sim.vessels)
    assert not any(a['entity_id']=='ZONE-CHANNEL' and a['active'] for a in sim.alerts)


def test_bulk_work_clock_and_cargo_freeze_with_wind_then_resume():
    sim = Simulation()
    sim.advance(4000)
    bulk = next(v for v in sim.public_state()['vessels'] if v['type']=='bulk')
    assert bulk['status']=='working' and bulk['work_rate']==1
    before = bulk['work_seconds']
    before_tonnage=sim.public_state()['kpis']['bulk_tonnes']
    sim.set_scenario('wind')
    sim.advance(200)
    paused = next(v for v in sim.public_state()['vessels'] if v['type']=='bulk')
    assert paused['work_seconds']==before and paused['work_rate']==0
    assert sim.public_state()['kpis']['bulk_tonnes']==before_tonnage
    assert all(e['status']=='weather_hold' for e in sim.equipment if e['id'] in ('QC-05','QC-06'))
    sim.set_scenario('normal')
    sim.advance(200)
    resumed = next(v for v in sim.public_state()['vessels'] if v['type']=='bulk')
    assert resumed['work_seconds']>before and resumed['work_rate']==1
    assert sim.public_state()['kpis']['bulk_tonnes']>before_tonnage


def test_channel_scenario_is_not_silently_treated_as_normal_in_experiment(tmp_path):
    with TestClient(create_app(str(tmp_path/'channel.sqlite3'))) as client:
        assert client.post('/api/scenarios',json={'kind':'channel_closed'}).status_code==200
        result=client.post('/api/experiments/compare',json={'seed':42,'vessel_count':12,'scenario':'channel_closed'})
        assert result.status_code==422
