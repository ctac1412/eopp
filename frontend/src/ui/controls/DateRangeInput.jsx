import React from "react";
import { DatePicker } from "antd";

export function DateRangeInput(props) {
  return (
    <DatePicker.RangePicker
      data-eopp-component="DateRangeInput"
      allowClear
      {...props}
    />
  );
}
