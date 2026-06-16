import React, { useMemo } from "react";
import { Alert, Card, Descriptions, Space } from "antd";
import {
  Button,
  DataTable,
  MetricsStrip,
  StatusTag,
  Toolbar,
} from "../../../ui";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function coverageTone(value) {
  if (value >= 90) return "success";
  if (value >= 70) return "warning";
  return "danger";
}

function percent(value) {
  return Number.isFinite(Number(value)) ? `${value}%` : "—";
}

export function TestBenchmarkTab({
  testStats,
  testStatsLoading,
  benchmark,
  benchmarkLoading,
  benchmarkRunning,
  onRunBenchmark,
  adminToken,
}) {
  const statsTotal = (testStats?.labeled_count || 0) + (testStats?.unlabeled_count || 0);
  const labeledPercent = statsTotal > 0 ? Math.round((testStats.labeled_count / statsTotal) * 100) : 0;
  const benchmarkHasData = benchmark && !benchmark.error;

  const metrics = useMemo(() => {
    const items = [
      {
        key: "labeled",
        label: "Размечены",
        value: testStats?.labeled_count ?? "—",
        tone: (testStats?.labeled_count || 0) > 0 ? "success" : "neutral",
      },
      {
        key: "unlabeled",
        label: "Без метки",
        value: testStats?.unlabeled_count ?? "—",
        tone: (testStats?.unlabeled_count || 0) > 0 ? "warning" : "success",
      },
      {
        key: "coverage-labels",
        label: "Разметка",
        value: statsTotal > 0 ? `${labeledPercent}%` : "—",
        tone: labeledPercent >= 90 ? "success" : labeledPercent >= 60 ? "warning" : "neutral",
      },
    ];
    if (benchmark) {
      items.push(
        {
          key: "bench-total",
          label: "Benchmark tests",
          value: benchmark.total ?? "—",
          tone: "neutral",
        },
        {
          key: "bench-passed",
          label: "Прошло",
          value: benchmark.passed ?? "—",
          tone: benchmarkHasData ? "success" : "neutral",
        },
        {
          key: "bench-coverage",
          label: "Покрытие",
          value: percent(benchmark.coverage_percent),
          tone: coverageTone(Number(benchmark.coverage_percent || 0)),
        },
      );
    }
    return items;
  }, [benchmark, benchmarkHasData, labeledPercent, statsTotal, testStats]);

  const bestConfigRows = useMemo(() => {
    if (!benchmark?.best_config) return [];
    return Object.entries(benchmark.best_config).map(([name, value]) => ({
      name,
      value,
    }));
  }, [benchmark]);

  const skippedRows = useMemo(
    () => (benchmark?.skipped || []).map((name, index) => ({ id: index + 1, name })),
    [benchmark],
  );

  const bestConfigColumns = [
    {
      title: "Параметр",
      dataIndex: "name",
      width: 160,
      render: (value) => <span className="font-monospace">{value}</span>,
    },
    {
      title: "Значение",
      dataIndex: "value",
      render: (value) => <span className="font-monospace">{String(value)}</span>,
    },
  ];

  const skippedColumns = [
    {
      title: "#",
      dataIndex: "id",
      width: 70,
      align: "center",
    },
    {
      title: "Файл",
      dataIndex: "name",
      ellipsis: true,
      render: (value) => <span className="font-monospace">{value}</span>,
    },
  ];

  return (
    <div data-eopp-component="TestBenchmarkTab" className="testbench-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Тесты и benchmark</h2>
            <div className="small text-muted">
              Разметка captcha fixtures и качество текущей конфигурации решателя
            </div>
          </div>
        }
        right={
          <Space wrap>
            <StatusTag
              status={benchmarkRunning ? "pending" : "neutral"}
              label={benchmarkRunning ? "benchmark running" : "ready"}
            />
            <Button
              variant="primary"
              size="small"
              onClick={() => onRunBenchmark(adminToken)}
              loading={benchmarkRunning}
              disabled={benchmarkRunning}
            >
              Запустить benchmark
            </Button>
          </Space>
        }
      />

      <MetricsStrip items={metrics} />

      {testStatsLoading && !testStats && (
        <Alert className="mt-3" type="info" showIcon message="Загружаем статистику тесткейсов" />
      )}

      {benchmarkLoading && !benchmark && (
        <Alert className="mt-3" type="info" showIcon message="Benchmark выполняется, это может занять время" />
      )}

      {benchmark?.error && (
        <Alert
          data-eopp-component="BenchmarkError"
          className="mt-3"
          type="error"
          showIcon
          message="Benchmark завершился с ошибкой"
          description={<pre className="testbench-error">{benchmark.error}</pre>}
        />
      )}

      <div className="testbench-grid mt-3">
        <Card data-eopp-component="TestCasesCard" size="small" title="Тесткейсы">
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="Всего файлов">{statsTotal || "—"}</Descriptions.Item>
            <Descriptions.Item label="Размечены">{testStats?.labeled_count ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Без метки">{testStats?.unlabeled_count ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Доля разметки">
              <StatusTag
                status={labeledPercent >= 90 ? "confirmed" : "warning"}
                label={statsTotal > 0 ? `${labeledPercent}%` : "—"}
              />
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card data-eopp-component="BenchmarkSummaryCard" size="small" title="Benchmark решателя">
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="Последний запуск">
              {formatDate(benchmark?.last_run_timestamp)}
            </Descriptions.Item>
            <Descriptions.Item label="Всего тестов">{benchmark?.total ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Прошло">{benchmark?.passed ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Покрытие">
              <StatusTag
                status={coverageTone(Number(benchmark?.coverage_percent || 0))}
                label={percent(benchmark?.coverage_percent)}
              />
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </div>

      <Card data-eopp-component="BestBenchmarkConfigCard" className="mt-3" size="small" title="Лучший конфиг">
        <DataTable
          rowKey="name"
          data={bestConfigRows}
          columns={bestConfigColumns}
          emptyText={benchmark ? "Лучший конфиг не найден" : "Benchmark ещё не запускался"}
          pagination={false}
          scroll={false}
        />
      </Card>

      <Card data-eopp-component="SkippedBenchmarkFilesCard" className="mt-3" size="small" title="Пропущенные файлы">
        <DataTable
          rowKey="id"
          data={skippedRows}
          columns={skippedColumns}
          emptyText="Нет пропущенных файлов"
          pagination
        />
      </Card>
    </div>
  );
}
