import React, { useState, useEffect, useCallback } from "react";
import { HistoryTable } from "./history/HistoryTable";

function UsageHistory({ apiKey }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedLogs, setExpandedLogs] = useState({});
  const [expandedConfig, setExpandedConfig] = useState({});
  const [expandedErrors, setExpandedErrors] = useState({});

  const toggleLogs = (id) => {
    setExpandedLogs((p) => ({ ...p, [id]: !p[id] }));
  };

  const toggleConfig = (id) => {
    setExpandedConfig((p) => ({ ...p, [id]: !p[id] }));
  };

  const toggleError = (id) => {
    setExpandedErrors((p) => ({ ...p, [id]: !p[id] }));
  };

  const fetchLogs = useCallback(async () => {
    if (!apiKey) {
      setError("API-ключ не установлен");
      setLoading(false);
      return;
    }
    try {
      const resp = await fetch(
        `/usage-log?api_key=${encodeURIComponent(apiKey)}`,
      );
      if (!resp.ok) {
        if (resp.status === 403) {
          setError("Неверный API-ключ");
        } else {
          setError("Не удалось загрузить историю");
        }
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

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  if (loading) {
    return <div className="admin-history-loading">Загрузка истории...</div>;
  }
  if (error) {
    return <div className="admin-history-error">{error}</div>;
  }

  return (
    <div>
      <HistoryTable
        records={records}
        expandedLogs={expandedLogs}
        expandedConfig={expandedConfig}
        expandedErrors={expandedErrors}
        onToggleLogs={toggleLogs}
        onToggleConfig={toggleConfig}
        onToggleError={toggleError}
      />
    </div>
  );
}

export default UsageHistory;
