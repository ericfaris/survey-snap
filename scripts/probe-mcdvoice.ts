/**
 * Live reconnaissance for mcdvoice.com. A debugging tool kept in-repo, NOT a test.
 *
 *   npm run probe:mcdvoice -- --piecemeal --store 05678
 *   npm run probe:mcdvoice -- --code <26 digits> --stage-only
 *   npm run probe:mcdvoice -- --code <26 digits> --reuse-check
 *
 * --piecemeal   Walks the "no 26-digit code" path. Consumes NO real receipt
 *               code, so it is safe to run freely. This is what regenerates the
 *               parser fixtures.
 * --stage-only  The same walk with a real code. Submits nothing.
 * --reuse-check Enters a real code, advances two pages, closes the browser, then
 *               re-enters the SAME code in a fresh browser. This is the
 *               empirical test of the code-reuse assumption behind the replay
 *               path (plan §3.5 / §7.2).
 *
 * ==========================================================================
 * This script must NEVER submit.
 *
 * WARNING, from live recon on 2026-07-28: the plan's stop-rule ("walk while the
 * button reads Next") is NOT sufficient on the real site. The final question
 * page's button ALSO reads "Next", and clicking it submits the survey. An
 * earlier run of this script, following the plan exactly, walked the piecemeal
 * path to completion and SUBMITTED a fabricated survey (validation code
 * 6209701, store 05678).
 *
 * The walk is now additionally guarded by `advance()` refusing to click when
 * `#ProgressPercentage` reads 100%. That guard is PROVISIONAL — the progress bar
 * is known to be non-linear — and needs a decision from the user before
 * `--stage-only` is run against a real receipt code.
 * ==========================================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, closeBrowser } from '../lib/survey/browser';
import {
  InvalidCodeError,
  PageBlockedError,
  SubmitGuardError,
  advance,
  applyAnswers,
  enterCode,
  enterPieceMeal,
  isTerminalPage,
  readPage,
  submitButtonLabel,
} from '../lib/survey/mcdvoice';
import { suggestAnswers } from '../lib/survey/answerStrategy';
import type { StagedQuestion } from '../lib/types';

const MAX_PAGES = 40;
const OUT_DIR = path.join(process.cwd(), 'tmp', 'probe');

interface Args {
  piecemeal: boolean;
  stageOnly: boolean;
  reuseCheck: boolean;
  store: string;
  code: string | null;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  };
  return {
    piecemeal: argv.includes('--piecemeal'),
    stageOnly: argv.includes('--stage-only'),
    reuseCheck: argv.includes('--reuse-check'),
    store: get('--store') ?? '05678',
    code: get('--code'),
  };
}

function usage(): never {
  console.error(
    [
      'Usage:',
      '  npm run probe:mcdvoice -- --piecemeal [--store 05678]',
      '  npm run probe:mcdvoice -- --code <26 digits> --stage-only',
      '  npm run probe:mcdvoice -- --code <26 digits> --reuse-check',
    ].join('\n'),
  );
  process.exit(2);
}

interface PageRecord {
  pageIndex: number;
  url: string;
  progress: string | null;
  submitLabel: string | null;
  postedFns: string[];
  questions: StagedQuestion[];
}

/**
 * RECON ONLY. The answer strategy deliberately leaves questions blank rather
 * than guessing, which is correct for the app but stops the DOM mapping dead at
 * the first required question with no confident default. On the *piecemeal*
 * path the entire visit is fabricated and the survey is always abandoned before
 * submission, so filling blanks with the first option is harmless here and is
 * how the question flow gets mapped.
 *
 * This is NOT applied on `--stage-only`, where the answers are POSTed against
 * the user's real receipt code — there the probe behaves exactly like the app.
 */
function fillBlanksForRecon(questions: StagedQuestion[]): Record<string, string | string[] | null> {
  const out: Record<string, string | string[] | null> = {};
  for (const q of questions) {
    if (q.suggested !== null) {
      out[q.questionId] = q.suggested;
    } else if (q.inputType === 'radio_grid' || q.inputType === 'radio_list') {
      out[q.questionId] = q.options[0]?.value ?? null;
    } else {
      out[q.questionId] = null;
    }
  }
  return out;
}

