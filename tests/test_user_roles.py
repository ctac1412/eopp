"""Regression tests for password users, role grants, and company ownership."""

from datetime import UTC, datetime


def _create_executor_key(client, admin_token, *, label: str, company_id: int, login_suffix: str):
    user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": f"Executor {label}",
            "login": f"executor.{login_suffix}",
            "password": "strong-password",
            "company_id": company_id,
            "executor_access": {"company_ids": [company_id], "all_companies": False},
        },
    )
    assert user.status_code == 200
    key = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": label, "company_id": company_id, "user_id": user.json()["id"]},
    )
    assert key.status_code == 200
    return key.json()


def test_password_user_login_returns_cookie_permissions_and_company(client, admin_token):
    company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "RoleCo", "aliases": ["roleco"]},
    )
    assert company.status_code == 201
    company_id = company.json()["id"]

    created = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Ops Manager",
            "login": "ops.manager",
            "password": "strong-password",
            "role": "manager",
            "company_id": company_id,
            "active": True,
        },
    )
    assert created.status_code == 200
    body = created.json()
    assert body["login"] == "ops.manager"
    assert body["role"] == "manager"
    assert body["company_id"] == company_id
    assert "password_hash" not in body

    login = client.post(
        "/admin/auth",
        json={"login": "ops.manager", "password": "strong-password"},
    )

    assert login.status_code == 200
    session = login.json()
    assert session["ok"] is True
    assert session["role"] == "manager"
    assert "token" not in session
    assert "eopp_admin_session" in login.cookies
    assert "billing.view" in session["permissions"]
    assert "admin.users.manage" not in session["permissions"]
    assert "channels" in session["sections"]
    assert session["user"]["company_id"] == company_id


def test_common_auth_login_me_and_logout_use_site_session(client, admin_token):
    created = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Site Manager",
            "login": "site.manager",
            "password": "strong-password",
            "role": "manager",
            "active": True,
        },
    )
    assert created.status_code == 200

    login = client.post(
        "/auth/login",
        json={"login": "site.manager", "password": "strong-password"},
    )
    assert login.status_code == 200
    assert "token" not in login.json()
    assert "eopp_admin_session" in login.cookies

    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["login"] == "site.manager"
    assert me.json()["role"] == "manager"

    logout = client.post("/auth/logout")
    assert logout.status_code == 200
    assert client.get("/auth/me").status_code == 401


def test_api_key_remains_plugin_token_bound_to_user_and_company(client, admin_token):
    company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "PluginCo", "aliases": ["pluginco"]},
    )
    assert company.status_code == 201
    company_id = company.json()["id"]
    user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Plugin User",
            "login": "plugin.user",
            "password": "strong-password",
            "role": "manager",
            "company_id": company_id,
            "active": True,
        },
    )
    assert user.status_code == 200
    user_id = user.json()["id"]

    created = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "plugin-token", "company_id": company_id, "user_id": user_id},
    )
    assert created.status_code == 200
    key_body = created.json()
    plugin_token = key_body["key"]
    assert key_body["user_id"] == user_id
    assert key_body["company_id"] == company_id

    validated = client.get("/validate-key", params={"api_key": plugin_token})
    assert validated.status_code == 200
    assert validated.json()["valid"] is True

    keys = client.get("/api-keys", headers={"X-Admin-Token": admin_token})
    assert keys.status_code == 200
    row = next(item for item in keys.json() if item["id"] == key_body["id"])
    assert row["user_id"] == user_id
    assert row["user_name"] == "Plugin User"
    assert row["company_id"] == company_id


def test_common_auth_exposes_only_current_user_plugin_tokens(client, admin_token):
    company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "MainLoginCo", "aliases": ["mainloginco"]},
    )
    assert company.status_code == 201
    company_id = company.json()["id"]
    user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Main Login User",
            "login": "main.login",
            "password": "strong-password",
            "role": "manager",
            "company_id": company_id,
            "active": True,
        },
    )
    assert user.status_code == 200
    user_id = user.json()["id"]
    owned = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "owned-plugin-token", "company_id": company_id, "user_id": user_id},
    )
    assert owned.status_code == 200
    other = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "other-plugin-token"},
    )
    assert other.status_code == 200

    login = client.post("/auth/login", json={"login": "main.login", "password": "strong-password"})
    assert login.status_code == 200
    tokens = client.get("/auth/plugin-keys")

    assert tokens.status_code == 200
    rows = tokens.json()["keys"]
    assert [row["label"] for row in rows] == ["owned-plugin-token"]
    assert rows[0]["key"] == owned.json()["key"]
    assert all(row["label"] != "other-plugin-token" for row in rows)


def test_password_user_session_authorizes_requests_by_role(client, admin_token):
    created = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Read Manager",
            "login": "read.manager",
            "password": "strong-password",
            "role": "manager",
            "active": True,
        },
    )
    assert created.status_code == 200

    login = client.post(
        "/admin/auth",
        json={"login": "read.manager", "password": "strong-password"},
    )
    view = client.get("/admin/invoices")
    edit = client.post(
        "/admin/users",
        json={"name": "Blocked", "login": "blocked", "password": "strong-password", "role": "operator"},
    )

    assert view.status_code == 200
    assert edit.status_code == 403


