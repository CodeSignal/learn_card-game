const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

require('dotenv').config();

const LLM_LOG_PATH = path.join(process.cwd(), 'llm.log');

function logLLMCall(label, prompt, content) {
  const sep = '─'.repeat(80);
  const ts = new Date().toISOString();
  const entry = [
    '',
    sep,
    `[${ts}] ${label.toUpperCase()}`,
    sep,
    '--- PROMPT ---',
    prompt,
    '--- RESPONSE ---',
    content,
    '',
  ].join('\n');

  fs.appendFile(LLM_LOG_PATH, entry, (err) => {
    if (err) console.error('[llm-log] write error:', err.message);
  });

  console.log(`[llm] ${label} — ${content.length} chars`);
}

let WebSocket = null;
let isWebSocketAvailable = false;
try {
  WebSocket = require('ws');
  isWebSocketAvailable = true;
  console.log('WebSocket support enabled');
} catch (error) {
  console.log('WebSocket support disabled (ws package not installed)');
}

const DIST_DIR = path.join(__dirname, 'dist');
const isProduction = process.env.IS_PRODUCTION === 'true';
if (isProduction && !fs.existsSync(DIST_DIR)) {
  throw new Error(`Production mode enabled but dist directory does not exist: ${DIST_DIR}`);
}
const PORT = isProduction ? 3000 : (process.env.PORT || 3000);

const wsClients = new Set();

const SOLUTION_PATH = path.join(process.cwd(), 'solution.json');
const INITIAL_STATE_PATH = path.join(process.cwd(), 'initial_state.json');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'text/plain';
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function handleGetState(req, res) {
  fs.readFile(SOLUTION_PATH, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No saved state' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
  });
}

function handlePostState(req, res) {
  readBody(req).then(body => {
    JSON.parse(body);
    fs.writeFile(SOLUTION_PATH, body, (err) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to save state' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
  }).catch(() => {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
  });
}

function handleGetInitialState(req, res) {
  fs.readFile(INITIAL_STATE_PATH, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No initial state' }));
      return;
    }
    try {
      JSON.parse(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (parseErr) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid initial_state.json' }));
    }
  });
}

async function handleGenerateContent(req, res) {
  const body = await readBody(req);
  const { prompt, apiKey, model = 'gpt-4o', baseUrl = 'https://api.openai.com/v1', max_tokens, label = 'llm' } = JSON.parse(body);

  if (!prompt) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'prompt is required' }));
    return;
  }

  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No API key configured.' }));
    return;
  }

  try {
    const apiUrl = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const payload = JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: max_tokens || 16000,
    });

    const parsedApi = new URL(apiUrl);
    const https = parsedApi.protocol === 'https:' ? require('https') : require('http');

    const apiRes = await new Promise((resolve, reject) => {
      const r = https.request(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
      }, resolve);
      r.on('error', reject);
      r.write(payload);
      r.end();
    });

    let data = '';
    for await (const chunk of apiRes) data += chunk;

    if (apiRes.statusCode !== 200) {
      res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `LLM API error: ${apiRes.statusCode}`, details: data }));
      return;
    }

    const parsed = JSON.parse(data);
    const content = parsed.choices?.[0]?.message?.content || '';

    logLLMCall(label, prompt, content);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ─── Icon generation ────────────────────────────────────────────────────────

let sharp = null;
try { sharp = require('sharp'); } catch (_) {}

const GEMINI_ICON_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

const ICON_PROMPT_TEMPLATE = `
## RULE: The output image must contain ZERO text.
No letters, no numbers, no words, no labels, no titles, no hex codes — nothing that a human could read as text. This includes the card name below: it tells you WHAT TO DEPICT as a symbol, NOT what to write. Any image containing text will be rejected.

Generate a purely graphical badge icon. Depict the concept of "{{CARD_NAME}}" ({{CARD_TYPE}}: {{CARD_DESC}}) using ONLY shapes, symbols, and abstract icons — no labels.

## Composition
- Rounded-corner hexagon badge
- Centered, symmetrical primary symbol inside
- Dotted or dashed circle/hexagon framing the symbol
- 4–8 small floating accents in the margins (dots, tiny squares, plus signs, small circles, short dashes)
- Optional: subtle horizontal line patterns in the lower third suggesting data flow

## Style
Flat vector, clean geometry, consistent stroke weight. No gradients, no shadows, no texture. Sparse, evenly distributed decorative accents.

## Palette (use these colors, do NOT render them as text)
- Badge fill: #365FAF
- Mid-tone: #6292EF
- Light accent: #4CB4FF
- Highlight: #F4FAFF

## Size
Must read clearly at 24–32px. Primary symbol dominates; accents stay peripheral.

## Format
Square 1:1 image, solid bright green (#00FF00) background outside the badge for easy chroma-key removal.
`;

