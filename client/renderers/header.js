import { uiState } from '../modules/state.js';
import { METRIC_LABELS } from './shared.js';

export function renderHeaderMetrics() {
  const metrics = uiState.engine.calculateMetrics();
  const goals = uiState.engine.checkGoals();
  const container = document.getElementById('metrics-bar');
  container.innerHTML = '';

  for (const [key, m] of Object.entries(metrics)) {
    const fmt = METRIC_LABELS[key];
    if (!fmt) continue;

    const goal = goals.find(g => g.metric === key);
    const displayValue = uiState.deployRevealed ? m.value : m.base;
    const isMet = uiState.deployRevealed && goal ? goal.met : null;

    const chip = document.createElement('div');
    if (isMet === true) chip.className = 'metric-chip met';
    else if (isMet === false) chip.className = 'metric-chip unmet';
    else chip.className = 'metric-chip neutral';

    const goalText = goal
      ? `Goal: ${goal.operator} ${fmt.full(goal.value)}`
      : '';

    chip.innerHTML = `
      <span class="metric-chip-icon">${fmt.icon}</span>
      <span>${fmt.short(displayValue)}</span>
      <div class="metric-chip-tooltip">${goalText}<br>Base: ${fmt.full(m.base)}</div>
    `;
    container.appendChild(chip);
  }
}

export function renderResources() {
  const used = uiState.engine.getResourcesUsed();
  const total = uiState.engine.getTotalResources();
  const pct = total > 0 ? (used / total) * 100 : 0;

  const fill = document.getElementById('resource-fill');
  fill.style.width = `${pct}%`;
  fill.className = 'resource-fill' +
    (pct > 90 ? ' danger' : pct > 70 ? ' warning' : '');

  document.getElementById('resource-text').textContent = `${used}/${total}`;
}

export function renderCampaignProgress() {
  const el = document.getElementById('campaign-progress');
  if (!el || !uiState.campaignData) return;

  const total = uiState.campaignData.encounters.length;
  const current = uiState.engine.currentEncounterIndex;

  const dots = uiState.campaignData.encounters.map((enc, i) => {
    let cls = 'campaign-dot';
    if (i < current) cls += ' done';
    else if (i === current) cls += ' active';
    return `<div class="${cls}" title="Encounter ${i + 1}"></div>`;
  }).join('');

  const maxRetries = uiState.engine.getMaxRetries();
  const remaining = uiState.engine.getRetriesRemaining();
  let retryHtml = '';
  if (maxRetries > 0) {
    const tokens = [];
    for (let i = 0; i < maxRetries; i++) {
      tokens.push(i < remaining
        ? '<span class="retry-token filled" title="Rethink available">♻</span>'
        : '<span class="retry-token spent" title="Rethink used">♻</span>');
    }
    retryHtml = `<span class="campaign-retries">${tokens.join('')}</span>`;
  }

  el.innerHTML = `
    <span class="campaign-progress-label">Encounter ${current + 1}/${total}</span>
    <div class="campaign-progress-dots">${dots}</div>
    ${retryHtml}
    <span class="campaign-progress-name">${uiState.scenarioData?.name || ''}</span>
  `;
  el.style.display = 'flex';
}

export function renderLastAttempt() {
  const el = document.getElementById('last-attempt');
  if (!el) return;

  if (!uiState.lastAttemptGoals) {
    el.style.display = 'none';
    return;
  }

  const items = uiState.lastAttemptGoals.map(g => {
    const fmt = METRIC_LABELS[g.metric];
    const metricDef = uiState.scenarioData?.baseMetrics?.[g.metric];
    const label = metricDef?.label || g.metric;
    const valStr = fmt ? fmt.short(g.currentValue) : String(Math.round(g.currentValue));
    const icon = g.met ? '✅' : '❌';
    return `<span class="last-attempt-row ${g.met ? 'pass' : 'fail'}">${icon} ${label}: ${valStr}</span>`;
  });

  el.innerHTML = `<span class="last-attempt-title">Last Deploy:</span>` +
    items.join('<span class="last-attempt-sep">·</span>');
  el.style.display = '';
}

export function checkTitleOverflow() {
  const el = document.getElementById('scenario-name');
  const spacer = document.querySelector('.header .spacer');
  if (!el || !spacer || !el.textContent) return;
  el.classList.remove('overflowing');
  if (spacer.getBoundingClientRect().width < 2) {
    el.classList.add('overflowing');
  }
}
