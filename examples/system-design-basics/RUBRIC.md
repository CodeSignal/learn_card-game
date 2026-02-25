# Card Game Simulation — Grading Rubric

The learner played a card-based architecture simulation where they built systems by selecting technology cards (e.g., "load-balancer", "in-memory-cache", "cdn") to meet metric goals (latency, throughput, reliability, cost) within a resource budget. The simulation runs as a multi-encounter campaign with draft phases between encounters and a limited pool of rethinks (retries) shared across the entire campaign.

Evaluate the learner's performance using the `solution.json` file in the ADDED OR UPDATED FILE CONTENT section. Ignore SOLUTION DIFF — it will only show the full JSON being added.

## How to read solution.json

- `attemptLog`: Array of every deploy attempt. Each entry has `encounterIndex`, `board` (card IDs played), `goals` (each with `met`, `currentValue`, `target`, `operator`), `synergies`, and `allMet`. Multiple entries with the same `encounterIndex` mean the learner retried that encounter.
- `draftLog`: Array of draft choices between encounters. Each entry has `afterEncounterIndex`, `picked` (cards chosen), and `pool` (all cards offered). Cards in `pool` but not in `picked` were deliberately passed over.
- `retriesUsed`: Total rethinks consumed across the campaign.
- `currentEncounterIndex`: How far the learner progressed (0-indexed).
- `cardsOnBoard`: The final board state when the campaign ended.
- `synergiesTriggered`: Active synergies on the final board — pairs of cards producing bonus effects due to architectural compatibility.
- `goalsMetCount` / `totalGoals` / `allGoalsMet`: Final encounter goal status.
- `handCardIds`: All cards available to the learner at the end (starting hand + drafted cards).

Card IDs are descriptive (e.g., "load-balancer", "relational-db", "container-orchestrator") and represent architectural patterns. Synergies represent real-world compatibility (e.g., cache + database = query caching, container + orchestrator = auto-healing).

## Dimensions

### Campaign Progression

How far did the learner get through the campaign?

**Criteria List**
1. The learner attempted at least one deploy (the `attemptLog` is not empty).
2. The learner cleared at least one encounter (at least one `attemptLog` entry has `allMet: true`).
3. The learner cleared at least half of the campaign encounters.
4. The learner reached the final encounter (the highest `encounterIndex` in `attemptLog` equals the last encounter).
5. The learner completed the entire campaign (the final encounter has an attempt with `allMet: true`).
6. The learner completed the campaign with rethinks still remaining (`retriesUsed` is less than the maximum available).

**Scoring**
* **Very Unsatisfactory:** Met 0-1 criteria — barely engaged with the campaign.
* **Unsatisfactory:** Met 2-3 criteria — completed some encounters but stalled before the end.
* **Satisfactory:** Met 4-5 criteria — reached the final encounter or completed the campaign.
* **Very Satisfactory:** Met all 6 criteria — completed the full campaign with rethinks to spare.

### Attempt Efficiency

Did the learner solve encounters with minimal trial-and-error? Count attempts per encounter by grouping `attemptLog` entries by `encounterIndex`.

**Criteria List**
1. At least one encounter was cleared on the very first deploy attempt (only one entry for that `encounterIndex`, with `allMet: true`).
2. More than half of the cleared encounters were cleared on the first attempt.
3. No encounter required more than 3 deploy attempts to clear.
4. The learner never deployed the exact same board twice on the same encounter (compare `board` arrays between consecutive same-encounter attempts — identical boards indicate a wasted rethink).
5. The total number of deploy attempts across the campaign is no more than twice the number of encounters attempted.
6. The learner's rethinks were concentrated on later encounters (higher `encounterIndex` values), suggesting earlier encounters were understood well.

**Scoring**
* **Very Unsatisfactory:** Met 0-1 criteria — heavy trial-and-error throughout.
* **Unsatisfactory:** Met 2-3 criteria — some encounters required excessive retries.
* **Satisfactory:** Met 4-5 criteria — generally efficient with occasional extra attempts.
* **Very Satisfactory:** Met all 6 criteria — solved encounters decisively with minimal retries.

**Weight**: 2

### Problem Diagnosis

When the learner retried an encounter, did their changes show they understood what was failing? Compare consecutive attempts on the same `encounterIndex`.

**Criteria List**
1. Between retries, the learner changed the board composition (added, removed, or swapped at least one card).
2. When a specific metric goal was not met, the learner's next attempt added or swapped in a card whose ID suggests it addresses that metric (e.g., adding "in-memory-cache" after failing a latency goal, or removing a costly card after failing a cost goal).
3. The learner removed underperforming cards between retries rather than only adding more cards on top.
4. The number of failing goals decreased between consecutive attempts on the same encounter (the learner was making progress, not regressing).
5. The learner did not remove cards that were contributing to already-passing goals when fixing failing ones (they preserved what was working).

