import { state, TYPE_COLORS } from './state.js';
import { matchPokemon, validateAll } from './pokemon.js';
import { buildWheel, startIdleSpin, updateCenterText } from './wheel.js';
import { renderSidebar } from './sidebar.js';
import { saveLists } from './lists.js';

const pokedexCache = new Map();
const bioCache = new Map();
let revealState = { name: false, sprite: false, types: false, gen: false, dex: false };
let duplicatePokemon = null;

// ── SCREEN TRANSITIONS ──

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`${name}-screen`);
  if (name === 'detail') {
    target.classList.add('fast-transition');
  } else {
    target.classList.remove('fast-transition');
  }
  target.classList.add('active');
  state.currentScreen = name;
  updateEditLock();
}

export function updateEditLock() {
  const locked = state.currentScreen !== 'roulette';
  const tooltip = locked ? 'Return to roulette to edit lists' : 'Edit list';
  for (const name of ['pool', 'done', 'todo']) {
    const btn = document.getElementById(`edit-${name}`);
    btn.disabled = locked;
    btn.title = tooltip;
  }
  document.getElementById('reset-btn').disabled = locked;
}

export function returnToRoulette() {
  state.selectedPokemonIsDuplicate = false;
  state.detailOpenedFromList = false;
  document.querySelectorAll('.entry-row.active').forEach(r => r.classList.remove('active'));
  showScreen('roulette');
  buildWheel();
  state.spinState = 'idle';
  state.winner = null;
  state.wheelVelocity = 0;
  updateCenterText();
  startIdleSpin();
}

// ── POKÉDEX / BIO ──

function applyDexText(el, p, redact) {
  const raw = pokedexCache.get(p.id);
  if (!raw) return;
  el.textContent = redact
    ? raw.replace(new RegExp(p.name, 'gi'), '█'.repeat(p.name.length))
    : raw;
}

export async function fetchDexEntry(p, el, redact = false) {
  if (pokedexCache.has(p.id)) {
    applyDexText(el, p, redact);
    return;
  }
  el.textContent = '…';
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${p.id}/`);
    const data = await res.json();
    const entry = data.flavor_text_entries.find(e => e.language.name === 'en');
    const text = entry
      ? entry.flavor_text.replace(/\f/g, ' ').replace(/\u00ad/g, '')
      : 'No entry found.';
    pokedexCache.set(p.id, text);
    if (state.selectedPokemon?.id === p.id) applyDexText(el, p, redact);
  } catch {
    el.textContent = 'Failed to load Pokédex entry.';
  }
}

async function fetchBio(p, el) {
  if (bioCache.has(p.id)) {
    renderBio(el, bioCache.get(p.id));
    return;
  }
  el.innerHTML = '<span style="color:var(--text-dim);font-style:italic">…</span>';
  try {
    const [speciesRes, pokemonRes] = await Promise.all([
      fetch(`https://pokeapi.co/api/v2/pokemon-species/${p.id}/`),
      fetch(`https://pokeapi.co/api/v2/pokemon/${p.id}/`),
    ]);
    const [species, pokemon] = await Promise.all([speciesRes.json(), pokemonRes.json()]);
    const genus = species.genera.find(g => g.language.name === 'en')?.genus ?? '—';
    const height = (pokemon.height / 10).toFixed(1) + ' m';
    const weight = (pokemon.weight / 10).toFixed(1) + ' kg';
    const abilities = pokemon.abilities
      .sort((a, b) => a.slot - b.slot)
      .map(a => a.ability.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        + (a.is_hidden ? ' (hidden)' : ''))
      .join(', ');
    const data = { genus, height, weight, abilities };
    bioCache.set(p.id, data);
    if (state.selectedPokemon?.id === p.id) renderBio(el, data);
  } catch {
    el.innerHTML = '<span style="color:var(--text-dim);font-style:italic">Failed to load.</span>';
  }
}

export function renderBio(el, data) {
  el.innerHTML = '';
  for (const [label, value] of [
    ['Category', data.genus], ['Height', data.height],
    ['Weight', data.weight], ['Abilities', data.abilities],
  ]) {
    const row = document.createElement('div');
    row.className = 'bio-row';
    row.innerHTML = `<span class="bio-label">${label}</span><span class="bio-value">${value}</span>`;
    el.appendChild(row);
  }
}

export function getBioCache() { return bioCache; }

// ── SILHOUETTE ──

function checkAllRevealed() {
  if (revealState.name && revealState.sprite && revealState.types && revealState.gen && revealState.dex) {
    showDetail();
  }
}

