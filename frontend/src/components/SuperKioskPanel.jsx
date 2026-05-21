import React, { useState, useEffect } from "react";
import useCaptchaStore from "../store/useCaptchaStore";

function SuperKioskPanel() {
  const helpFor = useCaptchaStore((s) => s.helpFor);
  const setHelpFor = useCaptchaStore((s) => s.setHelpFor);
  const apiKey = useCaptchaStore((s) => s.apiKey);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(null);
  const [ownKeyId, setOwnKeyId] = useState(null);

  useEffect(() => {
    if (!apiKey) return;
    fetch(`/validate-key?api_key=${encodeURIComponent(apiKey)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.api_key_id) {
          setOwnKeyId(data.api_key_id);
        }
      })
      .catch(() => {});
  }, [apiKey]);

  useEffect(() => {
    const adminToken = localStorage.getItem("admin_token");
    if (!adminToken) {
      setLoading(false);
      return;
    }
    fetch("/api-keys", {
      headers: { "X-Admin-Token": adminToken },
    })
      .then((r) => r.json())
      .then((data) => {
        const filtered = (Array.isArray(data) ? data : []).filter(
          (k) => k.active && !k.is_admin && k.id !== ownKeyId
        );
        setKeys(filtered);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ownKeyId]);

  const toggleKey = (id) => {
    setPending((prev) => {
      const current = prev !== null ? prev : helpFor;
      if (current.includes(id)) {
        return current.filter((x) => x !== id);
      }
      return [...current, id];
    });
  };

  const apply = () => {
    setHelpFor(pending !== null ? pending : helpFor);
    setPending(null);
  };

  const selectAll = () => {
    setPending(keys.map((k) => k.id));
  };

  const deselectAll = () => {
    setPending([]);
  };

  const current = pending !== null ? pending : helpFor;
  const activeCount = current.length;
  const totalCount = keys.length;

  if (loading) {
    return (
      <div className="card mb-3" style={{ borderColor: "rgba(245, 158, 11, 0.3)" }}>
        <div className="card-body py-2" style={{ fontSize: "0.8125rem", color: "#484f58" }}>
          Загрузка ключей...
        </div>
      </div>
    );
  }

  if (keys.length === 0) {
    return (
      <div className="card mb-3" style={{ borderColor: "rgba(245, 158, 11, 0.3)" }}>
        <div className="card-body py-2" style={{ fontSize: "0.8125rem", color: "#484f58" }}>
          Нет доступных ключей
        </div>
      </div>
    );
  }

  return (
    <div className="card mb-3" style={{ borderColor: "rgba(245, 158, 11, 0.3)" }}>
      <div className="card-header d-flex justify-content-between align-items-center py-2" style={{ background: "rgba(245, 158, 11, 0.08)" }}>
        <span className="fw-semibold" style={{ fontSize: "0.8125rem" }}>
          Супер Киоск — Помогаю: {activeCount} из {totalCount}
        </span>
        <div className="d-flex gap-1">
          <button className="btn btn-sm btn-outline-secondary" onClick={selectAll} style={{ fontSize: "0.7rem" }}>Все</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={deselectAll} style={{ fontSize: "0.7rem" }}>Никого</button>
        </div>
      </div>
      <div className="card-body py-2" style={{ maxHeight: "200px", overflowY: "auto" }}>
        <div className="d-flex flex-column gap-1">
          {keys.map((k) => {
            const checked = current.includes(k.id);
            return (
              <label
                key={k.id}
                className="d-flex align-items-center gap-2"
                style={{ fontSize: "0.8125rem", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleKey(k.id)}
                />
                <span className="fw-medium">{k.label || k.key}</span>
                {k.comment && (
                  <span style={{ fontSize: "0.7rem", color: "#6e7681" }}>({k.comment})</span>
                )}
              </label>
            );
          })}
        </div>
      </div>
      <div className="card-footer py-2 d-flex justify-content-end gap-2" style={{ background: "transparent" }}>
        {pending !== null && (
          <>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setPending(null)}>Отмена</button>
            <button className="btn btn-sm btn-warning" onClick={apply}>Применить</button>
          </>
        )}
        {pending === null && (
          <span style={{ fontSize: "0.7rem", color: "#6e7681" }}>
            {helpFor.length === 0 ? "Помогаю всем (подписки не заданы)" : "Нажмите на чекбокс для изменения"}
          </span>
        )}
      </div>
    </div>
  );
}

export default React.memo(SuperKioskPanel);