def test_legacy_admin_api_key_is_migrated_to_user_account_but_not_used_as_admin_token(
    client, admin_token, legacy_admin_api_key
):
    users = client.get("/admin/users", headers={"X-Admin-Token": admin_token})

    assert users.status_code == 200
    rows = users.json()
    admin_users = [row for row in rows if row.get("login") == "admin"]
    assert admin_users
    assert admin_users[0]["role"] == "super_admin"

    password_login = client.post(
        "/admin/auth",
        json={"login": "admin", "password": legacy_admin_api_key},
    )

    assert password_login.status_code == 200
    assert password_login.json()["role"] == "super_admin"

    fresh_client = client.__class__(client.app)
    token_login = fresh_client.post("/admin/auth", json={"token": legacy_admin_api_key})
    header_access = fresh_client.get("/admin/users", headers={"X-Admin-Token": legacy_admin_api_key})

    assert token_login.status_code == 401
    assert header_access.status_code == 401


def test_roles_endpoint_exposes_section_access_for_admin_ui(client, admin_token):
    response = client.get("/admin/roles", headers={"X-Admin-Token": admin_token})

    assert response.status_code == 200
    roles = {role["id"]: role for role in response.json()["roles"]}
    assert set(roles) == {"super_admin", "administrator", "manager", "operator"}
    assert "users" in roles["super_admin"]["sections"]
    assert "channels" in roles["super_admin"]["sections"]
    assert "channels" in roles["manager"]["sections"]
    assert "users" not in roles["manager"]["sections"]
    assert roles["operator"]["permissions"] == ["operator.answer"]


def test_password_login_sets_cookie_that_authorizes_closed_requests(client, admin_token):
    created = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Cookie Admin",
            "login": "cookie.admin",
            "password": "strong-password",
            "role": "administrator",
            "active": True,
        },
    )
    assert created.status_code == 200

    login = client.post(
        "/admin/auth",
        json={"login": "cookie.admin", "password": "strong-password"},
    )

    assert login.status_code == 200
    assert "eopp_admin_session" in login.cookies
    response = client.get("/admin/invoices")
    assert response.status_code == 200


def test_user_statistics_endpoint_summarizes_company_usage_expenses_and_payouts(client, admin_token):
    from src.entities import ApiKey, Expense, Payout, PayoutShare, UsageLog, get_session

    company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "StatsCo", "aliases": ["statsco"]},
    )
    assert company.status_code == 201
    company_id = company.json()["id"]
    created = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Stats User",
            "login": "stats.user",
            "password": "strong-password",
            "role": "manager",
            "company_id": company_id,
        },
    )
    assert created.status_code == 200
    user_id = created.json()["id"]
    now = datetime.now(UTC).isoformat()

    with get_session() as session:
        api_key = ApiKey(
            key="stats-key",
            label="stats-key",
            created_at=now,
            active=True,
            user_id=user_id,
            company_id=company_id,
        )
        session.add(api_key)
        session.flush()
        session.add_all(
            [
                UsageLog(
                    api_key_id=api_key.id,
                    reservation_id="ok-1",
                    status="confirmed",
                    created_at=now,
                    confirmed_at=now,
                    price=120,
                    paid=True,
                    company_id=company_id,
                ),
                UsageLog(
                    api_key_id=api_key.id,
                    reservation_id="fail-1",
                    status="failed",
                    created_at=now,
                    price=30,
                    paid=False,
                    company_id=company_id,
                ),
                Expense(amount=40, reason="Fuel", user_id=user_id, created_at=now),
            ]
        )
        payout = Payout(name="Stats payout", status="completed", created_at=now, completed_at=now)
        session.add(payout)
        session.flush()
        session.add(
            PayoutShare(
                payout_id=payout.id,
                user_id=user_id,
                split_pct=100,
                expenses_compensation=10,
                profit_share=70,
                total=80,
            )
        )
        session.commit()

    response = client.get(f"/admin/users/{user_id}/stats", headers={"X-Admin-Token": admin_token})

    assert response.status_code == 200
    stats = response.json()
    assert stats["user"]["id"] == user_id
    assert stats["user"]["company_id"] == company_id
    assert stats["api_keys"]["count"] == 1
    assert stats["usage"]["total"] == 2
    assert stats["usage"]["confirmed"] == 1
    assert stats["usage"]["failed"] == 1
    assert stats["usage"]["revenue"] == 150
    assert stats["expenses"]["total_amount"] == 40
    assert stats["payouts"]["total_amount"] == 80


def test_user_create_exposes_memberships_and_function_profiles(client, admin_token):
    company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "ProfilesCo", "aliases": ["profilesco"]},
    )
    assert company.status_code == 201
    company_id = company.json()["id"]

    created = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Profile Owner",
            "login": "profile.owner",
            "password": "strong-password",
            "system_role": None,
            "company_memberships": [
                {"company_id": company_id, "role": "administrator", "active": True}
            ],
            "operator_profile": {
                "company_id": company_id,
                "active": True,
                "nickname": "profile-operator",
            },
            "finance_profile": {"company_id": company_id, "active": True},
            "executor_access": {"company_ids": [company_id], "all_companies": False},
        },
    )

    assert created.status_code == 200
    body = created.json()
    assert body["system_role"] is None
    assert body["company_memberships"] == [
        {
            "company_id": company_id,
            "company_name": "ProfilesCo",
            "role": "administrator",
            "active": True,
        }
    ]
    assert "master" + "_profile" not in body
    assert body["executor_access"] == {"all_companies": False, "company_ids": [company_id]}
    assert body["operator_profile"]["active"] is True
    assert body["operator_profile"]["nickname"] == "profile-operator"
    assert body["finance_profile"]["active"] is True


