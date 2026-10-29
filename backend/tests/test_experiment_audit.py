"""Independent reconciliation of exported experiment evidence and metrics."""
import math

import pytest

from app.experiments import compare

COORDS = {'quay':(0,0),'junction':(.4,0),'yard':(.8,0),'cold':(.8,.5),
          'gate':(1.2,0),'rail':(1.2,.5),'bypass':(.4,.65),'bulk':(0,.65)}


@pytest.mark.parametrize('seed,scenario',[(42,'normal'),(99,'road_block'),(1,'fog')])
def test_exported_rows_independently_reconcile_all_comparison_metrics(seed,scenario):
    result = compare(seed,12,scenario)
    manifest = {job['id']:job for job in result['manifest']}
    for strategy in ('baseline','optimized'):
        rows = result[f'{strategy}_timeline']
        assert {r['vessel_id'] for r in rows} == set(manifest)
        calculated_energy,calculated_km,waits,durations,finishes = [],[],[],[],[]
        for row in rows:
            job = manifest[row['vessel_id']]
            assert row['cargo_teu'] == job['cargo'] and row['arrival'] == job['arrival']
            assert row['start_exact'] >= job['arrival']
            assert math.isclose(row['finish_exact']-row['start_exact'],row['duration_minutes'],abs_tol=1e-9)
            wait = row['start_exact']-job['arrival']
            assert math.isclose(wait,row['wait_minutes_exact'],abs_tol=1e-9)
            path = row['route_path']
            if scenario=='road_block':
                assert not any({a,b}=={'junction','yard'} for a,b in zip(path,path[1:]))
            one_way = sum(math.dist(COORDS[a],COORDS[b]) for a,b in zip(path,path[1:]))
            km = one_way*2*math.ceil(job['cargo']/2)
            energy = row['duration_minutes']*7.8+km*1.15+wait*2.8
            assert math.isclose(km,row['distance_km_exact'],abs_tol=1e-9)
            assert math.isclose(energy,row['energy_kwh_exact'],abs_tol=1e-8)
            calculated_energy.append(energy);calculated_km.append(km);waits.append(wait)
            durations.append(row['duration_minutes']);finishes.append(row['finish_exact'])
        metric = result[strategy]
        horizon = max(finishes)
        assert metric['avg_wait_minutes'] == round(sum(waits)/len(waits),2)
        assert metric['makespan_minutes'] == round(horizon,2)
        assert metric['distance_km'] == round(sum(calculated_km),2)
        assert metric['energy_kwh'] == round(sum(calculated_energy),2)
        assert metric['berth_utilization'] == round(100*sum(durations)/(3*horizon),2)
    for metric,change in [('avg_wait_minutes','wait_pct'),('makespan_minutes','makespan_pct'),
                          ('distance_km','distance_pct'),('energy_kwh','energy_pct')]:
        base,optimized = result['baseline'][metric],result['optimized'][metric]
        assert result['improvement'][change] == (round(100*(base-optimized)/base,2) if base else 0)
