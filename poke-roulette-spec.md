# Poké Roulette — Project Specification

Version 1.0

---

## 1. Overview

Poké Roulette is a single-page web application for randomly selecting a Pokémon from a configurable pool. It is primarily intended as a guessing-game aid: one player spins the roulette and sees the result; another player tries to guess the Pokémon from a silhouette before the full reveal.

|                  |                                                                                                                     |
| ------------------| ---------------------------------------------------------------------------------------------------------------------|
| **Tech stack**   | Plain HTML + CSS + JavaScript (no framework required). Single `.html` file is acceptable.                           |
| **Data source**  | PokéAPI (`https://pokeapi.co`) — fetched at runtime for Pokémon names and type data. No sprites or images are used. |
| **Persistence**  | `localStorage` — all three lists survive page refresh.                                                              |
| **Pokémon pool** | All generations (currently 1025 Pokémon as of Gen 9).                                                               |

---

## 2. Data Model

Each Pokémon entry carries the following fields:

| Field   | Type         | Notes                                      |                                              |                         |
| ---------| --------------| --------------------------------------------| ----------------------------------------------| -------------------------|
| `id`    | number       | National Pokédex number                    |                                              |                         |
| `name`  | string       | Capitalized English name, e.g. "Bulbasaur" |                                              |                         |
| `type1` | string       | Primary type (always present)              |                                              |                         |
| `type2` | string \     | null                                       | Secondary type; null for single-type Pokémon |                         |
| `list`  | `"viable"` \ | `"guessed"` \                              | `"removed"`                                  | Current list membership |

### localStorage schema

| Key                    | Format      | Contents                                                      |
| ------------------------| -------------| ---------------------------------------------------------------|
| `pokeroulette_pokemon` | JSON array  | Full Pokémon data cache `[{id, name, type1, type2}]`          |
| `pokeroulette_lists`   | JSON object | `{viable:[...names], guessed:[...names], removed:[...names]}` |

Lists are stored as arrays of **raw strings** as entered by the user, not as IDs. Validation is performed at render time (see Section 4). This preserves unknown or malformed entries so the user can correct them.

On first load, if `pokeroulette_pokemon` is absent, fetch all Pokémon from PokéAPI (`/api/v2/pokemon?limit=10000`), then batch-fetch type data. Show a loading indicator during this process. Once cached, the API is not called again unless the user manually clears the cache.

---

## 3. Screens & Interactions

### 3.1 Roulette Screen

The default home screen. Renders a pie chart (SVG) where each slice represents one **valid** entry in the Viable list. All slices have equal angular size — every eligible Pokémon has the same probability of being selected.

**Slice appearance**

- Single-type Pokémon: solid fill using the type's color (see Section 6).
- Dual-type Pokémon: diagonal stripe pattern — stripes alternate between type1 and type2 colors at 45°. Implemented as an SVG `<pattern>` in `<defs>`, reused across slices. Stripe width ≈ 4–6px at the chart's outer radius.

**Spin interaction**

- The user taps / clicks anywhere on the pie chart to spin.
- The winner is determined by uniform random selection from the valid Viable entries **before** the animation begins. The animation is purely cosmetic.
- The chart rotates with a cubic ease-out deceleration over approximately 3–5 seconds, landing on the pre-selected Pokémon.
- A fixed pointer at the 12 o'clock position indicates the selected slice when the spin stops.
- After the spin completes, the app transitions to the Silhouette Screen.

**Empty state**

If the Viable list has no valid entries, the chart area displays: *"No Pokémon in the viable list. Add some to get started."* Tapping does nothing.

---

### 3.2 Silhouette Screen

Displays the selected Pokémon as a text-based silhouette. The name is hidden. The type colors provide a visual hint before the reveal.

**Silhouette rendering**

- The Pokémon's outline is an SVG shape filled with the background color (dark cutout effect).
- The stroke is colored by type:
  - Single-type: uniform stroke in the type color.
  - Dual-type: stroke is diagonally split — upper-left half in type1 color, lower-right half in type2 color, achieved via a `clipPath` or `linearGradient` on the stroke. The diagonal divider runs from the bounding box's top-left to bottom-right.
- A large "?" glyph is centered over the silhouette.

**Reveal interaction**

Tapping anywhere on the silhouette transitions to the Reveal Screen (~400ms fade or card-flip animation).

---

### 3.3 Reveal Screen

**Layout (top to bottom)**

1. Pokémon name — large, centered.
2. Silhouette shape — same SVG as Screen 2, but fill replaced with type color(s). "?" removed.
3. Three action buttons in a row:

| Button  | Color           | Glyph | Action                   |
| ---------| -----------------| -------| --------------------------|
| Confirm | Green `#27C76A` | ✓     | Move to Guessed list     |
| Return  | Grey `#AAAAAA`  | ↩     | Move back to Viable list |
| Remove  | Red `#E24B4A`   | ✕     | Move to Removed list     |

Pressing any button moves the Pokémon (updates the lists, saves to `localStorage`) and immediately transitions back to the Roulette Screen. The roulette re-renders without the acted-upon Pokémon in the Viable list.

---

## 4. Lists Panel

A persistent sidebar (desktop) or collapsible bottom panel (mobile) showing all three lists at all times, regardless of which screen is active.

