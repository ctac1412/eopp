import React, { useState, useEffect, useCallback } from "react";
import { adminHeaders, adminHeadersJson } from "../../features/admin/shared/adminClient";

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

export function CompaniesTab({ adminToken, onError }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", aliases: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch("/admin/companies", {
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch (err) {
      onError?.("Ошибка загрузки компаний: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", aliases: "", notes: "" });
    setShowModal(true);
  };

  const openEdit = (company) => {
    setEditingId(company.id);
    setForm({
      name: company.name || "",
      aliases: Array.isArray(company.aliases) ? company.aliases.join("\n") : "",
      notes: company.notes || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    const aliasesArray = form.aliases
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const body = {
      name: form.name.trim(),
      aliases: aliasesArray.length > 0 ? aliasesArray : null,
      notes: form.notes.trim() || null,
    };

    try {
      const url = editingId
        ? `/admin/companies/${editingId}`
        : "/admin/companies";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setShowModal(false);
      setEditingId(null);
      setForm({ name: "", aliases: "", notes: "" });
      await fetchCompanies();
    } catch (err) {
      onError?.("Ошибка сохранения компании: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/admin/companies/${deleteId}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleteId(null);
      await fetchCompanies();
    } catch (err) {
      onError?.("Ошибка удаления компании: " + err.message);
    }
  };

  if (loading) {
    return <div className="text-center text-muted py-3">Загрузка…</div>;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0" style={{ color: "#f0f6fc" }}>Компании</h6>
        <button className="btn btn-sm btn-primary" onClick={openCreate}>
          + Добавить компанию
        </button>
      </div>

      {companies.length === 0 && !loading && (
        <div className="text-center text-muted py-3">Нет компаний</div>
      )}

      {companies.length > 0 && (
        <div className="table-responsive">
          <table className="table table-sm table-hover table-bordered align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: "50px" }}>ID</th>
                <th>Название</th>
                <th style={{ width: "250px" }}>Алиасы</th>
                <th>Заметки</th>
                <th style={{ width: "140px" }}>Дата создания</th>
                <th style={{ width: "120px" }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td className="text-center fw-bold">{c.id}</td>
                  <td className="fw-semibold">{c.name}</td>
                  <td>
                    {Array.isArray(c.aliases) && c.aliases.length > 0 ? (
                      <div className="d-flex flex-wrap gap-1">
                        {c.aliases.map((alias, i) => (
                          <span
                            key={i}
                            className="badge bg-secondary"
                            style={{ fontSize: "0.7rem" }}
                          >
                            {alias}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="small" style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.notes || "—"}
                  </td>
                  <td className="text-nowrap small">{formatDate(c.created_at)}</td>
                  <td>
                    <div className="d-flex gap-1">
                      <button
                        className="btn btn-sm btn-outline-primary"
                        style={{ fontSize: "0.7rem" }}
                        onClick={() => openEdit(c)}
                      >
                        изменить
                      </button>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        style={{ fontSize: "0.7rem" }}
                        onClick={() => setDeleteId(c.id)}
                      >
                        удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {editingId ? "Редактировать компанию" : "Добавить компанию"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label className="form-label">Название *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={form.name}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, name: e.target.value }))
                      }
                      placeholder="ООО Компания"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">
                      Алиасы
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "#8b949e",
                          marginLeft: 6,
                        }}
                      >
                        (по одному на строку)
                      </span>
                    </label>
                    <textarea
                      className="form-control"
                      rows={4}
                      value={form.aliases}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, aliases: e.target.value }))
                      }
                      placeholder={"ООО Ромашка\nRomashka Ltd"}
                      style={{
                        background: "#0d1117",
                        color: "#c9d1d9",
                        border: "1px solid #30363d",
                      }}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Заметки</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={form.notes}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, notes: e.target.value }))
                      }
                      placeholder="Любые заметки…"
                      style={{
                        background: "#0d1117",
                        color: "#c9d1d9",
                        border: "1px solid #30363d",
                      }}
                    />
                  </div>
                </form>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Отмена
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={handleSubmit}
                  disabled={saving}
                >
                  {saving
                    ? "Сохранение…"
                    : editingId
                      ? "Сохранить"
                      : "Создать"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => e.target === e.currentTarget && setDeleteId(null)}
        >
          <div
            className="modal-dialog modal-dialog-centered modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Подтверждение</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setDeleteId(null)}
                ></button>
              </div>
              <div className="modal-body">
                <p>
                  Вы уверены, что хотите удалить эту компанию? Это действие
                  нельзя отменить.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => setDeleteId(null)}
                >
                  Отмена
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={handleDelete}
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
