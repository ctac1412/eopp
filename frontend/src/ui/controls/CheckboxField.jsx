import React from "react";
import { Checkbox } from "antd";

export function CheckboxField({ children, ...props }) {
  return (
    <Checkbox data-eopp-component="CheckboxField" {...props}>
      {children}
    </Checkbox>
  );
}
