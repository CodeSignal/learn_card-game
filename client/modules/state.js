export const uiState = {
  engine: null,
  scenarioData: null,
  campaignData: null,
  activeFilter: 'all',
  deployRevealed: false,
  lastAttemptGoals: null,
  victoryDismissed: false,
  draggedCardId: null,
  dragSource: null,
  dragClone: null,
  dragDidMove: false,
  draftSelections: new Set(),
  helpModal: null,
  scenarioPopup: null,
  synergyPopup: null,
  tooltip: null,
  saveTimer: null,
  failedDeployCount: 0,
  carriedCardIds: new Set(),
  winningPathCardIds: null,
  gameOver: false,
  campaignEnded: false,
};

export function resetEncounterState() {
  uiState.deployRevealed = false;
  uiState.lastAttemptGoals = null;
  uiState.victoryDismissed = false;
  uiState.activeFilter = 'all';
  uiState.draftSelections = new Set();
  uiState.draggedCardId = null;
  uiState.dragSource = null;
  uiState.dragClone = null;
  uiState.dragDidMove = false;
  uiState.tooltip = null;
  uiState.scenarioPopup = null;
  uiState.synergyPopup = null;
  uiState.failedDeployCount = 0;
  uiState.winningPathCardIds = null;
}