def test_operator_profile_supports_multiple_companies_and_scoped_links(client, admin_token):
    alpha = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "OperatorAlpha"},
    ).json()
    beta = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "OperatorBeta"},
    ).json()
    gamma = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "OperatorGamma"},
    ).json()
    user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Multi Operator",
            "login": "multi.operator",
            "password": "strong-password",
            "company_id": alpha["id"],
            "operator_profile": {
                "company_id": alpha["id"],
                "company_ids": [alpha["id"], beta["id"]],
                "active": True,
                "nickname": "multi-op",
            },
        },
    )
    assert user.status_code == 200
    operator_profile = user.json()["operator_profile"]
    assert operator_profile["company_ids"] == [alpha["id"], beta["id"]]
    operator_id = operator_profile["operator_id"]
    operator_uuid = operator_profile["uuid"]

    alpha_key = _create_executor_key(client, admin_token, label="operator-alpha-key", company_id=alpha["id"], login_suffix="operator.alpha")
    beta_key = _create_executor_key(client, admin_token, label="operator-beta-key", company_id=beta["id"], login_suffix="operator.beta")
    gamma_key = _create_executor_key(client, admin_token, label="operator-gamma-key", company_id=gamma["id"], login_suffix="operator.gamma")

    operators = client.get("/admin/operators", headers={"X-Admin-Token": admin_token})
    assert operators.status_code == 200
    row = next(item for item in operators.json() if item["id"] == operator_id)
    assert row["company_ids"] == [alpha["id"], beta["id"]]
    assert row["company_names"] == ["OperatorAlpha", "OperatorBeta"]

    assert client.put(
        f"/admin/operators/{operator_id}/link",
        headers={"X-Admin-Token": admin_token},
        json={"master_key_id": beta_key["id"]},
    ).status_code == 200
    blocked = client.put(
        f"/admin/operators/{operator_id}/link",
        headers={"X-Admin-Token": admin_token},
        json={"master_key_id": gamma_key["id"]},
    )
    assert blocked.status_code == 403

    masters = client.get(f"/operators/{operator_uuid}/masters")
    assert masters.status_code == 200
    labels = {row["label"] for row in masters.json()}
    assert {"operator-alpha-key", "operator-beta-key"} <= labels
    assert "operator-gamma-key" not in labels


def test_company_admin_lists_only_operators_for_own_company_scope(client, admin_token):
    own = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "OwnOperatorTenant"},
    ).json()
    shared = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "SharedOperatorTenant"},
    ).json()
    other = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "OtherOperatorTenant"},
    ).json()
    tenant_admin = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Operator Tenant Admin",
            "login": "operator.tenant.admin",
            "password": "strong-password",
            "role": "administrator",
            "system_role": None,
            "company_id": own["id"],
            "company_memberships": [
                {"company_id": own["id"], "role": "administrator", "active": True}
            ],
        },
    )
    assert tenant_admin.status_code == 200
    visible = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Visible Operator",
            "login": "visible.operator",
            "password": "strong-password",
            "company_id": own["id"],
            "operator_profile": {
                "company_id": own["id"],
                "company_ids": [own["id"], shared["id"]],
                "active": True,
                "nickname": "visible-op",
            },
        },
    )
    hidden = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Hidden Operator",
            "login": "hidden.operator",
            "password": "strong-password",
            "company_id": other["id"],
            "operator_profile": {
                "company_id": other["id"],
                "company_ids": [other["id"]],
                "active": True,
                "nickname": "hidden-op",
            },
        },
    )
    assert visible.status_code == 200
    assert hidden.status_code == 200
    own_key = _create_executor_key(client, admin_token, label="own-operator-link-key", company_id=own["id"], login_suffix="own.operator.link")
    other_key = _create_executor_key(client, admin_token, label="other-operator-link-key", company_id=other["id"], login_suffix="other.operator.link")
    assert client.put(
        f"/admin/operators/{visible.json()['operator_profile']['operator_id']}/link",
        headers={"X-Admin-Token": admin_token},
        json={"master_key_id": own_key["id"]},
    ).status_code == 200
    assert client.put(
        f"/admin/operators/{hidden.json()['operator_profile']['operator_id']}/link",
        headers={"X-Admin-Token": admin_token},
        json={"master_key_id": other_key["id"]},
    ).status_code == 200

    tenant_client = client.__class__(client.app)
    assert tenant_client.post(
        "/auth/login",
        json={"login": "operator.tenant.admin", "password": "strong-password"},
    ).status_code == 200
    operators = tenant_client.get("/admin/operators")
    links = tenant_client.get("/admin/operator-links")

    assert operators.status_code == 200
    names = {row["nickname"] for row in operators.json()}
    assert "visible-op" in names
    assert "hidden-op" not in names
    assert links.status_code == 200
    assert {row["operator_nickname"] for row in links.json()} == {"visible-op"}


