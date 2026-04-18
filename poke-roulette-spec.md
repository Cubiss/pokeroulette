# Poké Roulette — Project Specification

Version 1.3

---

## 1. Overview

Poké Roulette is a single-page web application for randomly selecting a Pokémon from a configurable pool. It is primarily intended as a guessing-game aid: one player spins the roulette and sees the result; another player tries to guess the Pokémon from a silhouette before the full reveal.

|                      |                                                                                                                                                                                                                           |
|----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Tech stack**       | Plain HTML + CSS + JavaScript (no framework). Single `.html` file plus a `pokemon.json` data file.                                                                                                                        |
| **Data source**      | Bundled `pokemon.json` (see Section 2). No runtime API calls for Pokémon data.                                                                                                                                            |
| **Sprites**          | Official artwork via PokéAPI CDN, fetched at display time by ID.                                                                                                                                                          |
| **Persistence**      | `localStorage` — all lists and settings survive page refresh.                                                                                                                                                             |
| **Pokémon pool**     | All generations (currently 1025 Pokémon as of Gen 9).                                                                                                                                                                     |
| **Target platform**  | Desktop browser primarily. Layout is fully responsive: roulette wheel, silhouette, and reveal screens all scale to fit the viewport. The sidebar stays fixed on the right. No minimum viewport enforced.                  |

---

## 2. Data Model

### 2.1 Bundled `pokemon.json`

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
  }
]
```

| Field       | Type           | Notes                                                       |
|-------------|----------------|-------------------------------------------------------------|
| `id`        | number         | National Pokédex number                                     |
| `name`      | string         | Capitalized English name                                    |
| `gen`       | number         | Generation introduced (1–9)                                 |
| `type1`     | string         | Primary type, always present, capitalized                   |
| `type2`     | string \| null | Secondary type; null for single-type Pokémon                |
| `spriteUrl` | string         | Absolute URL to the official-artwork PNG on PokéAPI CDN     |

### 2.2 localStorage schema

| Key                              | Format      | Contents                                                          |
|----------------------------------|-------------|-------------------------------------------------------------------|
| `pokeroulette_lists`             | JSON object | `{viable:[...names], guessed:[...names], removed:[...names]}`     |
| `pokeroulette_sidebar_collapsed` | string      | `"true"` or `"false"`                                             |
| `pokeroulette_panels_collapsed`  | JSON object | `{viable:bool, guessed:bool, removed:bool}`                       |
| `pokeroulette_config`            | JSON object | Settings (see Section 5)                                          |

Lists are stored as arrays of **raw strings** (as entered by the user). Validation runs at render time, preserving unknown or malformed entries for correction. The internal list key for the Failed list is `removed`.

**First load**: if `pokeroulette_lists` is absent, all 1025 Pokémon names are written to `viable` in Pokédex order.

**Reset**: rebuilds `viable` from `pokemon.json`, filtered to the generations selected in Config. Empties `guessed` and `removed`. Requires a confirmation prompt.

---

## 3. Screens & Interactions

### 3.1 Roulette Screen

The default home screen. Renders a circular SVG wheel where each arc segment represents one valid entry in the Viable list. All segments have equal angular size.

**Segment appearance**

- Single-type Pokémon: solid fill using the type's color (see Section 6).
- Dual-type Pokémon: diagonal stripe pattern alternating between type1 and type2 colors at 45°, implemented as an SVG `<pattern>`.

**Center display**

| Wheel state | Center content              |
|-------------|-----------------------------|
| Idle        | "Click to spin" prompt      |
| Spinning    | Empty                       |
| Settled     | Empty                       |

**Idle spin**

When the Roulette screen is active and no spin is in progress, the wheel rotates continuously at ~1 RPM. Purely cosmetic. Resumes whenever the Roulette screen is returned to.

**Spin mechanics**

Activated by clicking the wheel or pressing **Space**.

- On activation, the wheel jumps to a high angular velocity.
- The wheel decelerates with cubic ease-out friction until velocity drops below a threshold (~0.05 rad/s).
- **No pre-selected winner**: the winning Pokémon is determined by reading whichever segment is under the 12 o'clock pointer when the wheel naturally stops. No snapping.
- Subsequent clicks/Space during an active spin add angular velocity (amount scales with current speed).
- After settling, the app transitions to the Silhouette Screen after a brief pause (~600ms).

**Empty state**

If Viable has no valid entries, the wheel is replaced with: *"No Pokémon in the viable list. Add some to get started."*

---

### 3.2 Silhouette Screen

Displays the selected Pokémon as a silhouette. The screen presents individual reveal buttons for each hint; the full reveal screen is only shown once all prerequisites have been satisfied.

**Layout (top to bottom)**

1. Name area — shows a "Reveal name" button or nothing depending on config.
2. Sprite wrapper — shows the silhouette or actual sprite depending on config. Clicking it when in silhouette state reveals the sprite.
3. Type badges / Generation label — each shown as reveal buttons or actual labels depending on config.
4. "Reveal all" button — skips directly to the Reveal Screen.

**Sprite rendering**

- Source: official-artwork PNG fetched from `spriteUrl`.
- Silhouette: `filter: brightness(0)` turns all opaque pixels black. A large "?" glyph is overlaid.
- Reveal: filter removed.
- A spinner is shown while the image loads. On load failure, the Pokémon's name is shown as a fallback.

**Reveal prerequisites**

Progression to the Reveal Screen is gated by a set of reveal conditions. Each configured hint contributes one condition. A condition is satisfied either individually (by clicking its reveal button) or all at once via "Reveal all".

| Hint      | Config options    | Prerequisite when "hidden"? |
|-----------|-------------------|-----------------------------|
| Name      | Hidden / Disabled | Yes (when Hidden)           |
| Sprite    | Hidden / Visible  | Yes (when Hidden)           |
| Types     | Visible / Hidden / Disabled | Yes (when Hidden) |
| Generation| Visible / Hidden / Disabled | Yes (when Hidden) |

- **Hidden**: the hint starts as a styled "Reveal X" button. Clicking reveals the content and marks the condition satisfied.
- **Visible**: the hint is shown immediately; condition auto-satisfied.
- **Disabled**: the hint is not shown on the silhouette screen; condition auto-satisfied (not a blocker).

The auto-transition fires as soon as all conditions are satisfied. "Reveal all" satisfies all conditions and transitions immediately. **Space** triggers "Reveal all".

**Sidebar behavior**

List editing is disabled while the Silhouette screen is active.

---

### 3.3 Reveal Screen

**Layout (top to bottom)**

1. Pokémon name — large, centered.
2. Revealed sprite — same image, `brightness(0)` filter removed.
3. Type badges and Generation label.
4. Three action buttons:

| Button  | Color           | Glyph | Tooltip                          | Action               |
|---------|-----------------|-------|----------------------------------|----------------------|
| Guessed | Green `#27C76A` | ✓     | Remove from roulette as guessed  | Move to Guessed list |
| Return  | Grey `#AAAAAA`  | ↩     | Return to the roulette           | Keep in Viable list  |
| Failed  | Red `#E24B4A`   | ✕     | Remove from roulette as failed   | Move to Failed list  |