export function revealNextHint() {
  const p = state.selectedPokemon;
  const order = ['gen', 'types', 'dex', 'sprite', 'name'];
  for (const key of order) {
    if (revealState[key]) continue;
    if (key === 'gen') {
      const el = document.getElementById('silhouette-gen');
      el.style.cssText = '';
      el.textContent = `Gen ${p.gen}`;
      revealState.gen = true;
    } else if (key === 'types') {
      const el = document.getElementById('silhouette-types');
      el.innerHTML = '';
      appendTypeBadges(el, p);
      revealState.types = true;
    } else if (key === 'dex') {
      const el = document.getElementById('silhouette-dex');
      el.classList.remove('blurred');
      el.onclick = null;
      if (!pokedexCache.has(p.id)) fetchDexEntry(p, el, false);
      else applyDexText(el, p, false);
      revealState.dex = true;
    } else if (key === 'sprite') {
      const wrapper = document.getElementById('silhouette-wrapper');
      const img = wrapper.querySelector('img');
      if (img) img.style.filter = '';
      wrapper.querySelector('.question-mark')?.remove();
      wrapper.style.cursor = '';
      wrapper.onclick = null;
      revealState.sprite = true;
    } else if (key === 'name') {
      const nameArea = document.getElementById('silhouette-name-area');
      nameArea.innerHTML = '';
      nameArea.textContent = p.name;
      const dexEl = document.getElementById('silhouette-dex');
      if (pokedexCache.has(p.id)) applyDexText(dexEl, p, false);
      revealState.name = true;
    }
    checkAllRevealed();
    return;
  }
}

function appendTypeBadges(el, p) {
  const b1 = document.createElement('span');
  b1.className = 'type-badge';
  b1.style.background = TYPE_COLORS[p.type1] || '#888';
  b1.textContent = p.type1;
  el.appendChild(b1);
  if (p.type2) {
    const b2 = document.createElement('span');
    b2.className = 'type-badge';
    b2.style.background = TYPE_COLORS[p.type2] || '#888';
    b2.textContent = p.type2;
    el.appendChild(b2);
  }
}