def test_bulk_operator_assignments_save_company_and_master_combinations(client, admin_token):
    alpha = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "BulkOperatorAlpha"},
    ).json()
    beta = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "BulkOperatorBeta"},
    ).json()
    gamma = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "BulkOperatorGamma"},
    ).json()
    operator_user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Bulk Operator",
            "login": "bulk.operator",
            "password": "strong-password",
            "company_id": alpha["id"],
            "operator_profile": {
                "company_id": alpha["id"],
                "company_ids": [alpha["id"]],
                "active": True,
                "nickname": "bulk-op",
            },
        },
    ).json()
    operator_id = operator_user["operator_profile"]["operator_id"]
    alpha_key = _create_executor_key(client, admin_token, label="bulk-alpha-key", company_id=alpha["id"], login_suffix="bulk.alpha")
    beta_key = _create_executor_key(client, admin_token, label="bulk-beta-key", company_id=beta["id"], login_suffix="bulk.beta")
    gamma_key = _create_executor_key(client, admin_token, label="bulk-gamma-key", company_id=gamma["id"], login_suffix="bulk.gamma")

    blocked = client.post(
        "/admin/operator-assignments/bulk",
        headers={"X-Admin-Token": admin_token},
        json={
            "assignments": [
                {
                    "operator_id": operator_id,
                    "company_ids": [alpha["id"], beta["id"]],
                    "master_key_ids": [alpha_key["id"], gamma_key["id"]],
                }
            ]
        },
    )
    assert blocked.status_code == 403

    saved = client.post(
        "/admin/operator-assignments/bulk",
        headers={"X-Admin-Token": admin_token},
        json={
            "assignments": [
                {
                    "operator_id": operator_id,
                    "company_ids": [alpha["id"], beta["id"]],
                    "master_key_ids": [alpha_key["id"], beta_key["id"]],
                }
            ]
        },
    )

    assert saved.status_code == 200
    row = saved.json()["operators"][0]
    assert row["id"] == operator_id
    assert row["company_ids"] == [alpha["id"], beta["id"]]
    assert row["allowed_master_keys"] == [alpha_key["id"], beta_key["id"]]

    operators = client.get("/admin/operators", headers={"X-Admin-Token": admin_token})
    updated = next(item for item in operators.json() if item["id"] == operator_id)
    assert updated["company_ids"] == [alpha["id"], beta["id"]]
    assert updated["allowed_master_keys"] == [alpha_key["id"], beta_key["id"]]


def test_admin_created_operator_has_profile_for_company_matrix(client, admin_token):
    alpha = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "CreatedOperatorAlpha"},
    ).json()
    beta = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "CreatedOperatorBeta"},
    ).json()

    created = client.post(
        "/admin/operators",
        headers={"X-Admin-Token": admin_token},
        json={"nickname": "created-op", "company_id": alpha["id"]},
    )
    assert created.status_code == 200
    operator = created.json()
    assert operator["profile_id"] is not None
    assert operator["user_id"] is not None

    saved = client.post(
        "/admin/operator-assignments/bulk",
        headers={"X-Admin-Token": admin_token},
        json={
            "assignments": [
                {
                    "operator_id": operator["id"],
                    "company_ids": [alpha["id"], beta["id"]],
                    "master_key_ids": [],
                }
            ]
        },
    )

    assert saved.status_code == 200
    assert saved.json()["operators"][0]["company_ids"] == [alpha["id"], beta["id"]]


def test_executor_plugin_keys_require_executor_access(client, admin_token):
    company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "MasterScopeCo", "aliases": ["masterscopeco"]},
    )
    company_id = company.json()["id"]
    master = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Scoped Master",
            "login": "scoped.master",
            "password": "strong-password",
            "company_id": company_id,
            "executor_access": {"company_ids": [company_id], "all_companies": False},
        },
    )
    regular = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Regular User",
            "login": "regular.user",
            "password": "strong-password",
            "company_id": company_id,
        },
    )
    master_key = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={
            "label": "master-owned-token",
            "user_id": master.json()["id"],
        },
    )
    assert master_key.status_code == 200

    master_client = client.__class__(client.app)
    assert master_client.post(
        "/auth/login",
        json={"login": "scoped.master", "password": "strong-password"},
    ).status_code == 200
    master_tokens = master_client.get("/auth/plugin-keys")
    assert master_tokens.status_code == 200
    assert [row["label"] for row in master_tokens.json()["keys"]] == [
        "master-owned-token",
    ]

    regular_client = client.__class__(client.app)
    assert regular_client.post(
        "/auth/login",
        json={"login": "regular.user", "password": "strong-password"},
    ).status_code == 200
    regular_tokens = regular_client.get("/auth/plugin-keys")
    assert regular_tokens.status_code == 200
    assert regular_tokens.json()["keys"] == []


def test_finance_participant_endpoint_excludes_non_finance_users(client, admin_token):
    company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "FinanceScopeCo", "aliases": ["financescopeco"]},
    )
    company_id = company.json()["id"]
    finance_user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Finance Participant",
            "login": "finance.participant",
            "password": "strong-password",
            "company_id": company_id,
            "finance_profile": {"company_id": company_id, "active": True},
        },
    )
    plain_user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Plain User",
            "login": "plain.user",
            "password": "strong-password",
            "company_id": company_id,
        },
    )
    assert finance_user.status_code == 200
    assert plain_user.status_code == 200

    response = client.get(
        "/admin/finance-participants",
        headers={"X-Admin-Token": admin_token},
    )

    assert response.status_code == 200
    names = [row["name"] for row in response.json()]
    assert "Finance Participant" in names
    assert "Plain User" not in names