function isGreenScreen(r, g, b) {
  if (g < r * 1.15 || g < b * 1.15) return false;
  if (g < 100) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return false;
  const lightness = (max + min) / 2;
  const saturation = delta / (1 - Math.abs(2 * lightness / 255 - 1)) / 255;
  let hue;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;
  return hue > 85 && hue < 150 && saturation > 0.3 && lightness > 70 && lightness < 220;
}

async function removeGreenBackgroundInPlace(filePath) {
  const image = sharp(filePath);
  const { width, height } = await image.metadata();
  const { data } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (isGreenScreen(out[o], out[o + 1], out[o + 2])) out[o + 3] = 0;
  }

  const copy = Buffer.from(out);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      if (copy[i + 3] === 0) continue;
      let t = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (copy[((y + dy) * width + (x + dx)) * 4 + 3] === 0) t++;
      }
      if (t >= 2) out[i + 3] = Math.round(out[i + 3] * 0.4);
      else if (t === 1) out[i + 3] = Math.round(out[i + 3] * 0.75);
    }
  }

  const tmpPath = filePath + '.tmp';
  await sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .trim()
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(tmpPath);
  fs.copyFileSync(tmpPath, filePath);
  fs.unlinkSync(tmpPath);
}

function geminiPostJSON(urlStr, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(urlStr);
    const httpsModule = require('https');
    const req = httpsModule.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) return reject(new Error(`Gemini API error ${res.statusCode}: ${text}`));
        resolve(JSON.parse(text));
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function handleGenerateIconsForCard(req, res) {
  if (!sharp) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'sharp package not available — run npm install' }));
    return;
  }

  const body = await readBody(req);
  const { cardId, cardName, cardType, cardDescription, deckId } = JSON.parse(body);

  if (!cardId || !cardName || !deckId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'cardId, cardName, and deckId are required' }));
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'GEMINI_API_KEY environment variable not set' }));
    return;
  }

  const outDir = path.join(__dirname, 'client/public/data/icons', deckId);
  const rawDir = path.join(outDir, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });

  const rawPath = path.join(rawDir, `${cardId}.png`);
  const finalPath = path.join(outDir, `${cardId}.png`);

  const prompt = ICON_PROMPT_TEMPLATE
    .replace('{{CARD_NAME}}', cardName)
    .replace('{{CARD_TYPE}}', cardType || '')
    .replace('{{CARD_DESC}}', cardDescription || '');

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  };

  const geminiData = await geminiPostJSON(`${GEMINI_ICON_URL}?key=${apiKey}`, requestBody);

  let imageBuffer = null;
  for (const candidate of geminiData.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        imageBuffer = Buffer.from(part.inlineData.data, 'base64');
        break;
      }
    }
    if (imageBuffer) break;
  }

  if (!imageBuffer) throw new Error('No image in Gemini response');

  fs.writeFileSync(rawPath, imageBuffer);
  fs.copyFileSync(rawPath, finalPath);
  await removeGreenBackgroundInPlace(finalPath);

  const iconPath = `/data/icons/${deckId}/${cardId}.png`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ iconPath }));
}

// ────────────────────────────────────────────────────────────────────────────

function handlePostRequest(req, res, parsedUrl) {
  if (parsedUrl.pathname === '/state') {
    handlePostState(req, res);
    return;
  }

  if (parsedUrl.pathname === '/api/generate-content') {
    handleGenerateContent(req, res).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  if (parsedUrl.pathname === '/api/generate-icons') {
    handleGenerateIconsForCard(req, res).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  if (parsedUrl.pathname === '/message') {
    readBody(req).then(body => {
      const data = JSON.parse(body);
      if (!data.message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Message is required' }));
        return;
      }
      if (!isWebSocketAvailable) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'WebSocket not available' }));
        return;
      }
      wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'message', message: data.message }));
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, clientCount: wsClients.size }));
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathName = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;

  if (req.method === 'GET' && parsedUrl.pathname === '/state') {
    handleGetState(req, res);
    return;
  }
  if (req.method === 'GET' && parsedUrl.pathname === '/initial-state') {
    handleGetInitialState(req, res);
    return;
  }

  if (req.method === 'POST') {
    handlePostRequest(req, res, parsedUrl);
    return;
  }

  if (isProduction) {
    let filePath = path.join(DIST_DIR, pathName.replace(/^\/+/, ''));
    const resolvedDistDir = path.resolve(DIST_DIR);
    const resolvedFilePath = path.resolve(filePath);
    const relativePath = path.relative(resolvedDistDir, resolvedFilePath);

    if (relativePath.startsWith('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    serveFile(filePath, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found (development mode - use Vite dev server)');
  }
});

if (isWebSocketAvailable) {
  const wss = new WebSocket.Server({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    wsClients.add(ws);
    ws.on('close', () => { wsClients.delete(ws); });
    ws.on('error', () => { wsClients.delete(ws); });
  });
}

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (isProduction) console.log(`Serving from: ${DIST_DIR}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
