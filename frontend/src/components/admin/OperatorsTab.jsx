import React, { useState, useEffect } from "react";
import { adminHeaders, adminHeadersJson } from "../../features/admin/shared/adminClient";

export function OperatorsTab({ adminToken, onError }) {
  const [operators, setOperators] = useState([]);
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const baseUrl = window.location.origin;

  const loadOperators = async () => {
    try {
      const r = await fetch("/admin/operators", { headers: adminHeaders(adminToken) });
      const data = await r.json();
      setOperators(data);
    } catch (e) {
      onError?.("Ошибка загрузки операторов");
    }
  };

  useEffect(() => { loadOperators(); }, []);

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
      await loadOperators();
    } catch (e) {
      onError?.("Ошибка удаления");
    }
  };

  return (
    <div>
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

      <table className="table table-sm table-dark table-striped">
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
    </div>
  );
}
