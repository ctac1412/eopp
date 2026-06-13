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
    Button: {
      borderRadius: eoppTokens.borderRadius,
      fontWeight: 500,
    },
    Card: {
      borderRadiusLG: eoppTokens.borderRadius,
    },
    Form: {
      itemMarginBottom: 8,
    },
    Table: {
      headerBg: eoppTokens.colorBgElevated,
      rowHoverBg: "rgba(124, 58, 237, 0.06)",
      borderColor: eoppTokens.colorBorder,
    },
    Tag: {
      borderRadiusSM: 6,
    },
  },
};
