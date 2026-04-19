# Poké Roulette — Project Specification

Version 1.6

---

## 1. Overview

Poké Roulette is a single-page web application for randomly selecting a Pokémon from a configurable pool. It is primarily intended as a guessing-game aid: one player spins the roulette and sees the result; another player tries to guess the Pokémon from a silhouette before the full reveal.

|                     |                                                                                                                                                                                                                                 |
| ---------------------| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Tech stack**      | Plain HTML + CSS + JavaScript (no framework). Single `.html` file plus a `pokemon.json` data file.                                                                                                                              |
| **Data source**     | Bundled `pokemon.json` (see Section 2). Pokédex entries and biology data are fetched from PokéAPI at runtime (on demand, cached in memory).                                                                                     |
| **Sprites**         | Official artwork via PokéAPI CDN, fetched at display time by ID.                                                                                                                                                                |
| **Persistence**     | `localStorage` — all lists and settings survive page refresh.                                                                                                                                                                   |
| **Pokémon pool**    | All generations (currently 1025 Pokémon as of Gen 9).                                                                                                                                                                           |
| **Target platform** | Desktop browser primarily. Layout is fully responsive: roulette wheel, silhouette, and detail screens all scale to fill available viewport space uniformly. The sidebar stays fixed on the right. No minimum viewport enforced. |

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

| Key                              | Format      | Contents                                                      |
| ----------------------------------| -------------| ---------------------------------------------------------------|
| `pokeroulette_lists`             | JSON object | `{pool:[...names], done:[...names], todo:[...names]}`         |
| `pokeroulette_sidebar_collapsed` | string      | `"true"` or `"false"`                                         |
| `pokeroulette_panels_collapsed`  | JSON object | `{pool:bool, done:bool, todo:bool}`                           |
| `pokeroulette_config`            | JSON object | Settings (see Section 5)                                      |

Lists are stored as arrays of **raw strings** (as entered by the user). Validation runs at render time, preserving unknown or malformed entries for correction. The internal list keys are `pool`, `done`, and `todo`; the UI labels for these are **Roulette**, **Drawn**, and **The Pile** respectively.

**First load**: if `pokeroulette_lists` is absent, all 1025 Pokémon names are written to `pool` in Pokédex order.

**Reset**: rebuilds `pool` from `pokemon.json`, filtered to the generations selected in Config. Empties `done` and `todo`. Requires a confirmation prompt.

---

## 3. Screens & Interactions

There are four screens: Roulette, Silhouette, Detail, and Duplicate Resolver. Screens transition via CSS opacity fades.

### 3.1 Roulette Screen

The default home screen. Renders a circular SVG wheel where each arc segment represents one valid (or duplicate) entry in the Roulette list. All segments have equal angular size.

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

If the Roulette list has no valid entries, the wheel is replaced with: *"No Pokémon in the roulette list. Add some to get started."*

---

### 3.2 Silhouette Screen

Displays the selected Pokémon as a silhouette. The screen presents individual reveal controls for each hint; the full reveal screen is only shown once all prerequisites have been satisfied.

**Layout (top to bottom)**

1. Name area — shows a "Reveal name" button or nothing depending on config.
2. Sprite wrapper — shows the silhouette or actual sprite depending on config. Clicking it when in silhouette state reveals the sprite.
3. Type badges / Generation label — each shown as reveal buttons or actual labels depending on config.
4. Pokédex entry — shown blurred (clickable to reveal), immediately, or hidden depending on config.
5. "Reveal all" button — transitions directly to the Detail Screen.

**Sprite rendering**

- Source: official-artwork PNG fetched from `spriteUrl`.
- Silhouette: `filter: brightness(0)` turns all opaque pixels black. A large "?" glyph is overlaid.
- Reveal: filter removed.
- A spinner is shown while the image loads. On load failure, the Pokémon's name is shown as a fallback.

**Reveal prerequisites**

Progression to the Detail Screen is gated by a set of reveal conditions. Each configured hint contributes one condition. A condition is satisfied either individually (by interacting with its reveal control) or all at once via "Reveal all".

