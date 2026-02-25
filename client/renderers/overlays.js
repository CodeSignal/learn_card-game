import { uiState } from '../modules/state.js';
import { METRIC_LABELS, deduplicateSynergies, renderSynergyRow } from './shared.js';
import { hideTooltip } from './tooltip.js';

export function showEncounterTransition(scenario, { clearBoard = false } = {}) {
  hideTooltip();
  const overlay = document.createElement('div');
  overlay.className = 'encounter-transition';

  const clearNote = clearBoard
    ? '<p class="encounter-transition-carry">Starting fresh — your previous architecture has been retired.</p>'
    : '';

  overlay.innerHTML = `
    <div class="encounter-transition-card">
      <div class="encounter-transition-badge"><img src="./cosmo/hero-stance.svg" alt="Cosmo" class="cosmo-img" style="height:72px"></div>
      <h3 class="encounter-transition-title">${scenario.name}</h3>
      <p class="encounter-transition-subtitle">${scenario.briefing}</p>
      ${clearNote}
      <button class="encounter-transition-btn">Continue →</button>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('.encounter-transition-btn').addEventListener('click', () => overlay.remove());
}

export function showCampaignComplete({ failed = false } = {}) {
  hideTooltip();
  const overlay = document.createElement('div');
  overlay.className = 'encounter-transition';

  const icon = failed ? './cosmo/waving.svg' : './cosmo/cosmo-flag.svg';
  const title = failed ? 'Campaign Over' : 'Campaign Complete!';
  const subtitle = failed
    ? 'You ran out of rethinks.'
    : 'Your architecture is live and handling real scale.';

  /* ── Summary stats (disabled for now — data is collected, display TBD) ──
  const summary = uiState.engine.getCampaignSummary();
  const statsRows = [];
  statsRows.push(`<div class="summary-stat">
    <span class="summary-stat-value">${summary.encountersPassed}/${summary.totalEncounters}</span>
    <span class="summary-stat-label">encounters cleared</span>
  </div>`);
  if (summary.firstTrySuccesses > 0) {
    statsRows.push(`<div class="summary-stat highlight">
      <span class="summary-stat-value">${summary.firstTrySuccesses}</span>
      <span class="summary-stat-label">cleared on first deploy</span>
    </div>`);
  }
  statsRows.push(`<div class="summary-stat">
    <span class="summary-stat-value">${summary.totalAttempts}</span>
    <span class="summary-stat-label">total deploys</span>
  </div>`);
  if (summary.maxRetries > 0) {
    statsRows.push(`<div class="summary-stat">
      <span class="summary-stat-value">${summary.retriesUsed}/${summary.maxRetries}</span>
      <span class="summary-stat-label">rethinks used</span>
    </div>`);
  }
  const summaryHtml = `<div class="campaign-summary">${statsRows.join('')}</div>`;
  ── end disabled summary ── */

  overlay.innerHTML = `
    <div class="encounter-transition-card">
      <div class="encounter-transition-badge"><img src="${icon}" alt="Cosmo" class="cosmo-img${failed ? '' : ' cosmo-bounce'}" style="height:80px"></div>
      <h3 class="encounter-transition-title">${title}</h3>
      <p class="encounter-transition-subtitle">${subtitle}</p>
      <button class="encounter-transition-btn" id="campaign-complete-close">Done</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#campaign-complete-close').addEventListener('click', () => overlay.remove());
}

export function toggleScenarioPopup() {
  if (uiState.scenarioPopup) {
    uiState.scenarioPopup._cleanup?.();
    uiState.scenarioPopup.remove();
    uiState.scenarioPopup = null;
    return;
  }
  if (!uiState.scenarioData) return;

  const popup = document.createElement('div');
  popup.className = 'scenario-popup';

  const goals = uiState.engine.checkGoals();

  const goalsHtml = goals
    .map(g => {
      if (uiState.deployRevealed) {
        const fmt = METRIC_LABELS[g.metric];
        const current = fmt ? fmt.short(g.currentValue) : g.currentValue;
        const icon = g.met ? '✅' : '❌';
        return `<li class="scenario-popup-goal ${g.met ? 'met' : 'unmet'}">${icon} ${g.label} — ${current}</li>`;
      }
      return `<li class="scenario-popup-goal">◎ ${g.label}</li>`;
    })
    .join('');

  popup.innerHTML = `
    <div class="scenario-popup-text">${uiState.scenarioData.briefing}</div>
    <ul class="scenario-popup-goals">${goalsHtml}</ul>
  `;

  const btn = document.getElementById('btn-scenario-info');
  const r = btn.getBoundingClientRect();
  popup.style.top = `${r.bottom + 8}px`;
  popup.style.left = `${Math.max(8, r.left - 120)}px`;

  document.body.appendChild(popup);
  uiState.scenarioPopup = popup;

  const closeOnOutside = (e) => {
    if (!popup.contains(e.target) && e.target !== btn) {
      popup.remove();
      uiState.scenarioPopup = null;
      document.removeEventListener('pointerdown', closeOnOutside);
    }
  };
  popup._cleanup = () => document.removeEventListener('pointerdown', closeOnOutside);
  setTimeout(() => document.addEventListener('pointerdown', closeOnOutside), 0);
}

export function toggleSynergyPopup() {
  if (uiState.synergyPopup) {
    uiState.synergyPopup._cleanup?.();
    uiState.synergyPopup.remove();
    uiState.synergyPopup = null;
    return;
  }

  const synergies = uiState.engine.getActiveSynergies();
  if (synergies.length === 0) return;

  const popup = document.createElement('div');
  popup.className = 'scenario-popup synergy-popup-mobile';

  const unique = deduplicateSynergies(synergies);
  const rows = unique.map(s => renderSynergyRow(s, uiState.engine, { showNames: true })).filter(Boolean);
  popup.innerHTML = `<div class="scenario-popup-title">⚡ Active Synergies</div>${rows.join('')}`;

  const btn = document.getElementById('btn-synergy');
  const r = btn.getBoundingClientRect();
  popup.style.top = `${r.bottom + 8}px`;
  popup.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  popup.style.left = 'auto';

  document.body.appendChild(popup);
  uiState.synergyPopup = popup;

  const closeOnOutside = (e) => {
    if (!popup.contains(e.target) && e.target !== btn) {
      popup.remove();
      uiState.synergyPopup = null;
      document.removeEventListener('pointerdown', closeOnOutside);
    }
  };
  popup._cleanup = () => document.removeEventListener('pointerdown', closeOnOutside);
  setTimeout(() => document.addEventListener('pointerdown', closeOnOutside), 0);
}

export function closeAllPopups() {
  if (uiState.tooltip) { uiState.tooltip.remove(); uiState.tooltip = null; }
  if (uiState.scenarioPopup) { uiState.scenarioPopup._cleanup?.(); uiState.scenarioPopup.remove(); uiState.scenarioPopup = null; }
  if (uiState.synergyPopup) { uiState.synergyPopup._cleanup?.(); uiState.synergyPopup.remove(); uiState.synergyPopup = null; }
}

export function updateSynergyButton() {
  const btn = document.getElementById('btn-synergy');
  const count = deduplicateSynergies(uiState.engine.getActiveSynergies()).length;
  btn.dataset.count = count;
  btn.textContent = `⚡ ${count}`;
}
