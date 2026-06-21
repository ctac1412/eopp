import { publicCaptchasService } from "./api/publicCaptchasService";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Checkbox } from "antd";
import { Button, DataTable, StatusTag, Toolbar } from "../../../ui";

const statusLabel = {
  passed: "Пройдена",
  failed: "Ошибка",
};

function getStatusTagStatus(status) {
  if (status === "passed") return "confirmed";
  if (status === "failed") return "failed";
  return "neutral";
}

export function PublicCaptchasTab({ onReplaySent }) {
  const [captchas, setCaptchas] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const fetchCaptchas = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await publicCaptchasService.list();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCaptchas(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
      setCaptchas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCaptchas();
  }, [fetchCaptchas]);

  const selectedCaptchas = useMemo(
    () => Array.from(selected),
    [selected],
  );

  const toggleSelect = (captchaId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(captchaId)) next.delete(captchaId);
      else next.add(captchaId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const visibleIds = captchas.map((captcha) => captcha.captcha_id);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(visibleIds);
    });
  };

  const sendSelected = async () => {
    if (selectedCaptchas.length === 0) return;
    setSending(true);
    setError("");
    try {
      const autoSolveRucaptcha = (() => {
        try {
          return localStorage.getItem("auto_solve_rucaptcha") === "1";
        } catch {
          return false;
        }
      })();
      const res = await publicCaptchasService.sendSelected({
        captcha_ids: selectedCaptchas,
        auto_solve_rucaptcha: autoSolveRucaptcha,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSelected(new Set());
      onReplaySent?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const allSelected =
    captchas.length > 0 && captchas.every((captcha) => selected.has(captcha.captcha_id));

  const columns = [
    {
      title: (
        <Checkbox
          data-eopp-component="PublicCaptchasSelectAll"
          checked={allSelected}
          onChange={toggleAll}
          disabled={captchas.length === 0}
        />
      ),
      width: 36,
      align: "center",
      render: (_, captcha) => (
        <Checkbox
          data-eopp-component="PublicCaptchasSelectRow"
          checked={selected.has(captcha.captcha_id)}
          onChange={() => toggleSelect(captcha.captcha_id)}
        />
      ),
    },
    {
      title: "ID капчи",
      dataIndex: "captcha_id",
      ellipsis: true,
      render: (value) => (
        <span className="public-captchas__id" title={value}>
          {value}
        </span>
      ),
    },
    {
      title: "Статус",
      dataIndex: "status",
      width: 72,
      align: "center",
      render: (status) => (
        <StatusTag
          status={getStatusTagStatus(status)}
          label={status === "passed" ? "OK" : status === "failed" ? "ERR" : status}
        />
      ),
    },
  ];

  return (
    <div data-eopp-component="PublicCaptchasTab" className="public-captchas">
      <Toolbar
        className="public-captchas__toolbar"
        left={
          <>
            <Button size="small" onClick={fetchCaptchas} disabled={loading}>
              Обновить
            </Button>
            <Button
              size="small"
              variant="primary"
              onClick={sendSelected}
              disabled={sending || selectedCaptchas.length === 0}
              loading={sending}
            >
              Повторить выбранные
            </Button>
          </>
        }
        right={
          <span className="text-muted small">Выбрано: {selectedCaptchas.length}</span>
        }
      />

      {error && (
        <Alert
          data-eopp-component="PublicCaptchasError"
          className="public-captchas__error"
          type="error"
          showIcon
          message={error}
        />
      )}

      <DataTable
        data-eopp-component="PublicCaptchasTable"
        className="public-captchas__table"
        rowKey={(captcha, index) => `${captcha.captcha_id}-${index}`}
        data={captchas}
        columns={columns}
        loading={loading}
        emptyText="Нет капч"
        pagination
        scroll={false}
        tableLayout="fixed"
      />
    </div>
  );
}
