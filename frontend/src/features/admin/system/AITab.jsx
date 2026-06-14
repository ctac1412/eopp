import React, { useEffect, useMemo, useState } from "react";
import { Alert, Card, Checkbox, Space, Spin } from "antd";
import {
  Button,
  DataTable,
  FilterBar,
  MetricsStrip,
  SegmentedControl,
  SelectInput,
  StatusTag,
  TextInput,
  Toolbar,
} from "../../../ui";

function adminHeaders() {
  return { "Content-Type": "application/json" };
}

const CLASS_LABELS = { digit: "Цифры", puzzle: "Пазл", default: "Пазл", figures: "Фигуры", icon_click: "Иконки" };
const CLASS_STATUS = { digit: "warning", puzzle: "neutral", default: "neutral", figures: "online", icon_click: "pending" };

function fmt(value, digits = 2) {
  return typeof value === "number" ? value.toFixed(digits) : "—";
}

function fmtDate(value) {
  return value ? value.replace("T", " ").slice(0, 19) : "—";
}

function classTag(kind) {
  return <StatusTag status={CLASS_STATUS[kind] || "neutral"} label={CLASS_LABELS[kind] || kind || "—"} />;
}

function expectedKind(row) {
  if (row.ground_truth === "digit") return "digit";
  if (row.ground_truth === "figures") return "figures";
  return "default";
}

function solverLabel(run) {
  if (!run?.solver_top1_total) return "—";
  const percent = Math.round((run.solver_top1_hits / run.solver_top1_total) * 100);
  return `${run.solver_top1_hits}/${run.solver_top1_total} (${percent}%)`;
}

