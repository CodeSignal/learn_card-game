import { describe, it, expect } from 'vitest';
import { validateScenario, validateDeck } from '../validate.js';

// ─── Fixtures ──────────────────────────────────────────────────────

function validScenario(overrides = {}) {
  return {
    id: 'scen-1',
    name: 'Test Scenario',
    briefing: 'Test briefing',
    baseMetrics: {
      latency: { base: 100 },
      throughput: { base: 50 },
    },
    goals: [
      { metric: 'latency', operator: '<=', value: 80 },
      { metric: 'throughput', operator: '>=', value: 70 },
    ],
    totalResources: 10,
    ...overrides,
  };
}

function validCard(overrides = {}) {
  return {
    id: 'card-1',
    name: 'Card 1',
    type: 'backend',
    cost: 3,
    effects: { latency: -10 },
    prerequisites: [],
    synergies: [],
    tags: ['backend'],
    ...overrides,
  };
}

function validDeck(cards, overrides = {}) {
  return {
    id: 'deck-1',
    name: 'Test Deck',
    cards: cards || [validCard()],
    ...overrides,
  };
}

// ─── validateScenario ──────────────────────────────────────────────

describe('validateScenario', () => {
  it('returns no errors for a valid scenario', () => {
    expect(validateScenario(validScenario())).toEqual([]);
  });

  it('reports each missing required field', () => {
    const errors = validateScenario({});
    expect(errors.length).toBeGreaterThanOrEqual(6);
    expect(errors.some(e => e.includes("'id'"))).toBe(true);
    expect(errors.some(e => e.includes("'name'"))).toBe(true);
    expect(errors.some(e => e.includes("'briefing'"))).toBe(true);
    expect(errors.some(e => e.includes("'baseMetrics'"))).toBe(true);
    expect(errors.some(e => e.includes("'goals'"))).toBe(true);
    expect(errors.some(e => e.includes("'totalResources'"))).toBe(true);
  });

  it('returns early when required fields are missing', () => {
    const errors = validateScenario({ id: 'x' });
    // Should not crash trying to iterate baseMetrics/goals
    expect(errors.length).toBeGreaterThan(0);
  });

  it('errors when baseMetrics is not an object', () => {
    const errors = validateScenario(validScenario({ baseMetrics: 'bad' }));
    expect(errors.some(e => e.includes('must be an object'))).toBe(true);
  });

  it('errors when baseMetrics is null', () => {
    const errors = validateScenario(validScenario({ baseMetrics: null }));
    expect(errors.some(e => e.includes('must be an object'))).toBe(true);
  });

  it('errors when a baseMetric is missing base value', () => {
    const errors = validateScenario(validScenario({
      baseMetrics: { latency: { unit: 'ms' } },
      goals: [{ metric: 'latency', operator: '<=', value: 80 }],
    }));
    expect(errors.some(e => e.includes("missing 'base'"))).toBe(true);
  });

  it('errors when goals is not an array', () => {
    const errors = validateScenario(validScenario({ goals: 'nope' }));
    expect(errors.some(e => e.includes('must be an array'))).toBe(true);
  });

  it('errors when goal references unknown metric', () => {
    const errors = validateScenario(validScenario({
      goals: [{ metric: 'nonexistent', operator: '>=', value: 10 }],
    }));
    expect(errors.some(e => e.includes("unknown metric 'nonexistent'"))).toBe(true);
  });

  it('errors when goal has invalid operator', () => {
    const errors = validateScenario(validScenario({
      goals: [{ metric: 'latency', operator: '!=', value: 10 }],
    }));
    expect(errors.some(e => e.includes("invalid operator '!='"))).toBe(true);
  });

  it('errors when goal is missing value', () => {
    const errors = validateScenario(validScenario({
      goals: [{ metric: 'latency', operator: '<=' }],
    }));
    expect(errors.some(e => e.includes("missing 'value'"))).toBe(true);
  });

  it('errors when goal is missing metric field', () => {
    const errors = validateScenario(validScenario({
      goals: [{ operator: '<=', value: 10 }],
    }));
    expect(errors.some(e => e.includes("missing 'metric'"))).toBe(true);
  });

  it('accepts all valid operators without error', () => {
    for (const op of ['<=', '>=', '<', '>', '==']) {
      const scenario = validScenario({
        goals: [{ metric: 'latency', operator: op, value: 10 }],
      });
      expect(validateScenario(scenario)).toEqual([]);
    }
  });
});

// ─── validateDeck ──────────────────────────────────────────────────

