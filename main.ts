// Token Radar — entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot at /input/snapshot.json (or --input <file|dir>),
// scores every pre-token protocol with the model in lib/model.ts, writes the
// ranked board to /output/board.json, writes the dashboard's data as
// /output/data.js, copies this repository's dashboard/ and screenshots/ to
// /output, and writes /output/dossier.json LAST with the vendored make.fun
// library (vendor/makefun-board.ts), exactly as the kit's starter does.
//
// Deterministic: no wall clock, no randomness, no network. Two runs on the
// same snapshot write byte-identical outputs.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// --- v3 farm-step build-time assertion (spec §4.2/L3): the top-30 rows
// carry 7 steps each (sizing + exit trigger); every step carries a cost
// and/or a duration token; no step exceeds 550 chars. ---
const COST_RE = /\$|budget|gas|fee|APY/i;
const DURATION_RE = /(\d+\s*[–-]\s*\d+|\d+)\s*(day|week|month)s?\b|weekly|daily|for the (first|full) (week|window)/i;
let farmSteps = 0;
let farmBoth = 0;
for (const row of board) {
  if (row.rank <= 30 && row.farm_steps.length !== 7) {
    process.stderr.write(
      `token radar: top-30 row ${row.slug} has ${row.farm_steps.length} farm steps, expected 7\n`,
    );
    process.exit(1);
  }
  for (const s of row.farm_steps) {
    farmSteps++;
    const hasCost = COST_RE.test(s);
    const hasDur = DURATION_RE.test(s);
    if (!hasCost && !hasDur) {
      process.stderr.write(`token radar: farm step lacks cost and duration: ${row.slug}: ${s}\n`);
      process.exit(1);
    }
    if (s.length > 550) {
      process.stderr.write(`token radar: farm step exceeds 550 chars (${s.length}): ${row.slug}\n`);
      process.exit(1);
    }
    if (hasCost && hasDur) farmBoth++;
  }
}

// --- METHOD.md size assertion (spec §5.2): the evidence narrative must fit
// the dossier text budget with margin. ---
const methodPath = join(here, 'dashboard', 'METHOD.md');
if (existsSync(methodPath)) {
  const methodBytes = statSync(methodPath).size;
  if (methodBytes > 24_000) {
    process.stderr.write(`token radar: dashboard/METHOD.md is ${methodBytes} bytes, over the 24,000 B budget\n`);
    process.exit(1);
  }
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
if (!dashFiles.includes('index.html')) {
  process.stderr.write('token radar: dashboard/ has no index.html: the gate refuses a dashboard without one\n');
  process.exit(1);
}
if (!dashFiles.some((n) => n.endsWith('.css')) || !dashFiles.some((n) => n.endsWith('.js'))) {
  process.stderr.write('token radar: dashboard/ needs at least one .css and one .js file\n');
  process.exit(1);
}
const shotsDir = join(here, 'screenshots');
if (existsSync(shotsDir)) {
  for (const name of readdirSync(shotsDir)) {
    if (name.startsWith('.')) continue;
    if (!IMAGE_NAME.test(name)) {
      process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
      process.exit(1);
    }
  }
}
const shots = copyFiles(shotsDir, join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const dossierTextBytes = Buffer.byteLength(
  (JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8')) as { text: string }).text,
  'utf8',
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored\n` +
    `token radar: LOO n=${radar.model.loo.n} MAPE ${(radar.model.loo.mape * 100).toFixed(1)}% median|log| ${radar.model.loo.medianAbsLogErr.toFixed(3)} within2x ${(radar.model.loo.within2 * 100).toFixed(1)}% within3x ${(radar.model.loo.within3 * 100).toFixed(1)}% | robust n=${radar.model.looRobust.n} MAPE ${(radar.model.looRobust.mape * 100).toFixed(1)}% median|log| ${radar.model.looRobust.medianAbsLogErr.toFixed(3)}\n` +
    `token radar: farm audit: ${farmSteps} steps, 100% with cost and/or duration, ${((farmBoth / farmSteps) * 100).toFixed(1)}% with both\n` +
    `token radar: top 10: ${board.slice(0, 10).map((r) => `${r.slug} $${r.implied_value_usd}`).join(', ')}\n` +
    `token radar: dossier text ${dossierTextBytes} bytes (cap ${TEXT_MAX_BYTES})\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
