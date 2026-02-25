import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine } from '../engine.js';

// ─── Fixtures ──────────────────────────────────────────────────────

function makeCard(overrides = {}) {
  return {
    id: 'card-a',
    name: 'Card A',
    icon: '🅰️',
    type: 'backend',
    description: 'Test card A',
    cost: 3,
    effects: { latency: -20, throughput: 10 },
    prerequisites: [],
    synergies: [],
    tags: ['backend'],
    ...overrides,
  };
}

const cardA = makeCard();
const cardB = makeCard({
  id: 'card-b',
  name: 'Card B',
  type: 'cache',
  cost: 4,
  effects: { throughput: 15, reliability: 5 },
  prerequisites: ['backend'],
  synergies: [],
  tags: ['cache'],
});
const cardC = makeCard({
  id: 'card-c',
  name: 'Card C',
  type: 'cdn',
  cost: 2,
  effects: { latency: -10 },
  prerequisites: [],
  synergies: [
    { with: 'card-a', metric: 'latency', bonus: -5, reason: 'CDN + Backend combo' },
  ],
  tags: ['cdn'],
});
const cardD = makeCard({
  id: 'card-d',
  name: 'Card D',
  type: 'monitoring',
  cost: 1,
  effects: { reliability: 3 },
  prerequisites: [],
  synergies: [],
  tags: ['monitoring'],
});
const cardSelfRef = makeCard({
  id: 'card-selfref',
  name: 'Self-Referencing Card',
  type: 'training',
  cost: 3,
  effects: { latency: -15 },
  prerequisites: ['training'],
  synergies: [],
  tags: ['training'],
});

function makeScenario(overrides = {}) {
  return {
    id: 'test-scenario',
    name: 'Test Scenario',
    briefing: 'A test scenario',
    baseMetrics: {
      latency: { base: 100, unit: 'ms', lowerIsBetter: true, cap: 200 },
      throughput: { base: 50, unit: 'req/s' },
      reliability: { base: 90, unit: '%' },
    },
    goals: [
      { metric: 'latency', operator: '<=', value: 80, label: 'Low latency' },
      { metric: 'throughput', operator: '>=', value: 70, label: 'High throughput' },
    ],
    totalResources: 10,
    availableCards: ['card-a', 'card-b', 'card-c', 'card-d'],
    ...overrides,
  };
}

function makeDeck(cards = [cardA, cardB, cardC, cardD]) {
  return { id: 'test-deck', name: 'Test Deck', cards };
}

function loadedEngine(scenarioOverrides = {}, cards) {
  const engine = new GameEngine();
  engine.loadScenario(makeScenario(scenarioOverrides), makeDeck(cards));
  return engine;
}

// ─── Metric Calculation ────────────────────────────────────────────

