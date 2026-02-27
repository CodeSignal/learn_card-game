import { validateScenario, validateDeck } from './validate.js';
import { GameEngine } from './engine.js';

const promptCache = {};

async function loadPromptTemplate(name) {
  if (promptCache[name]) return promptCache[name];
  const res = await fetch(`./data/prompts/${name}`);
  if (!res.ok) throw new Error(`Failed to load prompt template: ${name}`);
  promptCache[name] = await res.text();
  return promptCache[name];
}

async function callLLM(prompt, maxTokens, label) {
  const body = { prompt };
  if (maxTokens) body.max_tokens = maxTokens;
  if (label) body.label = label;

  const res = await fetch('/api/generate-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.details ? (() => { try { return JSON.parse(err.details)?.error?.message; } catch { return err.details; } })() : null;
    throw new Error(detail || err.error || `Server error: ${res.status}`);
  }

  return res.json();
}

/**
 * Call the LLM proxy to generate content from a description.
 * Returns { content: string } — the raw LLM response text.
 */
export async function generateContent(description) {
  const template = await loadPromptTemplate('content-generation.md');
  const prompt = template.replace('{{DESCRIPTION}}', description);
  return callLLM(prompt, 16000, 'generator');
}

/**
 * Call the LLM to review generated content.
 * Returns { verdict: boolean, feedback: string }.
 */
