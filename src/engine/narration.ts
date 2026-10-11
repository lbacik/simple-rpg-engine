// Narration rendering: the Markdown subset from
// docs/spec/scenario-format.md (narration format).
//
// Paragraphs separated by a blank line; a single newline inside a paragraph
// is a soft break rendered as a space. Inline, only **bold** and *italic*
// (with `*` or `_`, CommonMark delimiter semantics) are recognised.
// Everything else — headings, links, lists, raw HTML — is shown literally,
// with HTML escaped. The single interpolation `{name}` is substituted as
// plain text: delimiter characters in the Character's name never form
// emphasis and its angle brackets never form tags, while authored markup
// around the placeholder still applies.
//
// Both entry points substitute through a sentinel: the name is swapped for
// U+0000 before emphasis parsing and the escaped name is inserted afterwards,
// so the name's own characters are never parsed. `renderNarration` works from
// the authored source; `renderStoredText` re-renders Journal text that was
// already stored with the name substituted ("the text as presented").

const NAME_SENTINEL = '\0';

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Substitute `{name}` with the raw name for Journal storage. */
export function substituteName(source: string, characterName: string): string {
  return source.split('{name}').join(characterName);
}

/** Render authored narration source with the Character's name substituted. */
export function renderNarration(source: string, characterName: string): string {
  return renderWithSentinel(source.split('{name}').join(NAME_SENTINEL), characterName);
}

/**
 * Re-render Journal text that already holds the substituted name. The name
 * occurrences are located verbatim and hidden behind the sentinel, so they
 * stay literal even when they contain markup characters.
 */
export function renderStoredText(stored: string, characterName: string): string {
  if (characterName === '') return renderParagraphs(stored);
  return renderWithSentinel(stored.split(characterName).join(NAME_SENTINEL), characterName);
}

function renderWithSentinel(marked: string, characterName: string): string {
  const html = renderParagraphs(marked);
  return html.split(NAME_SENTINEL).join(escapeHtml(characterName));
}

/** Split into paragraphs, render soft breaks and emphasis per paragraph. */
function renderParagraphs(marked: string): string {
  const paragraphs = marked
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  return paragraphs
    .map((paragraph) => `<p>${renderInline(paragraph.replaceAll(/[ \t]*\n[ \t]*/g, ' '))}</p>`)
    .join('\n');
}

type DelimiterChar = '*' | '_';

type Token =
  | { kind: 'text'; value: string }
  | {
      kind: 'delim';
      char: DelimiterChar;
      length: number;
      remaining: number;
      canOpen: boolean;
      canClose: boolean;
      active: boolean;
      opens: Array<{ closer: number; count: 1 | 2 }>;
      closes: Array<{ opener: number; count: 1 | 2 }>;
    };

function isWhitespace(char: string | undefined): boolean {
  return (
    char === undefined ||
    char === ' ' ||
    char === '\t' ||
    char === '\n' ||
    char === '\r' ||
    char === '\f'
  );
}

function isAsciiPunctuation(char: string | undefined): boolean {
  return char !== undefined && /^[!-/:-@[-`{-~]$/u.test(char);
}

/** Inline emphasis with CommonMark delimiter semantics (simplified). */
function renderInline(paragraph: string): string {
  const tokens: Token[] = [];
  let i = 0;
  const chars = [...paragraph];
  while (i < chars.length) {
    const char = chars[i] as string;
    if (char === '*' || char === '_') {
      let length = 1;
      while (chars[i + length] === char) length += 1;
      const before = i === 0 ? undefined : chars[i - 1];
      const after = i + length >= chars.length ? undefined : chars[i + length];
      const leftFlanking =
        !isWhitespace(after) &&
        (!isAsciiPunctuation(after) || isWhitespace(before) || isAsciiPunctuation(before));
      const rightFlanking =
        !isWhitespace(before) &&
        (!isAsciiPunctuation(before) || isWhitespace(after) || isAsciiPunctuation(after));
      let canOpen: boolean;
      let canClose: boolean;
      if (char === '*') {
        canOpen = leftFlanking;
        canClose = rightFlanking;
      } else {
        canOpen = leftFlanking && (!rightFlanking || isAsciiPunctuation(before));
        canClose = rightFlanking && (!leftFlanking || isAsciiPunctuation(after));
      }
      tokens.push({
        kind: 'delim',
        char: char as DelimiterChar,
        length,
        remaining: length,
        canOpen,
        canClose,
        active: true,
        opens: [],
        closes: [],
      });
      i += length;
    } else {
      let end = i + 1;
      while (end < chars.length && chars[end] !== '*' && chars[end] !== '_') end += 1;
      tokens.push({ kind: 'text', value: chars.slice(i, end).join('') });
      i = end;
    }
  }

  const delimIndexes = tokens.flatMap((token, index) => (token.kind === 'delim' ? [index] : []));
  const bottom: Record<DelimiterChar, number> = { '*': -1, '_': -1 };

  for (const closerIdx of delimIndexes) {
    const closer = tokens[closerIdx];
    if (closer.kind !== 'delim' || !closer.canClose) continue;
    while (closer.remaining > 0) {
      let openerIdx = -1;
      const closerRank = delimIndexes.indexOf(closerIdx);
      for (let k = closerRank - 1; k > bottom[closer.char]; k -= 1) {
        const candidateIdx = delimIndexes[k] as number;
        const candidate = tokens[candidateIdx];
        if (candidate.kind !== 'delim') continue;
        if (
          !candidate.active ||
          candidate.char !== closer.char ||
          !candidate.canOpen ||
          candidate.remaining === 0
        ) {
          continue;
        }
        openerIdx = candidateIdx;
        break;
      }
      if (openerIdx === -1) break;
      const opener = tokens[openerIdx];
      if (opener.kind !== 'delim') break;
      // Odd-match rule: when either side can both open and close, the run
      // sum must not be a multiple of 3 unless both runs are.
      if (
        (closer.canOpen || opener.canClose) &&
        (opener.length + closer.length) % 3 === 0 &&
        (opener.length % 3 !== 0 || closer.length % 3 !== 0)
      ) {
        bottom[closer.char] = delimIndexes.indexOf(openerIdx);
        continue;
      }
      const use: 1 | 2 = opener.remaining >= 2 && closer.remaining >= 2 ? 2 : 1;
      opener.remaining -= use;
      closer.remaining -= use;
      opener.opens.push({ closer: closerIdx, count: use });
      closer.closes.push({ opener: openerIdx, count: use });
      // An emphasis node removes the delimiters between its ends: unmatched
      // runs inside become literal text.
      const [from, to] = openerIdx < closerIdx ? [openerIdx, closerIdx] : [closerIdx, openerIdx];
      for (let k = from + 1; k < to; k += 1) {
        const inner = tokens[k];
        if (
          inner !== undefined &&
          inner.kind === 'delim' &&
          inner.active &&
          inner.remaining === inner.length
        ) {
          inner.active = false;
        }
      }
    }
  }

  let html = '';
  for (const token of tokens) {
    if (token.kind === 'text') {
      html += escapeHtml(token.value);
      continue;
    }
    // Deactivated runs and leftover lengths render literally.
    const literal = token.active ? token.remaining : token.length;
    const openTags = [...token.opens]
      .sort((a, b) => b.closer - a.closer)
      .map((m) => (m.count === 2 ? '<strong>' : '<em>'))
      .join('');
    const closeTags = token.closes.map((m) => (m.count === 2 ? '</strong>' : '</em>')).join('');
    html += openTags + closeTags + escapeHtml(token.char.repeat(literal));
  }
  return html;
}