describe('GameEngine — metric calculation', () => {
  let engine;
  beforeEach(() => { engine = loadedEngine(); });

  it('returns base values when no cards are played', () => {
    const m = engine.calculateMetrics();
    expect(m.latency.value).toBe(100);
    expect(m.throughput.value).toBe(50);
    expect(m.reliability.value).toBe(90);
  });

  it('preserves metadata fields on each metric', () => {
    const m = engine.calculateMetrics();
    expect(m.latency.base).toBe(100);
    expect(m.latency.unit).toBe('ms');
    expect(m.latency.lowerIsBetter).toBe(true);
    expect(m.latency.cap).toBe(200);
  });

  it('applies card effects additively', () => {
    engine.playCard('card-a');
    const m = engine.calculateMetrics();
    expect(m.latency.value).toBe(80);   // 100 + (-20)
    expect(m.throughput.value).toBe(60); // 50 + 10
  });

  it('stacks effects from multiple cards', () => {
    engine.playCard('card-a');
    engine.playCard('card-c');
    const m = engine.calculateMetrics();
    // 100 + (-20) + (-10) + synergy(-5) = 65
    expect(m.latency.value).toBe(65);
  });

  it('includes synergy bonuses in metrics', () => {
    engine.playCard('card-a');
    engine.playCard('card-c'); // has synergy with card-a on latency: -5
    const m = engine.calculateMetrics();
    // card-a: latency -20, card-c: latency -10, synergy: -5 → 100-20-10-5=65
    expect(m.latency.value).toBe(65);
  });

  it('does not apply synergy when partner is missing', () => {
    engine.playCard('card-c'); // synergy partner card-a not on board
    const m = engine.calculateMetrics();
    expect(m.latency.value).toBe(90); // 100 + (-10), no synergy
  });

  it('enforces metric cap', () => {
    const bigCard = makeCard({
      id: 'card-big',
      effects: { latency: 150 },
      cost: 1,
    });
    const eng = loadedEngine({}, [bigCard]);
    eng.playCard('card-big');
    const m = eng.calculateMetrics();
    expect(m.latency.value).toBe(200); // cap is 200
  });

  it('enforces lowerIsBetter floor of 0', () => {
    const megaReduce = makeCard({
      id: 'card-mega',
      effects: { latency: -500 },
      cost: 1,
    });
    const eng = loadedEngine({}, [megaReduce]);
    eng.playCard('card-mega');
    const m = eng.calculateMetrics();
    expect(m.latency.value).toBe(0);
  });

  it('returns empty object when no scenario loaded', () => {
    const eng = new GameEngine();
    expect(eng.calculateMetrics()).toEqual({});
  });
});

// ─── Goal Checking ─────────────────────────────────────────────────

describe('GameEngine — goal checking', () => {
  function engineWithGoal(operator, targetValue, metricBase) {
    return loadedEngine({
      baseMetrics: { x: { base: metricBase } },
      goals: [{ metric: 'x', operator, value: targetValue }],
      availableCards: ['card-only'],
    }, [makeCard({ id: 'card-only', effects: {}, cost: 1 })]);
  }

  it('<= passes when value equals target', () => {
    const e = engineWithGoal('<=', 50, 50);
    expect(e.checkGoals()[0].met).toBe(true);
  });

  it('<= passes when value is below target', () => {
    const e = engineWithGoal('<=', 50, 40);
    expect(e.checkGoals()[0].met).toBe(true);
  });

  it('<= fails when value exceeds target', () => {
    const e = engineWithGoal('<=', 50, 60);
    expect(e.checkGoals()[0].met).toBe(false);
  });

  it('>= passes when value equals target', () => {
    const e = engineWithGoal('>=', 50, 50);
    expect(e.checkGoals()[0].met).toBe(true);
  });

  it('>= fails when value is below target', () => {
    const e = engineWithGoal('>=', 50, 40);
    expect(e.checkGoals()[0].met).toBe(false);
  });

  it('< passes when value is below target', () => {
    const e = engineWithGoal('<', 50, 49);
    expect(e.checkGoals()[0].met).toBe(true);
  });

  it('< fails when value equals target', () => {
    const e = engineWithGoal('<', 50, 50);
    expect(e.checkGoals()[0].met).toBe(false);
  });

  it('> passes when value exceeds target', () => {
    const e = engineWithGoal('>', 50, 51);
    expect(e.checkGoals()[0].met).toBe(true);
  });

  it('> fails when value equals target', () => {
    const e = engineWithGoal('>', 50, 50);
    expect(e.checkGoals()[0].met).toBe(false);
  });

  it('== passes on exact match', () => {
    const e = engineWithGoal('==', 50, 50);
    expect(e.checkGoals()[0].met).toBe(true);
  });

  it('== fails when off by one', () => {
    const e = engineWithGoal('==', 50, 51);
    expect(e.checkGoals()[0].met).toBe(false);
  });

  it('unknown operator always fails', () => {
    const e = engineWithGoal('!=', 50, 50);
    expect(e.checkGoals()[0].met).toBe(false);
  });

  it('goal for unknown metric returns met=false, currentValue=null', () => {
    const e = loadedEngine({
      goals: [{ metric: 'nonexistent', operator: '>=', value: 0 }],
    });
    const result = e.checkGoals().find(g => g.metric === 'nonexistent');
    expect(result.met).toBe(false);
    expect(result.currentValue).toBe(null);
  });

  it('allGoalsMet returns true when every goal satisfied', () => {
    const e = loadedEngine({
      baseMetrics: { x: { base: 10 } },
      goals: [{ metric: 'x', operator: '<=', value: 10 }],
      availableCards: [],
    }, []);
    expect(e.allGoalsMet()).toBe(true);
  });

  it('allGoalsMet returns false when any goal unsatisfied', () => {
    const e = loadedEngine({
      baseMetrics: { x: { base: 10 } },
      goals: [
        { metric: 'x', operator: '<=', value: 10 },
        { metric: 'x', operator: '<', value: 5 },
      ],
      availableCards: [],
    }, []);
    expect(e.allGoalsMet()).toBe(false);
  });

  it('checkGoals returns empty when no scenario', () => {
    const e = new GameEngine();
    expect(e.checkGoals()).toEqual([]);
  });
});

