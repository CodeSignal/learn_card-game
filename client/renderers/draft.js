import { uiState } from '../modules/state.js';
import { getTypeColor, renderIcon } from './shared.js';
import { hideTooltip } from './tooltip.js';

export function showDraftScreen({ onDraftConfirmed }) {
  hideTooltip();
  uiState.draftSelections = new Set();

  const encounter = uiState.engine.getCurrentEncounter();
  const draftPool = uiState.engine.getCurrentDraftPool();
  const picksRequired = uiState.engine.getDraftPicksRequired();

  const overlay = document.createElement('div');
  overlay.id = 'draft-overlay';
  overlay.className = 'draft-overlay';

  const hintHtml = encounter?.draftHint
    ? `<p class="draft-screen-hint">${encounter.draftHint}</p>`
    : '';

  overlay.innerHTML = `
    <div class="draft-screen">
      <h2 class="draft-screen-title">Choose ${picksRequired} card${picksRequired !== 1 ? 's' : ''} for your next challenge</h2>
      ${hintHtml}
      <div class="draft-cards" id="draft-cards"></div>
      <div class="draft-confirm-row">
        <span class="draft-confirm-count" id="draft-count">0 / ${picksRequired} selected</span>
        <button id="draft-confirm" class="button button-primary" disabled>Confirm picks</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const cardsContainer = document.getElementById('draft-cards');
  for (const card of draftPool) {
    cardsContainer.appendChild(createDraftCard(card, picksRequired));
  }

  document.getElementById('draft-confirm').addEventListener('click', () => {
    const poolIds = draftPool.map(c => c.id);
    uiState.engine.recordDraft([...uiState.draftSelections], poolIds);
    for (const cardId of uiState.draftSelections) {
      uiState.engine.draftCard(cardId);
    }
    document.getElementById('draft-overlay')?.remove();
    if (onDraftConfirmed) onDraftConfirmed();
  });
}

function createDraftCard(card, picksRequired) {
  const el = document.createElement('div');
  el.className = 'draft-card';
  el.dataset.cardId = card.id;
  el.style.setProperty('--type-color', getTypeColor(card.type));

  const shortBestFor = card.bestFor
    ? card.bestFor.split(/[,—–]/).slice(0, 2).join(',').trim()
    : '';
  const bestForEl = shortBestFor
    ? `<div class="draft-card-best-for"><span>✓</span> ${shortBestFor}</div>`
    : '';

  el.innerHTML = `
    <div class="draft-card-icon">${renderIcon(card.icon)}</div>
    <div class="draft-card-name">${card.name}</div>
    <div class="draft-card-type">${card.type}</div>
    ${bestForEl}
    <div class="draft-card-check">✓</div>
  `;

  el.addEventListener('click', () => {
    if (uiState.draftSelections.has(card.id)) {
      uiState.draftSelections.delete(card.id);
      el.classList.remove('selected');
    } else if (uiState.draftSelections.size < picksRequired) {
      uiState.draftSelections.add(card.id);
      el.classList.add('selected');
    }
    const count = uiState.draftSelections.size;
    document.getElementById('draft-count').textContent = `${count} / ${picksRequired} selected`;
    document.getElementById('draft-confirm').disabled = count < picksRequired;
  });

  return el;
}
