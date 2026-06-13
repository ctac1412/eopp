import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Card, Space } from "antd";
import { Button, DataTable, MetricsStrip, StatusTag, Toolbar } from "../../ui";
import { adminHeaders, adminHeadersJson } from "../../features/admin/shared/adminClient";

function formatDate(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusTone(status) {
  if (status === "claimed") return "online";
  if (status === "closed") return "failed";
  if (status === "open") return "warning";
  return "neutral";
}

function routeLabel(routeKind) {
  const labels = {
    reservation_card: "Карточка",
    eopp_root: "Root",
    unknown: "Неизвестно",
  };
  return labels[routeKind] || routeKind || "-";
}

function companyLabel(session) {
  if (session.company?.name) return session.company.name;
  return session.raw_company_name || "-";
}

function userLabel(session) {
  if (typeof session.eopp_user === "string") return session.eopp_user;
  return session.eopp_user?.name || session.eopp_user_name || "-";
}

function executorLabel(session) {
  return session.executor_token || "-";
}

export function PluginChannelTab({ adminToken, onError }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [notice, setNotice] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const setRowLoading = useCallback((key, value) => {
    setActionLoading((current) => ({ ...current, [key]: value }));
  }, []);

  const fetchSessions = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const response = await fetch("/admin/plugin-channel/sessions", {
        headers: adminHeadersJson(adminToken),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
      const nextSessions = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(nextSessions);
      setSelectedSessionId((current) => {
        if (current && nextSessions.some((session) => session.id === current)) return current;
        return nextSessions[0]?.id ?? null;
      });
    } catch (error) {
      setSessions([]);
      onError?.(error.message);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    fetchSessions();
    if (!adminToken) return undefined;
    const timer = window.setInterval(fetchSessions, 5000);
    return () => window.clearInterval(timer);
  }, [adminToken, fetchSessions]);

  const runAction = useCallback(
    async (session, action, request) => {
      const key = `${session.id}-${action}`;
      setRowLoading(key, true);
      setNotice(null);
      try {
        const response = await request();
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
        setNotice(action === "claim" ? "Сессия забрана" : action === "close" ? "Сессия закрыта" : "Команда отправлена");
        await fetchSessions();
      } catch (error) {
        onError?.(error.message);
      } finally {
        setRowLoading(key, false);
      }
    },
    [fetchSessions, onError, setRowLoading],
  );

  const claimSession = useCallback(
    (session) =>
      runAction(session, "claim", () =>
        fetch(`/admin/plugin-channel/sessions/${session.id}/claim`, {
          method: "POST",
          headers: adminHeaders(adminToken),
        }),
      ),
    [adminToken, runAction],
  );

  const refreshSnapshot = useCallback(
    (session) =>
      runAction(session, "refresh", () =>
        fetch(`/admin/plugin-channel/sessions/${session.id}/commands`, {
          method: "POST",
          headers: adminHeaders(adminToken),
          body: JSON.stringify({ type: "refresh_snapshot", payload: {} }),
        }),
      ),
    [adminToken, runAction],
  );

  const closeSession = useCallback(
    (session) =>
      runAction(session, "close", () =>
        fetch(`/admin/plugin-channel/sessions/${session.id}/close`, {
          method: "POST",
          headers: adminHeaders(adminToken),
        }),
      ),
    [adminToken, runAction],
  );

  const metrics = useMemo(() => {
    const open = sessions.filter((session) => session.status === "open").length;
    const claimed = sessions.filter((session) => session.status === "claimed").length;
    const cards = sessions.filter((session) => session.route_kind === "reservation_card").length;
    const roots = sessions.filter((session) => session.route_kind === "eopp_root").length;
    return [
      { key: "total", label: "Сессии", value: sessions.length, tone: sessions.length ? "info" : "neutral" },
      { key: "open", label: "Открыты", value: open, tone: open ? "warning" : "neutral" },
      { key: "claimed", label: "Забраны", value: claimed, tone: claimed ? "success" : "neutral" },
      { key: "cards", label: "Карточки", value: cards, tone: cards ? "info" : "neutral" },
      { key: "roots", label: "Root", value: roots, tone: roots ? "info" : "neutral" },
    ];
  }, [sessions]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || sessions[0] || null,
    [selectedSessionId, sessions],
  );

  const columns = [
    {
      title: "Статус",
      dataIndex: "status",
      width: 130,
      render: (value) => <StatusTag status={statusTone(value)} label={value || "-"} />,
    },
    {
      title: "Маршрут",
      dataIndex: "route_kind",
      width: 120,
      render: routeLabel,
    },
    {
      title: "Компания",
      width: 220,
      ellipsis: true,
      render: (_, session) => (
        <span title={companyLabel(session)}>
          {companyLabel(session)}
          {session.company?.auto_created ? " · auto" : ""}
        </span>
      ),
    },
    {
      title: "Исполнитель",
      width: 170,
      ellipsis: true,
      render: (_, session) => <span className="font-monospace">{executorLabel(session)}</span>,
    },
    {
      title: "EOPP пользователь",
      width: 180,
      ellipsis: true,
      render: (_, session) => userLabel(session),
    },
    {
      title: "Бронь",
      dataIndex: "reservation_id",
      width: 180,
      ellipsis: true,
      render: (value) => <span className="font-monospace">{value || "-"}</span>,
    },
    {
      title: "Видимость",
      dataIndex: "visibility",
      width: 150,
      render: (value) => value || "-",
    },
    {
      title: "Открыта",
      dataIndex: "opened_at",
      width: 150,
      render: formatDate,
    },
    {
      title: "Last seen",
      dataIndex: "last_seen_at",
      width: 150,
      render: formatDate,
    },
    {
      title: "Действия",
      fixed: "right",
      width: 270,
      render: (_, session) => (
        <Space wrap size={6}>
          <Button
            size="small"
            variant="primary"
            loading={!!actionLoading[`${session.id}-claim`]}
            disabled={session.status === "closed"}
            onClick={() => claimSession(session)}
          >
            Забрать
          </Button>
          <Button
            size="small"
            loading={!!actionLoading[`${session.id}-refresh`]}
            disabled={session.status === "closed"}
            onClick={() => refreshSnapshot(session)}
          >
            Snapshot
          </Button>
          <Button
            size="small"
            variant="danger"
            loading={!!actionLoading[`${session.id}-close`]}
            disabled={session.status === "closed"}
            onClick={() => closeSession(session)}
          >
            Закрыть
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div data-eopp-component="PluginChannelTab" className="plugin-channel-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Каналы плагина</h2>
            <div className="small text-muted">Открытые thin-agent сессии из EOPP и локальных тестовых страниц</div>
          </div>
        }
        right={
          <Button size="small" onClick={fetchSessions} loading={loading}>
            Обновить
          </Button>
        }
      />

      <MetricsStrip items={metrics} />

      {notice && <Alert className="my-3" type="success" showIcon closable message={notice} onClose={() => setNotice(null)} />}

      <Card className="mt-3" size="small" title="Панель управления сессией">
        {selectedSession ? (
          <div className="plugin-channel-control">
            <div className="plugin-channel-control__summary">
              <div>
                <span className="small text-muted">Сессия</span>
                <div className="font-monospace">#{selectedSession.id}</div>
              </div>
              <div>
                <span className="small text-muted">Статус</span>
                <div><StatusTag status={statusTone(selectedSession.status)} label={selectedSession.status || "-"} /></div>
              </div>
              <div>
                <span className="small text-muted">Компания</span>
                <div>{companyLabel(selectedSession)}</div>
              </div>
              <div>
                <span className="small text-muted">Исполнитель</span>
                <div className="font-monospace">{executorLabel(selectedSession)}</div>
              </div>
              <div>
                <span className="small text-muted">Пользователь EOPP</span>
                <div>{userLabel(selectedSession)}</div>
              </div>
              <div>
                <span className="small text-muted">Бронь</span>
                <div className="font-monospace">{selectedSession.reservation_id || "-"}</div>
              </div>
              <div>
                <span className="small text-muted">URL</span>
                <div className="plugin-channel-control__url" title={selectedSession.page_url || "-"}>
                  {selectedSession.page_url || "-"}
                </div>
              </div>
            </div>
            <Space wrap className="mt-3">
              <Button
                variant="primary"
                loading={!!actionLoading[`${selectedSession.id}-claim`]}
                disabled={selectedSession.status === "closed"}
                onClick={() => claimSession(selectedSession)}
              >
                Забрать
              </Button>
              <Button
                loading={!!actionLoading[`${selectedSession.id}-refresh`]}
                disabled={selectedSession.status === "closed"}
                onClick={() => refreshSnapshot(selectedSession)}
              >
                Обновить snapshot
              </Button>
              <Button
                variant="danger"
                loading={!!actionLoading[`${selectedSession.id}-close`]}
                disabled={selectedSession.status === "closed"}
                onClick={() => closeSession(selectedSession)}
              >
                Закрыть канал
              </Button>
            </Space>
          </div>
        ) : (
          <div className="text-muted">Нет выбранной сессии</div>
        )}
      </Card>

      <Card className="mt-3" size="small" title="Открытые сессии">
        <DataTable
          rowKey="id"
          data={sessions}
          columns={columns}
          loading={loading}
          emptyText="Нет открытых channel-сессий"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
          rowClassName={(session) => (session.id === selectedSession?.id ? "is-selected" : "")}
          onRow={(session) => ({
            onClick: () => setSelectedSessionId(session.id),
          })}
        />
      </Card>
    </div>
  );
}
