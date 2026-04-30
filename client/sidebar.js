import { state, TYPE_COLORS, SIDEBAR_KEY, COLLAPSE_KEY } from './state.js';
import { matchPokemon, validateAll } from './pokemon.js';
import { buildWheel } from './wheel.js';
import { showDetail, showDuplicateResolver, returnToRoulette } from './screens.js';
import { saveLists } from './lists.js';

let dragData = null;

// ── SIDEBAR COLLAPSE ──

export function loadSidebarState() {
  state.sidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === 'true';
  applySidebarState();
}

export function applySidebarState() {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('sidebar-toggle');
  if (state.sidebarCollapsed) {
    sidebar.classList.add('collapsed');
    btn.textContent = '‹';
    btn.title = 'Expand sidebar';
  } else {
    sidebar.classList.remove('collapsed');
    btn.textContent = '›';
    btn.title = 'Collapse sidebar';
  }
}

export function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  localStorage.setItem(SIDEBAR_KEY, state.sidebarCollapsed);
  applySidebarState();
}

// ── PANEL COLLAPSE ──

export function loadPanelCollapseState() {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) Object.assign(state.panelCollapsed, JSON.parse(raw));
  } catch(e) {}
  for (const listName of ['pool', 'done', 'todo']) {
    applyPanelCollapse(listName);
  }
}

export function applyPanelCollapse(listName) {
  document.getElementById(`panel-${listName}`)
    .classList.toggle('collapsed', state.panelCollapsed[listName]);
}

export function togglePanelCollapse(listName) {
  if (state.editMode[listName]) return;
  state.panelCollapsed[listName] = !state.panelCollapsed[listName];
  applyPanelCollapse(listName);
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state.panelCollapsed));
}

// ── LIST ACTIONS ──

export function movePokemon(p, targetList) {
  for (const ln of ['pool', 'done', 'todo']) {
    state.lists[ln] = state.lists[ln].filter(raw => {
      const matched = matchPokemon(raw);
      return !matched || matched.id !== p.id;
    });
  }
  state.lists[targetList].push(p.name);
  saveLists();
  validateAll();
  renderSidebar();
}

// ── SIDEBAR RENDERING ──

export function renderSidebar() {
  for (const listName of ['pool', 'done', 'todo']) {
    if (state.editMode[listName]) continue;
    renderList(listName);
  }
  renderRoomIndicator();
}

export function renderRoomIndicator() {
  const bar = document.getElementById('room-indicator');
  if (!state.currentRoom) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = '';

  const dot = document.createElement('span');
  dot.className = `online-conn-dot ${state.sseConnected ? 'green' : 'amber'}`;

  const label = document.createElement('span');
  label.textContent = 'Room\u00a0';

  const code = document.createElement('span');
  code.className = 'room-ind-code';
  code.textContent = state.currentRoom.code;

  const role = document.createElement('span');
  role.className = `online-role-badge role-${state.currentRoom.role} room-ind-role`;
  role.textContent = state.currentRoom.role;

  bar.append(dot, label, code, role);
}

export function matchesFilter(entry) {
  if (state.filters.name) {
    const q = state.filters.name.toLowerCase();
    const displayName = entry.pokemon ? entry.pokemon.name.toLowerCase() : '';
    const rawName = entry.raw.toLowerCase();
    if (!displayName.includes(q) && !rawName.includes(q)) return false;
  }
  return true;
}