// ─── Prerequisite Validation ───────────────────────────────────────

describe('GameEngine — prerequisites', () => {
  let engine;
  beforeEach(() => { engine = loadedEngine(); });

  it('card with no prerequisites is always met', () => {
    expect(engine.checkPrerequisites('card-a').met).toBe(true);
    expect(engine.checkPrerequisites('card-a').missing).toEqual([]);
  });

  it('tag-based prereq is met when a card with that tag is on board', () => {
    engine.playCard('card-a'); // has tag "backend"
    expect(engine.checkPrerequisites('card-b').met).toBe(true);
  });

  it('tag-based prereq is unmet when no matching tag on board', () => {
    const result = engine.checkPrerequisites('card-b');
    expect(result.met).toBe(false);
    expect(result.missing).toContain('backend');
  });

  it('id-based prereq is met when that card is on board', () => {
    const cardWithIdPrereq = makeCard({
      id: 'card-needs-a',
      prerequisites: ['card-a'],
      cost: 1,
    });
    const eng = loadedEngine({
      availableCards: ['card-a', 'card-needs-a'],
    }, [cardA, cardWithIdPrereq]);
    eng.playCard('card-a');
    expect(eng.checkPrerequisites('card-needs-a').met).toBe(true);
  });

  it('returns met:true + empty missing for unknown card', () => {
    const result = engine.checkPrerequisites('nonexistent');
    expect(result.met).toBe(true);
    expect(result.missing).toEqual([]);
  });
});

// ─── Card Play / Remove ────────────────────────────────────────────

describe('GameEngine — playCard', () => {
  let engine;
  beforeEach(() => { engine = loadedEngine(); });

  it('plays a valid card and adds it to the board', () => {
    const result = engine.playCard('card-a');
    expect(result.success).toBe(true);
    expect(engine.isOnBoard('card-a')).toBe(true);
  });

  it('rejects playing the same card twice', () => {
    engine.playCard('card-a');
    const result = engine.playCard('card-a');
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/already/i);
  });

  it('rejects card that costs more than remaining resources', () => {
    const engine2 = loadedEngine({ totalResources: 2 });
    const result = engine2.playCard('card-a'); // costs 3
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/resource/i);
  });

  it('rejects card with unmet prerequisites', () => {
    const result = engine.playCard('card-b'); // needs "backend" tag
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/requires/i);
  });

  it('rejects unknown card', () => {
    const result = engine.playCard('nonexistent');
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  it('returns activated synergies on play', () => {
    engine.playCard('card-a');
    const result = engine.playCard('card-c'); // synergy with card-a
    expect(result.synergies.length).toBeGreaterThan(0);
    expect(result.synergies[0].metric).toBe('latency');
    expect(result.synergies[0].bonus).toBe(-5);
  });

  it('tracks resource usage correctly', () => {
    engine.playCard('card-a'); // cost 3
    expect(engine.getResourcesUsed()).toBe(3);
    expect(engine.getResourcesRemaining()).toBe(7);
  });

  it('emits cardPlayed and stateChanged events', () => {
    const played = vi.fn();
    const changed = vi.fn();
    engine.on('cardPlayed', played);
    engine.on('stateChanged', changed);
    engine.playCard('card-a');
    expect(played).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
  });
});

