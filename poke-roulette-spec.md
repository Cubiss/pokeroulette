# Poké Roulette — Project Specification

Version 1.1

---

## 1. Overview

Poké Roulette is a single-page web application for randomly selecting a Pokémon from a configurable pool. It is primarily intended as a guessing-game aid: one player spins the roulette and sees the result; another player tries to guess the Pokémon from a silhouette before the full reveal.

|                     |                                                                                                             |
| ---------------------| -------------------------------------------------------------------------------------------------------------|
| **Tech stack**      | Plain HTML + CSS + JavaScript (no framework required). Single `.html` file plus a `pokemon.json` data file. |
| **Data source**     | Bundled `pokemon.json` (see Section 2). No runtime API calls for Pokémon data.                              |
| **Sprites**         | Official artwork via PokéAPI CDN, fetched at display time by ID (see Section 3.2).                          |
| **Persistence**     | `localStorage` — all three lists survive page refresh.                                                      |
| **Pokémon pool**    | All generations (currently 1025 Pokémon as of Gen 9).                                                       |
| **Target platform** | Desktop browser only. Minimum supported viewport: 1024px wide.                                              |

---

## 2. Data Model

### 2.1 Bundled `pokemon.json`

The application ships with a pre-built `pokemon.json` file co-located with the HTML. This file is the canonical source of truth for all Pokémon data. No runtime data fetching from PokéAPI is required or performed.

Schema (array of objects):

```json
[
  {
    "id": 1,
    "name": "Bulbasaur",
    "gen": 1,
    "type1": "Grass",
    "type2": "Poison",
    "spriteUrl": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png"
  },
  ...
]
```

| Field       | Type           | Notes                                                        |
|-------------|----------------|--------------------------------------------------------------|
| `id`        | number         | National Pokédex number                                      |
| `name`      | string         | Capitalized English name, e.g. "Bulbasaur"                   |
| `gen`       | number         | Generation introduced (1–9)                                  |
| `type1`     | string         | Primary type (always present), capitalized                   |
| `type2`     | string \| null | Secondary type; null for single-type Pokémon                 |
| `spriteUrl` | string         | Absolute URL to the official-artwork PNG on the PokeAPI CDN  |

### 2.2 Per-entry runtime field

Each Pokémon also carries a `list` field at runtime (not stored in `pokemon.json`):

| Field  | Type                                    | Notes                       |
|--------|-----------------------------------------|-----------------------------|
| `list` | `"viable"` \| `"guessed"` \| `"removed"` | Current list membership     |

### 2.3 localStorage schema

| Key                  | Format      | Contents                                                       |
|----------------------|-------------|----------------------------------------------------------------|
| `pokeroulette_lists` | JSON object | `{viable:[...names], guessed:[...names], removed:[...names]}` |

Lists are stored as arrays of **raw strings** as entered by the user, not as IDs. Validation is performed at render time (see Section 4). This preserves unknown or malformed entries so the user can correct them.

**First load**: if `pokeroulette_lists` is absent in `localStorage`, all 1025 Pokémon names from `pokemon.json` are written to the `viable` array. On subsequent loads, `localStorage` takes precedence.

**Reset**: clearing `localStorage` and reloading re-seeds from `pokemon.json`.

---

## 3. Screens & Interactions

### 3.1 Roulette Screen

The default home screen. Renders a circular wheel (SVG) where each arc segment represents one **valid** entry in the Viable list. All segments have equal angular size — every eligible Pokémon has the same probability of being selected.

**Segment appearance**

With up to 1025 segments, individual slices are visually very narrow (≈0.35° each at full pool). This is intentional — the wheel resembles a dense color ring, which is an acceptable and deliberate aesthetic. The coloring rules still apply per segment:

- Single-type Pokémon: solid fill using the type's color (see Section 6).
- Dual-type Pokémon: diagonal stripe pattern — stripes alternate between type1 and type2 colors at 45°. Implemented as an SVG `<pattern>` in `<defs>`, reused across segments. Stripe width ≈ 4–6px at the chart's outer radius.

**Center display**