def test_company_admin_lists_only_own_company_users_and_keys(client, admin_token):
    own_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "OwnTenantCo", "aliases": ["owntenantco"]},
    ).json()
    other_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "OtherTenantCo", "aliases": ["othertenantco"]},
    ).json()
    admin = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Tenant Admin",
            "login": "tenant.admin",
            "password": "strong-password",
            "role": "administrator",
            "system_role": None,
            "company_id": own_company["id"],
            "company_memberships": [
                {"company_id": own_company["id"], "role": "administrator", "active": True}
            ],
        },
    ).json()
    client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Other Tenant User",
            "login": "other.tenant.user",
            "password": "strong-password",
            "company_id": other_company["id"],
        },
    )
    own_key = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "own-tenant-key", "company_id": own_company["id"], "user_id": admin["id"]},
    ).json()
    client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "other-tenant-key", "company_id": other_company["id"]},
    )

    tenant_client = client.__class__(client.app)
    assert tenant_client.post(
        "/auth/login",
        json={"login": "tenant.admin", "password": "strong-password"},
    ).status_code == 200

    users = tenant_client.get("/admin/users")
    keys = tenant_client.get("/api-keys")
    companies = tenant_client.get("/admin/companies")

    assert users.status_code == 200
    assert {row["company_id"] for row in users.json()} == {own_company["id"]}
    assert "Other Tenant User" not in [row["name"] for row in users.json()]
    assert keys.status_code == 200
    assert [row["id"] for row in keys.json()] == [own_key["id"]]
    assert companies.status_code == 200
    assert [row["id"] for row in companies.json()] == [own_company["id"]]


def test_company_admin_cannot_mutate_companies_or_company_tariffs(client, admin_token):
    own_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "TenantMutationOwn"},
    ).json()
    other_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "TenantMutationOther"},
    ).json()
    created = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Tenant Mutation Admin",
            "login": "tenant.mutation.admin",
            "password": "strong-password",
            "role": "administrator",
            "system_role": None,
            "company_id": own_company["id"],
            "company_memberships": [
                {"company_id": own_company["id"], "role": "administrator", "active": True}
            ],
        },
    )
    assert created.status_code == 200

    tenant_client = client.__class__(client.app)
    assert tenant_client.post(
        "/auth/login",
        json={"login": "tenant.mutation.admin", "password": "strong-password"},
    ).status_code == 200

    assert tenant_client.post(
        "/admin/companies",
        json={"name": "TenantCreatedCompany"},
    ).status_code == 403
    assert tenant_client.put(
        f"/admin/companies/{other_company['id']}",
        json={"name": "TenantChangedOther"},
    ).status_code == 403
    assert tenant_client.delete(f"/admin/companies/{other_company['id']}").status_code == 403
    assert tenant_client.put(
        f"/admin/company-tariffs/{own_company['id']}",
        json={"price_create": 1, "price_reschedule": 2},
    ).status_code == 403
    assert tenant_client.put(
        f"/admin/company-tariffs/{other_company['id']}",
        json={"price_create": 1, "price_reschedule": 2},
    ).status_code == 403

    companies = client.get("/admin/companies", headers={"X-Admin-Token": admin_token})
    assert {row["name"] for row in companies.json()} >= {"TenantMutationOwn", "TenantMutationOther"}
    assert "TenantCreatedCompany" not in {row["name"] for row in companies.json()}


def test_company_admin_can_manage_only_own_company_users_without_system_role(client, admin_token):
    own_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "TenantUserOwn"},
    ).json()
    other_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "TenantUserOther"},
    ).json()
    created_admin = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Tenant User Admin",
            "login": "tenant.user.admin",
            "password": "strong-password",
            "role": "administrator",
            "system_role": None,
            "company_id": own_company["id"],
            "company_memberships": [
                {"company_id": own_company["id"], "role": "administrator", "active": True}
            ],
        },
    )
    assert created_admin.status_code == 200

    tenant_client = client.__class__(client.app)
    assert tenant_client.post(
        "/auth/login",
        json={"login": "tenant.user.admin", "password": "strong-password"},
    ).status_code == 200

    own_user = tenant_client.post(
        "/admin/users",
        json={
            "name": "Own Tenant Worker",
            "login": "own.tenant.worker",
            "password": "strong-password",
            "role": "manager",
            "company_id": own_company["id"],
            "company_memberships": [
                {"company_id": own_company["id"], "role": "manager", "active": True}
            ],
        },
    )
    assert own_user.status_code == 200
    assert own_user.json()["company_id"] == own_company["id"]

    assert tenant_client.post(
        "/admin/users",
        json={
            "name": "Other Tenant Worker",
            "login": "other.tenant.worker.direct",
            "password": "strong-password",
            "role": "manager",
            "company_id": other_company["id"],
        },
    ).status_code == 403
    assert tenant_client.post(
        "/admin/users",
        json={
            "name": "Escalated Tenant Worker",
            "login": "tenant.escalated.worker",
            "password": "strong-password",
            "role": "administrator",
            "system_role": "super_admin",
            "company_id": own_company["id"],
        },
    ).status_code == 403
    assert tenant_client.put(
        f"/admin/users/{own_user.json()['id']}",
        json={
            "name": "Moved Tenant Worker",
            "company_id": other_company["id"],
        },
    ).status_code == 403

    users = tenant_client.get("/admin/users")
    assert users.status_code == 200
    assert {row["company_id"] for row in users.json()} == {own_company["id"]}
    assert "Other Tenant Worker" not in [row["name"] for row in users.json()]


