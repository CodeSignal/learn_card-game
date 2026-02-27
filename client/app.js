import Modal from './design-system/components/modal/modal.js';
import { GameEngine } from './modules/engine.js';
import { uiState, resetEncounterState } from './modules/state.js';

import { renderHeaderMetrics, renderResources, renderCampaignProgress, renderLastAttempt, checkTitleOverflow } from './renderers/header.js';
import { renderBoardSlots, initBoardDrop } from './renderers/board.js';
import { renderHandCards, renderFilters, showSynergySparks } from './renderers/hand.js';
import { startBattle, updateDeployButton } from './renderers/battle.js';
import { showDraftScreen } from './renderers/draft.js';
import { showEncounterTransition, showCampaignComplete, toggleScenarioPopup, toggleSynergyPopup, closeAllPopups, updateSynergyButton } from './renderers/overlays.js';
import { hideTooltip } from './renderers/tooltip.js';
import { showNotification } from './modules/notify.js';
import { initAuthoring } from './renderers/authoring.js';

const AUTOSAVE_DEBOUNCE_MS = 800;

// ── Data Loading ──

async function loadDeck(deckId) {
  const res = await fetch(`./data/cards/${deckId}.json`);
  if (!res.ok) throw new Error(`Failed to load deck: ${deckId}`);
  return res.json();
}

async function loadScenario(scenarioId) {
  const res = await fetch(`./data/scenarios/${scenarioId}.json`);
  if (!res.ok) throw new Error(`Failed to load scenario: ${scenarioId}`);
  return res.json();
}

async function loadSavedState() {
  try {
    const res = await fetch('/state');
    if (res.ok) return res.json();
  } catch { /* no saved state */ }
  return null;
}

async function loadInitialState() {
  try {
    const res = await fetch('/initial-state');
    if (res.ok) return res.json();
  } catch { /* no initial state */ }
  return null;
}

async function loadCampaign(campaignId) {
  const res = await fetch(`./data/campaigns/${campaignId}.json`);
  if (!res.ok) throw new Error(`Failed to load campaign: ${campaignId}`);
  return res.json();
}

function saveState() {
  clearTimeout(uiState.saveTimer);
  uiState.saveTimer = setTimeout(() => {
    if (!uiState.engine) return;
    fetch('/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uiState.engine.getState()),
    }).catch(() => showNotification('Auto-save failed', 'warning'));
  }, AUTOSAVE_DEBOUNCE_MS);
}

function saveStateImmediate() {
  clearTimeout(uiState.saveTimer);
  if (!uiState.engine) return;
  fetch('/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(uiState.engine.getState()),
  }).catch(() => showNotification('Auto-save failed', 'warning'));
}

function surfaceValidationErrors() {
  const errors = uiState.engine._validationErrors;
  if (errors && errors.length > 0) {
    showNotification(`Content issues: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}`, 'warning');
  }
}

// ── Render Orchestration ──

const callbacks = {
  onCardPlayed(cardId, result, sourceEl) {
    uiState.failedDeployCount = 0;
    renderAll(cardId);
    saveState();
    if (result.synergies.length > 0) {
      const rect = sourceEl instanceof Element
        ? sourceEl.getBoundingClientRect()
        : { left: sourceEl.clientX, top: sourceEl.clientY, width: 0 };
      showSynergySparks(rect.left + (rect.width || 0) / 2, rect.top, result.synergies);
    }
  },
  onCardRemoved() {
    uiState.failedDeployCount = 0;
    renderAll();
    saveState();
  },
};

function renderAll(justPlayedCardId = null) {
  uiState.deployRevealed = false;
  hideTooltip();
  renderHeaderMetrics();
  renderResources();
  renderBoardSlots(justPlayedCardId, callbacks);
  renderHandCards({ onCardPlayed: callbacks.onCardPlayed });
  updateDeployButton();
  renderLastAttempt();
  updateSynergyButton();
  checkTitleOverflow();
}

function handleBattleVictory() {
  if (!uiState.campaignData) return;

  if (uiState.campaignEnded) {
    uiState.gameOver = true;
    renderAll();
    showCampaignComplete({ failed: true });
    return;
  }

  if (uiState.engine.isLastEncounter()) {
    uiState.gameOver = true;
    saveStateImmediate();
    showCampaignComplete({ failed: false });
  } else {
    showDraftScreen({ onDraftConfirmed: handleDraftConfirmed });
  }
}

function handleShowWinningPath(comboCardIds) {
  saveStateImmediate();
  uiState.campaignEnded = true;
  for (const id of uiState.engine.getBoardCardIds()) {
    uiState.engine.removeCard(id);
  }
  uiState.winningPathCardIds = new Set(comboCardIds);
  renderAll();
  renderCampaignProgress();
}

function handleCampaignOver() {
  uiState.gameOver = true;
  saveStateImmediate();
  renderAll();
  renderCampaignProgress();
  showCampaignComplete({ failed: true });
}

