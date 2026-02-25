import { uiState } from '../modules/state.js';
import { TYPE_COLORS, isAntiSynergy } from './shared.js';
import { showTooltip, hideTooltip, moveTooltip } from './tooltip.js';
import { showCardDetail } from './card-detail.js';

let _onCardPlayed = null;

export function renderHandCards({ onCardPlayed } = {}) {
  if (onCardPlayed) _onCardPlayed = onCardPlayed;
  const container = document.getElementById('hand-cards');
  container.innerHTML = '';

  const available = uiState.engine.getAvailableCards();
  const cards = [];

  for (const card of available) {
    if (uiState.engine.isOnBoard(card.id)) continue;
    if (uiState.activeFilter !== 'all' && card.type !== uiState.activeFilter) continue;

    const canPlay = uiState.engine.canPlayCard(card.id);
    const el = createHandCard(card, canPlay);
    if (uiState.winningPathCardIds?.has(card.id)) el.classList.add('winning-path');
    cards.push(el);
    container.appendChild(el);
  }

  applyFanLayout(cards);
}

function createHandCard(card, canPlay) {
  const disabled = !canPlay.allowed;
  const tooExpensive = card.cost > uiState.engine.getResourcesRemaining();
  const costClass = disabled ? (tooExpensive ? 'over-budget' : 'prereq-blocked') : 'affordable';

  const el = document.createElement('div');
  el.className = `card-item${disabled ? ' disabled' : ''}`;
  el.dataset.cardId = card.id;
  if (TYPE_COLORS[card.type]) el.style.setProperty('--type-color', TYPE_COLORS[card.type]);

  el.innerHTML = `
    <div class="card-cost-badge ${costClass}">⬡ ${card.cost}</div>
    <button class="card-info-btn" title="View details">i</button>
    <span class="card-icon">${card.icon}</span>
    <span class="card-name">${card.name}</span>
    <div class="card-type-strip ${card.type}"></div>
  `;

  el.querySelector('.card-info-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showCardDetail(card);
  });

  if (!disabled) {
    el.addEventListener('pointerdown', (e) => onPointerDragStart(e, card.id, el));
    el.addEventListener('click', () => {
      if (uiState.dragDidMove) return;
      const result = uiState.engine.playCard(card.id);
      if (result.success && _onCardPlayed) {
        _onCardPlayed(card.id, result, el);
      }
    });
  } else {
    el.addEventListener('click', () => showCardDetail(card));
  }

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showCardDetail(card);
  });

  el.addEventListener('mouseenter', (e) => showTooltip(card, e));
  el.addEventListener('mouseleave', (e) => {
    hideTooltip();
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
  });
  el.addEventListener('mousemove', (e) => {
    moveTooltip(e);
    applyTilt(el, e);
  });

  return el;
}

function applyTilt(el, e) {
  const rect = el.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width - 0.5;
  const y = (e.clientY - rect.top) / rect.height - 0.5;
  el.style.setProperty('--tilt-x', `${x * 10}deg`);
  el.style.setProperty('--tilt-y', `${-y * 8}deg`);
}

/**
 * Apply a fan-spread layout to hand cards. Each card gets a slight rotation
 * and vertical lift based on its position, creating an arc effect.
 */
function applyFanLayout(cards) {
  const n = cards.length;
  if (n === 0) return;

  const maxAngle = Math.min(3, 20 / n);
  const maxLift = Math.min(8, 60 / n);

  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1 to 1
    const angle = t * maxAngle;
    const lift = Math.abs(t) * maxLift;

    cards[i].style.setProperty('--fan-angle', `${angle}deg`);
    cards[i].style.setProperty('--fan-lift', `${lift}px`);
    cards[i].style.setProperty('--fan-z', String(n - Math.abs(Math.round(t * n))));
  }
}

const DRAG_THRESHOLD = 5;

function onPointerDragStart(e, cardId, sourceEl) {
  if (e.button !== 0) return;
  e.preventDefault();
  hideTooltip();

  const startX = e.clientX;
  const startY = e.clientY;
  let clone = null;
  let dragging = false;
  uiState.dragDidMove = false;

  function onMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;

    if (!dragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      dragging = true;
      uiState.dragDidMove = true;
      uiState.draggedCardId = cardId;
      uiState.dragSource = 'hand';
      sourceEl.classList.add('dragging');

      clone = sourceEl.cloneNode(true);
      clone.className = 'card-item drag-clone';
      const rect = sourceEl.getBoundingClientRect();
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
    sourceEl.classList.remove('dragging');
    clearDropZoneHighlight();

    if (dragging) {
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const board = document.getElementById('board');
      if (board && (board === target || board.contains(target))) {
        const result = uiState.engine.playCard(cardId);
        if (result.success && _onCardPlayed) {
          _onCardPlayed(cardId, result, ev);
        }
      }
    }

    uiState.draggedCardId = null;
    uiState.dragSource = null;
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

export function updateDropZoneHighlight(x, y) {
  const board = document.getElementById('board');
  const handArea = document.querySelector('.hand-area');
  const elUnder = document.elementFromPoint(x, y);

  if (uiState.dragSource === 'hand') {
    board?.classList.toggle('drag-over', board === elUnder || board.contains(elUnder));
  } else if (uiState.dragSource === 'board') {
    handArea?.classList.toggle('drag-over-remove', handArea === elUnder || handArea.contains(elUnder));
  }
}

export function clearDropZoneHighlight() {
  document.getElementById('board')?.classList.remove('drag-over');
  document.querySelector('.hand-area')?.classList.remove('drag-over-remove');
}

export function renderFilters() {
  const available = uiState.engine.getAvailableCards();
  const types = [...new Set(available.map(c => c.type))].sort();

  const bar = document.getElementById('filter-bar');
  bar.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = `filter-btn ${uiState.activeFilter === 'all' ? 'active' : ''}`;
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => { uiState.activeFilter = 'all'; renderFilters(); renderHandCards({}); });
  bar.appendChild(allBtn);

  for (const type of types) {
    const btn = document.createElement('button');
    const isActive = uiState.activeFilter === type;
    btn.className = `filter-btn ${isActive ? 'active' : ''}`;
    btn.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    const c = TYPE_COLORS[type];
    if (c) {
      if (isActive) {
        btn.style.background = c;
        btn.style.borderColor = c;
        btn.style.color = 'var(--Colors-Text-Body-White)';
      } else {
        btn.style.borderColor = c;
        btn.style.color = c;
      }
    }
    btn.addEventListener('click', () => { uiState.activeFilter = type; renderFilters(); renderHandCards({}); });
    bar.appendChild(btn);
  }
}

export function showSynergySparks(x, y, synergies) {
  for (let i = 0; i < synergies.length; i++) {
    const anti = isAntiSynergy(synergies[i].bonus, synergies[i].metric);
    const spark = document.createElement('div');
    spark.className = anti ? 'synergy-spark anti' : 'synergy-spark';
    spark.textContent = anti ? '⚠' : '⚡';
    spark.style.left = `${x + (Math.random() - 0.5) * 60}px`;
    spark.style.top = `${y + (Math.random() - 0.5) * 60}px`;
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 800);
  }
}
