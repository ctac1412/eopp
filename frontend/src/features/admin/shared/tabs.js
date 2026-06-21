import React from "react";

function lazyAdminTab(exportName) {
  const LazyComponent = React.lazy(async () => {
    const module = await import("../AdminTabContainers.jsx");
    return { default: module[exportName] };
  });
  return function AdminTabRouteComponent(props) {
    return React.createElement(
      React.Suspense,
      { fallback: null },
      React.createElement(LazyComponent, props),
    );
  };
}

export const OperationsTabContainer = lazyAdminTab("OperationsTabContainer");
export const MetricsTabContainer = lazyAdminTab("MetricsTabContainer");
export const ReportsTabContainer = lazyAdminTab("ReportsTabContainer");
export const CompaniesTabContainer = lazyAdminTab("CompaniesTabContainer");
export const OperatorsTabContainer = lazyAdminTab("OperatorsTabContainer");
export const CaptchasTabContainer = lazyAdminTab("CaptchasTabContainer");
export const InvoicesTabContainer = lazyAdminTab("InvoicesTabContainer");
export const ExpensesTabContainer = lazyAdminTab("ExpensesTabContainer");
export const FinanceTabContainer = lazyAdminTab("FinanceTabContainer");
export const PayoutsTabContainer = lazyAdminTab("PayoutsTabContainer");
export const UsersTabContainer = lazyAdminTab("UsersTabContainer");
export const TestBenchmarkTabContainer = lazyAdminTab("TestBenchmarkTabContainer");
export const TrainingAdminTabContainer = lazyAdminTab("TrainingAdminTabContainer");
export const StreamsTabContainer = lazyAdminTab("StreamsTabContainer");
export const BackendLogsTabContainer = lazyAdminTab("BackendLogsTabContainer");
export const PrepaidPackagesTabContainer = lazyAdminTab("PrepaidPackagesTabContainer");
export const AITabContainer = lazyAdminTab("AITabContainer");

export const ADMIN_TABS = [
  { id: "operations", path: "operations", label: "Оперативный дэшборд", shortLabel: "Оперативка", component: OperationsTabContainer },
  { id: "reports", path: "reports", label: "Журнал", component: ReportsTabContainer },
  { id: "companies", path: "companies", label: "Компании", component: CompaniesTabContainer },
  { id: "operators", path: "operators", label: "Операторы", component: OperatorsTabContainer },
  { id: "captchas", path: "captchas", label: "Капчи", component: CaptchasTabContainer },
  { id: "invoices", path: "invoices", label: "Счета", component: InvoicesTabContainer },
  { id: "expenses", path: "expenses", label: "Расходы", component: ExpensesTabContainer },
  { id: "finance", path: "finance", label: "Финансы", component: FinanceTabContainer },
  { id: "payouts", path: "payouts", label: "Выплаты", component: PayoutsTabContainer },
  { id: "users", path: "users", label: "Пользователи", component: UsersTabContainer },
  { id: "testbench", path: "testbench", label: "Тесты и бенчмарк", shortLabel: "Тесты", component: TestBenchmarkTabContainer },
  { id: "training", path: "training", label: "Обучение", component: TrainingAdminTabContainer },
  { id: "streams", path: "streams", label: "Стримы", component: StreamsTabContainer },
  { id: "metrics", path: "metrics", label: "Метрики", component: MetricsTabContainer },
  { id: "backend-logs", path: "backend-logs", label: "Техстатус", shortLabel: "Tech", component: BackendLogsTabContainer },
  { id: "prepaid", path: "prepaid", label: "Предоплата", shortLabel: "Аванс", component: PrepaidPackagesTabContainer },
  { id: "ai", path: "ai", label: "ИИ", component: AITabContainer },
];

export function adminTabPath(tab, search = "") {
  const suffix = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `/admin/${tab.path}${suffix}`;
}

export function resolveAdminTabRoute({ tabId, visibleTabs, search = "" }) {
  const fallback = visibleTabs[0] || ADMIN_TABS[0];
  const tab = ADMIN_TABS.find((item) => item.id === tabId || item.path === tabId);
  if (!tab || !visibleTabs.some((item) => item.id === tab.id)) {
    return { tab: fallback, redirectPath: adminTabPath(fallback, search) };
  }
  return { tab, redirectPath: null };
}