| Hint      | Config options              | Prerequisite when "hidden"? |
|-----------|-----------------------------|-----------------------------|
| Name      | Hidden / Disabled           | Yes (when Hidden)           |
| Sprite    | Hidden / Visible            | Yes (when Hidden)           |
| Types     | Visible / Hidden / Disabled | Yes (when Hidden)           |
| Generation| Visible / Hidden / Disabled | Yes (when Hidden)           |
| Pokédex   | Visible / Hidden / Disabled | Yes (when Hidden)           |

- **Hidden**: the hint starts concealed. Clicking its reveal control reveals the content and marks the condition satisfied. For the Pokédex entry, the text is blurred and the click target is the blurred element itself.
- **Visible**: the hint is shown immediately; condition auto-satisfied.
- **Disabled**: the hint is not shown on the silhouette screen; condition auto-satisfied (not a blocker).

The auto-transition fires as soon as all conditions are satisfied. "Reveal all" transitions immediately to the Detail Screen without satisfying individual conditions first.

**Space behavior**

**Space** reveals the next unrevealed hint in order: Generation → Types → Pokédex → Sprite → Name. Each press reveals one hint. Space does not trigger "Reveal all".

**Sidebar behavior**

List editing is disabled while the Silhouette screen is active.

---

### 3.3 Detail Screen

The Detail Screen is a Pokémon info card. It is opened either automatically after the spin flow (Roulette → Silhouette → Detail) or directly by clicking any list entry in the sidebar.

**Layout (top to bottom)**

1. Name row — Pokémon name centered, with a 📖 Biology toggle button on the left and a ✕ close button on the right.
2. Sprite — full-color image, `brightness(0)` filter removed.
3. Biology panel (collapsible) — shows Category, Height, Weight, and Abilities fetched from PokéAPI. Toggled by the 📖 button; data is fetched on demand and cached.
4. Type badges and Generation label.
5. Pokédex entry — fetched from PokéAPI on demand, cached in memory.
6. Action buttons (see below).
7. Duplicate warning (if applicable).

**Action buttons**

The buttons shown depend on how the Detail Screen was opened:

| Button     | Color           | Label        | Action                    | Shown when           |
|------------|-----------------|--------------|---------------------------|----------------------|
| To The Pile| Red `#E24B4A`   | To The Pile! | Move to todo (The Pile)   | Always               |
| Drawn      | Green `#27C76A` | Drawn!       | Move to done (Drawn)      | Opened from list     |
| Close (✕)  | —               | ✕            | Return, no list change    | Always (top right)   |

When opened via the spin flow, only "To The Pile!" and the ✕ close button are shown. When opened by clicking a list entry directly, "Drawn!" is also shown.

Pressing an action button moves the Pokémon to the target list in memory and `localStorage`, then returns to the Roulette screen. The wheel re-renders and idle spin resumes.

**Duplicate warning**

If the selected Pokémon appears in more than one list, a warning line is shown below the action buttons listing which lists contain it.

**Space** is disabled on the Detail screen.

**Sidebar behavior**

List editing is disabled while the Detail screen is active.

---

### 3.4 Duplicate Resolver Screen

Opened by clicking the ⚠ indicator on any duplicate entry in the sidebar lists.

**Layout**

- Title row: Pokémon name (single duplicate) or count ("N duplicates"), with a ✕ close button.
- Three columns, one per list (Roulette / Drawn / The Pile), each showing all raw entries for each duplicate Pokémon in that list.
- A "Select All" button in each column header selects all copies of all duplicates in that column.
- A "Resolve" button at the bottom applies the resolution.

**Interaction**

- Each row represents one raw entry. Clicking a row selects it as the copy to keep for that Pokémon. Selecting one copy dims the others in the same group. Clicking a selected row deselects it.
- On Resolve: for each duplicate Pokémon where at least one copy is selected, all other copies across all lists are removed; the selected copy is kept in its original list. Pokémon where no copy is selected are left unchanged.
- Resolving returns to the Roulette screen.
- The ✕ button returns to the Roulette screen without making changes.

---

## 4. Lists Panel

A fixed sidebar on the right side of the screen. Width is `clamp(220px, 28vw, 320px)` when open, full viewport height.

