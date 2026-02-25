# Card Game Engine — Bespoke Simulation

A reusable card game engine for CodeSignal bespoke simulations. Learners play through multi-encounter campaigns, drafting cards between encounters and deploying architectures under constraints (budget, slots, prerequisites). Content is just JSON — one engine covers system design, frontend stacks, data pipelines, security architecture, ML infra, and more.

The first proof-of-concept campaigns are "System Design Journey" and "ML Platform Journey", but the engine is topic-agnostic.

## How It Works

### For Learners

1. A **campaign** defines a sequence of encounters with increasing difficulty
2. Before each encounter, learners **draft new cards** to add to their collection
3. A **scenario** sets the context (e.g., "Your startup just got featured on Hacker News — build an architecture that handles the traffic spike")
4. A hand of **cards** represents available choices — each with a resource cost, effects on metrics, prerequisites, and synergies with other cards
5. Learners **drag cards onto a board** with limited slots and a finite resource budget
6. **Deploy** to see if the architecture meets the encounter goals
7. A limited pool of **retries** spans the whole campaign — spend them wisely
8. The AI grader evaluates the full campaign via `RUBRIC.md`, reading `solution.json` which includes behavioral telemetry (attempt log, draft log)

### For Content Creators

Three JSON files = one campaign:

- **Card deck** (`client/public/data/cards/<deckId>.json`) — array of cards with `id`, `name`, `icon`, `type`, `cost`, `effects`, `prerequisites`, `synergies`
- **Scenario** (`client/public/data/scenarios/<scenarioId>.json`) — briefing text, base metrics, goals, resource budget, available cards from the deck
- **Campaign** (`client/public/data/campaigns/<campaignId>.json`) — sequence of encounters referencing scenarios and decks, draft pools, retry budget

No code changes needed. See `examples/system-design-basics/` for a complete task template.

## Architecture

```
server.js                       Node.js HTTP + WebSocket server (state persistence, content generation)
vite.config.js                  Vite build config (proxy, build output)
initial_state.json              Default campaign/scenario to load on server start
client/
  index.html                    Main HTML structure
  app.js                        UI orchestrator — data loading, rendering coordination, state persistence
  bespoke-template.css          Template layout/utilities (do not edit)
  card-game.css                 Game-specific style imports
  modules/
    engine.js                   Core game engine (pure logic, no DOM) — metrics, synergies, campaigns, telemetry
    state.js                    Global UI state management
    notify.js                   Toast notification system
    validate.js                 Content validation utilities
    content-generator.js        AI-assisted content generation helpers
  renderers/
    hand.js                     Hand cards rendering and pointer-based drag-and-drop
    board.js                    Board slots rendering and card removal
    battle.js                   Deploy animation and results
    draft.js                    Card drafting UI between encounters
    header.js                   Top bar (metrics, retries, encounter info)
    overlays.js                 Full-screen overlays (encounter transitions, campaign summary)
    card-detail.js              Card detail modal
    tooltip.js                  Card hover tooltips
    shared.js                   Shared rendering utilities
    authoring.js                Content authoring panel
  styles/                       CSS files for each renderer
  public/
    data/cards/                 Card deck JSON files
    data/scenarios/             Scenario JSON files
    data/campaigns/             Campaign JSON files
    data/prompts/               Content generation prompt templates
    cosmo/                      Cosmo mascot SVG assets
    help-content.html           Help modal content
  design-system/                CodeSignal design system (submodule, do not edit)
examples/
  system-design-basics/         Complete task template (rubric, shell scripts)
```

**State flow:** Client loads campaign → loads encounter scenario + deck → user drafts/places/removes cards → engine recalculates metrics → UI updates → auto-saves to `POST /state` (800ms debounce) → `solution.json` on disk.

**AI grading flow:** AI grader reads `solution.json` directly (contains full game state + behavioral telemetry) and evaluates against `RUBRIC.md`.

## Current Content

### Campaigns

| Campaign | Encounters | Deck |
|---|---|---|
| System Design Journey | startup-launch → going-viral → production-scale | system-architecture |
| ML Platform Journey | first-model → model-in-production → platform-at-scale | ml-infrastructure |

### Card Decks

| Deck | Cards |
|---|---|
| system-architecture | 20 cards (databases, caches, load balancers, CDNs, etc.) |
| system-design-patterns | Pattern-focused cards |
| ml-infrastructure | ML-specific infrastructure cards |

## Development

```bash
nvm use 20          # Node.js >=20 required (Vite)
npm install
npm run start:dev   # Vite dev server (port 3000) + API server (port 3031)
```

## Production Build

```bash
npm run build       # Output → dist/
```

GitHub Actions workflow creates a release on push to `main`.

## Creating a New Task

1. Copy `examples/system-design-basics/` as a starting point
2. Create or reuse card deck, scenario, and campaign JSON files
3. Edit `initial_state.json` — set `campaignId` (or `scenarioId` + `deckId` for standalone)
4. Adjust `RUBRIC.md` for your grading criteria

## License

MIT
