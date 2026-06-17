import { adminRequest } from "../shared/adminClient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Card, Descriptions, Space } from "antd";
import {
  Button,
  DataTable,
  FilterBar,
  MetricsStrip,
  SelectInput,
  StatusTag,
  Toolbar,
} from "../../../ui";

const JOB_STATUS_OPTIONS = [
  { value: "all", label: "Все" },
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "done", label: "Done" },
  { value: "dead", label: "Dead" },
];

const JOB_LIMIT_OPTIONS = [
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 200, label: "200" },
  { value: 500, label: "500" },
];

const JOB_STATUS_TONE = {
  pending: "processing",
  running: "warning",
  done: "success",
  dead: "error",
};

const JOB_STATUS_LABEL = {
  pending: "Ожидает",
  running: "В работе",
  done: "Готово",
  dead: "Dead",
};

const OUTBOX_STATUS_TONE = {
  pending: "default",
  published: "success",
};

const OUTBOX_STATUS_LABEL = {
  pending: "В журнале",
  published: "Опубликовано",
};

function adminHeadersJson() {
  return {};
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function sumCounts(items = [], predicate = () => true) {
  return items.reduce((total, item) => total + (predicate(item) ? Number(item.count || 0) : 0), 0);
}

function compactPayload(payload) {
  if (!payload || Object.keys(payload).length === 0) return "—";
  const text = JSON.stringify(payload);
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function normalizeLogError(message) {
  if (message === "log_file_not_found") return "Файл лога пока не создан";
  return message;
}

export function BackendLogsTab({ adminToken, onError }) {
  const [logs, setLogs] = useState({ lines: [], path: "", loadedAt: null });
  const [jobsOverview, setJobsOverview] = useState(null);
  const [health, setHealth] = useState(null);
  const [top3Pool, setTop3Pool] = useState(null);
  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [jobNameFilter, setJobNameFilter] = useState("");
  const [limit, setLimit] = useState(100);

  const fetchHealth = useCallback(async () => {
    const res = await adminRequest("/health");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || `health HTTP ${res.status}`);
    return data;
  }, []);

  const fetchTop3Pool = useCallback(async () => {
    const res = await adminRequest("/top3-pool-status");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || `top3 HTTP ${res.status}`);
    return data;
  }, []);

  const fetchJobs = useCallback(async () => {
    if (!adminToken) return null;
    const params = new URLSearchParams({ limit: String(limit) });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (jobNameFilter.trim()) params.set("job_name", jobNameFilter.trim());
    const res = await adminRequest(`/admin/jobs?${params.toString()}`, {
      headers: adminHeadersJson(adminToken),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || `jobs HTTP ${res.status}`);
    return data;
  }, [adminToken, jobNameFilter, limit, statusFilter]);

  const fetchLogs = useCallback(async () => {
    if (!adminToken) return null;
    const res = await adminRequest("/admin/backend-logs?lines=300", {
      headers: adminHeadersJson(adminToken),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || `logs HTTP ${res.status}`);
    return {
      lines: Array.isArray(data.lines) ? data.lines : [],
      path: data.path || "",
      loadedAt: new Date(),
    };
  }, [adminToken]);

  const refreshAll = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setJobsLoading(true);
    try {
      const [healthResult, top3Result, jobsResult, logsResult] = await Promise.allSettled([
        fetchHealth(),
        fetchTop3Pool(),
        fetchJobs(),
        fetchLogs(),
      ]);
      if (healthResult.status === "fulfilled") {
        setHealth(healthResult.value);
      } else {
        setHealth({ status: "degraded", db: "unknown" });
        onError?.(healthResult.reason?.message || "health check failed");
      }
      if (top3Result.status === "fulfilled") {
        setTop3Pool(top3Result.value);
      } else {
        setTop3Pool({ status: "unknown", started: false });
        onError?.(top3Result.reason?.message || "top3 pool status failed");
      }
      if (jobsResult.status === "fulfilled") {
        setJobsOverview(jobsResult.value);
      } else {
        setJobsOverview(null);
        onError?.(jobsResult.reason?.message || "jobs overview failed");
      }
      if (logsResult.status === "fulfilled") {
        setLogs(logsResult.value || { lines: [], path: "", loadedAt: new Date() });
      } else {
        setLogs({
          lines: [],
          path: "data/backend.log",
          loadedAt: new Date(),
          error: normalizeLogError(logsResult.reason?.message || "log unavailable"),
        });
      }
    } finally {
      setLoading(false);
      setJobsLoading(false);
    }
  }, [adminToken, fetchHealth, fetchJobs, fetchLogs, fetchTop3Pool, onError]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const runDueJobs = async () => {
    if (!adminToken) return;
    setRunLoading(true);
    setRunResult(null);
    try {
      const res = await adminRequest("/admin/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_jobs: 50, max_attempts: 3, retry_delay_seconds: 30 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.detail || `run HTTP ${res.status}`);
      setRunResult(data);
      await refreshAll();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setRunLoading(false);
    }
  };

  const jobNameOptions = useMemo(() => {
    const names = new Set((jobsOverview?.jobs_by_status || []).map((item) => item.name).filter(Boolean));
    return [...names].sort().map((name) => ({ value: name, label: name }));
  }, [jobsOverview]);

  const metrics = useMemo(() => {
    const jobCounts = jobsOverview?.jobs_by_status || [];
    const outboxCounts = jobsOverview?.outbox_by_status || [];
    const pending = sumCounts(jobCounts, (item) => item.status === "pending");
    const dead = sumCounts(jobCounts, (item) => item.status === "dead");
    const running = sumCounts(jobCounts, (item) => item.status === "running");
    const outboxEvents = sumCounts(outboxCounts);
    return [
      { key: "top3", label: "Top3 pool", value: top3Pool?.status || "—", tone: top3Pool?.status === "ok" ? "success" : top3Pool?.status === "unknown" ? "neutral" : "warning" },
      { key: "health", label: "Сервер", value: health?.status || "—", tone: health?.status === "ok" ? "success" : "danger" },
      { key: "pending", label: "Jobs ждут", value: pending, tone: pending > 0 ? "warning" : "success" },
      { key: "running", label: "В работе", value: running, tone: running > 0 ? "info" : "neutral" },
      { key: "dead", label: "Dead jobs", value: dead, tone: dead > 0 ? "danger" : "success" },
      { key: "outbox", label: "Outbox события", value: outboxEvents, tone: outboxEvents > 0 ? "neutral" : "success" },
    ];
  }, [health, jobsOverview, top3Pool]);

  const jobsColumns = [
    {
      title: "ID",
      dataIndex: "id",
      width: 70,
      render: (value) => <span className="text-muted">#{value}</span>,
    },
    {
      title: "Задача",
      dataIndex: "job_name",
      width: 220,
      ellipsis: true,
      render: (value) => <span className="font-monospace">{value}</span>,
    },
    {
      title: "Статус",
      dataIndex: "status",
      width: 110,
      align: "center",
      render: (value) => <StatusTag status={value} color={JOB_STATUS_TONE[value]} label={JOB_STATUS_LABEL[value] || value || "—"} />,
    },
    {
      title: "Попытки",
      dataIndex: "attempts",
      width: 90,
      align: "center",
    },
    {
      title: "След. retry",
      dataIndex: "next_retry_at",
      width: 150,
      render: formatDateTime,
    },
    {
      title: "Обновлено",
      dataIndex: "updated_at",
      width: 150,
      render: formatDateTime,
    },
    {
      title: "Payload",
      dataIndex: "payload",
      width: 260,
      ellipsis: true,
      render: (value) => (
        <span className="font-monospace tech-payload-cell" title={compactPayload(value)}>
          {compactPayload(value)}
        </span>
      ),
    },
    {
      title: "Ошибка",
      dataIndex: "last_error",
      width: 260,
      ellipsis: true,
      render: (value) => (
        <span className={value ? "text-danger" : "text-muted"} title={value || "—"}>
          {value || "—"}
        </span>
      ),
    },
  ];

  const groupedColumns = [
    {
      title: "Статус",
      dataIndex: "status",
      width: 100,
      render: (value) => (
        <StatusTag
          status={value}
          color={OUTBOX_STATUS_TONE[value]}
          label={OUTBOX_STATUS_LABEL[value] || value || "—"}
        />
      ),
    },
    {
      title: "Событие",
      dataIndex: "name",
      ellipsis: true,
      render: (value) => <span className="font-monospace">{value}</span>,
    },
    {
      title: "Кол-во",
      dataIndex: "count",
      width: 90,
      align: "right",
    },
  ];

  const jobs = jobsOverview?.jobs || [];
  const oldestDue = jobsOverview?.oldest_due_job;

  return (
    <div data-eopp-component="TechStatusTab" className="tech-status-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Техническое состояние</h2>
            <div className="small text-muted">
              Очереди jobs, outbox, health и tail backend logs
            </div>
          </div>
        }
        right={
          <Space wrap>
            <Button size="small" onClick={refreshAll} loading={loading}>
              Обновить
            </Button>
            <Button size="small" variant="primary" onClick={runDueJobs} loading={runLoading}>
              Запустить due jobs
            </Button>
          </Space>
        }
      />

      <MetricsStrip items={metrics} />

      {runResult && (
        <Alert
          data-eopp-component="TechStatusRunResult"
          className="my-3"
          type={runResult.dead_lettered > 0 || runResult.failed > 0 ? "warning" : "success"}
          showIcon
          message={`Worker pass: processed ${runResult.processed}, succeeded ${runResult.succeeded}, failed ${runResult.failed}, dead ${runResult.dead_lettered}, missing handler ${runResult.missing_handler}`}
        />
      )}

      <div className="tech-status-grid">
        <Card data-eopp-component="TechStatusHealthCard" size="small" title="Сервер">
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="Health">
              <StatusTag status={health?.status === "ok" ? "confirmed" : "failed"} label={health?.status || "—"} />
            </Descriptions.Item>
            <Descriptions.Item label="DB">{health?.db || "—"}</Descriptions.Item>
            <Descriptions.Item label="Top3 pool">
              <StatusTag
                status={top3Pool?.status === "ok" ? "confirmed" : top3Pool?.status === "unknown" ? "neutral" : "warning"}
                label={top3Pool?.status || "—"}
              />
            </Descriptions.Item>
            <Descriptions.Item label="Top3 workers">{top3Pool?.workers ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Top3 submitted">{top3Pool?.submitted ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Top3 errors">{top3Pool?.compute_errors ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Top3 empty">{top3Pool?.empty_returns ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Top3 last error">
              <span className={top3Pool?.last_error ? "text-danger" : "text-muted"}>
                {top3Pool?.last_error || "—"}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="DB path">
              <span className="font-monospace tech-inline-path">{jobsOverview?.db_path || "—"}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Самая старая due">
              {oldestDue ? (
                <span className="font-monospace">
                  #{oldestDue.id} {oldestDue.job_name} · {formatDateTime(oldestDue.created_at)}
                </span>
              ) : (
                "—"
              )}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card data-eopp-component="TechStatusOutboxCard" size="small" title="Outbox: журнал событий">
          <DataTable
            rowKey={(row) => `${row.status}-${row.name}`}
            data={jobsOverview?.outbox_by_status || []}
            columns={groupedColumns}
            pagination={false}
            emptyText="Outbox пуст"
            scroll={false}
          />
          <div className="tech-status-note">
            Outbox хранит события очереди jobs: постановку, retry, завершение и dead-letter. Кнопка запускает только due background jobs.
          </div>
        </Card>
      </div>

      <Card data-eopp-component="TechStatusJobsCard" className="mt-3" size="small" title="Фоновые задачи">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0">
            Статус
            <SelectInput
              size="small"
              value={statusFilter}
              onChange={(value) => setStatusFilter(value || "all")}
              options={JOB_STATUS_OPTIONS}
              style={{ minWidth: 140 }}
            />
          </label>
          <label className="form-label small mb-0">
            Задача
            <SelectInput
              size="small"
              value={jobNameFilter || undefined}
              onChange={(value) => setJobNameFilter(value || "")}
              options={jobNameOptions}
              placeholder="Все job_name"
              style={{ minWidth: 260 }}
            />
          </label>
          <label className="form-label small mb-0">
            Limit
            <SelectInput
              size="small"
              value={limit}
              onChange={(value) => setLimit(value || 100)}
              options={JOB_LIMIT_OPTIONS}
              allowClear={false}
              style={{ minWidth: 100 }}
            />
          </label>
          <Button size="small" onClick={refreshAll} loading={jobsLoading}>
            Применить
          </Button>
        </FilterBar>

        <DataTable
          className="tech-jobs-table"
          rowKey="id"
          data={jobs}
          columns={jobsColumns}
          loading={jobsLoading}
          emptyText="Очередь пуста"
          pagination
        />
      </Card>

      <Card
        data-eopp-component="TechStatusLogsCard"
        className="mt-3"
        size="small"
        title="Backend logs"
        extra={
          <span className="small text-muted">
            {logs.path || "data/backend.log"}
            {logs.loadedAt ? ` · ${logs.loadedAt.toLocaleTimeString("ru-RU")}` : ""}
          </span>
        }
      >
        <div data-eopp-component="TechStatusLogsBody" className="tech-log-viewer">
          {logs.lines.length === 0 ? (
            <div className="p-3 text-muted">{loading ? "Загрузка..." : logs.error || "Лог пуст или недоступен"}</div>
          ) : (
            <div className="p-2">
              {logs.lines.map((line, index) => (
                <div key={`${index}-${line}`} className="tech-log-line">
                  <span className="text-secondary me-2">{String(index + 1).padStart(3, "0")}</span>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
