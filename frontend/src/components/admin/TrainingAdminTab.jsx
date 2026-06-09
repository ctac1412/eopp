import React, { useState, useEffect, useCallback } from "react";

function adminHeaders(token) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

function formatMs(ms) {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(2)}с`;
}

export function TrainingAdminTab({ adminToken, onError }) {
  const [courses, setCourses] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, rRes] = await Promise.all([
        fetch("/admin/courses", { headers: adminHeaders(adminToken) }),
        fetch("/admin/training/runs", { headers: adminHeaders(adminToken) }),
      ]);
      if (cRes.ok) setCourses(await cRes.json());
      if (rRes.ok) setRuns(await rRes.json());
    } catch (e) {
      onError?.("Ошибка загрузки");
    }
    setLoading(false);
  }, [adminToken, onError]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const deleteCourse = async (courseId) => {
    if (!confirm("Удалить курс?")) return;
    try {
      const res = await fetch(`/admin/courses/${courseId}`, {
        method: "DELETE",
        headers: adminHeaders(adminToken),
      });
      if (res.ok) {
        setCourses(prev => prev.filter(c => c.id !== courseId));
      }
    } catch (e) {
      onError?.("Ошибка удаления");
    }
  };

  if (loading) return <div className="text-center text-muted py-3">Загрузка...</div>;

  return (
    <div>
      {/* Courses */}
      <div className="card mb-3" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
        <div className="card-body p-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong style={{ fontSize: "0.9rem" }}>📚 Курсы ({courses.length})</strong>
            <button className="btn btn-sm btn-outline-secondary" onClick={fetchAll}>🔄</button>
          </div>
          {courses.length === 0 ? (
            <p className="text-muted mb-0" style={{ fontSize: "0.8rem" }}>
              Нет курсов. Создайте курс на вкладке «Капчи» → «Файлы» → выбрать капчи → «Создать курс».
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0" style={{ fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Название</th>
                    <th>Описание</th>
                    <th>Капч</th>
                    <th>Режим</th>
                    <th>Создан</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map(c => (
                    <tr key={c.id}>
                      <td>{c.id}</td>
                      <td>{c.name}</td>
                      <td className="text-muted">{c.description || "—"}</td>
                      <td>{c.captcha_count}</td>
                      <td>
                        <span className={`badge ${c.pause_between === false ? "bg-success" : "bg-warning text-dark"}`} style={{ fontSize: "0.65rem" }}>
                          {c.pause_between === false ? "тренировка" : "экзамен"}
                        </span>
                      </td>
                      <td>{c.created_at?.slice(0, 16)}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          style={{ fontSize: "0.7rem" }}
                          onClick={() => deleteCourse(c.id)}
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Test Runs */}
      <div className="card" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
        <div className="card-body p-3">
          <strong style={{ fontSize: "0.9rem" }}>🏃 Прогоны ({runs.length})</strong>
          {runs.length === 0 ? (
            <p className="text-muted mt-2 mb-0" style={{ fontSize: "0.8rem" }}>Нет прогонов</p>
          ) : (
            <div className="table-responsive mt-2">
              <table className="table table-sm table-hover mb-0" style={{ fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Участник</th>
                    <th>Курс</th>
                    <th>Статус</th>
                    <th>Правильно</th>
                    <th>Сред. время</th>
                    <th>Сред. иконка</th>
                    <th>Начат</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(r => (
                    <tr key={r.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => window.open(`/training/run/${r.id}/results`, "_blank")}
                    >
                      <td>{r.id}</td>
                      <td>
                        <span className="badge bg-secondary me-1" style={{ fontSize: "0.65rem" }}>
                          {r.participant_type}
                        </span>
                        {r.participant_label}
                      </td>
                      <td>{r.course_name}</td>
                      <td>
                        <span className={`badge ${r.status === "completed" ? "bg-success" : r.status === "running" ? "bg-warning" : "bg-secondary"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>{r.stats.correct}/{r.stats.total}</td>
                      <td>{formatMs(r.stats.avg_duration_ms)}</td>
                      <td>{formatMs(r.stats.avg_icon_ms)}</td>
                      <td>{r.created_at?.slice(0, 16)}</td>
                      <td>
                        {r.status === "completed" && (
                          <div className="d-flex gap-1">
                            <button
                              className="btn btn-sm btn-outline-primary"
                              style={{ fontSize: "0.65rem", padding: "1px 6px" }}
                              onClick={(e) => { e.stopPropagation(); window.open(`/training/run/${r.id}/results`, "_blank"); }}
                            >
                              📊
                            </button>
                            <button
                              className="btn btn-sm btn-outline-success"
                              style={{ fontSize: "0.65rem", padding: "1px 6px" }}
                              onClick={(e) => { e.stopPropagation(); window.open(`/training/run/${r.id}/review`, "_blank"); }}
                            >
                              🔍
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