export function renderList(listName) {
  const body = document.getElementById(`body-${listName}`);
  const entries = state.validatedEntries[listName];

  const visible = entries.filter(e => matchesFilter(e)).sort((a, b) => {
    const aErr = a.status !== 'valid', bErr = b.status !== 'valid';
    if (aErr !== bErr) return aErr ? -1 : 1;
    if (state.sortOrder === 'none' || !a.pokemon || !b.pokemon) return 0;
    const dir = state.sortAsc ? 1 : -1;
    if (state.sortOrder === 'name') return dir * a.pokemon.name.localeCompare(b.pokemon.name);
    if (state.sortOrder === 'type') {
      const t = a.pokemon.type1.localeCompare(b.pokemon.type1);
      if (t !== 0) return dir * t;
      return dir * (a.pokemon.type2 || '').localeCompare(b.pokemon.type2 || '');
    }
    return dir * (a.pokemon.id - b.pokemon.id);
  });

  document.getElementById(`count-${listName}`).textContent =
    `${visible.length} / ${entries.length}`;

  const doFlip = state.animateNextRender;
  const oldTops = new Map();
  if (doFlip) {
    body.querySelectorAll('.entry-row[data-pokemon-id]').forEach(r => {
      oldTops.set(r.dataset.pokemonId, r.getBoundingClientRect().top);
    });
  }

  body.innerHTML = '';

  for (const entry of visible) {
    const row = document.createElement('div');
    row.className = 'entry-row' + (entry.status !== 'valid' ? ` ${entry.status}` : '');

    if (entry.status === 'valid' || entry.status === 'duplicate') {
      if (entry.pokemon) row.dataset.pokemonId = entry.pokemon.id;
      if (entry.status === 'valid') {
        if (state.currentScreen === 'roulette') {
          row.draggable = true;
          row.dataset.fromList = listName;
        }
      }
      if (entry.pokemon) {
        if (state.currentScreen !== 'roulette') row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          if (row.classList.contains('active')) {
            row.classList.remove('active');
            returnToRoulette();
            return;
          }
          document.querySelectorAll('.entry-row.active').forEach(r => r.classList.remove('active'));
          row.classList.add('active');
          state.selectedPokemon = entry.pokemon;
          state.selectedPokemonIsDuplicate = entry.status === 'duplicate';
          state.detailOpenedFromList = true;
          showDetail();
        });
      }
    }

    const dot = document.createElement('div');
    dot.className = 'type-dot';
    if (entry.pokemon) {
      const c1 = TYPE_COLORS[entry.pokemon.type1] || '#888';
      if (entry.pokemon.type2) {
        dot.classList.add('split');
        dot.style.setProperty('--c1', c1);
        dot.style.setProperty('--c2', TYPE_COLORS[entry.pokemon.type2] || '#888');
      } else {
        dot.style.background = c1;
      }
    } else {
      dot.style.background = '#555';
    }
    row.appendChild(dot);

    const name = document.createElement('div');
    name.className = 'entry-name';
    name.textContent = entry.pokemon ? entry.pokemon.name : entry.raw;
    row.appendChild(name);

    if (entry.pokemon) {
      const gen = document.createElement('div');
      gen.className = 'entry-gen';
      gen.textContent = `G${entry.pokemon.gen}`;
      row.appendChild(gen);
    }

    if (entry.status === 'unknown') {
      const err = document.createElement('div');
      err.className = 'entry-error';
      err.textContent = '?';
      err.title = `Unknown: "${entry.raw}"`;
      row.appendChild(err);
    } else if (entry.status === 'duplicate') {
      const err = document.createElement('div');
      err.className = 'entry-dup-error';
      err.textContent = '⚠';
      err.title = 'Resolve duplicate';
      err.style.cursor = 'pointer';
      err.addEventListener('click', (e) => {
        e.stopPropagation();
        showDuplicateResolver();
      });
      row.appendChild(err);
    }

    if (row.draggable) {
      row.addEventListener('dragstart', onDragStart);
      row.addEventListener('dragend', onDragEnd);
    }

    body.appendChild(row);
  }

  if (state.currentScreen === 'roulette') {
    setupDropZones(body, listName);
  }

  if (doFlip) {
    state.animateNextRender = false;
    body.querySelectorAll('.entry-row[data-pokemon-id]').forEach(row => {
      const oldTop = oldTops.get(row.dataset.pokemonId);
      if (oldTop === undefined) return;
      const delta = oldTop - row.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) return;
      row.style.transform = `translateY(${delta}px)`;
      row.style.transition = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        row.style.transition = 'transform 0.2s ease';
        row.style.transform = '';
        row.addEventListener('transitionend', () => {
          row.style.transform = '';
          row.style.transition = '';
        }, { once: true });
      }));
    });
  }
}

