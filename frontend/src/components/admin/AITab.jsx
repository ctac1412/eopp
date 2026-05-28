import React, { useState, useEffect } from "react";

function adminHeaders(token) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

const CLASS_LABELS = { digit: "Цифры", puzzle: "Пазл", default: "Пазл", figures: "Фигуры", icon_click: "Иконки" };
const CLASS_BADGES = { digit: "bg-warning text-dark", puzzle: "bg-secondary", default: "bg-secondary", figures: "bg-info text-dark", icon_click: "bg-purple text-white" };

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
        setModels(data);
        if (data.length > 0 && !selectedModel) {
          setSelectedModel(`${data[0].name}_v${data[0].version}`);
        }
      })
      .catch(() => {});
  };

  const fetchRuns = () => {
    fetch("/admin/ai/runs", { headers: adminHeaders(adminToken) })
      .then((r) => r.json())
      .then(setRuns)
      .catch(() => {});
  };

  useEffect(() => {
    fetchModels();
    fetchRuns();
  }, [adminToken]);

  const runClassify = async () => {
    await doRun({ classifier, check_solver: checkSolver });
  };

  const runClassifyWith = async (body) => {
    await doRun(body);
  };

  const doRun = async (body) => {
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      if (body.classifier === "digits" && selectedModel) {
        const [name, ver] = selectedModel.split("_v");
        body.model_name = name;
        body.model_version = parseInt(ver);
      }
      const res = await fetch("/admin/ai/classify", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
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

  const filtered = results
    ? results.results.filter((r) => {
        if (filter === "digit" && r.kind !== "digit") return false;
        if (filter === "figures" && r.kind !== "figures") return false;
        if (filter === "puzzle" && r.kind !== "default") return false;
        if (filter === "changed") {
          const expectedKind = r.ground_truth === "digit" ? "digit" :
                               r.ground_truth === "figures" ? "figures" : "default";
          if (r.kind === expectedKind) return false;
        }
        if (search && !r.captcha_id.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
    : [];

  return (
    <div>
      <div className="d-flex gap-2 align-items-end mb-3 flex-wrap">
        <div>
          <label className="form-label small mb-1">Классификатор</label>
          <div className="btn-group btn-group-sm">
            {[
              { id: "chain", label: "Chain" },
              { id: "figures", label: "Фигуры" },
              { id: "digits", label: "Цифры" },
            ].map((c) => (
              <button
                key={c.id}
                className={`btn ${classifier === c.id ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setClassifier(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {classifier === "digits" && (
          <div>
            <label className="form-label small mb-1">Модель</label>
            <select
              className="form-select form-select-sm"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{ width: 200 }}
            >
              {models.map((m) => (
                <option key={`${m.name}_v${m.version}`} value={`${m.name}_v${m.version}`}>
                  {m.name} v{m.version}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="btn btn-sm btn-primary" onClick={runClassify} disabled={running}>
          {running ? <><span className="spinner-border spinner-border-sm me-1" />Прогон...</> : "Прогнать"}
        </button>
        <div className="form-check mb-1 ms-2">
          <input className="form-check-input" type="checkbox" id="checkSolver"
            checked={checkSolver} onChange={(e) => setCheckSolver(e.target.checked)} />
          <label className="form-check-label small" htmlFor="checkSolver">Проверить резолвер</label>
        </div>

        <div className="vr mx-1"></div>
        <span className="small text-muted me-1">Тест резолвера:</span>
        {[
          { id: "figures", label: "Фигуры", cls: "btn-info" },
          { id: "digit", label: "Цифры", cls: "btn-warning" },
        ].map((t) => (
          <button
            key={t.id}
            className={`btn btn-sm btn-outline-secondary`}
            onClick={() => {
              setClassifier(t.id);
              setCheckSolver(true);
              runClassifyWith({ classifier: t.id, check_solver: true, gt_only: t.id });
            }}
            disabled={running}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-danger py-1 px-2 small">{error}</div>}

      {runs.length > 0 && (
        <details className="mb-3" open>
          <summary className="fw-semibold small mb-2" style={{ cursor: "pointer" }}>
            История прогонов ({runs.length})
          </summary>
          <div className="table-responsive">
            <table className="table table-sm table-bordered align-middle mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Модель</th>
                  <th>Total</th>
                  <th>Fig</th>
                  <th>Dig</th>
                  <th>TP</th>
                  <th>FP</th>
                  <th>FN</th>
                  <th>TN</th>
                  <th>Acc</th>
                  <th>Prec</th>
                  <th>Rec</th>
                  <th>F1</th>
                  <th>Solver</th>
                  <th>Speed</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="font-monospace">{r.model_name} v{r.model_version}</td>
                    <td>{r.total}</td>
                    <td>{r.figure_found ?? 0}</td>
                    <td>{r.digit_found}</td>
                    <td className="text-success">{r.true_positives}</td>
                    <td className="text-danger">{r.false_positives}</td>
                    <td className="text-danger">{r.false_negatives}</td>
                    <td className="text-success">{r.true_negatives}</td>
                    <td>{r.accuracy?.toFixed(2)}</td>
                    <td>{r.precision?.toFixed(2)}</td>
                    <td>{r.recall?.toFixed(2)}</td>
                    <td>{r.f1?.toFixed(2)}</td>
                    <td>{r.solver_top1_total > 0
                      ? <span className={r.solver_top1_hits === r.solver_top1_total ? "text-success" : "text-warning"}>
                          {r.solver_top1_hits}/{r.solver_top1_total} ({Math.round(r.solver_top1_hits/r.solver_top1_total*100)}%)
                        </span>
                      : "—"}</td>
                    <td>{r.speed_avg?.toFixed(3)}s</td>
                    <td className="text-muted">{r.created_at?.replace("T", " ").slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {results && (
        <>
          <div className="d-flex gap-2 mb-2 flex-wrap align-items-center">
            <span className="badge text-bg-secondary">Всего: {results.total}</span>
            <span className="badge text-bg-info">Фигуры: {results.figure_count ?? 0}</span>
            <span className="badge text-bg-warning">Цифры: {results.digit_count}</span>
            <span className="badge text-bg-secondary">Пазлы: {results.puzzle_count}</span>
            <span className="text-muted small">
              Скорость: avg={results.speed.avg}s median={results.speed.median}s
            </span>
          </div>

          {results.stats && (
            <div className="row g-2 mb-2">
              <div className="col-auto">
                <span className="badge bg-success">TP: {results.stats.tp}</span>
              </div>
              <div className="col-auto">
                <span className="badge bg-danger">FP: {results.stats.fp}</span>
              </div>
              <div className="col-auto">
                <span className="badge bg-danger">FN: {results.stats.fn}</span>
              </div>
              <div className="col-auto">
                <span className="badge bg-success">TN: {results.stats.tn}</span>
              </div>
              <div className="col-auto">
                <span className="small text-muted">
                  acc={results.stats.accuracy} prec={results.stats.precision} rec={results.stats.recall} f1={results.stats.f1}
                </span>
              </div>
            </div>
          )}

          <div className="d-flex gap-2 mb-2 align-items-center flex-wrap">
            <div className="btn-group btn-group-sm">
              {[
                { id: "all", label: "Все" },
                { id: "figures", label: "Фигуры" },
                { id: "digit", label: "Цифры" },
                { id: "puzzle", label: "Пазлы" },
                { id: "changed", label: "Изменённые" },
              ].map((f) => (
                <button
                  key={f.id}
                  className={`btn ${filter === f.id ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  {f.id === "changed" && results && (
                    <span className="ms-1 badge bg-light text-dark">
                      {results.results.filter((r) => r.kind !== (
                        r.ground_truth === "digit" ? "digit" : r.ground_truth === "figures" ? "figures" : "default"
                      )).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <input
              className="form-control form-control-sm"
              style={{ width: 200 }}
              placeholder="Поиск по ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="table-responsive">
            <table className="table table-sm table-hover table-bordered align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ width: 130 }}>Превью</th>
                  <th>Captcha ID</th>
                  <th style={{ width: 100 }}>Новый класс</th>
                  <th style={{ width: 90 }}>Сработал</th>
                  <th style={{ width: 80 }}>Conf</th>
                  <th style={{ width: 100 }}>GT класс</th>
                  <th style={{ width: 60 }}>Тайлов</th>
                  <th style={{ width: 75 }}>Solver</th>
                  <th style={{ width: 80 }}>Время</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => {
                  const changed = r.kind !== (
                    r.ground_truth === "digit" ? "digit" : r.ground_truth === "figures" ? "figures" : "default"
                  );
                  return (
                    <tr key={r.captcha_id} className={changed ? "table-warning" : ""}>
                      <td className="text-muted small">{idx + 1}</td>
                      <td>
                        {r.preview ? (
                          <img src={`data:image/png;base64,${r.preview}`} alt="preview" style={{ width: 120, height: 68, objectFit: "contain" }} />
                        ) : (
                          <span className="text-muted small">—</span>
                        )}
                      </td>
                      <td className="font-monospace small">{r.captcha_id}</td>
                      <td><span className={`badge ${CLASS_BADGES[r.kind] || "bg-light text-dark"}`}>{CLASS_LABELS[r.kind] || r.kind}</span></td>
                      <td className="small text-muted">{r.details?.classifier || r.details?.method || "—"}</td>
                      <td className="small">{r.confidence.toFixed(2)}</td>
                      <td><span className={`badge ${CLASS_BADGES[r.ground_truth] || "bg-light text-dark"}`}>{CLASS_LABELS[r.ground_truth] || r.ground_truth || "—"}</span></td>
                      <td className="small">{r.details?.tiles_with_digits ?? "—"}/{r.details?.total_tiles ?? "—"}</td>
                      <td className="small">
                        {r.solver_top1_match === true ? <span className="text-success fw-bold">top1</span> :
                         r.solver_top1_match === false ? <span className="text-danger">no</span> :
                         <span className="text-muted">—</span>}
                      </td>
                      <td className="small text-muted">{r.time_s}s</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!results && !running && !error && (
        <div className="text-center text-muted py-5">Выбери модель и нажми «Прогнать»</div>
      )}
    </div>
  );
}
