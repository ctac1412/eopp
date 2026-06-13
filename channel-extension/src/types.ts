export type RouteKind = "reservation_card" | "eopp_root" | "unknown";
export type TransportMode = "pageDirect" | "backgroundProxy";
export type ChannelStatus = "idle" | "opening" | "open" | "error" | "closed";

export interface RawSnapshot {
  captured_at: string;
  executor_token?: string | null;
  page: {
    url: string;
    title: string;
    route_kind: RouteKind;
  };
  reservation?: {
    id?: string | null;
    userData?: {
      organizationName?: string | null;
      fio?: string | null;
    };
  };
  dom: {
    visible_text: string;
    headings: string[];
    labels: string[];
    inputs: Array<{ name?: string; id?: string; value?: string; placeholder?: string }>;
  };
  storage_hints: {
    local_storage_keys: string[];
    session_storage_keys: string[];
  };
  eopp_user_hint?: string | null;
}

export interface ChannelCompany {
  id: number | null;
  name: string | null;
  auto_created?: boolean;
}

export interface OpenSessionResponse {
  session_id: string;
  channel_secret: string;
  transport_mode: string;
  route_kind: RouteKind;
  reservation_id?: string | null;
  executor_token?: string | null;
  company: ChannelCompany | null;
  eopp_user?: string | { name?: string | null } | null;
  visibility: string;
  status: string;
}

export interface ChannelCommand {
  id: number;
  type: string;
  schema_version: number;
  payload: Record<string, unknown>;
  timeout_seconds?: number;
  requires_claim?: boolean;
}

export interface ChannelLogEntry {
  level: "info" | "warn" | "error";
  message: string;
  at: string;
}

export interface OpenSessionBody {
  installation_id: string;
  extension_version: string;
  route_kind: RouteKind;
  page_url: string;
  transport_mode: TransportMode;
  executor_token?: string | null;
  raw_snapshot: RawSnapshot;
}

export interface CommandResultBody {
  channel_secret: string;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

export interface ChannelEventBody {
  channel_secret: string;
  event_type: string;
  payload: Record<string, unknown>;
}