def test_company_admin_can_manage_only_own_company_api_keys(client, admin_token):
    own_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "TenantKeyOwn"},
    ).json()
    other_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "TenantKeyOther"},
    ).json()
    admin = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Tenant Key Admin",
            "login": "tenant.key.admin",
            "password": "strong-password",
            "role": "administrator",
            "system_role": None,
            "company_id": own_company["id"],
            "company_memberships": [
                {"company_id": own_company["id"], "role": "administrator", "active": True}
            ],
        },
    ).json()
    other_user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Other Key User",
            "login": "other.key.user",
            "password": "strong-password",
            "company_id": other_company["id"],
        },
    ).json()
    other_key = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "other-owned-key", "company_id": other_company["id"]},
    ).json()

    tenant_client = client.__class__(client.app)
    assert tenant_client.post(
        "/auth/login",
        json={"login": "tenant.key.admin", "password": "strong-password"},
    ).status_code == 200

    own_key = tenant_client.post(
        "/api-keys",
        json={"label": "own-created-key", "company_id": own_company["id"], "user_id": admin["id"]},
    )
    assert own_key.status_code == 200
    assert own_key.json()["company_id"] == own_company["id"]
    assert own_key.json()["user_id"] == admin["id"]

    assert tenant_client.post(
        "/api-keys",
        json={"label": "other-company-key", "company_id": other_company["id"]},
    ).status_code == 403
    assert tenant_client.post(
        "/api-keys",
        json={"label": "other-user-key", "company_id": own_company["id"], "user_id": other_user["id"]},
    ).status_code == 403
    assert tenant_client.put(
        f"/api-keys/{own_key.json()['id']}",
        json={"company_id": other_company["id"]},
    ).status_code == 403
    assert tenant_client.put(
        f"/api-keys/{other_key['id']}",
        json={"label": "tenant touched other key"},
    ).status_code == 403
    assert tenant_client.post(f"/api-keys/{other_key['id']}/reset-usage").status_code == 403
    assert tenant_client.delete(f"/api-keys/{other_key['id']}").status_code == 403

    keys = tenant_client.get("/api-keys")
    assert keys.status_code == 200
    assert [row["id"] for row in keys.json()] == [own_key.json()["id"]]


def test_company_admin_cannot_read_other_company_user_stats_or_finance_participants(client, admin_token):
    own_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "TenantStatsOwn"},
    ).json()
    other_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "TenantStatsOther"},
    ).json()
    client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Tenant Stats Admin",
            "login": "tenant.stats.admin",
            "password": "strong-password",
            "role": "administrator",
            "system_role": None,
            "company_id": own_company["id"],
            "company_memberships": [
                {"company_id": own_company["id"], "role": "administrator", "active": True}
            ],
            "finance_profile": {"company_id": own_company["id"], "active": True},
        },
    )
    other_user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Other Stats User",
            "login": "other.stats.user",
            "password": "strong-password",
            "company_id": other_company["id"],
            "finance_profile": {"company_id": other_company["id"], "active": True},
        },
    ).json()

    tenant_client = client.__class__(client.app)
    assert tenant_client.post(
        "/auth/login",
        json={"login": "tenant.stats.admin", "password": "strong-password"},
    ).status_code == 200

    assert tenant_client.get(f"/admin/users/{other_user['id']}/stats").status_code == 403
    own_finance = tenant_client.get(f"/admin/finance-participants?company_id={own_company['id']}")
    assert own_finance.status_code == 200
    assert [row["company_id"] for row in own_finance.json()] == [own_company["id"]]
    assert tenant_client.get(f"/admin/finance-participants?company_id={other_company['id']}").status_code == 403


def test_company_admin_cannot_mutate_other_company_invoices(client, admin_token):
    from src.db.invoices import insert_invoice

    own_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "TenantInvoiceOwn"},
    ).json()
    other_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "TenantInvoiceOther"},
    ).json()
    client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Tenant Invoice Admin",
            "login": "tenant.invoice.admin",
            "password": "strong-password",
            "role": "administrator",
            "system_role": None,
            "company_id": own_company["id"],
            "company_memberships": [
                {"company_id": own_company["id"], "role": "administrator", "active": True}
            ],
        },
    )
    own_invoice_id = insert_invoice("TENANT-OWN-INVOICE", company=own_company["name"])
    other_invoice_id = insert_invoice("TENANT-OTHER-INVOICE", company=other_company["name"])

    tenant_client = client.__class__(client.app)
    assert tenant_client.post(
        "/auth/login",
        json={"login": "tenant.invoice.admin", "password": "strong-password"},
    ).status_code == 200

    assert tenant_client.patch(
        f"/admin/invoices/{own_invoice_id}",
        json={"comment": "own update"},
    ).status_code == 200
    assert tenant_client.patch(
        f"/admin/invoices/{other_invoice_id}",
        json={"comment": "blocked update"},
    ).status_code == 403
    assert tenant_client.delete(f"/admin/invoices/{other_invoice_id}").status_code == 403
    assert tenant_client.post(
        "/admin/open-invoices/ensure",
        json={"company": other_company["name"]},
    ).status_code == 403
    assert tenant_client.post(
        "/admin/open-invoices/issue",
        json={"company": other_company["name"]},
    ).status_code == 403


