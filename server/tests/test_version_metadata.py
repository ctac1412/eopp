def test_version_endpoint_returns_build_metadata(client, monkeypatch):
    monkeypatch.setenv("EOPP_RELEASE_ID", "20260615_181500-abc1234")
    monkeypatch.setenv("EOPP_GIT_SHA", "abc1234")
    monkeypatch.setenv("EOPP_IMAGE", "eopp:20260615_181500-abc1234")

    response = client.get("/version")

    assert response.status_code == 200
    assert response.json() == {
        "release_id": "20260615_181500-abc1234",
        "git_sha": "abc1234",
        "image": "eopp:20260615_181500-abc1234",
    }
