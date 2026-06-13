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
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "antd/dist/reset.css";
import { ConfigProvider } from "antd";
import App from "./App.jsx";
import AdminPage from "./AdminPage.jsx";
import { OperatorPage } from "./pages/OperatorPage.jsx";
import TrainingPage from "./pages/TrainingPage.jsx";
import TrainingRunPage from "./pages/TrainingRunPage.jsx";
import TrainingResultsPage from "./pages/TrainingResultsPage.jsx";
import TrainingReviewPage from "./pages/TrainingReviewPage.jsx";
import { antdTheme } from "./ui/theme/antdTheme";
import "./ui/styles/layout.css";
import "./main.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfigProvider theme={antdTheme}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/operators/:uuid" element={<OperatorPage />} />
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
  </React.StrictMode>,
);