Pressing any button updates lists in memory and `localStorage`, then transitions back to the Roulette screen (~250ms fade). The wheel re-renders without the acted-upon Pokémon, and idle spin resumes.

**Space** is disabled on the Reveal screen.

**Sidebar behavior**

List editing is disabled while the Reveal screen is active.

---

## 4. Lists Panel

A fixed sidebar on the right side of the screen. Width is `clamp(220px, 28vw, 320px)` when open, full viewport height.

### 4.1 Tab Bar

A narrow vertical strip (28px wide) on the left edge of the sidebar contains three stacked buttons:

| Button      | Icon | Action                          |
|-------------|------|---------------------------------|
| Collapse    | ‹ / › | Toggle sidebar open/closed     |
| Lists tab   | 📖   | Switch to the Lists view        |
| Config tab  | ⚙    | Switch to the Config view       |

The active tab is highlighted. Collapse/expand state persists in `localStorage`.

### 4.2 Lists View

The three lists:

- **Viable** — Pokémon eligible for the roulette.
- **Guessed** — Pokémon confirmed via the ✓ button.
- **Failed** — Pokémon excluded via the ✕ button.

Each list panel has a header that can be clicked to **collapse** or **expand** that list. When collapsed, the panel shrinks to header height only and the remaining panels fill the space. Collapse state persists in `localStorage`. Only one or all can be collapsed simultaneously.

Each list scrolls independently. Invalid entries (`unknown`, `duplicate`) are pinned to the top within their list.

**Entry rows**

Each row shows:
- A small type-color dot (split for dual-type).
- The display name (canonical capitalized form).
- An error indicator for `unknown` or `duplicate` entries.

**Edit mode**

Each list has an Edit button (✏ icon, rotated 135°) in its header. Clicking:
- Auto-expands the list if collapsed.
- Replaces the list body with a `<textarea>`, one name per line.
- Respects active filters (hidden entries are preserved and merged back on exit).
- Changes button text to "✓ Done". Edit mode exits only by clicking "Done" — clicking outside the textarea does not exit edit mode.
- Locking: Edit buttons are disabled while on Silhouette or Reveal screen.

**Filter bar**

Above the lists. Filters are display-only and do not affect the roulette pool.

