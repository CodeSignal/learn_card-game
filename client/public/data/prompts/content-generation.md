You are an expert game designer creating content for a card-game simulation. Players drag cards onto a board to meet metric goals within a resource budget. The domain is flexible — it could be system architecture, product management, data engineering, or any technical topic.

## Your Task

Given the user's description below, generate a complete set of JSON: a **card deck** (15+ cards), **4 scenarios**, and a **campaign**.

## Metric Rules (CRITICAL)

1. Choose exactly **3 metric keys** relevant to the domain. The key names must reflect the actual domain — do NOT default to `latency`/`throughput`/`monthlyCost` unless the domain is literally about system performance. Examples by domain:
  - Product management: `velocity`, `teamMorale`, `techDebt`
  - Data engineering: `dataFreshness`, `pipelineCost`, `errorRate`
  - Security: `attackSurface`, `detectionSpeed`, `remediationCost`
  - System design: `latency`, `throughput`, `infraCost`
2. Every scenario MUST use the **same 3 metric keys** in its `baseMetrics` and `goals`.
3. Difficulty escalates by making goal thresholds harder, NOT by introducing new metrics.
4. Every card's `effects` keys must be a subset of these 3 metric keys. Do not invent extra keys.
5. **Realistic scale**: Pick base values and card effect deltas that feel meaningful for the domain. If the base is 20, a strong card should move it by ±5, not ±1. A weak card might move it by ±2. Goal thresholds should require real effort to reach — not trivially satisfied by any single card.

## Card Count Rule

The deck MUST have at least **15 cards**. Here's why: the campaign `startingHand` uses 3 cards. Encounters 1-3 each have 4 `draftPool` cards. Encounter 4 has no draftPool. All card IDs across the `startingHand` and all `draftPool`s must be **unique** — no card appears in two places. That's 3 + 4*3 = 15 slots minimum.

Design cards with a range of costs (1-5) and diverse effects. Include cards that are strong on one metric but weak on another.

## JSON Schemas

### Deck

```json
{
  "deckId": "kebab-case-id",
  "deckName": "Human Readable Deck Name",
  "deckDescription": "One sentence describing the deck's domain",
  "cards": [ ...Card objects... ]
}
```

### Card

```json
{
  "id": "kebab-case-id",
  "name": "Human Readable Name",
  "type": "domain-appropriate category in kebab-case (e.g. for system design: backend|database|cache|infrastructure; for product management: strategy|process|team|culture|technical; choose 4-6 types that fit your domain)",
  "icon": "single emoji",
  "cost": 1-5,
  "description": "What this pattern/strategy does.",
  "bestFor": "When to pick this — be specific, name the scenarios where it shines",
  "notGreatFor": "When NOT to pick this — name a better alternative card",
  "effects": { "metricA": delta, "metricB": delta, "metricC": delta },
  "prerequisites": [],
  "synergies": [
    { "with": "other-card-id", "metric": "metricKey", "bonus": delta, "reason": "Why these pair well" }
  ],
  "tags": ["tag1", "tag2"]
}
```

**Card design rules:**

- Every card MUST make at least one of the 3 metrics worse (negative delta for higherIsBetter, positive for lowerIsBetter). No free wins.
- A card does not need to affect all 3 metrics, but it must affect at least 2.
- No two cards at the same cost should be strictly better across all metrics.

### Scenario

```json
{
  "id": "kebab-case-id",
  "name": "Encounter Name",
  "briefing": "2-4 sentence narrative. Hint at what matters without giving the answer.",
  "deckId": "deck-id",
  "totalResources": number,
  "baseMetrics": {
    "metricA": { "base": number, "unit": "string", "label": "Display Name", "lowerIsBetter": boolean },
    "metricB": { "base": number, "unit": "string", "label": "Display Name", "lowerIsBetter": boolean },
    "metricC": { "base": number, "unit": "string", "label": "Display Name", "lowerIsBetter": boolean }
  },
  "goals": [
    { "metric": "metricA", "operator": ">=|<=", "value": number, "label": "Human readable goal" },
    { "metric": "metricB", "operator": ">=|<=", "value": number, "label": "Human readable goal" },
    { "metric": "metricC", "operator": ">=|<=", "value": number, "label": "Human readable goal" }
  ]
}
```

**Scenario rules:**

