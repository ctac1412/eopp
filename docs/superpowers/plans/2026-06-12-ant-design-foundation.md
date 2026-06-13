# Ant Design Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Ant Design based EOPP UI foundation with reusable controls, page patterns, a responsive mobile operator workbench pilot, and one migrated admin analytical table surface.

**Architecture:** Ant Design provides the primitive component system through `ConfigProvider`, dark compact theme tokens, and components such as Table, Form, Button, Tag, Drawer, Tabs, Statistic, and Layout. `frontend/src/ui` exposes EOPP semantic wrappers so feature pages use one consistent UI API instead of direct ad-hoc Bootstrap or raw Ant Design styling.

**Tech Stack:** React 18, Vite, Ant Design 5, existing Zustand stores and FastAPI-backed endpoints.

---

## File Map

- Modify: `frontend/package.json` and `frontend/package-lock.json` to add `antd`.
- Modify: `frontend/src/main.jsx` to wrap routes in `ConfigProvider` and import Ant Design reset styles.
- Create: `frontend/src/ui/theme/tokens.js` for EOPP tokens and density constants.
- Create: `frontend/src/ui/theme/antdTheme.js` for Ant Design dark compact theme.
- Create: `frontend/src/ui/styles/layout.css` for foundation layout utilities.
- Create: `frontend/src/ui/index.js` as the public UI API.
- Create: `frontend/src/ui/controls/*.jsx` for reusable controls.
- Create: `frontend/src/ui/components/*.jsx` for patterns such as DataTable, FilterBar, StatusTag, MetricsStrip.
- Create: `frontend/src/ui/layouts/*.jsx` for AppShell, Page, ListPage, WorkbenchPage, and supporting templates.
- Modify: `frontend/src/pages/OperatorPage.jsx` to use `WorkbenchPage` and remove hard-coded fixed desktop layout.
- Modify: `frontend/src/components/operator/*` only as needed to accept className/layout props without changing business logic.
- Modify: `frontend/src/components/admin/ReportsTab.jsx` to use `AnalyticalListView` style sections and `DataTable` for at least the main usage log table.
- Preserve: backend files and browser extension files.

---