/** Walk forward, stopping the instant the button is no longer "Next". */
async function walk(
  page: import('playwright').Page,
  reconFill: boolean,
  maxPages = MAX_PAGES,
): Promise<{ pages: PageRecord[]; terminalLabel: string | null; blocked: boolean }> {
  const pages: PageRecord[] = [];
  let terminalLabel: string | null = null;
  let blocked = false;

  for (let i = 0; i < maxPages; i++) {
    const read = await readPage(page, i);
    const questions = suggestAnswers(read.questions);

    fs.writeFileSync(path.join(OUT_DIR, `page-${String(i).padStart(2, '0')}.html`), read.html);
    fs.writeFileSync(
      path.join(OUT_DIR, `page-${String(i).padStart(2, '0')}.png`),
      read.screenshot,
    );

    pages.push({
      pageIndex: i,
      url: read.url,
      progress: read.progress,
      submitLabel: read.submitLabel,
      postedFns: read.postedFns,
      questions,
    });

    const flagged = questions.filter((q) => q.needsUser).length;
    console.log(
      `  page ${String(i).padStart(2)} | ${String(read.progress ?? '?').padStart(4)} | ` +
        `btn="${read.submitLabel}" | ${questions.length} question(s)` +
        `${flagged ? `, ${flagged} needing the user` : ''}`,
    );
    for (const q of questions) {
      const suggestion = Array.isArray(q.suggested)
        ? q.suggested.join(',')
        : (q.suggested ?? '—');
      const optLabel =
        q.options.find((o) => o.value === q.suggested)?.label ?? (q.suggested ? '' : 'BLANK');
      console.log(
        `        ${q.questionId} [${q.inputType}] "${q.prompt.slice(0, 72)}"` +
          ` -> ${suggestion}${optLabel ? ` (${optLabel})` : ''}`,
      );
    }

    if (await isTerminalPage(page)) {
      terminalLabel = await submitButtonLabel(page);
      console.log(
        `\n  TERMINAL PAGE reached — button reads "${terminalLabel}". ` +
          'Stopping without clicking it.',
      );
      break;
    }

    const toApply = reconFill
      ? fillBlanksForRecon(questions)
      : Object.fromEntries(questions.map((q) => [q.questionId, q.suggested]));
    await applyAnswers(page, questions, toApply);

    try {
      await advance(page, i);
    } catch (err) {
      if (err instanceof PageBlockedError) {
        console.log(`\n  BLOCKED on page ${i}: ${err.message}`);
        blocked = true;
        break;
      }
      if (err instanceof SubmitGuardError) {
        // Expected, and the whole point: the walk stops rather than submitting.
        console.log(`\n  STOPPED before submission on page ${i}: ${err.message}`);
        terminalLabel = await submitButtonLabel(page);
        break;
      }
      throw err;
    }
  }

  return { pages, terminalLabel, blocked };
}

async function runWalk(args: Args) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const bundle = await launchBrowser();
  try {
    if (args.piecemeal) {
      console.log(`Entering via the piecemeal (no-code) path, store ${args.store}…\n`);
      await enterPieceMeal(bundle.page, {
        storeNumber: args.store,
        registerNumber: '1',
        orderNumber: '1',
        totalAmount: 5.99,
      });
    } else {
      console.log('Entering the 26-digit survey code…\n');
      await enterCode(bundle.page, args.code!);
    }

    const { pages, terminalLabel, blocked } = await walk(bundle.page, args.piecemeal);

    const summary = {
      mode: args.piecemeal ? 'piecemeal' : 'stage-only',
      store: args.piecemeal ? args.store : undefined,
      capturedAt: new Date().toISOString(),
      pageCount: pages.length,
      terminalButtonLabel: terminalLabel,
      blocked,
      submitted: false,
      pages,
    };
    fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

    console.log(`\nWrote ${pages.length} page(s) + summary.json to ${OUT_DIR}`);
    console.log('Nothing was submitted.');
  } finally {
    await closeBrowser(bundle);
  }
}

/**
 * The empirical test of the code-reuse assumption. Requires a real receipt code
 * and should be run by the user, not automatically.
 */
async function runReuseCheck(code: string) {
  console.log('CODE-REUSE CHECK');
  console.log('This enters your real code, advances two pages, abandons the session,');
  console.log('then tries the SAME code again in a fresh browser. Nothing is submitted.\n');

  let first = await launchBrowser();
  try {
    await enterCode(first.page, code);
    console.log('  pass 1: code accepted.');
    for (let i = 0; i < 2; i++) {
      const read = await readPage(first.page, i);
      const questions = suggestAnswers(read.questions);
      if (await isTerminalPage(first.page)) break;
      await applyAnswers(
        first.page,
        questions,
        Object.fromEntries(questions.map((q) => [q.questionId, q.suggested])),
      );
      await advance(first.page, i);
      console.log(`  pass 1: advanced past page ${i}.`);
    }
  } finally {
    await closeBrowser(first);
    console.log('  pass 1: browser closed, survey abandoned mid-walk.\n');
  }

  const second = await launchBrowser();
  try {
    await enterCode(second.page, code);
    console.log('  pass 2: the SAME code was ACCEPTED after abandonment.');
    console.log('\nRESULT: code reuse WORKS. The replay path in §3.5 is safe.');
    console.log('Record this at the top of lib/survey/mcdvoice.ts.');
  } catch (err) {
    if (err instanceof InvalidCodeError) {
      console.log('  pass 2: the same code was REJECTED.');
      console.log('\nRESULT: code reuse DOES NOT WORK. The replay path must not be trusted —');
      console.log('editing answers after staging would burn the code. Record this at the top');
      console.log('of lib/survey/mcdvoice.ts and re-think §3.5 before relying on replay.');
      process.exitCode = 1;
    } else {
      throw err;
    }
  } finally {
    await closeBrowser(second);
  }
  void first;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.piecemeal) {
    await runWalk(args);
    return;
  }

  if (!args.code || !/^\d{26}$/.test(args.code)) {
    console.error('--code must be exactly 26 digits.\n');
    usage();
  }
  if (args.reuseCheck) {
    await runReuseCheck(args.code);
    return;
  }
  if (args.stageOnly) {
    await runWalk(args);
    return;
  }
  usage();
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
  process.exit(1);
});