The wheel has a circular center cutout (donut hole, roughly 35–40% of the wheel's total radius). This area is used to display contextual text:

- Default (idle): empty or a subtle "Click to spin" prompt.
- After spin completes: displays the selected Pokémon's name and type badge(s).

**Spin interaction**

- The user clicks anywhere on the wheel to spin.
- The winner is determined by uniform random selection from the valid Viable entries **before** the animation begins. The animation is purely cosmetic.
- The wheel rotates with cubic ease-out deceleration over approximately 3–5 seconds, landing so the pre-selected segment aligns with a fixed pointer at the 12 o'clock position.
- After the spin completes, the selected Pokémon's name appears in the center display, then the app transitions to the Silhouette Screen after a brief pause (≈1 second) or on user click.

**Empty state**

If the Viable list has no valid entries, the wheel area displays: *"No Pokémon in the viable list. Add some to get started."* Clicking does nothing.

---

### 3.2 Silhouette Screen

Displays the selected Pokémon as a silhouette. The name is hidden. The type-colored glow provides a visual hint before the reveal.

**Silhouette rendering**

- Source: the Pokémon's official-artwork PNG fetched from the `spriteUrl` in `pokemon.json`. Official artwork PNGs have a transparent background; no background removal is needed.
- The silhouette is rendered by displaying the sprite as an `<img>` with the CSS filter:
  ```css
  filter: brightness(0);
  ```
  This turns all opaque pixels black while preserving transparency, producing a clean black cutout.
- The sprite is displayed at a reasonable fixed size (e.g. 300×300px), centered on screen.
- A large "?" glyph is centered over the silhouette image.

**Type color hint**

Instead of a stroke on the image itself, a colored glow is applied to the sprite container using `box-shadow`:

- Single-type: `box-shadow: 0 0 32px 8px <type1Color>`.
- Dual-type: two layered box-shadows, one per type color, offset slightly to opposite sides.

**Loading state**

While the sprite image is loading, show a spinner or placeholder in the sprite area. If the image fails to load, show the Pokémon's name in place of the silhouette (graceful fallback).

**Reveal interaction**

Clicking anywhere on the silhouette (or a "Reveal" button below it) transitions to the Reveal Screen (~400ms fade or card-flip animation).

---

### 3.3 Reveal Screen

**Layout (top to bottom)**

1. Pokémon name — large, centered.
2. Revealed sprite — same `<img>` as the Silhouette Screen, but the `brightness(0)` filter is removed. The type glow remains.
3. Three action buttons in a row:

| Button  | Color           | Glyph | Action                       |
|---------|-----------------|-------|------------------------------|
| Confirm | Green `#27C76A` | ✓     | Move to Guessed list         |
| Return  | Grey `#AAAAAA`  | ↩     | Move back to Viable list     |
| Remove  | Red `#E24B4A`   | ✕     | Move to Removed list         |

Pressing any button moves the Pokémon (updates the lists in memory and in `localStorage`) and immediately transitions back to the Roulette Screen (~250ms fade). The wheel re-renders without the acted-upon Pokémon in the Viable list.

---

## 4. Lists Panel

A persistent fixed sidebar on the right side of the screen, always visible regardless of which screen is active. The sidebar has a fixed width (e.g. 320px) and full viewport height. The main content area (roulette/silhouette/reveal) occupies the remaining width.

The three lists are:

- **Viable** — Pokémon eligible for the roulette. Seeded with all 1025 Pokémon on first load.
- **Guessed** — Pokémon confirmed via the ✓ button.
- **Removed** — Pokémon excluded from future rolls via the ✕ button.

Each list occupies one-third of the sidebar height (minus the filter bar). Each list scrolls independently with `overflow-y: auto` and a visible scrollbar on the right. Scroll wheel is supported natively.

---

### 4.1 Editable Text Lists

Each list has two visual modes, toggled by clicking an Edit button (pencil icon) in the list header:

**Row view** (default): each entry rendered as a styled row containing:
- A small type-color dot on the left (type1 color; dual-type shows a split dot).
- The display name (canonical capitalized form).
- An error highlight if the entry is `unknown` or `duplicate` (see validation states below).

**Edit mode**: the list becomes a `<textarea>` with one name per line, showing the raw strings as stored. The user can type, delete, and paste freely. On exit (clicking Done or clicking outside the textarea), validation runs against the full contents.

**Paste & validation**

On edit exit, each line is validated and transformed:

1. **Normalize**: trim whitespace, collapse internal whitespace.
2. **Match**: attempt a case-insensitive match against the names in `pokemon.json`. Leniency rules:
   - Case-insensitive (`bulbasaur` → Bulbasaur).
   - Leading/trailing whitespace stripped.
   - Internal whitespace normalized (multiple spaces/tabs → single space).
   - Special characters: hyphens, apostrophes, and periods are ignored during matching (e.g. `farfetchd` → Farfetch'd, `mr mime` → Mr. Mime, `nidoranf` or `nidoran f` → Nidoran♀).
   - Common regional form suffixes recognized: `-galar`, `-alola`, `-hisui`, `-paldea`, etc.
3. **Assign state** to each line:

| State       | Meaning                                                  | Visual treatment                                                              |
|-------------|----------------------------------------------------------|-------------------------------------------------------------------------------|
| `valid`     | Matched to a known Pokémon, appears in exactly one list  | Normal display; small type-color dot on the left                              |
| `unknown`   | Could not be matched to any known Pokémon                | Row highlighted in amber/yellow; excluded from roulette                       |
| `duplicate` | This name appears in more than one list                  | Row highlighted in red/pink; shown in all affected lists; excluded from roulette |

The raw string the user typed is always preserved in the textarea. The canonical display name (corrected capitalization, etc.) is shown only in row view, not written back to the textarea.

**Duplicate detection** is cross-list: if "Bulbasaur" appears in both Viable and Guessed, both occurrences are marked `duplicate`.

---

### 4.2 Filters

A shared filter bar sits at the top of the sidebar, above all three lists. Filters apply to all three lists simultaneously (display only — they do not affect the roulette pool).

| Filter       | Type                   | Behavior                                                                                 |
|--------------|------------------------|------------------------------------------------------------------------------------------|
| Name         | Text input             | Case-insensitive substring match against display name or raw string                      |
| Type         | Multi-select dropdown  | Shows entries where type1 or type2 matches any selected type. Options: all 18 types.    |
| Errors only  | Toggle/checkbox        | When active, hides all `valid` entries — shows only `unknown` and `duplicate` rows       |

Filters combine with AND logic: an entry must pass all active filters to appear.

Each list header shows entry counts as "Visible / Total" (e.g. "Viable — 12 / 300" when filtered).

A "Clear filters" button resets all filters at once.

---

### 4.3 List Management

**Drag and drop**

- Only `valid` entries are draggable. `unknown` and `duplicate` entries have no drag handle and cannot be moved.
- Entries can be dragged **between lists** and **reordered within a list**.
- Dropping an entry into a different list is equivalent to using the corresponding action button (e.g. dragging from Viable to Guessed is the same as pressing ✓). The lists and `localStorage` are updated immediately.
- A drag ghost and a visible drop target indicator (highlighted gap or zone border) should be shown during drag.

**Other controls**

- **Reset all**: clears `pokeroulette_lists` from `localStorage` and re-seeds Viable from `pokemon.json`, restoring all 1025 Pokémon to Viable and emptying Guessed and Removed. Requires a confirmation prompt before executing.

---

## 5. Transition Animations

| Transition                    | Duration    | Style                              |
|-------------------------------|-------------|------------------------------------|
| Spin (Roulette → Silhouette)  | 3–5 seconds | Wheel rotation, cubic ease-out     |
| Silhouette → Reveal           | ~400ms      | Fade or horizontal card flip       |
| Action button → Roulette      | ~250ms      | Fade out / fade in                 |

All animations must respect `prefers-reduced-motion: reduce` — when set, all transitions are instant.

---

## 6. Type Color Reference

| Type     | Hex       | Type     | Hex       |
|----------|-----------|----------|-----------|
| Normal   | `#A8A878` | Flying   | `#A890F0` |
| Fire     | `#F08030` | Psychic  | `#F85888` |
| Water    | `#6890F0` | Bug      | `#A8B820` |
| Electric | `#F8D030` | Rock     | `#B8A038` |
| Grass    | `#78C850` | Ghost    | `#705898` |
| Ice      | `#98D8D8` | Dragon   | `#7038F8` |
| Fighting | `#C03028` | Dark     | `#705848` |
| Poison   | `#A040A0` | Steel    | `#B8B8D0` |
| Ground   | `#E0C068` | Fairy    | `#EE99AC` |

---

## 7. Out of Scope (v1)

- Mobile or responsive layout (desktop 1024px+ only)
- User accounts or server-side sync
- Multiplayer or networked play
- Pokémon stats, moves, or any gameplay data beyond name, generation, and type
- Localization (English only)
- PWA / offline support
- Runtime fetching of Pokémon metadata (all data is bundled in `pokemon.json`)
