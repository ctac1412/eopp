import React from "react";
import UsageHistory from "../components/UsageHistory";

export function HistoryTab({ apiKey, adminToken }) {
  return <UsageHistory apiKey={apiKey} adminToken={adminToken} />;
}