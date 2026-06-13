"""Clean user-company access model for finance, operators, and executors."""


def _create_company(client, admin_token, name):
    response = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": name, "aliases": [name.lower()]},
    )
    assert response.status_code == 201
    return response.json()


def _create_user(client, admin_token, *, name, login, company_id, role="manager"):
    response = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": name,
            "login": login,
            "password": "strong-password",
            "role": role,
            "company_id": company_id,
            "active": True,
        },
    )
    assert response.status_code == 200
    return response.json()


def _login(client, login):
    response = client.post(
        "/admin/auth",
        json={"login": login, "password": "strong-password"},
    )
    assert response.status_code == 200
    return client


def test_finance_assignments_include_specific_company_and_global_users(client, admin_token):
    alpha = _create_company(client, admin_token, "AccessFinanceAlpha")
    beta = _create_company(client, admin_token, "AccessFinanceBeta")
    alpha_user = _create_user(
        client,
        admin_token,
        name="Alpha Finance",
        login="access.finance.alpha",
        company_id=alpha["id"],
    )
    global_user = _create_user(
        client,
        admin_token,
        name="Global Finance",
        login="access.finance.global",
        company_id=beta["id"],
    )

    update = client.put(
        f"/admin/user-company-access/{alpha_user['id']}",
        headers={"X-Admin-Token": admin_token},
        json={
            "finance": {"company_ids": [alpha["id"]], "all_companies": False},
            "operator": {"company_ids": [], "all_companies": False},
            "executor": {"company_ids": [], "all_companies": False},
        },
    )
    assert update.status_code == 200
    update = client.put(
        f"/admin/user-company-access/{global_user['id']}",
        headers={"X-Admin-Token": admin_token},
        json={
            "finance": {"company_ids": [], "all_companies": True},
            "operator": {"company_ids": [], "all_companies": False},
            "executor": {"company_ids": [], "all_companies": False},
        },
    )
    assert update.status_code == 200

    alpha_finance = client.get(
        f"/admin/finance-participants?company_id={alpha['id']}",
        headers={"X-Admin-Token": admin_token},
    )
    assert alpha_finance.status_code == 200
    assert {user["id"] for user in alpha_finance.json()} == {
        alpha_user["id"],
        global_user["id"],
    }

    beta_finance = client.get(
        f"/admin/finance-participants?company_id={beta['id']}",
        headers={"X-Admin-Token": admin_token},
    )
    assert beta_finance.status_code == 200
    assert {user["id"] for user in beta_finance.json()} == {global_user["id"]}


def test_tenant_admin_cannot_assign_all_or_other_company_access(client, admin_token):
    own = _create_company(client, admin_token, "TenantAccessOwn")
    other = _create_company(client, admin_token, "TenantAccessOther")
    admin = _create_user(
        client,
        admin_token,
        name="Tenant Admin",
        login="tenant.access.admin",
        company_id=own["id"],
        role="administrator",
    )
    user = _create_user(
        client,
        admin_token,
        name="Tenant User",
        login="tenant.access.user",
        company_id=own["id"],
    )
    _login(client, "tenant.access.admin")

    all_attempt = client.put(
        f"/admin/user-company-access/{user['id']}",
        json={"finance": {"company_ids": [], "all_companies": True}},
    )
    assert all_attempt.status_code == 403

    other_attempt = client.put(
        f"/admin/user-company-access/{user['id']}",
        json={"finance": {"company_ids": [other["id"]], "all_companies": False}},
    )
    assert other_attempt.status_code == 403

    own_attempt = client.put(
        f"/admin/user-company-access/{user['id']}",
        json={"finance": {"company_ids": [own["id"]], "all_companies": False}},
    )
    assert own_attempt.status_code == 200
    assert own_attempt.json()["finance"]["company_ids"] == [own["id"]]
    assert admin["company_id"] == own["id"]