The three lists are:

- **Viable** — Pokémon eligible for the roulette. Pre-populated with all Pokémon on first load.
- **Guessed** — Pokémon confirmed via the ✓ button.
- **Removed** — Pokémon excluded from future rolls via the ✕ button.

---

### 4.1 Editable Text Lists

Each list is a **plain text area** where each line is one Pokémon name. The user can edit freely — typing, deleting, and pasting bulk lists.

**Paste & validation**

On any edit (paste, keystroke, or blur), each line is validated and transformed:

1. **Normalize**: trim whitespace, collapse internal whitespace, convert to a canonical form for matching.
2. **Match**: attempt a case-insensitive match against the full known Pokémon name list. Leniency rules:
   - Case-insensitive (`bulbasaur` → Bulbasaur).
   - Leading/trailing whitespace stripped.
   - Internal whitespace normalized (multiple spaces/tabs → single space).
   - Special characters: hyphens, apostrophes, and periods are ignored during matching (e.g. `farfetchd` → Farfetch'd, `mr mime` → Mr. Mime, `nidoranf` or `nidoran f` → Nidoran♀).
   - Common suffixes stripped before retry: `-galar`, `-alola`, `-hisui`, `-paldea` etc. are recognized as regional form qualifiers.
3. **Assign state** to each line:

| State       | Meaning                                                 | Visual treatment                                                             |
| -------------| ---------------------------------------------------------| ------------------------------------------------------------------------------|
| `valid`     | Matched to a known Pokémon, appears in exactly one list | Normal display; small type-color dot on the left                             |
| `unknown`   | Could not be matched to any known Pokémon               | Highlighted in amber/yellow; shown in all lists, excluded from roulette      |
| `duplicate` | This name appears in more than one list                 | Highlighted in red/pink; shown in all affected lists, excluded from roulette |

The raw string the user typed is always preserved in the text area. Transformation (capitalization correction, etc.) is only applied to the display name shown in the read-only row view, not to the text area contents.

**Duplicate detection** is cross-list: if "Bulbasaur" appears in both Viable and Guessed, both occurrences are marked as `duplicate`.

**Read-only row view vs. edit mode**

Each list has two visual modes, toggled by clicking an Edit button (pencil icon):

- **Row view** (default): each entry rendered as a styled row with the type-color dot, the display name, and any error highlight. This is the view shown during the roulette.
- **Edit mode**: the list becomes a `<textarea>` with one name per line, raw strings as stored. The user edits freely; on exit (clicking Done or clicking outside), validation runs.

---

### 4.2 Filters

One shared filter bar applies to all three lists simultaneously. It sits above the lists panel.

**Filter controls**

| Filter      | Type                  | Behavior                                                                                |
| -------------| -----------------------| -----------------------------------------------------------------------------------------|
| Name        | Text input            | Case-insensitive substring match against the display name or the raw string             |
| Type        | Multi-select dropdown | Shows entries where type1 or type2 matches any selected type. Options are the 18 types. |
| Errors only | Toggle/checkbox       | When active, hides all `valid` entries — only shows `unknown` and `duplicate` rows      |

Filters are combinable (AND logic): an entry must pass all active filters to be shown.

Filters do **not** affect the roulette pool — they are display-only. All valid Viable entries remain in the roulette regardless of whether they are currently filtered out of view.

A "Clear filters" button resets all filters at once.

---

### 4.3 List Management

- **Drag and drop**: entries can be dragged between lists.
- **Reset all**: clears `localStorage` and restores all Pokémon to the Viable list (with a confirmation prompt).
- **Entry count**: each list header shows a count of visible entries vs. total (e.g. "Viable — 12 / 300" when filtered).

---

## 5. Transition Animations

| Transition                   | Duration    | Style                              |
| ------------------------------| -------------| ------------------------------------|
| Spin (Roulette → Silhouette) | 3–5 seconds | Pie chart rotation, cubic ease-out |
| Silhouette → Reveal          | ~400ms      | Fade or horizontal card flip       |
| Action button → Roulette     | ~250ms      | Fade out / fade in                 |

All animations must respect `prefers-reduced-motion: reduce` — when set, transitions are instant.

---

## 6. Type Color Reference

| Type | Hex | Type | Hex |
|---|---|---|---|
| Normal | `#A8A878` | Flying | `#A890F0` |
| Fire | `#F08030` | Psychic | `#F85888` |
| Water | `#6890F0` | Bug | `#A8B820` |
| Electric | `#F8D030` | Rock | `#B8A038` |
| Grass | `#78C850` | Ghost | `#705898` |
| Ice | `#98D8D8` | Dragon | `#7038F8` |
| Fighting | `#C03028` | Dark | `#705848` |
| Poison | `#A040A0` | Steel | `#B8B8D0` |
| Ground | `#E0C068` | Fairy | `#EE99AC` |

These are the standard community-agreed colors used in most Pokémon fan tools.

---

## 7. Out of Scope (v1)

- User accounts or server-side sync
- Multiplayer or networked play
- Pokémon sprites, artwork, or any images
- Pokémon stats, moves, or any gameplay data beyond name and type
- Localization (English only)
- PWA / offline support
