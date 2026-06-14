import React from "react";
import { Pagination } from "antd";
import { HistoryTable as SharedHistoryTable } from "../../captcha/history/HistoryRow";
import { Button, Toolbar } from "../../../ui";

export function UsageHistory({
  keyId,
  historyData,
  isLoading,
  isEmpty,
  isError,
  hideTest,
  onToggleHideTest,
  onRefresh,
  onDelete,
  onEdit,
  expandedLogs,
  expandedConfig,
  onToggleLogs,
  onToggleConfig,
  adminToken,
  editingPriceId,
  setEditingPriceId,
  onPriceChange,
  onTogglePaid,
}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  React.useEffect(() => {
    setPage(1);
  }, [historyData, keyId]);

  if (isLoading) return <div className="table__loading">Загрузка…</div>;
  if (isError) return <div className="table__empty">Ошибка загрузки</div>;
  if (isEmpty) return <div className="table__empty">Нет записей</div>;

  const safeHistoryData = Array.isArray(historyData) ? historyData : [];
  const pageStart = (page - 1) * pageSize;
  const pageRecords = safeHistoryData.slice(pageStart, pageStart + pageSize);

  return (
    <>
      <Toolbar
        className="api-key-history-toolbar mb-3"
        left={
          <>
        <Button
          size="small"
          variant={hideTest ? "primary" : "secondary"}
          onClick={onToggleHideTest}
        >
          {hideTest ? "Скрыть тестовые" : "Показать тестовые"}
        </Button>
        <Button size="small" onClick={onRefresh}>
          Обновить
        </Button>
          </>
        }
        right={
          <span className="small text-muted">
            Показано {pageRecords.length} из {safeHistoryData.length}
          </span>
        }
      />
      <SharedHistoryTable
        records={pageRecords}
        preset="admin"
        expandedLogs={expandedLogs}
        expandedConfig={expandedConfig}
        onToggleLogs={onToggleLogs}
        onToggleConfig={onToggleConfig}
        onEdit={onEdit}
        onDelete={onDelete}
        editingPriceId={editingPriceId}
        setEditingPriceId={setEditingPriceId}
        onPriceChange={onPriceChange}
        onTogglePaid={onTogglePaid}
        columns={["id", "type", "time", "status", "slot", "fio", "test", "price", "paid", "error", "actions"]}
      />
      {safeHistoryData.length > pageSize && (
        <Pagination
          data-eopp-component="AdminUsageHistoryPagination"
          className="api-key-history-pagination"
          current={page}
          pageSize={pageSize}
          total={safeHistoryData.length}
          showSizeChanger
          pageSizeOptions={[10, 25, 50, 100]}
          showTotal={(total, range) => `${range[0]}-${range[1]} из ${total}`}
          locale={{ items_per_page: "" }}
          size="small"
          onChange={(nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          }}
        />
      )}
    </>
  );
}
