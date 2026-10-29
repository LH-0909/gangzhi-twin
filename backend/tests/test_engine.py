from collections import defaultdict
import json

import pytest

from app.experiments import BERTHS, compare, manifest
from app.routing import BLOCKED_EDGE, EDGES, astar, distance
from app.simulation import Simulation, Store


def test_seeded_state_and_progress_are_reproducible():
    first,second = Simulation(42),Simulation(42)
    first.advance(1800)
    second.advance(1800)
    assert first.public_state() == second.public_state()
    state = first.public_state()
    assert state["kpis"]["throughput_teu"] > 0
    assert all(0 <= v["progress"] <= 100 for v in state["vessels"])
    assert all(t["progress"] == next(v["progress"] for v in state["vessels"] if v["id"] == t["vessel_id"]) for t in state["tasks"])


def test_berths_do_not_double_book_and_inventory_is_conserved():
    sim = Simulation()
    for _ in range(200):
        sim.advance(120)
        occupied = [v["berth_id"] for v in sim.vessels if v["status"] in ("working","berthing")]
        assert len(occupied) == len(set(occupied))
        assert 0 <= sim.throughput <= sum(v["cargo_teu"] for v in sim.vessels if v["type"] in ("container","reefer"))
    assert all(v["status"] == "departed" for v in sim.vessels)
    assert sim.public_state()["kpis"]["completed_tasks"] == len(sim.vessels)


def test_weather_and_fault_affect_actual_work():
    normal,wind,fault = Simulation(),Simulation(),Simulation()
    wind.set_scenario("wind")
    fault.set_scenario("crane_fault")
    for engine in (normal,wind,fault):
        engine.advance(600)
    vessel = lambda s: next(v for v in s.vessels if v["berth_id"] == "B01")
    assert vessel(wind)["progress"] < vessel(fault)["progress"] < vessel(normal)["progress"]
    assert next(e for e in fault.equipment if e["id"] == "QC-02")["status"] == "fault"
    alert = wind.alerts[-1]
    assert wind.acknowledge(alert["id"])
    assert wind.alerts[-1]["acknowledged"]
    assert not wind.acknowledge("missing")


def test_astar_respects_road_closure():
    normal = astar("quay","yard",False)
    closed = astar("quay","yard",True)
    assert closed["distance_km"] > normal["distance_km"]
    assert not any(frozenset(edge) == BLOCKED_EDGE for edge in zip(closed["path"],closed["path"][1:]))


@pytest.mark.parametrize("seed",[42,1,99])
@pytest.mark.parametrize("scenario",["normal","fog","wind","road_block","crane_fault"])
def test_comparison_fairness_reproducibility_and_berth_constraints(seed,scenario):
        result = compare(seed,12,scenario)
        assert result == compare(seed,12,scenario)
        assert result["manifest"] == [j.__dict__ for j in manifest(seed,12)]
        assert result["cargo_unit"] == "TEU"
        assert all(j["kind"] in ("container","reefer") for j in result["manifest"])
        assert sum(j["cargo"] for j in result["manifest"]) == result["total_cargo_teu"]
        baseline_jobs = sorted(r["vessel_id"] for r in result["baseline_timeline"])
        assert baseline_jobs == sorted(r["vessel_id"] for r in result["optimized_timeline"])
        assert result["baseline"]["completed_tasks"] == result["optimized"]["completed_tasks"] == 12
        for key in ("baseline_timeline","optimized_timeline"):
            by_berth = defaultdict(list)
            for row in result[key]:
                berth = next(b for b in BERTHS if b["id"] == row["berth_id"])
                assert row["draft"] <= berth["depth"]
                assert row["start"] >= row["arrival"]
                assert row["cargo_teu"] == next(j["cargo"] for j in result["manifest"] if j["id"] == row["vessel_id"])
                path = row["route_path"]
                assert path[0] == "quay" and path[-1] == row["route_target"]
                for a,b in zip(path,path[1:]):
                    assert (a,b) in EDGES or (b,a) in EDGES
                    if scenario == "road_block":
                        assert frozenset((a,b)) != BLOCKED_EDGE
                km = sum(distance(a,b) for a,b in zip(path,path[1:]))*2*row["trip_count"]
                assert abs(km-row["distance_km"]) < 0.0001
                by_berth[row["berth_id"]].append(row)
            for rows in by_berth.values():
                rows.sort(key=lambda r:r["start"])
                assert all(a["finish"] <= b["start"] for a,b in zip(rows,rows[1:]))
            metric_key = "baseline" if key == "baseline_timeline" else "optimized"
            assert abs(sum(r["distance_km"] for r in result[key])-result[metric_key]["distance_km"]) < 0.011
            assert abs(sum(r["energy_kwh"] for r in result[key])-result[metric_key]["energy_kwh"]) < 0.011
        expected = 100*(result["baseline"]["energy_kwh"]-result["optimized"]["energy_kwh"])/result["baseline"]["energy_kwh"]
        assert abs(result["improvement"]["energy_pct"]-expected) < 0.011