describe('GameEngine — removeCard', () => {
  let engine;
  beforeEach(() => {
    engine = loadedEngine();
    engine.playCard('card-a');
  });

  it('removes a card from the board', () => {
    const result = engine.removeCard('card-a');
    expect(result.success).toBe(true);
    expect(engine.isOnBoard('card-a')).toBe(false);
  });

  it('fails to remove card not on board', () => {
    const result = engine.removeCard('card-c');
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/not on board/i);
  });

  it('deactivates cards whose prereqs are broken instead of removing them', () => {
    engine.playCard('card-b'); // requires "backend" tag from card-a
    const result = engine.removeCard('card-a');
    expect(result.success).toBe(true);
    expect(engine.isOnBoard('card-b')).toBe(true);
    expect(result.nowInactive).toContain('card-b');
  });

  it('excludes inactive cards from metric calculations', () => {
    engine.playCard('card-b');
    const metricsBefore = engine.calculateMetrics();
    engine.removeCard('card-a');
    const metricsAfter = engine.calculateMetrics();
    expect(metricsAfter.latency.value).not.toBe(metricsBefore.latency.value);
  });

  it('re-activates cards when their prereqs are satisfied again', () => {
    engine.playCard('card-b');
    engine.removeCard('card-a');
    expect(engine.getInactiveCardIds().has('card-b')).toBe(true);
    engine.playCard('card-a');
    expect(engine.getInactiveCardIds().has('card-b')).toBe(false);
  });

  it('emits cardRemoved event for manual removal only', () => {
    engine.playCard('card-b');
    const removed = vi.fn();
    engine.on('cardRemoved', removed);
    engine.removeCard('card-a');
    const reasons = removed.mock.calls.map(c => c[0].reason);
    expect(reasons).toEqual(['manual']);
  });

  it('does not let a card satisfy its own prerequisite (self-referential tag)', () => {
    const eng = loadedEngine(
      { availableCards: ['card-a', 'card-selfref'] },
      [cardA, cardSelfRef]
    );
    eng.playCard('card-a');
    const result = eng.playCard('card-selfref');
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/requires/i);
  });

  it('marks self-referential card as inactive when its provider is removed', () => {
    const cardProvider = makeCard({
      id: 'card-provider',
      name: 'Provider',
      type: 'training',
      cost: 2,
      effects: { latency: -5 },
      prerequisites: [],
      synergies: [],
      tags: ['training'],
    });
    const eng = loadedEngine(
      { availableCards: ['card-provider', 'card-selfref'] },
      [cardProvider, cardSelfRef]
    );
    eng.playCard('card-provider');
    eng.playCard('card-selfref');
    expect(eng.getInactiveCardIds().has('card-selfref')).toBe(false);

    eng.removeCard('card-provider');
    expect(eng.getInactiveCardIds().has('card-selfref')).toBe(true);
  });
});

// ─── Campaign State ────────────────────────────────────────────────