async function handleDraftConfirmed() {
  const nextIdx = uiState.engine.currentEncounterIndex + 1;
  const nextEncounter = uiState.campaignData.encounters[nextIdx];
  const nextScenario = await loadScenario(nextEncounter.scenarioId);
  const clearBoard = nextEncounter.carryForward === false;

  uiState.engine.advanceEncounter(nextScenario);
  uiState.carriedCardIds = new Set(uiState.engine.carriedCardIds);
  uiState.scenarioData = nextScenario;
  document.getElementById('scenario-name').textContent = nextScenario.name;
  resetEncounterState();

  renderCampaignProgress();
  renderFilters();
  renderAll();
  saveState();

  showEncounterTransition(nextScenario, { clearBoard });
}

// ── Help Modal ──

async function initHelpModal() {
  try {
    const res = await fetch('./help-content.html');
    const content = await res.text();
    uiState.helpModal = Modal.createHelpModal({ title: 'How to Play', content });
  } catch {
    uiState.helpModal = Modal.createHelpModal({
      title: 'How to Play',
      content: '<p>Help content could not be loaded.</p>',
    });
  }
  document.getElementById('btn-help')?.addEventListener('click', () => uiState.helpModal.open());
}

// ── Initialize ──

async function initialize() {
  try {
    uiState.engine = new GameEngine();
    initHelpModal();
    initAuthoring();

    const savedState = await loadSavedState();
    const initial = await loadInitialState();
    const campaignId = initial?.campaignId || savedState?.campaignId;

    if (campaignId) {
      uiState.campaignData = await loadCampaign(campaignId);
      const deck = await loadDeck(uiState.campaignData.deckId);

      const encounterIndex = savedState?.currentEncounterIndex ?? 0;
      const encounter = uiState.campaignData.encounters[encounterIndex];
      const scenario = await loadScenario(encounter.scenarioId);

      uiState.engine.loadScenario(scenario, deck);
      surfaceValidationErrors();
      uiState.engine.setupCampaign(uiState.campaignData, encounterIndex);

      if (savedState) uiState.engine.loadState(savedState);

      uiState.carriedCardIds = new Set(uiState.engine.carriedCardIds);
      uiState.scenarioData = scenario;
      document.getElementById('scenario-name').textContent = scenario.name;
      renderCampaignProgress();
    } else {
      let scenarioId = savedState?.scenarioId;
      let deckId = savedState?.deckId;

      if (!scenarioId) {
        scenarioId = initial?.scenarioId || 'high-traffic-webapp';
        deckId = initial?.deckId || 'system-architecture';
      }

      const scenario = await loadScenario(scenarioId);
      const deck = await loadDeck(deckId || scenario.deckId);

      uiState.engine.loadScenario(scenario, deck);
      surfaceValidationErrors();
      uiState.scenarioData = scenario;

      if (savedState?.cardsOnBoard) uiState.engine.loadState(savedState);

      document.getElementById('scenario-name').textContent = scenario.name;
    }

    document.getElementById('btn-scenario-info')?.addEventListener('click', toggleScenarioPopup);
    document.getElementById('btn-synergy')?.addEventListener('click', toggleSynergyPopup);
    document.getElementById('btn-deploy')?.addEventListener('click', () => {
      startBattle({ onVictory: handleBattleVictory, onShowWinningPath: handleShowWinningPath, onCampaignOver: handleCampaignOver, onRetryUsed: saveState });
    });
    document.querySelector('.victory-close')?.addEventListener('click', () => {
      uiState.victoryDismissed = true;
      document.getElementById('victory-banner').style.display = 'none';
    });

    const cosmoFence = document.querySelector('.cosmo-fence');
    if (cosmoFence) {
      const cosmoImg = cosmoFence.querySelector('.cosmo-fence-img');
      const defaultSrc = cosmoImg.src;
      let cosmoTimer = null;
      cosmoFence.addEventListener('click', () => {
        clearTimeout(cosmoTimer);
        cosmoImg.src = './cosmo/torso-star-eyes.svg';
        cosmoImg.classList.remove('cosmo-bounce');
        void cosmoImg.offsetWidth;
        cosmoImg.classList.add('cosmo-bounce');
        cosmoTimer = setTimeout(() => {
          cosmoImg.src = defaultSrc;
          cosmoImg.classList.remove('cosmo-bounce');
        }, 1000);
      });
    }

    window.addEventListener('resize', () => {
      closeAllPopups();
      checkTitleOverflow();
    });

    renderFilters();
    renderAll();
    initBoardDrop();

    const isRestoredGame = savedState?.cardsOnBoard?.length > 0;
    if (!isRestoredGame) {
      showEncounterTransition(uiState.scenarioData);
    }
  } catch (err) {
    console.error('Failed to initialize game:', err);
    showNotification(`Failed to start: ${err.message}`, 'error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
