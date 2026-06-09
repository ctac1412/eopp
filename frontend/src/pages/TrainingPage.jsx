import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const API = "";

function loadApiKey() {
  const key = localStorage.getItem("kiosk_api_key");
  return key || "";
}

export default function TrainingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [participantType, setParticipantType] = useState(null); // null = detecting
  const [participantId, setParticipantId] = useState(null);
  const [participantLabel, setParticipantLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showInstructions, setShowInstructions] = useState(true);

  // Auto-detect participant
  useEffect(() => {
    const opUuid = searchParams.get("op");

    if (opUuid) {
      // Coming from operator page
      fetch(`${API}/training/resolve-operator?uuid=${encodeURIComponent(opUuid)}`)
        .then(r => r.json())
        .then(data => {
          if (data.operator_id) {
            setParticipantType("operator");
            setParticipantId(data.operator_id);
            setParticipantLabel(`Оператор: ${data.nickname || opUuid}`);
          }
        })
        .catch(() => {});
    } else {
      // Coming from main app — use API key from auth
      const apiKey = loadApiKey();
      if (apiKey) {
        fetch(`${API}/validate-key?api_key=${encodeURIComponent(apiKey)}`)
          .then(r => r.json())
          .then(data => {
            if (data.valid && data.api_key_id) {
              setParticipantType("api_key");
              setParticipantId(data.api_key_id);
              setParticipantLabel(`API ключ: ${data.label || `#${data.api_key_id}`}`);
            }
          })
          .catch(() => {});
      } else {
        setParticipantType("api_key"); // fallback — will show manual input
      }
    }
  }, [searchParams]);

  useEffect(() => {
    fetch(`${API}/training/courses`)
      .then(r => r.json())
      .then(setCourses)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (participantId != null && participantType) {
      const params = new URLSearchParams();
      params.set("participant_type", participantType);
      params.set("participant_id", participantId);
      fetch(`${API}/training/runs?${params}`)
        .then(r => r.json())
        .then(setRuns)
        .catch(() => {});
    }
  }, [participantType, participantId]);

  const startRun = async () => {
    if (!selectedCourse || participantId == null) {
      setError("Выберите курс");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/training/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: selectedCourse,
          participant_type: participantType,
          participant_id: participantId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const pauseParam = data.pause_between === false ? "?pause=0" : "";
        navigate(`/training/run/${data.id}${pauseParam}`);
      } else {
        setError(data.error || "Ошибка запуска");
      }
    } catch (e) {
      setError("Сетевая ошибка");
    }
    setLoading(false);
  };

  const formatMs = (ms) => {
    if (ms == null) return "—";
    return `${(ms / 1000).toFixed(2)}с`;
  };

  return (
    <div className="container py-3" style={{ maxWidth: 900 }}>
      <a href="/" style={{ fontSize: "0.8rem", color: "#58a6ff", textDecoration: "none" }}>← На главную</a>
      <h4 className="mb-1 mt-1">🎓 Обучение</h4>
      <p className="text-muted" style={{ fontSize: "0.85rem" }}>
        Тестовый полигон для тренировки решения капч
      </p>

      {showInstructions && (
        <div className="card mb-3" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
          <div className="card-body p-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <strong style={{ fontSize: "0.9rem" }}>📖 Инструкция</strong>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowInstructions(false)}>✕</button>
            </div>
            <ol style={{ fontSize: "0.85rem", margin: 0, paddingLeft: "1.2rem" }}>
              <li>Выберите <strong>курс</strong> из списка (курсы создаются администратором).</li>
              <li>Нажмите <strong>«Начать тестовый прогон»</strong>.</li>
              <li>Капчи будут появляться по одной с интервалом 2–7 секунд.</li>
              <li>Решайте капчи как обычно — время фиксируется автоматически.</li>
              <li>После прохождения всех капч вы увидите результаты.</li>
            </ol>
          </div>
        </div>
      )}

      {/* Participant info (auto-detected) */}
      <div className="card mb-3" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
        <div className="card-body p-3">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Участник: </span>
              {participantType == null ? (
                <span className="text-muted">определение...</span>
              ) : participantLabel ? (
                <strong style={{ fontSize: "0.9rem" }}>{participantLabel}</strong>
              ) : (
                <span className="text-warning" style={{ fontSize: "0.85rem" }}>
                  Не авторизован —{" "}
                  <a href="/" style={{ color: "#58a6ff" }}>войдите с API ключом</a>
                </span>
              )}
            </div>
            {participantId != null && (
              <button className="btn btn-sm btn-outline-secondary" onClick={() => {
                const params = new URLSearchParams();
                params.set("participant_type", participantType);
                params.set("participant_id", participantId);
                fetch(`${API}/training/runs?${params}`)
                  .then(r => r.json())
                  .then(setRuns)
                  .catch(() => {});
              }}>
                🔄 Обновить историю
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Course selector */}
      <div className="card mb-3" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
        <div className="card-body p-3">
          <strong style={{ fontSize: "0.9rem" }}>Выберите курс</strong>
          {courses.length === 0 && (
            <p className="text-muted mt-2 mb-0" style={{ fontSize: "0.8rem" }}>Нет доступных курсов</p>
          )}
          <div className="row g-2 mt-2">
            {courses.map(c => (
              <div className="col-md-6" key={c.id}>
                <div
                  className={`card p-2 ${selectedCourse === c.id ? "border-primary" : ""}`}
                  style={{
                    cursor: "pointer",
                    background: selectedCourse === c.id ? "rgba(13,110,253,0.08)" : "var(--surface)",
                    border: selectedCourse === c.id ? "2px solid #0d6efd" : "1px solid var(--border)",
                  }}
                  onClick={() => setSelectedCourse(c.id)}
                >
                  <div className="d-flex justify-content-between align-items-center">
                    <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{c.name}</span>
                    <span className="badge bg-secondary" style={{ fontSize: "0.7rem" }}>{c.captcha_count} капч</span>
                  </div>
                  {c.description && (
                    <small className="text-muted">{c.description}</small>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary btn-sm mt-3"
            onClick={startRun}
            disabled={loading || !selectedCourse || participantId == null}
          >
            {loading ? "Запуск..." : "▶ Начать тестовый прогон"}
          </button>
          {error && <div className="text-danger mt-2" style={{ fontSize: "0.8rem" }}>{error}</div>}
        </div>
      </div>

      {/* History */}
      {runs.length > 0 && (
        <div className="card" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
          <div className="card-body p-3">
            <strong style={{ fontSize: "0.9rem" }}>📋 История прогонов</strong>
            <div className="table-responsive mt-2">
              <table className="table table-sm table-hover mb-0" style={{ fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Курс</th>
                    <th>Статус</th>
                    <th>Правильно</th>
                    <th>Сред. время</th>
                    <th>Сред. иконка</th>
                    <th>Дата</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(r => (
                    <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/training/run/${r.id}/results`)}>
                      <td>{r.id}</td>
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
                        {r.status === "running" && (
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={e => { e.stopPropagation(); navigate(`/training/run/${r.id}`); }}
                          >
                            Продолжить
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