| Filter      | Type         | Behavior                                                            |
| -------------| --------------| ---------------------------------------------------------------------|
| Name        | Text input   | Case-insensitive substring match against display name or raw string |
| Type        | Multi-select | Matches entries where type1 or type2 matches any selected type      |
| Errors only | Checkbox     | Hides all `valid` entries, shows only `unknown` and `duplicate`     |

Filters combine with AND logic. A "Clear" button resets all filters at once. Each list header shows "Visible / Total" counts.

**Drag and drop**

Valid entries can be dragged between lists (equivalent to action buttons). Disabled on Silhouette/Reveal screens.

**Validation states**

| State       | Meaning                                                  | Visual                                              |
|-------------|----------------------------------------------------------|-----------------------------------------------------|
| `valid`     | Matched to a known Pokémon, in exactly one list          | Normal; type-color dot                              |
| `unknown`   | No match found                                           | Amber highlight; pinned top; excluded from roulette |
| `duplicate` | Appears in more than one list                            | Red highlight; pinned top; excluded from roulette   |

Name matching is lenient: case-insensitive, strips punctuation (hyphens, apostrophes, periods), maps `♀`→`f` and `♂`→`m`.

---

### 4.3 Config View

Accessible via the ⚙ tab. Settings persist in `localStorage` under `pokeroulette_config`.

#### Hints

Controls what is shown on the Silhouette screen. Each hint is configured independently.

| Hint       | Options                      | Default  |
|------------|------------------------------|----------|
| Name       | Hidden / Disabled            | Hidden   |
| Sprite     | Hidden / Visible             | Hidden   |
| Types      | Visible / Hidden / Disabled  | Hidden   |
| Generation | Visible / Hidden / Disabled  | Hidden   |

Regardless of silhouette settings, all hints are always shown on the Reveal screen.

#### Generations

Checkboxes for each generation (Gen 1–9). Determines which Pokémon are included when the Reset button is used. All generations selected by default.

#### Import / Export

Encodes and decodes the full app state (lists + config) as a base64 string.

- **Export**: generates a base64-encoded payload and copies it to the clipboard. The payload encodes pokemon IDs (not names) for compactness.
- **Import**: decodes the base64 string from the textarea, maps IDs back to canonical names, and applies lists and config. Invalid IDs are silently dropped.

Payload format (before base64 encoding):
```json
{
  "version": 2,
  "lists": { "viable": [1, 4, 7], "guessed": [25], "removed": [] },
  "config": { "hints": { "name": "hidden", "sprite": "hidden", "types": "hidden", "gen": "hidden" }, "gens": [1, 2, 3, 4, 5, 6, 7, 8, 9] }
}
```

---

## 5. Transition Animations

| Transition               | Duration   | Style                       |
|--------------------------|------------|-----------------------------|
| Idle spin                | Continuous | ~1 RPM, linear              |
| Activation snap          | Instant    | Angular velocity jump       |
| Active spin deceleration | Variable   | Cubic ease-out friction     |
| Roulette → Silhouette    | ~400ms     | Fade                        |
| Silhouette → Reveal      | ~250ms     | Fast fade                   |
| Action button → Roulette | ~250ms     | Fade out / fade in          |

All animations respect `prefers-reduced-motion: reduce` — when set, transitions are instant and idle spin is disabled.

---

## 6. Type Color Reference

| Type     | Hex       | Type    | Hex       |
|----------|-----------|---------|-----------|
| Normal   | `#A8A878` | Flying  | `#A890F0` |
| Fire     | `#F08030` | Psychic | `#F85888` |
| Water    | `#6890F0` | Bug     | `#A8B820` |
| Electric | `#F8D030` | Rock    | `#B8A038` |
| Grass    | `#78C850` | Ghost   | `#705898` |
| Ice      | `#98D8D8` | Dragon  | `#7038F8` |
| Fighting | `#C03028` | Dark    | `#705848` |
| Poison   | `#A040A0` | Steel   | `#B8B8D0` |
| Ground   | `#E0C068` | Fairy   | `#EE99AC` |

---

## 7. Build Script

A Node.js script (`build-pokemon-json.js`) generates `pokemon.json` from the PokéAPI.

- **Runtime**: Node.js 18+ (built-in `fetch`, no external dependencies).
- **Output**: writes `pokemon.json` to the project root (idempotent).
- **Generation mapping**: derived from Pokédex ID ranges (Gen 1: 1–151, Gen 2: 152–251, etc.).
- **Progress**: logs progress to stdout.
- **Re-runnable**: safe to run at any time to pick up future generations.

---

## 8. Out of Scope

- User accounts or server-side sync
- Multiplayer or networked play
- Pokémon stats, moves, or gameplay data beyond name, generation, and type
- Localization (English only)
- PWA / offline support
- Runtime fetching of Pokémon metadata
- Undo/redo for list actions
