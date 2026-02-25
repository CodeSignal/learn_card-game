import { uiState } from '../modules/state.js';
import { formatEffect, isAntiSynergy } from './shared.js';

export function showTooltip(card, e, opts = {}) {
  if (uiState.draggedCardId) return;
  if (document.querySelector('.encounter-transition, .draft-overlay, .battle-overlay')) return;
  hideTooltip();
  uiState.tooltip = document.createElement('div');
  uiState.tooltip.className = 'card-tooltip';

  let inactiveWarning = '';
  if (opts.inactive) {
    const prereqCheck = uiState.engine.checkPrerequisites(card.id);
    const missingList = prereqCheck.missing.join(', ');
    inactiveWarning = `<div class="tooltip-inactive-warning">⚠ Inactive — requires: ${missingList}</div>`;
  }

  const effectRows = Object.entries(card.effects)
    .filter(([, v]) => v !== 0)
    .map(([key, v]) => {
      const { label, displayVal, color } = formatEffect(key, v);
      return `<div class="tooltip-effect"><span>${label}</span><span style="color:${color}">${displayVal}</span></div>`;
    })
    .join('');

  const synergyRows = card.synergies
    .filter(s => uiState.engine.isAvailable(s.with))
    .map(s => {
      const partner = uiState.engine.getCard(s.with);
      const active = uiState.engine.isOnBoard(s.with) && uiState.engine.isOnBoard(card.id);
      const anti = isAntiSynergy(s.bonus, s.metric);
      const icon = active ? (anti ? '⚠' : '✅') : (anti ? '⚠' : '⚡');
      const cls = anti ? 'tooltip-synergy anti' : 'tooltip-synergy';
      return `<div class="${cls}">${icon} + ${partner?.name || s.with}: ${s.reason}</div>`;
    }).join('');

  const prereqs = card.prerequisites.length > 0
    ? `<div class="tooltip-prereq">Requires: ${card.prerequisites.join(', ')}</div>`
    : '';

  const descHtml = card.description.replace(
    /\.\s*(Examples?:\s*)(.+)$/,
    '.<br><strong>$1</strong>$2'
  );

  uiState.tooltip.innerHTML = `
    ${inactiveWarning}
    <div class="tooltip-title">${card.icon} ${card.name}</div>
    <div class="tooltip-desc">${descHtml}</div>
    <div class="tooltip-effects">${effectRows}</div>
    ${synergyRows ? `<div class="tooltip-synergies">${synergyRows}</div>` : ''}
    ${prereqs}
  `;

  document.body.appendChild(uiState.tooltip);
  positionTooltip(e);
}

export function moveTooltip(e) {
  if (uiState.tooltip) positionTooltip(e);
}

function positionTooltip(e) {
  if (!uiState.tooltip) return;
  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = uiState.tooltip.getBoundingClientRect();

  let x = e.clientX + pad;
  let y = e.clientY + pad;

  if (x + rect.width > vw) x = e.clientX - rect.width - pad;
  if (y + rect.height > vh) y = e.clientY - rect.height - pad;

  x = Math.max(4, Math.min(x, vw - rect.width - 4));
  y = Math.max(4, Math.min(y, vh - rect.height - 4));

  uiState.tooltip.style.left = `${x}px`;
  uiState.tooltip.style.top = `${y}px`;
}

export function hideTooltip() {
  if (uiState.tooltip) {
    uiState.tooltip.remove();
    uiState.tooltip = null;
  }
}
