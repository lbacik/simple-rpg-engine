// Validation CLI: `npm run validate <scenario-dir> [--json]` (run through
// tsx). Validates one Scenario package; see docs/spec/validation.md ("CLI").

import process from 'node:process';
import { loadScenario } from '../content';
import type { Diagnostic } from '../content';

function usage(): string {
  return 'Usage: npm run validate <scenario-dir> [--json]';
}

function formatDiagnostic(dir: string, diagnostic: Diagnostic): string {
  let location = '';
  if (diagnostic.file) location += `${dir}/${diagnostic.file}`;
  if (diagnostic.range) {
    location += `${location ? ':' : ''}${diagnostic.range.line}:${diagnostic.range.column}`;
  }
  const body = `${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`;
  return location ? `${location} ${body}` : body;
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return 0;
  }
  const json = argv.includes('--json');
  const positional = argv.filter((arg) => arg !== '--json');
  const unknown = positional.find((arg) => arg.startsWith('-'));
  if (unknown !== undefined) {
    console.error(`Unknown option: ${unknown}\n${usage()}`);
    return 2;
  }
  if (positional.length !== 1) {
    console.error(usage());
    return 2;
  }
  const dir = positional[0] as string;

  const result = loadScenario(dir);
  const diagnostics = result.ok ? result.warnings : result.diagnostics;

  // One summary entry per rejected Translation, in listing order.
  const rejected: { manifestPath: string; language?: string }[] = [];
  for (const entry of result.rejectedTranslations) {
    if (!rejected.some((known) => known.manifestPath === entry.manifestPath)) {
      rejected.push({ manifestPath: entry.manifestPath, language: entry.language });
    }
  }
  const rejectionSuffix = rejected
    .map((entry) => `; Translation ${entry.manifestPath} (${entry.language ?? 'unknown'}) rejected`)
    .join('');

  if (json) {
    console.log(JSON.stringify(diagnostics, null, 2));
  } else {
    for (const diagnostic of diagnostics) console.log(formatDiagnostic(dir, diagnostic));
    const errors = diagnostics.filter((d) => d.severity === 'error').length;
    const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
    console.log(
      `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}${rejectionSuffix}`,
    );
  }

  return diagnostics.some((d) => d.severity === 'error') ? 1 : 0;
}

process.exitCode = main();
