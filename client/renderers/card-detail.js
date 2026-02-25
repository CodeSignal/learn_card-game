import { uiState } from '../modules/state.js';
import { TYPE_COLORS, formatEffect, METRIC_LABELS, isAntiSynergy } from './shared.js';
import { hideTooltip } from './tooltip.js';

let detailPanel = null;

export function showCardDetail(card) {
  hideTooltip();
  hideCardDetail();

  detailPanel = document.createElement('div');
  detailPanel.className = 'card-detail-backdrop';

  const isOnBoard = uiState.engine.isOnBoard(card.id);
  const inactiveIds = uiState.engine.getInactiveCardIds();
  const isInactive = isOnBoard && inactiveIds.has(card.id);
  const typeColor = TYPE_COLORS[card.type] || '#888';

  const effectRows = Object.entries(card.effects)
    .filter(([, v]) => v !== 0)
    .map(([key, v]) => {
      const { label, displayVal, color } = formatEffect(key, v);
      const metricDef = uiState.scenarioData?.baseMetrics?.[key];
      const absVal = Math.abs(v);
      const maxVal = getMaxEffectForMetric(key);
      const pct = maxVal > 0 ? Math.min(100, (absVal / maxVal) * 100) : 50;
      const isGood = metricDef?.lowerIsBetter ? v < 0 : v > 0;
      const barColor = isGood
        ? 'var(--Colors-Alert-Success-Default)'
        : 'var(--Colors-Alert-Error-Default)';

      return `<div class="cd-effect-row">
        <span class="cd-effect-label">${label}</span>
        <div class="cd-effect-bar-track">
          <div class="cd-effect-bar-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <span class="cd-effect-value" style="color:${color}">${displayVal}</span>
      </div>`;
    }).join('');

  const synergyRows = card.synergies
    .filter(s => uiState.engine.isAvailable(s.with))
    .map(s => {
      const partner = uiState.engine.getCard(s.with);
      const partnerOnBoard = uiState.engine.isOnBoard(s.with);
      const bothOnBoard = isOnBoard && partnerOnBoard;
      const anti = isAntiSynergy(s.bonus, s.metric);
      const fmt = METRIC_LABELS[s.metric];
      const sign = s.bonus > 0 ? '+' : '';
      const bonusText = fmt ? `${sign}${fmt.short(s.bonus)}` : `${sign}${s.bonus}`;
      const statusClass = bothOnBoard ? 'active' : '';
      const antiClass = anti ? ' anti' : '';
      const icon = bothOnBoard ? (anti ? '⚠' : '✅') : (anti ? '⚠' : '⚡');

      return `<div class="cd-synergy-row ${statusClass}${antiClass}">
        <span class="cd-synergy-icon">${icon}</span>
        <span class="cd-synergy-partner">${partner?.icon || '?'} ${partner?.name || s.with}</span>
        <span class="cd-synergy-bonus">${bonusText}</span>
        <span class="cd-synergy-reason">${s.reason}</span>
      </div>`;
    }).join('');

  const prereqRows = card.prerequisites.map(prereq => {
    const prereqCheck = uiState.engine.checkPrerequisites(card.id);
    const isMet = !prereqCheck.missing.includes(prereq);
    return `<span class="cd-prereq-tag ${isMet ? 'met' : 'unmet'}">${isMet ? '✓' : '✕'} ${prereq}</span>`;
  }).join('');

  const descHtml = card.description.replace(
    /\.\s*(Examples?:\s*)(.+)$/,
    '.<br><strong>$1</strong>$2'
  );

  const bestForHtml = card.bestFor
    ? `<div class="cd-context-row best"><span class="cd-context-label">Best for</span><span>${card.bestFor}</span></div>`
    : '';
  const notGreatForHtml = card.notGreatFor
    ? `<div class="cd-context-row not-great"><span class="cd-context-label">Not great for</span><span>${card.notGreatFor}</span></div>`
    : '';

  let inactiveWarning = '';
  if (isInactive) {
    const prereqCheck = uiState.engine.checkPrerequisites(card.id);
    inactiveWarning = `<div class="cd-inactive-warning">⚠ Inactive — requires: ${prereqCheck.missing.join(', ')}</div>`;
  }

  detailPanel.innerHTML = `
    <div class="card-detail-panel" style="--cd-type-color: ${typeColor}">
      <button class="cd-close" title="Close">✕</button>
      <div class="cd-header">
        <div class="cd-icon-area">
          <span class="cd-icon">${card.icon}</span>
          <div class="cd-type-badge" style="background:${typeColor}">${card.type}</div>
        </div>
        <div class="cd-title-area">
          <h3 class="cd-name">${card.name}</h3>
          <div class="cd-cost">⬡ ${card.cost}</div>
        </div>
      </div>
      ${inactiveWarning}
      <p class="cd-desc">${descHtml}</p>
      ${bestForHtml || notGreatForHtml ? `<div class="cd-context">${bestForHtml}${notGreatForHtml}</div>` : ''}
      ${effectRows ? `<div class="cd-section"><div class="cd-section-title">Effects</div>${effectRows}</div>` : ''}
      ${synergyRows ? `<div class="cd-section"><div class="cd-section-title">Synergies</div>${synergyRows}</div>` : ''}
      ${prereqRows ? `<div class="cd-section"><div class="cd-section-title">Prerequisites</div><div class="cd-prereqs">${prereqRows}</div></div>` : ''}
    </div>
  `;

  document.body.appendChild(detailPanel);

  requestAnimationFrame(() => detailPanel?.classList.add('visible'));

  detailPanel.querySelector('.cd-close').addEventListener('click', hideCardDetail);
  detailPanel.addEventListener('click', (e) => {
    if (e.target === detailPanel) hideCardDetail();
  });

  const onKey = (e) => {
    if (e.key === 'Escape') { hideCardDetail(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
}

export function hideCardDetail() {
  if (detailPanel) {
    detailPanel.remove();
    detailPanel = null;
  }
}

function getMaxEffectForMetric(metricKey) {
  const cards = uiState.engine?.deck?.cards;
  if (!cards) return 100;
  let max = 0;
  for (const c of cards) {
    const val = Math.abs(c.effects[metricKey] || 0);
    if (val > max) max = val;
  }
  return max || 100;
}
