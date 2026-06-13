# Channel Control Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the EOPP channel management area into a reusable `ChannelControlShell` component with a stable scaffold for channel context, commands, client state, and event logs.

**Architecture:** `HomePluginChannels` remains the owner of data loading, channel selection, and command API calls. The new `ChannelControlShell` is a presentational/action component that receives a selected channel plus callbacks, so it can be reused in another page without duplicating channel facts, command buttons, and empty-state layout. Styling stays in `frontend/src/styles/05-pages.css` for now because the surrounding home page styles already live there.

**Tech Stack:** React 18, existing `frontend/src/ui` `Button` and `StatusTag`, Vite, static Node assertion tests used by the current frontend test files.

---

## File Structure

- Create `frontend/src/pages/ChannelControlShell.jsx`
  - Owns reusable channel control markup.
  - Exports `companyLabel`, `userLabel`, and `routeLabel` only if `HomePluginChannels` still needs them for the channel list.
  - Accepts callbacks for `claim`, `release`, `sendCommand`, and `close`.
- Modify `frontend/src/pages/HomePluginChannels.jsx`
  - Imports `ChannelControlShell`.
  - Keeps polling, filtering, modal layout, and channel list.
  - Removes duplicated right-panel JSX.
- Modify `frontend/src/styles/05-pages.css`
  - Keeps existing `channel-control-shell*` classes.
  - Adds section classes for the scaffold: context, commands, status, and logs.
- Create `frontend/src/pages/ChannelControlShell.test.mjs`
  - Static contract test that verifies export names, callback names, section classes, and command types.
- Modify `frontend/src/pages/HomePluginChannels.test.mjs`
  - Verifies `HomePluginChannels` imports and renders `ChannelControlShell`.

---

### Task 1: Add Component Contract Test

**Files:**
- Create: `frontend/src/pages/ChannelControlShell.test.mjs`
- Modify: none
- Test: `frontend/src/pages/ChannelControlShell.test.mjs`

- [ ] **Step 1: Write the failing static test**

Create `frontend/src/pages/ChannelControlShell.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("./ChannelControlShell.jsx", import.meta.url), "utf8");

assert.match(component, /export function ChannelControlShell/);
assert.match(component, /function companyLabel/);
assert.match(component, /function userLabel/);
assert.match(component, /function routeLabel/);
assert.match(component, /onClaim/);
assert.match(component, /onRelease/);
assert.match(component, /onSendCommand/);
assert.match(component, /onCloseChannel/);
assert.match(component, /refresh_snapshot/);
assert.match(component, /stop_pipeline/);
assert.match(component, /channel-control-shell__context/);
assert.match(component, /channel-control-shell__commands/);
assert.match(component, /channel-control-shell__state/);
assert.match(component, /channel-control-shell__logs/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node frontend/src/pages/ChannelControlShell.test.mjs
```

Expected: FAIL with `ENOENT` for `ChannelControlShell.jsx`.

---

### Task 2: Create Reusable ChannelControlShell Component

**Files:**
- Create: `frontend/src/pages/ChannelControlShell.jsx`
- Test: `frontend/src/pages/ChannelControlShell.test.mjs`

- [ ] **Step 1: Add the component**

Create `frontend/src/pages/ChannelControlShell.jsx`:

```jsx
import React from "react";
import { Button, StatusTag } from "../ui";

export function companyLabel(channel) {
  return channel?.company?.name || channel?.raw_company_name || "Без компании";
}

export function userLabel(channel) {
  if (typeof channel?.eopp_user === "string") return channel.eopp_user;
  return channel?.eopp_user?.name || channel?.eopp_user_name || "Пользователь не найден";
}

export function routeLabel(channel) {
  if (channel?.route_kind === "reservation_card") return "карточка";
  if (channel?.route_kind === "eopp_root") return "root";
  return "маршрут ?";
}

function valueOrDash(value) {
  return value || "-";
}

export function ChannelControlShell({
  channel,
  onClaim,
  onRelease,
  onSendCommand,
  onCloseChannel,
}) {
  if (!channel) {
    return (
      <main className="channel-control-shell">
        <div className="channel-control-shell__placeholder">Выберите канал слева</div>
      </main>
    );
  }

  const isClaimed = Boolean(channel.claimed_master_key_id);

  return (
    <main className="channel-control-shell">
      <div className="channel-control-shell__head">
        <div>
          <strong>{companyLabel(channel)}</strong>
          <span>{userLabel(channel)}</span>
        </div>
        <StatusTag status={isClaimed ? "online" : "warning"} label={channel.status || "open"} />
      </div>

      <section className="channel-control-shell__context" aria-label="Контекст канала">
        <dl className="channel-control-shell__facts">
          <div><dt>Маршрут</dt><dd>{routeLabel(channel)}</dd></div>
          <div><dt>Бронь</dt><dd>{valueOrDash(channel.reservation_id)}</dd></div>
          <div><dt>URL</dt><dd>{valueOrDash(channel.page_url)}</dd></div>
          <div><dt>Last seen</dt><dd>{valueOrDash(channel.last_seen_at)}</dd></div>
        </dl>
      </section>

      <section className="channel-control-shell__commands" aria-label="Команды канала">
        <div className="channel-control-shell__actions">
          {!isClaimed ? (
            <Button variant="primary" onClick={() => onClaim(channel)}>Взять канал</Button>
          ) : (
            <Button onClick={() => onRelease(channel)}>Отказаться</Button>
          )}
          <Button onClick={() => onSendCommand(channel, "refresh_snapshot")}>Обновить snapshot</Button>
          <Button onClick={() => onSendCommand(channel, "stop_pipeline")}>Стоп</Button>
          <Button variant="danger" onClick={() => onCloseChannel(channel)}>Закрыть</Button>
        </div>
      </section>

      <section className="channel-control-shell__state" aria-label="Состояние клиента">
        <strong>Состояние клиента</strong>
        <span>Команды готовы. Детали выполнения появятся после подключения клиентского snapshot.</span>
      </section>

      <section className="channel-control-shell__logs" aria-label="Логи канала">
        <strong>Логи канала</strong>
        <span>Здесь будет поток событий: команды, ответы клиента, ошибки и завершения pipeline.</span>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Run the component contract test**

Run:

```bash
node frontend/src/pages/ChannelControlShell.test.mjs
```

Expected: PASS with no output.

---

### Task 3: Wire HomePluginChannels To The New Component

**Files:**
- Modify: `frontend/src/pages/HomePluginChannels.jsx`
- Modify: `frontend/src/pages/HomePluginChannels.test.mjs`
- Test: `frontend/src/pages/HomePluginChannels.test.mjs`

- [ ] **Step 1: Update imports and remove duplicated label helpers**

In `frontend/src/pages/HomePluginChannels.jsx`, replace the current import:

```jsx
import { Button, StatusTag } from "../ui";
```

with:

```jsx
import { Button } from "../ui";
import {
  ChannelControlShell,
  companyLabel,
  routeLabel,
  userLabel,
} from "./ChannelControlShell";
```

Then remove local `companyLabel`, `userLabel`, and `routeLabel` function definitions from `HomePluginChannels.jsx`.

- [ ] **Step 2: Replace the right-panel JSX**

In `HomePluginChannels.jsx`, replace the whole `<main className="channel-control-shell">...</main>` block with:

```jsx
              <ChannelControlShell
                channel={selected}
                onClaim={claimChannel}
                onRelease={releaseChannel}
                onSendCommand={sendCommand}
                onCloseChannel={closeChannel}
              />
