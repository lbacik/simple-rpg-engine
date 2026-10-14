// Variant A "Illustrated chronicle" chrome (docs/spec/ui.md, game screen):
// the shared Interface Text the layout introduces lives in the typed
// catalogue in English and Polish.

import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

describe('chronicle layout catalogue', () => {
  it('names the adventure header, current scene and decisions prompt', () => {
    expect(en.game.adventure).toBe('Your adventure');
    expect(en.game.currentScene).toBe('Current scene');
    expect(en.game.decide).toBe('What do you do next?');
    expect(pl.game.adventure).toBe('Twoja przygoda');
    expect(pl.game.currentScene).toBe('Bieżąca scena');
    expect(pl.game.decide).toBe('Co robisz dalej?');
  });

  it('offers the compact map expansion in both languages', () => {
    expect(en.map.expand).toBe('Expand map');
    expect(pl.map.expand).toBe('Powiększ mapę');
  });
});
