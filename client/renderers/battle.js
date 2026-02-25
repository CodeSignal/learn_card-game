import { uiState } from '../modules/state.js';
import { METRIC_LABELS, formatEffect } from './shared.js';
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
  runBattleAnimation(goals, onVictory, onShowWinningPath, onCampaignOver, onRetryUsed);
}

function runBattleAnimation(goals, onVictory, onShowWinningPath, onCampaignOver, onRetryUsed) {
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
  animateBattleSequence(overlay, goals, allMet, onVictory, onShowWinningPath, onCampaignOver, onRetryUsed);
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

async function animateBattleSequence(overlay, goals, allMet, onVictory, onShowWinningPath, onCampaignOver, onRetryUsed) {
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

  const resultDiv = overlay.querySelector('#battle-result');
  if (allMet) {
    const isCampaignEnd = uiState.engine.isLastEncounter() || uiState.campaignEnded;
    const nextText = uiState.campaignData
      ? (isCampaignEnd ? 'Finish Campaign →' : 'Proceed to Draft →')
      : 'Close';
    const btnClass = uiState.campaignEnded ? 'battle-result-btn' : 'battle-result-btn win';

    resultDiv.innerHTML = `
      <div class="battle-result-text win"><img src="./cosmo/success-jump.svg" alt="Cosmo" class="cosmo-img cosmo-bounce" style="height:48px"> All systems operational!</div>
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
            .map(c => `<span class="coaching-combo-card">${c.icon} ${c.name}</span>`).join('')
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

/**
 * Build coaching hints for the loss screen.
 * Always shows goal gaps and card suggestions.
 * When infeasible: shows why, and (if out of campaign retries) reveals a winning combo.
 */
function buildCoachingSection(goals, { feasible, bestCombo, isInCampaign, retriesRemaining } = {}) {
  const failedGoals = goals.filter(g => !g.met);
  if (failedGoals.length === 0) return '';

  const parts = [];

  // Goal gap rows
  const gapLines = failedGoals.map(g => {
    const metricDef = uiState.scenarioData?.baseMetrics?.[g.metric];
    const label = metricDef?.label || g.metric;
    const fmt = METRIC_LABELS[g.metric];
    const currentStr = fmt ? fmt.short(g.currentValue) : String(Math.round(g.currentValue));
    const targetStr = fmt ? fmt.short(g.value) : String(Math.round(g.value));
    return `<div class="coaching-gap-row">
      <span class="coaching-gap-label">${label}</span>
      <span class="coaching-gap-values">${currentStr} — need ${g.operator} ${targetStr}</span>
    </div>`;
  }).join('');
  parts.push(`<div class="coaching-gaps">${gapLines}</div>`);

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
      const { label, color } = formatEffect(s.metric, s.effect);
      return `<span class="coaching-card-tag" style="border-color:${color}">
        ${s.card.icon} ${s.card.name} <span style="color:${color}">${label}</span>
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
 * Score available (not on board) cards by how much they help with the given failing metrics.
 * Returns top suggestions sorted by impact.
 */
function getCardSuggestionsForMetrics(failingMetrics) {
  const available = uiState.engine.getAvailableCards();
  const boardIds = new Set(uiState.engine.getBoardCardIds());
  const budget = uiState.engine.getResourcesRemaining();

  const scored = [];
  for (const card of available) {
    if (boardIds.has(card.id)) continue;

    for (const metric of failingMetrics) {
      const effect = card.effects[metric];
      if (effect == null || effect === 0) continue;

      const metricDef = uiState.scenarioData?.baseMetrics?.[metric];
      const lowerIsBetter = metricDef?.lowerIsBetter ?? false;
      const helpful = lowerIsBetter ? effect < 0 : effect > 0;
      if (!helpful) continue;

      const overBudget = card.cost > budget;
      scored.push({ card, metric, effect, impact: Math.abs(effect), overBudget });
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
