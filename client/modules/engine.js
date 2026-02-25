import { validateScenario, validateDeck } from './validate.js';

/**
 * @typedef {Object} MetricConfig
 * @property {number} base - Starting value for this metric
 * @property {string} [label] - Display name
 * @property {string} [unit] - Display unit (e.g. "ms", "req/s")
 * @property {boolean} [lowerIsBetter] - If true, lower values are desirable
 * @property {number} [cap] - Maximum possible value (used for bar scaling)
 */

/**
 * @typedef {Object} Goal
 * @property {string} metric - Key into baseMetrics
 * @property {string} operator - Comparison operator ("<=", ">=", "<", ">", "==")
 * @property {number} value - Target threshold
 * @property {string} [label] - Human-readable description
 */

/**
 * @typedef {Object} Scenario
 * @property {string} id
 * @property {string} name
 * @property {string} briefing
 * @property {Object<string, MetricConfig>} baseMetrics
 * @property {Goal[]} goals
 * @property {number} totalResources
 * @property {string[]} [availableCards] - Card IDs available in this scenario
 * @property {string} [deckId] - Default deck for standalone mode
 */

/**
 * @typedef {Object} Synergy
 * @property {string} with - Partner card ID
 * @property {string} metric - Metric key affected
 * @property {number} bonus - Bonus value applied
 * @property {string} reason - Human-readable explanation
 */

/**
 * @typedef {Object} Card
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {string} type - Category (e.g. "backend", "training")
 * @property {string} description
 * @property {number} cost - Resource cost to play
 * @property {Object<string, number>} effects - Metric key → delta value
 * @property {string[]} prerequisites - Required card IDs or tags
 * @property {Synergy[]} synergies
 * @property {string[]} tags
 * @property {string} [bestFor] - Context hint for drafting
 * @property {string} [notGreatFor] - Anti-pattern hint
 */

/**
 * @typedef {Object} Deck
 * @property {string} id
 * @property {string} name
 * @property {Card[]} cards
 */

/**
 * @typedef {Object} GameState
 * @property {string} scenarioId
 * @property {string} deckId
 * @property {string[]} cardsOnBoard
 * @property {string} [campaignId]
 * @property {number} [currentEncounterIndex]
 * @property {string[]} [handCardIds]
 */

function evalOperator(op, actual, target) {
  switch (op) {
    case '<=': return actual <= target;
    case '>=': return actual >= target;
    case '<':  return actual < target;
    case '>':  return actual > target;
    case '==': return actual === target;
    default:   return false;
  }
}

/**
 * Core game engine for the card game simulation.
 * Handles metric calculation, synergy detection, prerequisite validation,
 * and goal checking. Designed to support future turn/event extensions.
 */

export class GameEngine {
  constructor() {
    this.scenario = null;
    this.deck = null;
    this.cardMap = new Map();
    this.boardCardIds = [];
    this.listeners = [];

    // Campaign mode state
    this.campaign = null;
    this.currentEncounterIndex = 0;
    this.handCardIds = [];
    this.retriesUsed = 0;
    this.carriedCardIds = [];

    // Telemetry for grading
    this.attemptLog = [];
    this.draftLog = [];
  }

  loadScenario(scenario, deck) {
    const scenarioErrors = validateScenario(scenario);
    const deckErrors = validateDeck(deck, scenario);
    const allErrors = [...scenarioErrors, ...deckErrors];
    if (allErrors.length > 0) {
      console.warn('Content validation warnings:\n' + allErrors.map(e => `  • ${e}`).join('\n'));
      this._validationErrors = allErrors;
    } else {
      this._validationErrors = [];
    }

    this.scenario = scenario;
    this.deck = deck;
    this.cardMap.clear();
    this.boardCardIds = [];

    for (const card of deck.cards) {
      this.cardMap.set(card.id, card);
    }
  }

  /**
   * Set up campaign mode after loadScenario. Call once on init; on
   * subsequent encounters call advanceEncounter() instead.
   */
  setupCampaign(campaign, encounterIndex = 0) {
    this.campaign = campaign;
    this.currentEncounterIndex = encounterIndex;
    if (this.handCardIds.length === 0) {
      this.handCardIds = [...(campaign.encounters[0].startingHand || [])];
    }
  }

