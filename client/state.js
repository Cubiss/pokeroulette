export const TYPE_COLORS = {
  Normal:   '#A8A878', Fire:     '#F08030', Water:    '#6890F0',
  Electric: '#F8D030', Grass:    '#78C850', Ice:      '#98D8D8',
  Fighting: '#C03028', Poison:   '#A040A0', Ground:   '#E0C068',
  Flying:   '#A890F0', Psychic:  '#F85888', Bug:      '#A8B820',
  Rock:     '#B8A038', Ghost:    '#705898', Dragon:   '#7038F8',
  Dark:     '#705848', Steel:    '#B8B8D0', Fairy:    '#EE99AC',
};

export const STORAGE_KEY   = 'pokeroulette_lists';
export const SIDEBAR_KEY   = 'pokeroulette_sidebar_collapsed';
export const COLLAPSE_KEY  = 'pokeroulette_panels_collapsed';
export const CONFIG_KEY    = 'pokeroulette_config';
export const ROOM_CODE_KEY = 'pokeroulette_room_code';
export const API_BASE      = '/api/v1';
export const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const PRESETS = [
  { label: 'Swamp',  bg: '#a8c832', surface: '#bcd848', surface2: '#cee460', text: '#1a3004', textDim: '#4a6a10', border: '#88a81e' },
  { label: 'Forest', bg: '#0d1f0f', surface: '#122914', surface2: '#1a3d1d', text: '#e0ede0', textDim: '#7a9e7a', border: '#254d28' },
  { label: 'Ocean',  bg: '#1a1a2e', surface: '#16213e', surface2: '#0f3460', text: '#e0e0e0', textDim: '#888888', border: '#2a2a4a' },
  { label: 'Dusk',   bg: '#13101f', surface: '#1c1530', surface2: '#2e1f52', text: '#e8e0f0', textDim: '#9080b0', border: '#3a2a5a' },
  { label: 'Ember',  bg: '#1f0d0d', surface: '#2a1010', surface2: '#3d1515', text: '#f0e0e0', textDim: '#a07070', border: '#5a2020' },
  { label: 'Slate',  bg: '#111318', surface: '#181c22', surface2: '#232830', text: '#dde2e8', textDim: '#7a8592', border: '#2e3540' },
];

export const DEFAULT_COLORS = PRESETS[0];

export function applyColors(c) {
  const s = document.documentElement.style;
  s.setProperty('--bg',       c.bg);
  s.setProperty('--surface',  c.surface);
  s.setProperty('--surface2', c.surface2);
  s.setProperty('--text',     c.text);
  s.setProperty('--text-dim', c.textDim);
  s.setProperty('--border',   c.border);
}

export const state = {
  // Pokemon data
  allPokemon: [],
  lists: { pool: [], done: [], todo: [] },
  validatedEntries: { pool: [], done: [], todo: [] },

  // Screen / selection
  currentScreen: 'roulette',
  selectedPokemon: null,
  selectedPokemonIsDuplicate: false,
  detailOpenedFromList: false,
  duplicateSelected: new Set(),
  currentTab: 'lists',

  // Config
  config: {
    hints: { name: 'hidden', sprite: 'hidden', types: 'hidden', gen: 'hidden', dex: 'hidden' },
    gens: null,
    colors: { ...DEFAULT_COLORS },
  },

  // Sidebar
  sidebarCollapsed: false,
  panelCollapsed: { pool: false, done: false, todo: false },
  editMode: { pool: false, done: false, todo: false },
  editModeFilteredOut: { pool: [], done: [], todo: [] },
  filters: { name: '' },
  sortOrder: 'none',
  sortAsc: true,
  animateNextRender: false,

  // Wheel
  spinState: 'idle',
  winner: null,
  wheelVelocity: 0,

  // Online / auth
  authToken: localStorage.getItem('pokeroulette_auth_token') || null,
  authUsername: localStorage.getItem('pokeroulette_auth_user') || null,
  currentRoom: null,
  pendingRoomCode: window.location.hash.replace(/^#/, '').trim() || null,
  sseConnected: false,
};