export function AITab({ adminToken }) {
  const [models, setModels] = useState([]);
  const [runs, setRuns] = useState([]);
  const [classifier, setClassifier] = useState("chain");
  const [checkSolver, setCheckSolver] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchModels = () => {
    fetch("/admin/ai/models", { headers: adminHeaders(adminToken) })
      .then((r) => r.json())
      .then((data) => {
        setModels(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0 && !selectedModel) {
          setSelectedModel(`${data[0].name}_v${data[0].version}`);
        }
      })
      .catch(() => {});
  };

  const fetchRuns = () => {
    fetch("/admin/ai/runs", { headers: adminHeaders(adminToken) })
      .then((r) => r.json())
      .then((data) => setRuns(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchModels();
    fetchRuns();
  }, [adminToken]);

  const doRun = async (body) => {
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const payload = { ...body };
      if (payload.classifier === "digits" && selectedModel) {
        const [name, ver] = selectedModel.split("_v");
        payload.model_name = name;
        payload.model_version = parseInt(ver, 10);
      }
      const res = await fetch("/admin/ai/classify", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResults(data);
      fetchRuns();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const filteredResults = useMemo(() => {
    if (!results) return [];
    const q = search.trim().toLowerCase();
    return (results.results || []).filter((row) => {
      if (filter === "digit" && row.kind !== "digit") return false;
      if (filter === "figures" && row.kind !== "figures") return false;
      if (filter === "puzzle" && row.kind !== "default") return false;
      if (filter === "changed" && row.kind === expectedKind(row)) return false;
      if (q && !row.captcha_id.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filter, results, search]);

  const latestRun = runs[0];
  const changedCount = useMemo(
    () => (results?.results || []).filter((row) => row.kind !== expectedKind(row)).length,
    [results],
  );

  const runMetrics = [
    { key: "models", label: "Модели", value: models.length, tone: models.length ? "success" : "neutral" },
    { key: "runs", label: "Прогоны", value: runs.length, tone: runs.length ? "info" : "neutral" },
    { key: "lastTotal", label: "Последний total", value: latestRun?.total ?? "—", tone: "neutral" },
    { key: "lastF1", label: "Последний F1", value: fmt(latestRun?.f1), tone: (latestRun?.f1 || 0) >= 0.8 ? "success" : "warning" },
    { key: "solver", label: "Solver", value: solverLabel(latestRun), tone: latestRun?.solver_top1_hits === latestRun?.solver_top1_total ? "success" : "warning" },
    { key: "speed", label: "Speed", value: latestRun?.speed_avg ? `${fmt(latestRun.speed_avg, 3)}s` : "—", tone: "info" },
  ];

  const resultMetrics = results ? [
    { key: "total", label: "Всего", value: results.total, tone: "neutral" },
    { key: "figures", label: "Фигуры", value: results.figure_count ?? 0, tone: "info" },
    { key: "digits", label: "Цифры", value: results.digit_count, tone: "warning" },
    { key: "puzzles", label: "Пазлы", value: results.puzzle_count, tone: "neutral" },
    { key: "changed", label: "Измененные", value: changedCount, tone: changedCount ? "warning" : "success" },
    { key: "speed", label: "Avg speed", value: `${results.speed?.avg ?? "—"}s`, tone: "info" },
  ] : [];

  const runColumns = [
    { title: "Модель", width: 140, render: (_, run) => <span className="font-monospace">{run.model_name} v{run.model_version}</span> },
    { title: "Total", dataIndex: "total", width: 70, align: "center" },
    { title: "Fig/Dig", width: 82, align: "center", render: (_, run) => `${run.figure_found ?? 0}/${run.digit_found ?? 0}` },
    { title: "TP/FP", width: 82, align: "center", render: (_, run) => `${run.true_positives ?? 0}/${run.false_positives ?? 0}` },
    { title: "FN/TN", width: 82, align: "center", render: (_, run) => `${run.false_negatives ?? 0}/${run.true_negatives ?? 0}` },
    { title: "Acc", dataIndex: "accuracy", width: 70, align: "center", render: (value) => fmt(value) },
    { title: "Prec", dataIndex: "precision", width: 70, align: "center", render: (value) => fmt(value) },
    { title: "Rec", dataIndex: "recall", width: 70, align: "center", render: (value) => fmt(value) },
    { title: "F1", dataIndex: "f1", width: 70, align: "center", render: (value) => fmt(value) },
    { title: "Solver", width: 110, align: "center", render: (_, run) => solverLabel(run) },
    { title: "Speed", dataIndex: "speed_avg", width: 82, align: "center", render: (value) => (value ? `${fmt(value, 3)}s` : "—") },
    { title: "Дата", dataIndex: "created_at", width: 140, render: fmtDate },
  ];

  const resultColumns = [
    {
      title: "Превью",
      width: 126,
      render: (_, row) => row.preview ? (
        <img
          data-eopp-component="AiResultPreview"
          className="ai-result-preview"
          src={`data:image/png;base64,${row.preview}`}
          alt="preview"
        />
      ) : "—",
    },
    { title: "Captcha ID", dataIndex: "captcha_id", ellipsis: true, render: (value) => <span className="font-monospace" title={value}>{value}</span> },
    { title: "Класс", dataIndex: "kind", width: 110, align: "center", render: classTag },
    { title: "GT", dataIndex: "ground_truth", width: 110, align: "center", render: classTag },
    { title: "Метод", width: 110, ellipsis: true, render: (_, row) => row.details?.classifier || row.details?.method || "—" },
    { title: "Conf", dataIndex: "confidence", width: 74, align: "center", render: (value) => fmt(value) },
    { title: "Тайлы", width: 74, align: "center", render: (_, row) => `${row.details?.tiles_with_digits ?? "—"}/${row.details?.total_tiles ?? "—"}` },
    {
      title: "Solver",
      width: 74,
      align: "center",
      render: (_, row) => row.solver_top1_match === true
        ? <StatusTag status="confirmed" label="top1" />
        : row.solver_top1_match === false
          ? <StatusTag status="failed" label="no" />
          : "—",
    },
    { title: "Время", dataIndex: "time_s", width: 78, align: "center", render: (value) => `${value}s` },
  ];

  return (
    <div data-eopp-component="AITab" className="ai-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">ИИ классификатор</h2>
            <div className="small text-muted">Прогоны моделей по архиву капч, сравнение классов и проверка solver top-1</div>
          </div>
        }
        right={<Button size="small" onClick={fetchRuns}>Обновить историю</Button>}
      />

      {error ? <Alert className="mb-3" type="error" showIcon message="Ошибка" description={error} /> : null}

      <MetricsStrip items={runMetrics} />

      <Card data-eopp-component="AiRunCard" className="mt-3" size="small" title="Запуск">
        <FilterBar>
          <label className="form-label small mb-0">
            Классификатор
            <SegmentedControl
              size="small"
              value={classifier}
              onChange={setClassifier}
              options={[
                { value: "chain", label: "Chain" },
                { value: "figures", label: "Фигуры" },
                { value: "digits", label: "Цифры" },
              ]}
            />
          </label>
          {classifier === "digits" ? (
            <label className="form-label small mb-0">
              Модель
              <SelectInput
                size="small"
                value={selectedModel}
                onChange={(value) => setSelectedModel(value || "")}
                options={models.map((model) => ({
                  value: `${model.name}_v${model.version}`,
                  label: `${model.name} v${model.version}`,
                }))}
                style={{ minWidth: 190 }}
              />
            </label>
          ) : null}
          <Checkbox
            data-eopp-component="AiCheckSolverCheckbox"
            className="ai-check-solver"
            checked={checkSolver}
            onChange={(event) => setCheckSolver(event.target.checked)}
          >
            Проверить резолвер
          </Checkbox>
          <Button size="small" variant="primary" onClick={() => doRun({ classifier, check_solver: checkSolver })} disabled={running}>
            {running ? <><Spin size="small" /> Прогон...</> : "Прогнать"}
          </Button>
          <Button size="small" onClick={() => { setClassifier("figures"); setCheckSolver(true); doRun({ classifier: "figures", check_solver: true, gt_only: "figures" }); }} disabled={running}>
            Тест фигур
          </Button>
          <Button size="small" onClick={() => { setClassifier("digit"); setCheckSolver(true); doRun({ classifier: "digit", check_solver: true, gt_only: "digit" }); }} disabled={running}>
            Тест цифр
          </Button>
        </FilterBar>
      </Card>

      <Card data-eopp-component="AiRunsCard" className="mt-3" size="small" title="История прогонов">
        <DataTable
          className="ai-runs-table"
          rowKey="id"
          data={runs}
          columns={runColumns}
          emptyText="Нет прогонов"
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
          scroll={false}
        />
      </Card>

      {results ? (
        <Card data-eopp-component="AiResultsCard" className="mt-3" size="small" title="Результаты текущего прогона">
          <MetricsStrip items={resultMetrics} />
          {results.stats ? (
            <div data-eopp-component="AiStatsLine" className="ai-stats-line">
              <StatusTag status="confirmed" label={`TP ${results.stats.tp}`} />
              <StatusTag status="failed" label={`FP ${results.stats.fp}`} />
              <StatusTag status="failed" label={`FN ${results.stats.fn}`} />
              <StatusTag status="confirmed" label={`TN ${results.stats.tn}`} />
              <span className="text-muted small">
                acc={results.stats.accuracy} prec={results.stats.precision} rec={results.stats.recall} f1={results.stats.f1}
              </span>
            </div>
          ) : null}
          <FilterBar className="my-3">
            <label className="form-label small mb-0">
              Фильтр
              <SegmentedControl
                size="small"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "Все" },
                  { value: "figures", label: "Фигуры" },
                  { value: "digit", label: "Цифры" },
                  { value: "puzzle", label: "Пазлы" },
                  { value: "changed", label: `Изм. ${changedCount}` },
                ]}
              />
            </label>
            <label className="form-label small mb-0 ai-results-search">
              Поиск
              <TextInput size="small" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Captcha ID" />
            </label>
          </FilterBar>
          <DataTable
            className="ai-results-table"
            rowKey="captcha_id"
            data={filteredResults}
            columns={resultColumns}
            rowClassName={(row) => (row.kind !== expectedKind(row) ? "ai-result-row--changed" : "")}
            emptyText="Нет результатов"
            pagination={{ pageSize: 25, showSizeChanger: true, pageSizeOptions: [10, 25, 50, 100] }}
            scroll={false}
          />
        </Card>
      ) : !running && !error ? (
        <Card data-eopp-component="AiEmptyCard" className="mt-3" size="small">
          <div className="text-center text-muted py-5">Выбери модель и нажми «Прогнать»</div>
        </Card>
      ) : null}
    </div>
  );
}
