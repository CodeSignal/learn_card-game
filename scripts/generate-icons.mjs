import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import sharp from 'sharp';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error('Set GEMINI_API_KEY environment variable');
  process.exit(1);
}

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function httpsPostJSON(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode !== 200) return reject(new Error(`API error ${res.statusCode}: ${text}`));
        resolve(JSON.parse(text));
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const REFERENCE_URLS = [
  'https://k3-production-bucket.s3.us-east-1.amazonaws.com/uploads/NeE3NFrzXujx23mqS_badge-hard-level-0-1767976287293.svg',
  'https://k3-production-bucket.s3.amazonaws.com/uploads/8YixbrarwmLucrihP_zykBpxPqr9Q2j74RP_Level%3DDefault%2C%20Skill%3DDatabase%20Schema%20%26%20Data%20Storage.svg',
  'https://k3-production-bucket.s3.amazonaws.com/uploads/K5YqEXDnCTGGPpEoz_Level%3DDefault%2C%20Skill%3DServer-Side%20Programming.svg',
];

const PROMPT_TEMPLATE = `
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

async function fetchReferenceImages() {
  const refs = [];
  for (const url of REFERENCE_URLS) {
    try {
      const { buffer, contentType } = await httpsGet(url);
      refs.push({
        inlineData: {
          mimeType: contentType.includes('svg') ? 'image/png' : contentType,
          data: buffer.toString('base64'),
        },
      });
      console.log(`  ✓ Fetched reference: ${url.slice(-60)}`);
    } catch (err) {
      console.log(`  ✗ Failed to fetch reference: ${err.message}`);
    }
  }
  return refs;
}

async function generateIcon(card, referenceParts) {
  const prompt = PROMPT_TEMPLATE
    .replace('{{CARD_NAME}}', card.name)
    .replace('{{CARD_TYPE}}', card.type)
    .replace('{{CARD_DESC}}', card.description);

  // Reference images skipped — SVGs can't be sent as raster input to Gemini.
  // The text prompt describes the target style in detail.
  const parts = [{ text: prompt }];

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };

  const data = await httpsPostJSON(`${GEMINI_URL}?key=${GEMINI_KEY}`, body);

  for (const candidate of data.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }
  }

  throw new Error('No image in response');
}

function isGreenScreen(r, g, b) {
  // G must be the dominant channel by a clear margin
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

  // Tight hue range (pure green), high saturation, skip dark/bright extremes
  return hue > 85 && hue < 150 && saturation > 0.3 && lightness > 70 && lightness < 220;
}

async function removeGreenBackground(filePath) {
  const image = sharp(filePath);
  const { width, height } = await image.metadata();
  const { data } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (isGreenScreen(out[o], out[o + 1], out[o + 2])) out[o + 3] = 0;
  }

  // Anti-alias edges
  const copy = Buffer.from(out);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      if (copy[i + 3] === 0) continue;
      let t = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        if (copy[((y+dy)*width+(x+dx))*4+3] === 0) t++;
      }
      if (t >= 2) out[i + 3] = Math.round(out[i + 3] * 0.4);
      else if (t === 1) out[i + 3] = Math.round(out[i + 3] * 0.75);
    }
  }

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .trim()       // remove transparent padding
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(filePath + '.tmp');
  const { copyFileSync: cpSync, unlinkSync: rmSync } = await import('fs');
  cpSync(filePath + '.tmp', filePath);
  rmSync(filePath + '.tmp');
}

async function main() {
  const deckPath = process.argv[2];
  if (!deckPath) {
    console.error('Usage: node scripts/generate-icons.js <path-to-deck.json>');
    process.exit(1);
  }

  const deck = JSON.parse(readFileSync(deckPath, 'utf-8'));
  const outDir = join(ROOT, 'client/public/data/icons', deck.deckId);
  mkdirSync(outDir, { recursive: true });

  console.log(`Generating icons for deck "${deck.deckId}" (${deck.cards.length} cards)`);
  console.log(`Output: ${outDir}\n`);

  console.log('Fetching reference images...');
  const referenceParts = await fetchReferenceImages();
  console.log(`  ${referenceParts.length} reference(s) loaded\n`);

  const rawDir = join(outDir, 'raw');
  mkdirSync(rawDir, { recursive: true });

  const CONCURRENCY = 4;
  const cards = deck.cards.filter(card => {
    const rawFile = join(rawDir, `${card.id}.png`);
    if (existsSync(rawFile)) {
      console.log(`  ✓ ${card.id} — raw exists, skipping API call`);
      return false;
    }
    return true;
  });

  // Generate missing raw images from API
  for (let i = 0; i < cards.length; i += CONCURRENCY) {
    const batch = cards.slice(i, i + CONCURRENCY);
    console.log(`\n  Batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(cards.length / CONCURRENCY)} (${batch.map(c => c.id).join(', ')})`);

    const results = await Promise.allSettled(
      batch.map(async (card) => {
        const buf = await generateIcon(card, referenceParts);
        writeFileSync(join(rawDir, `${card.id}.png`), buf);
        return { card, size: buf.length };
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        console.log(`  ✓ ${r.value.card.id} (${(r.value.size / 1024).toFixed(0)}KB raw)`);
      } else {
        console.log(`  ✗ ${r.reason.message}`);
      }
    }
  }

  // Remove backgrounds: raw/ -> parent dir
  console.log('\nRemoving backgrounds...');
  const allRaw = readdirSync(rawDir).filter(f => f.endsWith('.png'));
  for (const file of allRaw) {
    const src = join(rawDir, file);
    const dest = join(outDir, file);
    process.stdout.write(`  ${file}...`);
    try {
      copyFileSync(src, dest);
      await removeGreenBackground(dest);
      console.log(' ✓');
    } catch (err) {
      console.log(` ✗ ${err.message}`);
    }
  }

  console.log('\nDone. Update deck JSON icon fields to use paths like:');
  console.log(`  "icon": "/data/icons/${deck.deckId}/<card-id>.png"`);
}

main();
