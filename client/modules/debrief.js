import { METRIC_LABELS, isAntiSynergy } from '../renderers/shared.js';

/**
 * Build a context-rich LLM prompt and fetch a short architectural verdict.
 * Keeps all analysis logic out of the renderer.
 *
 * @param {object} engine - GameEngine instance
 * @param {object} scenarioData - current scenario definition
 * @param {Array} goals - result of engine.checkGoals()
 * @returns {Promise<string|null>} verdict text or null on timeout/error
 */
export function fetchDebrief(engine, scenarioData, goals) {
  const allMet = goals.every(g => g.met);
  const boardCardIds = engine.getBoardCardIds();
  const boardCardObjs = boardCardIds.map(id => engine.getCard(id)).filter(Boolean);
  const boardCards = boardCardObjs.map(c => `${c.name} (${c.type})`);
  const boardIdSet = new Set(boardCardIds);

  const activeSynergies = engine.getActiveSynergies();

  const formatSyn = (s) => {
    const src = engine.getCard(s.sourceCard);
    const tgt = engine.getCard(s.targetCard);
    const sign = s.bonus > 0 ? '+' : '';
    return `${src?.name} + ${tgt?.name} → ${s.metric} ${sign}${s.bonus}${s.reason ? ` (${s.reason})` : ''}`;
  };

  const positiveSynergies = activeSynergies
    .filter(s => !isAntiSynergy(s.bonus, s.metric))
    .map(formatSyn);
  const antiSynergies = activeSynergies
    .filter(s => isAntiSynergy(s.bonus, s.metric))
    .map(formatSyn);

  const handCardObjs = (engine.handCardIds || [])
    .filter(id => !boardIdSet.has(id))
    .map(id => engine.getCard(id))
    .filter(Boolean);

  const missedSynergies = [];
  const wouldConflict = [];
  for (const handCard of handCardObjs) {
    for (const syn of (handCard.synergies || [])) {
      if (!boardIdSet.has(syn.with)) continue;
      const partner = engine.getCard(syn.with);
      const sign = syn.bonus > 0 ? '+' : '';
      const entry = `${handCard.name} + ${partner?.name} → ${syn.metric} ${sign}${syn.bonus}`;
      if (isAntiSynergy(syn.bonus, syn.metric)) {
        wouldConflict.push(entry);
      } else {
        missedSynergies.push(entry);
      }
    }
    for (const bcId of boardCardIds) {
      const bc = engine.getCard(bcId);
      if (!bc) continue;
      for (const syn of (bc.synergies || [])) {
        if (syn.with !== handCard.id) continue;
        const sign = syn.bonus > 0 ? '+' : '';
        const entry = `${handCard.name} + ${bc.name} → ${syn.metric} ${sign}${syn.bonus}`;
        if (isAntiSynergy(syn.bonus, syn.metric)) {
          wouldConflict.push(entry);
        } else {
          missedSynergies.push(entry);
        }
      }
    }
  }

  const scenarioName = scenarioData?.name || 'Unknown';
  const goalSummary = goals.map(g => {
    const metricDef = scenarioData?.baseMetrics?.[g.metric];
    const label = metricDef?.label || g.metric;
    const fmt = METRIC_LABELS[g.metric];
    const current = fmt ? fmt.short(g.currentValue) : String(Math.round(g.currentValue));
    const target = fmt ? fmt.short(g.value) : String(Math.round(g.value));
    return `${label}: ${current} (goal: ${g.operator} ${target}) — ${g.met ? 'PASSED' : 'FAILED'}`;
  }).join('; ');

  const failedGoals = goals.filter(g => !g.met);
  const resultWord = allMet ? 'PASSED all tests' : `FAILED ${failedGoals.length} test(s)`;

  const resourcesUsed = engine.getResourcesUsed();
  const totalResources = engine.getTotalResources();
  const budgetPct = Math.round((resourcesUsed / totalResources) * 100);
  const budgetNote = allMet
    ? (budgetPct < 70 ? 'efficiently under budget' : 'near full budget')
    : (budgetPct < 70 ? 'under-invested — unspent budget could add more components' : 'near full budget');

  let contextLines = `\nBudget: ${resourcesUsed}/${totalResources} resources used (${budgetNote}).`;
  if (positiveSynergies.length > 0) {
    contextLines += `\nSynergies active (helping): ${positiveSynergies.join('; ')}.`;
  }
  if (antiSynergies.length > 0) {
    contextLines += `\nAnti-synergies active (hurting): ${antiSynergies.join('; ')}.`;
  }
  if (handCardObjs.length > 0) {
    contextLines += `\nCards in hand but not played: ${handCardObjs.map(c => c.name).join(', ')}.`;
  }
  if (missedSynergies.length > 0) {
    contextLines += `\nMissed synergies (unplayed card + board card): ${missedSynergies.join('; ')}.`;
  }
  if (wouldConflict.length > 0) {
    contextLines += `\nWARNING — unplayed cards that would CONFLICT with board: ${wouldConflict.join('; ')}. Do NOT recommend these.`;
  }

  const { feasible, bestCombo } = engine.checkFeasibility();
  const bestComboSet = new Set(bestCombo || []);
  const boardOverlap = boardCardIds.filter(id => bestComboSet.has(id)).length;
  const swapsNeeded = bestCombo?.length ? Math.max(bestComboSet.size - boardOverlap, boardCardIds.length - boardOverlap) : 0;
  const needsTotalRethink = feasible && swapsNeeded > 2;

  const cardsToRemove = boardCardObjs.filter(c => !bestComboSet.has(c.id));
  const cardsToAdd = (bestCombo || [])
    .filter(id => !boardIdSet.has(id))
    .map(id => engine.getCard(id))
    .filter(Boolean);

  if (!allMet && feasible === false) {
    contextLines += `\nCRITICAL: No combination of cards in hand can pass all goals — this is a draft dead end.`;
  } else if (!allMet && feasible) {
    if (cardsToRemove.length > 0) {
      const removeTypes = [...new Set(cardsToRemove.map(c => c.type))];
      contextLines += `\n${removeTypes.map(t => `A '${t}' component on the board is not in any winning combination — it wastes budget or hurts a goal.`).join(' ')}`;
    }
    if (cardsToAdd.length > 0) {
      const addTypes = [...new Set(cardsToAdd.map(c => c.type))];
      contextLines += `\n${addTypes.map(t => `A '${t}' component from the hand is in the winning combination but not on the board.`).join(' ')}`;
    }
    if (needsTotalRethink) {
      contextLines += `\nThe winning combo shares only ${boardOverlap}/${boardCardIds.length} cards with the current board — most of the architecture needs rebuilding.`;
    }
  }

  let directive;
  if (allMet) {
    if (antiSynergies.length > 0) {
      directive = 'Passed despite anti-synergies. Explain the architectural trade-off that made it work.';
    } else if (positiveSynergies.length > 0) {
      directive = 'Explain why the synergy combo works architecturally.';
    } else {
      directive = 'Explain the architectural insight behind the strongest decision.';
    }
  } else if (feasible === false) {
    directive = 'No card combination from the hand can win. The draft choices created a dead end. Hint at what kind of cards should have been drafted.';
  } else if (cardsToRemove.length > 0 && cardsToAdd.length > 0) {
    directive = 'Explain WHY a component on the board is architecturally wrong for this scenario — what property it lacks. Do not say what to replace it with.';
  } else if (cardsToRemove.length > 0) {
    directive = 'Explain WHY a component on the board is counterproductive for this scenario — what architectural property makes it harmful here.';
  } else if (cardsToAdd.length > 0) {
    if (missedSynergies.length > 0) {
      directive = 'Hint at an unused card in hand that pairs well with something on the board.';
    } else {
      directive = 'Explain the architectural gap — what kind of component is missing.';
    }
  } else {
    directive = 'Explain the architectural gap — what kind of component is missing.';
  }

  const prompt = `You are a senior architect giving a quick post-deployment verdict.
Scenario: "${scenarioName}". Result: ${resultWord}.
Architecture deployed: ${boardCards.join(', ')}.${contextLines}
Metrics: ${goalSummary}.
RULES:
- Do NOT restate metric names or numbers — the player already sees those.
- Do NOT name or closely paraphrase any card. Use broad architectural concepts only (e.g. "persistent storage" not "document store", "query offloading" not "search engine"). The player must figure out which specific card to swap.
- Focus on architectural REASONING: why patterns conflict, complement, or what kind of component is missing.
- MAX 15 words. No filler. No quotes. No labels like "Verdict:". Start directly with the insight.
${directive}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  return fetch('/api/generate-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, max_tokens: 30 }),
    signal: controller.signal,
  })
    .then(r => r.ok ? r.json() : null)
    .then(data => data?.content?.trim() || null)
    .catch(() => null)
    .finally(() => clearTimeout(timeout));
}
