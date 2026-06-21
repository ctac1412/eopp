import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, DatePicker, Segmented, Space } from "antd";

import { listCompanies, listFinanceParticipants } from "./financeApi.js";
import { FinanceAnalyticsView } from "./FinanceAnalyticsView.jsx";
import { FinanceEntriesView } from "./FinanceEntriesView.jsx";
import { FinanceReportView } from "./FinanceReportView.jsx";
import { ProfitLotsView } from "./ProfitLotsView.jsx";

const { RangePicker } = DatePicker;

const VIEW_OPTIONS = [
  { label: "Проводки", value: "ledger" },
  { label: "Аналитика", value: "analytics" },
  { label: "Лоты прибыли", value: "lots" },
  { label: "Сводка", value: "report" },
];

export function FinanceTab({ adminToken, onError }) {
  const [activeView, setActiveView] = useState("ledger");
  const [refreshKey, setRefreshKey] = useState(0);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [dateRange, setDateRange] = useState(null);
  const [ledgerFilters, setLedgerFilters] = useState({});

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!adminToken) {
      return;
    }
    let cancelled = false;
    setReferenceLoading(true);
    Promise.all([listCompanies(adminToken), listFinanceParticipants(adminToken)])
      .then(([nextCompanies, nextParticipants]) => {
        if (cancelled) {
          return;
        }
        setCompanies(Array.isArray(nextCompanies) ? nextCompanies : []);
        setParticipants(Array.isArray(nextParticipants) ? nextParticipants : []);
        setReferenceError("");
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        const message = err?.message || "Не удалось загрузить справочники финансов";
        setReferenceError(message);
        onError?.(message);
      })
      .finally(() => {
        if (!cancelled) {
          setReferenceLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [adminToken, onError]);

  const sharedProps = useMemo(
    () => ({
      adminToken,
      companies,
      participants,
      dateRange,
      refreshKey,
      onError,
      onRefresh: refresh,
      onViewChange: setActiveView,
    }),
    [adminToken, companies, participants, dateRange, onError, refresh, refreshKey],
  );

  return (
    <div className="admin-panel finance-admin">
      <div className="admin-section admin-section--compact">
        <div className="admin-toolbar">
          <Space size="small" wrap>
            <Segmented options={VIEW_OPTIONS} value={activeView} onChange={setActiveView} />
            <Button loading={referenceLoading} onClick={refresh}>Обновить</Button>
          </Space>
          <RangePicker value={dateRange} onChange={setDateRange} allowEmpty={[true, true]} />
        </div>
        {referenceError && <Alert type="error" showIcon message={referenceError} />}
      </div>

      {activeView === "ledger" && (
        <FinanceEntriesView
          {...sharedProps}
          initialFilters={ledgerFilters}
          onFiltersChange={setLedgerFilters}
        />
      )}
      {activeView === "analytics" && (
        <FinanceAnalyticsView
          {...sharedProps}
        />
      )}
      {activeView === "lots" && (
        <ProfitLotsView
          {...sharedProps}
          onLedgerFilters={setLedgerFilters}
        />
      )}
      {activeView === "report" && (
        <FinanceReportView
          {...sharedProps}
          onLedgerFilters={setLedgerFilters}
          onLotsView={() => setActiveView("lots")}
        />
      )}
    </div>
  );
}