**Scoring**
* **Very Unsatisfactory:** Met 0-1 criteria — changes between attempts appear random or nonexistent.
* **Unsatisfactory:** Met 2 criteria — some targeted changes but mostly adding cards without strategy.
* **Satisfactory:** Met 3-4 criteria — generally identified failing areas and made relevant adjustments.
* **Very Satisfactory:** Met all 5 criteria — precise, surgical changes between retries showing clear understanding of what was failing and why.

**Weight**: 2

### Architectural Coherence

Do the card combinations in successful attempts form plausible real-world architectures? Examine the `board` arrays in attempts where `allMet: true`.

**Criteria List**
1. The architecture includes a backend/runtime component (card IDs suggesting a server framework or runtime).
2. The architecture includes a data layer (database, cache, or storage card).
3. The architecture does not contain redundant components that serve the same purpose (e.g., two different caching solutions or two different databases unless justified by the scenario's goals).
4. Cards that are commonly paired in real-world systems appear together (e.g., load-balancer with auto-scaler, containerization with orchestrator, database with cache).
5. The architecture scales coherently — infrastructure cards (load-balancer, CDN, auto-scaler) are present when throughput goals are high, while simpler setups are used for simpler scenarios.
6. The learner triggered at least one synergy in any successful attempt (`synergies` array is non-empty in at least one `allMet: true` attempt).
7. The learner triggered synergies in more than half of their successful attempts.

**Scoring**
* **Very Unsatisfactory:** Met 0-2 criteria — cards appear randomly selected with no architectural logic.
* **Unsatisfactory:** Met 3-4 criteria — basic structure present but missing key components or containing redundancies.
* **Satisfactory:** Met 5-6 criteria — coherent architecture with real-world plausibility and some synergies.
* **Very Satisfactory:** Met all 7 criteria — well-designed, synergy-rich architectures that reflect genuine understanding of how components interact.

### Draft Strategy

Did the learner's draft choices between encounters show forward-thinking? Examine `draftLog` entries. If `draftLog` is empty (learner didn't reach any draft phase), score this dimension as Very Unsatisfactory.

**Criteria List**
1. The `draftLog` contains at least one entry (the learner reached at least one draft phase).
2. The learner's drafted cards were actually used in later encounters (cards from `picked` appear in the `board` of subsequent `attemptLog` entries).
3. The learner drafted cards from diverse types/categories rather than always picking the same kind of card (e.g., not all infrastructure cards or all database cards).
4. The learner did not draft cards that duplicate functionality already in their hand (avoiding redundancy with `handCardIds`).
5. At least one drafted card contributed to a synergy in a later encounter (a `picked` card appears in a `synergies` entry of a later attempt).
6. The learner's draft choices align with escalating campaign demands — later drafts pick scaling/reliability cards as scenarios become more demanding.

**Scoring**
* **Very Unsatisfactory:** Met 0-1 criteria — no drafting or drafts show no planning.
* **Unsatisfactory:** Met 2-3 criteria — some drafted cards were used but choices appear opportunistic rather than strategic.
* **Satisfactory:** Met 4-5 criteria — drafted cards were well-utilized with evidence of forward planning.
* **Very Satisfactory:** Met all 6 criteria — draft strategy clearly accounts for future encounters, cards are diverse, utilized, and synergy-enabling.

### Resource Management

Did the learner use their resource budget effectively? Examine `resourcesUsed` vs `totalResources` in the final state and across `attemptLog` entries.

**Criteria List**
1. The learner did not exceed their resource budget in any attempt (all attempts have valid board states — this is enforced by the engine, so check that boards are non-empty).
2. In successful attempts, the learner used at least 60% of available resources (they didn't leave most of the budget unused).
3. In successful attempts, the learner had some resources remaining (they didn't blindly spend everything — at least 1 resource left).
4. The learner's resource usage increased appropriately across encounters as scenarios became more demanding.
5. The learner did not play cards that actively harm goals they need to meet (e.g., cards that increase latency when the latency goal is tight — detectable from goals where `currentValue` moved away from `target` in the wrong direction compared to a previous attempt).

**Scoring**
* **Very Unsatisfactory:** Met 0-1 criteria — poor resource awareness, empty boards or wasted budget.
* **Unsatisfactory:** Met 2 criteria — used resources but without optimization.
* **Satisfactory:** Met 3-4 criteria — reasonable budget management with minor inefficiencies.
* **Very Satisfactory:** Met all 5 criteria — efficient resource allocation showing understanding of cost-benefit trade-offs.