describe('GameEngine — campaign mode', () => {
  const campaign = {
    id: 'test-campaign',
    encounters: [
      {
        scenarioId: 'test-scenario',
        startingHand: ['card-a', 'card-c'],
        draftPool: ['card-b', 'card-d'],
        draftPicks: 1,
      },
      {
        scenarioId: 'test-scenario-2',
        startingHand: [],
        draftPool: [],
        draftPicks: 0,
      },
    ],
  };

  let engine;
  beforeEach(() => {
    engine = loadedEngine();
    engine.setupCampaign(campaign);
  });

  it('setupCampaign initialises encounter index to 0', () => {
    expect(engine.currentEncounterIndex).toBe(0);
  });

  it('setupCampaign populates hand from startingHand', () => {
    expect(engine.handCardIds).toEqual(['card-a', 'card-c']);
  });

  it('setupCampaign does not overwrite existing hand', () => {
    const eng = loadedEngine();
    eng.handCardIds = ['card-d'];
    eng.setupCampaign(campaign);
    expect(eng.handCardIds).toEqual(['card-d']);
  });

  it('setupCampaign accepts custom encounterIndex', () => {
    const eng = loadedEngine();
    eng.setupCampaign(campaign, 1);
    expect(eng.currentEncounterIndex).toBe(1);
  });

  it('getCurrentEncounter returns the current encounter', () => {
    expect(engine.getCurrentEncounter()).toBe(campaign.encounters[0]);
  });

  it('getCurrentDraftPool returns mapped cards', () => {
    const pool = engine.getCurrentDraftPool();
    expect(pool.map(c => c.id)).toEqual(['card-b', 'card-d']);
  });

  it('getDraftPicksRequired returns the picks count', () => {
    expect(engine.getDraftPicksRequired()).toBe(1);
  });

  it('isLastEncounter returns false on first encounter', () => {
    expect(engine.isLastEncounter()).toBe(false);
  });

  it('isLastEncounter returns true on final encounter', () => {
    engine.currentEncounterIndex = 1;
    expect(engine.isLastEncounter()).toBe(true);
  });

  it('draftCard adds a card to the hand', () => {
    engine.draftCard('card-b');
    expect(engine.handCardIds).toContain('card-b');
  });

  it('draftCard does not duplicate existing hand entry', () => {
    engine.draftCard('card-a'); // already in hand
    const count = engine.handCardIds.filter(id => id === 'card-a').length;
    expect(count).toBe(1);
  });

  it('draftCard returns false for unknown card', () => {
    expect(engine.draftCard('nonexistent')).toBe(false);
  });

  it('advanceEncounter increments index and clears board', () => {
    engine.playCard('card-a');
    const nextScenario = makeScenario({ id: 'test-scenario-2' });
    engine.advanceEncounter(nextScenario);
    expect(engine.currentEncounterIndex).toBe(1);
    expect(engine.getBoardCardIds()).toEqual([]);
    expect(engine.scenario.id).toBe('test-scenario-2');
  });

  it('getAvailableCards returns hand cards in campaign mode', () => {
    const available = engine.getAvailableCards();
    const ids = available.map(c => c.id);
    expect(ids).toEqual(['card-a', 'card-c']);
  });
});

// ─── Feasibility Checking ──────────────────────────────────────────