export async function reviewContent(parsed) {
  const template = await loadPromptTemplate('content-review.md');

  const deckStr = JSON.stringify(parsed.deck, null, 2);
  const scenariosStr = JSON.stringify(parsed.scenarios, null, 2);
  const campaignStr = JSON.stringify(parsed.campaign, null, 2);

  const prompt = template
    .replace('{{DECK}}', deckStr)
    .replace('{{SCENARIOS}}', scenariosStr)
    .replace('{{CAMPAIGN}}', campaignStr);

  const result = await callLLM(prompt, undefined, 'reviewer');
  const text = result.content || '';

  const verdictMatch = text.match(/###\s*Verdict\s*[\s\S]*?\b(true|false)\b/i);
  const verdict = verdictMatch ? verdictMatch[1].toLowerCase() === 'true' : false;

  // Capture only text between ### Feedback and ### Verdict, stripping any trailing prose after the verdict
  const feedbackMatch = text.match(/###\s*Feedback\s*\n([\s\S]*?)(?=###\s*Verdict)/i);
  const feedback = feedbackMatch ? feedbackMatch[1].trim() : '';

  return { verdict, feedback, raw: text };
}

/**
 * Call the LLM to revise content based on feedback.
 * Returns { content: string } — the raw LLM response text.
 */
export async function reviseContent(description, parsed, feedback) {
  const template = await loadPromptTemplate('content-revision.md');

  const deckStr = JSON.stringify(parsed.deck, null, 2);
  const scenariosStr = JSON.stringify(parsed.scenarios, null, 2);
  const campaignStr = JSON.stringify(parsed.campaign, null, 2);

  const deterministicStr = feedback.deterministicIssues.length > 0
    ? feedback.deterministicIssues.map(e => `- ${e}`).join('\n')
    : '(none)';
  const llmStr = feedback.llmFeedback || '(none)';

  const prompt = template
    .replace('{{DESCRIPTION}}', description)
    .replace('{{DECK}}', deckStr)
    .replace('{{SCENARIOS}}', scenariosStr)
    .replace('{{CAMPAIGN}}', campaignStr)
    .replace('{{DETERMINISTIC_ISSUES}}', deterministicStr)
    .replace('{{LLM_FEEDBACK}}', llmStr);

  return callLLM(prompt, 16000, 'revisor');
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

  if (!blocks.deck || !blocks.scenarios || !blocks.campaign) {
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

  if (parsed.deck && parsed.scenarios && Array.isArray(parsed.scenarios) && parsed.scenarios.length > 0) {
    const allMetrics = {};
    for (const s of parsed.scenarios) {
      Object.assign(allMetrics, s.baseMetrics || {});
    }
    const deckErrors = validateDeck(parsed.deck, { baseMetrics: allMetrics });
    errors.push(...deckErrors);

    for (const scenario of parsed.scenarios) {
      const scenarioErrors = validateScenario(scenario);
      errors.push(...scenarioErrors);
    }

    const uniqueMetrics = new Set(parsed.scenarios.flatMap(s => Object.keys(s.baseMetrics || {})));
    if (uniqueMetrics.size !== 3) {
      errors.push(`Expected exactly 3 metrics across all scenarios, found ${uniqueMetrics.size}: ${[...uniqueMetrics].join(', ')}`);
    }

    for (const s of parsed.scenarios) {
      const keys = new Set(Object.keys(s.baseMetrics || {}));
      if (keys.size !== uniqueMetrics.size || [...uniqueMetrics].some(m => !keys.has(m))) {
        errors.push(`Scenario '${s.id}': must use the same ${uniqueMetrics.size} metrics as all other scenarios`);
      }
    }

    if ((parsed.deck.cards?.length ?? 0) < 15) {
      errors.push(`Deck has ${parsed.deck.cards?.length ?? 0} cards — minimum is 15`);
    }

    const cardById = Object.fromEntries((parsed.deck.cards || []).map(c => [c.id, c]));
    for (const s of parsed.scenarios) {
      const goalCount = (s.goals || []).length;
      if (goalCount !== 3) {
        errors.push(`Scenario '${s.id}': must have exactly 3 goals (one per metric), has ${goalCount}`);
      }

      const goalMetrics = new Set((s.goals || []).map(g => g.metric));
      for (const mk of Object.keys(s.baseMetrics || {})) {
        if (!goalMetrics.has(mk)) {
          errors.push(`Scenario '${s.id}': metric '${mk}' is defined in baseMetrics but has no goal — every metric must have a win condition`);
        }
      }

    }
  } else if (parsed.deck) {
    const deckErrors = validateDeck(parsed.deck, null);
    errors.push(...deckErrors);
  }

  if (parsed.campaign) {
    const enc = parsed.campaign.encounters || [];
    const scenarioIds = new Set((parsed.scenarios || []).map(s => s.id));
    const cardIds = new Set((parsed.deck?.cards || []).map(c => c.id));

    // Validate campaign-level startingHand
    const campaignStartingHand = parsed.campaign.startingHand || [];
    if (campaignStartingHand.length !== 3) {
      errors.push(`Campaign startingHand should have 3 cards, has ${campaignStartingHand.length}`);
    }
    const startingHandSeen = new Set();
    for (const id of campaignStartingHand) {
      if (!cardIds.has(id)) errors.push(`Campaign startingHand references unknown card '${id}'`);
      if (startingHandSeen.has(id)) errors.push(`Campaign startingHand lists card '${id}' more than once`);
      startingHandSeen.add(id);
    }

    for (let i = 0; i < enc.length; i++) {
      const e = enc[i];
      const label = `Encounter ${i + 1}`;
      if (!scenarioIds.has(e.scenarioId)) {
        errors.push(`Campaign ${label} references unknown scenario '${e.scenarioId}'`);
      }

      if (e.startingHand && e.startingHand.length > 0) {
        errors.push(`${label}: encounters must not have a startingHand — the starting hand belongs on the campaign, not individual encounters`);
      }

      const poolSeen = new Set();
      for (const id of (e.draftPool || [])) {
        if (!cardIds.has(id)) errors.push(`Campaign ${label} draftPool references unknown card '${id}'`);
        if (poolSeen.has(id)) errors.push(`Campaign ${label} draftPool lists card '${id}' more than once`);
        poolSeen.add(id);
      }
    }

    // Check uniqueness across startingHand + all draftPools
    const cardToLocation = {};
    for (const id of campaignStartingHand) {
      if (!cardToLocation[id]) cardToLocation[id] = [];
      cardToLocation[id].push('startingHand');
    }
    for (let i = 0; i < enc.length; i++) {
      for (const id of (enc[i].draftPool || [])) {
        if (!cardToLocation[id]) cardToLocation[id] = [];
        cardToLocation[id].push(`E${i + 1} draftPool`);
      }
    }
    for (const [id, locations] of Object.entries(cardToLocation)) {
      if (locations.length > 1) {
        errors.push(
          `Card '${id}' appears in multiple places: ${locations.join(' and ')}. ` +
          `Each card must appear in exactly one location — startingHand or one encounter's draftPool.`
        );
      }
    }

    if (enc.length !== 4) {
      errors.push(`Campaign has ${enc.length} encounters — expected exactly 4`);
    }

    // Encounters 1-3 should have draftPool of 4, draftPicks of 2
    for (let i = 0; i < enc.length - 1; i++) {
      const e = enc[i];
      if ((e.draftPool || []).length !== 4) {
        errors.push(`Encounter ${i + 1}: draftPool should have 4 cards, has ${(e.draftPool || []).length}`);
      }
      if (e.draftPicks !== 2) {
        errors.push(`Encounter ${i + 1}: draftPicks should be 2, is ${e.draftPicks}`);
      }
    }
    // Last encounter should have empty draftPool
    if (enc.length === 4) {
      const last = enc[3];
      if ((last.draftPool || []).length !== 0) {
        errors.push(`Encounter 4 (final): draftPool should be empty, has ${last.draftPool.length} cards`);
      }
    }

    const cardById = Object.fromEntries((parsed.deck?.cards || []).map(c => [c.id, c]));
    const scenarioById = Object.fromEntries((parsed.scenarios || []).map(s => [s.id, s]));

    // Budget check: player's max hand entering encounter i = startingHand + best picks from each PREVIOUS pool.
    // (Current encounter's pool is drafted AFTER winning, not before playing.)
    const startingHandCosts = campaignStartingHand.map(id => cardById[id]?.cost ?? 0);
    const startingHandTotal = startingHandCosts.reduce((s, c) => s + c, 0);

    for (let i = 0; i < enc.length; i++) {
      const e = enc[i];
      const scenario = scenarioById[e.scenarioId];
      if (!scenario) continue;

      // Max hand cost entering encounter i = startingHand + best 2 from each of encounters 0..i-1's pools
      let maxHandCost = startingHandTotal;
      for (let j = 0; j < i; j++) {
        const prevPoolCosts = (enc[j].draftPool || []).map(id => cardById[id]?.cost ?? 0).sort((a, b) => b - a);
        maxHandCost += prevPoolCosts.slice(0, enc[j].draftPicks || 0).reduce((s, c) => s + c, 0);
      }

      if (maxHandCost > 0) {
        const ratio = scenario.totalResources / maxHandCost;
        if (ratio > 0.85) {
          errors.push(`Encounter ${i + 1} ('${scenario.id}'): budget too loose (${Math.round(ratio * 100)}% of max hand cost ${maxHandCost}, should be 55-80%)`);
        }
        if (ratio < 0.50) {
          errors.push(`Encounter ${i + 1} ('${scenario.id}'): budget too tight (${Math.round(ratio * 100)}% of max hand cost ${maxHandCost}, should be 55-80%)`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Run feasibility check for each campaign encounter.
 * Uses campaign-level startingHand as the base deck that accumulates across encounters.
 * For encounter i, checks all combinations of: startingHand + all possible picks from
 * encounters 0..i-1 + all draft combos from encounter i's pool.
 * Returns an array of { encounterIndex, scenarioId, feasible, bestGoalsMet, totalGoals, ... }.
 */
export function checkFeasibility(parsed) {
  if (!parsed.deck || !parsed.scenarios || !parsed.campaign) return [];

  const scenarioById = Object.fromEntries(parsed.scenarios.map(s => [s.id, s]));
  const encounters = parsed.campaign.encounters || [];
  const campaignStartingHand = parsed.campaign.startingHand || parsed.campaign.encounters[0]?.startingHand || [];
  const results = [];

  // Build the set of possible accumulated decks entering each encounter.
  // Draft happens AFTER winning encounter N, so encounter N's pool cards are available from N+1 onward.
  //   accumulatedCombos[0] = [campaignStartingHand]           (entering E1: only starting hand)
  //   accumulatedCombos[1] = startingHand + combos from E1 pool  (entering E2)
  //   accumulatedCombos[2] = ... + combos from E2 pool           (entering E3)
  //   accumulatedCombos[3] = ... + combos from E3 pool           (entering E4)
  const accumulatedCombos = [[[...campaignStartingHand]]];
  for (let i = 0; i < encounters.length - 1; i++) {
    const enc = encounters[i];
    const poolCards = enc.draftPool || [];
    const picks = enc.draftPicks || 0;
    const draftCombos = picks > 0 ? combinations(poolCards, picks) : [[]];
    const nextCombos = [];
    for (const prev of accumulatedCombos[i]) {
      for (const drafted of draftCombos) {
        nextCombos.push([...prev, ...drafted]);
      }
    }
    accumulatedCombos.push(nextCombos);
  }

  for (let i = 0; i < encounters.length; i++) {
    const enc = encounters[i];
    const scenario = scenarioById[enc.scenarioId];
    if (!scenario) continue;

    // Available cards for encounter i = only the accumulated deck entering this encounter.
    // The current encounter's draftPool is drafted AFTER winning, so it's NOT available yet.
    //
    // feasible     = true if there EXISTS a draft path where the player can win
    // bestGoalsMet = max goals achievable across all draft paths (best case)
    let bestGoalsMet = 0;
    let anyFeasible = false;

    for (const availableHand of accumulatedCombos[i]) {
      const engine = new GameEngine();
      try {
        engine.loadScenario(scenario, parsed.deck);
        engine.handCardIds = availableHand;
        const result = engine.checkFeasibility();
        if (result.feasible) anyFeasible = true;
        if (result.bestGoalsMet > bestGoalsMet) bestGoalsMet = result.bestGoalsMet;
      } catch { /* skip invalid combos */ }
    }

    results.push({
      encounterIndex: i + 1,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      feasible: anyFeasible,
      bestGoalsMet,
      totalGoals: scenario.goals.length,
    });
  }

  return results;
}

/**
 * Generate badge icons for every card in a deck via the server's Gemini endpoint.
 * Runs in batches of ICON_BATCH_SIZE to balance speed and API rate limits.
 * Mutates card.icon on success.
 * Calls onProgress({ done, total, cardId, success }) after each card.
 * Returns the mutated deck object.
 */
const ICON_BATCH_SIZE = 5;

export async function generateIconsForDeck(deck, onProgress) {
  const cards = deck.cards || [];
  const deckId = deck.deckId;
  let done = 0;

  for (let i = 0; i < cards.length; i += ICON_BATCH_SIZE) {
    const batch = cards.slice(i, i + ICON_BATCH_SIZE);

    await Promise.all(batch.map(async (card) => {
      let success = false;
      try {
        const res = await fetch('/api/generate-icons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardId: card.id,
            cardName: card.name,
            cardType: card.type,
            cardDescription: card.description,
            deckId,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Server error: ${res.status}`);
        }

        const { iconPath } = await res.json();
        card.icon = iconPath;
        success = true;
      } catch (err) {
        console.error(`Failed to generate icon for ${card.id}:`, err.message);
      }

      done += 1;
      onProgress({ done, total: cards.length, cardId: card.id, success });
    }));
  }

  return deck;
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    for (const tail of combinations(arr.slice(i + 1), k - 1)) {
      result.push([arr[i], ...tail]);
    }
  }
  return result;
}

/**
 * Automatic generate-review-revise loop. Up to MAX_TURNS iterations.
 * Stops early when both deterministic checks and LLM review pass.
 * Calls onProgress(state) after each phase to update the UI.
 */
export async function generateAndReview(description, onProgress) {
  const MAX_TURNS = 3;
  let parsed = null;
  let lastFeedback = null;
  const turnLog = [];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    onProgress({ turn, maxTurns: MAX_TURNS, phase: 'generating', turnLog });

    let rawContent;
    if (turn === 1) {
      rawContent = await generateContent(description);
    } else {
      rawContent = await reviseContent(description, parsed, lastFeedback);
    }

    parsed = parseGeneratedContent(rawContent.content);

    if (parsed.errors.length > 0) {
      const entry = { turn, parseErrors: parsed.errors, validation: null, feasibility: null, llmReview: null };
      turnLog.push(entry);
      onProgress({ turn, maxTurns: MAX_TURNS, phase: 'parse-error', parsed, turnLog });
      lastFeedback = {
        deterministicIssues: parsed.errors,
        llmFeedback: '',
        verdict: false,
      };
      continue;
    }

    onProgress({ turn, maxTurns: MAX_TURNS, phase: 'validating', parsed, turnLog });

    const validation = validateContent(parsed);
    const feasibility = (parsed.deck && parsed.scenarios && parsed.campaign) ? checkFeasibility(parsed) : [];

    const deterministicIssues = [
      ...validation.errors,
      ...feasibility.filter(f => !f.feasible).map(f =>
        `Encounter ${f.encounterIndex} ('${f.scenarioId}') is not feasible: ${f.error || `only ${f.bestGoalsMet}/${f.totalGoals} goals achievable with any draft combination`}`
      ),
    ];

    onProgress({ turn, maxTurns: MAX_TURNS, phase: 'reviewing', parsed, turnLog });

    const llmReview = await reviewContent(parsed);

    lastFeedback = {
      deterministicIssues,
      llmFeedback: llmReview.feedback,
      verdict: llmReview.verdict,
    };

    const entry = { turn, validation, feasibility, llmReview, deterministicIssues };
    turnLog.push(entry);

    const allPassing = validation.valid && feasibility.every(f => f.feasible) && llmReview.verdict;

    if (allPassing) {
      onProgress({ turn, maxTurns: MAX_TURNS, phase: 'done', parsed, turnLog, success: true });
      return { parsed, turnLog, success: true };
    }

    onProgress({ turn, maxTurns: MAX_TURNS, phase: 'turn-failed', parsed, turnLog });
  }

  onProgress({ turn: MAX_TURNS, maxTurns: MAX_TURNS, phase: 'done', parsed, turnLog, success: false });
  return { parsed, turnLog, success: false };
}
