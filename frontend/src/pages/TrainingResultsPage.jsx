import React, { useEffect, useMemo, useState } from "react";
import { Alert, Card, Spin } from "antd";
import { useNavigate, useParams } from "react-router-dom";
import { Button, DataTable, MetricsStrip, StatusTag, Toolbar } from "../ui";

const API = "";

function formatMs(ms) {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(2)}с`;
}

function getResultStatus(status) {
  if (status === "correct") return "confirmed";
  if (status === "incorrect") return "failed";
  if (status === "timeout") return "warning";
  return "neutral";
}

function getResultStatusLabel(status) {
  if (status === "correct") return "Верно";
  if (status === "incorrect") return "Ошибка";
  if (status === "timeout") return "Таймаут";
  return status || "—";
}

export default function TrainingResultsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const runId = Number.parseInt(id, 10);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/training/run/${runId}/results`)
      .then((response) => response.json())
      .then((nextData) => {
        setData(nextData);
        setLoading(false);
      })
      .catch(() => {
        setError("Ошибка загрузки");
        setLoading(false);
      });
  }, [runId]);

  const { test_run: testRun, course, stats, results = [] } = data || {};
  const accuracy = stats?.total > 0 ? `${Math.round((stats.correct / stats.total) * 100)}%` : "—";
  const duration = testRun?.started_at && testRun?.completed_at
    ? formatMs(new Date(testRun.completed_at) - new Date(testRun.started_at))
    : "—";

  const metrics = useMemo(() => ([
    { key: "total", label: "Всего капч", value: stats?.total ?? "—", tone: "info" },
    { key: "correct", label: "Правильно", value: stats?.correct ?? "—", tone: "success" },
    { key: "incorrect", label: "Ошибок", value: stats?.incorrect ?? "—", tone: "danger" },
    { key: "timeout", label: "Таймаутов", value: stats?.timeout ?? 0, tone: "warning" },
    { key: "accuracy", label: "Точность", value: accuracy, tone: "success" },
    { key: "avg", label: "Среднее время", value: formatMs(stats?.avg_duration_ms), tone: "neutral" },
    { key: "avgIcon", label: "Средняя иконка", value: formatMs(stats?.avg_icon_ms), tone: "neutral" },
    { key: "duration", label: "Длительность", value: duration, tone: "neutral" },
  ]), [accuracy, duration, stats]);

  const columns = [
    {
      title: "#",
      width: 52,
      align: "center",
      render: (_, __, index) => index + 1,
    },
    {
      title: "Captcha ID",
      dataIndex: "captcha_id",
      ellipsis: true,
      render: (value) => (
        <span className="training-results__captcha-id" title={value || "—"}>
          {value ? `${value.slice(0, 12)}...` : "—"}
        </span>
      ),
    },
    {
      title: "Тип",
      dataIndex: "captcha_type",
      width: 112,
      align: "center",
      render: (value) => (
        <StatusTag status="neutral" label={value === 1 ? "Иконки" : "Пазл"} />
      ),
    },
    {
      title: "Статус",
      dataIndex: "status",
      width: 120,
      align: "center",
      render: (value) => (
        <StatusTag status={getResultStatus(value)} label={getResultStatusLabel(value)} />
      ),
    },
    {
      title: "Вариант",
      width: 130,
      render: (_, row) => {
        if (row.variant_index == null) return "—";
        const hasMismatch = row.valid_index != null && row.variant_index !== row.valid_index;
        return (
          <span className="training-results__variant">
            #{row.variant_index}
            {hasMismatch && <span>верно #{row.valid_index}</span>}
          </span>
        );
      },
    },
    {
      title: "Время",
      dataIndex: "duration_ms",
      width: 90,
      align: "right",
      render: formatMs,
    },
    {
      title: "Иконки",
      dataIndex: "icon_times",
      width: 260,
      render: (iconTimes = []) => {
        if (!iconTimes.length) return <span className="text-muted">—</span>;
        return (
          <div className="training-results__icon-times">
            {iconTimes.map((iconTime, index) => (
              <span key={`${iconTime.icon_position ?? index}-${index}`}>
                {iconTime.icon_position != null ? `ик${iconTime.icon_position + 1}: ` : ""}
                {formatMs(iconTime.duration_ms)}
              </span>
            ))}
          </div>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div data-eopp-component="TrainingResultsPage" className="training-results-page training-results-page--center">
        <Spin />
      </div>
    );
  }

  if (error) {
    return (
      <div data-eopp-component="TrainingResultsPage" className="training-results-page">
        <Alert type="error" showIcon message={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <div data-eopp-component="TrainingResultsPage" className="training-results-page">
        <Alert type="info" showIcon message="Нет данных" />
      </div>
    );
  }

  return (
    <div data-eopp-component="TrainingResultsPage" className="training-results-page">
      <Toolbar
        className="training-results__toolbar"
        left={
          <Button size="small" onClick={() => navigate("/training")}>
            Назад к обучению
          </Button>
        }
        right={
          <>
            <Button size="small" onClick={() => navigate(`/training/run/${runId}/review`)}>
              Отсмотр капч
            </Button>
            <Button size="small" variant="primary" onClick={() => navigate("/training")}>
              Новый прогон
            </Button>
            <Button size="small" onClick={() => navigate(`/training/run/${runId}`)}>
              Перепройти
            </Button>
          </>
        }
      />

      <Card
        data-eopp-component="TrainingResultsSummaryCard"
        className="training-results__summary"
        size="small"
        title={`Результаты прогона #${runId}`}
        extra={<StatusTag status="neutral" label={testRun?.status || "—"} />}
      >
        <div className="training-results__course">
          Курс: <strong>{course?.name || "?"}</strong>
        </div>
        <MetricsStrip items={metrics} />
      </Card>

      <Card
        data-eopp-component="TrainingResultsDetailsCard"
        size="small"
        title="Детали по капчам"
      >
        <DataTable
          data-eopp-component="TrainingResultsTable"
          className="training-results__table"
          rowKey={(row) => row.id}
          data={results}
          columns={columns}
          emptyText="Нет результатов"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
          scroll={{ x: 860 }}
        />
      </Card>
    </div>
  );
}
