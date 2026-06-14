import { adminRequest } from "../shared/adminClient";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card, Checkbox, Input, Modal, Pagination } from "antd";
import {
  Button,
  DataTable,
  FilterBar,
  MetricsStrip,
  SegmentedControl,
  SelectInput,
  StatusTag,
  TextInput,
  Toolbar,
} from "../../../ui";

function adminHeaders() {
  return { "Content-Type": "application/json" };
}

function adminHeadersJson() {
  return {};
}

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

function formatDuration(durationMs) {
  if (durationMs == null) return "—";
  if (durationMs < 1000) return `${durationMs} мс`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)} с`;
  const mins = Math.floor(durationMs / 60000);
  const secs = ((durationMs % 60000) / 1000).toFixed(1);
  return `${mins}м ${secs}с`;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

function pageCount(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize));
}

function pageSlice(items, page, pageSize) {
  return items.slice((page - 1) * pageSize, page * pageSize);
}

export function CaptchasTab({ adminToken, keys, onError, activeSubtab, onSubtabChange }) {
  const [captchas, setCaptchas] = useState([]);
  const [captchaFiles, setCaptchaFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(true);
  const [localSubtab, setLocalSubtab] = useState("operations");
  const subtab = activeSubtab ?? localSubtab;
  const setSubtab = onSubtabChange ?? setLocalSubtab;
  const [selected, setSelected] = useState(new Set());
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [coursePauseBetween, setCoursePauseBetween] = useState(true);
  const [courseCreating, setCourseCreating] = useState(false);
  const [preset, setPreset] = useState("all");
  const [search, setSearch] = useState("");
  const [keyFilter, setKeyFilter] = useState("all");
  const [answerFilter, setAnswerFilter] = useState("all");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [operationsPage, setOperationsPage] = useState(1);
  const [filesPage, setFilesPage] = useState(1);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);  // {new, updated, action_date_set, errors}
  const [previewCaptchaId, setPreviewCaptchaId] = useState(null);
  const [previewMode, setPreviewMode] = useState(null);
  const [labelingCaptcha, setLabelingCaptcha] = useState(null);
  const [labelSelectedIndex, setLabelSelectedIndex] = useState(null);
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelSaving, setLabelSaving] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState(null);
  const [recomputeLoading, setRecomputeLoading] = useState(false);

  const handleRecompute = async () => {
    if (!labelingCaptcha) return;
    setRecomputeLoading(true);
    setRecomputeResult(null);
    try {
      const res = await adminRequest(
        `/admin/captcha-label/${encodeURIComponent(labelingCaptcha.captcha_id)}/recompute`,
        { method: "POST", headers: adminHeaders(adminToken) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRecomputeResult(data);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setRecomputeLoading(false);
    }
  };

  const setFileClassification = async (captchaId, classification) => {
    // Optimistic local update
    setCaptchaFiles((prev) =>
      prev.map((f) => (f.captcha_id === captchaId ? { ...f, classification } : f))
    );
    try {
      const res = await adminRequest(
        `/admin/captcha-files/${encodeURIComponent(captchaId)}/classification`,
        { method: "PUT", headers: adminHeaders(adminToken), body: JSON.stringify({ classification }) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      onError?.(err.message);
    }
  };

  const fetchCaptchas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminRequest("/admin/captchas", {
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCaptchas(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch (err) {
      onError?.(err.message);
      setCaptchas([]);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  const fetchCaptchaFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const res = await adminRequest("/admin/captcha-files", {
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCaptchaFiles(Array.isArray(data) ? data : []);
    } catch (err) {
      onError?.(err.message);
      setCaptchaFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }, [adminToken, onError]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await adminRequest("/admin/captcha-files/sync", {
        method: "POST",
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSyncResult(data);
      await fetchCaptchaFiles();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchCaptchas();
    fetchCaptchaFiles();
  }, [fetchCaptchaFiles, fetchCaptchas]);

  const handleCreateCourse = async () => {
    if (selectedFileIds.size === 0 || !courseName.trim()) return;
    setCourseCreating(true);
    try {
      const res = await adminRequest("/admin/courses", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          name: courseName.trim(),
          description: courseDescription.trim(),
          captcha_file_ids: [...selectedFileIds],
          pause_between: coursePauseBetween,
        }),
      });
      if (res.ok) {
        setShowCourseModal(false);
        setCourseName("");
        setCourseDescription("");
        setSelectedFileIds(new Set());
      } else {
        const data = await res.json();
        onError?.(data.error || "Ошибка создания курса");
      }
    } catch (e) {
      onError?.("Сетевая ошибка");
    }
    setCourseCreating(false);
  };

  const handleSendSelected = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const res = await adminRequest("/admin/captchas/send-selected", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          captcha_ids: captchas
            .filter((c) => selected.has(c.id))
            .map((c) => c.captcha_id),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onError?.(null);
      alert(`Отправлено ${data.sent} капч`);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSending(false);
    }
  };

  const openLabelingPopup = async (captchaId) => {
    setLabelLoading(true);
    setLabelSelectedIndex(null);
    setRecomputeResult(null);
    try {
      const res = await adminRequest(`/admin/captcha-label/${encodeURIComponent(captchaId)}`, {
        headers: adminHeadersJson(adminToken),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setLabelingCaptcha(data);
      setLabelSelectedIndex(data.valid_index ?? null);
    } catch (err) {
      onError?.(err.message);
      setLabelingCaptcha(null);
    } finally {
      setLabelLoading(false);
    }
  };

  const saveLabelingChoice = async () => {
    if (!labelingCaptcha || labelSelectedIndex == null) return;
    setLabelSaving(true);
    try {
      const res = await adminRequest("/admin/captcha-label/save", {
        method: "POST",
        headers: adminHeaders(adminToken),
        body: JSON.stringify({
          captcha_id: labelingCaptcha.captcha_id,
          variant_index: labelSelectedIndex,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await Promise.all([fetchCaptchaFiles(), fetchCaptchas()]);
      setLabelingCaptcha(null);
      setLabelSelectedIndex(null);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLabelSaving(false);
    }
  };

  const labelVariantIndexes = useMemo(() => {
    if (!labelingCaptcha?.images) return [];
    const top3 = (labelingCaptcha.solver_top3 || []).filter((item) => Number.isInteger(item));
    return Object.keys(labelingCaptcha.images)
      .map((key) => parseInt(key, 10))
      .filter((key) => Number.isInteger(key))
      .sort((a, b) => {
        const ra = top3.indexOf(a);
        const rb = top3.indexOf(b);
        if (ra >= 0 && rb >= 0) return ra - rb;
        if (ra >= 0) return -1;
        if (rb >= 0) return 1;
        return a - b;
      });
  }, [labelingCaptcha]);

  const solverResultByVariant = useMemo(() => {
    const map = new Map();
    for (const result of labelingCaptcha?.solver_results || []) {
      if (Number.isInteger(result.variant)) {
        map.set(result.variant, result);
      }
    }
    return map;
  }, [labelingCaptcha]);

  const solverTop3 = useMemo(
    () => new Set((labelingCaptcha?.solver_top3 || []).filter((item) => Number.isInteger(item))),
    [labelingCaptcha],
  );

  const solverRankBadge = (rank) => {
    if (!Number.isInteger(rank)) {
      return <span className="text-muted">-</span>;
    }
    const cls = rank === 0 ? "text-success" : rank <= 2 ? "text-warning" : "text-danger";
    return <span className={`fw-semibold ${cls}`}>{rank}</span>;
  };

  const solvedBadge = (correctAnswer, status) => {
    const isPassed = status === "passed" || status === "confirmed";
    const label = isPassed ? "Решена" : "Не пройдена";
    return <StatusTag status={isPassed ? "confirmed" : "failed"} label={label} />;
  };

  const hashCounts = useMemo(() => {
    const counts = {};
    captchas.forEach((captcha) => {
      if (!captcha.tiles_hash) return;
      counts[captcha.tiles_hash] = (counts[captcha.tiles_hash] || 0) + 1;
    });
    return counts;
  }, [captchas]);

  const fileHashCounts = useMemo(() => {
    const counts = {};
    captchaFiles.forEach((captcha) => {
      if (!captcha.tiles_hash) return;
      counts[captcha.tiles_hash] = (counts[captcha.tiles_hash] || 0) + 1;
    });
    return counts;
  }, [captchaFiles]);

  const keyOptions = useMemo(() => {
    const optionMap = new Map();
    keys.forEach((key) => optionMap.set(String(key.id), key.label || key.key || `#${key.id}`));
    captchas.forEach((captcha) => {
      if (captcha.api_key_id == null) return;
      if (!optionMap.has(String(captcha.api_key_id))) {
        optionMap.set(String(captcha.api_key_id), captcha.key_label || `#${captcha.api_key_id}`);
      }
    });
    return [...optionMap.entries()].map(([id, label]) => ({ id, label }));
  }, [captchas, keys]);

  const filteredCaptchas = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return captchas.filter((captcha) => {
      if (preset === "passed" && captcha.status !== "passed") return false;
      if (preset === "failed" && captcha.status !== "failed") return false;
      if (keyFilter !== "all" && String(captcha.api_key_id) !== keyFilter) return false;
      if (answerFilter === "known" && !captcha.correct_answer) return false;
      if (answerFilter === "missing" && captcha.correct_answer) return false;
      if (duplicatesOnly && !(captcha.tiles_hash && fileHashCounts[captcha.tiles_hash] > 1)) return false;
      if (!normalizedSearch) return true;
      return [
        captcha.id,
        captcha.captcha_id,
        captcha.captcha_type,
        captcha.tiles_hash,
        captcha.fail_reason,
        captcha.key_label,
        captcha.usage_log_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [answerFilter, captchas, duplicatesOnly, hashCounts, keyFilter, preset, search]);

  const metrics = useMemo(() => ({
    total: filteredCaptchas.length,
    passed: filteredCaptchas.filter((captcha) => captcha.status === "passed").length,
    failed: filteredCaptchas.filter((captcha) => captcha.status === "failed").length,
    answerKnown: filteredCaptchas.filter((captcha) => !!captcha.correct_answer).length,
    duplicatePuzzles: filteredCaptchas.filter((captcha) => captcha.tiles_hash && hashCounts[captcha.tiles_hash] > 1).length,
  }), [filteredCaptchas, hashCounts]);

  const captchaToUsageLogs = useMemo(() => {
    const map = new Map();
    for (const captcha of captchas) {
      const cid = captcha.captcha_id;
      if (!map.has(cid)) map.set(cid, []);
      if (captcha.usage_log_id != null) {
        map.get(cid).push(captcha.usage_log_id);
      }
    }
    return map;
  }, [captchas]);

  const fileValidIndex = useMemo(() => {
    const map = new Map();
    for (const f of captchaFiles) {
      if (f.valid_index != null) {
        map.set(f.captcha_id, f.valid_index);
      }
    }
    return map;
  }, [captchaFiles]);

  const captchaFileById = useMemo(() => {
    const map = new Map();
    for (const file of captchaFiles) {
      map.set(file.captcha_id, file);
    }
    return map;
  }, [captchaFiles]);

  const filteredCaptchaFiles = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return captchaFiles.filter((captcha) => {
      if (preset === "passed" && captcha.file_status !== "labeled") return false;
      if (preset === "failed" && captcha.file_status !== "unlabeled") return false;
      if (answerFilter === "known" && captcha.valid_index == null) return false;
      if (answerFilter === "missing" && captcha.valid_index != null) return false;
      if (classificationFilter === "digit" && captcha.classification !== "digit") return false;
      if (classificationFilter === "figures" && captcha.classification !== "figures") return false;
      if (classificationFilter === "puzzle" && captcha.classification !== "puzzle") return false;
      if (classificationFilter === "icon_click" && captcha.classification !== "icon_click") return false;
      if (classificationFilter === "unset" && captcha.classification != null) return false;
      if (duplicatesOnly && !(captcha.tiles_hash && hashCounts[captcha.tiles_hash] > 1)) return false;
      if (!normalizedSearch) return true;
      return [
        captcha.id,
        captcha.captcha_id,
        captcha.tiles_hash,
        captcha.file_status,
        captcha.valid_index,
        captcha.solver_valid_rank,
        captcha.file_path,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [answerFilter, captchaFiles, classificationFilter, duplicatesOnly, fileHashCounts, preset, search]);

  const fileMetrics = useMemo(() => {
    const known = filteredCaptchaFiles.filter((captcha) => captcha.valid_index != null);
    const ranked = known.filter((captcha) => Number.isInteger(captcha.solver_valid_rank));
    const top1RankZero = ranked.filter((captcha) => captcha.solver_valid_rank === 0).length;
    const rankSum = ranked.reduce((sum, captcha) => sum + captcha.solver_valid_rank, 0);
    const ranks = ranked.map((captcha) => captcha.solver_valid_rank).sort((a, b) => a - b);
    const median = ranks.length > 0 ? ranks[Math.floor(ranks.length / 2)] : null;
    const percent = (value, total = ranked.length) => (
      total > 0 ? `${Math.round((value / total) * 100)}%` : "-"
    );
    const buckets = [
      { id: "0", label: "0", hint: "Сразу top1", count: ranked.filter((captcha) => captcha.solver_valid_rank === 0).length },
      { id: "1", label: "1", hint: "Второе место", count: ranked.filter((captcha) => captcha.solver_valid_rank === 1).length },
      { id: "2", label: "2", hint: "Третье место", count: ranked.filter((captcha) => captcha.solver_valid_rank === 2).length },
      { id: "3-5", label: "3-5", hint: "Близко, но не top3", count: ranked.filter((captcha) => captcha.solver_valid_rank >= 3 && captcha.solver_valid_rank <= 5).length },
      { id: "6-10", label: "6-10", hint: "Далеко", count: ranked.filter((captcha) => captcha.solver_valid_rank >= 6 && captcha.solver_valid_rank <= 10).length },
      { id: "11+", label: "11+", hint: "Очень далеко", count: ranked.filter((captcha) => captcha.solver_valid_rank >= 11).length },
    ];
    return {
      total: filteredCaptchaFiles.length,
      answerKnown: known.length,
      rankedCount: ranked.length,
      unrankedKnown: known.length - ranked.length,
      top1RankZero,
      top1RankZeroPercent: ranked.length > 0 ? Math.round((top1RankZero / ranked.length) * 100) : 0,
      avgSolverDistance: ranked.length > 0 ? (rankSum / ranked.length).toFixed(1) : "-",
      medianSolverDistance: median ?? "-",
      duplicatePuzzles: filteredCaptchaFiles.filter((captcha) => captcha.tiles_hash && fileHashCounts[captcha.tiles_hash] > 1).length,
      buckets: buckets.map((bucket) => ({
        ...bucket,
        percent: percent(bucket.count),
      })),
    };
  }, [filteredCaptchaFiles, fileHashCounts]);

  const failureSummary = useMemo(() => {
    const groups = {};
    filteredCaptchas
      .filter((captcha) => captcha.status === "failed")
      .forEach((captcha) => {
        const reason = captcha.fail_reason || "Без причины";
        if (!groups[reason]) groups[reason] = { reason, count: 0 };
        groups[reason].count++;
      });
    return Object.values(groups).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [filteredCaptchas]);

  const userSummary = useMemo(() => {
    const groups = {};
    filteredCaptchas.forEach((captcha) => {
      const label = captcha.key_label || "Без пользователя";
      if (!groups[label]) groups[label] = { label, total: 0, failed: 0 };
      groups[label].total++;
      if (captcha.status === "failed") groups[label].failed++;
    });
    return Object.values(groups).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [filteredCaptchas]);

  const operationsPageCount = pageCount(filteredCaptchas.length, pageSize);
  const filesPageCount = pageCount(filteredCaptchaFiles.length, pageSize);
  const currentOperationsPage = Math.min(operationsPage, operationsPageCount);
  const currentFilesPage = Math.min(filesPage, filesPageCount);
  const pagedCaptchas = useMemo(
    () => pageSlice(filteredCaptchas, currentOperationsPage, pageSize),
    [currentOperationsPage, filteredCaptchas, pageSize],
  );
  const pagedCaptchaFiles = useMemo(
    () => pageSlice(filteredCaptchaFiles, currentFilesPage, pageSize),
    [currentFilesPage, filteredCaptchaFiles, pageSize],
  );

  useEffect(() => {
    setOperationsPage(1);
    setFilesPage(1);
  }, [answerFilter, classificationFilter, duplicatesOnly, keyFilter, pageSize, preset, search]);

  useEffect(() => {
    if (operationsPage > operationsPageCount) setOperationsPage(operationsPageCount);
  }, [operationsPage, operationsPageCount]);

  useEffect(() => {
    if (filesPage > filesPageCount) setFilesPage(filesPageCount);
  }, [filesPage, filesPageCount]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const allVisibleSelected = pagedCaptchas.every((captcha) => prev.has(captcha.id));
      if (allVisibleSelected) {
        const next = new Set(prev);
        pagedCaptchas.forEach((captcha) => next.delete(captcha.id));
        return next;
      }
      return new Set([...prev, ...pagedCaptchas.map((captcha) => captcha.id)]);
    });
  };

  const toggleFileSelect = (id) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFileSelectAll = () => {
    setSelectedFileIds((prev) => {
      const allSelected = pagedCaptchaFiles.every((f) => prev.has(f.id));
      if (allSelected) {
        const next = new Set(prev);
        pagedCaptchaFiles.forEach((f) => next.delete(f.id));
        return next;
      }
      return new Set([...prev, ...pagedCaptchaFiles.map((f) => f.id)]);
    });
  };

  const operationMetricItems = [
    { key: "total", label: "Всего", value: metrics.total, tone: "neutral" },
    { key: "passed", label: "Решено", value: metrics.passed, tone: "success" },
    { key: "failed", label: "Не прошли", value: metrics.failed, tone: metrics.failed > 0 ? "danger" : "success" },
    { key: "answerKnown", label: "С ответом", value: metrics.answerKnown, tone: "info" },
    { key: "duplicates", label: "Повторы", value: metrics.duplicatePuzzles, tone: metrics.duplicatePuzzles > 0 ? "warning" : "neutral" },
  ];

  const fileMetricItems = [
    { key: "total", label: "Файлы", value: fileMetrics.total, tone: "neutral" },
    { key: "answerKnown", label: "С ответом", value: fileMetrics.answerKnown, tone: "info" },
    { key: "ranked", label: "С rank", value: fileMetrics.rankedCount, tone: "success" },
    { key: "top1", label: "Top1", value: `${fileMetrics.top1RankZeroPercent}%`, tone: fileMetrics.top1RankZeroPercent >= 80 ? "success" : "warning" },
    { key: "distance", label: "Сред. rank", value: fileMetrics.avgSolverDistance, tone: "neutral" },
    { key: "duplicates", label: "Повторы", value: fileMetrics.duplicatePuzzles, tone: fileMetrics.duplicatePuzzles > 0 ? "warning" : "neutral" },
  ];

  const renderPagination = (page, totalPages, setPage, totalItems, shownItems) => {
    const currentPage = Math.min(page, totalPages);
    return (
      <Pagination
        data-eopp-component="CaptchasPagination"
        className="captchas-pagination"
        current={currentPage}
        pageSize={pageSize}
        total={totalItems}
        showSizeChanger
        pageSizeOptions={PAGE_SIZE_OPTIONS.map(String)}
        showTotal={(total, range) => `${range[0]}-${range[1]} из ${total}`}
        onChange={(nextPage, nextPageSize) => {
          setPage(nextPage);
          setPageSize(nextPageSize);
        }}
        size="small"
      />
    );
  };

  const renderFilePreview = (captcha) => (
    captcha.valid_index != null || captcha.solver_valid_rank == null ? (
      <img
        data-eopp-component="CaptchaFilePreview"
        className="captchas-preview"
        src={`/admin/captcha-files/${captcha.captcha_id}/thumbnail?${captcha.valid_index == null ? "mode=solver_top1" : ""}`}
        alt={captcha.valid_index == null ? "solver top1" : "variant"}
        loading="lazy"
        onError={(event) => { event.currentTarget.style.display = "none"; }}
        onClick={() => {
          setPreviewCaptchaId(captcha.captcha_id);
          setPreviewMode(captcha.valid_index == null ? "solver_top1" : null);
        }}
      />
    ) : "—"
  );

  const renderOperationPreview = (captcha) => (
    fileValidIndex.has(captcha.captcha_id) ? (
      <img
        data-eopp-component="CaptchaOperationPreview"
        className="captchas-preview"
        src={`/admin/captcha-files/${captcha.captcha_id}/thumbnail`}
        alt="variant"
        loading="lazy"
        onError={(event) => { event.currentTarget.style.display = "none"; }}
        onClick={() => {
          setPreviewCaptchaId(captcha.captcha_id);
          setPreviewMode(null);
        }}
      />
    ) : "—"
  );

  const labelingStatus = (captcha) => {
    if (captcha.has_coordinates && captcha.has_boxes) return <StatusTag status="confirmed" label="точки+боксы" />;
    if (captcha.has_coordinates) return <StatusTag status="failed" label="точки" />;
    if (captcha.has_boxes) return <StatusTag status="pending" label="боксы" />;
    if (captcha.manual_labeled) return <StatusTag status="warning" label="пазл" />;
    return <span className="text-muted">—</span>;
  };

  const fileColumns = [
    { title: "ID", dataIndex: "id", width: 56, render: (value) => <span className="text-muted">#{value}</span> },
    { title: "Captcha ID", dataIndex: "captcha_id", width: 210, ellipsis: true, render: (value) => <span className="font-monospace" title={value}>{value}</span> },
    { title: "Тип", dataIndex: "captcha_type", width: 92, render: (value) => value || "unknown" },
    {
      title: "Класс",
      dataIndex: "classification",
      width: 118,
      render: (value, captcha) => (
        <SelectInput
          size="small"
          value={value || ""}
          onChange={(next) => setFileClassification(captcha.captcha_id, next || null)}
          options={[
            { value: "", label: "—" },
            { value: "digit", label: "Цифры" },
            { value: "figures", label: "Фигуры" },
            { value: "puzzle", label: "Пазл" },
            { value: "icon_click", label: "Иконки" },
          ]}
          allowClear={false}
        />
      ),
    },
    { title: "Rank", dataIndex: "solver_valid_rank", width: 70, align: "center", render: solverRankBadge },
    {
      title: "Вариант",
      width: 76,
      align: "center",
      render: (_, captcha) => captcha.valid_index != null
        ? captcha.valid_index
        : captcha.no_valid_index != null
          ? <span className="text-danger fw-semibold">{captcha.no_valid_index}</span>
          : "—",
    },
    { title: "Разм.", width: 118, align: "center", render: (_, captcha) => labelingStatus(captcha) },
    { title: "Hash", dataIndex: "tiles_hash", width: 120, ellipsis: true, render: (value) => <span className="font-monospace" title={value || "—"}>{value || "—"}</span> },
    { title: "Usage", width: 130, ellipsis: true, render: (_, captcha) => <span className="font-monospace">{captchaToUsageLogs.get(captcha.captcha_id)?.join(", ") || "—"}</span> },
    { title: "Размер", dataIndex: "file_size", width: 88, render: (value) => (value ? `${Math.round(value / 1024)} KB` : "—") },
    { title: "Превью", width: 90, render: (_, captcha) => renderFilePreview(captcha) },
    { title: "Статус", dataIndex: "file_status", width: 98, align: "center", render: (value) => <StatusTag status={value === "labeled" ? "confirmed" : "failed"} label={value === "labeled" ? "Решена" : "Не решена"} /> },
    { title: "Дата", dataIndex: "file_mtime", width: 132, render: formatDate },
    {
      title: "",
      width: 104,
      align: "right",
      render: (_, captcha) => (
        <Button size="small" onClick={() => openLabelingPopup(captcha.captcha_id)}>Разметка</Button>
      ),
    },
  ];

  const operationColumns = [
    { title: "ID", dataIndex: "id", width: 56, render: (value) => <span className="text-muted">#{value}</span> },
    { title: "Captcha ID", dataIndex: "captcha_id", width: 210, ellipsis: true, render: (value) => <span className="font-monospace" title={value}>{value}</span> },
    { title: "Решена", width: 98, align: "center", render: (_, captcha) => solvedBadge(captcha.correct_answer, captcha.status) },
    { title: "Причина", dataIndex: "fail_reason", width: 150, ellipsis: true, render: (value) => <span className="text-danger" title={value || "—"}>{value || "—"}</span> },
    { title: "Hash", dataIndex: "tiles_hash", width: 120, ellipsis: true, render: (value) => <span className="font-monospace" title={value || "—"}>{value || "—"}</span> },
    {
      title: "Разм.",
      width: 84,
      align: "center",
      render: (_, captcha) => {
        const file = captchaFileById.get(captcha.captcha_id);
        if (!file) return "—";
        return file.manual_labeled ? <StatusTag status="warning" label="Ручная" /> : <StatusTag status="neutral" label="Исх." />;
      },
    },
    { title: "Rank", width: 70, align: "center", render: (_, captcha) => captchaFileById.get(captcha.captcha_id) ? solverRankBadge(captchaFileById.get(captcha.captcha_id).solver_valid_rank) : "—" },
    {
      title: "Вариант",
      width: 76,
      align: "center",
      render: (_, captcha) => {
        const file = captchaFileById.get(captcha.captcha_id);
        const variant = file?.valid_index ?? file?.no_valid_index ?? null;
        return variant != null ? variant : "—";
      },
    },
    { title: "Пользователь", dataIndex: "key_label", width: 130, ellipsis: true, render: (value) => value || "—" },
    { title: "Usage", dataIndex: "usage_log_id", width: 82, align: "center" },
    { title: "Дата", dataIndex: "created_at", width: 132, render: formatDate },
    { title: "Время", dataIndex: "duration_ms", width: 86, render: formatDuration },
    { title: "Превью", width: 90, render: (_, captcha) => renderOperationPreview(captcha) },
  ];

  if (subtab === "operations" && loading) {
    return <div className="text-center text-muted py-3">Загрузка…</div>;
  }

  if (subtab === "files" && filesLoading) {
    return <div className="text-center text-muted py-3">Загрузка…</div>;
  }

  return (
    <div data-eopp-component="CaptchasTab" className="captchas-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Капчи</h2>
            <div className="small text-muted">
              Архив операций, файлы капч, ручная разметка и подготовка курсов
            </div>
          </div>
        }
        right={
          <span className="text-muted small">
            {subtab === "files"
              ? `Показано: ${filteredCaptchaFiles.length} из ${captchaFiles.length}`
              : `Показано: ${filteredCaptchas.length} из ${captchas.length}`}
          </span>
        }
      />

      <Toolbar
        className="mb-2"
        left={
          <>
            <SegmentedControl
              size="small"
              value={subtab}
              onChange={setSubtab}
              options={[
                { value: "operations", label: "По операциям" },
                { value: "files", label: "Все капчи" },
              ]}
            />
            <SegmentedControl
              size="small"
              value={preset}
              onChange={setPreset}
              options={[
                { value: "all", label: "Все" },
                { value: "passed", label: "Решенные" },
                { value: "failed", label: "Не прошедшие" },
              ]}
            />
            <Button size="small" onClick={subtab === "files" ? fetchCaptchaFiles : fetchCaptchas}>
              Обновить
            </Button>
            {subtab === "files" && (
              <Button size="small" onClick={handleSync} disabled={syncing}>
                {syncing ? "Синхронизация…" : "Синхронизировать"}
              </Button>
            )}
            {subtab === "operations" && (
              <Button
                size="small"
                variant="primary"
                onClick={handleSendSelected}
                disabled={selected.size === 0 || sending}
              >
                {sending ? "Отправка…" : `Отправить выбранные (${selected.size})`}
              </Button>
            )}
          </>
        }
        right={
          syncResult && subtab === "files" ? (
            <StatusTag
              status={syncResult.errors > 0 ? "failed" : "confirmed"}
              label={`+${syncResult.new} новых, ↻${syncResult.updated} обновлено${syncResult.action_date_set > 0 ? `, ${syncResult.action_date_set} дат` : ""}${syncResult.icon_coords_backfilled > 0 ? `, ${syncResult.icon_coords_backfilled} иконок` : ""}${syncResult.errors > 0 ? `, ${syncResult.errors} ошибок` : ""}`}
            />
          ) : null
        }
      />

      <FilterBar className="mb-3">
        <label className="form-label small mb-0 captchas-search">
          Поиск
          <TextInput
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Captcha ID, hash, причина, usage log, пользователь"
          />
        </label>
        <label className="form-label small mb-0">
          Пользователь
          <SelectInput
            size="small"
            value={keyFilter}
            onChange={(value) => setKeyFilter(value || "all")}
            options={[
              { value: "all", label: "Все" },
              ...keyOptions.map((key) => ({ value: key.id, label: key.label })),
            ]}
            allowClear={false}
            style={{ minWidth: 180 }}
          />
        </label>
        <label className="form-label small mb-0">
          Ответ
          <SelectInput
            size="small"
            value={answerFilter}
            onChange={(value) => setAnswerFilter(value || "all")}
            options={[
              { value: "all", label: "Все" },
              { value: "known", label: "Есть ответ" },
              { value: "missing", label: "Без ответа" },
            ]}
            allowClear={false}
          />
        </label>
        <label className="form-label small mb-0">
          Класс
          <SelectInput
            size="small"
            value={classificationFilter}
            onChange={(value) => setClassificationFilter(value || "all")}
            options={[
              { value: "all", label: "Все" },
              { value: "digit", label: "Цифры" },
              { value: "figures", label: "Фигуры" },
              { value: "puzzle", label: "Пазл" },
              { value: "icon_click", label: "Иконки" },
              { value: "unset", label: "Без класса" },
            ]}
            allowClear={false}
          />
        </label>
        <Checkbox
          data-eopp-component="CaptchasDuplicatesOnly"
          className="captchas-duplicates-toggle"
            checked={duplicatesOnly}
            onChange={(event) => setDuplicatesOnly(event.target.checked)}
        >
          Только повторные пазлы
        </Checkbox>
      </FilterBar>

      <MetricsStrip items={subtab === "files" ? fileMetricItems : operationMetricItems} />

      {subtab === "files" && (
        <div data-eopp-component="CaptchasRankBuckets" className="captchas-rank-buckets">
          {fileMetrics.buckets.map((bucket) => (
            <div key={bucket.id} className="captchas-rank-bucket">
              <strong>{bucket.label}</strong>
              <span>{bucket.count}</span>
              <small>{bucket.percent}</small>
            </div>
          ))}
        </div>
      )}
      {subtab === "operations" && (failureSummary.length > 0 || userSummary.length > 0) && (
        <div className="captchas-summary-grid mb-3">
          {failureSummary.length > 0 && (
            <Card data-eopp-component="CaptchasFailureSummaryCard" size="small" title="Причины непройденных капч">
              <DataTable
                className="captchas-summary-table"
                rowKey="reason"
                data={failureSummary}
                columns={[
                  {
                    title: "Причина",
                    dataIndex: "reason",
                    ellipsis: true,
                    render: (value) => <span title={value}>{value}</span>,
                  },
                  {
                    title: "Кол-во",
                    dataIndex: "count",
                    width: 80,
                    align: "center",
                    render: (value) => <strong>{value}</strong>,
                  },
                ]}
                emptyText="Нет причин"
                pagination={false}
                scroll={false}
              />
            </Card>
          )}
          {userSummary.length > 0 && (
            <Card data-eopp-component="CaptchasUserSummaryCard" size="small" title="Капчи по пользователям">
              <DataTable
                className="captchas-summary-table"
                rowKey="label"
                data={userSummary}
                columns={[
                  {
                    title: "Пользователь",
                    dataIndex: "label",
                    ellipsis: true,
                  },
                  {
                    title: "Всего",
                    dataIndex: "total",
                    width: 76,
                    align: "center",
                  },
                  {
                    title: "Ошибки",
                    dataIndex: "failed",
                    width: 76,
                    align: "center",
                  },
                ]}
                emptyText="Нет пользователей"
                pagination={false}
                scroll={false}
              />
            </Card>
          )}
        </div>
      )}

      {subtab === "files" ? (
        filteredCaptchaFiles.length === 0 ? (
          <div className="text-center text-muted py-3">Нет файлов капч</div>
        ) : (
          <>
          {renderPagination(currentFilesPage, filesPageCount, setFilesPage, filteredCaptchaFiles.length, pagedCaptchaFiles.length)}
          {selectedFileIds.size > 0 && (
            <div className="mb-2">
              <span className="text-muted me-2" style={{ fontSize: "0.85rem" }}>
                Выбрано: {selectedFileIds.size}
              </span>
              <Button size="small" variant="primary" onClick={() => setShowCourseModal(true)}>
                Создать курс
              </Button>
            </div>
          )}
          <DataTable
            className="captchas-files-table"
            rowKey="id"
            data={pagedCaptchaFiles}
            columns={fileColumns}
            emptyText="Нет файлов капч"
            pagination={false}
            scroll={{ x: 1420 }}
            rowSelection={{
              selectedRowKeys: [...selectedFileIds],
              onChange: (keys) => setSelectedFileIds(new Set(keys)),
            }}
          />
          {renderPagination(currentFilesPage, filesPageCount, setFilesPage, filteredCaptchaFiles.length, pagedCaptchaFiles.length)}
          </>
        )
      ) : filteredCaptchas.length === 0 ? (
        <div className="text-center text-muted py-3">Нет капч</div>
      ) : (
        <>
        {renderPagination(currentOperationsPage, operationsPageCount, setOperationsPage, filteredCaptchas.length, pagedCaptchas.length)}
        <DataTable
          className="captchas-operations-table"
          rowKey="id"
          data={pagedCaptchas}
          columns={operationColumns}
          emptyText="Нет капч"
          pagination={false}
          scroll={{ x: 1320 }}
          rowSelection={{
            selectedRowKeys: [...selected],
            onChange: (keys) => setSelected(new Set(keys)),
          }}
        />
        {renderPagination(currentOperationsPage, operationsPageCount, setOperationsPage, filteredCaptchas.length, pagedCaptchas.length)}
        </>
      )}
      {previewCaptchaId && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1050,
            cursor: "pointer",
          }}
          onClick={() => {
            setPreviewCaptchaId(null);
            setPreviewMode(null);
          }}
        >
          <img
            src={`/admin/captcha-files/${previewCaptchaId}/thumbnail${previewMode ? `?mode=${previewMode}` : ""}`}
            alt="variant large"
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain" }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {(labelingCaptcha || labelLoading) && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1060,
            padding: 16,
          }}
          onClick={() => {
            if (!labelSaving) setLabelingCaptcha(null);
          }}
        >
          <div
            className="bg-body text-body rounded shadow-lg"
            style={{ width: "min(1800px, 98vw)", maxHeight: "96vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex align-items-center gap-2 border-bottom px-3 py-2">
              <div className="fw-semibold">Разметка капчи</div>
              {labelingCaptcha && (
                <div className="font-monospace small text-muted">{labelingCaptcha.captcha_id}</div>
              )}
              <Button
                data-eopp-component="CaptchasLabelCloseButton"
                size="small"
                className="ms-auto"
                onClick={() => setLabelingCaptcha(null)}
                disabled={labelSaving}
                title="Закрыть"
              >
                Закрыть
              </Button>
            </div>
            <div className="p-3">
              {labelLoading ? (
                <div className="text-center text-muted py-4">Загрузка...</div>
              ) : (
                <>
                  {labelingCaptcha?.captcha_type === "icon_click" ? (
                    <IconClickLabelView
                      labelingCaptcha={labelingCaptcha}
                      adminToken={adminToken}
                      onError={(msg) => onError?.(msg)}
                      onSaved={() => { setLabelingCaptcha(null); setLabelSelectedIndex(0); fetchCaptchaFiles(); }}
                    />
                  ) : (
                    <div className="captchas-label-variants">
                      {labelVariantIndexes.map((index) => (
                          <Button
                            key={index}
                            htmlType="button"
                            className={`captchas-label-variant ${labelSelectedIndex === index ? "is-selected" : ""}`}
                            onClick={() => setLabelSelectedIndex(index)}
                          >
                            <img
                              src={`data:image/png;base64,${labelingCaptcha.images[String(index)]}`}
                              alt={`Вариант ${index}`}
                              className="captchas-label-variant__image"
                            />
                            <div className="captchas-label-variant__body">
                              <div className="captchas-label-variant__header">
                                <span>Вариант {index}</span>
                                {labelSelectedIndex === index && (
                                  <StatusTag status="confirmed" label="Выбран" />
                                )}
                              </div>
                              <div className="captchas-label-variant__tags">
                                {labelingCaptcha.valid_index === index && (
                                  <StatusTag status="confirmed" label="Был выдан" />
                                )}
                                {labelingCaptcha.no_valid_index === index && (
                                  <StatusTag status="failed" label="Не выбран" />
                                )}
                                {solverResultByVariant.get(index)?.rank === 1 && (
                                  <StatusTag status="pending" label="Прогноз" />
                                )}
                                {solverTop3.has(index) && solverResultByVariant.get(index)?.rank !== 1 && (
                                  <StatusTag status="pending" label="Top 3" />
                                )}
                                {recomputeResult?.best_variant === index && (
                                  <StatusTag status="confirmed" label="New Top1" />
                                )}
                                {solverResultByVariant.get(index) && (
                                  <StatusTag
                                    status="neutral"
                                    label={`#${solverResultByVariant.get(index).rank} score ${solverResultByVariant.get(index).score}`}
                                  />
                                )}
                                {solverResultByVariant.get(index) && (
                                  <StatusTag status="neutral" label="Расчеты" />
                                )}
                              </div>
                              {solverResultByVariant.get(index) && (
                                <div className="captchas-label-variant__metrics">
                                  d {solverResultByVariant.get(index).discontinuity} · ssim {solverResultByVariant.get(index).ssim} · coh {solverResultByVariant.get(index).coherence} · sobel {solverResultByVariant.get(index).sobel}
                                </div>
                              )}
                            </div>
                          </Button>
                      ))}
                    </div>
                  )}
                  <Toolbar
                    className="captchas-label-toolbar mt-3"
                    left={
                      <>
                    <Button
                      htmlType="button"
                      size="small"
                      onClick={handleRecompute}
                      disabled={recomputeLoading}
                    >
                      {recomputeLoading ? "Считаю..." : "Пересчитать"}
                    </Button>
                    {recomputeResult && (
                      <span className="captchas-recompute-result">
                        <StatusTag status="neutral" label={recomputeResult.classification} />
                        <span className="text-muted">{recomputeResult.solver}</span>
                        <span>Top1: <b>{recomputeResult.best_variant}</b></span>
                      </span>
                    )}
                      </>
                    }
                    right={
                      <>
                      <Button
                        type="button"
                        onClick={() => setLabelingCaptcha(null)}
                        disabled={labelSaving}
                      >
                        Отмена
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={saveLabelingChoice}
                        disabled={labelSaving || labelSelectedIndex == null}
                      >
                        {labelSaving ? "Сохранение..." : "Сохранить как верный"}
                      </Button>
                      </>
                    }
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Course creation modal */}
      <Modal
        data-eopp-component="CaptchaCourseModal"
        title="Создать курс"
        open={showCourseModal}
        onCancel={() => setShowCourseModal(false)}
        onOk={handleCreateCourse}
        okText={courseCreating ? "Создание..." : "Создать курс"}
        okButtonProps={{ disabled: courseCreating || !courseName.trim(), loading: courseCreating }}
        cancelText="Отмена"
        destroyOnClose
      >
        <div className="captcha-course-form">
          <p className="text-muted small mb-0">
            Выбрано капч: <strong>{selectedFileIds.size}</strong>
          </p>
          <label className="form-label mb-0">
            Название курса
            <TextInput
              data-eopp-component="CaptchaCourseNameInput"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="Например: Базовый курс для новичков"
            />
          </label>
          <label className="form-label mb-0">
            Описание
            <Input.TextArea
              data-eopp-component="CaptchaCourseDescriptionInput"
              rows={3}
              value={courseDescription}
              onChange={(e) => setCourseDescription(e.target.value)}
              placeholder="Инструкции или заметки к курсу"
            />
          </label>
          <Checkbox
            data-eopp-component="CaptchaCoursePauseCheckbox"
            checked={coursePauseBetween}
            onChange={(e) => setCoursePauseBetween(e.target.checked)}
          >
            Режим экзамена — паузы 2–7 сек между капчами
          </Checkbox>
        </div>
      </Modal>
    </div>
  );
}

function IconClickLabelView({ labelingCaptcha, adminToken, onError, onSaved }) {
  const imgRef = React.useRef(null);
  const [naturalSize, setNaturalSize] = React.useState(null);
  const [mode, setMode] = React.useState("points"); // "points" | "boxes"
  const mainImg = labelingCaptcha?.images?.["0"];
  const iconsImg = labelingCaptcha?.icons_image;
  const savedCoordinates = labelingCaptcha?.coordinates || [];
  const savedBoxes = labelingCaptcha?.boxes || [];
  const COLORS = ["#dc3545", "#fd7e14", "#ffc107", "#198754", "#0d6efd"];

  // Points mode state
  const [points, setPoints] = React.useState(() =>
    savedCoordinates.length === 5 ? savedCoordinates : Array(5).fill(null).map(() => ({ x: 0, y: 0 }))
  );
  const [pointsCount, setPointsCount] = React.useState(savedCoordinates.length === 5 ? 5 : 0);
  const [pointsStarted, setPointsStarted] = React.useState(false);

  // Box drawing state
  const [boxes, setBoxes] = React.useState(() => {
    if (savedBoxes.length === 5) return savedBoxes;
    return Array(5).fill(null).map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  });
  const [activePos, setActivePos] = React.useState(0); // 0-4
  const [dragStart, setDragStart] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  // Reset points when captcha changes
  React.useEffect(() => {
    setPoints(savedCoordinates.length === 5 ? savedCoordinates : Array(5).fill(null).map(() => ({ x: 0, y: 0 })));
    setPointsCount(savedCoordinates.length === 5 ? 5 : 0);
    setPointsStarted(false);
  }, [labelingCaptcha?.captcha_id]);

  const handleImageLoad = (e) => {
    setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight });
  };

  const toImageCoords = (clientX, clientY) => {
    if (!imgRef.current || !naturalSize) return null;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.round((clientX - rect.left) * naturalSize.w / rect.width);
    const y = Math.round((clientY - rect.top) * naturalSize.h / rect.height);
    return { x: Math.max(0, Math.min(x, naturalSize.w)), y: Math.max(0, Math.min(y, naturalSize.h)) };
  };

  // ── Points mode: click to place markers ──
  const handlePointClick = (e) => {
    if (mode !== "points") return;
    const coords = toImageCoords(e.clientX, e.clientY);
    if (!coords) return;
    setPointsStarted(true);
    setPoints(prev => {
      const next = [...prev];
      next[pointsCount] = coords;
      return next;
    });
    setPointsCount(prev => Math.min(prev + 1, 5));
  };

  const resetPoints = () => {
    setPoints(Array(5).fill(null).map(() => ({ x: 0, y: 0 })));
    setPointsCount(0);
    setPointsStarted(false);
  };

  // ── Boxes mode: drag to draw ──
  const handleMouseDown = (e) => {
    if (mode !== "boxes") return;
    const coords = toImageCoords(e.clientX, e.clientY);
    if (!coords) return;
    setDragStart(coords);
    setBoxes(prev => {
      const next = [...prev];
      next[activePos] = { x: coords.x, y: coords.y, w: 0, h: 0 };
      return next;
    });
  };

  const handleMouseMove = (e) => {
    if (!dragStart) return;
    const coords = toImageCoords(e.clientX, e.clientY);
    if (!coords) return;
    setBoxes(prev => {
      const next = [...prev];
      next[activePos] = {
        x: Math.min(dragStart.x, coords.x),
        y: Math.min(dragStart.y, coords.y),
        w: Math.abs(coords.x - dragStart.x),
        h: Math.abs(coords.y - dragStart.y),
      };
      return next;
    });
  };

  const handleMouseUp = () => {
    setDragStart(null);
  };

  const clearBox = (pos) => {
    setBoxes(prev => {
      const next = [...prev];
      next[pos] = { x: 0, y: 0, w: 0, h: 0 };
      return next;
    });
  };

  // ── Save ──
  const handleSavePoints = async () => {
    if (pointsCount < 5) return;
    setSaving(true);
    try {
      const res = await adminRequest(`/admin/captcha-label/${encodeURIComponent(labelingCaptcha.captcha_id)}/save-coordinates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: points.slice(0, 5) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onSaved?.();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBoxes = async () => {
    setSaving(true);
    try {
      const res = await adminRequest(`/admin/captcha-label/${encodeURIComponent(labelingCaptcha.captcha_id)}/save-boxes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boxes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onSaved?.();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-eopp-component="IconClickLabelView" className="icon-click-label">
      {/* Mode toggle */}
      <SegmentedControl
        size="small"
        value={mode}
        onChange={(value) => setMode(value)}
        options={[
          { value: "points", label: "Точки" },
          { value: "boxes", label: "Боксы" },
        ]}
      />

      {/* Main image */}
      <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", lineHeight: 0 }}>
        {mainImg && (
          <img
            ref={imgRef}
            src={"data:image/png;base64," + mainImg}
            alt="Капча"
            onLoad={handleImageLoad}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handlePointClick}
            style={{
              width: "100%", maxWidth: "800px", maxHeight: "65vh",
              objectFit: "contain", borderRadius: 8,
              border: "2px solid var(--border)", display: "block",
              cursor: mode === "boxes" ? "crosshair" : mode === "points" && pointsCount < 5 ? "crosshair" : "default",
            }}
            draggable={false}
          />
        )}

        {/* Points mode: coordinate markers */}
        {mode === "points" && naturalSize && (pointsStarted ? (
          points.map((c, i) => {
            if (i >= pointsCount) return null;
            return (
              <div key={i} style={{
                position: "absolute",
                left: `${((c.x / naturalSize.w) * 100).toFixed(2)}%`,
                top: `${((c.y / naturalSize.h) * 100).toFixed(2)}%`,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none", zIndex: 1,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: COLORS[i % COLORS.length],
                  border: "3px solid #fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 16, fontWeight: "bold",
                  boxShadow: "0 0 12px rgba(0,0,0,0.6)",
                }}>{i + 1}</div>
              </div>
            );
          })
        ) : (
          savedCoordinates.length === 5 ? savedCoordinates.map((sc, i) => (
            <div key={i} style={{
              position: "absolute",
              left: `${((sc.x / naturalSize.w) * 100).toFixed(2)}%`,
              top: `${((sc.y / naturalSize.h) * 100).toFixed(2)}%`,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none", zIndex: 1,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: COLORS[i % COLORS.length],
                border: "3px solid #fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 16, fontWeight: "bold",
                boxShadow: "0 0 12px rgba(0,0,0,0.6)",
              }}>{i + 1}</div>
            </div>
          )) : null
        ))}

        {/* Boxes overlay — shown in boxes mode, or in points mode if saved */}
        {naturalSize && (mode === "boxes" ? (
          boxes.map((b, i) => {
            if (!b || (b.w === 0 && b.h === 0)) return null;
            return (
              <div key={i} style={{
                position: "absolute",
                left: `${((b.x / naturalSize.w) * 100).toFixed(2)}%`,
                top: `${((b.y / naturalSize.h) * 100).toFixed(2)}%`,
                width: `${((b.w / naturalSize.w) * 100).toFixed(2)}%`,
                height: `${((b.h / naturalSize.h) * 100).toFixed(2)}%`,
                pointerEvents: "none", zIndex: 1,
                border: `2px solid ${COLORS[i % COLORS.length]}`,
                background: COLORS[i % COLORS.length] + "33",
              }}>
                <div style={{
                  position: "absolute", top: -20, left: 4,
                  fontSize: "0.7rem", fontWeight: 700,
                  color: COLORS[i % COLORS.length],
                  background: "rgba(0,0,0,0.7)", padding: "0 4px", borderRadius: 3,
                }}>#{i + 1} ({b.w}x{b.h})</div>
              </div>
            );
          })
        ) : savedBoxes.length === 5 ? (
          savedBoxes.map((b, i) => {
            if (!b || (b.w === 0 && b.h === 0)) return null;
            return (
              <div key={i} style={{
                position: "absolute",
                left: `${((b.x / naturalSize.w) * 100).toFixed(2)}%`,
                top: `${((b.y / naturalSize.h) * 100).toFixed(2)}%`,
                width: `${((b.w / naturalSize.w) * 100).toFixed(2)}%`,
                height: `${((b.h / naturalSize.h) * 100).toFixed(2)}%`,
                pointerEvents: "none", zIndex: 0,
                border: `2px dashed ${COLORS[i % COLORS.length]}`,
                background: COLORS[i % COLORS.length] + "15",
              }}>
                <div style={{
                  position: "absolute", top: -20, left: 4,
                  fontSize: "0.7rem", fontWeight: 700,
                  color: COLORS[i % COLORS.length],
                  background: "rgba(0,0,0,0.7)", padding: "0 4px", borderRadius: 3,
                }}>#{i + 1} ({b.w}x{b.h})</div>
              </div>
            );
          })
        ) : null)}
      </div>

      {/* Points mode controls */}
      {mode === "points" && (
        <Toolbar
          className="icon-click-label__toolbar"
          left={
            <span className="icon-click-label__hint">
            Кликов: {pointsCount}/5 — кликайте по иконкам в порядке 1→5
          </span>
          }
          right={
            <>
          <Button size="small" onClick={resetPoints}>
            Сбросить
          </Button>
          <Button
            size="small"
            variant="primary"
            onClick={handleSavePoints}
            disabled={saving || pointsCount < 5}
          >
            {saving ? "Сохранение..." : "Сохранить точки"}
          </Button>
            </>
          }
        />
      )}

      {/* Box position selector */}
      {mode === "boxes" && (
        <Toolbar
          className="icon-click-label__toolbar"
          left={
            <>
          <SegmentedControl
            size="small"
            value={activePos}
            onChange={(value) => setActivePos(Number(value))}
            options={[0, 1, 2, 3, 4].map((pos) => ({ value: pos, label: String(pos + 1) }))}
          />
          <Button size="small" variant="danger" onClick={() => clearBox(activePos)}>
            Очистить
          </Button>
          <span className="icon-click-label__hint">
            Выделите область для иконки #{activePos + 1}
          </span>
            </>
          }
        />
      )}

      {/* Icons strip */}
      {iconsImg && (
        <div style={{ textAlign: "center", marginTop: 4 }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}>
            Порядок иконок (слева направо)
          </div>
          <img
            src={"data:image/png;base64," + iconsImg}
            alt="Иконки"
            style={{ height: 50, borderRadius: 4, display: "block", margin: "0 auto" }}
            draggable={false}
          />
        </div>
      )}

      {/* Save boxes button */}
      {mode === "boxes" && (
        <Button
          size="small"
          variant="primary"
          onClick={handleSaveBoxes}
          disabled={saving}
        >
          {saving ? "Сохранение..." : "Сохранить боксы"}
        </Button>
      )}
    </div>
  );
}
