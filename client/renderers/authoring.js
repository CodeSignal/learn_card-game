import { generateAndReview, validateContent, checkFeasibility, generateIconsForDeck } from '../modules/content-generator.js';
import { getTypeColor, renderIcon } from './shared.js';

/** Converts a subset of markdown to HTML (bold, inline code, bullet lists). */
function renderMarkdown(text) {
  const escaped = escapeHtml(text);
  const lines = escaped.split('\n');
  const out = [];
  let inList = false;
  for (const raw of lines) {
    let line = raw
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    if (/^- /.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${line.slice(2)}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(line ? `<p>${line}</p>` : '');
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

/** Returns a color string with the given alpha (0–1), works for hex and hsl. */
function withAlpha(color, alpha) {
  if (color.startsWith('#')) {
    const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return `${color}${a}`;
  }
  // hsl(h, s%, l%) → hsl(h s% l% / alpha)
  return color.replace(/^hsl\((.+)\)$/, (_, inner) =>
    `hsl(${inner.replace(/,/g, '')} / ${alpha})`
  );
}

let overlay = null;
let state = {
  description: '',
  loading: false,
  parsed: null,
  validationResult: null,
  feasibilityResults: null,
  activeTab: 'input',
  progressPhase: '',
  progressTurn: 0,
  progressMaxTurns: 3,
  turnLog: [],
  generationSuccess: null,
  iconGeneration: null,
};

export function initAuthoring() {
  if (!new URLSearchParams(window.location.search).has('author')) return;

  const btn = document.createElement('button');
  btn.className = 'authoring-toggle-btn';
  btn.textContent = '⚙ Author';
  btn.title = 'Open content authoring tool';
  btn.addEventListener('click', toggleAuthoring);
  document.querySelector('.header')?.appendChild(btn);
}

function toggleAuthoring() {
  if (overlay) {
    closeAuthoring();
  } else {
    openAuthoring();
  }
}

function openAuthoring() {
  overlay = document.createElement('div');
  overlay.className = 'authoring-overlay';
  overlay.innerHTML = buildOverlayHTML();
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay?.classList.add('visible'));
  bindPermanentEvents();
  bindBodyEvents();
}

function closeAuthoring() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

function buildOverlayHTML() {
  return `
    <div class="authoring-panel">
      <div class="authoring-header">
        <h2 class="authoring-title">Content Authoring</h2>
        <button class="authoring-close" title="Close">✕</button>
      </div>
      <div class="authoring-tabs">
        <button class="authoring-tab ${state.activeTab === 'input' ? 'active' : ''}" data-tab="input">Generate</button>
        <button class="authoring-tab ${state.activeTab === 'preview' ? 'active' : ''}" data-tab="preview">Preview</button>
        <button class="authoring-tab ${state.activeTab === 'validation' ? 'active' : ''}" data-tab="validation">Validate</button>
        <button class="authoring-tab ${state.activeTab === 'export' ? 'active' : ''}" data-tab="export">Export</button>
      </div>
      <div class="authoring-body">
        ${renderTab()}
      </div>
    </div>
  `;
}

function renderTab() {
  switch (state.activeTab) {
    case 'input': return renderInputTab();
    case 'preview': return renderPreviewTab();
    case 'validation': return renderValidationTab();
    case 'export': return renderExportTab();
    default: return '';
  }
}

function renderInputTab() {
  const hasResult = state.generationSuccess !== null;
  const btnLabel = state.loading
    ? `<span class="authoring-spinner"></span> ${getProgressLabel()}`
    : (hasResult ? 'Restart Generation' : 'Generate Content');

  return `
    <div class="authoring-input-tab">
      <label class="authoring-label">Describe your scenario</label>
      <textarea class="authoring-textarea" id="auth-description" rows="6"
        placeholder="e.g., product-manager deck, scaling from 2 person team gradually to manager of manager having 100 people totally under them"
        ${state.loading ? 'disabled' : ''}
      >${state.description}</textarea>

      <button class="authoring-generate-btn" id="auth-generate" ${state.loading ? 'disabled' : ''}>
        ${btnLabel}
      </button>

      ${state.loading ? renderProgressIndicator() : ''}
    </div>
  `;
}

function getProgressLabel() {
  const { progressPhase, progressTurn, progressMaxTurns } = state;
  const prefix = `Turn ${progressTurn}/${progressMaxTurns}`;
  switch (progressPhase) {
    case 'generating': return `${prefix} — Generating...`;
    case 'validating': return `${prefix} — Validating...`;
    case 'reviewing': return `${prefix} — LLM reviewing...`;
    case 'parse-error': return `${prefix} — Parse error, retrying...`;
    case 'turn-failed': return `${prefix} — Issues found, revising...`;
    default: return 'Working...';
  }
}

function renderProgressIndicator() {
  const { progressTurn, progressMaxTurns, progressPhase, turnLog } = state;

  const phases = ['generating', 'validating', 'reviewing'];
  const currentPhaseIdx = phases.indexOf(progressPhase);

  const dots = [];
  for (let t = 1; t <= progressMaxTurns; t++) {
    if (t < progressTurn) {
      dots.push('<span class="authoring-progress-dot done"></span>');
    } else if (t === progressTurn) {
      const filled = Math.max(0, currentPhaseIdx + 1);
      for (let p = 0; p < 3; p++) {
        dots.push(`<span class="authoring-progress-dot ${p < filled ? 'active' : ''}"></span>`);
      }
    } else {
      dots.push('<span class="authoring-progress-dot"></span>');
    }
  }

  let logHtml = '';
  if (turnLog.length > 0) {
    logHtml = `<div class="authoring-progress-log">
      ${turnLog.map(entry => {
        const issueCount = (entry.deterministicIssues?.length || 0);
        const llmOk = entry.llmReview?.verdict;
        const icon = (issueCount === 0 && llmOk) ? '✓' : '✗';
        const cls = (issueCount === 0 && llmOk) ? 'pass' : 'fail';
        return `<div class="authoring-progress-log-entry ${cls}">
          <span>${icon}</span>
          <span>Turn ${entry.turn}: ${issueCount} issue${issueCount !== 1 ? 's' : ''}, LLM ${llmOk ? 'approved' : 'rejected'}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  return `
    <div class="authoring-progress">
      <div class="authoring-progress-dots">${dots.join('')}</div>
      ${logHtml}
    </div>
  `;
}

function renderPreviewTab() {
  if (!state.parsed || !state.parsed.deck) {
    return '<div class="authoring-empty">Generate content first to see a preview.</div>';
  }

  const { deck, scenarios, campaign } = state.parsed;
  const cards = (deck.cards || []).map(card => {
    const typeColor = getTypeColor(card.type);
    const bgColor = withAlpha(typeColor, 0.15);
    const borderColor = withAlpha(typeColor, 0.45);
    return `
      <div class="authoring-card-preview" style="--type-color:${typeColor};background:${bgColor};border-color:${borderColor}">
        <div class="authoring-card-icon">${renderIcon(card.icon) || '?'}</div>
        <div class="authoring-card-name">${card.name}</div>
        <div class="authoring-card-cost">⬡ ${card.cost}</div>
        <div class="authoring-card-type" style="background:${typeColor}">${card.type}</div>
      </div>
    `;
  }).join('');

  const scenarioList = (scenarios || []).map(s => `
    <div class="authoring-scenario-preview">
      <div class="authoring-scenario-name">${s.name}</div>
      <div class="authoring-scenario-brief">${s.briefing}</div>
      <div class="authoring-scenario-meta">
        Budget: ⬡ ${s.totalResources} · ${s.goals?.length || 0} goals
      </div>
    </div>
  `).join('');

  const campaignHtml = campaign ? `
    <div class="authoring-section">
      <h4>Campaign: ${campaign.name || 'Untitled'}</h4>
      <p>${campaign.description || ''}</p>
      <div class="authoring-encounters">${(campaign.encounters || []).map((e, i) => `
        <div class="authoring-encounter">
          <span class="authoring-encounter-idx">${i + 1}</span>
          <span>${e.scenarioId}</span>
          <span class="authoring-encounter-meta">Draft: ${e.draftPicks || 0} picks from ${e.draftPool?.length || 0} cards</span>
        </div>
      `).join('')}</div>
    </div>
  ` : '';

  return `
    <div class="authoring-preview-tab">
      <div class="authoring-section">
        <h4>Deck: ${deck.deckName || deck.id || 'Untitled'} (${deck.cards?.length || 0} cards)</h4>
        <div class="authoring-cards-grid">${cards}</div>
      </div>
      <div class="authoring-section">
        <h4>Scenarios (${scenarios?.length || 0})</h4>
        ${scenarioList}
      </div>
      ${campaignHtml}
    </div>
  `;
}

function renderValidationTab() {
  if (!state.parsed && state.turnLog.length === 0 && !state.fatalError) {
    return '<div class="authoring-empty">Generate content first to see validation results.</div>';
  }

  let html = '';

  if (state.fatalError && state.turnLog.length === 0) {
    html += `<div class="authoring-section">
      <div class="authoring-generation-result fail">Generation failed before starting: ${escapeHtml(state.fatalError)}</div>
    </div>`;
    return `<div class="authoring-validation-tab">${html}</div>`;
  }

  if (state.generationSuccess === true) {
    html += `<div class="authoring-section">
      <div class="authoring-generation-result pass">All checks passed in ${state.turnLog.length} turn${state.turnLog.length !== 1 ? 's' : ''}.</div>
    </div>`;
  } else if (state.generationSuccess === false) {
    html += `<div class="authoring-section">
      <div class="authoring-generation-result fail">Issues remain after ${state.turnLog.length} turn${state.turnLog.length !== 1 ? 's' : ''}. Review below and export if acceptable.</div>
    </div>`;
  }

  for (const entry of state.turnLog) {
    const issueCount = (entry.deterministicIssues?.length || 0) + (entry.parseErrors?.length || 0);
    const llmOk = entry.llmReview?.verdict;
    const turnOk = issueCount === 0 && llmOk;
    const summaryIcon = turnOk ? '✅' : '❌';

    html += `<div class="authoring-section">
      <details ${entry.turn === state.turnLog.length ? 'open' : ''}>
        <summary class="authoring-turn-summary">
          ${summaryIcon} Turn ${entry.turn}
          <span class="authoring-turn-summary-detail">${issueCount} issue${issueCount !== 1 ? 's' : ''}, LLM ${llmOk ? 'approved' : 'rejected'}</span>
        </summary>
        <div class="authoring-turn-details">
          ${renderTurnDetails(entry)}
        </div>
      </details>
    </div>`;
  }

  return `<div class="authoring-validation-tab">${html}</div>`;
}

function renderTurnDetails(entry) {
  let html = '';

  if (entry.parseErrors?.length > 0) {
    html += `<h5>Parse Errors</h5>
      <ul class="authoring-error-list">${entry.parseErrors.map(e => `<li class="error">${escapeHtml(e)}</li>`).join('')}</ul>`;
  }

  if (entry.validation) {
    html += `<h5>Schema Validation ${entry.validation.valid ? '✅' : '❌'}</h5>`;
    if (entry.validation.errors.length > 0) {
      html += `<ul class="authoring-error-list">${entry.validation.errors.map(e => `<li class="error">${escapeHtml(e)}</li>`).join('')}</ul>`;
    } else {
      html += '<p class="authoring-success">All checks passed.</p>';
    }
  }

  if (entry.feasibility) {
    html += `<h5>Feasibility</h5>`;
    html += entry.feasibility.map(f => `
      <div class="authoring-feasibility-row ${f.feasible ? 'pass' : 'fail'}">
        <span class="authoring-feasibility-icon">${f.feasible ? '✅' : '❌'}</span>
        <span class="authoring-feasibility-name">E${f.encounterIndex}: ${f.scenarioName || f.scenarioId}</span>
        <span class="authoring-feasibility-detail">
          ${f.error ? f.error : `${f.bestGoalsMet}/${f.totalGoals} goals achievable`}
        </span>
      </div>
    `).join('');
  }

  if (entry.llmReview) {
    const verdictLabel = entry.llmReview.verdict ? '✅ Approved' : '❌ Rejected';
    html += `<h5>LLM Review — ${verdictLabel}</h5>`;
    if (entry.llmReview.feedback) {
      html += `<div class="authoring-llm-feedback">${renderMarkdown(entry.llmReview.feedback)}</div>`;
    }
  }

  return html;
}

function renderExportTab() {
  if (!state.parsed || !state.parsed.deck) {
    return '<div class="authoring-empty">Generate content first to export it.</div>';
  }

  const ig = state.iconGeneration;
  let iconSection;
  if (!ig) {
    iconSection = `<button class="authoring-export-btn" id="generate-icons">Generate Icons</button>`;
  } else if (ig.running) {
    iconSection = `
      <button class="authoring-export-btn" id="generate-icons" disabled>
        <span class="authoring-spinner"></span> Generating icons... ${ig.done}/${ig.total}
      </button>`;
  } else {
    const successCount = ig.total - ig.errors;
    iconSection = `
      <div class="authoring-success">✓ ${successCount}/${ig.total} icons generated${ig.errors > 0 ? ` (${ig.errors} failed)` : ''}</div>
      <button class="authoring-export-btn" id="generate-icons">Regenerate Icons</button>`;
  }

  return `
    <div class="authoring-export-tab">
      <p>Download generated content as JSON files ready to place in <code>client/public/data/</code>.</p>
      <div class="authoring-export-buttons">
        <button class="authoring-export-btn" id="export-deck">Download Deck</button>
        <button class="authoring-export-btn" id="export-scenarios">Download Scenarios</button>
        <button class="authoring-export-btn" id="export-campaign">Download Campaign</button>
        <button class="authoring-export-btn" id="export-all">Download All</button>
      </div>
      <div class="authoring-export-icons">
        <p>Optionally generate badge icons for each card via Gemini image generation (requires <code>GEMINI_API_KEY</code> on the server).</p>
        ${iconSection}
      </div>
    </div>
  `;
}

/**
 * Bind events on elements that live outside .authoring-body (header, tabs).
 * Called only once when the overlay is first created — these elements are never
 * replaced by rerender(), so adding listeners here more than once would accumulate.
 */
function bindPermanentEvents() {
  overlay.querySelector('.authoring-close')?.addEventListener('click', closeAuthoring);
  overlay.querySelectorAll('.authoring-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.activeTab = tab.dataset.tab;
      rerender();
    });
  });
}