describe('GameEngine — feasibility', () => {
  it('returns feasible when goals already met', () => {
    const engine = loadedEngine({
      baseMetrics: { x: { base: 10 } },
      goals: [{ metric: 'x', operator: '<=', value: 100 }],
      availableCards: [],
    }, []);
    const result = engine.checkFeasibility();
    expect(result.feasible).toBe(true);
  });

  it('finds a feasible combo from available cards', () => {
    const reducer = makeCard({
      id: 'reducer',
      effects: { latency: -30 },
      cost: 2,
    });
    const booster = makeCard({
      id: 'booster',
      effects: { throughput: 25 },
      cost: 3,
    });
    const engine = loadedEngine({
      baseMetrics: {
        latency: { base: 100, lowerIsBetter: true },
        throughput: { base: 50 },
      },
      goals: [
        { metric: 'latency', operator: '<=', value: 70 },
        { metric: 'throughput', operator: '>=', value: 75 },
      ],
      totalResources: 10,
      availableCards: ['reducer', 'booster'],
    }, [reducer, booster]);
    const result = engine.checkFeasibility();
    expect(result.feasible).toBe(true);
    expect(result.bestCombo).toContain('reducer');
    expect(result.bestCombo).toContain('booster');
  });

  it('returns infeasible when no combo can meet all goals', () => {
    const weak = makeCard({
      id: 'weak',
      effects: { latency: -1 },
      cost: 9,
    });
    const engine = loadedEngine({
      baseMetrics: { latency: { base: 100, lowerIsBetter: true } },
      goals: [{ metric: 'latency', operator: '<=', value: 5 }],
      totalResources: 10,
      availableCards: ['weak'],
    }, [weak]);
    const result = engine.checkFeasibility();
    expect(result.feasible).toBe(false);
    expect(result.bestGoalsMet).toBe(0);
    expect(result.totalGoals).toBe(1);
  });

  it('respects budget constraint in feasibility check', () => {
    const expensive = makeCard({
      id: 'expensive',
      effects: { latency: -100 },
      cost: 99,
    });
    const engine = loadedEngine({
      baseMetrics: { latency: { base: 100, lowerIsBetter: true } },
      goals: [{ metric: 'latency', operator: '<=', value: 5 }],
      totalResources: 10,
      availableCards: ['expensive'],
    }, [expensive]);
    const result = engine.checkFeasibility();
    expect(result.feasible).toBe(false);
  });

  it('returns feasible=true shortcut for >16 cards', () => {
    const cards = Array.from({ length: 17 }, (_, i) =>
      makeCard({ id: `c${i}`, cost: 1, effects: {} })
    );
    const engine = loadedEngine({
      baseMetrics: { x: { base: 0 } },
      goals: [{ metric: 'x', operator: '>=', value: 999 }],
      totalResources: 100,
      availableCards: cards.map(c => c.id),
    }, cards);
    const result = engine.checkFeasibility();
    expect(result.feasible).toBe(true);
  });

  it('returns infeasible for empty scenario', () => {
    const engine = new GameEngine();
    const result = engine.checkFeasibility();
    expect(result.feasible).toBe(false);
  });
});

// ─── State Serialisation ───────────────────────────────────────────

describe('GameEngine — getState', () => {
  it('includes all expected top-level keys', () => {
    const engine = loadedEngine();
    engine.playCard('card-a');
    const state = engine.getState();
    expect(state).toHaveProperty('scenarioId', 'test-scenario');
    expect(state).toHaveProperty('deckId', 'test-deck');
    expect(state.cardsOnBoard).toEqual(['card-a']);
    expect(state).toHaveProperty('resourcesUsed', 3);
    expect(state).toHaveProperty('totalResources', 10);
    expect(state).toHaveProperty('allGoalsMet');
    expect(state).toHaveProperty('timestamp');
  });

  it('includes campaign fields in campaign mode', () => {
    const engine = loadedEngine();
    engine.setupCampaign({
      id: 'camp',
      encounters: [{ startingHand: ['card-a'], draftPool: [], draftPicks: 0 }],
    });
    const state = engine.getState();
    expect(state.campaignId).toBe('camp');
    expect(state.currentEncounterIndex).toBe(0);
    expect(state.handCardIds).toEqual(['card-a']);
  });
});

// ─── loadState ─────────────────────────────────────────────────────

describe('GameEngine — loadState', () => {
  it('restores board cards from saved state', () => {
    const engine = loadedEngine();
    engine.loadState({ cardsOnBoard: ['card-a', 'card-c'] });
    expect(engine.getBoardCardIds()).toEqual(['card-a', 'card-c']);
  });

  it('filters out unknown card IDs', () => {
    const engine = loadedEngine();
    engine.loadState({ cardsOnBoard: ['card-a', 'ghost'] });
    expect(engine.getBoardCardIds()).toEqual(['card-a']);
  });

  it('restores hand in campaign mode', () => {
    const engine = loadedEngine();
    engine.setupCampaign({
      id: 'c',
      encounters: [{ startingHand: [], draftPool: [], draftPicks: 0 }],
    });
    engine.loadState({ handCardIds: ['card-a', 'card-d'], currentEncounterIndex: 0, cardsOnBoard: [] });
    expect(engine.handCardIds).toEqual(['card-a', 'card-d']);
  });
});
