import { uiState } from '../modules/state.js';
import { METRIC_LABELS, formatEffect, renderIcon, isAntiSynergy } from './shared.js';
import { renderHeaderMetrics, renderLastAttempt, renderCampaignProgress } from './header.js';
import { renderHandCards } from './hand.js';
import { hideTooltip } from './tooltip.js';

export function updateDeployButton() {
  const btn = document.getElementById('btn-deploy');
  if (!btn) return;
  if (uiState.gameOver) {
    btn.disabled = true;
    return;
  }
  const hasCards = uiState.engine.getBoardCardIds().length > 0;
  btn.disabled = !hasCards;
}

export function startBattle({ onVictory, onShowWinningPath, onCampaignOver, onRetryUsed }) {
  hideTooltip();
  uiState.lastAttemptGoals = null;
  renderLastAttempt();

  const goals = uiState.engine.checkGoals();
  uiState.engine.recordAttempt(goals);

  const debriefPromise = fetchDebrief(goals);
  runBattleAnimation(goals, debriefPromise, onVictory, onShowWinningPath, onCampaignOver, onRetryUsed);
}

function runBattleAnimation(goals, debriefPromise, onVictory, onShowWinningPath, onCampaignOver, onRetryUsed) {
  const overlay = document.createElement('div');
  overlay.className = 'battle-overlay';
  overlay.id = 'battle-overlay';

  const testsHtml = goals.map((g, i) => {
    const metricDef = uiState.scenarioData?.baseMetrics?.[g.metric];
    const label = metricDef?.label || g.metric;
    const { fillPct, goalPct } = computeBarPositions(g);
    return `
      <div class="battle-test" data-index="${i}" data-met="${g.met}" data-metric="${g.metric}">
        <div class="battle-test-header">
          <span class="battle-test-label">${label}</span>
          <span class="battle-test-result"></span>
        </div>
        <div class="battle-test-bar-wrap">
          <div class="battle-test-track">
            <div class="battle-test-fill" data-target="${fillPct}"></div>
          </div>
          <div class="battle-test-goal-marker" style="left:${goalPct}%"></div>
        </div>
        <div class="battle-test-value"></div>
      </div>
    `;
  }).join('');

  overlay.innerHTML = `
    <div class="battle-panel">
      <div class="battle-title">Deploying Architecture...</div>
      <div class="battle-tests">${testsHtml}</div>
      <div class="battle-result" id="battle-result"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const allMet = goals.every(g => g.met);
  animateBattleSequence(overlay, goals, allMet, debriefPromise, onVictory, onShowWinningPath, onCampaignOver, onRetryUsed);
}

function computeBarPositions(goal) {
  const metricDef = uiState.scenarioData?.baseMetrics?.[goal.metric];
  const base = metricDef?.base ?? 0;
  const cap = metricDef?.cap;
  const lowerIsBetter = metricDef?.lowerIsBetter ?? false;
  const target = goal.value;
  const current = goal.currentValue;

  const lo = lowerIsBetter ? 0 : Math.min(base, current, target);
  const hi = cap != null
    ? cap
    : Math.max(base * 1.3, target * 1.4, current * 1.2, 1);
  const range = hi - lo || 1;

  const fillPct = Math.max(0, Math.min(100, ((current - lo) / range) * 100));
  const goalPct = Math.max(5, Math.min(95, ((target - lo) / range) * 100));
  return { fillPct, goalPct };
}

async function animateBattleSequence(overlay, goals, allMet, debriefPromise, onVictory, onShowWinningPath, onCampaignOver, onRetryUsed) {
  const tests = overlay.querySelectorAll('.battle-test');

  for (let i = 0; i < tests.length; i++) {
    const goal = goals[i];
    const test = tests[i];
    const met = test.dataset.met === 'true';
    const fill = test.querySelector('.battle-test-fill');
    const result = test.querySelector('.battle-test-result');
    const valueEl = test.querySelector('.battle-test-value');
    const targetPct = fill.dataset.target;

    const fmt = METRIC_LABELS[goal.metric];
    const metricDef = uiState.scenarioData?.baseMetrics?.[goal.metric];
    const baseVal = metricDef?.base ?? 0;
    const finalVal = goal.currentValue;

    await sleep(300);
    test.classList.add('reveal');
    await sleep(150);

    fill.classList.add(met ? 'pass' : 'fail');
    fill.style.width = `${targetPct}%`;

    await animateCounter(valueEl, baseVal, finalVal, 800, fmt);

    const goalStr = fmt ? fmt.short(goal.value) : String(goal.value);
    valueEl.innerHTML += `<span class="battle-test-goal-text"> ${goal.operator} ${goalStr}</span>`;

    result.textContent = met ? '✅' : '❌';
    result.classList.add('show');

    if (!met) test.classList.add('fail-shake');

    await sleep(250);
  }

  uiState.deployRevealed = true;
  renderHeaderMetrics();

  await sleep(400);

  const debriefText = await debriefPromise;
  const debriefHtml = debriefText
    ? `<div class="battle-debrief">${debriefText}</div>`
    : '';

  const resultDiv = overlay.querySelector('#battle-result');
  if (allMet) {
    const isCampaignEnd = uiState.engine.isLastEncounter() || uiState.campaignEnded;
    const nextText = uiState.campaignData
      ? (isCampaignEnd ? 'Finish Campaign →' : 'Proceed to Draft →')
      : 'Close';
    const btnClass = uiState.campaignEnded ? 'battle-result-btn' : 'battle-result-btn win';

    resultDiv.innerHTML = `
      <div class="battle-result-text win"><img src="./cosmo/success-jump.svg" alt="Cosmo" class="cosmo-img cosmo-bounce" style="height:48px"> All systems operational!</div>
      ${debriefHtml}
      <button class="${btnClass}" id="battle-continue">${nextText}</button>
    `;
    resultDiv.classList.add('show');

    resultDiv.querySelector('#battle-continue').addEventListener('click', () => {
      overlay.remove();
      uiState.victoryDismissed = true;
      updateDeployButton();
      if (onVictory) onVictory();
    });
  } else {
    uiState.failedDeployCount++;
    const failCount = goals.filter(g => !g.met).length;

    const isInCampaign = !!uiState.campaignData;
    const { feasible, bestCombo } = uiState.engine.checkFeasibility();

    if (isInCampaign && !uiState.campaignEnded) {
      uiState.engine.useRetry();
      if (onRetryUsed) onRetryUsed();
    }

    const retriesRemaining = uiState.engine.getRetriesRemaining();
    const coachingHtml = uiState.campaignEnded
      ? ''
      : buildCoachingSection(goals, { feasible, bestCombo, isInCampaign, retriesRemaining });

    let actionHtml;
    if (uiState.campaignEnded) {
      actionHtml = `<button class="battle-result-btn" id="campaign-over">Finish Campaign</button>`;
    } else if (isInCampaign && retriesRemaining <= 0) {
      const comboCards = feasible && bestCombo?.length > 0
        ? bestCombo.map(id => uiState.engine.getCard(id)).filter(Boolean)
            .map(c => `<span class="coaching-combo-card">${renderIcon(c.icon)} ${c.name}</span>`).join('')
        : null;
      actionHtml = `
        <div class="retry-counter">No rethinks remaining</div>
        <div class="battle-final-actions">
          ${comboCards
            ? `<button class="battle-result-btn lose" id="show-combo">💡 Show Winning Path</button>`
            : ''
          }
          <button class="battle-result-btn" id="campaign-over">Finish Campaign</button>
        </div>
      `;
    } else if (isInCampaign) {
      const rethinkLabel = retriesRemaining === 1 ? '1 rethink remaining' : `${retriesRemaining} rethinks remaining`;
      actionHtml = `
        <div class="retry-counter">${rethinkLabel}</div>
        <button class="battle-result-btn lose" id="battle-retry">Rethink Architecture</button>
      `;
    } else {
      actionHtml = `<button class="battle-result-btn lose" id="battle-retry">Rethink Architecture</button>`;
    }

    resultDiv.innerHTML = `
      <div class="battle-result-text lose">${failCount} test${failCount > 1 ? 's' : ''} failed</div>
      ${debriefHtml}
      ${coachingHtml}
      ${actionHtml}
    `;
    resultDiv.classList.add('show');

    resultDiv.querySelector('#battle-retry')?.addEventListener('click', () => {
      overlay.remove();
      uiState.lastAttemptGoals = goals;
      uiState.deployRevealed = false;
      renderHeaderMetrics();
      renderLastAttempt();
      renderCampaignProgress();
    });

    resultDiv.querySelector('#show-combo')?.addEventListener('click', () => {
      if (bestCombo?.length > 0) {
        overlay.remove();
        if (onShowWinningPath) onShowWinningPath(bestCombo);
      }
    });

    resultDiv.querySelector('#campaign-over')?.addEventListener('click', () => {
      overlay.remove();
      if (onCampaignOver) onCampaignOver();
    });
  }
}

function animateCounter(el, from, to, durationMs, fmt) {
  return new Promise(resolve => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const current = from + (to - from) * eased;
      el.textContent = fmt ? fmt.short(current) : String(Math.round(current));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = fmt ? fmt.short(to) : String(Math.round(to));
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchDebrief(goals) {
  const allMet = goals.every(g => g.met);
  const boardCardIds = uiState.engine.getBoardCardIds();
  const boardCardObjs = boardCardIds.map(id => uiState.engine.getCard(id)).filter(Boolean);
  const boardCards = boardCardObjs.map(c => `${c.name} (${c.type})`);
  const boardIdSet = new Set(boardCardIds);

  const activeSynergies = uiState.engine.getActiveSynergies();

  const formatSyn = (s) => {
    const src = uiState.engine.getCard(s.sourceCard);
    const tgt = uiState.engine.getCard(s.targetCard);
    const sign = s.bonus > 0 ? '+' : '';
    return `${src?.name} + ${tgt?.name} → ${s.metric} ${sign}${s.bonus}${s.reason ? ` (${s.reason})` : ''}`;
  };

  const positiveSynergies = activeSynergies
    .filter(s => !isAntiSynergy(s.bonus, s.metric))
    .map(formatSyn);
  const antiSynergies = activeSynergies
    .filter(s => isAntiSynergy(s.bonus, s.metric))
    .map(formatSyn);

  const handCardObjs = (uiState.engine.handCardIds || [])
    .filter(id => !boardIdSet.has(id))
    .map(id => uiState.engine.getCard(id))
    .filter(Boolean);

  // Find synergies and anti-synergies unplayed cards would trigger with board cards
  const missedSynergies = [];
  const wouldConflict = [];
  for (const handCard of handCardObjs) {
    for (const syn of (handCard.synergies || [])) {
      if (!boardIdSet.has(syn.with)) continue;
      const partner = uiState.engine.getCard(syn.with);
      const sign = syn.bonus > 0 ? '+' : '';
      const entry = `${handCard.name} + ${partner?.name} → ${syn.metric} ${sign}${syn.bonus}`;
      if (isAntiSynergy(syn.bonus, syn.metric)) {
        wouldConflict.push(entry);
      } else {
        missedSynergies.push(entry);
      }
    }
    // Also check board cards' synergies pointing at this hand card
    for (const bcId of boardCardIds) {
      const bc = uiState.engine.getCard(bcId);
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

  const scenarioName = uiState.scenarioData?.name || 'Unknown';
  const goalSummary = goals.map(g => {
    const metricDef = uiState.scenarioData?.baseMetrics?.[g.metric];
    const label = metricDef?.label || g.metric;
    const fmt = METRIC_LABELS[g.metric];
    const current = fmt ? fmt.short(g.currentValue) : String(Math.round(g.currentValue));
    const target = fmt ? fmt.short(g.value) : String(Math.round(g.value));
    return `${label}: ${current} (goal: ${g.operator} ${target}) — ${g.met ? 'PASSED' : 'FAILED'}`;
  }).join('; ');

  const failedGoals = goals.filter(g => !g.met);
  const resultWord = allMet ? 'PASSED all tests' : `FAILED ${failedGoals.length} test(s)`;

  const resourcesUsed = uiState.engine.getResourcesUsed();
  const totalResources = uiState.engine.getTotalResources();

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

  const { feasible, bestCombo } = uiState.engine.checkFeasibility();
  const bestComboSet = new Set(bestCombo || []);
  const boardOverlap = boardCardIds.filter(id => bestComboSet.has(id)).length;
  const swapsNeeded = bestCombo?.length ? Math.max(bestComboSet.size - boardOverlap, boardCardIds.length - boardOverlap) : 0;
  const needsTotalRethink = feasible && swapsNeeded > 2;

  if (!allMet && feasible === false) {
    contextLines += `\nCRITICAL: No combination of cards in hand can pass all goals — this is a draft dead end.`;
  } else if (needsTotalRethink) {
    contextLines += `\nA winning combo exists but shares only ${boardOverlap}/${boardCardIds.length} cards with the current board — most of the architecture needs rebuilding.`;
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
  } else if (needsTotalRethink) {
    directive = 'The board needs a fundamentally different combination — most cards need swapping. Suggest a different architectural direction.';
  } else {
    if (antiSynergies.length > 0) {
      directive = 'Explain the architectural conflict between the anti-synergy cards.';
    } else if (missedSynergies.length > 0) {
      directive = 'Hint at an unused card in hand that pairs well with something on the board.';
    } else {
      directive = 'Explain the architectural gap — what kind of component is missing.';
    }
  }

  const prompt = `You are a senior architect giving a quick post-deployment verdict.
Scenario: "${scenarioName}". Result: ${resultWord}.
Architecture deployed: ${boardCards.join(', ')}.${contextLines}
Metrics: ${goalSummary}.
RULES:
- Do NOT restate metric names or numbers — the player already sees those.
- Do NOT name specific cards. Describe the architectural concept or pattern type instead (e.g. "caching layer" not "In-memory Cache", "async decoupling" not "Message Queue").
- Focus on architectural REASONING: why patterns conflict, complement, or what kind of component is missing.
- MAX 10 words. No filler. No quotes. No labels like "Verdict:". Start directly with the insight.
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

/**
 * Build coaching hints for the loss screen.
 * Always shows goal gaps and card suggestions.
 * When infeasible: shows why, and (if out of campaign retries) reveals a winning combo.
 */
function buildCoachingSection(goals, { feasible, bestCombo, isInCampaign, retriesRemaining } = {}) {
  const failedGoals = goals.filter(g => !g.met);
  if (failedGoals.length === 0) return '';

  const parts = [];

  // Feasibility warning — shown whenever the hand can't win
  if (feasible === false) {
    const msg = isInCampaign
      ? `<strong>⚠️ No winning combination</strong> with your current hand — your draft choices created this dead end.`
      : `<strong>⚠️ No winning combination</strong> with current cards — try removing a card and rethinking.`;
    parts.push(`<div class="coaching-feasibility">${msg}</div>`);
  }

  // Card suggestions from the current hand
  const suggestions = getCardSuggestionsForMetrics(failedGoals.map(g => g.metric));
  if (suggestions.length > 0) {
    const items = suggestions.map(s => {
      const { color } = formatEffect(s.metric, s.effect);
      return `<span class="coaching-card-tag" style="border-color:${color}">
        ${renderIcon(s.card.icon)} ${s.card.name}
      </span>`;
    }).join('');
    parts.push(`<div class="coaching-suggestions">
      <strong>Patterns to consider:</strong>
      <div class="coaching-card-tags">${items}</div>
    </div>`);
  } else {
    parts.push(`<div class="coaching-hint">No unplayed cards help with this metric. Try removing a card that doesn't contribute and rethinking your approach.</div>`);
  }

  return `<div class="coaching-section">${parts.join('')}</div>`;
}

/**
 * Score available (not on board) cards by how much they help with the given failing metrics,
 * accounting for synergies and anti-synergies with cards already on the board.
 */
function getCardSuggestionsForMetrics(failingMetrics) {
  const available = uiState.engine.getAvailableCards();
  const boardIds = new Set(uiState.engine.getBoardCardIds());
  const budget = uiState.engine.getResourcesRemaining();

  const boardCards = uiState.engine.getBoardCardIds()
    .map(id => uiState.engine.getCard(id))
    .filter(Boolean);

  const scored = [];
  for (const card of available) {
    if (boardIds.has(card.id)) continue;

    // Compute synergy/anti-synergy impact this card would have with the board
    const synergyImpact = {};
    for (const syn of (card.synergies || [])) {
      if (boardIds.has(syn.with)) {
        synergyImpact[syn.metric] = (synergyImpact[syn.metric] || 0) + syn.bonus;
      }
    }
    for (const bc of boardCards) {
      for (const syn of (bc.synergies || [])) {
        if (syn.with === card.id) {
          synergyImpact[syn.metric] = (synergyImpact[syn.metric] || 0) + syn.bonus;
        }
      }
    }

    for (const metric of failingMetrics) {
      const rawEffect = card.effects[metric] || 0;
      const synergyBonus = synergyImpact[metric] || 0;
      const netEffect = rawEffect + synergyBonus;
      if (netEffect === 0) continue;

      const metricDef = uiState.scenarioData?.baseMetrics?.[metric];
      const lowerIsBetter = metricDef?.lowerIsBetter ?? false;
      const helpful = lowerIsBetter ? netEffect < 0 : netEffect > 0;
      if (!helpful) continue;

      const hasAntiSynergy = Object.entries(synergyImpact).some(
        ([m, b]) => isAntiSynergy(b, m)
      );

      const overBudget = card.cost > budget;
      scored.push({ card, metric, effect: netEffect, impact: Math.abs(netEffect), overBudget, hasAntiSynergy });
    }
  }

  scored.sort((a, b) => b.impact - a.impact);

  const seen = new Set();
  const unique = [];
  for (const s of scored) {
    if (seen.has(s.card.id)) continue;
    seen.add(s.card.id);
    unique.push(s);
    if (unique.length >= 3) break;
  }
  return unique;
}
