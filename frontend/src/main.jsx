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
import App from "./app/App.jsx";
import { AdminPage } from "./features/admin";
import { OperatorPage } from "./features/operator/workbench";
import { TrainingPage } from "./features/training/runs";
import { TrainingRunPage } from "./features/training/runs";
import { TrainingResultsPage } from "./features/training/results";
import { TrainingReviewPage } from "./features/training/review";
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
