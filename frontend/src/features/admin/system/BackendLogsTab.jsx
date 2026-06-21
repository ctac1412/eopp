import { adminRequest } from "../shared/adminClient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Card, Collapse, Space } from "antd";
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

function formatJson(value) {
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function renderRuntimeItem(entityName, item, index) {
  if (entityName === "sse_queues") {
    const queueDetails = Array.isArray(item.queue_details) ? item.queue_details : [];
    return (
      <div className="tech-runtime-item" key={item.key || index}>
        <div className="tech-runtime-item__head">
          <span className="font-monospace">api key {item.api_key_id ?? item.key ?? "—"}</span>
          <span className="text-muted">{item.queues ?? queueDetails.length} queues</span>
        </div>
        <div className="tech-sse-queues">
          {queueDetails.length === 0 ? (
            <span className="text-muted small">No queue details</span>
          ) : (
            queueDetails.map((queue, queueIndex) => (
              <div className="tech-sse-queue" key={queue.queue_id || queueIndex}>
                <span className="font-monospace">#{queue.queue_id}</span>
                <span>depth {queue.depth ?? "—"}/{queue.maxsize ?? "—"}</span>
                <span>tasks {queue.unfinished_tasks ?? "—"}</span>
                <span>getters {queue.waiting_getters ?? 0}</span>
                <span>putters {queue.waiting_putters ?? 0}</span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="tech-runtime-item" key={item.key || index}>
      <div className="tech-runtime-item__head">
        <span className="font-monospace">{item.key || item.task_id || item.queue_id || index}</span>
        {item.type && <span className="text-muted">{item.type}</span>}
      </div>
      <pre>{item.text || formatJson(item)}</pre>
    </div>
  );
}

function normalizeLogError(message) {
  if (message === "log_file_not_found") return "Файл лога пока не создан";
  return message;
}

export function BackendLogsTab({ adminToken, onError }) {
  const [logs, setLogs] = useState({ lines: [], path: "", loadedAt: null });
  const [jobsOverview, setJobsOverview] = useState(null);
  const [runtimeState, setRuntimeState] = useState(null);
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

  const fetchRuntimeState = useCallback(async () => {
    if (!adminToken) return null;
    const res = await adminRequest("/admin/runtime-state?limit=50", {
      headers: adminHeadersJson(adminToken),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || `runtime HTTP ${res.status}`);
    return data;
  }, [adminToken]);

  const refreshAll = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setJobsLoading(true);
    try {
      const [healthResult, top3Result, jobsResult, logsResult, runtimeResult] = await Promise.allSettled([
        fetchHealth(),
        fetchTop3Pool(),
        fetchJobs(),
        fetchLogs(),
        fetchRuntimeState(),
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
      if (runtimeResult.status === "fulfilled") {
        setRuntimeState(runtimeResult.value);
      } else {
        setRuntimeState(null);
        onError?.(runtimeResult.reason?.message || "runtime state failed");
      }
    } finally {
      setLoading(false);
      setJobsLoading(false);
    }
  }, [adminToken, fetchHealth, fetchJobs, fetchLogs, fetchRuntimeState, fetchTop3Pool, onError]);

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
    const runtimeSummary = runtimeState?.summary || {};
    return [
      { key: "top3", label: "Top3 pool", value: top3Pool?.status || "—", tone: top3Pool?.status === "ok" ? "success" : top3Pool?.status === "unknown" ? "neutral" : "warning" },
      { key: "health", label: "Сервер", value: health?.status || "—", tone: health?.status === "ok" ? "success" : "danger" },
      { key: "pending", label: "Jobs ждут", value: pending, tone: pending > 0 ? "warning" : "success" },
      { key: "running", label: "В работе", value: running, tone: running > 0 ? "info" : "neutral" },
      { key: "dead", label: "Dead jobs", value: dead, tone: dead > 0 ? "danger" : "success" },
      { key: "outbox", label: "Outbox события", value: outboxEvents, tone: outboxEvents > 0 ? "neutral" : "success" },
      { key: "mem-pending", label: "Memory pending", value: runtimeSummary.pending_captchas ?? "—", tone: runtimeSummary.pending_captchas > 0 ? "warning" : "success" },
      { key: "mem-sse", label: "SSE queues", value: runtimeSummary.sse_queues ?? "—", tone: runtimeSummary.sse_queues > 0 ? "info" : "neutral" },
      { key: "mem-dist", label: "Distribution", value: runtimeSummary.distribution_states ?? "—", tone: runtimeSummary.distribution_states > 0 ? "info" : "neutral" },
      { key: "mem-callbacks", label: "Callbacks", value: runtimeSummary.rucaptcha_callbacks ?? "—", tone: runtimeSummary.rucaptcha_callbacks > 0 ? "warning" : "success" },
    ];
  }, [health, jobsOverview, runtimeState, top3Pool]);

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
  const runtimeEntities = runtimeState?.entities || [];
  const runtimeCollapseItems = runtimeEntities.map((entity) => ({
    key: entity.name,
    label: `${entity.label || entity.name} (${entity.count ?? 0})`,
    children: (
      <div className="tech-runtime-entity">
        {(entity.items || []).length === 0 ? (
          <div className="text-muted small">No in-memory entries</div>
        ) : (
          (entity.items || []).map((item, index) => renderRuntimeItem(entity.name, item, index))
        )}
      </div>
    ),
  }));

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
          <div className="tech-server-compact">
            <div className="tech-server-compact__item">
              <span>Health</span>
              <StatusTag status={health?.status === "ok" ? "confirmed" : "failed"} label={health?.status || "—"} />
            </div>
            <div className="tech-server-compact__item">
              <span>DB</span>
              <strong>{health?.db || "—"}</strong>
            </div>
            <div className="tech-server-compact__item">
              <span>Top3</span>
              <StatusTag
                status={top3Pool?.status === "ok" ? "confirmed" : top3Pool?.status === "unknown" ? "neutral" : "warning"}
                label={top3Pool?.status || "—"}
              />
            </div>
            <div className="tech-server-compact__item">
              <span>Workers</span>
              <strong>{top3Pool?.workers ?? "—"}</strong>
            </div>
            <div className="tech-server-compact__item">
              <span>Submitted</span>
              <strong>{top3Pool?.submitted ?? "—"}</strong>
            </div>
            <div className="tech-server-compact__item">
              <span>Errors</span>
              <strong className={top3Pool?.compute_errors ? "text-danger" : ""}>{top3Pool?.compute_errors ?? "—"}</strong>
            </div>
            <div className="tech-server-compact__wide">
              <span>DB path</span>
              <strong className="font-monospace tech-inline-path">{jobsOverview?.db_path || "—"}</strong>
            </div>
            <div className="tech-server-compact__wide">
              <span>Oldest due</span>
              <strong className="font-monospace">
                {oldestDue ? `#${oldestDue.id} ${oldestDue.job_name} · ${formatDateTime(oldestDue.created_at)}` : "—"}
              </strong>
            </div>
            <div className="tech-server-compact__wide">
              <span>Last Top3 error</span>
              <strong className={top3Pool?.last_error ? "text-danger" : "text-muted"}>{top3Pool?.last_error || "—"}</strong>
            </div>
          </div>
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
          expandable={{
            expandedRowRender: (job) => (
              <div className="tech-job-detail">
                <div className="tech-job-detail__meta">
                  <span>ID #{job.id}</span>
                  <span>{job.job_name}</span>
                  <span>{job.idempotency_key || "no idempotency key"}</span>
                  <span>created {formatDateTime(job.created_at)}</span>
                  <span>locked {formatDateTime(job.locked_at)}</span>
                  <span>completed {formatDateTime(job.completed_at)}</span>
                </div>
                {job.last_error && <pre className="tech-job-detail__error">{job.last_error}</pre>}
                <pre>{formatJson(job.payload)}</pre>
              </div>
            ),
            rowExpandable: () => true,
          }}
        />
      </Card>

      <Card
        data-eopp-component="TechStatusRuntimeCard"
        className="mt-3"
        size="small"
        title="Runtime memory entities"
        extra={
          <span className="small text-muted">
            {runtimeState?.loaded_at ? formatDateTime(runtimeState.loaded_at) : "not loaded"}
          </span>
        }
      >
        <Collapse
          size="small"
          ghost
          items={runtimeCollapseItems}
          className="tech-runtime-collapse"
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
