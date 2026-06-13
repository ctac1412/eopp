import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Alert, Pagination, Spin } from "antd";
import { HistoryTable } from "./history/HistoryTable";
import { Toolbar } from "../ui";

function UsageHistory({ apiKey }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedLogs, setExpandedLogs] = useState({});
  const [expandedConfig, setExpandedConfig] = useState({});
  const [expandedErrors, setExpandedErrors] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

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
      setPage(1);
      setError("");
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(records.length / pageSize));
    setPage((current) => Math.min(current, lastPage));
  }, [records.length, pageSize]);

  const pagedRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return records.slice(start, start + pageSize);
  }, [page, pageSize, records]);

  if (loading) {
    return (
      <div data-eopp-component="UsageHistoryLoading" className="usage-history-state">
        <Spin size="small" />
        Загрузка...
      </div>
    );
  }
  if (error) {
    return (
      <Alert
        data-eopp-component="UsageHistoryError"
        type="error"
        showIcon
        message={error}
      />
    );
  }

  return (
    <div data-eopp-component="UsageHistory" className="usage-history">
      <Toolbar
        className="usage-history__toolbar"
        left={
          <span className="usage-history__summary">
            Показано: {records.length === 0 ? 0 : (page - 1) * pageSize + 1}
            -{Math.min(page * pageSize, records.length)} из {records.length}
          </span>
        }
        right={
          <Pagination
            data-eopp-component="UsageHistoryPagination"
            current={page}
            pageSize={pageSize}
            total={records.length}
            showSizeChanger
            pageSizeOptions={[10, 15, 25, 50]}
            locale={{ items_per_page: "" }}
            onChange={(nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            }}
            size="small"
          />
        }
      />
      <HistoryTable
        records={pagedRecords}
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
