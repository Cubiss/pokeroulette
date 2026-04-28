import { state, API_BASE, STORAGE_KEY, ROOM_CODE_KEY, applyColors } from './state.js';
import { validateAll } from './pokemon.js';
import { buildWheel } from './wheel.js';
import { renderSidebar, renderRoomIndicator } from './sidebar.js';
import { buildConfigPanel, loadConfig } from './config.js';

function applyRoomConfig(config) {
  console.log('[applyRoomConfig] called with', config);
  if (!config || typeof config !== 'object' || Object.keys(config).length === 0) {
    console.log('[applyRoomConfig] early return — config empty or invalid');
    return;
  }
  state.config = config;
  if (config.colors) {
    console.log('[applyRoomConfig] applying colors', config.colors);
    applyColors(config.colors);
  } else {
    console.log('[applyRoomConfig] no colors field');
  }
  buildConfigPanel();
}

function restoreLocalConfig() {
  loadConfig();       // re-reads localStorage, applies colors
  buildConfigPanel(); // rebuild UI without guest-lock
}

let sseSource = null;

// ── API HELPER ──

export async function apiRequest(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.authToken) headers['Authorization'] = `Bearer ${state.authToken}`;
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    const refreshed = res.headers.get('X-Refreshed-Token');
    if (refreshed) setAuth(refreshed, state.authUsername);
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return { ok: res.ok, status: res.status, data };
  } catch (_) {
    return { ok: false, status: 0, data: null };
  }
}

// ── SSE ──

export function openSSE(code) {
  if (sseSource) sseSource.close();
  const url = `${API_BASE}/rooms/${code}/events`;
  sseSource = new EventSource(`${url}?token=${encodeURIComponent(state.authToken)}`);

  sseSource.addEventListener('connected', (e) => {
    const data = JSON.parse(e.data);
    state.currentRoom.members = data.members;
    state.currentRoom.role = data.role;
    state.sseConnected = true;
    if (data.config) applyRoomConfig(data.config);
    renderOnlineView();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.lists));
    state.lists = data.lists;
    validateAll();
    renderSidebar();
    buildWheel();
  });

  sseSource.addEventListener('lists_updated', (e) => {
    const data = JSON.parse(e.data);
    if (data.updated_by === state.authUsername) return;
    state.lists = data.lists;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.lists));
    validateAll();
    renderSidebar();
    buildWheel();
  });

  sseSource.addEventListener('member_joined', (e) => {
    const data = JSON.parse(e.data);
    state.currentRoom.members.push({ user_id: data.user_id, role: data.role });
    renderOnlineView();
  });

  sseSource.addEventListener('member_left', (e) => {
    const data = JSON.parse(e.data);
    state.currentRoom.members = state.currentRoom.members.filter(m => m.user_id !== data.user_id);
    renderOnlineView();
  });

  sseSource.addEventListener('role_changed', (e) => {
    const data = JSON.parse(e.data);
    const member = state.currentRoom.members.find(m => m.user_id === data.user_id);
    if (member) member.role = data.role;
    if (data.user_id === state.authUsername) state.currentRoom.role = data.role;
    renderOnlineView();
  });

  sseSource.addEventListener('config_updated', (e) => {
    const data = JSON.parse(e.data);
    if (data.updated_by === state.authUsername) return;
    applyRoomConfig(data.config);
  });

  sseSource.addEventListener('room_closed', (e) => {
    const data = JSON.parse(e.data);
    closeSSE();
    setRoom(null);
    restoreLocalConfig();
    showNotification(`Room was closed by ${data.closed_by}`);
    renderOnlineView();
  });

  sseSource.onerror = () => {
    state.sseConnected = false;
    renderOnlineView();
  };
}

export function closeSSE() {
  if (sseSource) { sseSource.close(); sseSource = null; }
  state.sseConnected = false;
}

// ── CONNECT HELPER ──