  loadState(savedState) {
    if (savedState && Array.isArray(savedState.cardsOnBoard)) {
      this.boardCardIds = savedState.cardsOnBoard.filter(id => this.cardMap.has(id));
    }
    if (savedState && Array.isArray(savedState.handCardIds)) {
      this.handCardIds = savedState.handCardIds.filter(id => this.cardMap.has(id));
    }
    if (this.campaign && savedState?.currentEncounterIndex !== undefined) {
      this.currentEncounterIndex = savedState.currentEncounterIndex;
    }
    if (savedState?.retriesUsed !== undefined) {
      this.retriesUsed = savedState.retriesUsed;
    }
    if (Array.isArray(savedState?.attemptLog)) {
      this.attemptLog = savedState.attemptLog;
    }
    if (Array.isArray(savedState?.draftLog)) {
      this.draftLog = savedState.draftLog;
    }
    if (Array.isArray(savedState?.carriedCardIds)) {
      this.carriedCardIds = savedState.carriedCardIds.filter(id => this.cardMap.has(id));
    }
  }

  on(eventName, fn) {
    this.listeners.push({ eventName, fn });
  }

  emit(eventName, data) {
    for (const l of this.listeners) {
      if (l.eventName === eventName) l.fn(data);
    }
  }

  getCard(cardId) {
    return this.cardMap.get(cardId);
  }

  getAvailableCards() {
    if (!this.scenario) return [];
    if (this.campaign) {
      return this.handCardIds
        .map(id => this.cardMap.get(id))
        .filter(Boolean);
    }
    return (this.scenario.availableCards || [])
      .map(id => this.cardMap.get(id))
      .filter(Boolean);
  }

  // ── Campaign helpers ──

  getCurrentEncounter() {
    if (!this.campaign) return null;
    return this.campaign.encounters[this.currentEncounterIndex] || null;
  }

  getCurrentDraftPool() {
    const enc = this.getCurrentEncounter();
    return (enc?.draftPool || []).map(id => this.cardMap.get(id)).filter(Boolean);
  }

  getDraftPicksRequired() {
    return this.getCurrentEncounter()?.draftPicks || 0;
  }

  isLastEncounter() {
    if (!this.campaign) return true;
    return this.currentEncounterIndex >= this.campaign.encounters.length - 1;
  }

  getMaxRetries() {
    return this.campaign?.maxRetries ?? 0;
  }

  getRetriesRemaining() {
    return this.getMaxRetries() - this.retriesUsed;
  }

  useRetry() {
    if (this.getRetriesRemaining() <= 0) return false;
    this.retriesUsed++;
    return true;
  }

  recordAttempt(goals) {
    this.attemptLog.push({
      encounterIndex: this.currentEncounterIndex,
      board: [...this.boardCardIds],
      goals: goals.map(g => ({
        metric: g.metric,
        met: g.met,
        currentValue: g.currentValue,
        target: g.value,
        operator: g.operator,
      })),
      synergies: this.getActiveSynergies().map(s => ({
        cards: [s.sourceCard, s.targetCard],
        metric: s.metric,
        bonus: s.bonus,
      })),
      allMet: goals.every(g => g.met),
      timestamp: new Date().toISOString(),
    });
  }

  recordDraft(picked, pool) {
    this.draftLog.push({
      afterEncounterIndex: this.currentEncounterIndex,
      picked: [...picked],
      pool: [...pool],
    });
  }

  draftCard(cardId) {
    if (!this.cardMap.has(cardId)) return false;
    if (!this.handCardIds.includes(cardId)) this.handCardIds.push(cardId);
    return true;
  }

  /**
   * Advance to the next encounter. nextScenario must be pre-loaded by the caller.
   * If the *next* encounter has carryForward: true, the board persists.
   */
  advanceEncounter(nextScenario) {
    const nextIdx = this.currentEncounterIndex + 1;
    const nextEnc = this.campaign?.encounters[nextIdx];
    const clearBoard = nextEnc?.carryForward === false;
    this.carriedCardIds = clearBoard ? [] : [...this.boardCardIds];
    this.currentEncounterIndex++;
    if (clearBoard) this.boardCardIds = [];
    this.scenario = nextScenario;
    this.emit('stateChanged', this.getState());
  }

