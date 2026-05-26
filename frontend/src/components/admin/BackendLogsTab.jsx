import React, { useCallback, useEffect, useState } from "react";

export function BackendLogsTab({ adminToken, onError }) {
  const [lines, setLines] = useState([]);
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);

  const fetchLogs = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    try {
      const res = await fetch("/admin/backend-logs?lines=300", {
        headers: { "X-Admin-Token": adminToken },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setLines(Array.isArray(data.lines) ? data.lines : []);
      setPath(data.path || "");
      setLoadedAt(new Date());
    } catch (err) {
      setLines([]);
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h2 className="fs-6 fw-semibold mb-1">Backend logs</h2>
          <div className="small text-muted">
            {path || "data/backend.log"}
            {loadedAt ? ` · ${loadedAt.toLocaleTimeString("ru-RU")}` : ""}
          </div>
        </div>
        <button className="btn btn-sm btn-outline-primary" onClick={fetchLogs} disabled={loading}>
          {loading ? "Обновление..." : "Обновить"}
        </button>
      </div>

      <div
        className="border rounded"
        style={{
          height: "70vh",
          overflow: "auto",
          background: "#111318",
          color: "#d7dde8",
          fontFamily: "var(--bs-font-monospace)",
          fontSize: "0.75rem",
          lineHeight: 1.45,
        }}
      >
        {lines.length === 0 ? (
          <div className="p-3 text-muted">
            {loading ? "Загрузка..." : "Лог пуст или недоступен"}
          </div>
        ) : (
          <div className="p-2">
            {lines.map((line, index) => (
              <div key={`${index}-${line}`} style={{ whiteSpace: "pre-wrap" }}>
                <span className="text-secondary me-2">{String(index + 1).padStart(3, "0")}</span>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
