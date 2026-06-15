import { theme } from "antd";
import { darkThemeTokens, themeTokensByMode } from "./tokens";

export function createAntdTheme(mode = "dark") {
  const tokens = themeTokensByMode[mode] || darkThemeTokens;
  const algorithm =
    mode === "light" ? theme.defaultAlgorithm : theme.darkAlgorithm;

  return {
    algorithm: [algorithm, theme.compactAlgorithm],
    token: {
      colorBgBase: tokens.colorBgBase,
      colorBgContainer: tokens.colorBgContainer,
      colorBgElevated: tokens.colorBgElevated,
      colorBorder: tokens.colorBorder,
      colorBorderSecondary: tokens.colorBorderSecondary,
      colorText: tokens.colorText,
      colorTextHeading: tokens.colorTextHeading,
      colorTextSecondary: tokens.colorTextSecondary,
      colorPrimary: tokens.colorPrimary,
      colorSuccess: tokens.colorSuccess,
      colorWarning: tokens.colorWarning,
      colorError: tokens.colorError,
      colorInfo: tokens.colorInfo,
      borderRadius: tokens.borderRadius,
      controlHeight: tokens.controlHeight,
      controlHeightSM: tokens.controlHeightSM,
      controlHeightLG: tokens.controlHeightLG,
      fontSize: tokens.fontSize,
      fontFamily: tokens.fontFamily,
    },
    components: {
      Button: {
        borderRadius: tokens.borderRadius,
        fontWeight: 500,
      },
      Card: {
        borderRadiusLG: tokens.borderRadius,
      },
      Form: {
        itemMarginBottom: 8,
      },
      Table: {
        headerBg: tokens.colorBgElevated,
        rowHoverBg: tokens.rowHoverBg,
        borderColor: tokens.colorBorder,
      },
      Tag: {
        borderRadiusSM: 6,
      },
    },
  };
}

export const defaultAntdTheme = createAntdTheme("dark");

export const antdTheme = defaultAntdTheme;
