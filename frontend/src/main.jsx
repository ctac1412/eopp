/**
 * EOPP Captcha Solver - React Entry Point
 *
 * Настраивает React Router и монтирует приложение.
 *
 * Роуты:
 * - / -> App (главная страница решения капч)
 * - /admin -> AdminPage (панель администрирования)
 *
 * Подключает глобальные стили: main.css
 */
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "antd/dist/reset.css";
import { ConfigProvider } from "antd";
import App from "./app/App.jsx";
import { AdminPage } from "./features/admin";
import { OperatorPage } from "./features/operator/workbench";
import { TrainingPage, TrainingRunPage } from "./features/training/runs";
import { TrainingResultsPage } from "./features/training/results";
import { TrainingReviewPage } from "./features/training/review";
import { registerServiceWorker } from "./registerServiceWorker";
import { createAntdTheme } from "./ui/theme/antdTheme";
import "./ui/styles/layout.css";
import "./main.css";

const THEME_STORAGE_KEY = "eopp_theme";
const DEFAULT_THEME_MODE = "dark";
const THEME_MODES = new Set(["dark", "light"]);

function readStoredThemeMode() {
  try {
    const storedMode = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_MODES.has(storedMode) ? storedMode : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

const initialThemeMode = readStoredThemeMode();
document.documentElement.dataset.theme = initialThemeMode;
document.getElementById("root")?.setAttribute("data-theme", initialThemeMode);

function EoppRoot() {
  const [themeMode, setThemeMode] = useState(initialThemeMode);
  const antdTheme = useMemo(() => createAntdTheme(themeMode), [themeMode]);

  useEffect(() => {
    const rootElement = document.getElementById("root");
    document.documentElement.dataset.theme = themeMode;
    rootElement?.setAttribute("data-theme", themeMode);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // Ignore storage failures; the in-memory theme still updates.
    }
  }, [themeMode]);

  return (
    <ConfigProvider theme={antdTheme}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <App
                themeMode={themeMode}
                onThemeModeChange={setThemeMode}
              />
            }
          />
          <Route
            path="/admin/:tabId?"
            element={
              <AdminPage
                themeMode={themeMode}
                onThemeModeChange={setThemeMode}
              />
            }
          />
          <Route
            path="/operators/:uuid"
            element={
              <OperatorPage
                themeMode={themeMode}
                onThemeModeChange={setThemeMode}
              />
            }
          />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/training/run/:id" element={<TrainingRunPage />} />
          <Route
            path="/training/run/:id/results"
            element={<TrainingResultsPage />}
          />
          <Route
            path="/training/run/:id/review"
            element={<TrainingReviewPage />}
          />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <EoppRoot />
  </React.StrictMode>,
);

if (import.meta.env.PROD) {
  registerServiceWorker();
}
