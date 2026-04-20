#!/usr/bin/env node
'use strict';

/**
 * PRGuardian CLI
 * 
 * Usage:
 *   node analyze.js <diff_file>              — Analyze a diff file or JSON input
 *   node analyze.js --pr owner/repo#123      — Fetch and analyze a GitHub PR
 *   cat diff | node analyze.js --stdin       — Read diff from stdin
 *   node analyze.js <diff_file> --json       — Output JSON instead of markdown
 *   node analyze.js <diff_file> --verbose    — Verbose logging
 *   node analyze.js <diff_file> --log        — Persist logs to logs/ directory
 * 
 * Exit codes:
 *   0 — MERGE
 *   1 — MERGE_WITH_CONDITIONS
 *   2 — DO_NOT_MERGE
 *   3 — Error
 */

const fs = require('fs');
const path = require('path');
const { analyze } = require('./src/index');
const { parseInputFile } = require('./src/analyzers/diff-parser');

// ── Parse CLI Arguments ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  logToFile: args.includes('--log'),
  stdin: args.includes('--stdin'),
  pr: null,
  file: null,
  help: args.includes('--help') || args.includes('-h')
};

// Extract --pr value
const prIdx = args.indexOf('--pr');
if (prIdx !== -1 && args[prIdx + 1]) {
  flags.pr = args[prIdx + 1];
}

// Extract file path (first non-flag argument)
for (const arg of args) {
  if (!arg.startsWith('-')) {
    // Skip if this is the value after --pr
    if (prIdx !== -1 && args.indexOf(arg) === prIdx + 1) continue;
    flags.file = arg;
    break;
  }
}

// ── Help ─────────────────────────────────────────────────────────────────────

if (flags.help) {
  console.log(`
╔══════════════════════════════════════════════════════╗
║           🛡️  PRGuardian — CLI                       ║
║      Merge Consequence Intelligence                  ║
╚══════════════════════════════════════════════════════╝

Usage:
  node analyze.js <diff_file>              Analyze a diff file or JSON input
  node analyze.js --pr owner/repo#123      Fetch and analyze a GitHub PR
  cat diff | node analyze.js --stdin       Read diff from stdin

Options:
  --json       Output structured JSON instead of markdown
  --verbose    Enable verbose debug logging
  --log        Persist logs to logs/ directory
  --help       Show this help message

Exit codes:
  0 — MERGE
  1 — MERGE_WITH_CONDITIONS
  2 — DO_NOT_MERGE
  3 — Error

Examples:
  node analyze.js my-pr.diff
  node analyze.js demo/sample_pr.json --json
  node analyze.js --pr facebook/react#12345
  git diff main..feature | node analyze.js --stdin
`);
  process.exit(0);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    let input;

    if (flags.pr) {
      // ── GitHub PR Mode ────────────────────────────────────────────────
      console.log(`[PRGuardian] Fetching PR: ${flags.pr}`);
      const { fetchPR } = require('./src/github/pr-fetcher');
      input = await fetchPR(flags.pr);

    } else if (flags.stdin) {
      // ── Stdin Mode ────────────────────────────────────────────────────
      const content = await readStdin();
      input = parseInputFile(content);

    } else if (flags.file) {
      // ── File Mode ─────────────────────────────────────────────────────
      const filePath = path.resolve(flags.file);

      if (!fs.existsSync(filePath)) {
        console.error(`[PRGuardian] Error: File not found: ${filePath}`);
        process.exit(3);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      input = parseInputFile(content);

    } else {
      console.error('[PRGuardian] Error: No input provided. Use --help for usage.');
      process.exit(3);
    }

    // ── Run Analysis ──────────────────────────────────────────────────────
    const result = await analyze(input, {
      verbose: flags.verbose,
      logToFile: flags.logToFile,
      jsonOutput: flags.json
    });

    // ── Output ────────────────────────────────────────────────────────────
    if (flags.json) {
      // JSON output mode
      const jsonOutput = {
        recommendation: result.recommendation,
        risk_score: result.risk_score,
        confidence_level: result.confidence_level,
        blocking_issues: result.blocking_issues,
        deterministic_signals: result.deterministic_signals,
        metadata: result._metadata
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      // Markdown output mode (default)
      console.log('');
      console.log(result.merge_brief);
    }

    // ── Exit Code ─────────────────────────────────────────────────────────
    const exitCodes = { 'MERGE': 0, 'MERGE_WITH_CONDITIONS': 1, 'DO_NOT_MERGE': 2 };
    process.exit(exitCodes[result.recommendation] ?? 3);

  } catch (err) {
    console.error(`[PRGuardian] Fatal error: ${err.message}`);
    if (flags.verbose) {
      console.error(err.stack);
    }
    process.exit(3);
  }
}

/**
 * Read all content from stdin.
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
    // Timeout after 10 seconds
    setTimeout(() => {
      if (data.length === 0) {
        reject(new Error('No input received on stdin within 10 seconds.'));
      } else {
        resolve(data);
      }
    }, 10000);
  });
}

main();
