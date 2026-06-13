from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.entities.base import Base


class ConnectedPlugin(Base):
    """Anonymous installed plugin instance that may open channel sessions."""

    __tablename__ = "connected_plugins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    installation_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    extension_kind: Mapped[str] = mapped_column(String, nullable=False, default="channel")
    extension_version: Mapped[str] = mapped_column(String, nullable=False, default="")
    transport_mode: Mapped[str | None] = mapped_column(String, nullable=True)
    first_seen_at: Mapped[str] = mapped_column(Text, nullable=False)
    last_seen_at: Mapped[str] = mapped_column(Text, nullable=False)


class PluginChannelSession(Base):
    """Remote-control channel opened from an EOPP page without user auth."""

    __tablename__ = "plugin_channel_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    connected_plugin_id: Mapped[int] = mapped_column(Integer, ForeignKey("connected_plugins.id"), nullable=False)
    route_kind: Mapped[str] = mapped_column(String, nullable=False, default="unknown")
    page_url: Mapped[str] = mapped_column(Text, nullable=False, default="")
    company_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("companies.id"), nullable=True)
    raw_company_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    eopp_user_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    executor_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    reservation_id: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="open")
    visibility: Mapped[str] = mapped_column(String, nullable=False, default="global_masters")
    claimed_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    claimed_master_key_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("api_keys.id"), nullable=True)
    channel_secret: Mapped[str] = mapped_column(String, nullable=False)
    opened_at: Mapped[str] = mapped_column(Text, nullable=False)
    last_seen_at: Mapped[str] = mapped_column(Text, nullable=False)
    closed_at: Mapped[str | None] = mapped_column(Text, nullable=True)


class PluginChannelSnapshot(Base):
    """Raw page context plus backend-parsed fields for a channel session."""

    __tablename__ = "plugin_channel_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("plugin_channel_sessions.id"), nullable=False)
    raw_snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    parsed_fields_json: Mapped[str] = mapped_column(Text, nullable=False)
    parser_version: Mapped[str] = mapped_column(String, nullable=False, default="v1")
    created_at: Mapped[str] = mapped_column(Text, nullable=False)


class PluginChannelCommand(Base):
    """Typed command queued by a master and executed by the channel plugin."""

    __tablename__ = "plugin_channel_commands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("plugin_channel_sessions.id"), nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    status: Mapped[str] = mapped_column(String, nullable=False, default="queued")
    created_by_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str | None] = mapped_column(Text, nullable=True)


class PluginChannelEvent(Base):
    """Append-only channel lifecycle, log, and command audit event."""

    __tablename__ = "plugin_channel_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("plugin_channel_sessions.id"), nullable=True)
    type: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(Text, nullable=False)
