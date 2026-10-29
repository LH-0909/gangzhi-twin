from fastapi.testclient import TestClient

from app.main import create_app


def test_rest_control_alerts_validation_and_persistence(tmp_path):
    path = str(tmp_path/"api.sqlite3")
    with TestClient(create_app(path)) as client:
        assert client.get("/api/health").json()["status"] == "ok"
        initial = client.get("/api/state").json()
        result = client.post("/api/simulation/control",json={"action":"step","seconds":60}).json()
        assert result["sim_time"] == initial["sim_time"]+60
        assert client.post("/api/simulation/control",json={"action":"play","speed":0}).status_code == 422
        assert client.post("/api/scenarios",json={"kind":"typhoon"}).status_code == 422
        state = client.post("/api/scenarios",json={"kind":"wind"}).json()
        alert = state["alerts"][-1]
        state = client.post(f"/api/alerts/{alert['id']}/ack").json()
        assert state["alerts"][-1]["acknowledged"]
        assert client.post("/api/alerts/missing/ack").status_code == 404
        assert client.post("/api/experiments/compare",json={"seed":42,"vessel_count":12,"scenario":"fog"}).status_code == 200
        assert client.post("/api/experiments/compare",json={"seed":42,"vessel_count":999}).status_code == 422
        assert client.post("/api/experiments/compare",json={"seed":42.1}).status_code == 422
        assert client.get("/api/routes?blocked=true").json()["blocked"]
    with TestClient(create_app(path)) as client:
        restored = client.get("/api/state").json()
        assert restored["sim_time"] == result["sim_time"]
        assert restored["alerts"][-1]["acknowledged"]
        reset = client.post("/api/simulation/control",json={"action":"reset"}).json()
        assert reset == initial


def test_reset_archives_previous_round_and_restores_it_without_losing_current(tmp_path):
    with TestClient(create_app(str(tmp_path/'archives.sqlite3'))) as client:
        previous = client.post('/api/simulation/control',json={'action':'step','seconds':60}).json()
        reset = client.post('/api/simulation/control',json={'action':'reset'}).json()
        archives = client.get('/api/simulation/archives').json()
        assert len(archives) == 1 and archives[0]['model_version'] == 5
        saved = client.get(f"/api/simulation/archives/{archives[0]['id']}").json()
        assert saved['sim_time'] == previous['sim_time']
        restored = client.post(f"/api/simulation/archives/{archives[0]['id']}/restore").json()
        assert restored['sim_time'] == previous['sim_time'] and not restored['running']
        assert len(client.get('/api/simulation/archives').json()) == 2
        assert client.post('/api/simulation/archives/999/restore').status_code == 404
        assert reset['sim_time'] < restored['sim_time']
