#!/usr/bin/env node
// Generates pokemon.json from PokéAPI. Requires Node 18+.
// Run: node build-pokemon-json.js

import { writeFile } from 'fs/promises';

const TOTAL = 1025;
const OUT = 'pokemon.json';

function genFromId(id) {
  if (id <= 151) return 1;
  if (id <= 251) return 2;
  if (id <= 386) return 3;
  if (id <= 493) return 4;
  if (id <= 649) return 5;
  if (id <= 721) return 6;
  if (id <= 809) return 7;
  if (id <= 905) return 8;
  return 9;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatName(raw) {
  // Handle special names
  return raw.split('-').map(capitalize).join('-');
}

// Fetch with simple retry
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

process.stdout.write(`Fetching ${TOTAL} Pokémon...\n`);

const pokemon = [];
const CONCURRENCY = 20;

for (let start = 1; start <= TOTAL; start += CONCURRENCY) {
  const batch = [];
  for (let id = start; id <= Math.min(start + CONCURRENCY - 1, TOTAL); id++) {
    batch.push(id);
  }

  const results = await Promise.all(batch.map(async (id) => {
    const data = await fetchWithRetry(`https://pokeapi.co/api/v2/pokemon/${id}`);

    // Get English name from species
    const species = await fetchWithRetry(data.species.url);
    const nameEntry = species.names.find(n => n.language.name === 'en');
    const name = nameEntry ? nameEntry.name : formatName(data.name);

    const types = data.types.sort((a, b) => a.slot - b.slot);
    const type1 = capitalize(types[0].type.name);
    const type2 = types[1] ? capitalize(types[1].type.name) : null;

    return {
      id,
      name,
      gen: genFromId(id),
      type1,
      type2,
      spriteUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
    };
  }));

  pokemon.push(...results);
  process.stdout.write(`  ${Math.min(start + CONCURRENCY - 1, TOTAL)}/${TOTAL}\n`);
}

pokemon.sort((a, b) => a.id - b.id);
await writeFile(OUT, JSON.stringify(pokemon, null, 2));
process.stdout.write(`Done! Written to ${OUT}\n`);