export async function connectToRoom(code) {
  const { ok, data } = await apiRequest('POST', `/rooms/${code}/join`);
  if (!ok) return;
  setRoom({ code, role: data.role, members: data.members });
  if (data.config) applyRoomConfig(data.config);
  openSSE(code);
  renderOnlineView();
}

// ── NOTIFICATION ──

function showNotification(msg) {
  const el = document.createElement('div');
  el.className = 'online-notification';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ── ROLE BADGE ──

function roleBadge(role) {
  const span = document.createElement('span');
  span.className = `online-role-badge role-${role}`;
  span.textContent = role;
  return span;
}

// ── RENDER ──

export function renderOnlineView() {
  renderRoomIndicator();
  if (state.currentTab !== 'online') return;
  if (!state.authToken)       renderAuthSection();
  else if (!state.currentRoom) renderRoomSection();
  else                         renderActiveRoomSection();
}

function renderAuthSection() {
  const container = document.getElementById('view-online');
  let activeSubtab = 'signin';
  let savedUsername = '';
  let savedPassword = '';

  function render() {
    container.innerHTML = '';
    const tabRow = el('div', 'online-tabs');
    const sinBtn = el('button', `online-tab${activeSubtab === 'signin' ? ' active' : ''}`, 'Sign In');
    const regBtn = el('button', `online-tab${activeSubtab === 'register' ? ' active' : ''}`, 'Register');
    sinBtn.addEventListener('click', () => {
      savedUsername = userInput.value;
      savedPassword = passInput.value;
      activeSubtab = 'signin';
      render();
    });
    regBtn.addEventListener('click', () => {
      savedUsername = userInput.value;
      savedPassword = passInput.value;
      activeSubtab = 'register';
      render();
    });
    tabRow.append(sinBtn, regBtn);
    container.appendChild(tabRow);

    const errDiv = el('div', 'online-error');

    const userField = el('div', 'online-field');
    const userLabel = el('label', 'online-label', 'Username');
    const userInput = elInput('text', 'online-input', 'username');
    userInput.value = savedUsername;
    userField.append(userLabel, userInput);

    const passField = el('div', 'online-field');
    const passLabel = el('label', 'online-label', 'Password');
    const passInput = elInput('password', 'online-input', '');
    passInput.value = savedPassword;
    passField.append(passLabel, passInput);

    container.append(userField, passField);

    let confirmInput = null;
    if (activeSubtab === 'register') {
      const confirmField = el('div', 'online-field');
      const confirmLabel = el('label', 'online-label', 'Confirm password');
      confirmInput = elInput('password', 'online-input', '');
      confirmField.append(confirmLabel, confirmInput);
      container.appendChild(confirmField);
    }

    const btnLabel = activeSubtab === 'signin' ? 'Sign In' : 'Register';
    const submitBtn = el('button', 'online-btn online-btn-primary', btnLabel);

    submitBtn.addEventListener('click', async () => {
      errDiv.textContent = '';
      const u = userInput.value.trim();
      const p = passInput.value;
      if (!u || !p) { errDiv.textContent = 'Username and password required'; return; }
      if (activeSubtab === 'register') {
        if (confirmInput.value !== p) { errDiv.textContent = 'Passwords do not match'; return; }
      }
      submitBtn.disabled = true;
      if (activeSubtab === 'signin') await handleSignIn(u, p, errDiv);
      else await handleRegister(u, p, errDiv);
      submitBtn.disabled = false;
    });

    container.append(submitBtn, errDiv);
  }

  render();
}

function renderRoomSection() {
  const container = document.getElementById('view-online');
  container.innerHTML = '';

  const greeting = el('div', 'online-greeting');
  greeting.innerHTML = `Signed in as <b>${state.authUsername}</b>`;
  container.appendChild(greeting);
  container.appendChild(el('hr', 'online-divider'));

  // Create room
  container.appendChild(el('div', 'online-section-title', 'Create Room'));
  const codeField = el('div', 'online-field');
  const codeLabel = el('label', 'online-label', 'Room code');
  const codeInput = elInput('text', 'online-input', 'my-room');
  const createBtn = el('button', 'online-btn online-btn-primary', 'Create');
  const createErr = el('div', 'online-error');
  createBtn.disabled = true;

  codeInput.addEventListener('input', () => {
    codeInput.value = sanitizeRoomCodeLive(codeInput.value);
    createBtn.disabled = !isValidRoomCode(codeInput.value);
  });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') createBtn.click(); });
  createBtn.addEventListener('click', async () => {
    createBtn.disabled = true;
    createErr.textContent = '';
    await handleCreateRoom(codeInput.value, createErr);
    createBtn.disabled = !isValidRoomCode(codeInput.value);
  });
  codeField.append(codeLabel, codeInput);
  container.append(codeField, createBtn, createErr);
  container.appendChild(el('hr', 'online-divider'));

  // Join room
  container.appendChild(el('div', 'online-section-title', 'Join Room'));
  const joinField = el('div', 'online-field');
  const joinLabel = el('label', 'online-label', 'Room code');
  const joinInput = elInput('text', 'online-input', 'enter code');
  if (state.pendingRoomCode) joinInput.value = state.pendingRoomCode;
  const joinBtn = el('button', 'online-btn online-btn-primary', 'Join');
  const joinErr = el('div', 'online-error');
  joinInput.addEventListener('input', () => {
    joinInput.value = sanitizeRoomCodeLive(joinInput.value);
  });
  joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click(); });
  joinBtn.addEventListener('click', async () => {
    joinBtn.disabled = true;
    joinErr.textContent = '';
    await handleJoinRoom(sanitizeRoomCode(joinInput.value), joinErr);
    joinBtn.disabled = false;
  });
  joinField.append(joinLabel, joinInput);
  container.append(joinField, joinBtn, joinErr);
  container.appendChild(el('hr', 'online-divider'));

  const chgPassBtn = el('button', 'online-link-btn', 'Change password');
  chgPassBtn.addEventListener('click', () => showChangePasswordModal());
  const signOutBtn = el('button', 'online-btn online-btn-danger', 'Sign Out');
  signOutBtn.addEventListener('click', handleSignOut);
  container.append(chgPassBtn, signOutBtn);
}