  getBoardCards() {
    return this.boardCardIds.map(id => this.cardMap.get(id)).filter(Boolean);
  }

  getBoardCardIds() {
    return [...this.boardCardIds];
  }

  isOnBoard(cardId) {
    return this.boardCardIds.includes(cardId);
  }

  isAvailable(cardId) {
    if (this.boardCardIds.includes(cardId)) return true;
    if (this.campaign) return this.handCardIds.includes(cardId);
    return (this.scenario?.availableCards || []).includes(cardId);
  }

  getResourcesUsed() {
    return this.getBoardCards().reduce((sum, card) => sum + card.cost, 0);
  }

  getTotalResources() {
    return this.scenario ? this.scenario.totalResources : 0;
  }

  getResourcesRemaining() {
    return this.getTotalResources() - this.getResourcesUsed();
  }

  /**
   * Check if a card's prerequisites are met.
   * Prerequisites are tag-based ("backend") or card-id-based ("docker").
   */
  checkPrerequisites(cardId) {
    const card = this.cardMap.get(cardId);
    if (!card || card.prerequisites.length === 0) return { met: true, missing: [] };

    const boardTags = new Set();
    const boardIds = new Set();
    for (const id of this.boardCardIds) {
      if (id === cardId) continue;
      boardIds.add(id);
      const bc = this.cardMap.get(id);
      if (bc) for (const tag of bc.tags) boardTags.add(tag);
    }

    const missing = [];
    for (const prereq of card.prerequisites) {
      if (!boardTags.has(prereq) && !boardIds.has(prereq)) {
        missing.push(prereq);
      }
    }

    return { met: missing.length === 0, missing };
  }

  canPlayCard(cardId) {
    if (this.isOnBoard(cardId)) return { allowed: false, reason: 'Already on board' };

    const card = this.cardMap.get(cardId);
    if (!card) return { allowed: false, reason: 'Card not found' };

    if (card.cost > this.getResourcesRemaining()) {
      return { allowed: false, reason: `Need ${card.cost} resources, only ${this.getResourcesRemaining()} left` };
    }

    const prereqs = this.checkPrerequisites(cardId);
    if (!prereqs.met) {
      return { allowed: false, reason: `Requires: ${prereqs.missing.join(', ')}` };
    }

    return { allowed: true };
  }

  playCard(cardId) {
    const check = this.canPlayCard(cardId);
    if (!check.allowed) return { success: false, reason: check.reason };

    this.boardCardIds.push(cardId);

    const newSynergies = this.findNewSynergies(cardId);

    this.emit('cardPlayed', { cardId, synergies: newSynergies });
    this.emit('stateChanged', this.getState());

    return { success: true, synergies: newSynergies };
  }

  removeCard(cardId) {
    const idx = this.boardCardIds.indexOf(cardId);
    if (idx === -1) return { success: false, reason: 'Card not on board' };

    this.boardCardIds.splice(idx, 1);

    this.emit('cardRemoved', { cardId, reason: 'manual' });
    this.emit('stateChanged', this.getState());

    return { success: true, nowInactive: this.getInactiveCardIds() };
  }

  findBrokenPrerequisites() {
    const broken = [];
    let changed = true;

    while (changed) {
      changed = false;
      for (const id of this.boardCardIds) {
        if (broken.includes(id)) continue;
        const prereqs = this.checkPrerequisites(id);
        if (!prereqs.met) {
          broken.push(id);
          changed = true;
        }
      }
    }
    return broken;
  }

  /**
   * Returns set of board card IDs whose prerequisites are not met.
   * Computed fresh each call so re-activation is automatic.
   */
  getInactiveCardIds() {
    return new Set(this.findBrokenPrerequisites());
  }

