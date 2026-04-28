import { state, STORAGE_KEY } from './state.js';
import { apiRequest } from './online.js';

export function loadLists() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      state.lists = parsed;
      state.lists.pool = state.lists.pool || [];
      state.lists.done = state.lists.done || [];
      state.lists.todo = state.lists.todo || [];
      return;
    } catch(e) {}
  }
  state.lists = {
    pool: state.allPokemon.map(p => p.name),
    done: [],
    todo: [],
  };
  saveLists();
}

export function saveLists() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.lists));
  if (state.currentRoom) {
    apiRequest('PUT', `/rooms/${state.currentRoom.code}/lists`, { lists: state.lists });
  }
}