def test_company_admin_can_manage_only_own_company_prepaid_packages(client, admin_token):
    own_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "TenantPrepaidOwn"},
    ).json()
    other_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "TenantPrepaidOther"},
    ).json()
    client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Tenant Prepaid Admin",
            "login": "tenant.prepaid.admin",
            "password": "strong-password",
            "role": "administrator",
            "system_role": None,
            "company_id": own_company["id"],
            "company_memberships": [
                {"company_id": own_company["id"], "role": "administrator", "active": True}
            ],
        },
    )
    own_key = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "own-prepaid-key", "company_id": own_company["id"]},
    ).json()
    other_key = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "other-prepaid-key", "company_id": other_company["id"]},
    ).json()
    other_package = client.post(
        "/admin/prepaid-packages",
        headers={"X-Admin-Token": admin_token},
        json={"api_key_id": other_key["id"], "balance_amount": 1000},
    ).json()

    tenant_client = client.__class__(client.app)
    assert tenant_client.post(
        "/auth/login",
        json={"login": "tenant.prepaid.admin", "password": "strong-password"},
    ).status_code == 200

    own_package = tenant_client.post(
        "/admin/prepaid-packages",
        json={"api_key_id": own_key["id"], "balance_amount": 500},
    )
    assert own_package.status_code == 200
    assert tenant_client.post(
        "/admin/prepaid-packages",
        json={"api_key_id": other_key["id"], "balance_amount": 500},
    ).status_code == 403
    assert tenant_client.patch(
        f"/admin/prepaid-packages/{other_package['id']}",
        json={"balance_amount": 777},
    ).status_code == 403
    assert tenant_client.post(
        f"/admin/prepaid-packages/{other_package['id']}/top-up",
        json={"amount": 100},
    ).status_code == 403
    assert tenant_client.delete(f"/admin/prepaid-packages/{other_package['id']}").status_code == 403

    packages = tenant_client.get("/admin/prepaid-packages")
    assert packages.status_code == 200
    assert [row["id"] for row in packages.json()] == [own_package.json()["id"]]


def test_company_admin_lists_only_own_company_finance_rows(client, admin_token):
    from src.db.invoices import insert_invoice

    own_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "OwnFinanceTenant"},
    ).json()
    other_company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "OtherFinanceTenant"},
    ).json()
    own_admin = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Finance Tenant Admin",
            "login": "finance.tenant.admin",
            "password": "strong-password",
            "role": "administrator",
            "system_role": None,
            "company_id": own_company["id"],
            "company_memberships": [
                {"company_id": own_company["id"], "role": "administrator", "active": True}
            ],
        },
    ).json()
    other_user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Other Finance User",
            "login": "other.finance.user",
            "password": "strong-password",
            "company_id": other_company["id"],
        },
    ).json()

    own_invoice_id = insert_invoice(
        "INV-OWN-FINANCE",
        company=own_company["name"],
        debt_amount=1000,
        total_amount=1000,
    )
    other_invoice_id = insert_invoice(
        "INV-OTHER-FINANCE",
        company=other_company["name"],
        debt_amount=2000,
        total_amount=2000,
    )
    own_expense = client.post(
        "/admin/expenses",
        headers={"X-Admin-Token": admin_token},
        json={"amount": 100, "reason": "own expense", "user_id": own_admin["id"]},
    ).json()
    other_expense = client.post(
        "/admin/expenses",
        headers={"X-Admin-Token": admin_token},
        json={"amount": 200, "reason": "other expense", "user_id": other_user["id"]},
    ).json()
    own_payout = client.post(
        "/admin/payouts",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Own finance payout",
            "invoice_ids": [own_invoice_id],
            "expense_ids": [own_expense["id"]],
            "user_splits": [{"user_id": own_admin["id"], "split_pct": 100}],
        },
    ).json()
    client.post(
        "/admin/payouts",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Other finance payout",
            "invoice_ids": [other_invoice_id],
            "expense_ids": [other_expense["id"]],
            "user_splits": [{"user_id": other_user["id"], "split_pct": 100}],
        },
    )

    tenant_client = client.__class__(client.app)
    assert tenant_client.post(
        "/auth/login",
        json={"login": "finance.tenant.admin", "password": "strong-password"},
    ).status_code == 200

    invoices = tenant_client.get("/admin/invoices")
    expenses = tenant_client.get("/admin/expenses")
    payouts = tenant_client.get("/admin/payouts")

    assert invoices.status_code == 200
    assert expenses.status_code == 200
    assert payouts.status_code == 200
    assert [row["invoice_number"] for row in invoices.json()] == ["INV-OWN-FINANCE"]
    assert [row["id"] for row in expenses.json()["expenses"]] == [own_expense["id"]]
    assert [row["id"] for row in payouts.json()] == [own_payout["id"]]