  /**
   * Find synergies activated by a newly played card.
   */
  findNewSynergies(newCardId) {
    const activated = [];
    const newCard = this.cardMap.get(newCardId);
    if (!newCard) return activated;

    // Check the new card's synergies
    for (const syn of newCard.synergies) {
      if (this.isOnBoard(syn.with)) {
        activated.push({
          sourceCard: newCardId,
          targetCard: syn.with,
          metric: syn.metric,
          bonus: syn.bonus,
          reason: syn.reason
        });
      }
    }

    // Check if existing board cards have synergies with the new card
    for (const existingId of this.boardCardIds) {
      if (existingId === newCardId) continue;
      const existing = this.cardMap.get(existingId);
      if (!existing) continue;
      for (const syn of existing.synergies) {
        if (syn.with === newCardId) {
          activated.push({
            sourceCard: existingId,
            targetCard: newCardId,
            metric: syn.metric,
            bonus: syn.bonus,
            reason: syn.reason
          });
        }
      }
    }

    return activated;
  }

  /**
   * Get all currently active synergies on the board.
   */
  getActiveSynergies() {
    const inactive = this.getInactiveCardIds();
    const synergies = [];
    for (const cardId of this.boardCardIds) {
      if (inactive.has(cardId)) continue;
      const card = this.cardMap.get(cardId);
      if (!card) continue;
      for (const syn of card.synergies) {
        if (this.isOnBoard(syn.with) && !inactive.has(syn.with)) {
          synergies.push({
            sourceCard: cardId,
            targetCard: syn.with,
            metric: syn.metric,
            bonus: syn.bonus,
            reason: syn.reason
          });
        }
      }
    }
    return synergies;
  }

  /**
   * Calculate current metrics based on board cards and synergies.
   */
  calculateMetrics() {
    if (!this.scenario) return {};

    const metrics = {};
    for (const [key, config] of Object.entries(this.scenario.baseMetrics)) {
      metrics[key] = {
        value: config.base,
        base: config.base,
        unit: config.unit,
        label: config.label,
        lowerIsBetter: config.lowerIsBetter,
        cap: config.cap
      };
    }

    const inactive = this.getInactiveCardIds();

    // Apply card effects (skip inactive cards)
    for (const cardId of this.boardCardIds) {
      if (inactive.has(cardId)) continue;
      const card = this.cardMap.get(cardId);
      if (!card) continue;
      for (const [metric, effect] of Object.entries(card.effects)) {
        if (metrics[metric]) {
          metrics[metric].value += effect;
        }
      }
    }

    // Apply synergy bonuses (getActiveSynergies already excludes inactive)
    for (const syn of this.getActiveSynergies()) {
      if (metrics[syn.metric]) {
        metrics[syn.metric].value += syn.bonus;
      }
    }

    // Apply caps and floors
    for (const m of Object.values(metrics)) {
      if (m.cap !== undefined) m.value = Math.min(m.value, m.cap);
      if (m.lowerIsBetter) m.value = Math.max(m.value, 0);
    }

    return metrics;
  }

  /**
   * Check which goals are met and which aren't.
   */
  checkGoals() {
    if (!this.scenario) return [];
    const metrics = this.calculateMetrics();

    return this.scenario.goals.map(goal => {
      const metric = metrics[goal.metric];
      if (!metric) return { ...goal, met: false, currentValue: null };

      const met = evalOperator(goal.operator, metric.value, goal.value);

      return { ...goal, met, currentValue: metric.value };
    });
  }

  allGoalsMet() {
    return this.checkGoals().every(g => g.met);
  }