### Task 1: Add Ant Design Theme Foundation

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/src/main.jsx`
- Create: `frontend/src/ui/theme/tokens.js`
- Create: `frontend/src/ui/theme/antdTheme.js`
- Create: `frontend/src/ui/styles/layout.css`
- Create: `frontend/src/ui/index.js`

- [ ] **Step 1: Install Ant Design**

Run:

```bash
cd frontend
npm install antd
```

Expected: `antd` is added to dependencies and package lock updates.

- [ ] **Step 2: Create theme tokens**

Add `frontend/src/ui/theme/tokens.js`:

```javascript
export const eoppTokens = {
  colorBgBase: "#0a0e14",
  colorBgContainer: "#131a24",
  colorBgElevated: "#1a2430",
  colorBorder: "#2a3340",
  colorBorderSecondary: "#303b4a",
  colorText: "#c9d1d9",
  colorTextHeading: "#e6edf3",
  colorTextSecondary: "#8b949e",
  colorPrimary: "#7c3aed",
  colorSuccess: "#10b981",
  colorWarning: "#f59e0b",
  colorError: "#ef4444",
  colorInfo: "#3b82f6",
  borderRadius: 8,
  controlHeight: 32,
  controlHeightSM: 28,
  controlHeightLG: 40,
  fontSize: 13,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export const eoppSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const eoppDensity = {
  compact: "small",
  standard: "middle",
  touchTarget: 44,
};
```

- [ ] **Step 3: Create Ant Design theme**

Add `frontend/src/ui/theme/antdTheme.js`:

```javascript
import { theme } from "antd";
import { eoppTokens } from "./tokens";

export const antdTheme = {
  algorithm: [theme.darkAlgorithm, theme.compactAlgorithm],
  token: {
    colorBgBase: eoppTokens.colorBgBase,
    colorBgContainer: eoppTokens.colorBgContainer,
    colorBgElevated: eoppTokens.colorBgElevated,
    colorBorder: eoppTokens.colorBorder,
    colorBorderSecondary: eoppTokens.colorBorderSecondary,
    colorText: eoppTokens.colorText,
    colorTextHeading: eoppTokens.colorTextHeading,
    colorTextSecondary: eoppTokens.colorTextSecondary,
    colorPrimary: eoppTokens.colorPrimary,
    colorSuccess: eoppTokens.colorSuccess,
    colorWarning: eoppTokens.colorWarning,
    colorError: eoppTokens.colorError,
    colorInfo: eoppTokens.colorInfo,
    borderRadius: eoppTokens.borderRadius,
    controlHeight: eoppTokens.controlHeight,
    controlHeightSM: eoppTokens.controlHeightSM,
    controlHeightLG: eoppTokens.controlHeightLG,
    fontSize: eoppTokens.fontSize,
    fontFamily: eoppTokens.fontFamily,
  },
  components: {
    Button: { borderRadius: 8, fontWeight: 500 },
    Card: { borderRadiusLG: 8 },
    Table: {
      headerBg: eoppTokens.colorBgElevated,
      rowHoverBg: "rgba(124, 58, 237, 0.06)",
      borderColor: eoppTokens.colorBorder,
    },
    Tag: { borderRadiusSM: 6 },
  },
};
```

- [ ] **Step 4: Add foundation layout stylesheet**

Create `frontend/src/ui/styles/layout.css` with stable layouts for page shells, analytical list sections, table actions, and mobile workbench breakpoints.

- [ ] **Step 5: Wire ConfigProvider**

Modify `frontend/src/main.jsx`:

```jsx
import "antd/dist/reset.css";
import { ConfigProvider } from "antd";
import { antdTheme } from "./ui/theme/antdTheme";
import "./ui/styles/layout.css";
```

Wrap the existing router:

```jsx
<ConfigProvider theme={antdTheme}>
  <BrowserRouter>
    <Routes>...</Routes>
  </BrowserRouter>
</ConfigProvider>
```

- [ ] **Step 6: Run build**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds.

---

### Task 2: Create Reusable Controls And Patterns

**Files:**
- Create: `frontend/src/ui/controls/Button.jsx`
- Create: `frontend/src/ui/controls/IconButton.jsx`
- Create: `frontend/src/ui/controls/TextInput.jsx`
- Create: `frontend/src/ui/controls/SelectInput.jsx`
- Create: `frontend/src/ui/controls/CheckboxField.jsx`
- Create: `frontend/src/ui/controls/SegmentedControl.jsx`
- Create: `frontend/src/ui/components/StatusTag.jsx`
- Create: `frontend/src/ui/components/EmptyState.jsx`
- Create: `frontend/src/ui/components/ConfirmAction.jsx`
- Create: `frontend/src/ui/components/Toolbar.jsx`
- Create: `frontend/src/ui/components/FilterBar.jsx`
- Create: `frontend/src/ui/components/DataTable.jsx`
- Create: `frontend/src/ui/components/MetricCard.jsx`
- Create: `frontend/src/ui/components/MetricsStrip.jsx`
- Create: `frontend/src/ui/components/ActionBar.jsx`
- Create: `frontend/src/ui/components/PageHeader.jsx`
- Create: `frontend/src/ui/components/DetailsDrawer.jsx`
- Create: `frontend/src/ui/components/FormSection.jsx`
- Create: `frontend/src/ui/charts/ChartCard.jsx`
- Create: `frontend/src/ui/charts/chartTheme.js`
- Modify: `frontend/src/ui/index.js`

- [ ] **Step 1: Implement controls as thin Ant Design wrappers**

Controls should forward props and enforce consistent defaults:

```jsx
export function Button({ variant = "secondary", size = "middle", ...props }) {
  const type = variant === "primary" ? "primary" : "default";
  const danger = variant === "danger";
  return <AntButton type={type} danger={danger} size={size} {...props} />;
}
```

- [ ] **Step 2: Implement StatusTag**

Use a centralized status map for business statuses:

```jsx
const STATUS_MAP = {
  confirmed: { color: "success", label: "Успех" },
  failed: { color: "error", label: "Ошибка" },
  pending: { color: "processing", label: "В работе" },
  paid: { color: "success", label: "Оплачено" },
  unpaid: { color: "error", label: "Не оплачено" },
  online: { color: "success", label: "Онлайн" },
  offline: { color: "default", label: "Офлайн" },
  warning: { color: "warning", label: "Внимание" },
  neutral: { color: "default", label: "Нет данных" },
};
```

- [ ] **Step 3: Implement DataTable**

Wrap Ant Design Table with loading, error, empty, density, sticky header, pagination, and right-side action column support.

- [ ] **Step 4: Implement FilterBar and Toolbar**

Use Ant Design Form/Flex/Space to stabilize filter and action layouts.

- [ ] **Step 5: Export all foundation components**

`frontend/src/ui/index.js` should export controls, components, charts, layouts, and theme.

- [ ] **Step 6: Run build**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds.

---

### Task 3: Create Page Templates

**Files:**
- Create: `frontend/src/ui/layouts/AppShell.jsx`
- Create: `frontend/src/ui/layouts/Page.jsx`
- Create: `frontend/src/ui/layouts/ListPage.jsx`
- Create: `frontend/src/ui/layouts/DetailPage.jsx`
- Create: `frontend/src/ui/layouts/DashboardPage.jsx`
- Create: `frontend/src/ui/layouts/WorkbenchPage.jsx`
- Create: `frontend/src/ui/layouts/SettingsPage.jsx`
- Create: `frontend/src/ui/layouts/SplitPage.jsx`
- Modify: `frontend/src/ui/index.js`

- [ ] **Step 1: Implement AppShell and Page**

Create stable page containers with header/content slots.

- [ ] **Step 2: Implement ListPage**

Allow optional metrics, analytics, filters, toolbar, children.

- [ ] **Step 3: Implement WorkbenchPage**

Support desktop side panels and mobile bottom actions/drawers through slots:

```jsx
<WorkbenchPage
  status={...}
  main={...}
  side={...}
  bottomActions={...}
  log={...}
/>
```

- [ ] **Step 4: Implement placeholder templates**

Add focused, simple wrappers for DetailPage, DashboardPage, SettingsPage, and SplitPage so new pages can adopt the system without custom layout.

- [ ] **Step 5: Run build**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds.

---

### Task 4: Migrate Operator Workbench Pilot

**Files:**
- Modify: `frontend/src/pages/OperatorPage.jsx`
- Modify as needed: `frontend/src/components/operator/OperatorHeader.jsx`
- Modify as needed: `frontend/src/components/operator/CaptchaArea.jsx`
- Modify as needed: `frontend/src/components/operator/OperatorSidebar.jsx`
- Modify as needed: `frontend/src/components/operator/ReadinessPopup.jsx`

- [ ] **Step 1: Preserve business logic**

Do not change SSE handling, captcha queue state, click coordinate mapping, readiness behavior, or master selection APIs.

- [ ] **Step 2: Replace fixed layout wrapper with WorkbenchPage**

Keep existing active state and handlers, but render connected state through `WorkbenchPage`.

- [ ] **Step 3: Mobile behavior**

Ensure mobile layout:
- sticky status/header at top;
- captcha main area fills available width;
- readiness confirmation is large and centered;
- side panels move into drawers/tabs or bottom sections;
- no horizontal overflow.

- [ ] **Step 4: Run build**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds.

---

### Task 5: Migrate ReportsTab Analytical List Pilot

**Files:**
- Modify: `frontend/src/components/admin/ReportsTab.jsx`

- [ ] **Step 1: Preserve data behavior**

Do not change fetch URLs, filters, invoice actions, row expansion behavior, or modal behavior.

- [ ] **Step 2: Use MetricsStrip and FilterBar**

Replace manual metric badges and filter rows with foundation patterns.

- [ ] **Step 3: Use DataTable for the main usage log table**

Use `DataTable` with columns for selection, ID, token, type, status, date, slot, FIO, company, vehicle, custom slots, price, invoice, paid status, error, actions.

- [ ] **Step 4: Keep secondary legacy tables if needed**

Company summary and failure summary may remain as legacy Bootstrap tables in the first pilot if converting them would risk behavior. Mark them as next migration candidates in final summary.

- [ ] **Step 5: Run build**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds.

---

### Task 6: Verification

**Files:**
- Inspect generated build only; do not modify backend.

- [ ] **Step 1: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 2: Start a local frontend preview or existing app server**

Run if practical:

```bash
cd frontend
npm run preview
```

Expected: local URL is available.

- [ ] **Step 3: Browser check**

Open desktop admin/report and operator routes. Check:
- no blank screens;
- no horizontal overflow on mobile operator route;
- text stays inside buttons/tags/cells;
- loading/empty areas have stable height.

- [ ] **Step 4: Final summary**

Report changed files, verification commands, known limitations, and next migration candidates.
