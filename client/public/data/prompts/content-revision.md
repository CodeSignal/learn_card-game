You are an expert game designer revising content for a card-game simulation. Players drag cards onto a board to meet metric goals within a resource budget.

## Original Description

{{DESCRIPTION}}

## Previous Content (needs fixes)

```deck
{{DECK}}
```

```scenarios
{{SCENARIOS}}
```

```campaign
{{CAMPAIGN}}
```

## MUST FIX — Automated Validation Errors

These issues were caught by deterministic code checks. They are objective errors, not opinions. Fix **every single one** without exception before addressing anything else.

{{DETERMINISTIC_ISSUES}}

## Expert Review Feedback

The following qualitative issues were identified by a content reviewer. Fix all of them after resolving the validation errors above.

{{LLM_FEEDBACK}}

## Revision Instructions

1. Fix every MUST FIX validation error first. Then fix expert review issues.
2. **Minimal changes only** — only change what is explicitly listed in the errors above. Do NOT change values that are not mentioned in any error. Changing unrelated values risks breaking things that are currently correct.
3. In particular: do NOT change `totalResources` on any scenario unless that scenario is explicitly listed in a budget error. Budget values are validated by automated checks.
4. Preserve card names, theme, and narrative elements that are working well.
5. Keep the same 3 metric keys — do NOT change or add metrics.
6. Keep the output format identical: exactly 3 fenced code blocks labeled `deck`, `scenarios`, `campaign`.
7. Ensure every card still has genuine trade-offs (at least one metric made worse).
8. Ensure all card IDs across campaign `startingHand` and all `draftPool`s are unique — each card appears in exactly one location.
9. Campaign has `startingHand` of 3 cards at the **campaign level** (NOT on individual encounters). Encounters 1-3: no `startingHand`, `draftPool` of 4, `draftPicks` of 2. Encounter 4: `draftPool` empty, `draftPicks` of 0.

## Output Format

Return EXACTLY three fenced code blocks. No other text outside these blocks.

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
