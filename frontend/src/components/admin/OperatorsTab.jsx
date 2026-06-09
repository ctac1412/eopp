import React, { useState, useEffect, useCallback } from "react";
import { adminHeaders, adminHeadersJson } from "../../features/admin/shared/adminClient";

export function OperatorsTab({ adminToken, onError }) {
  const [operators, setOperators] = useState([]);
  const [links, setLinks] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [answersPage, setAnswersPage] = useState(1);
  const [answersTotalPages, setAnswersTotalPages] = useState(1);
  const [answersTotal, setAnswersTotal] = useState(0);
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const PER_PAGE = 20;
  const baseUrl = window.location.origin;

  const loadOperators = useCallback(async () => {
    try {
      const r = await fetch("/admin/operators", { headers: adminHeaders(adminToken) });
      setOperators(await r.json());
    } catch (e) {
      onError?.("Ошибка загрузки операторов");
    }
  }, [adminToken, onError]);

  const loadLinks = useCallback(async () => {
    try {
      const r = await fetch("/admin/operator-links", { headers: adminHeaders(adminToken) });
      setLinks(await r.json());
    } catch (e) {
      onError?.("Ошибка загрузки связок");
    }
  }, [adminToken, onError]);

  const loadAnswers = useCallback(async (page = 1) => {
    try {
      const r = await fetch(`/admin/distribution-answers?page=${page}&per_page=${PER_PAGE}`, {
        headers: adminHeaders(adminToken),
      });
      const data = await r.json();
      setAnswers(data.items || []);
      setAnswersPage(data.page || 1);
      setAnswersTotalPages(data.pages || 1);
      setAnswersTotal(data.total || 0);
    } catch (e) {
      onError?.("Ошибка загрузки действий");
    }
  }, [adminToken, onError]);

  useEffect(() => {
    loadOperators();
    loadLinks();
    loadAnswers();
  }, [loadOperators, loadLinks, loadAnswers]);

  const addOperator = async () => {
    if (!nickname.trim()) return;
    setLoading(true);
    try {
      const r = await fetch("/admin/operators", {
        method: "POST",
        headers: adminHeadersJson(adminToken),
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      if (r.ok) {
        setNickname("");
        await loadOperators();
      }
    } catch (e) {
      onError?.("Ошибка создания оператора");
    } finally {
      setLoading(false);
    }
  };

  const deleteOperator = async (id) => {
    if (!window.confirm("Удалить оператора?")) return;
    try {
      await fetch(`/admin/operators/${id}`, {
        method: "DELETE",
        headers: adminHeaders(adminToken),
      });
      await Promise.all([loadOperators(), loadLinks()]);
    } catch (e) {
      onError?.("Ошибка удаления");
    }
  };

  const unlinkOperator = async (operatorUuid, masterKeyId) => {
    if (!window.confirm("Разорвать связку?")) return;
    try {
      await fetch(`/operators/${operatorUuid}/unlink`, {
        method: "POST",
        headers: adminHeadersJson(adminToken),
        body: JSON.stringify({ master_id: masterKeyId }),
      });
      await loadLinks();
    } catch (e) {
      onError?.("Ошибка разрыва связки");
    }
  };

  const formatTime = (iso) => {
    if (!iso) return "—";
    return iso.slice(0, 19).replace("T", " ");
  };

  return (
    <div>
      {/* --- Управление операторами --- */}
      <h6 className="mb-3" style={{ color: "#f0f6fc" }}>Операторы</h6>
      <div className="d-flex gap-2 mb-3 align-items-end">
        <div>
          <label className="form-label mb-1" style={{ fontSize: "0.8rem" }}>Никнейм</label>
          <input
            type="text"
            className="form-control form-control-sm"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addOperator()}
            placeholder="operator1"
            style={{ width: "200px" }}
          />
        </div>
        <button className="btn btn-sm btn-primary" onClick={addOperator} disabled={loading}>
          + Добавить
        </button>
      </div>

      <table className="table table-sm table-dark table-striped mb-4">
        <thead>
          <tr>
            <th>ID</th>
            <th>Никнейм</th>
            <th>UUID</th>
            <th>Ссылка</th>
            <th>Дата</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {operators.length === 0 && (
            <tr><td colSpan={6} className="text-center text-muted">Нет операторов</td></tr>
          )}
          {operators.map((op) => (
            <tr key={op.id}>
              <td>{op.id}</td>
              <td className="fw-semibold">{op.nickname}</td>
              <td><code style={{ fontSize: "0.75rem" }}>{op.uuid}</code></td>
              <td>
                <a href={`${baseUrl}/operators/${op.uuid}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: "0.8rem" }}>
                  открыть
                </a>
              </td>
              <td style={{ fontSize: "0.75rem" }}>{op.created_at?.slice(0, 10)}</td>
              <td>
                <button className="btn btn-sm btn-outline-danger" style={{ fontSize: "0.7rem" }}
                  onClick={() => deleteOperator(op.id)}>
                  удалить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* --- Активные связки --- */}
      <h6 className="mb-2" style={{ color: "#f0f6fc" }}>
        Активные связки
        <button className="btn btn-sm btn-outline-secondary ms-2" onClick={loadLinks}
          style={{ fontSize: "0.65rem", padding: "1px 6px" }} title="Обновить">
          ↻
        </button>
      </h6>
      <table className="table table-sm table-dark table-striped mb-4">
        <thead>
          <tr>
            <th>Оператор</th>
            <th>Мастер</th>
            <th>Создана</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {links.length === 0 && (
            <tr><td colSpan={4} className="text-center text-muted">Нет активных связок</td></tr>
          )}
          {links.map((l) => (
            <tr key={l.link_id}>
              <td>
                <span className="fw-semibold">{l.operator_nickname}</span>
                <code style={{ fontSize: "0.7rem", marginLeft: 6 }}>#{l.operator_id}</code>
              </td>
              <td>
                <span>{l.master_label || `Мастер #${l.master_key_id}`}</span>
                <code style={{ fontSize: "0.7rem", marginLeft: 6 }}>#{l.master_key_id}</code>
              </td>
              <td style={{ fontSize: "0.75rem" }}>{formatTime(l.created_at)}</td>
              <td>
                <button className="btn btn-sm btn-outline-warning" style={{ fontSize: "0.7rem" }}
                  onClick={() => unlinkOperator(l.operator_uuid, l.master_key_id)}>
                  разорвать
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* --- Действия (distribution answers) --- */}
      <h6 className="mb-2" style={{ color: "#f0f6fc" }}>
        Действия
        <span style={{ fontSize: "0.7rem", color: "#8b949e", marginLeft: 8 }}>
          {answersTotal} всего
        </span>
        <button className="btn btn-sm btn-outline-secondary ms-2" onClick={() => loadAnswers(answersPage)}
          style={{ fontSize: "0.65rem", padding: "1px 6px" }} title="Обновить">
          ↻
        </button>
      </h6>
      <table className="table table-sm table-dark table-striped mb-2">
        <thead>
          <tr>
            <th>ID</th>
            <th>Капча</th>
            <th>Оператор</th>
            <th>Иконка</th>
            <th>X</th>
            <th>Y</th>
            <th>Время</th>
            <th>Δ мс</th>
          </tr>
        </thead>
        <tbody>
          {answers.length === 0 && (
            <tr><td colSpan={8} className="text-center text-muted">Нет действий</td></tr>
          )}
          {answers.map((a) => (
            <tr key={a.id}>
              <td>{a.id}</td>
              <td>
                <code style={{ fontSize: "0.7rem" }} title={a.captcha_id}>
                  {a.captcha_id?.slice(0, 12)}…
                </code>
              </td>
              <td>
                <span className="fw-semibold">{a.operator_nickname}</span>
                <code style={{ fontSize: "0.7rem", marginLeft: 4 }}>#{a.operator_id}</code>
              </td>
              <td>{a.icon_position + 1}/5</td>
              <td>{a.x}</td>
              <td>{a.y}</td>
              <td style={{ fontSize: "0.7rem" }}>{formatTime(a.created_at)}</td>
              <td style={{ fontSize: "0.7rem", color: a.duration_ms != null ? "#c9d1d9" : "#484f58" }}>
                {a.duration_ms != null ? `${a.duration_ms} ms` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {answersTotalPages > 1 && (
        <div className="d-flex justify-content-center align-items-center gap-2 mb-3">
          <button
            className="btn btn-sm btn-outline-secondary"
            disabled={answersPage <= 1}
            onClick={() => loadAnswers(answersPage - 1)}
            style={{ fontSize: "0.7rem" }}
          >
            ←
          </button>
          <span style={{ fontSize: "0.75rem", color: "#8b949e" }}>
            {answersPage} / {answersTotalPages}
          </span>
          <button
            className="btn btn-sm btn-outline-secondary"
            disabled={answersPage >= answersTotalPages}
            onClick={() => loadAnswers(answersPage + 1)}
            style={{ fontSize: "0.7rem" }}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
