# Poké Roulette — Client Integration Instructions

v1.6 → v1.7 (Online Multiplayer)

---

## Overview

Version 1.7 adds the Online tab and all multiplayer functionality. The existing single-player code is unchanged — all new code is additive. The only integration point with existing code is hooking into `saveLists`.

The backend API base URL should be configurable at the top of the file as a constant:

```js
const API_BASE = 'https://api.pokeroulette.example.com/api/v1';
```

---

## 1. In-Memory Auth State

Add three module-level variables:

```js
let authToken = null;       // JWT string or null
let authUsername = null;    // string or null
let currentRoom = null;     // { code, role, members } or null
```

These are never written to `localStorage`. They reset on every page load.

---

## 2. API Helper

Add a general-purpose fetch wrapper that:

1. Attaches `Authorization: Bearer {authToken}` when `authToken` is set
2. Sends/receives JSON
3. Checks for `X-Refreshed-Token` in the response and updates `authToken` if present
4. Returns `{ ok, status, data }` — never throws; caller checks `ok`

```js
async function apiRequest(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const refreshed = res.headers.get('X-Refreshed-Token');
  if (refreshed) authToken = refreshed;

  let data = null;
  try { data = await res.json(); } catch (_) {}

  return { ok: res.ok, status: res.status, data };
}
```

---

## 3. saveLists Hook

Find the existing `saveLists` function (the one that writes to `localStorage`). After the `localStorage` write, add a sync push when in a room:

```js
function saveLists(lists) {
  localStorage.setItem('pokeroulette_lists', JSON.stringify(lists));
  // --- NEW ---
  if (currentRoom) {
    apiRequest('PUT', `/rooms/${currentRoom.code}/lists`, { lists });
    // Fire-and-forget. Errors are silently ignored — SSE will
    // eventually converge state from other members' pushes.
  }
}
```

---

## 4. Sidebar Tab

Add the ⊕ tab to the sidebar tab bar alongside the existing ≡ and ⚙ tabs. It switches the sidebar content to the Online view. The active tab highlight logic already handles this if the tab follows the same pattern as the existing ones.

---

## 5. Online View — Rendering

The Online view is a single `<div>` whose contents are replaced by one of four render functions depending on state. Call `renderOnlineView()` whenever auth or room state changes.

```js
function renderOnlineView() {
  if (!authToken)           return renderAuthSection();
  if (!currentRoom)         return renderRoomSection();
                            return renderActiveRoomSection();
}
```

### 5.1 Auth Section

Two sub-tabs: Sign In and Register. Both share the same form shape (username + password + submit button + error area). On submit:

```js
async function handleSignIn(username, password) {
  const { ok, data } = await apiRequest('POST', '/auth/login', { username, password });
  if (!ok) { showAuthError(data?.error ?? 'Sign in failed'); return; }
  authToken = data.token;
  authUsername = username;
  renderOnlineView();
}

async function handleRegister(username, password) {
  const { ok, data } = await apiRequest('POST', '/auth/register', { username, password });
  if (!ok) { showAuthError(data?.error ?? 'Registration failed'); return; }
  authToken = data.token;
  authUsername = username;
  renderOnlineView();
}
```

### 5.2 Room Section

Create Room and Join Room sub-sections, plus Change Password and Sign Out.

**Room code sanitization** — applied live on the Create input's `input` event:

```js
function sanitizeRoomCode(raw) {
  return raw
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

**Room code validation** — gates the Create button:

```js
function isValidRoomCode(code) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(code) && code.length >= 3 && code.length <= 32;
}
```

**Create room:**

```js
async function handleCreateRoom(code) {
  const lists = JSON.parse(localStorage.getItem('pokeroulette_lists'));
  const { ok, data } = await apiRequest('POST', '/rooms', { code, lists });
  if (!ok) { showRoomError(data?.error ?? 'Could not create room'); return; }
  await connectToRoom(code);
}
```

**Join room:**

```js
async function handleJoinRoom(code) {
  const { ok, data } = await apiRequest('POST', `/rooms/${code}/join`);
  if (!ok) { showRoomError(data?.error ?? 'Could not join room'); return; }
  // Server state overwrites local lists
  saveLists(data.lists); // writes to localStorage; sync push skipped (currentRoom not set yet)
  localStorage.setItem('pokeroulette_lists', JSON.stringify(data.lists));
  currentRoom = { code, role: data.role, members: data.members };
  openSSE(code);
  renderOnlineView();
  rerenderLists(); // refresh the Lists view with server state
}
```

**Change password modal:**

```js
async function handleChangePassword(currentPassword, newPassword) {
  const { ok, data } = await apiRequest('PUT', '/auth/password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
  if (!ok) { showPasswordError(data?.error ?? 'Failed to change password'); return; }
  // All tokens invalidated — must re-login
  authToken = null;
  authUsername = null;
  currentRoom = null;
  closeSSE();
  closeModal();
  renderOnlineView();
}
```

**Sign out:**

```js
function handleSignOut() {
  authToken = null;
  authUsername = null;
  closeSSE();
  currentRoom = null;
  renderOnlineView();
}
```

### 5.3 Active Room Section

**Leave room:**

```js
async function handleLeaveRoom() {
  const { ok, data } = await apiRequest('POST', `/rooms/${currentRoom.code}/leave`);
  if (!ok) { showRoomError(data?.error ?? 'Could not leave room'); return; }
  closeSSE();
  currentRoom = null;
  renderOnlineView();
}
```

**Close room (host only):**

```js
async function handleCloseRoom() {
  const { ok, data } = await apiRequest('DELETE', `/rooms/${currentRoom.code}`);
  if (!ok) { showRoomError(data?.error ?? 'Could not close room'); return; }
  // SSE room_closed event will also fire; handle defensively in SSE handler
  closeSSE();
  currentRoom = null;
  renderOnlineView();
}
```

**Role assignment `…` menu:**

Fetch available role options from the local permission rules (no extra API call needed — derive from `currentRoom.role`). On selection:

```js
async function handleAssignRole(targetUsername, role) {
  const { ok, data } = await apiRequest(
    'PUT',
    `/rooms/${currentRoom.code}/members/${targetUsername}/role`,
    { role }
  );
  if (!ok) { showRoomError(data?.error ?? 'Could not assign role'); return; }
  // SSE role_changed event will update the member list
}
```

---

## 6. SSE

### 6.1 Opening the connection

```js
let sseSource = null;
let sseConnected = false;

function openSSE(code) {
  if (sseSource) sseSource.close();
  const url = `${API_BASE}/rooms/${code}/events`;
  // EventSource does not support custom headers; pass token as query param
  sseSource = new EventSource(`${url}?token=${encodeURIComponent(authToken)}`);

  sseSource.addEventListener('connected', (e) => {
    const data = JSON.parse(e.data);
    currentRoom.members = data.members;
    currentRoom.role = data.role;
    sseConnected = true;
    updateConnectionIndicator('green');
    renderOnlineView();
    // Overwrite local lists with server state on reconnect
    localStorage.setItem('pokeroulette_lists', JSON.stringify(data.lists));
    rerenderLists();
  });

  sseSource.addEventListener('lists_updated', (e) => {
    const data = JSON.parse(e.data);
    if (data.updated_by === authUsername) return; // ignore own updates
    localStorage.setItem('pokeroulette_lists', JSON.stringify(data.lists));
    rerenderLists();
  });

  sseSource.addEventListener('member_joined', (e) => {
    const data = JSON.parse(e.data);
    currentRoom.members.push({ user_id: data.user_id, role: data.role });
    renderOnlineView();
  });

  sseSource.addEventListener('member_left', (e) => {
    const data = JSON.parse(e.data);
    currentRoom.members = currentRoom.members.filter(m => m.user_id !== data.user_id);
    renderOnlineView();
  });

  sseSource.addEventListener('role_changed', (e) => {
    const data = JSON.parse(e.data);
    const member = currentRoom.members.find(m => m.user_id === data.user_id);
    if (member) member.role = data.role;
    // If the local user's role changed, update currentRoom.role
    if (data.user_id === authUsername) currentRoom.role = data.role;
    renderOnlineView();
  });

  sseSource.addEventListener('room_closed', (e) => {
    const data = JSON.parse(e.data);
    closeSSE();
    currentRoom = null;
    showNotification(`Room was closed by ${data.closed_by}`);
    renderOnlineView();
  });

  sseSource.onerror = () => {
    sseConnected = false;
    updateConnectionIndicator('amber');
    // EventSource reconnects automatically; wait for next 'connected' event
  };
}
```

> **Note:** `EventSource` does not support custom request headers. The backend must accept the JWT via a `?token=` query parameter on the SSE endpoint, in addition to (or instead of) the `Authorization` header.

### 6.2 Closing the connection

```js
function closeSSE() {
  if (sseSource) {
    sseSource.close();
    sseSource = null;
  }
  sseConnected = false;
}
```

---

## 7. connectToRoom Helper

Used after creating a room (where join response isn't received):

```js
async function connectToRoom(code) {
  // After creating, fetch current state via join (idempotent)
  const { ok, data } = await apiRequest('POST', `/rooms/${code}/join`);
  if (!ok) return;
  currentRoom = { code, role: data.role, members: data.members };
  openSSE(code);
  renderOnlineView();
}
```

---

## 8. Backend SSE Token Note

Add the following note to the backend implementation: the `GET /api/v1/rooms/{code}/events` endpoint must accept the JWT via `?token=<jwt>` query parameter because the browser `EventSource` API does not support custom headers. The token should be validated the same way as the `Authorization` header.

---

## 9. What Does Not Change

- All single-player logic (roulette, silhouette, detail, duplicate resolver) is unchanged.
- `saveLists` still writes to `localStorage` as before; the sync push is purely additive.
- Config, hints, and generation settings remain local and are never sent to the server.
- The import/export feature continues to work as before, operating on local state only.
