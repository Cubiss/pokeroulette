import { state, PRESETS, DEFAULT_COLORS, CONFIG_KEY, STORAGE_KEY, SIDEBAR_KEY, applyColors } from './state.js';
import { openColorPicker } from './colorpicker.js';
import { validateAll } from './pokemon.js';
import { buildWheel } from './wheel.js';
import { renderSidebar, applySidebarState } from './sidebar.js';
import { saveLists } from './lists.js';
import { renderOnlineView, apiRequest } from './online.js';

export { applyColors };

export function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.hints)            state.config.hints  = { ...state.config.hints, ...saved.hints };
      if (saved.gens !== undefined) state.config.gens  = saved.gens;
      if (saved.colors)           state.config.colors = { ...DEFAULT_COLORS, ...saved.colors };
    }
  } catch(e) {}
  applyColors(state.config.colors);
}

export function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
  if (state.currentRoom && state.currentRoom.role !== 'guest') {
    apiRequest('PUT', `/rooms/${state.currentRoom.code}/config`, { config: state.config });
  }
}

function isConfigLocked() {
  return state.currentRoom !== null && state.currentRoom.role === 'guest';
}

export function buildConfigPanel() {
  const locked = isConfigLocked();

  // Guest notice
  const view = document.getElementById('view-config');
  view.querySelectorAll('.config-guest-notice').forEach(n => n.remove());
  if (locked) {
    const notice = document.createElement('div');
    notice.className = 'config-guest-notice';
    notice.textContent = 'Config is controlled by the host/moderator in this room.';
    view.prepend(notice);
  }

  const allGens = [...new Set(state.allPokemon.map(p => p.gen))].sort((a, b) => a - b);

  if (state.config.gens === null) {
    state.config.gens = allGens;
    saveConfig();
  }

  // Gen checkboxes
  const container = document.getElementById('gen-checkboxes');
  container.innerHTML = '';
  for (const gen of allGens) {
    const label = document.createElement('label');
    label.className = 'gen-check-label' + (state.config.gens.includes(gen) ? ' selected' : '');
    if (locked) label.classList.add('config-locked');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = gen;
    cb.checked = state.config.gens.includes(gen);
    cb.disabled = locked;
    if (!locked) cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!state.config.gens.includes(gen)) state.config.gens.push(gen);
      } else {
        state.config.gens = state.config.gens.filter(g => g !== gen);
      }
      label.classList.toggle('selected', cb.checked);
      saveConfig();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(`Gen ${gen}`));
    container.appendChild(label);
  }

  // Hint radio selected states
  for (const key of ['name', 'sprite', 'types', 'gen', 'dex']) {
    document.querySelectorAll(`input[name="hint-${key}"]`).forEach(radio => {
      const isSelected = radio.value === state.config.hints[key];
      radio.checked = isSelected;
      radio.disabled = locked;
      radio.closest('.hint-radio-label').classList.toggle('selected', isSelected);
    });
  }

  // Theme presets
  const presetsEl = document.getElementById('theme-presets');
  presetsEl.innerHTML = '';
  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'theme-swatch';
    btn.title = p.label;
    btn.style.background = `linear-gradient(135deg, ${p.surface2} 50%, ${p.bg} 50%)`;
    btn.style.borderColor = p.border;
    btn.style.setProperty('--swatch-text', p.text);
    btn.textContent = p.label;
    btn.disabled = locked;
    if (!locked) btn.addEventListener('click', () => {
      state.config.colors = { ...p };
      saveConfig();
      applyColors(state.config.colors);
      buildConfigPanel();
    });
    presetsEl.appendChild(btn);
  }

  // Color pickers
  const COLOR_FIELDS = [
    { key: 'bg',       label: 'Background' },
    { key: 'surface',  label: 'Surface' },
    { key: 'surface2', label: 'Surface 2' },
    { key: 'text',     label: 'Text' },
    { key: 'textDim',  label: 'Text dim' },
    { key: 'border',   label: 'Border' },
  ];
  const pickersEl = document.getElementById('theme-pickers');
  pickersEl.innerHTML = '';
  for (const { key, label } of COLOR_FIELDS) {
    const row = document.createElement('div');
    row.className = 'color-picker-row';

    const lbl = document.createElement('span');
    lbl.className = 'color-picker-label';
    lbl.textContent = label;

    const swatch = document.createElement('button');
    swatch.className = 'color-picker-swatch';
    swatch.style.background = state.config.colors[key];
    swatch.title = 'Pick colour';

    const hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'color-picker-hex online-input';
    hex.value = state.config.colors[key];
    hex.maxLength = 7;
    hex.spellcheck = false;

    const update = (val) => {
      state.config.colors[key] = val;
      swatch.style.background = val;
      hex.value = val;
      saveConfig();
      applyColors(state.config.colors);
    };

    swatch.disabled = locked;
    hex.disabled = locked;
    if (!locked) {
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorPicker(swatch, state.config.colors[key], update);
      });
      hex.addEventListener('input', () => {
        const v = hex.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) update(v);
      });
      hex.addEventListener('blur', () => { hex.value = state.config.colors[key]; });
    }

    row.append(lbl, swatch, hex);
    pickersEl.appendChild(row);
  }
}

export function switchTab(name) {
  state.currentTab = name;
  document.getElementById('view-lists').style.display  = name === 'lists'  ? 'flex' : 'none';
  document.getElementById('view-config').style.display = name === 'config' ? 'flex' : 'none';
  document.getElementById('view-online').style.display = name === 'online' ? 'flex' : 'none';
  document.getElementById('tab-lists').classList.toggle('active',  name === 'lists');
  document.getElementById('tab-config').classList.toggle('active', name === 'config');
  document.getElementById('tab-online').classList.toggle('active', name === 'online');
  if (name === 'online') renderOnlineView();
  if (state.sidebarCollapsed) {
    state.sidebarCollapsed = false;
    localStorage.setItem(SIDEBAR_KEY, false);
    applySidebarState();
  }
}

export function exportData() {
  const idLists = {};
  for (const ln of ['pool', 'done', 'todo']) {
    idLists[ln] = state.validatedEntries[ln]
      .filter(e => e.status === 'valid')
      .map(e => e.pokemon.id);
  }
  return btoa(JSON.stringify({ version: 3, lists: idLists, config: state.config }));
}

export function importData(str) {
  try {
    const data = JSON.parse(atob(str.trim()));
    if (data.lists) {
      for (const ln of ['pool', 'done', 'todo']) {
        state.lists[ln] = (data.lists[ln] || [])
          .map(id => state.allPokemon.find(p => p.id === id)?.name)
          .filter(Boolean);
      }
      saveLists();
    }
    if (data.config) {
      if (data.config.hints) state.config.hints = { ...state.config.hints, ...data.config.hints };
      if (data.config.gens)  state.config.gens  = data.config.gens;
      saveConfig();
    }
    validateAll();
    renderSidebar();
    buildConfigPanel();
    buildWheel();
    return true;
  } catch(e) { return false; }
}
