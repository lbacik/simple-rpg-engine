// Low-level YAML handling for the Package validation phase
// (docs/spec/validation.md, codes package/yaml-syntax,
// package/multiple-documents, package/forbidden-yaml, package/duplicate-key).
//
// Positions come from `yaml` node ranges via LineCounter; lines and columns
// are 1-based.

import {
  LineCounter,
  isAlias,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  parseAllDocuments,
} from 'yaml';
import type { Document } from 'yaml';
import type { Diagnostic, DiagnosticRange } from './diagnostic';

export type ParsedYaml = {
  docs: Document[];
  lineCounter: LineCounter;
};

export function offsetsToRange(
  lineCounter: LineCounter,
  start: number,
  end: number,
): DiagnosticRange {
  const s = lineCounter.linePos(start);
  const e = lineCounter.linePos(Math.max(end, start));
  return { line: s.line, column: s.col, endLine: e.line, endColumn: e.col };
}

/** Zero-length range pointing at one offset (used for multi-document starts). */
export function pointRange(lineCounter: LineCounter, offset: number): DiagnosticRange {
  const p = lineCounter.linePos(offset);
  return { line: p.line, column: p.col, endLine: p.line, endColumn: p.col };
}

/** Range of a `yaml` node, or undefined when the node carries none. */
export function nodeRange(node: unknown, lineCounter: LineCounter): DiagnosticRange | undefined {
  if (typeof node !== 'object' || node === null) return undefined;
  const range = (node as { range?: readonly number[] | null }).range;
  if (!range || range[0] == null) return undefined;
  return offsetsToRange(lineCounter, range[0], range[1] ?? range[0]);
}

/**
 * Parse one YAML source text and collect every file-level Package finding:
 * syntax errors, multiple documents, forbidden YAML constructs and duplicate
 * keys. Returns the parsed documents for the caller's semantic checks.
 */
export function parseYamlText(
  source: string,
  file: string,
  push: (diagnostic: Diagnostic) => void,
): ParsedYaml {
  const lineCounter = new LineCounter();
  let docs: Document[];
  try {
    // uniqueKeys/stric handling is done by hand below so that each construct
    // maps to its own stable package/ code with a precise position.
    docs = parseAllDocuments(source, { lineCounter, uniqueKeys: false, strict: false });
  } catch (error) {
    push({
      severity: 'error',
      code: 'package/yaml-syntax',
      message: error instanceof Error ? error.message : 'file is not parsable YAML',
      file,
      range: { line: 1, column: 1, endLine: 1, endColumn: 1 },
    });
    return { docs: [], lineCounter };
  }

  for (const doc of docs) {
    for (const error of doc.errors) {
      const pos = error.pos ?? [0, 0];
      push({
        severity: 'error',
        code: 'package/yaml-syntax',
        message: error.message,
        file,
        range: offsetsToRange(lineCounter, pos[0] ?? 0, pos[1] ?? pos[0] ?? 0),
      });
    }
  }

  if (docs.length > 1) {
    const start = docs[1].range?.[0] ?? 0;
    push({
      severity: 'error',
      code: 'package/multiple-documents',
      message: `file contains ${docs.length} YAML documents; exactly one document is allowed per file`,
      file,
      range: pointRange(lineCounter, start),
    });
  }

  for (const doc of docs) {
    if (doc.contents) {
      collectForbiddenYaml(doc.contents, file, lineCounter, push);
      collectDuplicateKeys(doc.contents, file, lineCounter, push);
    }
  }

  return { docs, lineCounter };
}

function walk(node: unknown, visit: (node: unknown) => void): void {
  if (!isNode(node) && !isPair(node)) return;
  visit(node);
  if (isPair(node)) {
    walk(node.key, visit);
    walk(node.value, visit);
    return;
  }
  if (isMap(node)) {
    for (const item of node.items) walk(item, visit);
    return;
  }
  if (isSeq(node)) {
    for (const item of node.items) walk(item, visit);
  }
}

function collectForbiddenYaml(
  root: unknown,
  file: string,
  lineCounter: LineCounter,
  push: (diagnostic: Diagnostic) => void,
): void {
  walk(root, (node) => {
    if (isPair(node)) {
      if (isScalar(node.key) && node.key.value === '<<') {
        push({
          severity: 'error',
          code: 'package/forbidden-yaml',
          message: 'YAML merge keys (<<) are not allowed in Scenario files',
          file,
          range: nodeRange(node.key, lineCounter),
        });
      }
      return;
    }
    if (isAlias(node)) {
      push({
        severity: 'error',
        code: 'package/forbidden-yaml',
        message: 'YAML aliases are not allowed in Scenario files',
        file,
        range: nodeRange(node, lineCounter),
      });
      return;
    }
    if (isNode(node)) {
      const anchor = (node as { anchor?: unknown }).anchor;
      if (typeof anchor === 'string' && anchor.length > 0) {
        // The anchor token itself is not part of the node range, so this
        // points at the anchored value on the same line.
        push({
          severity: 'error',
          code: 'package/forbidden-yaml',
          message: `YAML anchor "&${anchor}" is not allowed in Scenario files`,
          file,
          range: nodeRange(node, lineCounter),
        });
      }
      const tag = node.tag;
      if (typeof tag === 'string' && tag.startsWith('!')) {
        // Explicit standard tags (!!str) resolve to tag:yaml.org,2002:* and
        // are allowed; anything starting with '!' here is a custom tag.
        // The tag token itself is not part of the node range, so this points
        // at the tagged value on the same line.
        push({
          severity: 'error',
          code: 'package/forbidden-yaml',
          message: `YAML custom tag "${tag}" is not allowed in Scenario files`,
          file,
          range: nodeRange(node, lineCounter),
        });
      }
    }
  });
}

function collectDuplicateKeys(
  root: unknown,
  file: string,
  lineCounter: LineCounter,
  push: (diagnostic: Diagnostic) => void,
): void {
  walk(root, (node) => {
    if (!isMap(node)) return;
    const seen = new Set<string>();
    for (const item of node.items) {
      if (!isPair(item)) continue;
      const key = item.key;
      if (
        !isScalar(key) ||
        (typeof key.value !== 'string' &&
          typeof key.value !== 'number' &&
          typeof key.value !== 'boolean') ||
        key.value === '<<'
      ) {
        continue;
      }
      const name = `${typeof key.value}:${String(key.value)}`;
      if (seen.has(name)) {
        push({
          severity: 'error',
          code: 'package/duplicate-key',
          message: `duplicate mapping key "${String(key.value)}"`,
          file,
          range: nodeRange(key, lineCounter),
        });
      } else {
        seen.add(name);
      }
    }
  });
}
