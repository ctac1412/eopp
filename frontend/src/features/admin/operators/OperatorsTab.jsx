import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Modal, Space } from "antd";
import {
  Button,
  CheckboxField,
  DataTable,
  FilterBar,
  MetricsStrip,
  SegmentedControl,
  SelectInput,
  StatusTag,
  TextInput,
  Toolbar,
} from "../../../ui";
import { adminHeaders, adminHeadersJson, adminRequest } from "../shared/adminClient";
import { CaptchaReviewModal } from "../captchas/CaptchaReviewModal";
import {
  isAllAccessibleMasters,
  normalizeAllowedMasters,
  serializeAllowedMasters,
} from "./operatorAssignments";

const ICON_DISPLAY_MODES = [
  { value: "own_then_foreign", label: "Свои -> чужие" },
  { value: "own_only", label: "Только свои" },
];

const OPERATOR_BILLING_MODES = [
  { value: "company", label: "По компании" },
  { value: "custom", label: "Индивидуальный" },
  { value: "free", label: "Бесплатный" },
];

const PAGE_TABS = [
  { value: "dashboard", label: "Активный дэшборд" },
  { value: "settings", label: "Настройки" },
];

const MASTER_ACCESS_MODES = [
  { value: "all", label: "Все доступные мастера" },
  { value: "selected", label: "Только выбранные" },
];

const DEFAULT_ANSWERS_PAGE_SIZE = 25;
const ANSWERS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function formatTime(iso) {
  if (!iso) return "—";
  return iso.slice(0, 19).replace("T", " ");
}