def test_executor_assignments_drive_user_owned_plugin_keys(client, admin_token):
    alpha = _create_company(client, admin_token, "ExecutorAlpha")
    beta = _create_company(client, admin_token, "ExecutorBeta")
    user = _create_user(
        client,
        admin_token,
        name="Executor User",
        login="executor.access.user",
        company_id=alpha["id"],
    )

    without_user = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "missing-user-key"},
    )
    assert without_user.status_code == 200
    assert without_user.json()["user_id"] is None

    assigned = client.put(
        f"/admin/user-company-access/{user['id']}",
        headers={"X-Admin-Token": admin_token},
        json={"executor": {"company_ids": [alpha["id"]], "all_companies": False}},
    )
    assert assigned.status_code == 200

    key = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "executor-key", "user_id": user["id"]},
    )
    assert key.status_code == 200
    assert key.json()["user_id"] == user["id"]
    assert key.json()["company_id"] is None

    _login(client, "executor.access.user")
    plugin_keys = client.get("/auth/plugin-keys")
    assert plugin_keys.status_code == 200
    assert plugin_keys.json()["keys"] == [
        {
            "id": key.json()["id"],
            "key": key.json()["key"],
            "label": "executor-key",
            "user_id": user["id"],
            "user_name": "Executor User",
            "executor_company_ids": [alpha["id"]],
            "executor_all_companies": False,
            "is_super_kiosk": False,
        }
    ]

    validation = client.get("/validate-key", params={"api_key": key.json()["key"]})
    assert validation.status_code == 200
    assert validation.json()["valid"] is True
    assert validation.json()["user_id"] == user["id"]
    assert validation.json()["executor_company_ids"] == [alpha["id"]]
    assert validation.json()["executor_all_companies"] is False
    assert beta["id"] not in validation.json()["executor_company_ids"]


def test_operator_link_requires_operator_and_executor_company_overlap(client, admin_token):
    alpha = _create_company(client, admin_token, "OperatorOverlapAlpha")
    beta = _create_company(client, admin_token, "OperatorOverlapBeta")
    executor = _create_user(
        client,
        admin_token,
        name="Executor Owner",
        login="operator.overlap.executor",
        company_id=beta["id"],
    )
    assigned = client.put(
        f"/admin/user-company-access/{executor['id']}",
        headers={"X-Admin-Token": admin_token},
        json={"executor": {"company_ids": [beta["id"]], "all_companies": False}},
    )
    assert assigned.status_code == 200
    key = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "overlap-master", "user_id": executor["id"]},
    )
    assert key.status_code == 200

    operator = client.post(
        "/admin/operators",
        headers={"X-Admin-Token": admin_token},
        json={"nickname": "overlap-operator", "company_id": alpha["id"]},
    )
    assert operator.status_code == 200
    op = operator.json()
    assert op["user_id"] is not None

    blocked = client.put(
        f"/admin/operators/{op['id']}/link",
        headers={"X-Admin-Token": admin_token},
        json={"master_key_id": key.json()["id"]},
    )
    assert blocked.status_code == 403

    update = client.put(
        f"/admin/user-company-access/{op['user_id']}",
        headers={"X-Admin-Token": admin_token},
        json={"operator": {"company_ids": [beta["id"]], "all_companies": False}},
    )
    assert update.status_code == 200

    self_link = client.post(
        f"/operators/{op['uuid']}/link",
        json={"master_id": key.json()["id"]},
    )
    assert self_link.status_code == 403
    assert self_link.json()["error"] == "Operator master assignment is managed by admin"

    linked = client.put(
        f"/admin/operators/{op['id']}/link",
        headers={"X-Admin-Token": admin_token},
        json={"master_key_id": key.json()["id"]},
    )
    assert linked.status_code == 200


def test_operator_access_grant_creates_operator_runtime_defaults(client, admin_token):
    company = _create_company(client, admin_token, "OperatorAutoRuntime")
    user = _create_user(
        client,
        admin_token,
        name="Auto Runtime Operator",
        login="operator.auto.runtime",
        company_id=company["id"],
    )

    before = client.get("/admin/operators", headers={"X-Admin-Token": admin_token})
    assert before.status_code == 200
    assert all(row.get("user_id") != user["id"] for row in before.json())

    update = client.put(
        f"/admin/user-company-access/{user['id']}",
        headers={"X-Admin-Token": admin_token},
        json={"operator": {"company_ids": [company["id"]], "all_companies": False}},
    )
    assert update.status_code == 200

    operators = client.get("/admin/operators", headers={"X-Admin-Token": admin_token})
    assert operators.status_code == 200
    op = next(row for row in operators.json() if row.get("user_id") == user["id"])
    assert op["nickname"] == "Auto Runtime Operator"
    assert op["allowed_master_keys"] is None
    assert op["icon_display_mode"] == "own_then_foreign"
    assert op["operator_company_ids"] == [company["id"]]