export function showSilhouette(p) {
  state.selectedPokemon = p;
  state.selectedPokemonIsDuplicate = false;
  state.detailOpenedFromList = false;

  revealState = {
    name:   state.config.hints.name   === 'hidden' ? false : true,
    sprite: state.config.hints.sprite === 'hidden' ? false : true,
    types:  state.config.hints.types  !== 'hidden',
    gen:    state.config.hints.gen    !== 'hidden',
    dex:    state.config.hints.dex    !== 'hidden',
  };

  // Name area
  const nameArea = document.getElementById('silhouette-name-area');
  nameArea.innerHTML = '';
  if (state.config.hints.name === 'hidden') {
    const btn = document.createElement('button');
    btn.className = 'hint-reveal-btn';
    btn.textContent = 'Reveal name';
    btn.onclick = () => {
      revealState.name = true;
      nameArea.textContent = p.name;
      const dexEl = document.getElementById('silhouette-dex');
      if (pokedexCache.has(p.id)) applyDexText(dexEl, p, false);
      checkAllRevealed();
    };
    nameArea.appendChild(btn);
  }

  // Type badges
  const typesEl = document.getElementById('silhouette-types');
  typesEl.innerHTML = '';
  if (state.config.hints.types === 'disabled') {
    typesEl.style.display = 'none';
  } else {
    typesEl.style.display = '';
    if (state.config.hints.types === 'hidden') {
      const btn = document.createElement('button');
      btn.className = 'hint-reveal-btn';
      btn.textContent = 'Reveal types';
      btn.onclick = () => {
        revealState.types = true;
        typesEl.innerHTML = '';
        appendTypeBadges(typesEl, p);
        checkAllRevealed();
      };
      typesEl.appendChild(btn);
    } else {
      appendTypeBadges(typesEl, p);
    }
  }

  // Gen label
  const genEl = document.getElementById('silhouette-gen');
  genEl.innerHTML = '';
  if (state.config.hints.gen === 'disabled') {
    genEl.style.cssText = 'display:none';
  } else {
    if (state.config.hints.gen === 'hidden') {
      genEl.style.cssText = 'border:none;padding:0;background:none';
      const btn = document.createElement('button');
      btn.className = 'hint-reveal-btn';
      btn.textContent = 'Reveal gen';
      btn.onclick = () => {
        revealState.gen = true;
        genEl.style.cssText = '';
        genEl.textContent = `Gen ${p.gen}`;
        checkAllRevealed();
      };
      genEl.appendChild(btn);
    } else {
      genEl.style.cssText = '';
      genEl.textContent = `Gen ${p.gen}`;
    }
  }

  // Pokédex entry
  const dexEl = document.getElementById('silhouette-dex');
  dexEl.innerHTML = '';
  dexEl.className = '';
  if (state.config.hints.dex === 'disabled') {
    dexEl.style.display = 'none';
  } else {
    dexEl.style.display = '';
    dexEl.className = 'dex-entry';
    const nameHidden = state.config.hints.name === 'hidden';
    if (state.config.hints.dex === 'hidden') {
      dexEl.classList.add('blurred');
      fetchDexEntry(p, dexEl, nameHidden);
      dexEl.onclick = () => {
        dexEl.classList.remove('blurred');
        dexEl.onclick = null;
        revealState.dex = true;
        checkAllRevealed();
      };
    } else {
      fetchDexEntry(p, dexEl, nameHidden);
    }
  }

  // Sprite
  const wrapper = document.getElementById('silhouette-wrapper');
  wrapper.innerHTML = '';
  wrapper.onclick = null;
  wrapper.style.cursor = '';

  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.id = 'silhouette-spinner';
  wrapper.appendChild(spinner);

  const img = document.createElement('img');
  img.src = p.spriteUrl;
  img.alt = '?';
  const spriteHidden = state.config.hints.sprite === 'hidden';
  img.style.cssText = `${spriteHidden ? 'filter:brightness(0);' : ''} position:absolute; inset:0; width:100%; height:100%; object-fit:contain;`;

  if (spriteHidden) {
    wrapper.style.cursor = 'pointer';
    wrapper.onclick = () => {
      img.style.filter = '';
      wrapper.querySelector('.question-mark')?.remove();
      wrapper.style.cursor = '';
      wrapper.onclick = null;
      revealState.sprite = true;
      checkAllRevealed();
    };
  }

  img.onload = () => {
    document.getElementById('silhouette-spinner')?.remove();
    wrapper.appendChild(img);
    if (spriteHidden) {
      const qm = document.createElement('div');
      qm.className = 'question-mark';
      qm.textContent = '?';
      wrapper.appendChild(qm);
    }
  };
  img.onerror = () => {
    document.getElementById('silhouette-spinner')?.remove();
    const fallback = document.createElement('div');
    fallback.textContent = p.name;
    fallback.style.cssText = 'font-size:1.5rem; font-weight:700;';
    wrapper.appendChild(fallback);
  };

  showScreen('silhouette');
}

export function refreshSilhouetteHints() {
  if (!state.selectedPokemon || state.currentScreen !== 'silhouette') return;
  showSilhouette(state.selectedPokemon);
}

// ── DETAIL ──

export function showDetail() {
  const p = state.selectedPokemon;
  document.getElementById('detail-name').textContent = p.name;
  document.getElementById('btn-confirm').style.display = state.detailOpenedFromList ? '' : 'none';
  const isGuest = state.currentRoom && state.currentRoom.role === 'guest';
  document.getElementById('btn-confirm').disabled = isGuest;
  document.getElementById('btn-remove').disabled = isGuest;
  document.getElementById('btn-confirm').title = isGuest ? 'Guests cannot edit lists' : 'Move to Drawn';
  document.getElementById('btn-remove').title = isGuest ? 'Guests cannot edit lists' : 'Move to The Pile';

  const img = document.getElementById('detail-img');
  img.src = p.spriteUrl;
  img.alt = p.name;
  img.style.filter = '';

  const typesEl = document.getElementById('detail-types');
  typesEl.innerHTML = '';
  appendTypeBadges(typesEl, p);

  document.getElementById('detail-gen').textContent = `Gen ${p.gen}`;

  const detailDexEl = document.getElementById('detail-dex');
  detailDexEl.className = 'dex-entry';
  fetchDexEntry(p, detailDexEl);

  const bioEl = document.getElementById('detail-bio');
  bioEl.classList.remove('visible');
  bioEl.innerHTML = '';
  document.getElementById('btn-bio').classList.remove('active');

  const dupWarning = document.getElementById('detail-dup-warning');
  if (state.selectedPokemonIsDuplicate) {
    const listNames = { pool: 'Roulette', done: 'Drawn', todo: 'The Pile' };
    const found = Object.entries(listNames)
      .filter(([key]) => state.lists[key].some(raw => matchPokemon(raw)?.id === p.id))
      .map(([, label]) => label);
    const last = found.pop();
    dupWarning.textContent = '⚠ Duplicate in ' + (found.length ? found.join(', ') + ' and ' + last : last);
    dupWarning.style.display = '';
  } else {
    dupWarning.style.display = 'none';
  }

  showScreen('detail');
}