def test_global_executor_access_marks_plugin_keys_global(client, admin_token):
    alpha = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "SuperMasterAlpha"},
    ).json()
    beta = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "SuperMasterBeta"},
    ).json()
    user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Global Master",
            "login": "global.master",
            "password": "strong-password",
            "system_role": "super_admin",
            "company_id": alpha["id"],
            "executor_access": {"company_ids": [], "all_companies": True},
        },
    )
    assert user.status_code == 200
    client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "alpha-master-token", "company_id": alpha["id"], "user_id": user.json()["id"]},
    )
    client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "beta-master-token", "company_id": beta["id"], "user_id": user.json()["id"]},
    )

    master_client = client.__class__(client.app)
    assert master_client.post(
        "/auth/login",
        json={"login": "global.master", "password": "strong-password"},
    ).status_code == 200
    response = master_client.get("/auth/plugin-keys")

    assert response.status_code == 200
    assert {row["label"] for row in response.json()["keys"]} >= {
        "alpha-master-token",
        "beta-master-token",
    }


def test_admin_user_update_preserves_executor_access(client, admin_token):
    company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "MasterScopeUpdateCo"},
    ).json()
    created = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Scope Editable Master",
            "login": "scope.editable.master",
            "password": "strong-password",
            "company_id": company["id"],
            "executor_access": {"company_ids": [company["id"]], "all_companies": False},
        },
    )
    assert created.status_code == 200
    user_id = created.json()["id"]

    updated = client.put(
        f"/admin/users/{user_id}",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Scope Editable Master",
            "login": "scope.editable.master",
            "role": "manager",
            "system_role": "super_admin",
            "active": True,
            "company_id": company["id"],
            "company_memberships": [
                {"company_id": company["id"], "role": "manager", "active": True}
            ],
            "executor_access": {"company_ids": [], "all_companies": True},
        },
    )

    assert updated.status_code == 200
    assert updated.json()["executor_access"] == {"all_companies": True, "company_ids": []}
    assert "master" + "_profile" not in updated.json()


def test_company_executor_access_exposes_own_plugin_keys(client, admin_token):
    own = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "CompanyMasterOwn"},
    ).json()
    other = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "CompanyMasterOther"},
    ).json()
    user = client.post(
        "/admin/users",
        headers={"X-Admin-Token": admin_token},
        json={
            "name": "Company Master",
            "login": "company.master",
            "password": "strong-password",
            "company_id": own["id"],
            "executor_access": {"company_ids": [own["id"]], "all_companies": False},
        },
    )
    client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "own-company-token", "company_id": own["id"], "user_id": user.json()["id"]},
    )
    client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "other-company-token", "company_id": other["id"], "user_id": user.json()["id"]},
    )

    master_client = client.__class__(client.app)
    assert master_client.post(
        "/auth/login",
        json={"login": "company.master", "password": "strong-password"},
    ).status_code == 200
    response = master_client.get("/auth/plugin-keys")

    assert response.status_code == 200
    assert {row["label"] for row in response.json()["keys"]} == {"own-company-token", "other-company-token"}
    assert all(row["executor_company_ids"] == [own["id"]] for row in response.json()["keys"])


def test_company_tariff_is_returned_for_keys_without_specific_tariff(client, admin_token):
    company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "CompanyTariffCo"},
    ).json()
    key = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "company-tariff-key", "company_id": company["id"]},
    ).json()

    tariff = client.put(
        f"/admin/company-tariffs/{company['id']}",
        headers={"X-Admin-Token": admin_token},
        json={
            "price_create": 111,
            "price_reschedule": 222,
            "price_create_peak": 333,
            "price_custom_slots": 444,
        },
    )
    assert tariff.status_code == 200

    keys = client.get("/api-keys", headers={"X-Admin-Token": admin_token})
    row = next(item for item in keys.json() if item["id"] == key["id"])

    assert row["tariff"] == {
        "price_create": 111,
        "price_reschedule": 222,
        "price_create_peak": 333,
        "price_custom_slots": 444,
        "source": "company",
        "company_id": company["id"],
    }


def test_company_tariff_prices_confirmed_usage_without_key_tariff(client, admin_token):
    from src.db import confirm_usage, get_usage_log_entry, log_usage
    from src.modules.billing.jobs import calculate_usage_price

    company = client.post(
        "/admin/companies",
        headers={"X-Admin-Token": admin_token},
        json={"name": "CompanyTariffBillingCo"},
    ).json()
    key = client.post(
        "/api-keys",
        headers={"X-Admin-Token": admin_token},
        json={"label": "company-tariff-billing-key", "company_id": company["id"]},
    ).json()
    tariff = client.put(
        f"/admin/company-tariffs/{company['id']}",
        headers={"X-Admin-Token": admin_token},
        json={
            "price_create": 111,
            "price_reschedule": 222,
            "price_create_peak": 111,
            "price_custom_slots": 444,
        },
    )
    assert tariff.status_code == 200

    usage_log_id = log_usage(
        key["key"],
        "real-company-tariff-billing-reservation",
        "captcha-company-tariff-billing",
        config_json={
            "mode": "create",
            "reservationData": {
                "raw": {
                    "userData": {"organizationName": company["name"]},
                },
            },
            "timeOrder": [["2026-06-13T10:00:00+03:00"]],
        },
    )
    assert confirm_usage(usage_log_id) is True

    calculate_usage_price({"usage_log_id": usage_log_id})

    assert get_usage_log_entry(usage_log_id)["price"] == 555