def test_operator_executor_scope_distinguishes_all_accessible_and_whitelist(client, admin_token):
    alpha = _create_company(client, admin_token, "OperatorMastersAlpha")
    beta = _create_company(client, admin_token, "OperatorMastersBeta")
    executor_alpha = _create_user(
        client,
        admin_token,
        name="Alpha Executor",
        login="operator.masters.alpha.executor",
        company_id=alpha["id"],
    )
    executor_beta = _create_user(
        client,
        admin_token,
        name="Beta Executor",
        login="operator.masters.beta.executor",
        company_id=beta["id"],
    )
    for user, company in ((executor_alpha, alpha), (executor_beta, beta)):
        update = client.put(
            f"/admin/user-company-access/{user['id']}",
            headers={"X-Admin-Token": admin_token},
            json={"executor": {"company_ids": [company["id"]], "all_companies": False}},
        )
        assert update.status_code == 200

    alpha_key = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "alpha-master", "user_id": executor_alpha["id"]},
    )
    beta_key = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "beta-master", "user_id": executor_beta["id"]},
    )
    assert alpha_key.status_code == 200
    assert beta_key.status_code == 200

    operator = client.post(
        "/admin/operators",
        headers={"X-Admin-Token": admin_token},
        json={"nickname": "global-operator", "company_id": alpha["id"]},
    )
    assert operator.status_code == 200
    op = operator.json()
    access = client.put(
        f"/admin/user-company-access/{op['user_id']}",
        headers={"X-Admin-Token": admin_token},
        json={"operator": {"company_ids": [], "all_companies": True}},
    )
    assert access.status_code == 200

    update = client.put(
        f"/admin/operators/{op['id']}",
        headers={"X-Admin-Token": admin_token},
        json={"allowed_master_keys": None},
    )
    assert update.status_code == 200
    assert update.json()["allowed_master_keys"] is None
    assert update.json()["operator_all_companies"] is True

    masters = client.get(f"/operators/{op['uuid']}/masters")
    assert masters.status_code == 200
    master_ids = {row["id"] for row in masters.json()}
    assert {alpha_key.json()["id"], beta_key.json()["id"]}.issubset(master_ids)

    whitelist = client.put(
        f"/admin/operators/{op['id']}",
        headers={"X-Admin-Token": admin_token},
        json={"allowed_master_keys": [alpha_key.json()["id"]]},
    )
    assert whitelist.status_code == 200
    assert whitelist.json()["allowed_master_keys"] == [alpha_key.json()["id"]]

    self_link = client.post(
        f"/operators/{op['uuid']}/link",
        json={"master_id": alpha_key.json()["id"]},
    )
    assert self_link.status_code == 403
    assert self_link.json()["error"] == "Operator master assignment is managed by admin"

    allowed = client.put(
        f"/admin/operators/{op['id']}/link",
        headers={"X-Admin-Token": admin_token},
        json={"master_key_id": alpha_key.json()["id"]},
    )
    assert allowed.status_code == 200
    masters = client.get(f"/operators/{op['uuid']}/masters")
    assert masters.status_code == 200
    assigned = [row for row in masters.json() if row["id"] == alpha_key.json()["id"]]
    assert assigned and assigned[0]["assigned"] is True
    blocked = client.put(
        f"/admin/operators/{op['id']}/link",
        headers={"X-Admin-Token": admin_token},
        json={"master_key_id": beta_key.json()["id"]},
    )
    assert blocked.status_code == 403
    assert blocked.json()["error"] == "Master key not in operator's allowed_master_keys"