// ── DRAG & DROP ──

function onDragStart(e) {
  const row = e.currentTarget;
  dragData = {
    pokemonId: parseInt(row.dataset.pokemonId),
    fromList: row.dataset.fromList,
  };
  row.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', row.dataset.pokemonId);
  document.getElementById('wheel-group').style.animationPlayState = 'paused';
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  dragData = null;
  document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-active'));
  document.getElementById('wheel-group').style.animationPlayState = '';
}

function setupDropZones(body, listName) {
  const rows = body.querySelectorAll('.entry-row');

  const makeZone = (beforeRow) => {
    const zone = document.createElement('div');
    zone.className = 'drop-zone';
    zone.dataset.targetList = listName;

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-active');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-active');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('drag-active');
      if (!dragData) return;
      const insertBeforeId = beforeRow ? parseInt(beforeRow.dataset.pokemonId) : null;
      handleDrop(listName, dragData, insertBeforeId);
    });

    if (beforeRow) {
      body.insertBefore(zone, beforeRow);
    } else {
      body.appendChild(zone);
    }
  };

  [...rows].forEach(row => makeZone(row));
  makeZone(null);

  body.addEventListener('dragover', (e) => e.preventDefault());
  body.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!dragData) return;
    handleDrop(listName, dragData, null);
  });
}

function handleDrop(targetList, data, insertBeforeId) {
  const p = state.allPokemon.find(p => p.id === data.pokemonId);
  if (!p) return;

  if (data.fromList === targetList) {
    if (state.sortOrder !== 'none') return;
    const lst = state.lists[targetList];
    const fromIdx = lst.findIndex(raw => matchPokemon(raw)?.id === p.id);
    if (fromIdx === -1) return;
    lst.splice(fromIdx, 1);
    if (insertBeforeId !== null) {
      const toIdx = lst.findIndex(raw => matchPokemon(raw)?.id === insertBeforeId);
      toIdx === -1 ? lst.push(p.name) : lst.splice(toIdx, 0, p.name);
    } else {
      lst.push(p.name);
    }
    saveLists();
    validateAll();
    state.animateNextRender = true;
    renderSidebar();
    return;
  }

  movePokemon(p, targetList);
  buildWheel();
}

// ── EDIT MODE ──

export function enterEditMode(listName) {
  if (state.currentScreen !== 'roulette') return;

  if (state.panelCollapsed[listName]) togglePanelCollapse(listName);

  state.editMode[listName] = true;

  const body = document.getElementById(`body-${listName}`);
  const btn = document.getElementById(`edit-${listName}`);
  btn.textContent = '✓ Done';
  btn.classList.remove('is-pen');

  const filteredIn  = state.validatedEntries[listName].filter(e =>  matchesFilter(e));
  const filteredOut = state.validatedEntries[listName].filter(e => !matchesFilter(e));
  state.editModeFilteredOut[listName] = filteredOut.map(e => e.raw);

  const textarea = document.createElement('textarea');
  textarea.className = 'list-textarea';
  textarea.value = filteredIn.map(e => e.raw).join('\n');
  body.innerHTML = '';
  body.appendChild(textarea);
  textarea.focus();
}

export function exitEditMode(listName) {
  if (!state.editMode[listName]) return;
  const body = document.getElementById(`body-${listName}`);
  const textarea = body.querySelector('textarea');
  if (textarea) {
    const editedLines = textarea.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    state.lists[listName] = [...state.editModeFilteredOut[listName], ...editedLines];
  }
  state.editMode[listName] = false;
  state.editModeFilteredOut[listName] = [];

  const btn = document.getElementById(`edit-${listName}`);
  btn.innerHTML = '<span class="pen-icon">✏</span>';
  btn.classList.add('is-pen');

  saveLists();
  validateAll();
  renderSidebar();
  buildWheel();
}
