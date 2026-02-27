# Tech Architect — Card Game Simulation

A bespoke simulation where users play through multi-encounter campaigns, building technical architectures by drafting and playing technology cards. Each card represents a real technology (databases, caches, load balancers, etc.) with realistic properties and costs.

## Architecture

```
client/
  ├── index.html              # Main HTML (game layout)
  ├── app.js                  # Orchestrator: data loading, rendering coordination, state persistence
  ├── card-game.css           # Game-specific style imports
  ├── bespoke-template.css    # Template layout/utilities (do not edit)
  ├── modules/
  │   ├── engine.js           # Core game engine (pure logic, no DOM)
  │   ├── state.js            # Global UI state (drag state, game-over flags, encounter state)
  │   ├── notify.js           # Toast notification system
  │   ├── validate.js         # Content validation utilities
  │   └── content-generator.js # AI-assisted content generation
  ├── renderers/
  │   ├── hand.js             # Hand cards + pointer-based drag-and-drop
  │   ├── board.js            # Board slots + card removal drag
  │   ├── battle.js           # Deploy animation and result handling
  │   ├── draft.js            # Card drafting UI between encounters
  │   ├── header.js           # Top bar (metrics, retries, encounter progress)
  │   ├── overlays.js         # Full-screen overlays (transitions, campaign summary)
  │   ├── card-detail.js      # Card detail modal
  │   ├── tooltip.js          # Card hover tooltips
  │   ├── shared.js           # Shared rendering utilities
  │   └── authoring.js        # Content authoring panel
  ├── styles/                 # CSS for each renderer (hand.css, board.css, etc.)
  ├── public/
  │   ├── data/cards/         # Card deck JSON files
  │   ├── data/scenarios/     # Scenario JSON files
  │   ├── data/campaigns/     # Campaign JSON files
  │   ├── data/prompts/       # Content generation prompts
  │   ├── cosmo/              # Cosmo mascot SVGs
  │   └── help-content.html   # Help modal content
  └── design-system/          # CodeSignal Design System (submodule, do not edit)
server.js                     # Node.js HTTP + WebSocket server (state persistence)
vite.config.js                # Vite build config (proxy, build output)
initial_state.json            # Default campaign to load on server start
examples/                     # Example task configurations
  └── system-design-basics/
      ├── setup.sh            # Downloads release, starts prod server
      ├── run_solution.sh     # Copies solution.json for grading
      ├── RUBRIC.md           # AI grading rubric
      └── initial_state.json  # Campaign config for this task
```

## Game Engine (`modules/engine.js`)

Pure logic module with no DOM dependencies. Key methods:

### Scenario & State
- `loadScenario(scenario, deck)` — initializes with scenario goals and card deck
- `loadState(savedState)` — restores full state including campaign progress and telemetry
- `getState()` — serializes full state (board, metrics, campaign, telemetry) for saving

### Card Operations
- `canPlayCard(cardId)` — checks resources, prerequisites, slot availability
- `playCard(cardId)` — places card, finds new synergies, emits events
- `removeCard(cardId)` — removes card + cascade-removes cards with broken prerequisites
- `calculateMetrics()` — computes all metrics from base + card effects + synergies
- `checkGoals()` — evaluates which goals are met

### Campaign
- `loadCampaign(campaign)` — initializes multi-encounter campaign
- `advanceEncounter()` — moves to next encounter, carries over cards
- `getCampaignProgress()` — returns current encounter index, total encounters

### Retries & Telemetry
- `getMaxRetries()` / `getRetriesRemaining()` — campaign-wide retry pool
- `useRetry()` — consumes a retry
- `recordAttempt()` — logs a deploy attempt (cards played, metrics, success/fail)
- `recordDraft()` — logs a draft choice (cards offered, cards picked)

## Data Format

### Card Deck (`data/cards/<deckId>.json`)
```json
{
  "deckId": "system-architecture",
  "cards": [{
    "id": "redis",
    "name": "Redis",
    "type": "cache",
    "icon": "🔴",
    "cost": 3,
    "description": "...",
    "effects": { "latency": -80, "throughput": 3000, "reliability": 1.0, "monthlyCost": 150 },
    "prerequisites": ["backend"],
    "synergies": [{ "with": "postgresql", "metric": "latency", "bonus": -25, "reason": "..." }],
    "tags": ["cache", "nosql", "performance"]
  }]
}
```

### Scenario (`data/scenarios/<scenarioId>.json`)
```json
{
  "id": "high-traffic-webapp",
  "briefing": "...",
  "deckId": "system-architecture",
  "totalResources": 20,
  "baseMetrics": { "latency": { "base": 500, "unit": "ms", "label": "Response Time", "lowerIsBetter": true } },
  "goals": [{ "metric": "latency", "operator": "<=", "value": 200, "label": "..." }]
}
```

### Campaign (`data/campaigns/<campaignId>.json`)
```json
{
  "campaignId": "system-design-journey",
  "name": "System Design Journey",
  "encounters": [
    { "scenarioId": "startup-launch", "deckId": "system-architecture", "draftPool": [...] }
  ],
  "maxRetries": 3
}
```

## State Persistence

- Client auto-saves to `POST /state` (debounced 800ms)
- Server writes `solution.json` to disk
- On load: tries `/state` (saved), falls back to `/initial-state` (fresh)
- `initial_state.json` at server root specifies the campaign (or standalone scenario)

## Drag-and-Drop

Uses pointer events (not HTML5 drag-and-drop) for iframe compatibility:
- `pointerdown` on card → threshold-based drag initiation
- Visual clone follows pointer during drag
- `document.elementFromPoint()` for drop zone detection
- Works reliably inside CodeSignal preview iframes

## Development

```bash
npm install
npm run start:dev    # Vite dev server (port 3000) + API server (port 3031)
npm run build        # Production build to dist/
```

## Adding New Content

1. Create a card deck JSON in `client/public/data/cards/<deckId>.json`
2. Create scenario JSONs in `client/public/data/scenarios/<scenarioId>.json`
3. Create a campaign JSON in `client/public/data/campaigns/<campaignId>.json`
4. Reference the `campaignId` in the task's `initial_state.json`

## Key Conventions

- All game logic in `engine.js`, rendering split across `renderers/`
- UI state (drag, overlays, game-over) managed in `state.js`
- Card prerequisites use tag-based matching (e.g., "backend" matches any card with that tag)
- Synergies are unidirectional — defined on one card per pair
- Metrics with `lowerIsBetter: true` (latency, cost) decrease as good; others increase
- CSS uses design system variables (`--Colors-*`, `--UI-Spacing-*`) for theme support