export function bindDetailBioButton() {
  document.getElementById('btn-bio').addEventListener('click', () => {
    const bioEl = document.getElementById('detail-bio');
    const btn = document.getElementById('btn-bio');
    const showing = bioEl.classList.toggle('visible');
    btn.classList.toggle('active', showing);
    if (showing && !bioCache.has(state.selectedPokemon?.id)) {
      fetchBio(state.selectedPokemon, bioEl);
    } else if (showing) {
      renderBio(bioEl, bioCache.get(state.selectedPokemon.id));
    }
  });
}

// ── DUPLICATE RESOLVER ──

export function getAllDuplicatePokemon() {
  const inLists = new Map();
  for (const ln of ['pool', 'done', 'todo']) {
    for (const raw of state.lists[ln]) {
      const p = matchPokemon(raw);
      if (!p) continue;
      if (!inLists.has(p.id)) inLists.set(p.id, new Set());
      inLists.get(p.id).add(ln);
    }
  }
  return [...inLists.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([id]) => state.allPokemon.find(p => p.id === id))
    .filter(Boolean);
}

export function showDuplicateResolver() {
  duplicatePokemon = null;
  state.duplicateSelected = new Set();
  const dups = getAllDuplicatePokemon();
  document.getElementById('dup-title').textContent =
    dups.length === 1 ? dups[0].name : `${dups.length} duplicates`;
  renderDuplicateResolver();
  showScreen('duplicate');
}

export function renderDuplicateResolver() {
  const dupPokemon = getAllDuplicatePokemon();
  for (const ln of ['pool', 'done', 'todo']) {
    const body = document.getElementById(`dup-body-${ln}`);
    body.innerHTML = '';

    for (const p of dupPokemon) {
      const entries = state.lists[ln]
        .map((raw, idx) => ({ raw, idx }))
        .filter(({ raw }) => matchPokemon(raw)?.id === p.id);

      const label = document.createElement('div');
      label.className = 'dup-group-label';
      label.textContent = p.name;
      body.appendChild(label);

      if (entries.length === 0) {
        const gap = document.createElement('div');
        gap.className = 'dup-col-gap';
        gap.textContent = '—';
        body.appendChild(gap);
        continue;
      }

      const groupKeys = entries.map(({ idx }) => `${p.id}:${ln}:${idx}`);
      const anyInGroupSelected = groupKeys.some(k => state.duplicateSelected.has(k));

      for (const { raw, idx } of entries) {
        const key = `${p.id}:${ln}:${idx}`;
        const isSelected = state.duplicateSelected.has(key);
        const isDimmed = anyInGroupSelected && !isSelected;
        const item = document.createElement('div');
        item.className = 'dup-item' +
          (isSelected ? ' selected' : '') +
          (isDimmed ? ' dimmed' : '');
        item.textContent = raw;
        item.addEventListener('click', () => {
          if (isSelected) {
            state.duplicateSelected.delete(key);
          } else {
            for (const k of [...state.duplicateSelected]) {
              if (k.startsWith(`${p.id}:`)) state.duplicateSelected.delete(k);
            }
            state.duplicateSelected.add(key);
          }
          renderDuplicateResolver();
        });
        body.appendChild(item);
      }
    }
  }
}

export function resolveDuplicate() {
  const dupPokemon = getAllDuplicatePokemon();
  for (const p of dupPokemon) {
    const anySelected = [...state.duplicateSelected].some(k => k.startsWith(`${p.id}:`));
    if (!anySelected) continue;
    for (const ln of ['pool', 'done', 'todo']) {
      const toKeep = new Set();
      state.lists[ln].forEach((raw, idx) => {
        if (matchPokemon(raw)?.id === p.id && state.duplicateSelected.has(`${p.id}:${ln}:${idx}`))
          toKeep.add(idx);
      });
      state.lists[ln] = state.lists[ln].filter((raw, idx) => {
        if (matchPokemon(raw)?.id !== p.id) return true;
        return toKeep.has(idx);
      });
    }
  }
  saveLists();
  validateAll();
  renderSidebar();
  returnToRoulette();
}
