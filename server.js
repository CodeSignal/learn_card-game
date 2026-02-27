const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

require('dotenv').config();

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
  const { prompt, apiKey, model = 'gpt-4o', baseUrl = 'https://api.openai.com/v1', max_tokens } = JSON.parse(body);

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
      temperature: 0.7,
      max_tokens: max_tokens || 8000,
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

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

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
