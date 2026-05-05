import React, { useState, useEffect, useCallback } from "react";
import { HistoryTable } from "./history/HistoryTable";
import { EditModal } from "./history/EditModal";

function UsageHistory({ apiKey, adminToken }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedLogs, setExpandedLogs] = useState({});
  const [expandedConfig, setExpandedConfig] = useState({});
  const [expandedErrors, setExpandedErrors] = useState({});
  const [selectedLogs, setSelectedLogs] = useState({});
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ price: "", paid: false });

  const toggleLogs = (id) => {
    setExpandedLogs((p) => ({ ...p, [id]: !p[id] }));
  };

  const toggleConfig = (id) => {
    setExpandedConfig((p) => ({ ...p, [id]: !p[id] }));
  };

  const toggleError = (id) => {
    setExpandedErrors((p) => ({ ...p, [id]: !p[id] }));
  };

  const toggleSelection = (id) => {
    if (id === "selectall") {
      setSelectedLogs(Object.fromEntries(records.map((r) => [r.id, true])));
    } else if (id === "deselectall") {
      setSelectedLogs({});
    } else {
      setSelectedLogs((p) => ({ ...p, [id]: !p[id] }));
    }
  };

  const openEditLog = (log) => {
    setEditForm({
      price: log.price != null ? String(log.price) : "",
      paid: log.paid || false,
    });
    setEditModal(log);
  };

  const handleEditLog = async (e) => {
    e.preventDefault();
    if (!editModal || !adminToken) return;
    try {
      const body = {};
      if (editForm.price !== "") {
        body.price = parseInt(editForm.price, 10);
      }
      body.paid = editForm.paid;
      const res = await fetch(`/admin/usage-log/${editModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Admin-Token": adminToken },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditModal(null);
      fetchLogs();
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    }
  };

  const fetchLogs = useCallback(async () => {
    if (!apiKey) {
      setError("API-ключ не установлен");
      setLoading(false);
      return;
    }
    try {
      const resp = await fetch(
        `/usage-log?api_key=${encodeURIComponent(apiKey)}`,
      );
      if (!resp.ok) {
        if (resp.status === 403) {
          setError("Неверный API-ключ");
        } else {
          setError("Не удалось загрузить историю");
        }
        return;
      }
      const data = await resp.json();
      setRecords(data);
      setError("");
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  if (loading) {
    return <div className="admin-history-loading">Загрузка истории...</div>;
  }
  if (error) {
    return <div className="admin-history-error">{error}</div>;
  }

  return (
    <div>
      <HistoryTable
        records={records}
        selectedLogs={selectedLogs}
        expandedLogs={expandedLogs}
        expandedConfig={expandedConfig}
        expandedErrors={expandedErrors}
        onToggleSelection={toggleSelection}
        onToggleLogs={toggleLogs}
        onToggleConfig={toggleConfig}
        onToggleError={toggleError}
        onOpenEdit={openEditLog}
      />
      <EditModal
        show={!!editModal}
        form={editForm}
        setForm={setEditForm}
        onSubmit={handleEditLog}
        onClose={() => setEditModal(null)}
      />
    </div>
  );
}

export default UsageHistory;