  /**
   * Check if any combination of available (unplayed) cards can meet all goals.
   * Uses brute-force subset enumeration — safe for ≤ 16 cards.
   * Returns { feasible, bestGoalsMet, totalGoals, bestCombo }.
   */
  checkFeasibility() {
    if (!this.scenario) return { feasible: false, bestGoalsMet: 0, totalGoals: 0, bestCombo: [] };
    if (this.allGoalsMet()) return { feasible: true, bestGoalsMet: this.scenario.goals.length, totalGoals: this.scenario.goals.length, bestCombo: [...this.boardCardIds] };

    const available = this.getAvailableCards();
    const budget = this.getTotalResources();
    const goals = this.scenario.goals;
    const baseMetrics = this.scenario.baseMetrics;

    let bestGoalsMet = 0;
    let bestCombo = [];

    const cardList = available;
    const n = cardList.length;
    if (n > 16) return { feasible: true, bestGoalsMet: goals.length, totalGoals: goals.length, bestCombo: [] };

    for (let mask = 0; mask < (1 << n); mask++) {
      let cost = 0;
      const selected = [];
      const metrics = {};

      for (const [k, v] of Object.entries(baseMetrics)) {
        metrics[k] = v.base;
      }

      for (let j = 0; j < n; j++) {
        if (mask & (1 << j)) {
          const c = cardList[j];
          cost += c.cost;
          if (cost > budget) break;
          selected.push(c.id);
          for (const [k, v] of Object.entries(c.effects)) {
            if (metrics[k] !== undefined) metrics[k] += v;
          }
        }
      }
      if (cost > budget) continue;

      for (let j = 0; j < n; j++) {
        if (!(mask & (1 << j))) continue;
        for (const syn of cardList[j].synergies) {
          if (selected.includes(syn.with) && metrics[syn.metric] !== undefined) {
            metrics[syn.metric] += syn.bonus;
          }
        }
      }

      for (const [k, v] of Object.entries(baseMetrics)) {
        if (v.cap !== undefined) metrics[k] = Math.min(metrics[k], v.cap);
        if (v.lowerIsBetter) metrics[k] = Math.max(metrics[k], 0);
      }

      let met = 0;
      for (const g of goals) {
        const val = metrics[g.metric];
        if (evalOperator(g.operator, val, g.value)) met++;
      }

      if (met > bestGoalsMet) {
        bestGoalsMet = met;
        bestCombo = [...selected];
        if (met === goals.length) return { feasible: true, bestGoalsMet: met, totalGoals: goals.length, bestCombo };
      }
    }

    return { feasible: false, bestGoalsMet, totalGoals: goals.length, bestCombo };
  }

  getCampaignSummary() {
    const totalEncounters = this.campaign?.encounters.length ?? 0;

    const attemptsByEncounter = new Map();
    for (const a of this.attemptLog) {
      if (!attemptsByEncounter.has(a.encounterIndex)) {
        attemptsByEncounter.set(a.encounterIndex, []);
      }
      attemptsByEncounter.get(a.encounterIndex).push(a);
    }

    let encountersPassed = 0;
    let firstTrySuccesses = 0;
    const retryEncounters = [];

    for (const [idx, attempts] of attemptsByEncounter) {
      const passed = attempts.some(a => a.allMet);
      if (passed) {
        encountersPassed++;
        if (attempts[0].allMet) firstTrySuccesses++;
      }
      if (attempts.length > 1) retryEncounters.push(idx);
    }

    return {
      totalEncounters,
      encountersPassed,
      firstTrySuccesses,
      totalAttempts: this.attemptLog.length,
      retriesUsed: this.retriesUsed,
      maxRetries: this.getMaxRetries(),
      draftsMade: this.draftLog.length,
      retryEncounters,
    };
  }

  /**
   * Serialize the full game state for saving.
   */
  getState() {
    const metrics = this.calculateMetrics();
    const goals = this.checkGoals();
    const synergies = this.getActiveSynergies();

    const state = {
      scenarioId: this.scenario?.id || null,
      deckId: this.deck?.id || null,
      cardsOnBoard: [...this.boardCardIds],
      metrics: Object.fromEntries(
        Object.entries(metrics).map(([k, v]) => [k, { value: v.value, base: v.base }])
      ),
      resourcesUsed: this.getResourcesUsed(),
      totalResources: this.getTotalResources(),
      synergiesTriggered: synergies.map(s => ({
        cards: [s.sourceCard, s.targetCard],
        metric: s.metric,
        bonus: s.bonus,
        reason: s.reason
      })),
      goalsMetCount: goals.filter(g => g.met).length,
      totalGoals: goals.length,
      allGoalsMet: this.allGoalsMet(),
      timestamp: new Date().toISOString()
    };

    if (this.campaign) {
      state.campaignId = this.campaign.id;
      state.currentEncounterIndex = this.currentEncounterIndex;
      state.handCardIds = [...this.handCardIds];
      state.retriesUsed = this.retriesUsed;
      state.attemptLog = this.attemptLog;
      state.draftLog = this.draftLog;
      state.carriedCardIds = [...this.carriedCardIds];
    }

    return state;
  }
}
