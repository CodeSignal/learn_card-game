const REQUIRED_SCENARIO_FIELDS = ['id', 'name', 'briefing', 'baseMetrics', 'goals', 'totalResources'];
const REQUIRED_CARD_FIELDS = ['id', 'name', 'type', 'cost', 'effects', 'prerequisites', 'synergies', 'tags'];
const VALID_OPERATORS = new Set(['<=', '>=', '<', '>', '==']);

function closestMatch(target, candidates) {
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(target, c);
    if (d < bestDist && d <= 3) { bestDist = d; best = c; }
  }
  return best;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function validateScenario(scenario) {
  const errors = [];

  for (const field of REQUIRED_SCENARIO_FIELDS) {
    if (!(field in scenario)) {
      errors.push(`Scenario missing required field '${field}'`);
    }
  }
  if (errors.length) return errors;

  if (typeof scenario.baseMetrics !== 'object' || scenario.baseMetrics === null) {
    errors.push(`Scenario '${scenario.id}': baseMetrics must be an object`);
    return errors;
  }

  const metricKeys = new Set(Object.keys(scenario.baseMetrics));

  for (const bm of Object.values(scenario.baseMetrics)) {
    if (bm.base === undefined) errors.push(`Scenario '${scenario.id}': baseMetric missing 'base' value`);
  }

  if (!Array.isArray(scenario.goals)) {
    errors.push(`Scenario '${scenario.id}': goals must be an array`);
    return errors;
  }

  for (const goal of scenario.goals) {
    if (!goal.metric) {
      errors.push(`Scenario '${scenario.id}': goal missing 'metric' field`);
    } else if (!metricKeys.has(goal.metric)) {
      const suggestion = closestMatch(goal.metric, [...metricKeys]);
      errors.push(`Scenario '${scenario.id}': goal references unknown metric '${goal.metric}'${suggestion ? ` — did you mean '${suggestion}'?` : ''}`);
    }
    if (!VALID_OPERATORS.has(goal.operator)) {
      errors.push(`Scenario '${scenario.id}': goal has invalid operator '${goal.operator}'`);
    }
    if (goal.value === undefined) {
      errors.push(`Scenario '${scenario.id}': goal missing 'value'`);
    }
  }

  return errors;
}

export function validateDeck(deck, scenario) {
  const errors = [];

  if (!deck.cards || !Array.isArray(deck.cards)) {
    errors.push('Deck missing or invalid "cards" array');
    return errors;
  }

  const metricKeys = scenario ? new Set(Object.keys(scenario.baseMetrics || {})) : null;
  const cardIds = new Set(deck.cards.map(c => c.id));

  for (const card of deck.cards) {
    const prefix = `Card '${card.id || '(unnamed)'}'`;

    for (const field of REQUIRED_CARD_FIELDS) {
      if (!(field in card)) {
        errors.push(`${prefix}: missing required field '${field}'`);
      }
    }

    if (card.effects && metricKeys) {
      for (const key of Object.keys(card.effects)) {
        if (!metricKeys.has(key)) {
          const suggestion = closestMatch(key, [...metricKeys]);
          errors.push(`${prefix}: unknown effect metric '${key}'${suggestion ? ` — did you mean '${suggestion}'?` : ''}`);
        }
      }
    }

    if (Array.isArray(card.synergies)) {
      for (const syn of card.synergies) {
        if (syn.with && !cardIds.has(syn.with)) {
          errors.push(`${prefix}: synergy references unknown card '${syn.with}'`);
        }
        if (syn.metric && metricKeys && !metricKeys.has(syn.metric)) {
          errors.push(`${prefix}: synergy references unknown metric '${syn.metric}'`);
        }
      }
    }

    if (Array.isArray(card.prerequisites)) {
      for (const prereq of card.prerequisites) {
        const isTagRef = deck.cards.some(c => c.tags?.includes(prereq));
        const isIdRef = cardIds.has(prereq);
        if (!isTagRef && !isIdRef) {
          errors.push(`${prefix}: prerequisite '${prereq}' matches no card ID or tag in the deck`);
        }
      }
    }
  }

  if (scenario?.availableCards) {
    for (const id of scenario.availableCards) {
      if (!cardIds.has(id)) {
        errors.push(`Scenario '${scenario.id}': availableCards references unknown card '${id}'`);
      }
    }
  }

  return errors;
}
