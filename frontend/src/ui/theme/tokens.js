export const sharedTypographyTokens = {
  fontSize: 13,
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyMonospace: "'SF Mono', 'Fira Code', 'Consolas', monospace",
};

export const sharedDensityTokens = {
  borderRadius: 8,
  controlHeight: 32,
  controlHeightSM: 28,
  controlHeightLG: 40,
};

export const darkThemeTokens = {
  colorBgBase: "#0d1117",
  colorBgContainer: "#151b24",
  colorBgElevated: "#1d2633",
  colorBorder: "#2f3a49",
  colorBorderSecondary: "#384455",
  colorText: "#d2dae3",
  colorTextHeading: "#eef4fb",
  colorTextSecondary: "#9aa5b1",
  colorPrimary: "#7c3aed",
  colorSuccess: "#10b981",
  colorWarning: "#f59e0b",
  colorError: "#ef4444",
  colorInfo: "#3b82f6",
  rowHoverBg: "rgba(124, 58, 237, 0.055)",
  ...sharedDensityTokens,
  ...sharedTypographyTokens,
};

export const lightThemeTokens = {
  colorBgBase: "#f7f9fc",
  colorBgContainer: "#ffffff",
  colorBgElevated: "#f3f6fa",
  colorBorder: "#d4dde8",
  colorBorderSecondary: "#bfccd9",
  colorText: "#1f2937",
  colorTextHeading: "#111827",
  colorTextSecondary: "#5f6f85",
  colorPrimary: "#6d28d9",
  colorSuccess: "#059669",
  colorWarning: "#d97706",
  colorError: "#dc2626",
  colorInfo: "#2563eb",
  rowHoverBg: "rgba(109, 40, 217, 0.065)",
  ...sharedDensityTokens,
  ...sharedTypographyTokens,
};

export const themeTokensByMode = {
  dark: darkThemeTokens,
  light: lightThemeTokens,
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
