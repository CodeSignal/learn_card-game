import { generateContent, parseGeneratedContent, validateContent, checkFeasibility } from '../modules/content-generator.js';
import { TYPE_COLORS } from './shared.js';

let overlay = null;
let state = {
  description: '',
  apiKey: '',
  model: 'gpt-4o',
  baseUrl: 'https://api.openai.com/v1',
  loading: false,
  rawResponse: '',
  parsed: null,
  validationResult: null,
  feasibilityResults: null,
  activeTab: 'input',
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
  bindEvents();
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
  return `
    <div class="authoring-input-tab">
      <label class="authoring-label">Describe your scenario</label>
      <textarea class="authoring-textarea" id="auth-description" rows="6"
        placeholder="e.g., A real-time multiplayer game server that needs to handle 100K concurrent players, with matchmaking, leaderboards, and chat. The architecture should prioritize low latency and scalability."
      >${state.description}</textarea>

      <details class="authoring-settings">
        <summary>LLM Settings</summary>
        <div class="authoring-settings-grid">
          <label>API Key <input type="password" id="auth-api-key" class="authoring-input" value="${state.apiKey}" placeholder="sk-..."></label>
          <label>Model <input type="text" id="auth-model" class="authoring-input" value="${state.model}"></label>
          <label>Base URL <input type="text" id="auth-base-url" class="authoring-input" value="${state.baseUrl}"></label>
        </div>
      </details>

      <button class="authoring-generate-btn" id="auth-generate" ${state.loading ? 'disabled' : ''}>
        ${state.loading ? '<span class="authoring-spinner"></span> Generating...' : '🤖 Generate Content'}
      </button>

      ${state.rawResponse ? `
        <div class="authoring-raw-toggle">
          <details>
            <summary>Raw LLM Response</summary>
            <pre class="authoring-raw">${escapeHtml(state.rawResponse)}</pre>
          </details>
        </div>
      ` : ''}
    </div>
  `;
}

