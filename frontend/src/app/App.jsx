/**
 * EOPP Captcha Solver - Главное приложение React
 *
 * Роуты: / (главная страница)
 */
import React from "react";
import { HomePage } from "../features/captcha/solving";

function App({ themeMode = "dark", onThemeModeChange }) {
  return <HomePage themeMode={themeMode} onThemeModeChange={onThemeModeChange} />;
}

export default App;