function renderActiveRoomSection() {
  const container = document.getElementById('view-online');
  container.innerHTML = '';

  const hdr = el('div', 'online-room-header');
  const codeSpan = el('span', 'online-room-code', state.currentRoom.code);
  const copyBtn = el('button', 'online-copy-btn', '⎘ Copy');
  copyBtn.addEventListener('click', () =>
    navigator.clipboard?.writeText(state.currentRoom.code).catch(() => {}));
  const connDot = el('span', `online-conn-dot${state.sseConnected ? ' green' : ' amber'}`);
  hdr.append(codeSpan, copyBtn, connDot);
  container.appendChild(hdr);

  const myRoleRow = el('div', 'online-member-row');
  myRoleRow.appendChild(el('span', 'online-member-name', 'Your role:'));
  myRoleRow.appendChild(roleBadge(state.currentRoom.role));
  container.appendChild(myRoleRow);

  container.appendChild(el('hr', 'online-divider'));
  container.appendChild(el('div', 'online-section-title', 'Members'));

  for (const member of state.currentRoom.members) {
    const row = el('div', 'online-member-row');
    const nameSpan = el('span', 'online-member-name', member.user_id);
    row.append(nameSpan, roleBadge(member.role));
    if (member.user_id === state.authUsername) {
      row.appendChild(el('span', 'online-member-you', '(you)'));
    } else if (canAssignRoles()) {
      const menuDiv = el('div', 'online-member-menu');
      const menuBtn = el('button', 'online-member-menu-btn', '…');
      let dropOpen = false;
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropOpen = !dropOpen;
        if (dropOpen) {
          const drop = el('div', 'online-dropdown');
          for (const role of getAssignableRoles()) {
            if (role === member.role) continue;
            const item = el('button', 'online-dropdown-item', `Set ${role}`);
            item.addEventListener('click', async () => {
              drop.remove();
              await handleAssignRole(member.user_id, role);
            });
            drop.appendChild(item);
          }
          menuDiv.appendChild(drop);
          document.addEventListener('click', () => drop.remove(), { once: true });
        }
      });
      menuDiv.appendChild(menuBtn);
      row.appendChild(menuDiv);
    }
    container.appendChild(row);
  }

  container.appendChild(el('hr', 'online-divider'));

  const roomErr = el('div', 'online-error');

  const leaveBtn = el('button', 'online-btn online-btn-secondary', 'Leave Room');
  const otherCount = state.currentRoom.members.filter(m => m.user_id !== state.authUsername).length;
  if (state.currentRoom.role === 'host' && otherCount > 0) {
    leaveBtn.disabled = true;
    leaveBtn.title = 'Transfer host role before leaving';
  }
  leaveBtn.addEventListener('click', async () => {
    leaveBtn.disabled = true;
    roomErr.textContent = '';
    await handleLeaveRoom(roomErr);
    leaveBtn.disabled = false;
  });
  container.appendChild(leaveBtn);

  if (state.currentRoom.role === 'host') {
    const closeBtn = el('button', 'online-btn online-btn-danger', 'Close Room');
    closeBtn.addEventListener('click', async () => {
      if (!confirm('Close this room for all members?')) return;
      closeBtn.disabled = true;
      await handleCloseRoom(roomErr);
    });
    container.appendChild(closeBtn);
  }
  container.appendChild(roomErr);
}

