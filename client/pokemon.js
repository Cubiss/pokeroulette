import { state } from './state.js';

let pokemonByName = new Map();

export function buildPokemonIndex() {
  pokemonByName = new Map();
  for (const p of state.allPokemon) {
    pokemonByName.set(normalizeName(p.name), p);
  }
}

export function normalizeName(s) {
  return s.toLowerCase()
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .replace(/[-'.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchPokemon(raw) {
  return pokemonByName.get(normalizeName(raw)) || null;
}

export function validateAll() {
  const allResolved = {};
  for (const listName of ['pool', 'done', 'todo']) {
    allResolved[listName] = state.lists[listName].map(raw => ({
      raw,
      pokemon: matchPokemon(raw),
    }));
  }

  const seenNames = new Map();
  for (const listName of ['pool', 'done', 'todo']) {
    for (let i = 0; i < allResolved[listName].length; i++) {
      const { pokemon } = allResolved[listName][i];
      if (!pokemon) continue;
      const key = pokemon.id;
      if (!seenNames.has(key)) seenNames.set(key, []);
      seenNames.get(key).push({ listName, idx: i });
    }
  }

  const duplicateKeys = new Set();
  for (const [key, locs] of seenNames) {
    if (locs.length > 1) duplicateKeys.add(key);
  }

  for (const listName of ['pool', 'done', 'todo']) {
    state.validatedEntries[listName] = allResolved[listName].map(({ raw, pokemon }) => {
      let status;
      if (!pokemon) {
        status = 'unknown';
      } else if (duplicateKeys.has(pokemon.id)) {
        status = 'duplicate';
      } else {
        status = 'valid';
      }
      return { raw, status, pokemon };
    });
    state.validatedEntries[listName].sort((a, b) => {
      const rankA = a.status === 'valid' ? 1 : 0;
      const rankB = b.status === 'valid' ? 1 : 0;
      return rankA - rankB;
    });
  }
}

export function getValidPool() {
  return state.validatedEntries.pool
    .filter(e => e.status === 'valid' || e.status === 'duplicate')
    .map(e => e.pokemon);
}
