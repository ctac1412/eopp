import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API = "";

export default function TrainingResultsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const runId = parseInt(id);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/training/run/${runId}/results`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("Ошибка загрузки"); setLoading(false); });
  }, [runId]);

  const formatMs = (ms) => {
    if (ms == null) return "—";
    return `${(ms / 1000).toFixed(2)}с`;
  };

  if (loading) return <div className="container py-3 text-center text-muted">Загрузка...</div>;
  if (error) return <div className="container py-3 text-center text-danger">{error}</div>;
  if (!data) return <div className="container py-3 text-center text-muted">Нет данных</div>;

  const { test_run: tr, course, stats, results } = data;

  return (
    <div className="container py-3" style={{ maxWidth: 900 }}>
      <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => navigate("/training")}>
        ← Назад к обучению
      </button>

      <h4>📊 Результаты прогона #{runId}</h4>
      <p className="text-muted" style={{ fontSize: "0.85rem" }}>
        Курс: <strong>{course?.name || "?"}</strong> — {tr.status}
      </p>

      {/* Summary */}
      <div className="card mb-3" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
        <div className="card-body p-3">
          <div className="row g-3 text-center">
            <div className="col-3">
              <small className="text-muted">Всего капч</small>
              <div className="fs-5 fw-bold">{stats.total}</div>
            </div>
            <div className="col-3">
              <small className="text-muted">Правильно</small>
              <div className="fs-5 fw-bold text-success">{stats.correct}</div>
            </div>
            <div className="col-3">
              <small className="text-muted">Сред. время</small>
              <div className="fs-5 fw-bold">{formatMs(stats.avg_duration_ms)}</div>
            </div>
            <div className="col-3">
              <small className="text-muted">Сред. иконка</small>
              <div className="fs-5 fw-bold">{formatMs(stats.avg_icon_ms)}</div>
            </div>
          </div>
          <div className="row g-3 text-center mt-1">
            <div className="col-3">
              <small className="text-muted">Ошибок</small>
              <div className="fs-5 fw-bold text-danger">{stats.incorrect}</div>
            </div>
            <div className="col-3">
              <small className="text-muted">Таймаутов</small>
              <div className="fs-5 fw-bold text-warning">{stats.timeout || 0}</div>
            </div>
            <div className="col-3">
              <small className="text-muted">Точность</small>
              <div className="fs-5 fw-bold">
                {stats.total > 0 ? `${Math.round((stats.correct / stats.total) * 100)}%` : "—"}
              </div>
            </div>
            <div className="col-3">
              <small className="text-muted">Длительность</small>
              <div className="fs-5 fw-bold">
                {tr.started_at && tr.completed_at
                  ? formatMs(new Date(tr.completed_at) - new Date(tr.started_at))
                  : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Per-captcha details */}
      <div className="card" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
        <div className="card-body p-3">
          <strong style={{ fontSize: "0.9rem" }}>Детали по капчам</strong>
          <div className="table-responsive mt-2">
            <table className="table table-sm table-hover mb-0" style={{ fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Captcha ID</th>
                  <th>Тип</th>
                  <th>Статус</th>
                  <th>Вариант</th>
                  <th>Время</th>
                  <th>Иконки</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const iconTimes = r.icon_times || [];
                  return (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>{r.captcha_id?.slice(0, 12)}...</td>
                      <td>
                        <span className="badge bg-secondary" style={{ fontSize: "0.65rem" }}>
                          {r.captcha_type === 1 ? "иконки" : "пазл"}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${r.status === "correct" ? "bg-success" : r.status === "incorrect" ? "bg-danger" : "bg-warning"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {r.variant_index != null ? (
                          <>
                            #{r.variant_index}
                            {r.valid_index != null && r.variant_index !== r.valid_index && (
                              <span className="text-muted ms-1" style={{ fontSize: "0.7rem" }}>(верно: #{r.valid_index})</span>
                            )}
                          </>
                        ) : "—"}
                      </td>
                      <td>{formatMs(r.duration_ms)}</td>
                      <td>
                        {iconTimes.map((it, j) => (
                          <span key={j} className="badge bg-light text-dark me-1" style={{ fontSize: "0.65rem" }}>
                            {it.icon_position != null ? `ик${it.icon_position + 1}:` : ""}{formatMs(it.duration_ms)}
                          </span>
                        ))}
                        {iconTimes.length === 0 && "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="d-flex gap-2 mt-3 justify-content-center">
        <button className="btn btn-success btn-sm" onClick={() => navigate(`/training/run/${runId}/review`)}>
          🔍 Отсмотр капч
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/training`)}>
          🔄 Новый прогон
        </button>
        <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate(`/training/run/${runId}`)}>
          ↩ Перепройти
        </button>
      </div>
    </div>
  );
}