// ── DOM HELPERS ──

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function elInput(type, className, placeholder) {
  const e = document.createElement('input');
  e.type = type;
  e.className = className;
  e.placeholder = placeholder;
  return e;
}

// ── ROOM CODE HELPERS ──

export function sanitizeRoomCodeLive(raw) {
  return raw
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '');
}

export function sanitizeRoomCode(raw) {
  return sanitizeRoomCodeLive(raw).replace(/-+$/, '');
}

export function isValidRoomCode(code) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(code) && code.length >= 3 && code.length <= 32;
}

// ── ROLE HELPERS ──

function canAssignRoles() {
  return state.currentRoom.role === 'host' || state.currentRoom.role === 'moderator';
}

function getAssignableRoles() {
  if (state.currentRoom.role === 'host')      return ['host', 'moderator', 'guest'];
  if (state.currentRoom.role === 'moderator') return ['guest'];
  return [];
}

// ── AUTH STATE ──

export function setAuth(token, username) {
  state.authToken = token;
  state.authUsername = username;
  if (token) {
    localStorage.setItem('pokeroulette_auth_token', token);
    localStorage.setItem('pokeroulette_auth_user', username);
  } else {
    localStorage.removeItem('pokeroulette_auth_token');
    localStorage.removeItem('pokeroulette_auth_user');
  }
}

export function setRoom(room) {
  state.currentRoom = room;
  if (room) {
    localStorage.setItem(ROOM_CODE_KEY, room.code);
    history.replaceState(null, '', '#' + room.code);
  } else {
    localStorage.removeItem(ROOM_CODE_KEY);
    history.replaceState(null, '', window.location.pathname);
  }
}

// ── AUTH HANDLERS ──

async function handleSignIn(username, password, errDiv) {
  const { ok, data } = await apiRequest('POST', '/auth/login', { username, password });
  if (!ok) { errDiv.textContent = data?.error ?? 'Sign in failed'; return; }
  setAuth(data.token, username);
  await tryAutoJoin() || renderOnlineView();
}

async function handleRegister(username, password, errDiv) {
  const { ok, data } = await apiRequest('POST', '/auth/register', { username, password });
  if (!ok) { errDiv.textContent = data?.error ?? 'Registration failed'; return; }
  setAuth(data.token, username);
  await tryAutoJoin() || renderOnlineView();
}

