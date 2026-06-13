import React from "react";
import { Select } from "antd";

export function SelectInput(props) {
  return (
    <Select
      data-eopp-component="SelectInput"
      allowClear
      optionFilterProp="label"
      {...props}
    />
  );
}