/**
 * Bind events on elements inside .authoring-body, which is replaced on every rerender().
 * Safe to call after each rerender because the old nodes are destroyed with innerHTML.
 */
function bindBodyEvents() {
  overlay.querySelector('#auth-generate')?.addEventListener('click', handleGenerate);

  overlay.querySelector('#export-deck')?.addEventListener('click', () => downloadJSON(state.parsed.deck, `${state.parsed.deck.deckId || 'deck'}.json`));
  overlay.querySelector('#export-scenarios')?.addEventListener('click', () => {
    for (const s of (state.parsed.scenarios || [])) downloadJSON(s, `${s.id}.json`);
  });
  overlay.querySelector('#export-campaign')?.addEventListener('click', () => downloadJSON(state.parsed.campaign, `${state.parsed.campaign?.id || 'campaign'}.json`));
  overlay.querySelector('#export-all')?.addEventListener('click', handleExportAll);
  overlay.querySelector('#generate-icons')?.addEventListener('click', handleGenerateIcons);
}

function rerender() {
  if (!overlay) return;
  const body = overlay.querySelector('.authoring-body');
  if (body) body.innerHTML = renderTab();

  overlay.querySelectorAll('.authoring-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === state.activeTab);
  });

  bindBodyEvents();
}

async function handleGenerate() {
  state.description = overlay.querySelector('#auth-description')?.value || '';
  if (!state.description.trim()) return;

  state.loading = true;
  state.parsed = null;
  state.validationResult = null;
  state.feasibilityResults = null;
  state.turnLog = [];
  state.generationSuccess = null;
  state.fatalError = null;
  state.progressTurn = 0;
  state.progressPhase = '';
  rerender();

  try {
    const result = await generateAndReview(state.description, (progress) => {
      state.progressTurn = progress.turn;
      state.progressMaxTurns = progress.maxTurns;
      state.progressPhase = progress.phase;
      state.turnLog = progress.turnLog || [];
      if (progress.parsed) state.parsed = progress.parsed;
      if (progress.success !== undefined) state.generationSuccess = progress.success;
      rerender();
    });

    state.parsed = result.parsed;
    state.turnLog = result.turnLog;
    state.generationSuccess = result.success;

    if (result.parsed?.deck) {
      state.validationResult = validateContent(result.parsed);
      state.feasibilityResults = checkFeasibility(result.parsed);
    }

    state.activeTab = result.success ? 'preview' : 'validation';
  } catch (err) {
    console.error('[authoring] generation failed:', err);
    state.fatalError = err.message;
    state.parsed = { deck: null, scenarios: null, campaign: null, errors: [err.message] };
    state.generationSuccess = false;
    state.activeTab = 'validation';
  } finally {
    state.loading = false;
    rerender();
  }
}

async function handleGenerateIcons() {
  if (!state.parsed?.deck) return;
  const deck = state.parsed.deck;
  const total = deck.cards?.length || 0;

  state.iconGeneration = { running: true, done: 0, total, errors: 0 };
  rerender();

  try {
    await generateIconsForDeck(deck, ({ done, total: t, success }) => {
      const prev = state.iconGeneration;
      state.iconGeneration = {
        running: true,
        done,
        total: t,
        errors: prev.errors + (success ? 0 : 1),
      };
      rerender();
    });
  } finally {
    state.iconGeneration = { ...state.iconGeneration, running: false };
    rerender();
  }
}

function handleExportAll() {
  if (!state.parsed) return;
  if (state.parsed.deck) downloadJSON(state.parsed.deck, `${state.parsed.deck.deckId || 'deck'}.json`);
  for (const s of (state.parsed.scenarios || [])) downloadJSON(s, `${s.id}.json`);
  if (state.parsed.campaign) downloadJSON(state.parsed.campaign, `${state.parsed.campaign.id || 'campaign'}.json`);
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
