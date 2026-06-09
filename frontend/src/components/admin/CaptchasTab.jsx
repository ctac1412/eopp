import React, { useState, useEffect, useCallback, useMemo } from "react";

function adminHeaders(token) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

function adminHeadersJson(token) {
  return { "X-Admin-Token": token };
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
      const res = await fetch(
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
      const res = await fetch(
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
      const res = await fetch("/admin/captchas", {
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
      const res = await fetch("/admin/captcha-files", {
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
      const res = await fetch("/admin/captcha-files/sync", {
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

  const handleCreateCourse = async () => {
    if (selectedFileIds.size === 0 || !courseName.trim()) return;
    setCourseCreating(true);
    try {
      const res = await fetch("/admin/courses", {
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
      const res = await fetch("/admin/captchas/send-selected", {
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
      const res = await fetch(`/admin/captcha-label/${encodeURIComponent(captchaId)}`, {
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
      const res = await fetch("/admin/captcha-label/save", {
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
    const cls = isPassed ? "bg-success" : "bg-danger";
    const label = isPassed ? "Решена" : "Не пройдена";
    return <span className={`badge ${cls}`}>{label}</span>;
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

  const renderPagination = (page, totalPages, setPage, totalItems, shownItems) => {
    const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = Math.min(totalItems, start + shownItems - 1);
    return (
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap my-2">
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            &lt;
          </button>
          <span className="small text-muted">{page} / {totalPages}</span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            &gt;
          </button>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="small text-muted">{start}-{end} / {totalItems}</span>
          <select
            className="form-select form-select-sm"
            style={{ width: 86 }}
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  if (subtab === "operations" && loading) {
    return <div className="text-center text-muted py-3">Загрузка…</div>;
  }

  if (subtab === "files" && filesLoading) {
    return <div className="text-center text-muted py-3">Загрузка…</div>;
  }

  return (
    <div>
      <div className="btn-group btn-group-sm mb-3" role="group" aria-label="Раздел капч">
        <button
          className={`btn ${subtab === "operations" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setSubtab("operations")}
        >
          По операциям
        </button>
        <button
          className={`btn ${subtab === "files" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setSubtab("files")}
        >
          Все капчи
        </button>
      </div>

      <div className="d-flex gap-2 mb-2 align-items-center flex-wrap">
        <div className="btn-group btn-group-sm" role="group" aria-label="Фильтр капч">
          {[
            { id: "all", label: "Все" },
            { id: "passed", label: "Решенные" },
            { id: "failed", label: "Не прошедшие" },
          ].map((item) => (
            <button
              key={item.id}
              className={`btn ${preset === item.id ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setPreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={subtab === "files" ? fetchCaptchaFiles : fetchCaptchas}
        >
          Обновить
        </button>
        {subtab === "files" && (
          <button
            className="btn btn-sm btn-outline-success"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? "Синхронизация…" : "Синхронизировать"}
          </button>
        )}
        {syncResult && subtab === "files" && (
          <span className="badge bg-success" style={{ fontSize: "0.75rem" }}>
            +{syncResult.new} новых, ↻{syncResult.updated} обновлено
            {syncResult.action_date_set > 0 && `, 📅${syncResult.action_date_set} дат`}
            {syncResult.icon_coords_backfilled > 0 && `, 🖱${syncResult.icon_coords_backfilled} иконок`}
            {syncResult.errors > 0 && `, ⚠${syncResult.errors} ошибок`}
          </span>
        )}
        {subtab === "operations" && (
          <button
            className="btn btn-sm btn-primary"
            onClick={handleSendSelected}
            disabled={selected.size === 0 || sending}
          >
            {sending
              ? "Отправка…"
              : `Отправить выбранные (${selected.size})`}
          </button>
        )}
        <span className="text-muted small ms-auto">
          {subtab === "files"
            ? `Показано: ${filteredCaptchaFiles.length} из ${captchaFiles.length}`
            : `Показано: ${filteredCaptchas.length} из ${captchas.length}`}
        </span>
      </div>

      <div className="row g-2 align-items-end mb-3">
        <div className="col-12 col-xl-4">
          <label className="form-label small mb-1">Поиск</label>
          <input
            className="form-control form-control-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Captcha ID, hash, причина, usage log, пользователь"
          />
        </div>
        <div className="col-6 col-md-4 col-xl-3">
          <label className="form-label small mb-1">Пользователь</label>
          <select className="form-select form-select-sm" value={keyFilter} onChange={(event) => setKeyFilter(event.target.value)}>
            <option value="all">Все</option>
            {keyOptions.map((key) => <option key={key.id} value={key.id}>{key.label}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <label className="form-label small mb-1">Ответ</label>
          <select className="form-select form-select-sm" value={answerFilter} onChange={(event) => setAnswerFilter(event.target.value)}>
            <option value="all">Все</option>
            <option value="known">Есть ответ</option>
            <option value="missing">Без ответа</option>
          </select>
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <label className="form-label small mb-1">Класс</label>
          <select className="form-select form-select-sm" value={classificationFilter} onChange={(event) => setClassificationFilter(event.target.value)}>
            <option value="all">Все</option>
            <option value="digit">Цифры</option>
            <option value="figures">Фигуры</option>
            <option value="puzzle">Пазл</option>
            <option value="icon_click">Иконки</option>
            <option value="unset">Без класса</option>
          </select>
        </div>
        <div className="col-12 col-md-4 col-xl-3">
          <div className="form-check mb-1">
            <input
              className="form-check-input"
              type="checkbox"
              id="duplicateCaptchas"
              checked={duplicatesOnly}
              onChange={(event) => setDuplicatesOnly(event.target.checked)}
            />
            <label className="form-check-label" htmlFor="duplicateCaptchas">
              Только повторные пазлы
            </label>
          </div>
        </div>
      </div>

      {subtab === "files" ? (
        <div className="table-responsive mb-3">
          <table className="table table-sm table-bordered align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: "120px" }}>{"Метрика"}</th>
                <th className="text-center" style={{ width: "88px" }}>{"Значение"}</th>
                <th>{"Деталь"}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{"Всего"}</td>
                <td className="text-center fw-semibold">{fileMetrics.total}</td>
                <td className="text-muted small">{"Файлы капч по текущим фильтрам"}</td>
              </tr>
              <tr>
                <td>{"С ответом"}</td>
                <td className="text-center fw-semibold">{fileMetrics.answerKnown}</td>
                <td className="text-muted small">{"Есть valid_index"}</td>
              </tr>
              <tr>
                <td>{"С rank"}</td>
                <td className="text-center fw-semibold">{fileMetrics.rankedCount}</td>
                <td className="text-muted small">{"Из них без rank"}: {fileMetrics.unrankedKnown}</td>
              </tr>
              <tr>
                <td>{"Потенциал"}</td>
                <td className="text-center fw-semibold text-success">{fileMetrics.top1RankZeroPercent}%</td>
                <td className="text-muted small">{"Правильный ответ на rank 0"}: {fileMetrics.top1RankZero}</td>
              </tr>
              <tr>
                <td>{"Удаленность"}</td>
                <td className="text-center fw-semibold">{fileMetrics.avgSolverDistance}</td>
                <td className="text-muted small">{"Средняя; медиана"}: {fileMetrics.medianSolverDistance}</td>
              </tr>
              <tr>
                <td>{"Повторы"}</td>
                <td className="text-center fw-semibold">{fileMetrics.duplicatePuzzles}</td>
                <td className="text-muted small">{"Пазлы с одинаковым tiles_hash"}</td>
              </tr>
            </tbody>
          </table>
          <table className="table table-sm table-bordered align-middle mt-2 mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: "120px" }}>Rank</th>
                <th className="text-center" style={{ width: "88px" }}>{"Капч"}</th>
                <th className="text-center" style={{ width: "88px" }}>%</th>
                <th>{"Смысл"}</th>
              </tr>
            </thead>
            <tbody>
              {fileMetrics.buckets.map((bucket) => (
                <tr key={bucket.id}>
                  <td className="fw-semibold">{bucket.label}</td>
                  <td className="text-center">{bucket.count}</td>
                  <td className="text-center">{bucket.percent}</td>
                  <td className="text-muted small">{bucket.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="d-flex flex-wrap gap-2 mb-3">
          <span className="badge text-bg-secondary">Всего: {metrics.total}</span>
          <span className="badge text-bg-success">Решено: {metrics.passed}</span>
          <span className="badge text-bg-danger">Не прошли: {metrics.failed}</span>
          <span className="badge text-bg-primary">С ответом: {metrics.answerKnown}</span>
          <span className="badge text-bg-warning">Повторы: {metrics.duplicatePuzzles}</span>
        </div>
      )}
      {subtab === "operations" && (failureSummary.length > 0 || userSummary.length > 0) && (
        <div className="row g-3 mb-3">
          {failureSummary.length > 0 && (
            <div className="col-12 col-xl-7">
              <div className="card h-100">
                <div className="card-header fw-semibold">Причины непройденных капч</div>
                <div className="card-body p-0">
                  <table className="table table-sm table-bordered mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Причина</th>
                        <th className="text-center" style={{ width: "72px" }}>Кол-во</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failureSummary.map((row) => (
                        <tr key={row.reason}>
                          <td className="small" title={row.reason}>{row.reason}</td>
                          <td className="text-center fw-semibold">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {userSummary.length > 0 && (
            <div className="col-12 col-xl-5">
              <div className="card h-100">
                <div className="card-header fw-semibold">Капчи по пользователям</div>
                <div className="card-body p-0">
                  <table className="table table-sm table-bordered mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Пользователь</th>
                        <th className="text-center">Всего</th>
                        <th className="text-center">Ошибки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userSummary.map((row) => (
                        <tr key={row.label}>
                          <td className="small">{row.label}</td>
                          <td className="text-center">{row.total}</td>
                          <td className="text-center">{row.failed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
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
              <button
                className="btn btn-sm btn-success"
                onClick={() => setShowCourseModal(true)}
              >
                📚 Создать курс
              </button>
            </div>
          )}
          <div className="table-responsive">
            <table className="table table-sm table-hover table-bordered align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: "30px" }}>
                    <input
                      type="checkbox"
                      checked={pagedCaptchaFiles.length > 0 && pagedCaptchaFiles.every((f) => selectedFileIds.has(f.id))}
                      onChange={toggleFileSelectAll}
                    />
                  </th>
                  <th style={{ width: "50px" }}>ID</th>
                  <th>Captcha ID</th>
                   <th style={{ width: "110px" }}>Тип</th>
                   <th style={{ width: "90px" }}>Класс</th>
                   <th style={{ width: "110px" }}>{"Действия"}</th>
                  <th style={{ width: "90px" }}>Rank</th>
                  <th style={{ width: "110px" }}>Вариант</th>

                  <th style={{ width: "100px" }}>{"Разм."}</th>
                  <th style={{ width: "120px" }}>Tiles Hash</th>
                  <th style={{ width: "130px" }}>Usage Log IDs</th>
                  <th style={{ width: "110px" }}>Размер</th>
                  <th style={{ width: "90px" }}>Превью</th>
                  <th style={{ width: "110px" }}>{"Статус"}</th>
                  <th style={{ width: "160px" }}>Дата файла</th>
                </tr>
              </thead>
              <tbody>
                {pagedCaptchaFiles.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedFileIds.has(c.id)}
                        onChange={() => toggleFileSelect(c.id)}
                      />
                    </td>
                    <td>{c.id}</td>
                    <td className="font-monospace small">{c.captcha_id}</td>
                    <td className="small">{c.captcha_type || "unknown"}</td>
                    <td>
                      <select
                        className="form-select form-select-sm"
                        style={{ width: 80, padding: "2px 4px", fontSize: "0.75rem" }}
                        value={c.classification || ""}
                        onChange={(e) => setFileClassification(c.captcha_id, e.target.value || null)}
                      >
                        <option value="">—</option>
                        <option value="digit">Цифры</option>
                        <option value="figures">Фигуры</option>
                        <option value="puzzle">Пазл</option>
                        <option value="icon_click">Иконки</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => openLabelingPopup(c.captcha_id)}
                      >
                        {"Разметка"}
                      </button>
                    </td>
                    <td>{solverRankBadge(c.solver_valid_rank)}</td>
                    <td>
                      {c.valid_index != null
                        ? c.valid_index
                        : c.no_valid_index != null
                          ? <span className="text-danger fw-semibold">{c.no_valid_index}</span>
                          : "—"}
                    </td>

                    <td className="text-center" style={{ fontSize: "0.7rem" }}>
                      {c.has_coordinates && c.has_boxes ? (
                        <span className="badge bg-success">точки+боксы</span>
                      ) : c.has_coordinates ? (
                        <span className="badge bg-danger">точки</span>
                      ) : c.has_boxes ? (
                        <span className="badge bg-primary">боксы</span>
                      ) : c.manual_labeled ? (
                        <span className="badge bg-warning text-dark">пазл</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="font-monospace small">{c.tiles_hash || "—"}</td>
                    <td className="font-monospace small">{captchaToUsageLogs.get(c.captcha_id)?.join(", ") || "—"}</td>
                    <td>{c.file_size ? `${Math.round(c.file_size / 1024)} KB` : "—"}</td>
                    <td>
                      {c.valid_index != null || c.solver_valid_rank == null ? (
                        <img
                          src={`/admin/captcha-files/${c.captcha_id}/thumbnail?admin_token=${adminToken}${c.valid_index == null ? "&mode=solver_top1" : ""}`}
                          alt={c.valid_index == null ? "solver top1" : "variant"}
                          style={{ width: 80, height: 60, objectFit: "contain", cursor: "pointer" }}
                          loading="lazy"
                          onError={(e) => { e.target.style.display = "none" }}
                          onClick={() => {
                            setPreviewCaptchaId(c.captcha_id);
                            setPreviewMode(c.valid_index == null ? "solver_top1" : null);
                          }}
                        />
                      ) : "—"}
                    </td>
                    <td>
                      <span className={`badge ${c.file_status === "labeled" ? "bg-success" : "bg-danger"}`}>
                        {c.file_status === "labeled" ? "Решена" : "Не решена"}
                      </span>
                    </td>
                    <td className="small">{formatDate(c.file_mtime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPagination(currentFilesPage, filesPageCount, setFilesPage, filteredCaptchaFiles.length, pagedCaptchaFiles.length)}
          </>
        )
      ) : filteredCaptchas.length === 0 ? (
        <div className="text-center text-muted py-3">Нет капч</div>
      ) : (
        <>
        {renderPagination(currentOperationsPage, operationsPageCount, setOperationsPage, filteredCaptchas.length, pagedCaptchas.length)}
        <div className="table-responsive">
          <table className="table table-sm table-hover table-bordered align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: "40px" }}>
                  <input
                    type="checkbox"
                    checked={
                      pagedCaptchas.length > 0 &&
                      pagedCaptchas.every((captcha) => selected.has(captcha.id))
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                <th style={{ width: "50px" }}>ID</th>
                <th>Captcha ID</th>
                <th style={{ width: "100px" }}>Решена</th>
                <th style={{ width: "120px" }}>Причина отказа</th>
                <th style={{ width: "100px" }}>Tiles Hash</th>
                <th style={{ width: "90px" }}>{"Разметка"}</th>
                <th style={{ width: "70px" }}>Rank</th>
                <th style={{ width: "80px" }}>{"Вариант"}</th>
                <th style={{ width: "120px" }}>Пользователь</th>
                  <th style={{ width: "100px" }}>Usage Log</th>
                <th style={{ width: "160px" }}>Дата</th>
                <th style={{ width: "80px" }}>Время</th>
                  <th style={{ width: "90px" }}>Превью</th>
                </tr>
            </thead>
            <tbody>
              {pagedCaptchas.map((c) => {
                const file = captchaFileById.get(c.captcha_id);
                const variant = file?.valid_index ?? file?.no_valid_index ?? null;
                return (
                <tr key={c.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                    />
                  </td>
                  <td>{c.id}</td>
                  <td className="font-monospace small">{c.captcha_id}</td>
                  <td>{solvedBadge(c.correct_answer, c.status)}</td>
                  <td className="small text-danger">{c.fail_reason || "—"}</td>
                  <td className="font-monospace small">{c.tiles_hash || "—"}</td>
                  <td className="small">
                    {file
                      ? file.manual_labeled
                        ? <span className="text-warning fw-semibold">{"Ручная"}</span>
                        : <span className="text-muted">{"Исх."}</span>
                      : "-"}
                  </td>
                  <td>{file ? solverRankBadge(file.solver_valid_rank) : <span className="text-muted">-</span>}</td>
                  <td className="fw-semibold">{variant != null ? variant : "-"}</td>
                  <td className="small">{c.key_label || "—"}</td>
                  <td>{c.usage_log_id}</td>
                  <td className="small">{formatDate(c.created_at)}</td>
                  <td className="small">{formatDuration(c.duration_ms)}</td>
                  <td>
                    {fileValidIndex.has(c.captcha_id) ? (
                      <img
                        src={`/admin/captcha-files/${c.captcha_id}/thumbnail?admin_token=${adminToken}`}
                        alt="variant"
                        style={{ width: 80, height: 60, objectFit: "contain", cursor: "pointer" }}
                        loading="lazy"
                        onError={(e) => { e.target.style.display = "none" }}
                        onClick={() => {
                          setPreviewCaptchaId(c.captcha_id);
                          setPreviewMode(null);
                        }}
                      />
                    ) : "—"}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
            src={`/admin/captcha-files/${previewCaptchaId}/thumbnail?admin_token=${adminToken}${previewMode ? `&mode=${previewMode}` : ""}`}
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
              <button
                type="button"
                className="btn-close ms-auto"
                onClick={() => setLabelingCaptcha(null)}
                disabled={labelSaving}
                aria-label="Close"
              />
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
                    <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xl-5 g-2">
                      {labelVariantIndexes.map((index) => (
                        <div className="col" key={index}>
                          <button
                            type="button"
                            className={`card w-100 text-start ${labelSelectedIndex === index ? "border-primary border-2" : ""}`}
                            style={{ cursor: "pointer" }}
                            onClick={() => setLabelSelectedIndex(index)}
                          >
                            <img
                              src={`data:image/png;base64,${labelingCaptcha.images[String(index)]}`}
                              alt={`Вариант ${index}`}
                              style={{ width: "100%", objectFit: "contain", maxHeight: 160 }}
                            />
                            <div className="card-body py-2 px-3">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <span className="fw-semibold">{"Вариант"} {index}</span>
                                {labelSelectedIndex === index && (
                                  <span className="badge bg-primary">{"Выбран"}</span>
                                )}
                              </div>
                              <div className="d-flex flex-wrap gap-1">
                                {labelingCaptcha.valid_index === index && (
                                  <span className="badge bg-success">{"Был выдан"}</span>
                                )}
                                {labelingCaptcha.no_valid_index === index && (
                                  <span className="badge bg-danger">{"Не выбран"}</span>
                                )}
                                {solverResultByVariant.get(index)?.rank === 1 && (
                                  <span className="badge bg-info text-dark">{"Прогноз"}</span>
                                )}
                                {solverTop3.has(index) && solverResultByVariant.get(index)?.rank !== 1 && (
                                  <span className="badge bg-info text-dark">Top 3</span>
                                )}
                                {recomputeResult?.best_variant === index && (
                                  <span className="badge bg-success">New Top1</span>
                                )}
                                {solverResultByVariant.get(index) && (
                                  <span className="badge bg-light text-dark border">
                                    #{solverResultByVariant.get(index).rank} score {solverResultByVariant.get(index).score}
                                  </span>
                                )}
                                {solverResultByVariant.get(index) && (
                                  <span className="badge bg-secondary">{"Расчеты"}</span>
                                )}
                              </div>
                              {solverResultByVariant.get(index) && (
                                <div className="small text-muted mt-1">
                                  d {solverResultByVariant.get(index).discontinuity} · ssim {solverResultByVariant.get(index).ssim} · coh {solverResultByVariant.get(index).coherence} · sobel {solverResultByVariant.get(index).sobel}
                                </div>
                              )}
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="d-flex gap-2 mt-3 align-items-center">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-info"
                      onClick={handleRecompute}
                      disabled={recomputeLoading}
                    >
                      {recomputeLoading ? "Считаю..." : "Пересчитать"}
                    </button>
                    {recomputeResult && (
                      <span className="small">
                        <span className="badge bg-info text-dark me-1">{recomputeResult.classification}</span>
                        <span className="text-muted">{recomputeResult.solver}</span>
                        <span className="ms-1">Top1: <b>{recomputeResult.best_variant}</b></span>
                      </span>
                    )}
                    <div className="ms-auto d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => setLabelingCaptcha(null)}
                        disabled={labelSaving}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={saveLabelingChoice}
                        disabled={labelSaving || labelSelectedIndex == null}
                      >
                        {labelSaving ? "Сохранение..." : "Сохранить как верный"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Course creation modal */}
      {showCourseModal && (
        <div className="modal d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Создать курс</h5>
                <button type="button" className="btn-close" onClick={() => setShowCourseModal(false)} />
              </div>
              <div className="modal-body">
                <p className="text-muted" style={{ fontSize: "0.85rem" }}>
                  Выбрано капч: <strong>{selectedFileIds.size}</strong>
                </p>
                <div className="mb-3">
                  <label className="form-label">Название курса</label>
                  <input
                    type="text"
                    className="form-control"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="Например: Базовый курс для новичков"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Описание (опционально)</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={courseDescription}
                    onChange={(e) => setCourseDescription(e.target.value)}
                    placeholder="Инструкции или заметки к курсу"
                  />
                </div>
                <div className="mb-3 form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="coursePauseBetween"
                    checked={coursePauseBetween}
                    onChange={(e) => setCoursePauseBetween(e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="coursePauseBetween" style={{ fontSize: "0.85rem" }}>
                    Режим экзамена — паузы 2–7 сек между капчами
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCourseModal(false)}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleCreateCourse}
                  disabled={courseCreating || !courseName.trim()}
                >
                  {courseCreating ? "Создание..." : "Создать курс"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
      const res = await fetch(`/admin/captcha-label/${encodeURIComponent(labelingCaptcha.captcha_id)}/save-coordinates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Token": adminToken },
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
      const res = await fetch(`/admin/captcha-label/${encodeURIComponent(labelingCaptcha.captcha_id)}/save-boxes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Token": adminToken },
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {/* Mode toggle */}
      <div className="btn-group btn-group-sm">
        <button
          className={`btn ${mode === "points" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setMode("points")}
        >Точки</button>
        <button
          className={`btn ${mode === "boxes" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setMode("boxes")}
        >Боксы</button>
      </div>

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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Кликов: {pointsCount}/5 — кликайте по иконкам в порядке 1→5
          </span>
          <button className="btn btn-sm btn-outline-secondary" onClick={resetPoints} style={{ fontSize: "0.7rem" }}>
            Сбросить
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={handleSavePoints}
            disabled={saving || pointsCount < 5}
          >
            {saving ? "Сохранение..." : "Сохранить точки"}
          </button>
        </div>
      )}

      {/* Box position selector */}
      {mode === "boxes" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {[0, 1, 2, 3, 4].map(pos => (
            <button
              key={pos}
              className={`btn btn-sm ${activePos === pos ? "btn-primary" : "btn-outline-secondary"}`}
              style={{ minWidth: 36, fontSize: "0.8rem" }}
              onClick={() => setActivePos(pos)}
            >
              {pos + 1}
            </button>
          ))}
          <button
            className="btn btn-sm btn-outline-danger"
            style={{ fontSize: "0.7rem" }}
            onClick={() => clearBox(activePos)}
          >✕</button>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Выделите область для иконки #{activePos + 1}
          </span>
        </div>
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
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSaveBoxes}
          disabled={saving}
        >
          {saving ? "Сохранение..." : "Сохранить боксы"}
        </button>
      )}
    </div>
  );
}
