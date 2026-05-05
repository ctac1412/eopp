import React from "react";

export function TestStatsTab({ testStats, testStatsLoading }) {
  return (
    <div>
      <h2 style={{ fontSize: "16px", marginBottom: "12px", fontWeight: 600 }}>
        Статистика тестовых кейсов
      </h2>
      {testStatsLoading && !testStats && (
        <div className="admin-loading">Загрузка…</div>
      )}
      {testStats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            maxWidth: "400px",
          }}
        >
          <div
            style={{
              padding: "16px",
              background: "#1a1a2e",
              borderRadius: "8px",
              border: "1px solid #2a2a4a",
            }}
          >
            <div
              style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}
            >
              Помеченные (valid/)
            </div>
            <div
              style={{ fontSize: "28px", fontWeight: 700, color: "#4ade80" }}
            >
              {testStats.labeled_count}
            </div>
          </div>
          <div
            style={{
              padding: "16px",
              background: "#1a1a2e",
              borderRadius: "8px",
              border: "1px solid #2a2a4a",
            }}
          >
            <div
              style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}
            >
              Без пометки (no_valid/)
            </div>
            <div
              style={{ fontSize: "28px", fontWeight: 700, color: "#f59e0b" }}
            >
              {testStats.unlabeled_count}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}