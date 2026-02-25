# Card Game Engine — Bespoke Simulation

A reusable card game engine for CodeSignal bespoke simulations. Learners pick options under constraints (budget, slots, prerequisites) and watch metrics react in real-time. Content is just JSON — one engine covers system design, frontend stacks, data pipelines, security architecture, ML infra, and more.

The first proof-of-concept scenario is "Tech Architect" (system design), but the engine is topic-agnostic.

## How It Works

### For Learners

1. A **scenario** sets the context (e.g., "Your startup just got featured on Hacker News — build an architecture that handles the traffic spike")
2. A hand of **cards** represents available choices — each with a resource cost, effects on metrics, prerequisites, and synergies with other cards
3. Learners **drag cards onto a board** with limited slots and a finite resource budget
4. **Metrics update in real-time** as cards are placed or removed (latency, throughput, reliability, cost — or any custom metrics)
5. **Goals** define success (e.g., "latency ≤ 200ms", "uptime ≥ 99%") — all must be met
6. The AI grader evaluates the final architecture via `RUBRIC.md`

### For Content Creators

Two JSON files = one simulation:

- **Card deck** (`client/public/data/cards/<deckId>.json`) — array of cards with `id`, `name`, `icon`, `type`, `cost`, `effects`, `prerequisites`, `synergies`
- **Scenario** (`client/public/data/scenarios/<scenarioId>.json`) — briefing text, base metrics, goals, resource budget, available cards from the deck

No code changes needed. See `examples/system-design-basics/` for a complete task template.

## Architecture

```
server.js                     Node.js HTTP server — state persistence, static file serving
client/
  app.js                      UI controller — rendering, drag-and-drop, tooltips, popups
  modules/engine.js           Core game logic — metrics, synergies, prerequisites, goals
  public/data/cards/           Card deck JSON files
  public/data/scenarios/       Scenario JSON files
  design-system/              CodeSignal design system (CSS/components)
examples/
  system-design-basics/       Complete task template (rubric, grading script, shell scripts)
```

**State flow:** Client loads scenario + deck → user places/removes cards → engine recalculates metrics → UI updates → auto-saves to `POST /state` (800ms debounce) → `solution.json` on disk.

**AI grading flow:** `run_solution.sh` → `parse_solution.py` reads `solution.json` → generates `architecture_summary.txt` → AI grader evaluates against `RUBRIC.md`.

## Current Content

| Scenario | Deck | Resources | Goals |
|---|---|---|---|
| High-Traffic Web App | system-architecture (20 cards) | 14 | Latency ≤200ms, 10K+ req/s, 99%+ uptime, ≤$1K/mo |
| Microservices Migration | system-architecture (20 cards) | 16 | Latency ≤150ms, 8K+ req/s, 99.5%+ uptime, ≤$1.2K/mo |

## Development

```bash
nvm use 20        # Node.js ≥20 required (Vite)
npm install
npm run start:dev # http://localhost:3000
```

## Production Build

```bash
npm run build     # Output → dist/
```

GitHub Actions workflow creates a release on push to `main`.

## Creating a New Task

1. Copy `examples/system-design-basics/` as a starting point
2. Edit `initial_state.json` — set `scenarioId` and `deckId`
3. Create or reuse card deck and scenario JSON files
4. Adjust `RUBRIC.md` for your grading criteria

## v1 Scope and Limitations

Current version is **puzzle mode**: all cards visible, single round, drag-to-build. Multiple valid solutions exist per scenario. The engine is designed for expansion but these are not yet implemented.

## Future Plans

- **New content** — frontend stacks, data pipelines, security architecture, ML infra, DevOps toolchains
- **Deck building** — learners choose which cards to bring into a scenario (tests breadth of knowledge)
- **Multi-round scenarios** — traffic patterns evolve, architecture must adapt (tests operational thinking)
- **Hidden card effects** — true costs/performance revealed after placement (tests risk assessment)
- **Failure injection** — random events mid-scenario ("Your primary DB just went down")
- **Difficulty scaling** — same scenario with tighter budgets or stricter goals
- **Competitive mode** — multiple learners, same scenario, compare results

## License

MIT
