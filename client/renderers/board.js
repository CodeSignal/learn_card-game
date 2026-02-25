import { uiState } from '../modules/state.js';
import { TYPE_COLORS, deduplicateSynergies, renderSynergyRow } from './shared.js';
import { showTooltip, hideTooltip, moveTooltip } from './tooltip.js';
import { showCardDetail } from './card-detail.js';
import { updateDropZoneHighlight, clearDropZoneHighlight } from './hand.js';

export function renderBoardSlots(justPlayedCardId, { onCardRemoved }) {
  const container = document.getElementById('board-slots');
  container.innerHTML = '';

  const boardIds = uiState.engine.getBoardCardIds();

  if (boardIds.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'board-empty-hint';
    hint.innerHTML = `<img src="./cosmo/waving.svg" alt="Cosmo" class="cosmo-img cosmo-float" style="height:80px"><span>Click or drag cards here to build your architecture</span>`;
    container.appendChild(hint);
    renderSynergyPanel();
    return;
  }

  const inactiveIds = uiState.engine.getInactiveCardIds();

  for (let i = 0; i < boardIds.length; i++) {
    const card = uiState.engine.getCard(boardIds[i]);
    if (!card) continue;

    const isInactive = inactiveIds.has(card.id);
    const isCarried = uiState.carriedCardIds?.has(card.id);
    const slot = document.createElement('div');
    slot.className = `slot filled${card.id === justPlayedCardId ? ' just-placed' : ''}${isInactive ? ' inactive' : ''}${isCarried ? ' carried' : ''}`;
    slot.dataset.cardId = card.id;
    slot.dataset.slotIndex = i;
    if (TYPE_COLORS[card.type]) slot.style.setProperty('--type-color', TYPE_COLORS[card.type]);

    const prereqBadge = isInactive ? '<div class="slot-prereq-badge" title="Missing prerequisite">⚠</div>' : '';
    const carriedBadge = isCarried ? '<div class="slot-carried-badge" title="Carried from previous encounter">↩</div>' : '';

    slot.innerHTML = `
      <div class="slot-cost-badge">⬡ ${card.cost}</div>
      ${prereqBadge}
      ${carriedBadge}
      <span class="slot-icon">${card.icon}</span>
      <span class="slot-name">${card.name}</span>
      <div class="slot-type-strip ${card.type}"></div>
      <button class="slot-remove" title="Remove">✕</button>
    `;

    slot.querySelector('.slot-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      uiState.engine.removeCard(card.id);
      onCardRemoved();
    });

    slot.addEventListener('pointerdown', (e) => {
      onBoardPointerDragStart(e, card.id, slot, onCardRemoved);
    });

    slot.addEventListener('mouseenter', (e) => showTooltip(card, e, { inactive: isInactive }));
    slot.addEventListener('mouseleave', hideTooltip);
    slot.addEventListener('mousemove', moveTooltip);
    slot.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showCardDetail(card);
    });

    container.appendChild(slot);
  }

  renderSynergyPanel();
}

const DRAG_THRESHOLD = 5;

function onBoardPointerDragStart(e, cardId, slotEl, onCardRemoved) {
  if (e.button !== 0) return;
  e.preventDefault();
  hideTooltip();

  const startX = e.clientX;
  const startY = e.clientY;
  let clone = null;
  let dragging = false;

  function onMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    if (!dragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      dragging = true;
      uiState.draggedCardId = cardId;
      uiState.dragSource = 'board';
      slotEl.classList.add('dragging');

      clone = slotEl.cloneNode(true);
      clone.className = 'slot filled drag-clone';
      const rect = slotEl.getBoundingClientRect();
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      document.body.appendChild(clone);
      uiState.dragClone = clone;
    }

    if (clone) {
      clone.style.left = `${ev.clientX - 40}px`;
      clone.style.top = `${ev.clientY - 40}px`;
      updateDropZoneHighlight(ev.clientX, ev.clientY);
    }
  }

  function onUp(ev) {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);

    if (clone) {
      clone.remove();
      uiState.dragClone = null;
    }
    slotEl.classList.remove('dragging');
    clearDropZoneHighlight();

    if (dragging) {
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const handArea = document.querySelector('.hand-area');
      if (handArea && (handArea === target || handArea.contains(target))) {
        uiState.engine.removeCard(cardId);
        onCardRemoved();
      }
    }

    uiState.draggedCardId = null;
    uiState.dragSource = null;
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function renderSynergyPanel() {
  const panel = document.getElementById('synergy-panel');
  const synergies = uiState.engine.getActiveSynergies();

  if (synergies.length === 0) {
    panel.innerHTML = '';
    panel.style.display = 'none';
    return;
  }

  panel.style.display = '';
  const unique = deduplicateSynergies(synergies);
  const rows = unique.map(s => renderSynergyRow(s, uiState.engine)).filter(Boolean);
  panel.innerHTML = `<div class="synergy-panel-title">Synergies</div>${rows.join('')}`;
}

export function renderStuckHint() {
  const existing = document.getElementById('stuck-hint');
  if (existing) existing.remove();

  if (!uiState.engine || uiState.engine.allGoalsMet()) return;

  const goals = uiState.engine.checkGoals();
  const unmetGoals = goals.filter(g => !g.met);
  if (unmetGoals.length === 0) return;

  const boardIds = new Set(uiState.engine.getBoardCardIds());
  if (boardIds.size < 4) return;

  const { feasible, bestGoalsMet, totalGoals } = uiState.engine.checkFeasibility();
  const resourcesLeft = uiState.engine.getTotalResources() - uiState.engine.getResourcesUsed();

  const hint = document.createElement('div');
  hint.id = 'stuck-hint';
  hint.className = 'stuck-hint';

  let message = '';

  if (!feasible) {
    const missing = totalGoals - bestGoalsMet;
    message = `<strong>No winning combination exists</strong> with your current cards. ${missing} goal${missing > 1 ? 's' : ''} can't be met. Try removing cards and rearranging — or, in campaign mode, this may mean an earlier draft choice needs rethinking.`;
  } else if (resourcesLeft === 0 && unmetGoals.length > 0) {
    message = `<strong>Budget spent, but a solution exists.</strong> Try swapping — remove a card that contributes least to your unmet goals and replace it.`;
  } else if (resourcesLeft <= 1 && unmetGoals.length > 0) {
    message = `<strong>Close!</strong> ${unmetGoals.length} goal${unmetGoals.length > 1 ? 's' : ''} remaining with ${resourcesLeft} resource${resourcesLeft === 1 ? '' : 's'} left. Check card tooltips for "Best for" hints.`;
  } else {
    return;
  }

  hint.innerHTML = `<span class="stuck-hint-icon">💡</span><span class="stuck-hint-text">${message}</span><button class="stuck-hint-close" onclick="this.parentElement.remove()">✕</button>`;

  document.querySelector('.board-area').appendChild(hint);
}

export function initBoardDrop() {
  const boardArea = document.querySelector('.board-area');

  if (boardArea && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        document.body.classList.toggle('board-narrow', entry.contentRect.width < 700);
      }
    });
    ro.observe(boardArea);
  }
}
