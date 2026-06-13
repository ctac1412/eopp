def test_admin_chat_broadcast_reaches_active_masters_and_their_operators(
    client,
    admin_token,
    monkeypatch,
):
    import src.routes.chat as chat_route

    sent = []

    chat_route._chat_history.clear()
    monkeypatch.setattr(
        chat_route,
        "get_connected_streams",
        lambda: [
            {"api_key_id": 11},
            {"api_key_id": 22},
            {"api_key_id": -100007},
            {"api_key_id": None},
        ],
    )
    monkeypatch.setattr(
        chat_route.operator_repo,
        "get_subscribed_operators",
        lambda master_id: {11: [7], 22: [8, 9]}.get(master_id, []),
    )
    monkeypatch.setattr(
        chat_route,
        "push_sse",
        lambda event, api_key_id=None: sent.append((api_key_id, event)),
    )

    response = client.post(
        "/admin/chat/broadcast",
        headers={"X-Admin-Token": admin_token},
        json={"message": "Проверка связи", "sender_label": "Администратор"},
    )

    assert response.status_code == 200
    assert response.json()["active_masters"] == 2
    assert response.json()["delivered_to_operators"] == 3
    assert {target for target, _ in sent} == {11, 22, -100007, -100008, -100009}
    assert all(event["sender_role"] == "admin" for _, event in sent)
    assert chat_route.get_chat_history(11)[-1]["message"] == "Проверка связи"
    assert chat_route.get_chat_history(22)[-1]["sender_label"] == "Администратор"
