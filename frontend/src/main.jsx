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
import App from "./App.jsx";
import AdminPage from "./AdminPage.jsx";
import { OperatorPage } from "./pages/OperatorPage.jsx";
import { DebugDistributionPage } from "./pages/DebugDistributionPage.jsx";
import "./main.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/operators/:uuid" element={<OperatorPage />} />
        <Route path="/debug/distribution" element={<DebugDistributionPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
