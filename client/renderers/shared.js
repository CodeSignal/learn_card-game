import { uiState } from '../modules/state.js';

export const METRIC_LABELS = {
  latency:       { icon: '⏱', short: v => `${Math.round(v)}ms`,        full: v => `${Math.round(v)} ms` },
  throughput:    { icon: '📶', short: v => `${fmtK(v)} req/s`,          full: v => `${v.toLocaleString()} req/s` },
  reliability:   { icon: '🛡', short: v => `${v.toFixed(1)}%`,          full: v => `${v.toFixed(2)}%` },
  monthlyCost:   { icon: '💰', short: v => `$${fmtK(Math.round(v))}`,  full: v => `$${Math.round(v).toLocaleString()}/mo` },
  trainingCost:  { icon: '⏱', short: v => `${Math.round(v)} min`,      full: v => `${Math.round(v)} min training time` },
  modelFreshness:{ icon: '🌱', short: v => `${Math.round(v)}%`,         full: v => `${Math.round(v)}% freshness` },
  infraCost:     { icon: '💰', short: v => `$${fmtK(Math.round(v))}`,  full: v => `$${Math.round(v).toLocaleString()}/mo` },
};

export const TYPE_COLORS = {
  backend: '#43a047',
  database: '#1e88e5',
  cache: '#ef6c00',
  infrastructure: '#8e24aa',
  security: '#c62828',
  observability: '#00897b',
  messaging: '#f9a825',
  storage: '#6d4c41',
  search: '#3949ab',
  devops: '#00897b',
  training: '#5c6bc0',
  inference: '#e53935',
  data: '#00897b',
  platform: '#8e24aa',
  compute: '#f4511e',
};

export function renderIcon(icon, cls = '') {
  if (icon && (icon.startsWith('/') || icon.startsWith('http'))) {
    return `<img src="${icon}" alt="" class="card-icon-img${cls ? ' ' + cls : ''}" />`;
  }
  return icon || '';
}

function fmtK(n) {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString();
}

export function getMetricDef(key) {
  return uiState.scenarioData?.baseMetrics?.[key];
}

export function formatEffect(key, value) {
  const metricDef = getMetricDef(key);
  const label = metricDef?.label || key.charAt(0).toUpperCase() + key.slice(1);
  const sign = value > 0 ? '+' : '';
  const unit = metricDef?.unit ? ` ${metricDef.unit}` : (key === 'latency' ? ' ms' : key === 'throughput' ? ' req/s' : key === 'reliability' ? '%' : '');
  const lowerIsBetter = metricDef?.lowerIsBetter ?? (key === 'monthlyCost' || key === 'latency' || key === 'trainingCost' || key === 'infraCost');
  const displayVal = (key === 'monthlyCost' || key === 'infraCost') ? `${sign}$${Math.abs(value)}` : `${sign}${value}${unit}`;
  const isGood = lowerIsBetter ? value < 0 : value > 0;
  const color = isGood ? 'var(--Colors-Alert-Success-Default)' : 'var(--Colors-Alert-Error-Default)';
  return { label, displayVal, color };
}

export function deduplicateSynergies(synergies) {
  const seen = new Set();
  return synergies.filter(s => {
    const key = [s.sourceCard, s.targetCard].sort().join('+') + s.metric;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Determine if a synergy bonus is harmful given the metric's direction.
 * A negative bonus on a "higher is better" metric is bad.
 * A positive bonus on a "lower is better" metric is also bad.
 */
export function isAntiSynergy(bonus, metricKey) {
  const metricDef = getMetricDef(metricKey);
  const lowerIsBetter = metricDef?.lowerIsBetter ?? (metricKey === 'monthlyCost' || metricKey === 'latency' || metricKey === 'trainingCost' || metricKey === 'infraCost');
  return lowerIsBetter ? bonus > 0 : bonus < 0;
}

export function renderSynergyRow(s, engine, { showNames = false } = {}) {
  const src = engine.getCard(s.sourceCard);
  const tgt = engine.getCard(s.targetCard);
  if (!src || !tgt) return '';

  const fmt = METRIC_LABELS[s.metric];
  const sign = s.bonus > 0 ? '+' : '';
  const bonusText = fmt ? `${sign}${fmt.short(s.bonus)}` : `${sign}${s.bonus}`;
  const metricIcon = fmt ? fmt.icon : '';
  const anti = isAntiSynergy(s.bonus, s.metric);
  const icon = anti ? '⚠' : '⚡';
  const rowClass = anti ? 'synergy-row anti' : 'synergy-row';

  const pair = showNames
    ? `${renderIcon(src.icon)} ${src.name} + ${renderIcon(tgt.icon)} ${tgt.name}`
    : `${renderIcon(src.icon)} + ${renderIcon(tgt.icon)}`;

  return `<div class="${rowClass}">
    <span class="synergy-pair">${icon} ${pair}</span>
    <span class="synergy-effect">${metricIcon} ${bonusText}</span>
    <span class="synergy-reason">${s.reason}</span>
  </div>`;
}
