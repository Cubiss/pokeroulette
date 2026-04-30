import { state } from './state.js';
import { buildPokemonIndex, validateAll, matchPokemon } from './pokemon.js';
import { buildWheel, startIdleSpin, activateSpin, updateCenterText } from './wheel.js';
import { loadLists, saveLists } from './lists.js';
import {
  returnToRoulette, showDetail, revealNextHint,
  refreshSilhouetteHints, resolveDuplicate, renderDuplicateResolver,
  getAllDuplicatePokemon, bindDetailBioButton,
} from './screens.js';
import {
  loadSidebarState, loadPanelCollapseState, toggleSidebar,
  togglePanelCollapse, renderSidebar, enterEditMode, exitEditMode, movePokemon,
} from './sidebar.js';
import {
  loadConfig, saveConfig, buildConfigPanel, switchTab,
  exportData, importData,
} from './config.js';
import { closeSSE, connectToRoom, setRoom } from './online.js';

async function init() {
  try {
    const res = await fetch('pokemon.json');
    state.allPokemon = await res.json();
  } catch (e) {
    document.getElementById('main').innerHTML =
      '<p style="color:#E24B4A;text-align:center">Failed to load pokemon.json.<br>Run build-pokemon-json.js first.</p>';
    return;
  }

  buildPokemonIndex();
  loadSidebarState();
  loadPanelCollapseState();
  loadConfig();
  loadLists();
  validateAll();
  renderSidebar();
  buildConfigPanel();
  buildWheel();
  startIdleSpin();
  bindEvents();

  if (state.authToken) {
    const roomCode = state.pendingRoomCode || localStorage.getItem('pokeroulette_room_code');
    state.pendingRoomCode = null;
    if (roomCode) connectToRoom(roomCode).catch(() => setRoom(null));
  }
}

function bindEvents() {
  document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);

  document.getElementById('wheel-container').addEventListener('click', () => {
    if (state.currentScreen !== 'roulette') return;
    activateSpin();
  });

  document.getElementById('btn-reveal-all').addEventListener('click', () => showDetail());

  document.getElementById('btn-confirm').addEventListener('click', () => {
    movePokemon(state.selectedPokemon, 'done');
    returnToRoulette();
  });

  bindDetailBioButton();

  document.getElementById('btn-close-detail').addEventListener('click', () => returnToRoulette());

  document.getElementById('btn-remove').addEventListener('click', () => {
    movePokemon(state.selectedPokemon, 'todo');
    returnToRoulette();
  });

  document.getElementById('btn-close-dup').addEventListener('click', () => returnToRoulette());
  document.getElementById('btn-resolve').addEventListener('click', () => resolveDuplicate());

  document.querySelectorAll('.dup-select-all').forEach(btn => {
    btn.addEventListener('click', () => {
      const ln = btn.dataset.list;
      for (const p of getAllDuplicatePokemon()) {
        for (const k of [...state.duplicateSelected]) {
          if (k.startsWith(`${p.id}:`)) state.duplicateSelected.delete(k);
        }
        state.lists[ln].forEach((raw, idx) => {
          if (matchPokemon(raw)?.id === p.id) state.duplicateSelected.add(`${p.id}:${ln}:${idx}`);
        });
      }
      renderDuplicateResolver();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    e.preventDefault();
    if (state.currentScreen === 'roulette') {
      activateSpin();
    } else if (state.currentScreen === 'silhouette') {
      revealNextHint();
    }
  });

  for (const listName of ['pool', 'done', 'todo']) {
    document.getElementById(`edit-${listName}`).addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.editMode[listName]) {
        exitEditMode(listName);
      } else {
        for (const ln of ['pool', 'done', 'todo']) {
          if (ln !== listName && state.editMode[ln]) exitEditMode(ln);
        }
        enterEditMode(listName);
      }
    });

    document.getElementById(`header-${listName}`).addEventListener('click', (e) => {
      if (e.target.closest('.edit-btn')) return;
      togglePanelCollapse(listName);
    });
  }

  document.getElementById('filter-name').addEventListener('input', (e) => {
    state.filters.name = e.target.value;
    renderSidebar();
  });

  document.querySelectorAll('input[name="sort-order"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      state.sortOrder = radio.value;
      document.querySelectorAll('input[name="sort-order"]').forEach(r => {
        r.closest('.sort-radio-label').classList.toggle('selected', r === radio);
      });
      renderSidebar();
    });
  });

  document.getElementById('sort-dir').addEventListener('click', () => {
    state.sortAsc = !state.sortAsc;
    document.getElementById('sort-dir').classList.toggle('desc', !state.sortAsc);
    renderSidebar();
  });

  document.getElementById('filter-clear').addEventListener('click', () => {
    state.filters = { name: '' };
    state.sortOrder = 'none';
    state.sortAsc = true;
    document.getElementById('filter-name').value = '';
    document.querySelectorAll('input[name="sort-order"]').forEach(r => {
      r.checked = false;
      r.closest('.sort-radio-label').classList.remove('selected');
    });
    document.getElementById('sort-dir').classList.remove('desc');
    renderSidebar();
  });

  document.getElementById('tab-lists').addEventListener('click',  () => switchTab('lists'));
  document.getElementById('tab-config').addEventListener('click', () => switchTab('config'));
  document.getElementById('tab-online').addEventListener('click', () => switchTab('online'));

  switchTab(sessionStorage.getItem('activeTab') ?? 'online');

  window.addEventListener('beforeunload', () => closeSSE());

  for (const key of ['name', 'sprite', 'types', 'gen', 'dex']) {
    document.querySelectorAll(`input[name="hint-${key}"]`).forEach(radio => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        state.config.hints[key] = radio.value;
        saveConfig();
        document.querySelectorAll(`input[name="hint-${key}"]`).forEach(r => {
          r.closest('.hint-radio-label').classList.toggle('selected', r === radio);
        });
        refreshSilhouetteHints();
      });
    });
  }

  document.getElementById('btn-export').addEventListener('click', () => {
    const str = exportData();
    document.getElementById('import-export-area').value = str;
    navigator.clipboard?.writeText(str).catch(() => {});
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    const str = document.getElementById('import-export-area').value.trim();
    if (!str) return;
    if (!importData(str)) alert('Invalid import data.');
    else document.getElementById('import-export-area').value = '';
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (state.currentScreen !== 'roulette') return;
    if (!confirm('Reset all lists? This cannot be undone.')) return;
    const selectedGens = new Set(state.config.gens || []);
    state.lists = {
      pool: state.allPokemon.filter(p => selectedGens.size === 0 || selectedGens.has(p.gen)).map(p => p.name),
      done: [],
      todo: [],
    };
    saveLists();
    validateAll();
    renderSidebar();
    buildWheel();
    state.spinState = 'idle';
    state.winner = null;
    updateCenterText();
  });
}

init();
