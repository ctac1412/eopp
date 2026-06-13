import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Modal, Space } from "antd";
import {
  Button,
  DataTable,
  FilterBar,
  MetricsStrip,
  SelectInput,
  StatusTag,
  TextInput,
  Toolbar,
} from "../../ui";
import { adminHeaders, adminHeadersJson } from "../../features/admin/shared/adminClient";
import {
  buildAssignmentDraft,
  buildBulkAssignments,
  normalizeAllowedMasters,
  toggleCompanyAssignment,
  toggleMasterAssignment,
} from "./operatorAssignments";

const ICON_DISPLAY_MODES = [
  { value: "own_then_foreign", label: "Свои -> чужие" },
  { value: "own_only", label: "Только свои" },
];

const PER_PAGE = 20;

function formatTime(iso) {
  if (!iso) return "—";
  return iso.slice(0, 19).replace("T", " ");
}

function clip(value, length = 12) {
  if (!value) return "—";
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

export function OperatorsTab({ adminToken, onError }) {
  const [operators, setOperators] = useState([]);
  const [links, setLinks] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [answersPage, setAnswersPage] = useState(1);
  const [answersTotalPages, setAnswersTotalPages] = useState(1);
  const [answersTotal, setAnswersTotal] = useState(0);
  const [nickname, setNickname] = useState("");
  const [newOperatorCompanyId, setNewOperatorCompanyId] = useState("");
  const [operatorSearch, setOperatorSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [allKeys, setAllKeys] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [editOp, setEditOp] = useState(null);
  const [editForm, setEditForm] = useState({
    nickname: "",
    icon_display_mode: "own_then_foreign",
    allowed_master_keys: [],
    companyId: "",
    companyIds: [],
  });
  const [assignmentDraft, setAssignmentDraft] = useState({});
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [relinkOp, setRelinkOp] = useState(null);
  const [relinkMasterId, setRelinkMasterId] = useState(null);

  const baseUrl = window.location.origin;

  const loadOperators = useCallback(async () => {
    try {
      const res = await fetch("/admin/operators", { headers: adminHeaders(adminToken) });
      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];
      setOperators(rows);
      setAssignmentDraft(buildAssignmentDraft(rows));
      setAssignmentError("");
    } catch {
      onError?.("Ошибка загрузки операторов");
    }
  }, [adminToken, onError]);

  const loadLinks = useCallback(async () => {
    try {
      const res = await fetch("/admin/operator-links", { headers: adminHeaders(adminToken) });
      const data = await res.json();
      setLinks(Array.isArray(data) ? data : []);
    } catch {
      onError?.("Ошибка загрузки связок операторов");
    }
  }, [adminToken, onError]);

  const loadAnswers = useCallback(async (page = 1) => {
    try {
      const res = await fetch(`/admin/distribution-answers?page=${page}&per_page=${PER_PAGE}`, {
        headers: adminHeaders(adminToken),
      });
      const data = await res.json();
      setAnswers(data.items || []);
      setAnswersPage(data.page || 1);
      setAnswersTotalPages(data.pages || 1);
      setAnswersTotal(data.total || 0);
    } catch {
      onError?.("Ошибка загрузки действий операторов");
    }
  }, [adminToken, onError]);

  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch("/api-keys", { headers: adminHeaders(adminToken) });
      const data = await res.json();
      setAllKeys(Array.isArray(data) ? data : data.keys || []);
    } catch {
      setAllKeys([]);
    }
  }, [adminToken]);

  const loadCompanies = useCallback(async () => {
    try {
      const res = await fetch("/admin/companies", { headers: adminHeaders(adminToken) });
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
    allKeys.forEach((key) => map.set(Number(key.id), key.label || `#${key.id}`));
    return map;
  }, [allKeys]);

  const filteredOperators = useMemo(() => {
    const q = operatorSearch.trim().toLowerCase();
    if (!q) return operators;
    return operators.filter((op) =>
      [
        op.id,
        op.nickname,
        op.uuid,
        op.company_name,
        Array.isArray(op.company_names) ? op.company_names.join(" ") : "",
        op.icon_display_mode,
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
      { key: "answers", label: "Ответы", value: answersTotal, tone: answersTotal > 0 ? "info" : "neutral" },
    ];
  }, [answersTotal, links, operators]);

  const masterOptions = useMemo(
    () => internalKeys.map((key) => ({ value: Number(key.id), label: key.label || `Ключ #${key.id}` })),
    [internalKeys],
  );

  const companyOptions = useMemo(
    () => companies.map((company) => ({ value: String(company.id), label: company.name })),
    [companies],
  );

  const refreshAll = async () => {
    await Promise.all([loadOperators(), loadLinks(), loadAnswers(answersPage), loadKeys(), loadCompanies()]);
  };

  const patchAssignment = (operatorId, patcher) => {
    setAssignmentDraft((prev) => {
      const current = prev[operatorId] || { companyIds: [], masterKeyIds: [] };
      return {
        ...prev,
        [operatorId]: patcher(current),
      };
    });
  };

  const toggleAssignmentCompany = (operatorId, companyId, checked) => {
    patchAssignment(operatorId, (current) => {
      return toggleCompanyAssignment(current, companyId, checked);
    });
  };

  const toggleAssignmentMaster = (operatorId, masterKeyId, checked) => {
    patchAssignment(operatorId, (current) => {
      const keyId = Number(masterKeyId);
      const key = allKeys.find((item) => Number(item.id) === keyId);
      return toggleMasterAssignment(current, { masterKeyId: keyId, checked, key });
    });
  };

  const handleMasterDrop = (operatorId, event) => {
    event.preventDefault();
    const keyId = Number(event.dataTransfer.getData("text/plain"));
    if (!keyId) return;
    toggleAssignmentMaster(operatorId, keyId, true);
  };

  const saveAssignments = async () => {
    setAssignmentSaving(true);
    setAssignmentError("");
    try {
      const assignments = buildBulkAssignments(operators, assignmentDraft);
      const res = await fetch("/admin/operator-assignments/bulk", {
        method: "POST",
        headers: adminHeadersJson(adminToken),
        body: JSON.stringify({ assignments }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await Promise.all([loadOperators(), loadLinks()]);
    } catch (err) {
      setAssignmentError(err.message);
      onError?.(err.message);
    } finally {
      setAssignmentSaving(false);
    }
  };

  const addOperator = async () => {
    const value = nickname.trim();
    if (!value) return;
    setLoading(true);
    try {
      const res = await fetch("/admin/operators", {
        method: "POST",
        headers: adminHeadersJson(adminToken),
        body: JSON.stringify({
          nickname: value,
          company_id: newOperatorCompanyId ? Number(newOperatorCompanyId) : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNickname("");
      setNewOperatorCompanyId("");
      await loadOperators();
    } catch {
      onError?.("Ошибка создания оператора");
    } finally {
      setLoading(false);
    }
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
          const res = await fetch(`/admin/operators/${id}`, {
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

  const unlinkOperator = async (operatorUuid, masterKeyId) => {
    Modal.confirm({
      title: "Разорвать связку?",
      content: `Оператор будет отключён от мастера #${masterKeyId}.`,
      okText: "Разорвать",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: async () => {
        try {
          const res = await fetch(`/operators/${operatorUuid}/unlink`, {
            method: "POST",
            headers: adminHeadersJson(adminToken),
            body: JSON.stringify({ master_id: masterKeyId }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await loadLinks();
        } catch {
          onError?.("Ошибка разрыва связки");
        }
      },
    });
  };

  const openEdit = (op) => {
    const companyIds = Array.isArray(op.company_ids)
      ? op.company_ids.map((id) => String(id))
      : (op.company_id != null ? [String(op.company_id)] : []);
    setEditForm({
      nickname: op.nickname || "",
      icon_display_mode: op.icon_display_mode || "own_then_foreign",
      allowed_master_keys: normalizeAllowedMasters(op.allowed_master_keys),
      companyId: op.company_id != null ? String(op.company_id) : "",
      companyIds,
    });
    setEditOp(op);
  };

  const handleEditSave = async () => {
    if (!editOp) return;
    try {
      const allowedKeys = Array.isArray(editForm.allowed_master_keys)
        ? editForm.allowed_master_keys.map(Number)
        : [];
      const body = {
        nickname: editForm.nickname,
        icon_display_mode: editForm.icon_display_mode,
        allowed_master_keys: allowedKeys.length > 0 ? allowedKeys : null,
        company_id: editForm.companyId ? parseInt(editForm.companyId, 10) : null,
        company_ids: Array.isArray(editForm.companyIds)
          ? editForm.companyIds.map(Number).filter(Boolean)
          : [],
      };
      const res = await fetch(`/admin/operators/${editOp.id}`, {
        method: "PUT",
        headers: adminHeadersJson(adminToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditOp(null);
      await loadOperators();
    } catch {
      onError?.("Ошибка сохранения оператора");
    }
  };

  const openRelink = (op) => {
    const allowed = normalizeAllowedMasters(op.allowed_master_keys);
    const allowedIds = Array.isArray(allowed) && allowed.length > 0 ? allowed : null;
    const currentLink = links.find((link) => link.operator_uuid === op.uuid && link.active !== false);
    const available = internalKeys.filter((key) => !allowedIds || allowedIds.includes(Number(key.id)));
    setRelinkOp({ ...op, availableKeys: available, currentMasterId: currentLink?.master_key_id || null });
    setRelinkMasterId(null);
  };

  const handleRelink = async () => {
    if (!relinkOp || !relinkMasterId) return;
    try {
      const res = await fetch(`/admin/operators/${relinkOp.id}/link`, {
        method: "PUT",
        headers: adminHeadersJson(adminToken),
        body: JSON.stringify({ master_key_id: relinkMasterId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRelinkOp(null);
      setRelinkMasterId(null);
      await loadLinks();
    } catch {
      onError?.("Ошибка перепривязки оператора");
    }
  };

  const renderAllowedMasters = (allowed) => {
    const ids = normalizeAllowedMasters(allowed);
    if (!Array.isArray(ids) || ids.length === 0) return <span className="text-muted">Все</span>;
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

  const renderCompanyScope = (_, op) => {
    const names = Array.isArray(op.company_names) ? op.company_names.filter(Boolean) : [];
    if (names.length === 0) return op.company_name || "—";
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
      width: 118,
      ellipsis: true,
      render: (value) => <span className="fw-semibold">{value || "—"}</span>,
    },
    {
      title: "UUID",
      dataIndex: "uuid",
      width: 104,
      ellipsis: true,
      render: (value) => <span className="font-monospace" title={value}>{clip(value)}</span>,
    },
    {
      title: "Мастера",
      dataIndex: "allowed_master_keys",
      width: 136,
      render: renderAllowedMasters,
    },
    { title: "Компании", dataIndex: "company_names", width: 150, render: renderCompanyScope },
    { title: "Иконки", dataIndex: "icon_display_mode", width: 108, render: getIconModeLabel },
    {
      title: "Ссылка",
      dataIndex: "uuid",
      width: 74,
      render: (value) => (
        <a href={`${baseUrl}/operators/${value}`} target="_blank" rel="noreferrer">
          открыть
        </a>
      ),
    },
    { title: "Дата", dataIndex: "created_at", width: 90, render: (value) => value?.slice(0, 10) || "—" },
    {
      title: "",
      width: 190,
      render: (_, op) => (
        <Space size={4} wrap>
          <Button size="small" onClick={() => openEdit(op)}>Изм.</Button>
          <Button size="small" onClick={() => openRelink(op)}>Связь</Button>
          <Button size="small" variant="danger" onClick={() => deleteOperator(op.id)}>Удал.</Button>
        </Space>
      ),
    },
  ];

  const linkColumns = [
    {
      title: "Оператор",
      dataIndex: "operator_nickname",
      ellipsis: true,
      render: (value, link) => (
        <span>
          <span className="fw-semibold">{value || "—"}</span>
          <span className="text-muted ms-1">#{link.operator_id}</span>
        </span>
      ),
    },
    {
      title: "Мастер",
      dataIndex: "master_label",
      ellipsis: true,
      render: (value, link) => (
        <span>
          {value || `Мастер #${link.master_key_id}`}
          <span className="text-muted ms-1">#{link.master_key_id}</span>
        </span>
      ),
    },
    { title: "Создана", dataIndex: "created_at", width: 160, render: formatTime },
    {
      title: "",
      width: 120,
      align: "right",
      render: (_, link) => (
        <Button size="small" variant="danger" onClick={() => unlinkOperator(link.operator_uuid, link.master_key_id)}>
          Разорвать
        </Button>
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
    { title: "Иконка", dataIndex: "icon_position", width: 90, align: "center", render: (value) => `${Number(value || 0) + 1}/5` },
    { title: "X", dataIndex: "x", width: 70, align: "center" },
    { title: "Y", dataIndex: "y", width: 70, align: "center" },
    { title: "Время", dataIndex: "created_at", width: 160, render: formatTime },
    {
      title: "Δ мс",
      dataIndex: "duration_ms",
      width: 100,
      align: "right",
      render: (value) => (value != null ? `${value} ms` : "—"),
    },
  ];

  return (
    <div data-eopp-component="OperatorsTab" className="operators-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Операторы</h2>
            <div className="small text-muted">
              Доступ операторов, привязка к мастер-ключам и журнал ответов по распределённым капчам
            </div>
          </div>
        }
        right={
          <Space wrap>
            <Button size="small" onClick={refreshAll}>Обновить</Button>
          </Space>
        }
      />

      <MetricsStrip items={metrics} />

      <Card
        data-eopp-component="OperatorAssignmentMatrix"
        className="mt-3"
        size="small"
        title="Матрица доступа"
        extra={
          <Space>
            <Button size="small" onClick={() => setAssignmentDraft(buildAssignmentDraft(operators))}>
              Сбросить
            </Button>
            <Button size="small" variant="primary" onClick={saveAssignments} loading={assignmentSaving}>
              Сохранить
            </Button>
          </Space>
        }
      >
        {assignmentError && <div className="alert alert-danger py-1 px-2 small mb-3">{assignmentError}</div>}
        <div className="operator-assignment-board">
          <div className="operator-assignment-source mb-3">
            <div className="small text-muted mb-2">Master keys</div>
            <div className="operator-master-tags">
              {internalKeys.map((key) => (
                <span
                  key={key.id}
                  className="operator-master-tag"
                  draggable
                  title={key.company_name || `#${key.company_id || ""}`}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", String(key.id))}
                >
                  {key.label || `#${key.id}`}
                </span>
              ))}
              {internalKeys.length === 0 && <span className="text-muted">Нет master keys</span>}
            </div>
          </div>
          <div className="operator-assignment-grid">
            {filteredOperators.map((op) => {
              const draft = assignmentDraft[op.id] || { companyIds: [], masterKeyIds: [] };
              const draftCompanyIds = new Set((draft.companyIds || []).map(String));
              const draftMasterIds = new Set((draft.masterKeyIds || []).map(Number));
              return (
                <div
                  key={op.id}
                  className="operator-assignment-row"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleMasterDrop(op.id, event)}
                >
                  <div className="operator-assignment-row__head">
                    <span className="fw-semibold">{op.nickname || `#${op.id}`}</span>
                    <span className="text-muted font-monospace ms-2">{clip(op.uuid)}</span>
                  </div>
                  <div className="operator-assignment-row__section">
                    <span className="small text-muted">Компании</span>
                    <div className="operator-master-tags">
                      {companies.map((company) => (
                        <label key={company.id} className="operator-master-tag">
                          <input
                            type="checkbox"
                            className="me-1"
                            checked={draftCompanyIds.has(String(company.id))}
                            onChange={(event) => toggleAssignmentCompany(op.id, company.id, event.target.checked)}
                          />
                          {company.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="operator-assignment-row__section">
                    <span className="small text-muted">Master keys</span>
                    <div className="operator-master-tags">
                      {internalKeys.map((key) => (
                        <label key={key.id} className="operator-master-tag" title={key.company_name || ""}>
                          <input
                            type="checkbox"
                            className="me-1"
                            checked={draftMasterIds.has(Number(key.id))}
                            onChange={(event) => toggleAssignmentMaster(op.id, key.id, event.target.checked)}
                          />
                          {key.label || `#${key.id}`}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredOperators.length === 0 && <div className="text-muted small">Нет операторов для матрицы</div>}
          </div>
        </div>
      </Card>

      <Card data-eopp-component="OperatorsListCard" className="mt-3" size="small" title="Операторы">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0 operators-create-input">
            Новый оператор
            <TextInput
              size="small"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              onPressEnter={addOperator}
              placeholder="operator1"
            />
          </label>
          <label className="form-label small mb-0 operators-create-input">
            Компания
            <SelectInput
              size="small"
              value={newOperatorCompanyId || undefined}
              onChange={(value) => setNewOperatorCompanyId(value || "")}
              options={companyOptions}
              placeholder="Компания"
            />
          </label>
          <Button size="small" variant="primary" onClick={addOperator} loading={loading}>
            Добавить
          </Button>
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

        <DataTable
          className="operators-table"
          rowKey="id"
          data={filteredOperators}
          columns={operatorColumns}
          emptyText="Нет операторов"
          pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: [10, 15, 30, 50] }}
        />
      </Card>

      <Card data-eopp-component="OperatorLinksCard" className="mt-3" size="small" title="Активные связки">
        <DataTable
          className="operator-links-table"
          rowKey="link_id"
          data={links}
          columns={linkColumns}
          emptyText="Нет активных связок"
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 25, 50] }}
        />
      </Card>

      <Card
        data-eopp-component="OperatorAnswersCard"
        className="mt-3"
        size="small"
        title={`Действия операторов (${answersTotal})`}
        extra={<Button size="small" onClick={() => loadAnswers(answersPage)}>Обновить</Button>}
      >
        <DataTable
          className="operator-answers-table"
          rowKey="id"
          data={answers}
          columns={answerColumns}
          emptyText="Нет действий"
          pagination={{
            current: answersPage,
            pageSize: PER_PAGE,
            total: answersTotal,
            showSizeChanger: false,
            onChange: (page) => loadAnswers(page),
            showTotal: (total) => `${total} всего`,
          }}
        />
      </Card>

      <Modal
        title={editOp ? `Редактировать оператора #${editOp.id}` : ""}
        open={!!editOp}
        onOk={handleEditSave}
        onCancel={() => setEditOp(null)}
        okText="Сохранить"
        cancelText="Отмена"
        destroyOnHidden
      >
        <div className="operators-modal-form">
          <label className="form-label small mb-0">
            Никнейм
            <TextInput
              value={editForm.nickname}
              onChange={(event) => setEditForm((prev) => ({ ...prev, nickname: event.target.value }))}
            />
          </label>
          <label className="form-label small mb-0">
            Компания
            <SelectInput
              value={editForm.companyId || undefined}
              onChange={(value) => setEditForm((prev) => {
                const companyId = value || "";
                const selected = Array.isArray(prev.companyIds) ? prev.companyIds.map(String) : [];
                return {
                  ...prev,
                  companyId,
                  companyIds: companyId && !selected.includes(companyId)
                    ? [companyId, ...selected]
                    : selected,
                };
              })}
              options={companyOptions}
              placeholder="Без компании"
            />
          </label>
          <label className="form-label small mb-0">
            Компании оператора
            <SelectInput
              mode="multiple"
              value={Array.isArray(editForm.companyIds) ? editForm.companyIds : []}
              onChange={(value) => setEditForm((prev) => ({ ...prev, companyIds: value || [] }))}
              options={companyOptions}
              placeholder="Компании, где оператор может работать"
            />
          </label>
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
            Доступные мастера
            <SelectInput
              mode="multiple"
              value={Array.isArray(editForm.allowed_master_keys) ? editForm.allowed_master_keys : []}
              onChange={(value) => setEditForm((prev) => ({ ...prev, allowed_master_keys: value || [] }))}
              options={masterOptions}
              placeholder="Пусто = все мастера"
            />
          </label>
        </div>
      </Modal>

      <Modal
        title="Перепривязать оператора"
        open={!!relinkOp}
        onOk={handleRelink}
        onCancel={() => setRelinkOp(null)}
        okText="Связать"
        cancelText="Отмена"
        okButtonProps={{ disabled: !relinkMasterId }}
        destroyOnHidden
      >
        <div className="operators-modal-form">
          <div className="small text-muted">
            Оператор: <span className="fw-semibold">{relinkOp?.nickname || `#${relinkOp?.id}`}</span>
            {relinkOp?.currentMasterId ? `, текущий мастер #${relinkOp.currentMasterId}` : ""}
          </div>
          <label className="form-label small mb-0">
            Новый мастер
            <SelectInput
              value={relinkMasterId || undefined}
              onChange={(value) => setRelinkMasterId(value || null)}
              options={(relinkOp?.availableKeys || []).map((key) => ({
                value: Number(key.id),
                label: key.label || `Ключ #${key.id}`,
              }))}
              placeholder="Выберите мастер"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
