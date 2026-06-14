import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Input, InputNumber, Modal, Space } from "antd";
import {
  Button,
  DataTable,
  FilterBar,
  MetricsStrip,
  TextInput,
  Toolbar,
} from "../../../ui";
import { adminHeaders, adminHeadersJson, adminRequest } from "../shared/adminClient";

function formatDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseAliases(value) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function clip(value, length = 120) {
  if (!value) return "—";
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function CompanyAccessRoleSection({ kind, label, users, selectedIds, onDrop, onToggle }) {
  return (
    <section
      className="user-access-block mb-2"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(kind, event)}
    >
      <div className="user-access-block__head">
        <span className="fw-semibold">{label}</span>
      </div>
      <div className="operator-master-tags user-access-block__source">
        {users.map((user) => {
          const selected = selectedIds.has(Number(user.id));
          return (
            <button
              type="button"
              key={user.id}
              className={`operator-master-tag access-tag ${
                selected ? "access-tag--selected" : "access-tag--available"
              }`}
              onClick={() => onToggle(kind, user.id)}
            >
              <span
                className="access-tag__drag-icon"
                draggable
                onClick={(event) => event.stopPropagation()}
                onDragStart={(event) => event.dataTransfer.setData("text/plain", String(user.id))}
                title="Перетащить"
              />
              <span className="access-tag__text">{user.name || user.login || `#${user.id}`}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CompanyAccessRoleSectionV2({ kind, label, users, selectedIds, onDrop, onToggle }) {
  const selectedUsers = users.filter((user) => selectedIds.has(Number(user.id)));
  const availableUsers = users.filter((user) => !selectedIds.has(Number(user.id)));

  return (
    <section className="user-access-block mb-2">
      <div className="user-access-block__head">
        <span className="fw-semibold">{label}</span>
      </div>
      <div className="user-access-block__label">Доступные</div>
      <div className="operator-master-tags user-access-block__source">
        {availableUsers.map((user) => (
          <button
            type="button"
            key={user.id}
            className="operator-master-tag access-tag access-tag--available"
            onClick={() => onToggle(kind, user.id)}
          >
            <span
              className="access-tag__drag-icon"
              draggable
              onClick={(event) => event.stopPropagation()}
              onDragStart={(event) => event.dataTransfer.setData("text/plain", String(user.id))}
              title="Перетащить"
            />
            <span className="access-tag__text">{user.name || user.login || `#${user.id}`}</span>
          </button>
        ))}
        {availableUsers.length === 0 && <span className="text-muted">Все пользователи добавлены</span>}
      </div>
      <div className="user-access-block__label">Добавленные</div>
      <div
        className="user-access-block__drop"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => onDrop(kind, event)}
      >
        {selectedUsers.map((user) => (
          <button
            type="button"
            key={user.id}
            className="operator-master-tag access-tag access-tag--selected"
            onClick={() => onToggle(kind, user.id)}
          >
            <span className="access-tag__text">{user.name || user.login || `#${user.id}`}</span>
          </button>
        ))}
        {selectedUsers.length === 0 && (
          <span className="text-muted">Перетащите сюда или кликните красный тег</span>
        )}
      </div>
    </section>
  );
}

export function CompaniesTab({ adminToken, onError }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", aliases: "", notes: "" });
  const [tariffCompany, setTariffCompany] = useState(null);
  const [tariffForm, setTariffForm] = useState({
    price_create: "",
    price_reschedule: "",
    price_create_peak: "",
    price_custom_slots: "",
    executor_amount: "",
  });
  const [tariffSaving, setTariffSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [accessCompany, setAccessCompany] = useState(null);
  const [accessUsers, setAccessUsers] = useState([]);
  const [accessDraft, setAccessDraft] = useState({ finance: [], operator: [], executor: [] });
  const [accessSaving, setAccessSaving] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminRequest("/admin/companies", {
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch (err) {
      onError?.(`Ошибка загрузки компаний: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((company) =>
      [
        company.id,
        company.name,
        company.notes,
        ...(Array.isArray(company.aliases) ? company.aliases : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [companies, search]);

  const metrics = useMemo(() => {
    const aliasesCount = companies.reduce(
      (total, company) => total + (Array.isArray(company.aliases) ? company.aliases.length : 0),
      0,
    );
    const withNotes = companies.filter((company) => company.notes).length;
    return [
      { key: "companies", label: "Компании", value: companies.length, tone: companies.length > 0 ? "info" : "neutral" },
      { key: "aliases", label: "Алиасы", value: aliasesCount, tone: aliasesCount > 0 ? "success" : "neutral" },
      { key: "notes", label: "С заметками", value: withNotes, tone: withNotes > 0 ? "info" : "neutral" },
      { key: "visible", label: "В выборке", value: filteredCompanies.length, tone: filteredCompanies.length === companies.length ? "neutral" : "warning" },
    ];
  }, [companies, filteredCompanies.length]);

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

  const saveCompany = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const aliasesArray = parseAliases(form.aliases);
    const body = {
      name: form.name.trim(),
      aliases: aliasesArray.length > 0 ? aliasesArray : null,
      notes: form.notes.trim() || null,
    };

    try {
      const url = editingId ? `/admin/companies/${editingId}` : "/admin/companies";
      const method = editingId ? "PUT" : "POST";
      const res = await adminRequest(url, {
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
      onError?.(`Ошибка сохранения компании: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteCompany = (company) => {
    Modal.confirm({
      title: "Удалить компанию?",
      content: `Компания "${company.name}" будет удалена. Это действие нельзя отменить.`,
      okText: "Удалить",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: async () => {
        try {
          const res = await adminRequest(`/admin/companies/${company.id}`, {
            method: "DELETE",
            headers: adminHeadersJson(adminToken),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await fetchCompanies();
        } catch (err) {
          onError?.(`Ошибка удаления компании: ${err.message}`);
        }
      },
    });
  };

  const openTariff = async (company) => {
    setTariffCompany(company);
    setTariffForm({
      price_create: "",
      price_reschedule: "",
      price_create_peak: "",
      price_custom_slots: "",
      executor_amount: "",
    });
    try {
      const res = await adminRequest(`/admin/company-tariffs/${company.id}`, {
        headers: adminHeadersJson(adminToken),
      });
      if (res.status === 404) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTariffForm({
        price_create: data.price_create ?? "",
        price_reschedule: data.price_reschedule ?? "",
        price_create_peak: data.price_create_peak ?? "",
        price_custom_slots: data.price_custom_slots ?? "",
        executor_amount: data.executor_amount ?? "",
      });
    } catch (err) {
      onError?.(`Company tariff load failed: ${err.message}`);
    }
  };

  const saveTariff = async () => {
    if (!tariffCompany) return;
    setTariffSaving(true);
    try {
      const body = {
        price_create: Number(tariffForm.price_create) || 0,
        price_reschedule: Number(tariffForm.price_reschedule) || 0,
        price_create_peak: tariffForm.price_create_peak === "" ? null : Number(tariffForm.price_create_peak),
        price_custom_slots: tariffForm.price_custom_slots === "" ? null : Number(tariffForm.price_custom_slots),
        executor_amount: Number(tariffForm.executor_amount) || 0,
      };
      const res = await adminRequest(`/admin/company-tariffs/${tariffCompany.id}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTariffCompany(null);
    } catch (err) {
      onError?.(`Company tariff save failed: ${err.message}`);
    } finally {
      setTariffSaving(false);
    }
  };

  const deleteTariff = async () => {
    if (!tariffCompany) return;
    setTariffSaving(true);
    try {
      const res = await adminRequest(`/admin/company-tariffs/${tariffCompany.id}`, {
        method: "DELETE",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      setTariffCompany(null);
    } catch (err) {
      onError?.(`Company tariff delete failed: ${err.message}`);
    } finally {
      setTariffSaving(false);
    }
  };

  const openAccess = async (company) => {
    setAccessCompany(company);
    setAccessDraft({ finance: [], operator: [], executor: [] });
    try {
      const [usersRes, accessRes] = await Promise.all([
        adminRequest("/admin/users", { headers: adminHeadersJson(adminToken) }),
        adminRequest(`/admin/company-access?company_id=${company.id}`, { headers: adminHeadersJson(adminToken) }),
      ]);
      if (!usersRes.ok || !accessRes.ok) throw new Error(`HTTP ${usersRes.status}/${accessRes.status}`);
      const usersData = await usersRes.json();
      const accessData = await accessRes.json();
      setAccessUsers(Array.isArray(usersData) ? usersData : []);
      setAccessDraft({
        finance: accessData.finance?.user_ids || [],
        operator: accessData.operator?.user_ids || [],
        executor: accessData.executor?.user_ids || [],
      });
    } catch (err) {
      onError?.(`Access load failed: ${err.message}`);
    }
  };

  const addAccessUser = (kind, userId) => {
    setAccessDraft((prev) => ({
      ...prev,
      [kind]: Array.from(new Set([...(prev[kind] || []), userId])),
    }));
  };

  const dropAccessUser = (kind, event) => {
    event.preventDefault();
    const userId = Number(event.dataTransfer.getData("text/plain"));
    if (!userId) return;
    addAccessUser(kind, userId);
  };

  const removeAccessUser = (kind, userId) => {
    setAccessDraft((prev) => ({
      ...prev,
      [kind]: (prev[kind] || []).filter((id) => Number(id) !== Number(userId)),
    }));
  };

  const toggleAccessUser = (kind, userId) => {
    const selected = (accessDraft[kind] || []).some((id) => Number(id) === Number(userId));
    if (selected) {
      removeAccessUser(kind, userId);
    } else {
      addAccessUser(kind, userId);
    }
  };

  const saveAccess = async () => {
    if (!accessCompany) return;
    setAccessSaving(true);
    try {
      const res = await adminRequest(`/admin/company-access/${accessCompany.id}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          finance_user_ids: accessDraft.finance || [],
          operator_user_ids: accessDraft.operator || [],
          executor_user_ids: accessDraft.executor || [],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAccessCompany(null);
    } catch (err) {
      onError?.(`Access save failed: ${err.message}`);
    } finally {
      setAccessSaving(false);
    }
  };

  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      width: 70,
      render: (value) => <span className="text-muted">#{value}</span>,
    },
    {
      title: "Название",
      dataIndex: "name",
      width: 240,
      ellipsis: true,
      render: (value) => <span className="fw-semibold">{value}</span>,
    },
    {
      title: "Алиасы",
      dataIndex: "aliases",
      width: 320,
      render: (aliases) => {
        if (!Array.isArray(aliases) || aliases.length === 0) return <span className="text-muted">—</span>;
        return (
          <div className="company-alias-tags">
            {aliases.map((alias) => (
              <span key={alias} className="company-alias-tag" title={alias}>
                {alias}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      title: "Заметки",
      dataIndex: "notes",
      ellipsis: true,
      render: (value) => <span title={value || "—"}>{clip(value)}</span>,
    },
    {
      title: "Создана",
      dataIndex: "created_at",
      width: 210,
      render: formatDate,
    },
    {
      title: "",
      width: 150,
      align: "right",
      render: (_, company) => (
        <Space size={4}>
          <Button size="small" onClick={() => openAccess(company)}>Access</Button>
          <Button size="small" onClick={() => openTariff(company)}>Tariff</Button>
          <Button size="small" onClick={() => openEdit(company)}>Изм.</Button>
          <Button size="small" variant="danger" onClick={() => deleteCompany(company)}>Удал.</Button>
        </Space>
      ),
    },
  ];

  return (
    <div data-eopp-component="CompaniesTab" className="companies-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Компании</h2>
            <div className="small text-muted">
              CRM-справочник компаний, алиасов и заметок для биллинга и отчётов
            </div>
          </div>
        }
        right={
          <Space wrap>
            <Button size="small" onClick={fetchCompanies} loading={loading}>Обновить</Button>
            <Button size="small" variant="primary" onClick={openCreate}>Добавить компанию</Button>
          </Space>
        }
      />

      <MetricsStrip items={metrics} />

      <Card data-eopp-component="CompaniesListCard" className="mt-3" size="small" title="Список компаний">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0 companies-search">
            Поиск
            <TextInput
              size="small"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="название, алиас, заметка"
            />
          </label>
        </FilterBar>

        <DataTable
          className="companies-table"
          rowKey="id"
          data={filteredCompanies}
          columns={columns}
          loading={loading}
          emptyText="Нет компаний"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        />
      </Card>

      <Modal
        title={editingId ? "Редактировать компанию" : "Добавить компанию"}
        open={showModal}
        onOk={saveCompany}
        onCancel={() => setShowModal(false)}
        okText={editingId ? "Сохранить" : "Создать"}
        cancelText="Отмена"
        confirmLoading={saving}
        destroyOnHidden
      >
        <div className="companies-modal-form">
          <label className="form-label small mb-0">
            Название
            <TextInput
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="ООО Компания"
            />
          </label>
          <label className="form-label small mb-0">
            Алиасы
            <Input.TextArea
              data-eopp-component="CompaniesAliasesTextarea"
              className="companies-textarea"
              rows={5}
              value={form.aliases}
              onChange={(event) => setForm((prev) => ({ ...prev, aliases: event.target.value }))}
              placeholder={"ООО Ромашка\nRomashka Ltd"}
            />
          </label>
          <label className="form-label small mb-0">
            Заметки
            <Input.TextArea
              data-eopp-component="CompaniesNotesTextarea"
              className="companies-textarea"
              rows={4}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Любые заметки"
            />
          </label>
        </div>
      </Modal>

      <Modal
        title={tariffCompany ? `Company tariff: ${tariffCompany.name}` : "Company tariff"}
        open={!!tariffCompany}
        onOk={saveTariff}
        onCancel={() => setTariffCompany(null)}
        okText="Save"
        cancelText="Cancel"
        confirmLoading={tariffSaving}
        footer={(_, { OkBtn, CancelBtn }) => (
          <div className="key-form-footer">
            <Button size="small" variant="danger" onClick={deleteTariff} loading={tariffSaving}>
              Delete tariff
            </Button>
            <Space size={6}>
              <CancelBtn />
              <OkBtn />
            </Space>
          </div>
        )}
        destroyOnHidden
      >
        <div className="companies-modal-form">
          {[
            ["price_create", "Create"],
            ["price_reschedule", "Reschedule"],
            ["price_create_peak", "Create peak"],
            ["price_custom_slots", "Custom slots"],
            ["executor_amount", "Executor"],
          ].map(([field, label]) => (
            <label key={field} className="form-label small mb-0">
              {label}
              <InputNumber
                className="key-form-number"
                value={tariffForm[field] === "" || tariffForm[field] == null ? null : Number(tariffForm[field])}
                onChange={(value) => setTariffForm((prev) => ({ ...prev, [field]: value == null ? "" : value }))}
                min={0}
                controls={false}
              />
            </label>
          ))}
        </div>
      </Modal>

      <Modal
        title={accessCompany ? `Access: ${accessCompany.name}` : "Access"}
        open={!!accessCompany}
        onOk={saveAccess}
        onCancel={() => setAccessCompany(null)}
        okText="Save"
        cancelText="Cancel"
        confirmLoading={accessSaving}
        width={820}
        destroyOnHidden
      >
        <div className="company-access-modal">
          {[
            ["finance", "Финансы"],
            ["operator", "Операторы"],
            ["executor", "Исполнители"],
          ].map(([kind, label]) => {
            const selectedIds = new Set((accessDraft[kind] || []).map(Number));
            return (
              <CompanyAccessRoleSectionV2
                key={kind}
                kind={kind}
                label={label}
                users={accessUsers}
                selectedIds={selectedIds}
                onDrop={dropAccessUser}
                onToggle={toggleAccessUser}
              />
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
