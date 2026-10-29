import copy
import json
import sqlite3

import pytest

from fastapi.testclient import TestClient

from app.main import create_app
from app.simulation import Simulation, Store


def test_temperature_exposure_alarm_and_recovery_are_accumulated():
    sim = Simulation()
    baseline_energy = next(e['energy_kwh'] for e in sim.equipment if e['id']=='RF-01')
    sim.set_cold_fault(True)
    sim.advance(400)
    cold = sim.public_state()['cold_chain']
    reefer = next(e for e in sim.equipment if e['id']=='RF-01')
    assert abs(cold['temperature_c']+12) < .01
    assert abs(cold['exposure_seconds']-200) < .05
    assert reefer['status'] == 'fault'
    assert abs(reefer['energy_kwh']-baseline_energy-400/3600) < 1e-8
    assert any(a['id'].startswith('TEMP-RF-') and a['active'] for a in sim.alerts)
    sim.set_cold_fault(False)
    sim.advance(300)
    cold = sim.public_state()['cold_chain']
    assert cold['temperature_c'] == -15.6
    assert abs(cold['exposure_seconds']-450) < .1
    assert not cold['above_limit'] and cold['peak_c'] == -12
    assert all(not a['active'] for a in sim.alerts if a['id'].startswith(('CF-RF-','TEMP-RF-')))
    assert next(e for e in sim.equipment if e['id']=='RF-01')['status'] == 'working'


def test_fault_coexists_with_wind_and_replay_restores_history(tmp_path):
    sim = Simulation()
    sim.set_scenario('wind')
    sim.set_cold_fault(True)
    sim.advance(257.314)
    unsafe = copy.deepcopy(sim.public_state())
    temp_alert = next(a for a in sim.alerts if a['id'].startswith('TEMP-RF-'))
    assert sim.acknowledge(temp_alert['id'])
    sim.set_cold_fault(False)
    assert sim.scenario == 'wind'
    sim.advance(400.77)
    final = copy.deepcopy(sim.public_state())
    store = Store(str(tmp_path/'cold.sqlite3'))
    store.save(sim)
    restored = store.load()
    restored.seek(unsafe['sim_time'])
    assert restored.cold['fault_active']
    assert restored.public_state()['cold_chain']['temperature_c'] == unsafe['cold_chain']['temperature_c']
    assert not next(a for a in restored.alerts if a['id']==temp_alert['id'])['acknowledged']
    restored.seek(final['timeline']['head'])
    assert restored.public_state() == final


def test_v3_snapshot_migration_archives_the_recorded_journey(tmp_path):
    original = Simulation()
    original.start_flow()
    original.set_scenario('road_block')
    original.advance(900.23)
    expected = original.public_state()
    legacy = json.loads(original.to_record())
    legacy['schema_version'] = 3
    legacy.pop('cold')
    legacy['_origin']['schema_version'] = 3
    legacy['_origin'].pop('cold')
    store = Store(str(tmp_path/'migration.sqlite3'))
    with sqlite3.connect(store.path) as db:
        db.execute('INSERT INTO snapshots (id,payload) VALUES (1,?)',(json.dumps(legacy),))
    restored = store.load()
    assert restored.schema_version == 5
    actual = restored.public_state()
    for key in ('sim_time','scenario','flows','equipment'):
        assert actual[key] == expected[key]
    for old,new in zip(expected['vessels'],actual['vessels']):
        assert old['id'] == new['id'] and old['progress'] == new['progress']
        if old['status'] == 'berthing':
            assert new['status'] == 'waiting' and new['berth_id'] is None
        else:
            assert old['status'] == new['status']
    for key in ('throughput_teu','energy_kwh','bulk_tonnes','liquid_tonnes'):
        assert actual['kpis'][key] == expected['kpis'][key]
    assert actual['cold_chain']['temperature_c'] == -18
    assert actual['timeline']['minimum'] == expected['sim_time']
    with pytest.raises(ValueError):
        restored.seek(1300)
    archived = store.list_archives()
    assert len(archived) == 1 and archived[0]['model_version'] == 3
    assert store.archived_record(archived[0]['id']) == legacy


def test_fault_api_is_strict_and_idempotent(tmp_path):
    with TestClient(create_app(str(tmp_path/'cold-api.sqlite3'))) as client:
        assert client.post('/api/cold-chain/fault',json={'active':1}).status_code == 422
        started = client.post('/api/cold-chain/fault',json={'active':True}).json()
        again = client.post('/api/cold-chain/fault',json={'active':True}).json()
        assert started == again
        assert started['cold_chain']['fault_active']
        assert next(e for e in started['equipment'] if e['id']=='RF-01')['status']=='fault'