describe('validateDeck', () => {
  const scenario = validScenario();

  it('returns no errors for a valid deck', () => {
    expect(validateDeck(validDeck(), scenario)).toEqual([]);
  });

  it('errors when cards property is missing', () => {
    const errors = validateDeck({}, scenario);
    expect(errors.some(e => e.includes('missing or invalid "cards"'))).toBe(true);
  });

  it('errors when cards is not an array', () => {
    const errors = validateDeck({ cards: 'bad' }, scenario);
    expect(errors.some(e => e.includes('missing or invalid "cards"'))).toBe(true);
  });

  it('returns early when cards is invalid', () => {
    const errors = validateDeck({ cards: null }, scenario);
    expect(errors).toHaveLength(1);
  });

  it('reports missing required card fields', () => {
    const card = { id: 'incomplete' };
    const errors = validateDeck(validDeck([card]), scenario);
    expect(errors.some(e => e.includes("'name'"))).toBe(true);
    expect(errors.some(e => e.includes("'type'"))).toBe(true);
    expect(errors.some(e => e.includes("'cost'"))).toBe(true);
    expect(errors.some(e => e.includes("'effects'"))).toBe(true);
    expect(errors.some(e => e.includes("'prerequisites'"))).toBe(true);
    expect(errors.some(e => e.includes("'synergies'"))).toBe(true);
    expect(errors.some(e => e.includes("'tags'"))).toBe(true);
  });

  it('errors when card effect references unknown metric', () => {
    const card = validCard({ effects: { nonexistent: 5 } });
    const errors = validateDeck(validDeck([card]), scenario);
    expect(errors.some(e => e.includes("unknown effect metric 'nonexistent'"))).toBe(true);
  });

  it('errors when synergy references unknown card', () => {
    const card = validCard({
      synergies: [{ with: 'ghost', metric: 'latency', bonus: -5, reason: 'test' }],
    });
    const errors = validateDeck(validDeck([card]), scenario);
    expect(errors.some(e => e.includes("synergy references unknown card 'ghost'"))).toBe(true);
  });

  it('errors when synergy references unknown metric', () => {
    const cardA = validCard({ id: 'a' });
    const cardB = validCard({
      id: 'b',
      synergies: [{ with: 'a', metric: 'nonexistent', bonus: -5, reason: 'test' }],
    });
    const errors = validateDeck(validDeck([cardA, cardB]), scenario);
    expect(errors.some(e => e.includes("synergy references unknown metric 'nonexistent'"))).toBe(true);
  });

  it('errors when prerequisite matches no card ID or tag', () => {
    const card = validCard({ prerequisites: ['imaginary-tag'] });
    const errors = validateDeck(validDeck([card]), scenario);
    expect(errors.some(e => e.includes("prerequisite 'imaginary-tag'"))).toBe(true);
  });

  it('accepts prerequisite that matches a tag', () => {
    const provider = validCard({ id: 'prov', tags: ['infra'] });
    const consumer = validCard({ id: 'cons', prerequisites: ['infra'] });
    const errors = validateDeck(validDeck([provider, consumer]), scenario);
    expect(errors.filter(e => e.includes('prerequisite'))).toEqual([]);
  });

  it('accepts prerequisite that matches a card ID', () => {
    const provider = validCard({ id: 'base-card' });
    const consumer = validCard({ id: 'dependent', prerequisites: ['base-card'] });
    const errors = validateDeck(validDeck([provider, consumer]), scenario);
    expect(errors.filter(e => e.includes('prerequisite'))).toEqual([]);
  });

  it('validates without scenario context (null scenario)', () => {
    const card = validCard({ effects: { anything: 5 } });
    const errors = validateDeck(validDeck([card]), null);
    // No metric validation when scenario is null
    expect(errors.filter(e => e.includes('unknown effect'))).toEqual([]);
  });
});

// ─── Fuzzy "did you mean?" suggestions ─────────────────────────────

describe('validateScenario — fuzzy suggestions', () => {
  it('suggests close metric name in goal', () => {
    const errors = validateScenario(validScenario({
      goals: [{ metric: 'latecy', operator: '<=', value: 80 }],  // typo: latecy → latency
    }));
    expect(errors.some(e => e.includes('did you mean') && e.includes('latency'))).toBe(true);
  });

  it('does not suggest when name is too far', () => {
    const errors = validateScenario(validScenario({
      goals: [{ metric: 'zzzzzzz', operator: '<=', value: 80 }],
    }));
    expect(errors.some(e => e.includes('did you mean'))).toBe(false);
  });
});

describe('validateDeck — fuzzy suggestions', () => {
  const scenario = validScenario();

  it('suggests close metric name in card effects', () => {
    const card = validCard({ effects: { latecy: -10 } });  // typo
    const errors = validateDeck(validDeck([card]), scenario);
    expect(errors.some(e => e.includes('did you mean') && e.includes('latency'))).toBe(true);
  });

  it('does not suggest for wildly different metric name', () => {
    const card = validCard({ effects: { xyzabc: -10 } });
    const errors = validateDeck(validDeck([card]), scenario);
    const suggestion = errors.find(e => e.includes('did you mean'));
    expect(suggestion).toBeUndefined();
  });
});
