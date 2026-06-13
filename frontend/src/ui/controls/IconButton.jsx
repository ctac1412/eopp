import React from "react";
import { Tooltip } from "antd";
import { Button } from "./Button";

export function IconButton({ label, title, children, ...props }) {
  const button = (
    <Button
      data-eopp-component="IconButton"
      aria-label={label || title}
      title={undefined}
      {...props}
    >
      {children}
    </Button>
  );
  return title ? <Tooltip title={title}>{button}</Tooltip> : button;
}
