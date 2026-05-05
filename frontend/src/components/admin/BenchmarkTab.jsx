import React from "react";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BenchmarkTab({ benchmark, benchmarkLoading, benchmarkRunning, onRunBenchmark, adminToken }) {
  return (
    <div>
      <h2 style={{ fontSize: "16px", marginBottom: "12px", fontWeight: 600 }}>
        Бенчмарк решателя капч
      </h2>
      <button
        className="admin-btn-primary"
        onClick={() => onRunBenchmark(adminToken)}
        disabled={benchmarkRunning}
        style={{ marginBottom: "16px" }}
      >
        {benchmarkRunning ? "Выполняется…" : "Запустить бенчмарк"}
      </button>
      {benchmarkLoading && !benchmark && (
        <div className="admin-loading">Загрузка…</div>
      )}
      {benchmark && (
        <div>
          {benchmark.error ? (
            <div
              style={{
                padding: "12px",
                background: "#2a1a1a",
                borderRadius: "8px",
                border: "1px solid #4a2a2a",
                color: "#f87171",
                whiteSpace: "pre-wrap",
                fontSize: "13px",
              }}
            >
              Ошибка: {benchmark.error}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "12px",
                marginBottom: "16px",
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
                  style={{
                    fontSize: "12px",
                    color: "#888",
                    marginBottom: "4px",
                  }}
                >
                  Всего тестов
                </div>
                <div style={{ fontSize: "28px", fontWeight: 700 }}>
                  {benchmark.total}
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
                  style={{
                    fontSize: "12px",
                    color: "#888",
                    marginBottom: "4px",
                  }}
                >
                  Пройдено
                </div>
                <div
                  style={{
                    fontSize: "28px",
                    fontWeight: 700,
                    color: "#4ade80",
                  }}
                >
                  {benchmark.passed}
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
                  style={{
                    fontSize: "12px",
                    color: "#888",
                    marginBottom: "4px",
                  }}
                >
                  Покрытие
                </div>
                <div
                  style={{
                    fontSize: "28px",
                    fontWeight: 700,
                    color:
                      benchmark.coverage_percent >= 90
                        ? "#4ade80"
                        : benchmark.coverage_percent >= 70
                          ? "#f59e0b"
                          : "#f87171",
                  }}
                >
                  {benchmark.coverage_percent}%
                </div>
              </div>
            </div>
          )}
          {benchmark.last_run_timestamp && (
            <div style={{ fontSize: "12px", color: "#666" }}>
              Последний запуск: {formatDate(benchmark.last_run_timestamp)}
            </div>
          )}
          {benchmark.best_config && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px",
                background: "#1a1a2e",
                borderRadius: "8px",
                border: "1px solid #2a2a4a",
                fontSize: "13px",
                fontFamily: "monospace",
              }}
            >
              <div style={{ color: "#888", marginBottom: "4px" }}>
                Лучший конфиг:
              </div>
              <div>
                edge_trim={benchmark.best_config.edge_trim} W_DISC=
                {benchmark.best_config.W_DISC} W_SSIM=
                {benchmark.best_config.W_SSIM} W_COH=
                {benchmark.best_config.W_COH} W_SOBEL=
                {benchmark.best_config.W_SOBEL}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}