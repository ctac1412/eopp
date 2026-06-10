import React, { useState, useEffect, useCallback } from "react";
import { adminHeaders, adminHeadersJson } from "../../features/admin/shared/adminClient";

const ICON_DISPLAY_MODES = [
  { value: "own_then_foreign", label: "Свои → чужие" },
  { value: "own_only", label: "Только свои" },
];

export function OperatorsTab({ adminToken, onError }) {
  const [operators, setOperators] = useState([]);
  const [links, setLinks] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [answersPage, setAnswersPage] = useState(1);
  const [answersTotalPages, setAnswersTotalPages] = useState(1);
  const [answersTotal, setAnswersTotal] = useState(0);
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  // All keys (for allowed_master_keys and relink)
  const [allKeys, setAllKeys] = useState([]);

  // Companies (for company_id select)
  const [companies, setCompanies] = useState([]);

  // Edit operator modal
  const [editOp, setEditOp] = useState(null);
  const [editForm, setEditForm] = useState({
    nickname: "",
    icon_display_mode: "own_then_foreign",
    allowed_master_keys: [],
    companyId: "",
  });

  // Relink modal
  const [relinkOp, setRelinkOp] = useState(null);
  const [relinkMasterId, setRelinkMasterId] = useState(null);

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

  const loadKeys = useCallback(async () => {
    try {
      const r = await fetch("/api-keys", { headers: adminHeaders(adminToken) });
      const data = await r.json();
      setAllKeys(Array.isArray(data) ? data : data.keys || []);
    } catch (e) {
      setAllKeys([]);
    }
  }, [adminToken]);

  const loadCompanies = useCallback(async () => {
    try {
      const r = await fetch("/admin/companies", { headers: adminHeaders(adminToken) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch (e) {
      setCompanies([]);
    }
  }, [adminToken]);

  useEffect(() => {
    loadOperators();
    loadLinks();
    loadAnswers();
    loadKeys();
    loadCompanies();
  }, [loadOperators, loadLinks, loadAnswers, loadKeys, loadCompanies]);

  // Non-external keys for multiselect
  const internalKeys = allKeys.filter((k) => !k.is_external);

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

  const openEdit = (op) => {
    const allowed = op.allowed_master_keys;
    setEditForm({
      nickname: op.nickname || "",
      icon_display_mode: op.icon_display_mode || "own_then_foreign",
      allowed_master_keys: Array.isArray(allowed) ? allowed : (allowed == null ? [] : allowed),
      companyId: op.company_id != null ? String(op.company_id) : "",
    });
    setEditOp(op);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editOp) return;
    try {
      const body = {
        nickname: editForm.nickname,
        icon_display_mode: editForm.icon_display_mode,
        allowed_master_keys:
          editForm.allowed_master_keys.length > 0
            ? editForm.allowed_master_keys.map(Number)
            : null,
        company_id: editForm.companyId ? parseInt(editForm.companyId, 10) : null,
      };
      const r = await fetch(`/admin/operators/${editOp.id}`, {
        method: "PUT",
        headers: adminHeadersJson(adminToken),
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEditOp(null);
      await loadOperators();
    } catch (e) {
      onError?.("Ошибка сохранения оператора");
    }
  };

  const openRelink = (op) => {
    const allowed = op.allowed_master_keys;
    const allowedIds = Array.isArray(allowed) && allowed.length > 0
      ? allowed.map(Number)
      : null;
    // Find current master from links
    const currentLink = links.find(
      (l) => l.operator_uuid === op.uuid && l.active !== false
    );
    const available = internalKeys.filter(
      (k) => !allowedIds || allowedIds.includes(k.id)
    );
    setRelinkOp({ ...op, availableKeys: available, currentMasterId: currentLink?.master_key_id || null });
    setRelinkMasterId(null);
  };

  const handleRelink = async () => {
    if (!relinkOp || !relinkMasterId) return;
    try {
      const r = await fetch(`/admin/operators/${relinkOp.id}/link`, {
        method: "PUT",
        headers: adminHeadersJson(adminToken),
        body: JSON.stringify({ master_key_id: relinkMasterId }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRelinkOp(null);
      setRelinkMasterId(null);
      await loadLinks();
    } catch (e) {
      onError?.("Ошибка перепривязки оператора");
    }
  };

  const toggleMasterKey = (keyId) => {
    setEditForm((prev) => {
      const cur = prev.allowed_master_keys.map(Number);
      const next = cur.includes(keyId)
        ? cur.filter((id) => id !== keyId)
        : [...cur, keyId];
      return { ...prev, allowed_master_keys: next };
    });
  };

  const formatTime = (iso) => {
    if (!iso) return "—";
    return iso.slice(0, 19).replace("T", " ");
  };

  const getIconModeLabel = (mode) => {
    const found = ICON_DISPLAY_MODES.find((m) => m.value === mode);
    return found ? found.label : mode || "—";
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
            <th>Онлайн</th>
            <th>Никнейм</th>
            <th>UUID</th>
            <th>Доступные мастера</th>
            <th>Компания</th>
            <th>Режим иконок</th>
            <th>Ссылка</th>
            <th>Дата</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {operators.length === 0 && (
            <tr><td colSpan={10} className="text-center text-muted">Нет операторов</td></tr>
          )}
          {operators.map((op) => (
            <tr key={op.id}>
              <td>{op.id}</td>
              <td className="text-center">
                <span
                  style={{
                    display: "inline-block",
                    width: 8, height: 8, borderRadius: "50%",
                    background: op.online ? "#3fb950" : "#f85149",
                    boxShadow: op.online ? "0 0 6px #3fb950" : "0 0 6px #f85149",
                  }}
                  title={op.online ? "Онлайн" : "Офлайн"}
                />
              </td>
              <td className="fw-semibold">{op.nickname}</td>
              <td><code style={{ fontSize: "0.75rem" }}>{op.uuid}</code></td>
              <td style={{ fontSize: "0.72rem" }}>
                {(() => {
                  const allowed = op.allowed_master_keys;
                  if (allowed == null) return <span className="text-muted">Все</span>;
                  if (!Array.isArray(allowed) || allowed.length === 0) return <span className="text-muted">Все</span>;
                  const keyMap = {};
                  allKeys.forEach((k) => { keyMap[k.id] = k.label; });
                  return allowed.map((kid, i) => (
                    <span key={i} style={{
                      display: "inline-block", background: "#161b22", borderRadius: 3,
                      padding: "1px 5px", marginRight: 3, marginBottom: 2,
                      border: "1px solid #30363d", fontSize: "0.7rem",
                    }}>
                      {keyMap[kid] || `#${kid}`}
                    </span>
                  ));
                })()}
              </td>
              <td style={{ fontSize: "0.72rem" }}>{op.company_name || "—"}</td>
              <td style={{ fontSize: "0.75rem" }}>{getIconModeLabel(op.icon_display_mode)}</td>
              <td>
                <a href={`${baseUrl}/operators/${op.uuid}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: "0.8rem" }}>
                  открыть
                </a>
              </td>
              <td style={{ fontSize: "0.75rem" }}>{op.created_at?.slice(0, 10)}</td>
              <td>
                <div className="d-flex gap-1">
                  <button className="btn btn-sm btn-outline-primary" style={{ fontSize: "0.7rem" }}
                    onClick={() => openEdit(op)}>
                    изменить
                  </button>
                  <button className="btn btn-sm btn-outline-warning" style={{ fontSize: "0.7rem" }}
                    onClick={() => openRelink(op)}>
                    перепривязать
                  </button>
                  <button className="btn btn-sm btn-outline-danger" style={{ fontSize: "0.7rem" }}
                    onClick={() => deleteOperator(op.id)}>
                    удалить
                  </button>
                </div>
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

      {/* --- Edit Operator Modal --- */}
      {editOp && (
        <div className="modal fade show d-block" tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => e.target === e.currentTarget && setEditOp(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Редактировать оператора #{editOp.id}</h5>
                <button type="button" className="btn-close" onClick={() => setEditOp(null)}></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleEditSave}>
                  <div className="mb-3">
                    <label className="form-label">Никнейм</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editForm.nickname}
                      onChange={(e) => setEditForm((p) => ({ ...p, nickname: e.target.value }))}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Компания</label>
                    <select
                      className="form-select"
                      value={editForm.companyId || ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, companyId: e.target.value }))}
                      style={{ background: "#0d1117", color: "#c9d1d9", border: "1px solid #30363d" }}
                    >
                      <option value="">Без компании</option>
                      {companies.map((c) => (
                        <option key={c.id} value={String(c.id)}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Режим отображения иконок</label>
                    <select
                      className="form-select"
                      value={editForm.icon_display_mode}
                      onChange={(e) => setEditForm((p) => ({ ...p, icon_display_mode: e.target.value }))}
                      style={{ background: "#0d1117", color: "#c9d1d9", border: "1px solid #30363d" }}
                    >
                      {ICON_DISPLAY_MODES.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">
                      Доступные мастера
                      <span style={{ fontSize: "0.7rem", color: "#8b949e", marginLeft: 6 }}>
                        (пусто = все доступны)
                      </span>
                    </label>
                    <div style={{
                      maxHeight: "180px", overflowY: "auto",
                      background: "#0d1117", border: "1px solid #30363d",
                      borderRadius: 4, padding: "6px 8px",
                    }}>
                      {internalKeys.length === 0 && (
                        <div style={{ color: "#8b949e", fontSize: "0.75rem" }}>Нет внутренних ключей</div>
                      )}
                      {internalKeys.map((k) => {
                        const checked = editForm.allowed_master_keys.includes(k.id);
                        return (
                          <label key={k.id} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "2px 0", cursor: "pointer",
                            fontSize: "0.8rem", color: "#c9d1d9",
                          }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMasterKey(k.id)}
                              className="form-check-input"
                              style={{ margin: 0 }}
                            />
                            {k.label || `Ключ #${k.id}`}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </form>
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-secondary" onClick={() => setEditOp(null)}>Отмена</button>
                <button className="btn btn-sm btn-primary" onClick={handleEditSave}>Сохранить</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Relink Modal --- */}
      {relinkOp && (
        <div className="modal fade show d-block" tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => e.target === e.currentTarget && setRelinkOp(null)}>
          <div className="modal-dialog modal-dialog-centered modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Перепривязать оператора</h5>
                <button type="button" className="btn-close" onClick={() => setRelinkOp(null)}></button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: "0.8rem", color: "#8b949e" }}>
                  Оператор: <strong style={{ color: "#c9d1d9" }}>{relinkOp.nickname || `#${relinkOp.id}`}</strong>
                  {relinkOp.currentMasterId && (
                    <> (текущий мастер: #{relinkOp.currentMasterId})</>
                  )}
                </p>
                <label className="form-label" style={{ fontSize: "0.8rem" }}>Новый мастер</label>
                <select
                  className="form-select"
                  value={relinkMasterId || ""}
                  onChange={(e) => setRelinkMasterId(e.target.value ? Number(e.target.value) : null)}
                  style={{ background: "#0d1117", color: "#c9d1d9", border: "1px solid #30363d" }}
                >
                  <option value="">Выберите мастера</option>
                  {(relinkOp.availableKeys || []).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label || `Ключ #${k.id}`} {k.is_external ? "(внешний)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-secondary" onClick={() => setRelinkOp(null)}>Отмена</button>
                <button className="btn btn-sm btn-primary" onClick={handleRelink} disabled={!relinkMasterId}>
                  Перепривязать
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
