import React, { useState, useEffect, useCallback } from "react";
import { HistoryTable } from "./history/HistoryTable";

function UsageHistory({ apiKey }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedLogs, setExpandedLogs] = useState({});
  const [expandedConfig, setExpandedConfig] = useState({});
  const [expandedErrors, setExpandedErrors] = useState({});

  const toggleLogs = (id) => setExpandedLogs((p) => ({ ...p, [id]: !p[id] }));
  const toggleConfig = (id) => setExpandedConfig((p) => ({ ...p, [id]: !p[id] }));
  const toggleError = (id) => setExpandedErrors((p) => ({ ...p, [id]: !p[id] }));

  const fetchLogs = useCallback(async () => {
    if (!apiKey) {
      setError("API-ключ не установлен");
      setLoading(false);
      return;
    }
    try {
      const resp = await fetch(`/usage-log?api_key=${encodeURIComponent(apiKey)}`);
      if (!resp.ok) {
        setError(resp.status === 403 ? "Неверный API-ключ" : "Не удалось загрузить историю");
        return;
      }
      const data = await resp.json();
      setRecords(data);
      setError("");
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (loading) {
    return (
      <div className="d-flex align-items-center gap-2 py-3" style={{ fontSize: "0.8125rem", color: "#6e7681" }}>
        <div className="idle-spinner" style={{ width: "16px", height: "16px" }} />
        Загрузка...
      </div>
    );
  }
  if (error) {
    return <div className="alert alert-danger py-2" style={{ fontSize: "0.8125rem" }}>{error}</div>;
  }

  return (
    <HistoryTable
      records={records}
      expandedLogs={expandedLogs}
      expandedConfig={expandedConfig}
      expandedErrors={expandedErrors}
      onToggleLogs={toggleLogs}
      onToggleConfig={toggleConfig}
      onToggleError={toggleError}
    />
  );
}

export default UsageHistory;