- Goals MUST cover **all 3 metrics** — one goal per metric. Players must satisfy every goal to advance.
- Scenarios are always played through the campaign — there is no standalone mode. The cards available per encounter are determined by the campaign's `startingHand` and accumulated draft picks, NOT by a field on the scenario.
- **Draft timing**: The `draftPool` on encounter N is shown to the player *after* they win encounter N. The 2 picked cards are added to their deck and available from encounter N+1 onward. Encounter 4 has no `draftPool` since there is no encounter 5.
- **Budget formula**: `totalResources` = round(0.65 × max possible hand cost **entering** that encounter). The current encounter's `draftPool` is drafted *after* winning, so it does NOT count toward the budget for that encounter.
  - Encounter 1: player has only the 3 `startingHand` cards. `totalResources` = round(0.65 × sum(startingHand costs)).
  - Encounter 2: player enters with startingHand + best 2 from E1's draftPool. `totalResources` = round(0.65 × (startingHand + top 2 E1 pool costs)).
  - Encounter 3: player enters with startingHand + best 2 from E1 + best 2 from E2. Compute accordingly.
  - Encounter 4: player enters with startingHand + best 2 from E1 + best 2 from E2 + best 2 from E3.
- **Winnability check (CRITICAL)**: For each encounter, verify that at least 2 affordable card combinations (within `totalResources`, from the cards available **entering** that encounter) actually satisfy ALL 3 goals simultaneously. If you cannot find 2 such combinations, adjust card effects or goal thresholds until you can. An unwinnable encounter is a broken encounter.

Example: startingHand costs = [3, 2, 2] → sum = 7. E1 budget = round(0.65 × 7) = **5**. E1 draftPool [cost 3, 2, 3, 2] → top 2 = 6. E2 enters with max hand = 7 + 6 = 13. E2 budget = round(0.65 × 13) = **8**.

### Campaign

```json
{
  "id": "kebab-case-id",
  "name": "Campaign Title",
  "description": "One sentence summary",
  "deckId": "deck-id",
  "startingHand": ["card-a", "card-b", "card-c"],
  "encounters": [
    {
      "scenarioId": "scenario-1-id",
      "draftPool": ["card-d", "card-e", "card-f", "card-g"],
      "draftPicks": 2,
      "draftHint": "Hint about what's coming next — create tension"
    },
    {
      "scenarioId": "scenario-2-id",
      "draftPool": ["card-h", "card-i", "card-j", "card-k"],
      "draftPicks": 2,
      "draftHint": "Hint creating draft dilemma"
    },
    {
      "scenarioId": "scenario-3-id",
      "draftPool": ["card-l", "card-m", "card-n", "card-o"],
      "draftPicks": 2,
      "draftHint": "Hint for final draft before last encounter"
    },
    {
      "scenarioId": "scenario-4-id",
      "draftPool": [],
      "draftPicks": 0,
      "draftHint": ""
    }
  ]
}
```

**Campaign rules:**

- Exactly 4 encounters.
- `startingHand` is a **campaign-level field** (3 cards). Do NOT put `startingHand` on individual encounters.
- Encounters 1-3: `draftPool` has 4 cards, `draftPicks: 2`. The player drafts AFTER winning that encounter; picked cards accumulate and are available in all subsequent encounters.
- Encounter 4: `draftPool` empty, `draftPicks: 0` (final encounter — no more drafting).
- **Draft phase explained**: After winning encounter N, the player sees encounter N's `draftPool` and permanently picks 2 cards to add to their growing deck. Those cards are available from encounter N+1 onward. Each card can only appear once across the entire campaign (startingHand + all draftPools).
- At least 1 draft path must make a later encounter unwinnable (losable draft).
- At least 2 draft paths must lead to winning the full campaign.
- CRITICAL: ALL card IDs across `startingHand` and all `draftPool`s must be **unique** — a card must never appear in more than one location.

## Balancing Rules (CRITICAL)

1. **Budget pressure**: `totalResources` ≈ 60-70% of total cost of available cards. Players MUST leave good cards on the table.
2. **No first-try wins** (encounters 3-4): The obvious "play your best cards" approach must fail at least one goal.
3. **Card trade-offs**: Every card makes at least one metric worse. No strictly dominant cards at the same cost.
4. **Multiple solutions**: Each scenario needs >=2 card combinations (within budget) that satisfy ALL 3 goals, AND >=1 plausible combination that fails at least one goal.
5. **Losable draft paths**: At least 1 combination of draft picks must make a later encounter unwinnable.
6. **Draft tension**: Neither draft choice should be obviously correct.
7. **Anti-synergies**: Include 2-4 card pairs that hurt each other when combined (negative bonus on a higherIsBetter metric, or positive bonus on a lowerIsBetter metric). These teach that not all combinations work.
8. **Growing deck pressure**: Because the player accumulates cards over the campaign, later encounters (E3, E4) will have larger decks but tighter goals. Design the budget so that even with 7-9 cards available, players cannot afford to play everything.

## Output Format

Return EXACTLY three fenced code blocks using these EXACT labels (not `json`). No other text outside these blocks.

```deck
{ ... }
```

```scenarios
[ ... ]
```

```campaign
{ ... }
```

IMPORTANT: Use `deck`, `scenarios`, `campaign` as the code fence language — NOT `json`.

## User Description

{{DESCRIPTION}}