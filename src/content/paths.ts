// Shared path predicates for manifest listings (docs/spec/scenario-format.md,
// Manifest file lists and paths) and image declarations (Images).
//
// Absolute paths, `..` segments, URLs, and symlinks that resolve outside the
// Scenario directory are forbidden in both places, so both phases share these
// helpers instead of importing them from a phase module.

import fs from 'node:fs';
import path from 'node:path';

export function isAbsolutePath(value: string): boolean {
  return path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value);
}

export function isUrl(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
}

export function hasDotDot(value: string): boolean {
  return value.split(/[\\/]/).includes('..');
}

/** Normalize a listed path for duplicate-file comparison. */
export function normalizeListedPath(value: string): string {
  return path.posix.normalize(value.replace(/^(?:\.\/)+/, ''));
}

/**
 * True when the leaf or any ancestor directory of the relative path is a
 * symlink resolving outside the Scenario directory. Missing components and
 * unreadable links return false; the missing-file rules report those.
 */
export function symlinkEscapesDir(scenarioDir: string, relPath: string): boolean {
  const parts = relPath.split(/[\\/]/).filter((part) => part !== '' && part !== '.');
  let current = scenarioDir;
  for (const part of parts) {
    current = path.join(current, part);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch {
      return false;
    }
    if (!stat.isSymbolicLink()) continue;
    let target: string;
    try {
      target = path.resolve(path.dirname(current), fs.readlinkSync(current));
    } catch {
      return false;
    }
    const relative = path.relative(scenarioDir, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return true;
    }
    current = target;
  }
  return false;
}
