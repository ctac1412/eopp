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

export function TestBenchmarkTab({ testStats, testStatsLoading, benchmark, benchmarkLoading, benchmarkRunning, onRunBenchmark, adminToken }) {
  return (
    <div>
      <h5 className="text-muted mb-3">Тесткейсы</h5>
      {testStatsLoading && !testStats && (
        <div className="admin-loading">Загрузка…</div>
      )}
      {testStats && (
        <div className="row g-3 mb-4" style={{ maxWidth: "400px" }}>
          <div className="col-6">
            <div className="card">
              <div className="card-body">
                <h6 className="card-subtitle mb-1 text-muted">Помеченные (valid/)</h6>
                <p className="card-text fs-4 fw-bold text-success mb-0">{testStats.labeled_count}</p>
              </div>
            </div>
          </div>
          <div className="col-6">
            <div className="card">
              <div className="card-body">
                <h6 className="card-subtitle mb-1 text-muted">Без пометки (no_valid/)</h6>
                <p className="card-text fs-4 fw-bold text-warning mb-0">{testStats.unlabeled_count}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <h5 className="text-muted mb-3">Бенчмарк решателя</h5>
      <button
        className="btn btn-primary mb-3"
        onClick={() => onRunBenchmark(adminToken)}
        disabled={benchmarkRunning}
      >
        {benchmarkRunning ? "Выполняется…" : "Запустить бенчмарк"}
      </button>
      {benchmarkLoading && !benchmark && (
        <div className="admin-loading">Загрузка…</div>
      )}
      {benchmark && (
        <div>
          {benchmark.error ? (
            <div className="alert alert-danger mb-3" style={{ whiteSpace: "pre-wrap" }}>
              Ошибка: {benchmark.error}
            </div>
          ) : (
            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <h6 className="card-subtitle mb-1 text-muted">Всего тестов</h6>
                    <p className="card-text fs-4 fw-bold mb-0">{benchmark.total}</p>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <h6 className="card-subtitle mb-1 text-muted">Пройдено</h6>
                    <p className="card-text fs-4 fw-bold text-success mb-0">{benchmark.passed}</p>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <h6 className="card-subtitle mb-1 text-muted">Покрытие</h6>
                    <p
                      className={`card-text fs-4 fw-bold mb-0 ${
                        benchmark.coverage_percent >= 90
                          ? "text-success"
                          : benchmark.coverage_percent >= 70
                            ? "text-warning"
                            : "text-danger"
                      }`}
                    >
                      {benchmark.coverage_percent}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {benchmark.last_run_timestamp && (
            <div className="text-muted small">
              Последний запуск: {formatDate(benchmark.last_run_timestamp)}
            </div>
          )}
          {benchmark.best_config && (
            <div className="card mt-3">
              <div className="card-body">
                <div className="text-muted mb-2">Лучший конфиг:</div>
                <div className="font-monospace">
                  edge_trim={benchmark.best_config.edge_trim} W_DISC={benchmark.best_config.W_DISC} W_SSIM={benchmark.best_config.W_SSIM} W_COH={benchmark.best_config.W_COH} W_SOBEL={benchmark.best_config.W_SOBEL}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
