// Narration rendering tests: the Markdown subset from
// docs/spec/scenario-format.md (narration format) — paragraphs, bold and
// italic with CommonMark semantics, soft breaks as spaces, everything else
// literal with HTML escaped — plus the single {name} interpolation.

import { describe, expect, it } from 'vitest';
import { renderNarration, renderStoredText } from '../src/engine/narration';

describe('renderNarration paragraphs', () => {
  it('wraps a single paragraph in <p>', () => {
    expect(renderNarration('Hello, woods.', 'Robin')).toBe('<p>Hello, woods.</p>');
  });

  it('splits paragraphs on a blank line', () => {
    expect(renderNarration('First.\n\nSecond.', 'Robin')).toBe('<p>First.</p>\n<p>Second.</p>');
  });

  it('treats a whitespace-only line as a blank line', () => {
    expect(renderNarration('First.\n   \nSecond.', 'Robin')).toBe('<p>First.</p>\n<p>Second.</p>');
  });

  it('renders a single newline inside a paragraph as a space', () => {
    expect(renderNarration('leaves murmur,\nand almost sound like words.', 'Robin')).toBe(
      '<p>leaves murmur, and almost sound like words.</p>',
    );
  });
});

describe('renderNarration emphasis', () => {
  it('renders **bold** and *italic* with asterisks', () => {
    expect(renderNarration('The **slab** shifts and *groans*.', 'Robin')).toBe(
      '<p>The <strong>slab</strong> shifts and <em>groans</em>.</p>',
    );
  });

  it('renders __bold__ and _italic_ with underscores', () => {
    expect(renderNarration('The __slab__ shifts and _groans_.', 'Robin')).toBe(
      '<p>The <strong>slab</strong> shifts and <em>groans</em>.</p>',
    );
  });

  it('leaves intra-word underscores literal', () => {
    expect(renderNarration('snake_case stays literal.', 'Robin')).toBe(
      '<p>snake_case stays literal.</p>',
    );
  });

  it('leaves unmatched delimiters literal', () => {
    expect(renderNarration('A lone * star and ** pair.', 'Robin')).toBe(
      '<p>A lone * star and ** pair.</p>',
    );
  });

  it('nests emphasis', () => {
    expect(renderNarration('*a **b** c*', 'Robin')).toBe('<p><em>a <strong>b</strong> c</em></p>');
  });
});

describe('renderNarration literal text', () => {
  it('escapes HTML', () => {
    expect(renderNarration('A <b>bold</b> & "quoted" claim.', 'Robin')).toBe(
      '<p>A &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot; claim.</p>',
    );
  });

  it('shows headings, links and lists literally', () => {
    expect(renderNarration('# Title\n\n[link](https://x.example)\n\n- item', 'Robin')).toBe(
      '<p># Title</p>\n<p>[link](https://x.example)</p>\n<p>- item</p>',
    );
  });
});

describe('renderNarration {name} interpolation', () => {
  it('substitutes the character name', () => {
    expect(renderNarration('You are all we have, {name}.', 'Robin')).toBe(
      '<p>You are all we have, Robin.</p>',
    );
  });

  it('shows a markup-bearing name literally, with no HTML or emphasis', () => {
    expect(renderNarration('You are all we have, {name}.', '<b>*Ann*</b>')).toBe(
      '<p>You are all we have, &lt;b&gt;*Ann*&lt;/b&gt;.</p>',
    );
  });

  it('substitutes every occurrence', () => {
    expect(renderNarration('{name} hears {name}.', 'Robin')).toBe('<p>Robin hears Robin.</p>');
  });
});

describe('renderStoredText', () => {
  it('renders journal text with the name kept literal', () => {
    expect(renderStoredText('You are all we have, <b>*Ann*</b>.', '<b>*Ann*</b>')).toBe(
      '<p>You are all we have, &lt;b&gt;*Ann*&lt;/b&gt;.</p>',
    );
  });

  it('still renders emphasis around the name', () => {
    expect(renderStoredText('Brave *Robin* stands.', 'Robin')).toBe(
      '<p>Brave <em>Robin</em> stands.</p>',
    );
  });
});
