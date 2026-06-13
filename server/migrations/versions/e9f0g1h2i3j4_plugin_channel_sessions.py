"""add plugin channel sessions

Revision ID: e9f0g1h2i3j4
Revises: d8e9f0g1h2i3
Create Date: 2026-06-13
"""

from alembic import op
import sqlalchemy as sa


revision = "e9f0g1h2i3j4"
down_revision = "d8e9f0g1h2i3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "connected_plugins",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("installation_id", sa.String(), nullable=False, unique=True),
        sa.Column("extension_kind", sa.String(), nullable=False, server_default="channel"),
        sa.Column("extension_version", sa.String(), nullable=False, server_default=""),
        sa.Column("transport_mode", sa.String(), nullable=True),
        sa.Column("first_seen_at", sa.Text(), nullable=False),
        sa.Column("last_seen_at", sa.Text(), nullable=False),
    )
    op.create_table(
        "plugin_channel_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("connected_plugin_id", sa.Integer(), sa.ForeignKey("connected_plugins.id"), nullable=False),
        sa.Column("route_kind", sa.String(), nullable=False, server_default="unknown"),
        sa.Column("page_url", sa.Text(), nullable=False, server_default=""),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=True),
        sa.Column("raw_company_name", sa.Text(), nullable=True),
        sa.Column("eopp_user_name", sa.Text(), nullable=True),
        sa.Column("reservation_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("visibility", sa.String(), nullable=False, server_default="global_masters"),
        sa.Column("claimed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("channel_secret", sa.String(), nullable=False),
        sa.Column("opened_at", sa.Text(), nullable=False),
        sa.Column("last_seen_at", sa.Text(), nullable=False),
        sa.Column("closed_at", sa.Text(), nullable=True),
    )
    op.create_table(
        "plugin_channel_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("plugin_channel_sessions.id"), nullable=False),
        sa.Column("raw_snapshot_json", sa.Text(), nullable=False),
        sa.Column("parsed_fields_json", sa.Text(), nullable=False),
        sa.Column("parser_version", sa.String(), nullable=False, server_default="v1"),
        sa.Column("created_at", sa.Text(), nullable=False),
    )
    op.create_table(
        "plugin_channel_commands",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("plugin_channel_sessions.id"), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("payload_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(), nullable=False, server_default="queued"),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("result_json", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.Text(), nullable=True),
    )
    op.create_table(
        "plugin_channel_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("plugin_channel_sessions.id"), nullable=True),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.Text(), nullable=False),
    )
    op.create_index("ix_plugin_channel_sessions_company", "plugin_channel_sessions", ["company_id"])
    op.create_index("ix_plugin_channel_sessions_status", "plugin_channel_sessions", ["status"])
    op.create_index("ix_plugin_channel_commands_session_status", "plugin_channel_commands", ["session_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_plugin_channel_commands_session_status", table_name="plugin_channel_commands")
    op.drop_index("ix_plugin_channel_sessions_status", table_name="plugin_channel_sessions")
    op.drop_index("ix_plugin_channel_sessions_company", table_name="plugin_channel_sessions")
    op.drop_table("plugin_channel_events")
    op.drop_table("plugin_channel_commands")
    op.drop_table("plugin_channel_snapshots")
    op.drop_table("plugin_channel_sessions")
    op.drop_table("connected_plugins")
