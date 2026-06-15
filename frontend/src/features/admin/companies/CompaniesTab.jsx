import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Checkbox, Input, InputNumber, Modal, Space } from "antd";
import {
  Button,
  DataTable,
  FilterBar,
  SelectInput,
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
    year: "2-digit",
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

function formatMoney(value) {
  if (value == null || value === "") return "—";
  const number = Number(value) || 0;
  return `${number.toLocaleString("ru-RU")} ₽`;
}

function renderTariffAmount(company, field) {
  return <span className="text-nowrap">{formatMoney(company.tariff?.[field])}</span>;
}

const EMPTY_TARIFF_FORM = {
  price_create: "",
  price_reschedule: "",
  price_create_peak: "",
  price_custom_slots: "",
  executor_amount: "",
  operator_amount: "",
};

const EMPTY_BILLING_DEFAULTS = {
  default_percent_rate: 0,
  default_tax_rate: 0,
  default_commission_user_id: null,
  default_tax_user_id: null,
};

const TAX_COMMISSION_MODE_OPTIONS = [
  { value: "added", label: "Сверху" },
  { value: "included", label: "Включено" },
];

function normalizeTaxCommissionMode(mode) {
  return mode === "included" ? "included" : "added";
}

const TARIFF_FIELDS = [
  ["price_create", "Создание"],
  ["price_reschedule", "Перенос"],
  ["price_create_peak", "Создание пик"],
  ["price_custom_slots", "Свои слоты"],
  ["operator_amount", "Оператор"],
  ["executor_amount", "Исполнитель"],
];

function tariffToForm(tariff) {
  return {
    price_create: tariff?.price_create ?? "",
    price_reschedule: tariff?.price_reschedule ?? "",
    price_create_peak: tariff?.price_create_peak ?? "",
    price_custom_slots: tariff?.price_custom_slots ?? "",
    executor_amount: tariff?.executor_amount ?? "",
    operator_amount: tariff?.operator_amount ?? "",
  };
}

function tariffFormToBody(form) {
  return {
    price_create: Number(form.price_create) || 0,
    price_reschedule: Number(form.price_reschedule) || 0,
    price_create_peak: form.price_create_peak === "" ? null : Number(form.price_create_peak),
    price_custom_slots: form.price_custom_slots === "" ? null : Number(form.price_custom_slots),
    executor_amount: Number(form.executor_amount) || 0,
    operator_amount: Number(form.operator_amount) || 0,
  };
}

function billingDefaultsFromSetting(setting) {
  return {
    default_percent_rate: Number(setting?.default_percent_rate) || 0,
    default_tax_rate: Number(setting?.default_tax_rate) || 0,
    default_commission_user_id: setting?.default_commission_user_id ?? null,
    default_tax_user_id: setting?.default_tax_user_id ?? null,
  };
}

function billingDefaultsToBody(defaults) {
  return {
    default_percent_rate: Number(defaults?.default_percent_rate) || 0,
    default_tax_rate: Number(defaults?.default_tax_rate) || 0,
    default_commission_user_id: defaults?.default_commission_user_id ?? null,
    default_tax_user_id: defaults?.default_tax_user_id ?? null,
  };
}

function CompanyTariffForm({
  form,
  onChange,
  taxCommissionMode,
  onTaxCommissionModeChange,
  billingDefaults,
  onBillingDefaultsChange,
  financeParticipants = [],
}) {
  const userOptions = financeParticipants.map((user) => ({
    value: user.id,
    label: user.name || user.login || `#${user.id}`,
  }));
  const updateBillingDefault = (field, value) => {
    onBillingDefaultsChange?.((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="company-tariff-form">
      <div className="company-tariff-form__grid">
        {TARIFF_FIELDS.map(([field, label]) => (
          <label key={field} className="company-tariff-field">
            <span className="company-tariff-field__label">{label}</span>
            <InputNumber
              className="company-tariff-field__input"
              value={form[field] === "" || form[field] == null ? null : Number(form[field])}
              onChange={(value) => onChange((prev) => ({ ...prev, [field]: value == null ? "" : value }))}
              min={0}
              controls={false}
            />
          </label>
        ))}
        {taxCommissionMode != null && (
          <label className="company-tariff-field company-tariff-field--wide">
            <span className="company-tariff-field__label">Тип комиссии и налога</span>
            <SelectInput
              className="company-tariff-field__select"
              value={taxCommissionMode}
              onChange={(value) => onTaxCommissionModeChange?.(normalizeTaxCommissionMode(value))}
              options={TAX_COMMISSION_MODE_OPTIONS}
              allowClear={false}
            />
          </label>
        )}
        {billingDefaults && (
          <>
            <label className="company-tariff-field">
              <span className="company-tariff-field__label">Комиссия по умолчанию, %</span>
              <InputNumber
                className="company-tariff-field__input"
                value={Number(billingDefaults.default_percent_rate) || 0}
                onChange={(value) => updateBillingDefault("default_percent_rate", value == null ? 0 : value)}
                min={0}
                controls={false}
              />
            </label>
            <label className="company-tariff-field">
              <span className="company-tariff-field__label">Налог по умолчанию, %</span>
              <InputNumber
                className="company-tariff-field__input"
                value={Number(billingDefaults.default_tax_rate) || 0}
                onChange={(value) => updateBillingDefault("default_tax_rate", value == null ? 0 : value)}
                min={0}
                controls={false}
              />
            </label>
            <label className="company-tariff-field company-tariff-field--wide">
              <span className="company-tariff-field__label">Получатель комиссии по умолчанию</span>
              <SelectInput
                className="company-tariff-field__select"
                value={billingDefaults.default_commission_user_id ?? undefined}
                onChange={(value) => updateBillingDefault("default_commission_user_id", value ?? null)}
                options={userOptions}
                placeholder="Не указан"
              />
            </label>
            <label className="company-tariff-field company-tariff-field--wide">
              <span className="company-tariff-field__label">Получатель налога по умолчанию</span>
              <SelectInput
                className="company-tariff-field__select"
                value={billingDefaults.default_tax_user_id ?? undefined}
                onChange={(value) => updateBillingDefault("default_tax_user_id", value ?? null)}
                options={userOptions}
                placeholder="Не указан"
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

const COMPANY_ACCESS_ROLES = [
  { key: "finance", label: "Финансы" },
  { key: "operator", label: "Операторы" },
  { key: "executor", label: "Исполнители" },
];

function userDisplayName(user) {
  return user.name || user.login || `#${user.id}`;
}

function CompanyAccessMatrix({ users, draft, search, onSearchChange, onToggle }) {
  const accessSets = useMemo(
    () =>
      Object.fromEntries(
        COMPANY_ACCESS_ROLES.map((role) => [
          role.key,
          new Set((draft[role.key] || []).map((id) => Number(id))),
        ]),
      ),
    [draft],
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) =>
      [user.id, user.name, user.login]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [search, users]);

  const columns = useMemo(
    () => [
      {
        title: "Пользователь",
        dataIndex: "name",
        width: 280,
        render: (_, user) => (
          <div className="company-access-user">
            <span className="company-access-user__name">{userDisplayName(user)}</span>
            {user.login && user.login !== user.name && (
              <span className="company-access-user__login">{user.login}</span>
            )}
          </div>
        ),
      },
      ...COMPANY_ACCESS_ROLES.map((role) => ({
        title: role.label,
        key: role.key,
        width: 130,
        align: "center",
        render: (_, user) => (
          <Checkbox
            data-eopp-component="CompanyAccessCheckbox"
            aria-label={`${role.label}: ${userDisplayName(user)}`}
            checked={accessSets[role.key].has(Number(user.id))}
            onChange={() => onToggle(role.key, user.id)}
          />
        ),
      })),
    ],
    [accessSets, onToggle],
  );

  return (
    <div className="company-access-matrix">
      <div className="company-access-matrix__toolbar">
        <Input
          allowClear
          className="company-access-matrix__search"
          placeholder="Поиск пользователя"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <span className="company-access-matrix__count">
          {filteredUsers.length} из {users.length}
        </span>
      </div>
      <DataTable
        className="company-access-matrix__table"
        columns={columns}
        data={filteredUsers}
        emptyText={search.trim() ? "Пользователи не найдены" : "Нет пользователей"}
        pagination={false}
        scroll={{ x: "max-content", y: 430 }}
      />
    </div>
  );
}

export function CompaniesTab({ adminToken, onError }) {
  const [companies, setCompanies] = useState([]);
  const [companySettings, setCompanySettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    aliases: "",
    notes: "",
    tax_commission_mode: "added",
  });
  const [showDefaultTariffModal, setShowDefaultTariffModal] = useState(false);
  const [defaultTariff, setDefaultTariff] = useState(null);
  const [defaultTariffForm, setDefaultTariffForm] = useState(EMPTY_TARIFF_FORM);
  const [defaultTariffTaxCommissionMode, setDefaultTariffTaxCommissionMode] = useState("added");
  const [defaultTariffBillingDefaults, setDefaultTariffBillingDefaults] = useState(EMPTY_BILLING_DEFAULTS);
  const [defaultTariffSaving, setDefaultTariffSaving] = useState(false);
  const [tariffCompany, setTariffCompany] = useState(null);
  const [tariffForm, setTariffForm] = useState(EMPTY_TARIFF_FORM);
  const [tariffTaxCommissionMode, setTariffTaxCommissionMode] = useState("added");
  const [tariffBillingDefaults, setTariffBillingDefaults] = useState(EMPTY_BILLING_DEFAULTS);
  const [tariffSaving, setTariffSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [financeParticipants, setFinanceParticipants] = useState([]);
  const [accessCompany, setAccessCompany] = useState(null);
  const [accessUsers, setAccessUsers] = useState([]);
  const [accessDraft, setAccessDraft] = useState({ finance: [], operator: [], executor: [] });
  const [accessSearch, setAccessSearch] = useState("");
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

  const fetchDefaultTariff = useCallback(async () => {
    try {
      const res = await adminRequest("/admin/default-company-tariff", {
        headers: adminHeadersJson(adminToken),
      });
      if (res.status === 404) {
        setDefaultTariff(null);
        setDefaultTariffForm(EMPTY_TARIFF_FORM);
        setDefaultTariffTaxCommissionMode("added");
        setDefaultTariffBillingDefaults(EMPTY_BILLING_DEFAULTS);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDefaultTariff(data);
      setDefaultTariffForm(tariffToForm(data));
      setDefaultTariffTaxCommissionMode(normalizeTaxCommissionMode(data?.tax_commission_mode));
      setDefaultTariffBillingDefaults(billingDefaultsFromSetting(data));
    } catch (err) {
      onError?.(`Ошибка загрузки дефолтного тарифа: ${err.message}`);
    }
  }, [adminToken, onError]);

  const fetchCompanySettings = useCallback(async () => {
    try {
      const res = await adminRequest("/admin/company-billing-settings", {
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCompanySettings(Array.isArray(data) ? data : []);
    } catch (err) {
      onError?.(`Ошибка загрузки настроек компаний: ${err.message}`);
    }
  }, [adminToken, onError]);

  const fetchFinanceParticipants = useCallback(async () => {
    try {
      const res = await adminRequest("/admin/finance-participants", {
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFinanceParticipants(Array.isArray(data) ? data : []);
    } catch (err) {
      onError?.(`Ошибка загрузки финучастников: ${err.message}`);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    fetchCompanies();
    fetchDefaultTariff();
    fetchCompanySettings();
    fetchFinanceParticipants();
  }, [fetchCompanies, fetchDefaultTariff, fetchCompanySettings, fetchFinanceParticipants]);

  const settingsByCompany = useMemo(
    () => new Map(companySettings.map((setting) => [setting.company, setting])),
    [companySettings],
  );

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

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", aliases: "", notes: "", tax_commission_mode: "added" });
    setShowModal(true);
  };

  const openEdit = (company) => {
    const setting = settingsByCompany.get(company.name);
    setEditingId(company.id);
    setForm({
      name: company.name || "",
      aliases: Array.isArray(company.aliases) ? company.aliases.join("\n") : "",
      notes: company.notes || "",
      tax_commission_mode: normalizeTaxCommissionMode(setting?.tax_commission_mode),
    });
    setShowModal(true);
  };

  const openDefaultTariff = () => {
    setDefaultTariffForm(tariffToForm(defaultTariff));
    setDefaultTariffTaxCommissionMode(normalizeTaxCommissionMode(defaultTariff?.tax_commission_mode));
    setDefaultTariffBillingDefaults(billingDefaultsFromSetting(defaultTariff));
    setShowDefaultTariffModal(true);
  };

  const saveDefaultTariff = async () => {
    setDefaultTariffSaving(true);
    try {
      const res = await adminRequest("/admin/default-company-tariff", {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          ...tariffFormToBody(defaultTariffForm),
          tax_commission_mode: normalizeTaxCommissionMode(defaultTariffTaxCommissionMode),
          ...billingDefaultsToBody(defaultTariffBillingDefaults),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDefaultTariff(data);
      setDefaultTariffForm(tariffToForm(data));
      setDefaultTariffTaxCommissionMode(normalizeTaxCommissionMode(data?.tax_commission_mode));
      setDefaultTariffBillingDefaults(billingDefaultsFromSetting(data));
      setShowDefaultTariffModal(false);
    } catch (err) {
      onError?.(`Ошибка сохранения дефолтного тарифа: ${err.message}`);
    } finally {
      setDefaultTariffSaving(false);
    }
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
      const saved = await res.json();
      const previousCompany = editingId
        ? companies.find((company) => company.id === editingId)
        : null;
      const previousSetting = previousCompany
        ? settingsByCompany.get(previousCompany.name)
        : null;
      const previousDefaults = billingDefaultsFromSetting(previousSetting);
      if (editingId && previousSetting) {
        const settingsRes = await adminRequest(
          `/admin/company-billing-settings/${encodeURIComponent(saved.name)}`,
          {
            method: "PUT",
            headers: adminHeaders(adminToken),
            body: JSON.stringify({
              auto_invoice_reopen: !!previousSetting.auto_invoice_reopen,
              tax_commission_mode: normalizeTaxCommissionMode(previousSetting.tax_commission_mode),
              ...billingDefaultsToBody(previousDefaults),
            }),
          },
        );
        if (!settingsRes.ok) throw new Error(`HTTP ${settingsRes.status}`);
      }
      setShowModal(false);
      setEditingId(null);
      setForm({ name: "", aliases: "", notes: "", tax_commission_mode: "added" });
      await Promise.all([fetchCompanies(), fetchCompanySettings()]);
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
    const setting = settingsByCompany.get(company.name);
    setTariffCompany(company);
    setTariffForm(EMPTY_TARIFF_FORM);
    setTariffTaxCommissionMode(normalizeTaxCommissionMode(setting?.tax_commission_mode));
    setTariffBillingDefaults(billingDefaultsFromSetting(setting));
    try {
      const res = await adminRequest(`/admin/company-tariffs/${company.id}`, {
        headers: adminHeadersJson(adminToken),
      });
      if (res.status === 404) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTariffForm(tariffToForm(data));
    } catch (err) {
      onError?.(`Ошибка загрузки тарифа компании: ${err.message}`);
    }
  };

  const saveTariff = async () => {
    if (!tariffCompany) return;
    setTariffSaving(true);
    try {
      const res = await adminRequest(`/admin/company-tariffs/${tariffCompany.id}`, {
        method: "PUT",
        headers: adminHeaders(adminToken),
        body: JSON.stringify(tariffFormToBody(tariffForm)),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const setting = settingsByCompany.get(tariffCompany.name);
      const settingsRes = await adminRequest(
        `/admin/company-billing-settings/${encodeURIComponent(tariffCompany.name)}`,
        {
          method: "PUT",
          headers: adminHeaders(adminToken),
          body: JSON.stringify({
            auto_invoice_reopen: !!setting?.auto_invoice_reopen,
            tax_commission_mode: normalizeTaxCommissionMode(tariffTaxCommissionMode),
            ...billingDefaultsToBody(tariffBillingDefaults),
          }),
        },
      );
      if (!settingsRes.ok) throw new Error(`HTTP ${settingsRes.status}`);
      setTariffCompany(null);
      await Promise.all([fetchCompanies(), fetchCompanySettings()]);
    } catch (err) {
      onError?.(`Ошибка сохранения тарифа компании: ${err.message}`);
    } finally {
      setTariffSaving(false);
    }
  };

  const applyDefaultTariff = async () => {
    if (!tariffCompany) return;
    setTariffSaving(true);
    try {
      const res = await adminRequest(`/admin/company-tariffs/${tariffCompany.id}/apply-default`, {
        method: "POST",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTariffForm(tariffToForm(data));
      setTariffTaxCommissionMode(normalizeTaxCommissionMode(defaultTariff?.tax_commission_mode));
      setTariffBillingDefaults(billingDefaultsFromSetting(defaultTariff));
      await Promise.all([fetchCompanies(), fetchCompanySettings()]);
    } catch (err) {
      onError?.(`Ошибка применения дефолтного тарифа: ${err.message}`);
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
      await fetchCompanies();
    } catch (err) {
      onError?.(`Ошибка удаления тарифа компании: ${err.message}`);
    } finally {
      setTariffSaving(false);
    }
  };

  const openAccess = async (company) => {
    setAccessCompany(company);
    setAccessDraft({ finance: [], operator: [], executor: [] });
    setAccessSearch("");
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
      width: 44,
      render: (value) => <span className="text-muted">#{value}</span>,
    },
    {
      title: "Название",
      dataIndex: "name",
      width: 190,
      ellipsis: true,
      render: (value) => <span className="fw-semibold">{value}</span>,
    },
    {
      title: "Алиасы",
      dataIndex: "aliases",
      width: 120,
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
      title: "Созд.",
      width: 58,
      render: (_, company) => renderTariffAmount(company, "price_create"),
    },
    {
      title: "Перен.",
      width: 58,
      render: (_, company) => renderTariffAmount(company, "price_reschedule"),
    },
    {
      title: "Пик",
      width: 54,
      render: (_, company) => renderTariffAmount(company, "price_create_peak"),
    },
    {
      title: "Свои",
      width: 54,
      render: (_, company) => renderTariffAmount(company, "price_custom_slots"),
    },
    {
      title: "Опер.",
      width: 54,
      render: (_, company) => renderTariffAmount(company, "operator_amount"),
    },
    {
      title: "Исп.",
      width: 54,
      render: (_, company) => renderTariffAmount(company, "executor_amount"),
    },
    {
      title: "Н/К",
      width: 78,
      render: (_, company) => {
        const mode = normalizeTaxCommissionMode(settingsByCompany.get(company.name)?.tax_commission_mode);
        return mode === "included" ? "Вкл." : "Св.";
      },
    },
    {
      title: "Заметки",
      dataIndex: "notes",
      width: 72,
      ellipsis: true,
      render: (value) => <span title={value || "—"}>{value ? "Есть" : "—"}</span>,
    },
    {
      title: "Создана",
      dataIndex: "created_at",
      width: 112,
      render: formatDate,
    },
    {
      title: "",
      width: 88,
      align: "right",
      render: (_, company) => (
        <Space size={3} className="companies-table__actions">
          <Button className="companies-table__action companies-table__action--wide" size="small" onClick={(event) => { event.stopPropagation(); openTariff(company); }}>
            {"\u041e\u0442\u043a\u0440."}
          </Button>
          <Button className="companies-table__action companies-table__action--wide" size="small" variant="danger" title={"\u0423\u0434\u0430\u043b\u0438\u0442\u044c"} onClick={(event) => { event.stopPropagation(); deleteCompany(company); }}>
            {"\u0423\u0434"}
          </Button>
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
            <Button size="small" onClick={openDefaultTariff}>Дефолтный тариф</Button>
            <Button size="small" variant="primary" onClick={openCreate}>Добавить компанию</Button>
          </Space>
        }
      />

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
          scroll={false}
          tableLayout="fixed"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
          onRow={(company) => ({
            onClick: () => openTariff(company),
            className: "companies-table-row",
          })}
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
        title="Дефолтный тариф для новых компаний"
        open={showDefaultTariffModal}
        onOk={saveDefaultTariff}
        onCancel={() => setShowDefaultTariffModal(false)}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={defaultTariffSaving}
        width={680}
        destroyOnHidden
      >
        <CompanyTariffForm
          form={defaultTariffForm}
          onChange={setDefaultTariffForm}
          taxCommissionMode={defaultTariffTaxCommissionMode}
          onTaxCommissionModeChange={setDefaultTariffTaxCommissionMode}
          billingDefaults={defaultTariffBillingDefaults}
          onBillingDefaultsChange={setDefaultTariffBillingDefaults}
          financeParticipants={financeParticipants}
        />
      </Modal>

      <Modal
        title={tariffCompany ? `Тариф компании: ${tariffCompany.name}` : "Тариф компании"}
        open={!!tariffCompany}
        onOk={saveTariff}
        onCancel={() => setTariffCompany(null)}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={tariffSaving}
        width={680}
        footer={(_, { OkBtn, CancelBtn }) => (
          <div className="company-tariff-footer">
            <Space size={8} wrap>
              <Button size="small" onClick={applyDefaultTariff} loading={tariffSaving}>
                Применить дефолт
              </Button>
              <Button size="small" variant="danger" onClick={deleteTariff} loading={tariffSaving}>
                Удалить тариф
              </Button>
            </Space>
            <Space size={8}>
              <CancelBtn />
              <OkBtn />
            </Space>
          </div>
        )}
        destroyOnHidden
      >
        <CompanyTariffForm
          form={tariffForm}
          onChange={setTariffForm}
          taxCommissionMode={tariffTaxCommissionMode}
          onTaxCommissionModeChange={setTariffTaxCommissionMode}
          billingDefaults={tariffBillingDefaults}
          onBillingDefaultsChange={setTariffBillingDefaults}
          financeParticipants={financeParticipants}
        />
      </Modal>

      <Modal
        title={accessCompany ? `Доступ: ${accessCompany.name}` : "Доступ"}
        open={!!accessCompany}
        onOk={saveAccess}
        onCancel={() => setAccessCompany(null)}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={accessSaving}
        width={820}
        destroyOnHidden
      >
        <div className="company-access-modal">
          <CompanyAccessMatrix
            users={accessUsers}
            draft={accessDraft}
            search={accessSearch}
            onSearchChange={setAccessSearch}
            onToggle={toggleAccessUser}
          />
        </div>
      </Modal>
    </div>
  );
}
