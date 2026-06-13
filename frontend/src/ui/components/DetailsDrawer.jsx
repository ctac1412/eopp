import React from "react";
import { Drawer } from "antd";

export function DetailsDrawer(props) {
  return (
    <Drawer
      data-eopp-component="DetailsDrawer"
      width={520}
      destroyOnClose
      {...props}
    />
  );
}
