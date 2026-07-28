/**
 * survey-snap environment preflight.
 *
 *   npm run doctor
 *
 * Checks every external dependency the app cannot function without and prints
 * the exact fix command for anything that is missing. Exits non-zero on failure
 * so it can gate a build.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileP = promisify(execFile);

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

type Check = {
  name: string;
  run: () => Promise<string>;
  fix: string;
};

/** The tesseract binary the OCR pipeline shells out to. Override with TESSERACT_BIN. */
export const TESSERACT_BIN = process.env.TESSERACT_BIN || 'tesseract';

const checks: Check[] = [
  {
    name: 'tesseract binary',
    fix:
      'sudo apt-get install -y tesseract-ocr tesseract-ocr-eng\n' +
      '     (no root? see README "Installing tesseract without sudo", or set TESSERACT_BIN=/path/to/tesseract)',
    run: async () => {
      const { stdout, stderr } = await execFileP(TESSERACT_BIN, ['--version']);
      return (stdout || stderr).split('\n')[0].trim();
    },
  },
  {
    name: 'tesseract eng language data',
    fix: 'sudo apt-get install -y tesseract-ocr-eng   (or set TESSDATA_PREFIX to a dir containing eng.traineddata)',
    run: async () => {
      const { stdout, stderr } = await execFileP(TESSERACT_BIN, ['--list-langs']);
      const langs = (stdout || stderr)
        .split('\n')
        .slice(1)
        .map((l) => l.trim())
        .filter(Boolean);
      if (!langs.includes('eng')) throw new Error(`eng not found (have: ${langs.join(', ') || 'none'})`);
      return `langs: ${langs.join(', ')}`;
    },
  },
  {
    name: 'sharp (image preprocessing)',
    fix: 'npm install sharp',
    run: async () => {
      const sharp = (await import('sharp')).default;
      const png = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
      })
        .png()
        .toBuffer();
      return `ok (${sharp.versions.vips ? 'libvips ' + sharp.versions.vips : 'loaded'}, ${png.length}B test image)`;
    },
  },
  {
    name: 'playwright chromium',
    fix: 'npx playwright install chromium   (and: npx playwright install-deps chromium)',
    run: async () => {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const version = browser.version();
      await browser.close();
      return `chromium ${version} launches headless`;
    },
  },
  {
    name: 'better-sqlite3',
    fix: 'npm rebuild better-sqlite3',
    run: async () => {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(':memory:');
      const row = db.prepare('SELECT sqlite_version() AS v').get() as { v: string };
      db.close();
      return `sqlite ${row.v}`;
    },
  },
  {
    name: 'data/ writable',
    fix: `mkdir -p ${DATA_DIR}/uploads && chmod u+w ${DATA_DIR}`,
    run: async () => {
      fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
      const probe = path.join(DATA_DIR, '.doctor-probe');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return DATA_DIR;
    },
  },
];

async function main() {
  console.log('survey-snap doctor\n');
  let failed = 0;

  for (const check of checks) {
    try {
      const detail = await check.run();
      console.log(`  \x1b[32m✔\x1b[0m ${check.name.padEnd(32)} ${detail}`);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  \x1b[31m✘\x1b[0m ${check.name.padEnd(32)} ${msg.split('\n')[0]}`);
      console.log(`      fix: ${check.fix}`);
    }
  }

  console.log('');
  if (failed) {
    console.log(`\x1b[31m${failed} check(s) failed.\x1b[0m`);
    process.exit(1);
  }
  console.log('\x1b[32mAll checks passed.\x1b[0m');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
