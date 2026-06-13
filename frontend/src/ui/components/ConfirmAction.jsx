import React from "react";
import { Popconfirm } from "antd";
import { Button } from "../controls/Button";

export function ConfirmAction({
  title = "Подтвердить действие?",
  description,
  okText = "Да",
  cancelText = "Отмена",
  children,
  onConfirm,
  ...buttonProps
}) {
  return (
    <Popconfirm
      title={title}
      description={description}
      okText={okText}
      cancelText={cancelText}
      onConfirm={onConfirm}
    >
      {children || <Button variant="danger" {...buttonProps} />}
    </Popconfirm>
  );
}
