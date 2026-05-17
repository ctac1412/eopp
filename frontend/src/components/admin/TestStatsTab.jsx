import React from "react";

export function TestStatsTab({ testStats, testStatsLoading }) {
  return (
    <div>
      <h2 className="fs-5 mb-3 fw-semibold">Статистика тестовых кейсов</h2>
      {testStatsLoading && !testStats && (
        <div className="admin-loading">Загрузка…</div>
      )}
      {testStats && (
        <div className="row g-3" style={{ maxWidth: "400px" }}>
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
    </div>
  );
}