def test_sqlite_snapshot_roundtrip_and_restart_pauses(tmp_path):
    store = Store(str(tmp_path/"state.sqlite3"))
    engine = Simulation()
    engine.set_scenario("road_block")
    engine.advance(900)
    engine.running = True
    store.save(engine)
    restored = store.load()
    assert not restored.running
    engine.running = False
    assert restored.public_state() == engine.public_state()


@pytest.mark.parametrize("scenario",["normal","fog","wind","road_block","crane_fault"])
def test_mixed_cargo_energy_and_recovery_invariants(scenario):
    engine = Simulation()
    engine.set_scenario(scenario)
    engine.advance(1234)
    state = engine.public_state()
    assert abs(engine.energy_kwh-sum(e["energy_kwh"] for e in engine.equipment)) < 1e-8
    assert round(sum(e["energy_kwh"] for e in state["equipment"]),2) == state["kpis"]["energy_kwh"]
    assert round(state["kpis"]["energy_kwh"]*0.57,2) == state["kpis"]["carbon_kg"]
    for vessel in state["vessels"]:
        if vessel["type"] in ("bulk","tanker"):
            assert vessel["cargo_teu"] == 0
            assert vessel["cargo_amount"] == vessel["cargo_tonnes"] > 0
            assert vessel["cargo_unit"] == "t"
        else:
            assert vessel["cargo_tonnes"] == 0
            assert vessel["cargo_amount"] == vessel["cargo_teu"] > 0
            assert vessel["cargo_unit"] == "TEU"
        assert vessel["arrived"] == (vessel["eta_seconds"] <= engine.sim_time)
    engine.set_scenario("normal")
    assert all(e["status"] not in ("fault","weather_hold") for e in engine.equipment)
    assert all(a["active"] is False for a in engine.alerts if a["id"].startswith("SC-"))
    engine.advance(24000)
    final = engine.public_state()
    assert final["kpis"]["throughput_teu"] == sum(v["cargo_teu"] for v in final["vessels"])
    assert final["kpis"]["bulk_tonnes"] == sum(v["cargo_tonnes"] for v in final["vessels"] if v["type"] == "bulk")
    assert final["kpis"]["liquid_tonnes"] == sum(v["cargo_tonnes"] for v in final["vessels"] if v["type"] == "tanker")


def test_legacy_snapshot_cargo_migration():
    record = json.loads(Simulation().to_record())
    record.pop("schema_version")
    for vessel in record["vessels"]:
        if vessel["type"] in ("bulk","tanker"):
            vessel["cargo_teu"] = vessel["cargo_tonnes"]//10
        vessel.pop("cargo_tonnes")
    restored = Simulation.from_record(json.dumps(record))
    assert restored.schema_version == 5
    state = restored.public_state()
    assert all(v["cargo_teu"] == 0 for v in state["vessels"] if v["type"] in ("bulk","tanker"))
    assert next(v for v in state["vessels"] if v["type"] == "bulk")["cargo_tonnes"] > 0
    restored.advance(4000)
    assert restored.public_state()["kpis"]["bulk_tonnes"] > 0