### 4.1 Tab Bar

A narrow vertical strip (28px wide) on the left edge of the sidebar contains three stacked buttons:

| Button      | Icon | Action                          |
|-------------|------|---------------------------------|
| Collapse    | ‹ / › | Toggle sidebar open/closed     |
| Lists tab   | ≡    | Switch to the Lists view        |
| Config tab  | ⚙    | Switch to the Config view       |

The active tab is highlighted. Collapse/expand state persists in `localStorage`.

### 4.2 Lists View

The three lists:

- **Roulette** (internal key: `pool`) — Pokémon eligible for the roulette.
- **Drawn** (internal key: `done`) — Completed items; Pokémon moved here via the Drawn! button.
- **The Pile** (internal key: `todo`) — Todo items; Pokémon moved here via the To The Pile! button.

Each list panel has a header that can be clicked to **collapse** or **expand** that list. When collapsed, the panel shrinks to header height only and the remaining panels fill the space. Collapse state persists in `localStorage`.

Each list scrolls independently. Invalid entries (`unknown`, `duplicate`) are sorted to the top within their list.

**Entry rows**

Each row shows:
- A small type-color dot (split diagonal for dual-type).
- The display name (canonical capitalized form).
- A generation label (`G{n}`).
- An error indicator for `unknown` (`?`) or `duplicate` (`⚠`) entries.

Clicking the ⚠ indicator on a duplicate opens the Duplicate Resolver Screen. Clicking any valid or duplicate entry row opens the Detail Screen for that Pokémon (with the "Drawn!" button visible).

**Edit mode**

Each list has an Edit button (✏ icon, rotated 135°) in its header. Clicking:
- Auto-expands the list if collapsed.
- Replaces the list body with a `<textarea>`, one name per line.
- Respects active filters (hidden entries are preserved and merged back on exit).
- Changes button to "✓ Done". Edit mode exits only by clicking "Done" — clicking outside the textarea does not exit edit mode.
- Locking: Edit buttons are disabled while on Silhouette, Detail, or Duplicate Resolver screen.

**Filter and sort bar**

Above the lists.

| Control     | Type         | Behavior                                                            |
| -------------| --------------| ---------------------------------------------------------------------|
| Name        | Text input   | Case-insensitive substring match against display name or raw string |
| Sort order  | Radio (ID / Name / Type) | Sorts all lists by the selected field                |
| Sort direction | Button (↑/↓) | Toggles ascending/descending; applies to the selected sort order |
| Clear       | Button       | Resets name filter and sort to defaults                             |

Each list header shows "Visible / Total" counts. Filters and sort are display-only and do not affect the roulette pool or the data model.

**Drag and drop**

Valid entries can be dragged between lists (moves the Pokémon). Within the same list, entries can be reordered by drag-and-drop when no sort order is active. Disabled on Silhouette/Detail/Duplicate Resolver screens.

**Validation states**

| State       | Meaning                                                  | Visual                                              |
|-------------|----------------------------------------------------------|-----------------------------------------------------|
| `valid`     | Matched to a known Pokémon, in exactly one list          | Normal; type-color dot                              |
| `unknown`   | No match found                                           | Amber highlight; sorted top; excluded from roulette |
| `duplicate` | Appears in more than one list                            | Red highlight; sorted top; included in roulette     |

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
| Pokédex    | Visible / Hidden / Disabled  | Hidden   |

Hint config changes take effect immediately: if the Silhouette screen is currently active, it re-renders in real time to reflect the new settings (reveal state resets to match the new config).

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
  "version": 3,
  "lists": { "pool": [1, 4, 7], "done": [25], "todo": [] },
  "config": { "hints": { "name": "hidden", "sprite": "hidden", "types": "hidden", "gen": "hidden", "dex": "hidden" }, "gens": [1, 2, 3, 4, 5, 6, 7, 8, 9] }
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
| Silhouette → Detail      | ~250ms     | Fast fade                   |
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
- Pokémon stats, moves, or gameplay data beyond name, generation, type, genus, height, weight, abilities, and Pokédex entry
- Localization (English only)
- PWA / offline support
- Undo/redo for list actions