function clip(value, length = 12) {
  if (!value) return "—";
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function uniqueNumbers(values) {
  return Array.from(new Set((values || []).map(Number).filter(Boolean)));
}

function normalizeBillingOverrides(overrides = []) {
  const seen = new Set();
  const result = [];
  (Array.isArray(overrides) ? overrides : []).forEach((override) => {
    const companyId = Number(override.company_id);
    if (!companyId || seen.has(companyId)) return;
    const billingMode = ["company", "custom", "free"].includes(override.billing_mode)
      ? override.billing_mode
      : "company";
    result.push({
      company_id: companyId,
      billing_mode: billingMode,
      icon_rate: billingMode === "custom" ? Math.max(0, Number(override.icon_rate) || 0) : 0,
    });
    seen.add(companyId);
  });
  return result;
}

function getOperatorCompanyScope(op) {
  if (op.operator_all_companies === true) {
    return { allCompanies: true, companyIds: [] };
  }
  if (Array.isArray(op.operator_company_ids)) {
    return { allCompanies: false, companyIds: uniqueNumbers(op.operator_company_ids) };
  }
  return { allCompanies: false, companyIds: uniqueNumbers(op.company_ids) };
}

function companyName(companyId, companiesById) {
  return companiesById.get(Number(companyId))?.name || `Компания #${companyId}`;
}

function getKeyCompanyId(key) {
  return key.company_id == null ? null : Number(key.company_id);
}

function keyLabel(key) {
  return key.label || `Ключ #${key.id}`;
}

export function OperatorsTab({ adminToken, onError }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [operators, setOperators] = useState([]);
  const [links, setLinks] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [answersPage, setAnswersPage] = useState(1);
  const [answersPageSize, setAnswersPageSize] = useState(DEFAULT_ANSWERS_PAGE_SIZE);
  const [answersTotalPages, setAnswersTotalPages] = useState(1);
  const [answersTotal, setAnswersTotal] = useState(0);
  const [operatorSearch, setOperatorSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [allKeys, setAllKeys] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState(null);
  const [reviewCaptcha, setReviewCaptcha] = useState(null);
  const [editForm, setEditForm] = useState({
    icon_display_mode: "own_then_foreign",
    billing_mode: "company",
    icon_rate: 0,
    masterAccessMode: "all",
    allowed_master_keys: [],
    billing_overrides: [],
  });
  const [linkSavingOperatorId, setLinkSavingOperatorId] = useState(null);

  const baseUrl = window.location.origin;

  const loadOperators = useCallback(async () => {
    try {
      const res = await adminRequest("/admin/operators", { headers: adminHeaders(adminToken) });
      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];
      setOperators(rows);
      setSelectedOperatorId((current) => {
        if (current && rows.some((op) => op.id === current)) return current;
        return rows[0]?.id ?? null;
      });
    } catch {
      onError?.("Ошибка загрузки операторов");
    }
  }, [adminToken, onError]);

  const loadLinks = useCallback(async () => {
    try {
      const res = await adminRequest("/admin/operator-links", { headers: adminHeaders(adminToken) });
      const data = await res.json();
      setLinks(Array.isArray(data) ? data : []);
    } catch {
      onError?.("Ошибка загрузки связок операторов");
    }
  }, [adminToken, onError]);

  const loadAnswers = useCallback(async (page = 1, pageSize = DEFAULT_ANSWERS_PAGE_SIZE) => {
    const safePageSize = Number(pageSize) || DEFAULT_ANSWERS_PAGE_SIZE;
    try {
      const res = await adminRequest(`/admin/distribution-answers?page=${page}&per_page=${safePageSize}`, {
        headers: adminHeaders(adminToken),
      });
      const data = await res.json();
      setAnswers(data.items || []);
      setAnswersPage(data.page || 1);
      setAnswersPageSize(safePageSize);
      setAnswersTotalPages(data.pages || 1);
      setAnswersTotal(data.total || 0);
    } catch {
      onError?.("Ошибка загрузки действий операторов");
    }
  }, [adminToken, onError]);

  const loadKeys = useCallback(async () => {
    try {
      const res = await adminRequest("/api-keys", { headers: adminHeaders(adminToken) });
      const data = await res.json();
      setAllKeys(Array.isArray(data) ? data : data.keys || []);
    } catch {
      setAllKeys([]);
    }
  }, [adminToken]);

  const loadCompanies = useCallback(async () => {
    try {
      const res = await adminRequest("/admin/companies", { headers: adminHeaders(adminToken) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch {
      setCompanies([]);
    }
  }, [adminToken]);

  useEffect(() => {
    loadOperators();
    loadLinks();
    loadAnswers();
    loadKeys();
    loadCompanies();
  }, [loadOperators, loadLinks, loadAnswers, loadKeys, loadCompanies]);

  const internalKeys = useMemo(() => allKeys.filter((key) => !key.is_external), [allKeys]);
  const keyLabelById = useMemo(() => {
    const map = new Map();
    allKeys.forEach((key) => map.set(Number(key.id), keyLabel(key)));
    return map;
  }, [allKeys]);
  const companiesById = useMemo(() => new Map(companies.map((company) => [Number(company.id), company])), [companies]);

  const selectedOperator = useMemo(
    () => operators.find((op) => op.id === selectedOperatorId) || null,
    [operators, selectedOperatorId],
  );

  const visibleKeysForOperator = useCallback((op) => {
    if (!op) return [];
    const scope = getOperatorCompanyScope(op);
    if (scope.allCompanies) return internalKeys;
    const companyIds = new Set(scope.companyIds.map(Number));
    return internalKeys.filter((key) => {
      const keyCompanyId = getKeyCompanyId(key);
      return keyCompanyId == null || companyIds.has(keyCompanyId);
    });
  }, [internalKeys]);

  const groupedKeysForOperator = useCallback((op) => {
    const groups = new Map();
    visibleKeysForOperator(op).forEach((key) => {
      const companyId = getKeyCompanyId(key);
      const groupKey = companyId == null ? "none" : String(companyId);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: groupKey,
          title: companyId == null ? "Без компании" : companyName(companyId, companiesById),
          keys: [],
        });
      }
      groups.get(groupKey).keys.push(key);
    });
    return Array.from(groups.values());
  }, [companiesById, visibleKeysForOperator]);

  const filteredOperators = useMemo(() => {
    const q = operatorSearch.trim().toLowerCase();
    if (!q) return operators;
    return operators.filter((op) =>
      [
        op.id,
        op.user_name || op.nickname,
        op.uuid,
        op.company_name,
        Array.isArray(op.company_names) ? op.company_names.join(" ") : "",
        op.operator_all_companies ? "все компании" : "",
        op.icon_display_mode,
        op.icon_rate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [operatorSearch, operators]);

  const metrics = useMemo(() => {
    const online = operators.filter((op) => op.online).length;
    const linkedOperators = new Set(links.map((link) => link.operator_id)).size;
    return [
      { key: "total", label: "Операторы", value: operators.length, tone: operators.length > 0 ? "info" : "neutral" },
      { key: "online", label: "Онлайн", value: online, tone: online > 0 ? "success" : "neutral" },
      { key: "links", label: "Активные связки", value: links.length, tone: links.length > 0 ? "success" : "neutral" },
      { key: "linked", label: "С мастером", value: linkedOperators, tone: linkedOperators > 0 ? "info" : "neutral" },
      { key: "answers", label: "Действия", value: answersTotal, tone: answersTotal > 0 ? "info" : "neutral" },
    ];
  }, [answersTotal, links, operators]);
  useEffect(() => {
    if (!selectedOperator) return;
    const allowed = normalizeAllowedMasters(selectedOperator.allowed_master_keys);
    setEditForm({
      icon_display_mode: selectedOperator.icon_display_mode || "own_then_foreign",
      billing_mode: selectedOperator.billing_mode || "company",
      icon_rate: Number(selectedOperator.icon_rate || 0),
      masterAccessMode: isAllAccessibleMasters(selectedOperator.allowed_master_keys) ? "all" : "selected",
      allowed_master_keys: allowed,
      billing_overrides: normalizeBillingOverrides(selectedOperator.billing_overrides),
    });
  }, [selectedOperator]);

  const refreshAll = async () => {
    await Promise.all([loadOperators(), loadLinks(), loadAnswers(answersPage, answersPageSize), loadKeys(), loadCompanies()]);
  };

  const deleteOperator = async (id) => {
    Modal.confirm({
      title: "Удалить оператора?",
      content: `Оператор #${id} будет удалён вместе с его активными связками.`,
      okText: "Удалить",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: async () => {
        try {
          const res = await adminRequest(`/admin/operators/${id}`, {
            method: "DELETE",
            headers: adminHeaders(adminToken),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await Promise.all([loadOperators(), loadLinks()]);
        } catch {
          onError?.("Ошибка удаления оператора");
        }
      },
    });
  };

  const handleEditSave = async () => {
    if (!selectedOperator) return;
    setSaving(true);
    try {
      const body = {
        icon_display_mode: editForm.icon_display_mode,
        billing_mode: editForm.billing_mode || "company",
        allowed_master_keys: serializeAllowedMasters(
          editForm.masterAccessMode,
          editForm.allowed_master_keys,
        ),
        billing_overrides: normalizeBillingOverrides(editForm.billing_overrides),
      };
      if (body.billing_mode === "custom") {
        body.icon_rate = Math.max(0, Number(editForm.icon_rate) || 0);
      }
      const res = await adminRequest(`/admin/operators/${selectedOperator.id}`, {
        method: "PUT",
        headers: adminHeadersJson(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await Promise.all([loadOperators(), loadLinks()]);
    } catch {
      onError?.("Ошибка сохранения оператора");
    } finally {
      setSaving(false);
    }
  };

  const resetEditForm = () => {
    if (!selectedOperator) return;
    const allowed = normalizeAllowedMasters(selectedOperator.allowed_master_keys);
    setEditForm({
      icon_display_mode: selectedOperator.icon_display_mode || "own_then_foreign",
      billing_mode: selectedOperator.billing_mode || "company",
      icon_rate: Number(selectedOperator.icon_rate || 0),
      masterAccessMode: isAllAccessibleMasters(selectedOperator.allowed_master_keys) ? "all" : "selected",
      allowed_master_keys: allowed,
      billing_overrides: normalizeBillingOverrides(selectedOperator.billing_overrides),
    });
  };

  const addBillingOverride = () => {
    const used = new Set((editForm.billing_overrides || []).map((item) => Number(item.company_id)));
    const company = companies.find((item) => !used.has(Number(item.id)));
    if (!company) return;
    setEditForm((prev) => ({
      ...prev,
      billing_overrides: [
        ...(prev.billing_overrides || []),
        { company_id: Number(company.id), billing_mode: "free", icon_rate: 0 },
      ],
    }));
  };

  const updateBillingOverride = (index, patch) => {
    setEditForm((prev) => ({
      ...prev,
      billing_overrides: (prev.billing_overrides || []).map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, ...patch };
        if (next.billing_mode !== "custom") next.icon_rate = 0;
        return next;
      }),
    }));
  };

  const removeBillingOverride = (index) => {
    setEditForm((prev) => ({
      ...prev,
      billing_overrides: (prev.billing_overrides || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const availableLinkOptions = (op) => {
    const allowed = isAllAccessibleMasters(op.allowed_master_keys)
      ? null
      : normalizeAllowedMasters(op.allowed_master_keys);
    return visibleKeysForOperator(op).filter(
      (key) => !allowed || allowed.includes(Number(key.id)),
    ).map((key) => ({
      value: Number(key.id),
      label: `${keyLabel(key)} #${key.id}`,
    }));
  };

  const currentLinkForOperator = (op) => links.find(
    (link) => link.operator_uuid === op.uuid && link.active !== false,
  ) || null;

  const changeOperatorMaster = async (op, masterKeyId) => {
    const current = currentLinkForOperator(op);
    setLinkSavingOperatorId(op.id);
    try {
      if (!masterKeyId) {
        if (current) {
          const res = await adminRequest(`/operators/${op.uuid}/unlink`, {
            method: "POST",
            headers: adminHeadersJson(adminToken),
            body: JSON.stringify({ master_id: current.master_key_id }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
      } else {
        const res = await adminRequest(`/admin/operators/${op.id}/link`, {
          method: "PUT",
          headers: adminHeadersJson(adminToken),
          body: JSON.stringify({ master_key_id: Number(masterKeyId) }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      await loadLinks();
    } catch {
      onError?.("Ошибка изменения связки оператора");
    } finally {
      setLinkSavingOperatorId(null);
    }
  };

  const setAllowedMaster = (masterKeyId, checked) => {
    setEditForm((prev) => {
      const ids = new Set((prev.allowed_master_keys || []).map(Number));
      if (checked) ids.add(Number(masterKeyId));
      else ids.delete(Number(masterKeyId));
      return { ...prev, allowed_master_keys: Array.from(ids) };
    });
  };

  const renderAllowedMasters = (allowed) => {
    if (isAllAccessibleMasters(allowed)) return <span className="text-muted">Все доступные</span>;
    const ids = normalizeAllowedMasters(allowed);
    if (ids.length === 0) return <span className="text-muted">Нет выбранных</span>;
    return (
      <div className="operator-master-tags">
        {ids.map((id) => (
          <span key={id} className="operator-master-tag" title={`#${id}`}>
            {keyLabelById.get(Number(id)) || `#${id}`}
          </span>
        ))}
      </div>
    );
  };

  const renderMasterSummary = (op) => {
    if (isAllAccessibleMasters(op.allowed_master_keys)) {
      return <span className="operator-list-pill operator-list-pill--all">Все мастера</span>;
    }
    const ids = normalizeAllowedMasters(op.allowed_master_keys);
    if (ids.length === 0) return <span className="operator-list-pill">Нет мастеров</span>;
    return ids.map((id) => (
      <span key={id} className="operator-list-pill" title={`#${id}`}>
        {keyLabelById.get(Number(id)) || `#${id}`}
      </span>
    ));
  };

  const renderCompanyScope = (_, op) => {
    const scope = getOperatorCompanyScope(op);
    if (scope.allCompanies) return <span className="operator-scope-pill operator-scope-pill--global">Все компании</span>;
    const names = scope.companyIds.map((id) => companyName(id, companiesById));
    if (names.length === 0) return <span className="text-muted">Нет доступа</span>;
    return (
      <div className="operator-master-tags">
        {names.map((name) => (
          <span key={name} className="operator-master-tag" title={name}>
            {name}
          </span>
        ))}
      </div>
    );
  };

  const getIconModeLabel = (mode) => ICON_DISPLAY_MODES.find((item) => item.value === mode)?.label || mode || "—";

  const getBillingModeLabel = (op) => {
    if (op.billing_mode === "free") return "Бесплатно";
    if (op.billing_mode === "custom") return `${Number(op.icon_rate || 0).toLocaleString("ru-RU")} ₽`;
    return "Компания";
  };

  const reviewFromAnswer = (answer) => ({
    captcha_id: answer.captcha_id,
    operator_answers: answer.operator_answers || [answer],
  });

  const operatorColumns = [
    { title: "ID", dataIndex: "id", width: 54, render: (value) => <span className="text-muted">#{value}</span> },
    {
      title: "Статус",
      dataIndex: "online",
      width: 76,
      align: "center",
      render: (value) => <StatusTag status={value ? "online" : "offline"} label={value ? "online" : "offline"} />,
    },
    {
      title: "Никнейм",
      dataIndex: "nickname",
      width: 150,
      ellipsis: true,
      render: (value) => <span className="fw-semibold">{value || "—"}</span>,
    },
    {
      title: "UUID",
      dataIndex: "uuid",
      width: 118,
      ellipsis: true,
      render: (value) => <span className="font-monospace" title={value}>{clip(value)}</span>,
    },
    { title: "Компании", dataIndex: "company_names", width: 180, render: renderCompanyScope },
    { title: "Мастера", dataIndex: "allowed_master_keys", width: 170, render: renderAllowedMasters },
    { title: "Иконки", dataIndex: "icon_display_mode", width: 128, render: getIconModeLabel },
    { title: "Тариф", dataIndex: "billing_mode", width: 104, align: "right", render: (_, op) => getBillingModeLabel(op) },
    {
      title: "Ссылка",
      dataIndex: "uuid",
      width: 86,
      render: (value) => (
        <a href={`${baseUrl}/operators/${value}`} target="_blank" rel="noreferrer">
          открыть
        </a>
      ),
    },
    { title: "Дата", dataIndex: "created_at", width: 100, render: (value) => value?.slice(0, 10) || "—" },
    {
      title: "",
      width: 150,
      render: (_, op) => (
        <Space size={4} wrap>
          <Button size="small" variant="danger" onClick={() => deleteOperator(op.id)}>Удал.</Button>
        </Space>
      ),
    },
  ];

  const answerColumns = [
    { title: "ID", dataIndex: "id", width: 70, render: (value) => <span className="text-muted">#{value}</span> },
    {
      title: "Капча",
      dataIndex: "captcha_id",
      width: 150,
      ellipsis: true,
      render: (value) => <span className="font-monospace" title={value}>{clip(value)}</span>,
    },
    {
      title: "Оператор",
      dataIndex: "operator_nickname",
      width: 180,
      ellipsis: true,
      render: (value, row) => (
        <span>
          <span className="fw-semibold">{value || "—"}</span>
          <span className="text-muted ms-1">#{row.operator_id}</span>
        </span>
      ),
    },
    {
      title: "Master key",
      dataIndex: "master_key_id",
      width: 130,
      render: (value, row) => value ? row.master_label || keyLabelById.get(Number(value)) || `#${value}` : "—",
    },
    { title: "Иконка", dataIndex: "icon_position", width: 90, align: "center", render: (value) => `${Number(value || 0) + 1}/5` },
    {
      title: "Координаты",
      dataIndex: "x",
      width: 120,
      align: "center",
      render: (_, row) => row.x != null && row.y != null ? `${row.x}, ${row.y}` : "—",
    },
    { title: "Время", dataIndex: "created_at", width: 160, render: formatTime },
    {
      title: "duration_ms",
      dataIndex: "duration_ms",
      width: 120,
      align: "right",
      render: (value) => (value != null ? `${value} ms` : "—"),
    },
    {
      title: "",
      width: 92,
      align: "center",
      render: (_, row) => (
        <Button size="small" onClick={() => setReviewCaptcha(reviewFromAnswer(row))}>
          Отсмотр
        </Button>
      ),
    },
  ];

  const operatorDashboardRows = operators.map((op) => {
    const link = currentLinkForOperator(op);
    return {
      ...op,
      current_master_key_id: link?.master_key_id ?? null,
      current_master_label: link?.master_label ?? null,
      linked_at: link?.created_at ?? null,
    };
  });

  const dashboardColumns = [
    { title: "ID", dataIndex: "id", width: 54, render: (value) => <span className="text-muted">#{value}</span> },
    {
      title: "Статус",
      dataIndex: "online",
      width: 86,
      align: "center",
      render: (value) => <StatusTag status={value ? "online" : "offline"} label={value ? "online" : "offline"} />,
    },
    {
      title: "Оператор",
      dataIndex: "nickname",
      width: 180,
      ellipsis: true,
      render: (value, row) => (
        <span>
          <span className="fw-semibold">{value || "—"}</span>
          <span className="text-muted ms-1 font-monospace">{clip(row.uuid, 10)}</span>
        </span>
      ),
    },
    { title: "Компании", dataIndex: "company_names", width: 220, render: renderCompanyScope },
    { title: "Доступ к мастерам", dataIndex: "allowed_master_keys", width: 190, render: renderAllowedMasters },
    {
      title: "Текущий master key",
      dataIndex: "current_master_key_id",
      width: 240,
      render: (value, op) => (
        <SelectInput
          size="small"
          value={value || undefined}
          onChange={(nextValue) => changeOperatorMaster(op, nextValue || null)}
          options={availableLinkOptions(op)}
          placeholder="Не назначен"
          allowClear
          disabled={linkSavingOperatorId === op.id}
        />
      ),
    },
    { title: "Связка с", dataIndex: "linked_at", width: 150, render: formatTime },
    {
      title: "Ссылка",
      dataIndex: "uuid",
      width: 86,
      render: (value) => (
        <a href={`${baseUrl}/operators/${value}`} target="_blank" rel="noreferrer">
          открыть
        </a>
      ),
    },
  ];

  const renderDashboard = () => (
    <>
      <MetricsStrip items={metrics} />


      <Card
        data-eopp-component="OperatorAnswersCard"
        className="mt-3"
        size="small"
        title={`Журнал действий операторов (${answersTotal})`}
        extra={<Button size="small" onClick={() => loadAnswers(answersPage, answersPageSize)}>Обновить</Button>}
      >
        <DataTable
          className="operator-answers-table"
          rowKey="id"
          data={answers}
          columns={answerColumns}
          emptyText="Нет действий"
          pagination={{
            current: answersPage,
            pageSize: answersPageSize,
            total: answersTotal,
            showSizeChanger: true,
            pageSizeOptions: ANSWERS_PAGE_SIZE_OPTIONS,
            onChange: (page, pageSize) => loadAnswers(pageSize !== answersPageSize ? 1 : page, pageSize),
            showTotal: (total) => `${total} всего`,
          }}
        />
        <div className="small text-muted mt-2">Страница {answersPage} из {answersTotalPages}</div>
      </Card>
    </>
  );

  const selectedScope = selectedOperator ? getOperatorCompanyScope(selectedOperator) : { allCompanies: false, companyIds: [] };
  const selectedGroups = selectedOperator ? groupedKeysForOperator(selectedOperator) : [];
  const selectedAllowed = new Set((editForm.allowed_master_keys || []).map(Number));

  const renderSettings = () => (
    <div className="operators-settings">
      <Card data-eopp-component="OperatorsListCard" size="small" title="Операторы">
        <FilterBar className="mb-3">
          <div className="operators-auto-note">
            Операторы появляются автоматически после выдачи пользователю operator-access.
          </div>
          <label className="form-label small mb-0 operators-search-input">
            Поиск
            <TextInput
              size="small"
              value={operatorSearch}
              onChange={(event) => setOperatorSearch(event.target.value)}
              placeholder="ник, uuid, компания"
            />
          </label>
        </FilterBar>

        <div className="operators-split">
          <div className="operators-split__list">
            {filteredOperators.map((op) => {
              const scope = getOperatorCompanyScope(op);
              const active = op.id === selectedOperatorId;
              return (
                <div
                  key={op.id}
                  role="button"
                  tabIndex={0}
                  className={`operator-list-item ${active ? "operator-list-item--active" : ""}`}
                  onClick={() => setSelectedOperatorId(op.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedOperatorId(op.id);
                    }
                  }}
                >
                  <span className="operator-list-item__status" aria-hidden="true" data-online={op.online ? "true" : "false"} />
                  <span className="operator-list-item__name">
                    {op.user_name || op.nickname || `#${op.id}`}
                  </span>
                  <a
                    className="operator-list-item__uuid font-monospace"
                    href={`${baseUrl}/operators/${op.uuid}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    title="Открыть страницу оператора"
                  >
                    {clip(op.uuid, 12)}
                  </a>
                  <span className="operator-list-item__companies">
                    {scope.allCompanies
                      ? "Все компании"
                      : scope.companyIds.map((id) => companyName(id, companiesById)).join(", ") || "Нет доступа"}
                  </span>
                  <span className="operator-list-item__masters">
                    {renderMasterSummary(op)}
                  </span>
                </div>
              );
            })}
            {filteredOperators.length === 0 && <div className="text-muted small">Нет операторов</div>}
          </div>

          <div className="operators-split__detail">
            {!selectedOperator ? (
              <div className="text-muted small">Выберите оператора слева</div>
            ) : (
              <>
                <div className="operators-detail-head">
                  <div>
                    <div className="small text-muted">Оператор #{selectedOperator.id}</div>
                    <h3 className="fs-6 fw-semibold mb-0">{selectedOperator.user_name || selectedOperator.nickname || "Без имени"}</h3>
                  </div>
                  <Space size={6} wrap>
                    <a href={`${baseUrl}/operators/${selectedOperator.uuid}`} target="_blank" rel="noreferrer">
                      открыть
                    </a>
                    <Button size="small" variant="danger" onClick={() => deleteOperator(selectedOperator.id)}>Удалить</Button>
                  </Space>
                </div>

                <div className="operators-detail-form">
                  <label className="form-label small mb-0">
                    Режим иконок
                    <SelectInput
                      value={editForm.icon_display_mode}
                      onChange={(value) => setEditForm((prev) => ({ ...prev, icon_display_mode: value || "own_then_foreign" }))}
                      options={ICON_DISPLAY_MODES}
                      allowClear={false}
                    />
                  </label>
                  <label className="form-label small mb-0">
                    Тариф оператора
                    <SelectInput
                      value={editForm.billing_mode}
                      onChange={(value) => setEditForm((prev) => ({ ...prev, billing_mode: value || "company" }))}
                      options={OPERATOR_BILLING_MODES}
                      allowClear={false}
                    />
                  </label>
                  {editForm.billing_mode === "custom" && (
                    <label className="form-label small mb-0">
                      Сумма за иконку
                      <TextInput
                        type="number"
                        min="0"
                        step="1"
                        value={editForm.icon_rate}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, icon_rate: event.target.value }))}
                      />
                    </label>
                  )}
                  <div className="operator-billing-overrides">
                    <div className="operator-billing-overrides__head">
                      <div>
                        <div className="fw-semibold">Исключения по компаниям</div>
                        <div className="small text-muted">Если строки нет, работает общий тариф оператора.</div>
                      </div>
                      <Button size="small" onClick={addBillingOverride} disabled={companies.length === 0}>
                        Добавить
                      </Button>
                    </div>
                    {(editForm.billing_overrides || []).map((override, index) => {
                      const usedCompanies = new Set(
                        (editForm.billing_overrides || [])
                          .filter((_, itemIndex) => itemIndex !== index)
                          .map((item) => Number(item.company_id)),
                      );
                      const companyOptions = companies.map((company) => ({
                        value: Number(company.id),
                        label: company.name,
                        disabled: usedCompanies.has(Number(company.id)),
                      }));
                      return (
                        <div key={`${override.company_id}-${index}`} className="operator-billing-overrides__row">
                          <SelectInput
                            value={Number(override.company_id) || undefined}
                            onChange={(value) => updateBillingOverride(index, { company_id: Number(value) || null })}
                            options={companyOptions}
                            allowClear={false}
                          />
                          <SelectInput
                            value={override.billing_mode || "company"}
                            onChange={(value) => updateBillingOverride(index, { billing_mode: value || "company" })}
                            options={OPERATOR_BILLING_MODES}
                            allowClear={false}
                          />
                          {override.billing_mode === "custom" ? (
                            <TextInput
                              type="number"
                              min="0"
                              step="1"
                              value={override.icon_rate}
                              onChange={(event) => updateBillingOverride(index, { icon_rate: event.target.value })}
                            />
                          ) : (
                            <span className="operator-billing-overrides__rate-muted">-</span>
                          )}
                          <Button size="small" variant="danger" onClick={() => removeBillingOverride(index)}>
                            Удалить
                          </Button>
                        </div>
                      );
                    })}
                    {(editForm.billing_overrides || []).length === 0 && (
                      <div className="small text-muted">Нет исключений.</div>
                    )}
                  </div>
                  <label className="form-label small mb-0">
                    Текущий master key
                    <SelectInput
                      value={currentLinkForOperator(selectedOperator)?.master_key_id || undefined}
                      onChange={(value) => changeOperatorMaster(selectedOperator, value || null)}
                      options={availableLinkOptions(selectedOperator)}
                      placeholder="Не назначен"
                      allowClear
                      disabled={linkSavingOperatorId === selectedOperator.id}
                    />
                  </label>

                  <div className="operator-readonly-scope">
                    <div className="small text-muted mb-1">Доступ к компаниям из профиля пользователя</div>
                    {selectedScope.allCompanies ? (
                      <span className="operator-scope-pill operator-scope-pill--global">Все компании</span>
                    ) : (
                      <div className="operator-master-tags operator-company-tags">
                        {selectedScope.companyIds.map((id) => (
                          <span key={id} className="operator-master-tag" title={companyName(id, companiesById)}>
                            {companyName(id, companiesById)}
                          </span>
                        ))}
                        {selectedScope.companyIds.length === 0 && <span className="text-muted">Нет доступных компаний</span>}
                      </div>
                    )}
                  </div>

                  <div className="operator-master-access">
                    <div className="operator-master-access__head">
                      <div>
                        <div className="fw-semibold">Доступ к мастерам</div>
                        <div className="small text-muted">
                          Ограничивает master/API keys внутри доступных оператору компаний.
                        </div>
                      </div>
                      <SegmentedControl
                        size="small"
                        value={editForm.masterAccessMode}
                        onChange={(value) => setEditForm((prev) => ({ ...prev, masterAccessMode: value }))}
                        options={MASTER_ACCESS_MODES}
                      />
                    </div>

                    {editForm.masterAccessMode === "all" ? (
                      <div className="operator-master-access__all">
                        {selectedScope.allCompanies ? "Оператор может подключаться ко всем мастерам всех компаний." : "Оператор может подключаться ко всем мастерам доступных компаний."}
                      </div>
                    ) : (
                      <div className="operator-master-groups">
                        {selectedGroups.map((group) => (
                          <div key={group.id} className="operator-master-group">
                            <div className="operator-master-group__title">{group.title}</div>
                            <div className="operator-master-group__keys">
                              {group.keys.map((key) => (
                                <CheckboxField
                                  key={key.id}
                                  checked={selectedAllowed.has(Number(key.id))}
                                  onChange={(event) => setAllowedMaster(key.id, event.target.checked)}
                                >
                                  {keyLabel(key)} <span className="text-muted">#{key.id}</span>
                                </CheckboxField>
                              ))}
                            </div>
                          </div>
                        ))}
                        {selectedGroups.length === 0 && <div className="text-muted small">Нет мастеров в доступных компаниях</div>}
                      </div>
                    )}
                  </div>

                  <div className="operators-detail-actions">
                    <Button size="small" onClick={resetEditForm}>Сбросить</Button>
                    <Button size="small" variant="primary" onClick={handleEditSave} loading={saving}>
                      Сохранить
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card data-eopp-component="OperatorDashboardCard" className="mt-3" size="small" title="Операторы и назначения к мастерам">
              <DataTable
                className="operators-table"
                rowKey="id"
                data={operatorDashboardRows}
                columns={dashboardColumns}
                emptyText="Нет операторов"
                pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: [15, 30, 50] }}
              />
            </Card>
    </div>
  );

  return (
    <div data-eopp-component="OperatorsTab" className="operators-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Операторы</h2>
            <div className="small text-muted">
              Настройки операторов и ограничения доступа к master/API keys
            </div>
          </div>
        }
        right={
          <Space size={6}>
            <SegmentedControl
              size="small"
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { label: "Обзор", value: "dashboard" },
                { label: "Настройки", value: "settings" },
              ]}
            />
            <Button size="small" onClick={refreshAll}>Обновить</Button>
          </Space>
        }
      />

      {activeTab === "dashboard" ? renderDashboard() : renderSettings()}
      <CaptchaReviewModal
        captcha={reviewCaptcha}
        open={!!reviewCaptcha}
        onClose={() => setReviewCaptcha(null)}
      />
    </div>
  );
}
