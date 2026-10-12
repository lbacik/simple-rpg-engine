// The Diagnostic format from docs/spec/validation.md. Shared by the CLI and
// the app's startup collection loading (see docs/spec/architecture.md).

export type DiagnosticRange = {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
};

export type Diagnostic = {
  severity: 'error' | 'warning';
  /** Stable rule id with a phase prefix, e.g. 'ref/unknown-scene'. */
  code: string;
  /** English message naming the IDs involved. */
  message: string;
  /** Path relative to the Scenario directory. */
  file?: string;
  /** From `yaml` node ranges and LineCounter; lines and columns are 1-based. */
  range?: DiagnosticRange;
  /** Path within the document, e.g. ['choices', 2, 'outcome', 'next']. */
  path?: (string | number)[];
  /** e.g. "first declared here" for duplicate-ID diagnostics. */
  related?: { file: string; range?: DiagnosticRange; message: string }[];
  /**
   * The Translation manifest's path, set on every diagnostic about a
   * Translation (docs/spec/validation.md, Translations). It is the manifest
   * path because the path exists even when the Translation's `language`
   * cannot be read.
   */
  translation?: string;
};
