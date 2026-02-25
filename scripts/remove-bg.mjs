import sharp from 'sharp';
import { readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function isGreen(r, g, b) {
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

async function removeBackground(inputPath, outputPath) {
  const image = sharp(inputPath);
  const { width, height } = await image.metadata();
  const { data } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    const r = out[offset], g = out[offset + 1], b = out[offset + 2];
    if (isGreen(r, g, b)) {
      out[offset + 3] = 0; // set alpha to 0
    }
  }

  // Anti-alias: soften edges by checking neighbors
  const copy = Buffer.from(out);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      if (copy[i + 3] === 0) continue; // already transparent

      let transparentNeighbors = 0;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const ni = ((y + dy) * width + (x + dx)) * 4;
        if (copy[ni + 3] === 0) transparentNeighbors++;
      }
      if (transparentNeighbors >= 2) {
        out[i + 3] = Math.round(out[i + 3] * 0.4);
      } else if (transparentNeighbors === 1) {
        out[i + 3] = Math.round(out[i + 3] * 0.75);
      }
    }
  }

  await sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .trim()
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(outputPath);
}

async function main() {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error('Usage: node scripts/remove-bg.mjs <directory-with-pngs>');
    process.exit(1);
  }

  if (!existsSync(targetDir)) {
    console.error(`Directory not found: ${targetDir}`);
    process.exit(1);
  }

  const rawDir = join(targetDir, 'raw');
  const hasRaw = existsSync(rawDir);
  const sourceDir = hasRaw ? rawDir : targetDir;

  const files = readdirSync(sourceDir).filter(f => f.endsWith('.png'));
  console.log(`Processing ${files.length} images from ${hasRaw ? 'raw/' : 'in-place'}\n`);

  for (const file of files) {
    const inputPath = join(sourceDir, file);
    const outputPath = join(targetDir, file);
    process.stdout.write(`  ${file}...`);
    try {
      await removeBackground(inputPath, outputPath);
      console.log(' ✓');
    } catch (err) {
      console.log(` ✗ ${err.message}`);
    }
  }

  console.log('\nDone.');
}

main();
