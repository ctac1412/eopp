import React from "react";
import { Button as AntButton } from "antd";

export function Button({ variant = "secondary", ...props }) {
  const type = variant === "primary" ? "primary" : "default";
  const danger = variant === "danger";
  return (
    <AntButton
      data-eopp-component="Button"
      type={type}
      danger={danger}
      {...props}
    />
  );
}
