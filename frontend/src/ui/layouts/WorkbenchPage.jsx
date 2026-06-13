import React, { useState } from "react";
import { Drawer } from "antd";
import { Button } from "../controls/Button";

export function WorkbenchPage({
  status,
  main,
  side,
  sideTitle = "Панели",
  bottomActions,
  log,
  notice,
}) {
  const [sideOpen, setSideOpen] = useState(false);
  const mobileActions = side ? (
    <>
      <Button onClick={() => setSideOpen(true)}>Панели</Button>
      {bottomActions}
    </>
  ) : (
    bottomActions
  );

  return (
    <div data-eopp-component="WorkbenchPage" className="eopp-workbench">
      <div data-eopp-component="WorkbenchLayout" className="eopp-workbench__desktop">
        <div data-eopp-component="WorkbenchMain" className="eopp-workbench__main">
          {status && (
            <div data-eopp-component="WorkbenchStatus" className="eopp-workbench__status">
              {status}
            </div>
          )}
          <div data-eopp-component="WorkbenchContent" className="eopp-workbench__content">
            {main}
          </div>
          {log}
          {notice}
          {mobileActions && (
            <div
              data-eopp-component="WorkbenchBottomActions"
              className="eopp-workbench__bottom-actions"
            >
              {mobileActions}
            </div>
          )}
        </div>
        {side && (
          <aside data-eopp-component="WorkbenchSide" className="eopp-workbench__side">
            {side}
          </aside>
        )}
      </div>
      {side && (
        <Drawer
          data-eopp-component="WorkbenchSideDrawer"
          title={sideTitle}
          placement="bottom"
          height="72vh"
          open={sideOpen}
          onClose={() => setSideOpen(false)}
          destroyOnClose={false}
        >
          {side}
        </Drawer>
      )}
    </div>
  );
}