```

- [ ] **Step 3: Update the home component static test**

Add these assertions to `frontend/src/pages/HomePluginChannels.test.mjs`:

```js
assert.match(component, /ChannelControlShell/);
assert.match(component, /onSendCommand=\{sendCommand\}/);
assert.match(component, /onCloseChannel=\{closeChannel\}/);
```

- [ ] **Step 4: Run the home channel test**

Run:

```bash
node frontend/src/pages/HomePluginChannels.test.mjs
```

Expected: PASS with no output.

---

### Task 4: Style The New Scaffold Sections

**Files:**
- Modify: `frontend/src/styles/05-pages.css`
- Test: `frontend/src/pages/ChannelControlShell.test.mjs`

- [ ] **Step 1: Add section styles near the existing `channel-control-shell` block**

Add:

```css
.channel-control-shell__context,
.channel-control-shell__commands,
.channel-control-shell__state,
.channel-control-shell__logs {
  min-width: 0;
}

.channel-control-shell__state,
.channel-control-shell__logs {
  display: grid;
  gap: 5px;
  border: 1px dashed rgba(148, 163, 184, 0.38);
  border-radius: 7px;
  padding: 13px;
  background: rgba(13, 17, 23, 0.24);
  color: var(--channel-muted);
  font-size: 0.78rem;
}

.channel-control-shell__state strong,
.channel-control-shell__logs strong {
  color: var(--channel-text);
}

.channel-control-shell__logs {
  min-height: 84px;
}
```

- [ ] **Step 2: Keep the old placeholder style for empty selection only**

Leave `.channel-control-shell__placeholder` in place because `ChannelControlShell` still uses it when `channel` is absent.

- [ ] **Step 3: Run the component contract test**

Run:

```bash
node frontend/src/pages/ChannelControlShell.test.mjs
```

Expected: PASS with no output.

---

### Task 5: Full Frontend Verification

**Files:**
- No code changes
- Test: frontend build and static tests

- [ ] **Step 1: Run focused static tests**

Run:

```bash
node frontend/src/pages/ChannelControlShell.test.mjs
node frontend/src/pages/HomePluginChannels.test.mjs
```

Expected: both commands PASS with no output.

- [ ] **Step 2: Run production build**

Run from `frontend/`:

```bash
npm.cmd run build
```

Expected: Vite prints `✓ built`.

- [ ] **Step 3: Optional browser check with an authenticated local session**

Run from `frontend/`:

```bash
npm.cmd run dev -- --host 127.0.0.1 --port 5174
```

Open the printed local URL, log in, open `Каналы EOPP`, and verify:

- The left list still shows available and claimed channels.
- Selecting a channel updates the right panel.
- `Взять канал`, `Отказаться`, `Обновить snapshot`, `Стоп`, and `Закрыть` remain visible.
- The right panel shows separate context, commands, client state, and logs sections.
- At mobile width, the channel list stacks above the control shell.

---

## Self-Review

- Spec coverage: The plan extracts the right-side management area, preserves existing channel modal behavior, and creates scaffold sections for later reuse.
- Placeholder scan: The plan contains no unresolved placeholder tasks. The rendered UI text explicitly describes currently empty state and logs sections.
- Type consistency: Callback prop names are `onClaim`, `onRelease`, `onSendCommand`, and `onCloseChannel` in both the component and the parent wiring.