async function tryAutoJoin() {
  if (!state.pendingRoomCode) return false;
  const code = state.pendingRoomCode;
  state.pendingRoomCode = null;
  await handleJoinRoom(code, { set textContent(v) {} });
  return true;
}

function handleSignOut() {
  setAuth(null, null);
  closeSSE();
  setRoom(null);
  renderOnlineView();
}

function showChangePasswordModal() {
  const overlay = el('div', 'online-modal-overlay');
  const modal = el('div', 'online-modal');

  modal.appendChild(el('div', 'online-modal-title', 'Change Password'));

  const curField = el('div', 'online-field');
  const curLabel = el('label', 'online-label', 'Current password');
  const curInput = elInput('password', 'online-input', '');
  curField.append(curLabel, curInput);

  const newField = el('div', 'online-field');
  const newLabel = el('label', 'online-label', 'New password');
  const newInput = elInput('password', 'online-input', '');
  newField.append(newLabel, newInput);

  const errDiv = el('div', 'online-error');
  const confirmBtn = el('button', 'online-btn online-btn-primary', 'Change Password');
  const cancelBtn  = el('button', 'online-btn online-btn-secondary', 'Cancel');

  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    errDiv.textContent = '';
    await handleChangePassword(curInput.value, newInput.value, errDiv, overlay);
    confirmBtn.disabled = false;
  });
  cancelBtn.addEventListener('click', () => overlay.remove());

  modal.append(curField, newField, errDiv, confirmBtn, cancelBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

async function handleChangePassword(currentPassword, newPassword, errDiv, overlay) {
  const { ok, data } = await apiRequest('PUT', '/auth/password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
  if (!ok) { errDiv.textContent = data?.error ?? 'Failed to change password'; return; }
  setAuth(null, null);
  setRoom(null);
  closeSSE();
  overlay.remove();
  renderOnlineView();
}

// ── ROOM HANDLERS ──

async function handleCreateRoom(code, errDiv) {
  const roomLists = JSON.parse(localStorage.getItem(STORAGE_KEY)) || state.lists;
  const { ok, data } = await apiRequest('POST', '/rooms', { code, lists: roomLists, config: state.config });
  if (!ok) { errDiv.textContent = data?.error ?? 'Could not create room'; return; }
  await connectToRoom(code);
}

async function handleJoinRoom(code, errDiv) {
  const { ok, data } = await apiRequest('POST', `/rooms/${code}/join`);
  if (!ok) { errDiv.textContent = data?.error ?? 'Could not join room'; return; }
  state.lists = data.lists;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data.lists));
  setRoom({ code, role: data.role, members: data.members });
  if (data.config) applyRoomConfig(data.config);
  openSSE(code);
  renderOnlineView();
  validateAll();
  renderSidebar();
  buildWheel();
}

async function handleLeaveRoom(errDiv) {
  const { ok, data } = await apiRequest('POST', `/rooms/${state.currentRoom.code}/leave`);
  if (!ok) { errDiv.textContent = data?.error ?? 'Could not leave room'; return; }
  closeSSE();
  setRoom(null);
  restoreLocalConfig();
  renderOnlineView();
}

async function handleCloseRoom(errDiv) {
  const { ok, data } = await apiRequest('DELETE', `/rooms/${state.currentRoom.code}`);
  if (!ok) { errDiv.textContent = data?.error ?? 'Could not close room'; return; }
  closeSSE();
  setRoom(null);
  restoreLocalConfig();
  renderOnlineView();
}

async function handleAssignRole(targetUsername, role) {
  const { ok, data } = await apiRequest(
    'PUT',
    `/rooms/${state.currentRoom.code}/members/${targetUsername}/role`,
    { role }
  );
  if (!ok) { showNotification(data?.error ?? 'Could not assign role'); }
}
