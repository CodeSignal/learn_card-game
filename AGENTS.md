# Tech Architect — Card Game Simulation

A bespoke simulation where users build technical architectures by playing technology cards. Each card represents a real technology (databases, caches, load balancers, etc.) with realistic properties and costs.

## Architecture

```
client/
  ├── index.html              # Main HTML (game layout)
  ├── app.js                  # Orchestrator: data loading, rendering, drag-and-drop, state persistence
  ├── card-game.css           # All game-specific styles
  ├── bespoke-template.css    # Template layout/utilities (do not edit)
  ├── modules/
  │   └── engine.js           # Core game engine (pure logic, no DOM)
  ├── public/                 # Static assets copied to dist as-is
  │   ├── data/cards/         # Card deck JSON files
  │   ├── data/scenarios/     # Scenario JSON files
  │   └── help-content.html   # Help modal content
  └── design-system/          # CodeSignal Design System (submodule, do not edit)
server.js                     # Node.js HTTP + WebSocket server (state persistence)
vite.config.mjs               # Vite build config (proxy, build output)
examples/                     # Example task configurations for Engine
  └── system-design-basics/
      ├── setup.sh            # Downloads release, starts prod server
      ├── run_solution.sh     # Copies solution.json, runs parser
      ├── parse_solution.py   # Converts game state to human-readable summary
      ├── RUBRIC.md           # AI grading rubric
      └── initial_state.json  # Scenario config for this task
```

## Game Engine (`modules/engine.js`)

Pure logic module with no DOM dependencies. Key methods:
- `loadScenario(scenario, deck)` — initializes with scenario goals and card deck
- `loadState(savedState)` — restores board from saved state
- `canPlayCard(cardId)` — checks resources, prerequisites
- `playCard(cardId)` — places card, finds new synergies, emits events
- `removeCard(cardId)` — removes card + cascade-removes cards with broken prerequisites
- `calculateMetrics()` — computes all metrics from base + card effects + synergies
- `checkGoals()` — evaluates which goals are met
- `getState()` — serializes full state for saving

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
  "goals": [{ "metric": "latency", "operator": "<=", "value": 200, "label": "..." }],
  "availableCards": ["nodejs", "redis", ...]
}
```

## State Persistence

- Client auto-saves to `POST /state` (debounced 800ms)
- Server writes `solution.json` to disk
- On load: tries `/state` (saved), falls back to `/initial-state` (fresh)
- `initial_state.json` at server root specifies scenario and deck

## Development

```bash
npm install
npm run start:dev    # Vite dev server (port 3000+) + API server (port 3001)
npm run build        # Production build to dist/
```

## Adding New Decks/Scenarios

1. Create a card deck JSON in `client/public/data/cards/<deckId>.json`
2. Create scenario JSONs in `client/public/data/scenarios/<scenarioId>.json`
3. Reference the deckId and scenarioId in the task's `initial_state.json`

## Key Conventions

- All game logic in `engine.js`, all rendering in `app.js`
- Card prerequisites use tag-based matching (e.g., "backend" matches any card with that tag)
- Synergies are unidirectional — defined on one card per pair
- Metrics with `lowerIsBetter: true` (latency, cost) decrease as good; others increase
