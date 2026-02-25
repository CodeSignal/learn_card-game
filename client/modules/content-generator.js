import { validateScenario, validateDeck } from './validate.js';
import { GameEngine } from './engine.js';

let promptTemplate = null;

async function loadPromptTemplate() {
  if (promptTemplate) return promptTemplate;
  const res = await fetch('./data/prompts/content-generation.md');
  if (!res.ok) throw new Error('Failed to load prompt template');
  promptTemplate = await res.text();
  return promptTemplate;
}

/**
 * Call the LLM proxy to generate content from a description.
 * Returns { content: string } — the raw LLM response text.
 */
export async function generateContent(description, opts = {}) {
  const template = await loadPromptTemplate();
  const prompt = template.replace('{{DESCRIPTION}}', description);

  const res = await fetch('/api/generate-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${res.status}`);
  }

  return res.json();
}

/**
 * Parse the LLM response into structured JSON objects.
 * Expects three fenced code blocks labeled deck, scenarios, campaign.
 */
export function parseGeneratedContent(text) {
  const blocks = {};
  const regex = /```(\w+)\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks[match[1].toLowerCase()] = match[2].trim();
  }

  // If LLM used labeled blocks, use them directly
  if (!blocks.deck || !blocks.scenarios || !blocks.campaign) {
    // Fallback: collect all `json` blocks and infer by shape
    const jsonBlocks = [];
    const jsonRegex = /```json\s*\n([\s\S]*?)```/g;
    let m;
    while ((m = jsonRegex.exec(text)) !== null) {
      jsonBlocks.push(m[1].trim());
    }

    for (const raw of jsonBlocks) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed[0]?.goals && !blocks.scenarios) {
          blocks.scenarios = raw;
        } else if (parsed.cards && !blocks.deck) {
          blocks.deck = raw;
        } else if (parsed.deckId && !blocks.deck) {
          blocks.deck = raw;
        } else if (parsed.encounters && !blocks.campaign) {
          blocks.campaign = raw;
        } else if (Array.isArray(parsed) && !blocks.scenarios) {
          blocks.scenarios = raw;
        } else if (!blocks.campaign) {
          blocks.campaign = raw;
        }
      } catch { /* skip unparseable */ }
    }
  }

  const result = { deck: null, scenarios: null, campaign: null, errors: [] };

  try {
    result.deck = JSON.parse(blocks.deck || '{}');
  } catch (e) {
    result.errors.push(`Failed to parse deck JSON: ${e.message}`);
  }

  try {
    result.scenarios = JSON.parse(blocks.scenarios || '[]');
  } catch (e) {
    result.errors.push(`Failed to parse scenarios JSON: ${e.message}`);
  }

  try {
    result.campaign = JSON.parse(blocks.campaign || '{}');
  } catch (e) {
    result.errors.push(`Failed to parse campaign JSON: ${e.message}`);
  }

  return result;
}

/**
 * Validate parsed content using the game's validator.
 * Returns { valid: boolean, errors: string[] }.
 */
export function validateContent(parsed) {
  const errors = [];

  if (parsed.deck && parsed.scenarios) {
    const deckErrors = validateDeck(parsed.deck, parsed.scenarios[0]);
    errors.push(...deckErrors);

    for (const scenario of parsed.scenarios) {
      const scenarioErrors = validateScenario(scenario);
      errors.push(...scenarioErrors);
    }
  }

  if (parsed.campaign) {
    const enc = parsed.campaign.encounters || [];
    const scenarioIds = new Set((parsed.scenarios || []).map(s => s.id));
    const cardIds = new Set((parsed.deck?.cards || []).map(c => c.id));

    for (const e of enc) {
      if (!scenarioIds.has(e.scenarioId)) {
        errors.push(`Campaign encounter references unknown scenario '${e.scenarioId}'`);
      }
      for (const id of (e.startingHand || [])) {
        if (!cardIds.has(id)) errors.push(`Campaign startingHand references unknown card '${id}'`);
      }
      for (const id of (e.draftPool || [])) {
        if (!cardIds.has(id)) errors.push(`Campaign draftPool references unknown card '${id}'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Run feasibility check for each scenario in the generated content.
 * Returns an array of { scenarioId, feasible, bestGoalsMet, totalGoals, winningCombos }.
 */
export function checkFeasibility(parsed) {
  if (!parsed.deck || !parsed.scenarios) return [];

  const results = [];

  for (const scenario of parsed.scenarios) {
    const engine = new GameEngine();
    try {
      engine.loadScenario(scenario, parsed.deck);
      const result = engine.checkFeasibility();
      results.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        ...result,
      });
    } catch (e) {
      results.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        feasible: false,
        error: e.message,
      });
    }
  }

  return results;
}