function renderPreviewTab() {
  if (!state.parsed || !state.parsed.deck) {
    return '<div class="authoring-empty">Generate content first to see a preview.</div>';
  }

  const { deck, scenarios, campaign } = state.parsed;
  const cards = (deck.cards || []).map(card => {
    const typeColor = TYPE_COLORS[card.type] || '#888';
    return `
      <div class="authoring-card-preview" style="--type-color: ${typeColor}">
        <div class="authoring-card-icon">${card.icon || '?'}</div>
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
        Budget: ⬡ ${s.totalResources} · ${s.goals?.length || 0} goals · ${s.availableCards?.length || 0} cards
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
  if (!state.parsed) {
    return '<div class="authoring-empty">Generate content first to validate it.</div>';
  }

  const parseErrors = state.parsed.errors || [];
  const validation = state.validationResult;
  const feasibility = state.feasibilityResults;

  let html = '';

  if (parseErrors.length > 0) {
    html += `<div class="authoring-section">
      <h4>Parse Errors</h4>
      <ul class="authoring-error-list">${parseErrors.map(e => `<li class="error">${escapeHtml(e)}</li>`).join('')}</ul>
    </div>`;
  }

  if (validation) {
    html += `<div class="authoring-section">
      <h4>Schema Validation ${validation.valid ? '✅' : '❌'}</h4>
      ${validation.errors.length > 0
        ? `<ul class="authoring-error-list">${validation.errors.map(e => `<li class="error">${escapeHtml(e)}</li>`).join('')}</ul>`
        : '<p class="authoring-success">All content passes schema validation.</p>'}
    </div>`;
  }

  if (feasibility) {
    html += `<div class="authoring-section">
      <h4>Feasibility Check</h4>
      ${feasibility.map(f => `
        <div class="authoring-feasibility-row ${f.feasible ? 'pass' : 'fail'}">
          <span class="authoring-feasibility-icon">${f.feasible ? '✅' : '❌'}</span>
          <span class="authoring-feasibility-name">${f.scenarioName || f.scenarioId}</span>
          <span class="authoring-feasibility-detail">
            ${f.error ? f.error : `${f.bestGoalsMet}/${f.totalGoals} goals achievable`}
          </span>
        </div>
      `).join('')}
    </div>`;
  }

  if (!parseErrors.length && !validation && !feasibility) {
    html = '<div class="authoring-empty">Click "Validate" to check generated content.</div>';
  }

  html += `<button class="authoring-validate-btn" id="auth-validate" ${!state.parsed?.deck ? 'disabled' : ''}>🔍 Run Validation</button>`;

  return `<div class="authoring-validation-tab">${html}</div>`;
}

function renderExportTab() {
  if (!state.parsed || !state.parsed.deck) {
    return '<div class="authoring-empty">Generate content first to export it.</div>';
  }

  return `
    <div class="authoring-export-tab">
      <p>Download generated content as JSON files ready to place in <code>client/public/data/</code>.</p>
      <div class="authoring-export-buttons">
        <button class="authoring-export-btn" id="export-deck">📦 Download Deck</button>
        <button class="authoring-export-btn" id="export-scenarios">🎯 Download Scenarios</button>
        <button class="authoring-export-btn" id="export-campaign">🗺 Download Campaign</button>
        <button class="authoring-export-btn" id="export-all">💾 Download All</button>
      </div>
    </div>
  `;
}

function bindEvents() {
  overlay.querySelector('.authoring-close')?.addEventListener('click', closeAuthoring);
  overlay.querySelectorAll('.authoring-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.activeTab = tab.dataset.tab;
      rerender();
    });
  });

  overlay.querySelector('#auth-generate')?.addEventListener('click', handleGenerate);
  overlay.querySelector('#auth-validate')?.addEventListener('click', handleValidate);

  overlay.querySelector('#export-deck')?.addEventListener('click', () => downloadJSON(state.parsed.deck, `${state.parsed.deck.deckId || 'deck'}.json`));
  overlay.querySelector('#export-scenarios')?.addEventListener('click', () => {
    for (const s of (state.parsed.scenarios || [])) downloadJSON(s, `${s.id}.json`);
  });
  overlay.querySelector('#export-campaign')?.addEventListener('click', () => downloadJSON(state.parsed.campaign, `${state.parsed.campaign?.id || 'campaign'}.json`));
  overlay.querySelector('#export-all')?.addEventListener('click', handleExportAll);
}

function rerender() {
  if (!overlay) return;
  const body = overlay.querySelector('.authoring-body');
  if (body) body.innerHTML = renderTab();

  overlay.querySelectorAll('.authoring-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === state.activeTab);
  });

  bindEvents();
}

async function handleGenerate() {
  state.description = overlay.querySelector('#auth-description')?.value || '';
  state.apiKey = overlay.querySelector('#auth-api-key')?.value || '';
  state.model = overlay.querySelector('#auth-model')?.value || 'gpt-4o';
  state.baseUrl = overlay.querySelector('#auth-base-url')?.value || 'https://api.openai.com/v1';

  if (!state.description.trim()) return;

  state.loading = true;
  state.rawResponse = '';
  state.parsed = null;
  state.validationResult = null;
  state.feasibilityResults = null;
  rerender();

  try {
    const result = await generateContent(state.description, {
      apiKey: state.apiKey,
      model: state.model,
      baseUrl: state.baseUrl,
    });

    state.rawResponse = result.content;
    state.parsed = parseGeneratedContent(result.content);

    if (state.parsed.deck && state.parsed.scenarios) {
      state.validationResult = validateContent(state.parsed);
      state.feasibilityResults = checkFeasibility(state.parsed);
    }

    state.activeTab = state.parsed.errors.length > 0 ? 'validation' : 'preview';
  } catch (err) {
    state.rawResponse = `Error: ${err.message}`;
    state.parsed = { deck: null, scenarios: null, campaign: null, errors: [err.message] };
    state.activeTab = 'validation';
  } finally {
    state.loading = false;
    rerender();
  }
}

function handleValidate() {
  if (!state.parsed) return;
  state.validationResult = validateContent(state.parsed);
  state.feasibilityResults = checkFeasibility(state.parsed);
  rerender();
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
