import React, { useMemo, useState } from "react";

function formatMoney(amount) {
  return `${Math.round(Number(amount || 0)).toLocaleString("ru-RU")} ₽`;
}

export function PrepaidPackagesTab({ packages, keys, onCreate, onUpdate, onDelete, onRefresh }) {
  const [form, setForm] = useState({ api_key_id: "", balance_amount: "", active: true });

  const keyOptions = useMemo(
    () => (keys || []).map((key) => ({ id: key.id, label: key.label || `#${key.id}` })),
    [keys],
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.api_key_id) return;
    await onCreate({
      api_key_id: Number(form.api_key_id),
      balance_amount: Number(form.balance_amount || 0),
      active: !!form.active,
    });
    setForm((prev) => ({ ...prev, balance_amount: "" }));
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0">Предоплаченные пакеты</h6>
        <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh}>
          Обновить
        </button>
      </div>

      <form className="row g-2 align-items-end mb-3" onSubmit={handleCreate}>
        <div className="col-12 col-lg-4">
          <label className="form-label small mb-1">API ключ</label>
          <select
            className="form-select form-select-sm"
            value={form.api_key_id}
            onChange={(e) => setForm((prev) => ({ ...prev, api_key_id: e.target.value }))}
            required
          >
            <option value="">Выбери ключ</option>
            {keyOptions.map((key) => (
              <option key={key.id} value={key.id}>
                {key.label} (#{key.id})
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-lg-3">
          <label className="form-label small mb-1">Баланс</label>
          <input
            className="form-control form-control-sm"
            type="number"
            min="0"
            value={form.balance_amount}
            onChange={(e) => setForm((prev) => ({ ...prev, balance_amount: e.target.value }))}
            required
          />
        </div>
        <div className="col-6 col-lg-2">
          <label className="form-label small mb-1">Активен</label>
          <select
            className="form-select form-select-sm"
            value={form.active ? "1" : "0"}
            onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.value === "1" }))}
          >
            <option value="1">Да</option>
            <option value="0">Нет</option>
          </select>
        </div>
        <div className="col-12 col-lg-3">
          <button className="btn btn-sm btn-primary w-100" type="submit">
            Добавить пакет
          </button>
        </div>
      </form>

      <div className="table-responsive">
        <table className="table table-sm table-hover table-bordered align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>ID</th>
              <th>Ключ</th>
              <th className="text-end">Баланс</th>
              <th className="text-center">Активен</th>
              <th>Обновлен</th>
              <th className="text-center">Действия</th>
            </tr>
          </thead>
          <tbody>
            {packages.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted py-3">
                  Нет пакетов
                </td>
              </tr>
            ) : (
              packages.map((pkg) => (
                <tr key={pkg.id}>
                  <td>{pkg.id}</td>
                  <td>#{pkg.api_key_id}</td>
                  <td className="text-end">{formatMoney(pkg.balance_amount)}</td>
                  <td className="text-center">
                    <span className={`badge ${pkg.active ? "bg-success" : "bg-secondary"}`}>
                      {pkg.active ? "Да" : "Нет"}
                    </span>
                  </td>
                  <td className="small text-nowrap">{pkg.updated_at || "—"}</td>
                  <td className="text-center text-nowrap">
                    <button
                      className="btn btn-sm btn-outline-primary me-1"
                      onClick={() =>
                        onUpdate(pkg.id, {
                          balance_amount: pkg.balance_amount,
                          active: !pkg.active,
                        })
                      }
                      title="Переключить active"
                    >
                      active
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => onDelete(pkg.id)}
                      title="Удалить пакет"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
