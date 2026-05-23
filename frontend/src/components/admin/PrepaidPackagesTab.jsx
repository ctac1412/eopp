import React, { useMemo, useState } from "react";
import { formatMoney } from "../../utils/format";

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PrepaidPackagesTab({
  packages,
  deductions,
  keys,
  onCreate,
  onUpdate,
  onDelete,
  onTopUp,
  onRefresh,
}) {
  const [form, setForm] = useState({ api_key_id: "", balance_amount: "", active: true });
  const [topUpPackage, setTopUpPackage] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState("");

  const keyOptions = useMemo(
    () => (keys || []).map((key) => ({ id: key.id, label: key.label || `#${key.id}` })),
    [keys],
  );

  const keyById = useMemo(() => {
    const map = new Map();
    keyOptions.forEach((key) => map.set(key.id, key.label));
    return map;
  }, [keyOptions]);

  const totals = useMemo(() => {
    const active = packages.filter((pkg) => pkg.active);
    const balance = packages.reduce((sum, pkg) => sum + Number(pkg.balance_amount || 0), 0);
    const deducted = deductions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { active: active.length, balance, deducted };
  }, [packages, deductions]);

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

  const submitTopUp = async (e) => {
    e.preventDefault();
    if (!topUpPackage || !topUpAmount) return;
    await onTopUp(topUpPackage.id, Number(topUpAmount));
    setTopUpPackage(null);
    setTopUpAmount("");
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex gap-2 align-items-center">
          <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh}>
            Обновить
          </button>
          <span className="text-muted small">Пакетов: {packages.length}</span>
        </div>
      </div>

      <div className="row g-2 mb-3">
        <div className="col-6 col-xl-3">
          <div className="border-start border-4 border-primary bg-dark-subtle rounded px-2 py-1 h-100">
            <div className="text-secondary-emphasis small">Активных</div>
            <div className="fw-semibold text-light">{totals.active}</div>
          </div>
        </div>
        <div className="col-6 col-xl-3">
          <div className="border-start border-4 border-success bg-dark-subtle rounded px-2 py-1 h-100">
            <div className="text-secondary-emphasis small">Баланс</div>
            <div className="fw-semibold text-light">{formatMoney(totals.balance)}</div>
          </div>
        </div>
        <div className="col-6 col-xl-3">
          <div className="border-start border-4 border-warning bg-dark-subtle rounded px-2 py-1 h-100">
            <div className="text-secondary-emphasis small">Списано</div>
            <div className="fw-semibold text-light">{formatMoney(totals.deducted)}</div>
          </div>
        </div>
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
          <label className="form-label small mb-1">Начальный баланс</label>
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

      <div className="table-responsive mb-4">
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
                  <td>{keyById.get(pkg.api_key_id) || `#${pkg.api_key_id}`}</td>
                  <td className="text-end">{formatMoney(pkg.balance_amount)}</td>
                  <td className="text-center">
                    <span className={`badge ${pkg.active ? "bg-success" : "bg-secondary"}`}>
                      {pkg.active ? "Да" : "Нет"}
                    </span>
                  </td>
                  <td className="small text-nowrap">{formatDate(pkg.updated_at)}</td>
                  <td className="text-center text-nowrap">
                    <button
                      className="btn btn-sm btn-outline-success me-1"
                      onClick={() => setTopUpPackage(pkg)}
                    >
                      Пополнить
                    </button>
                    <button
                      className="btn btn-sm btn-outline-primary me-1"
                      onClick={() =>
                        onUpdate(pkg.id, {
                          balance_amount: pkg.balance_amount,
                          active: !pkg.active,
                        })
                      }
                    >
                      {pkg.active ? "Выключить" : "Включить"}
                    </button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => onDelete(pkg.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h6 className="mb-2">Журнал списаний</h6>
      <div className="table-responsive">
        <table className="table table-sm table-hover table-bordered align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>ID</th>
              <th>Дата</th>
              <th>Пакет</th>
              <th>Ключ</th>
              <th>Лог</th>
              <th>Компания</th>
              <th className="text-end">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {deductions.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-3">
                  Списаний пока нет
                </td>
              </tr>
            ) : (
              deductions.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td className="small text-nowrap">{formatDate(item.created_at)}</td>
                  <td>#{item.package_id}</td>
                  <td>{item.key_label || keyById.get(item.api_key_id) || `#${item.api_key_id}`}</td>
                  <td>#{item.usage_log_id}</td>
                  <td>{item.company || "—"}</td>
                  <td className="text-end">{formatMoney(item.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {topUpPackage && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered">
            <form className="modal-content" onSubmit={submitTopUp}>
              <div className="modal-header">
                <h5 className="modal-title">Пополнение предоплаты #{topUpPackage.id}</h5>
                <button type="button" className="btn-close" onClick={() => setTopUpPackage(null)} />
              </div>
              <div className="modal-body">
                <label className="form-label small">Сумма пополнения</label>
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setTopUpPackage(null)}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary">
                  Пополнить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
