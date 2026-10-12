// PROTOTYPE — throwaway. Three Combat panel layouts for the question
// "how should the Combat screen look?", switchable via `?variant=` on the
// existing /play/[playthroughId] route (the `current` key is today's panel).
// Every variant follows the brief: Character ↔ Enemy on one line whose
// spacing shows the Range (Near = side by side, Far = full width), the
// actions below in four columns (Position, Fight, Items, Leave), and the
// Combat log last, newest first. They differ in everything else.
// Do not import from production code; fold the winner in properly.
// VERDICT (2026-10-12): variant C ("Arena, compact") chosen, scaled to A/B so
// the side panel stays visible; drop the column glyphs in the real panel.

import './combat-prototype.css';
import { renderNarration, type CombatAvailability, type CombatRoundView, type GameView } from '@/engine/index';
import { combatAction } from '@/app/lib/combat';

type CombatView = Extract<GameView, { kind: 'combat' }>;

export type VariantProps = {
  combat: CombatView;
  playthroughId: string;
  step: number;
  guardUp: boolean;
  rounds: CombatRoundView[];
  consumables: { itemId: string; name: string }[];
};

export const COMBAT_VARIANTS = [
  { key: 'current', name: 'Today’s panel' },
  { key: 'A', name: 'Duel track' },
  { key: 'B', name: 'Arcade HUD' },
  { key: 'C', name: 'Arena, compact' },
];

// ---------------------------------------------------------------------------
// Small shared helpers (data only; each variant owns its layout).

function groups(combat: CombatView, consumables: VariantProps['consumables']) {
  const byId = (id: CombatAvailability['id']): CombatAvailability =>
    combat.actions.find((a) => a.id === id) ?? { id, group: 'Leave', label: id, enabled: false };
  const items = consumables.map(
    (c) =>
      combat.actions.find((a) => a.id === 'use-item' && a.itemId === c.itemId) ?? {
        id: 'use-item' as const,
        group: 'Items' as const,
        label: `Use ${c.name}`,
        enabled: false,
        itemId: c.itemId,
      },
  );
  return [
    { title: 'Position', glyph: '⇆', actions: [byId('advance'), byId('fall-back')] },
    { title: 'Fight', glyph: '⚔', actions: [byId('attack'), byId('defend')] },
    { title: 'Items', glyph: '✚', actions: items, empty: 'No Consumables held.' },
    { title: 'Leave', glyph: '↩', actions: [byId('escape')] },
  ];
}

function ActionForm({
  availability,
  playthroughId,
  step,
  className,
  reasonClassName,
}: {
  availability: CombatAvailability;
  playthroughId: string;
  step: number;
  className: string;
  reasonClassName: string;
}) {
  if (!availability.enabled) {
    return (
      <div>
        <button className={className} type="button" disabled>
          {availability.label}
        </button>
        {availability.reason ? <div className={reasonClassName}>{availability.reason}</div> : null}
      </div>
    );
  }
  return (
    <form action={combatAction}>
      <input type="hidden" name="playthroughId" value={playthroughId} />
      <input type="hidden" name="expectedStep" value={step} />
      <input type="hidden" name="combat" value={availability.id} />
      {availability.itemId !== undefined ? <input type="hidden" name="item" value={availability.itemId} /> : null}
      <button className={className} type="submit">
        {availability.label}
      </button>
    </form>
  );
}

const pct = (h: number, max: number) => Math.max(0, Math.min(100, Math.round((h / max) * 100)));
const initial = (name: string) => name.trim().charAt(0).toUpperCase();
const ACTION_LABEL: Record<CombatRoundView['action'], string> = {
  advance: 'Advance',
  'fall-back': 'Fall back',
  attack: 'Attack',
  defend: 'Defend',
  'use-item': 'Item',
  escape: 'Escape',
};

function rollText(roll: CombatRoundView['rolls'][number], combat: CombatView) {
  const who = roll.side === 'character' ? combat.characterName : combat.enemy.name;
  return `${who}: ${roll.die1}+${roll.die2}+${roll.modifier} = ${roll.total} vs ${roll.target} — ${
    roll.hit ? (roll.damage > 0 ? `hit, ${roll.damage} Damage` : 'success') : 'miss'
  }`;
}

function Narration({ combat, className }: { combat: CombatView; className?: string }) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: renderNarration(combat.text, combat.characterName) }}
    />
  );
}

// ---------------------------------------------------------------------------
// Variant A — Duel track. A card-like track; tokens slide together at Near
// and to the edges at Far. Stat cards under each end, column cards for the
// actions, a timeline log with the latest round highlighted.

export function VariantA({ combat, playthroughId, step, guardUp, rounds, consumables }: VariantProps) {
  const near = combat.range === 'near';
  const log = [...rounds].reverse();
  return (
    <div className="pa">
      <h1>{combat.encounterName}</h1>
      <Narration combat={combat} />

      <section className="pa-track-card" aria-label="Range">
        <div className="pa-track-head">
          <span>Round {combat.round}</span>
          <span className={`pa-range-chip ${combat.range}`}>{near ? 'Near' : 'Far'}</span>
        </div>
        <div className={`pa-track ${combat.range}`}>
          <div className="pa-zone-labels" aria-hidden>
            <span>Far</span>
            <span>Near</span>
            <span>Far</span>
          </div>
          <div className="pa-line" aria-hidden>
            <span>{near ? '⚔' : 'out of melee reach'}</span>
          </div>
          <div className="pa-token char" title={combat.characterName}>
            {initial(combat.characterName)}
            {guardUp ? <span className="pa-guard" title="Guard up">🛡</span> : null}
          </div>
          <div className="pa-token enemy" title={combat.enemy.name}>
            {initial(combat.enemy.name)}
          </div>
        </div>
        <div className="pa-stats">
          <div>
            <strong>{combat.characterName}</strong>
            {guardUp ? <span className="pa-badge">Guard up</span> : null}
            <Bar health={combat.character.health} max={combat.character.maxHealth} />
            <div className="meta">
              {combat.character.weaponName} · {combat.character.reach} · Damage {combat.character.damage}
            </div>
          </div>
          <div className="right">
            <strong>{combat.enemy.name}</strong>
            <Bar health={combat.enemy.health} max={combat.enemy.maxHealth} />
            <div className="meta">
              {combat.enemy.reach} · Damage {combat.enemy.damage}
            </div>
          </div>
        </div>
      </section>

      <section className="pa-cols" aria-label="Actions">
        {groups(combat, consumables).map((g) => (
          <div key={g.title} className="pa-col">
            <h3>{g.title}</h3>
            {g.actions.length === 0 ? <p className="meta">{g.empty}</p> : null}
            {g.actions.map((a) => (
              <ActionForm
                key={`${a.id}-${a.itemId ?? ''}`}
                availability={a}
                playthroughId={playthroughId}
                step={step}
                className="button pa-btn"
                reasonClassName="pa-reason"
              />
            ))}
          </div>
        ))}
      </section>

      <section aria-label="Combat log">
        <h2 className="pa-h2">Log</h2>
        {log.length === 0 ? (
          <p className="meta">No rolls yet.</p>
        ) : (
          <ol className="pa-log">
            {log.map((round, i) => (
              <li key={round.round} className={i === 0 ? 'latest' : ''}>
                <span className="pa-round">R{round.round}</span>
                <div>
                  <div>{round.text}</div>
                  {round.rolls.map((roll, j) => (
                    <div key={j} className={`pa-roll ${roll.side} ${roll.hit ? 'hit' : 'miss'}`}>
                      {rollText(roll, combat)}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Bar({ health, max }: { health: number; max: number }) {
  const p = pct(health, max);
  return (
    <div className="pa-bar">
      <span className="track">
        <span className={p <= 34 ? 'fill low' : 'fill'} style={{ width: `${p}%` }} />
      </span>
      <span className="num">
        {health}/{max}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant B — Arcade HUD. Mirrored Health bars across the top (fighting-game
// style), a thin rail underneath with small tokens, the four groups as one
// ruled table, and a tabular log (Round | Action | Rolls).

export function VariantB({ combat, playthroughId, step, guardUp, rounds, consumables }: VariantProps) {
  const near = combat.range === 'near';
  const log = [...rounds].reverse();
  const cp = pct(combat.character.health, combat.character.maxHealth);
  const ep = pct(combat.enemy.health, combat.enemy.maxHealth);
  return (
    <div className="pb">
      <h1>{combat.encounterName}</h1>
      <Narration combat={combat} className="pb-narr" />

      <section className="pb-hud" aria-label="Combatants">
        <div className="pb-side">
          <div className="pb-name">
            {combat.characterName}
            {guardUp ? <span className="pb-guard">GUARD</span> : null}
          </div>
          <div className="pb-hp">
            <span className={cp <= 34 ? 'low' : ''} style={{ width: `${cp}%` }} />
          </div>
          <div className="pb-sub">
            {combat.character.health}/{combat.character.maxHealth} · {combat.character.weaponName} ·{' '}
            {combat.character.reach} · Dmg {combat.character.damage}
          </div>
        </div>
        <div className="pb-round">
          <small>Round</small>
          {combat.round}
        </div>
        <div className="pb-side right">
          <div className="pb-name">{combat.enemy.name}</div>
          <div className="pb-hp mirrored">
            <span className={ep <= 34 ? 'low' : ''} style={{ width: `${ep}%` }} />
          </div>
          <div className="pb-sub">
            {combat.enemy.health}/{combat.enemy.maxHealth} · {combat.enemy.reach} · Dmg {combat.enemy.damage}
          </div>
        </div>
      </section>

      <section className={`pb-rail ${combat.range}`} aria-label={`Range: ${near ? 'Near' : 'Far'}`}>
        <div className="pb-ticks" aria-hidden />
        <div className="pb-near-zone" aria-hidden>
          NEAR
        </div>
        <div className="pb-tok char">{initial(combat.characterName)}</div>
        <div className="pb-tok enemy">{initial(combat.enemy.name)}</div>
        <div className="pb-range-label">{near ? 'Near — melee range' : 'Far — out of melee range'}</div>
      </section>

      <section className="pb-table" aria-label="Actions">
        {groups(combat, consumables).map((g) => (
          <div key={g.title} className="pb-col">
            <h3>{g.title}</h3>
            {g.actions.length === 0 ? <p className="pb-reason">{g.empty}</p> : null}
            {g.actions.map((a) => (
              <ActionForm
                key={`${a.id}-${a.itemId ?? ''}`}
                availability={a}
                playthroughId={playthroughId}
                step={step}
                className={a.id === 'attack' ? 'pb-btn primary' : 'pb-btn'}
                reasonClassName="pb-reason"
              />
            ))}
          </div>
        ))}
      </section>

      <section aria-label="Combat log">
        <table className="pb-log">
          <thead>
            <tr>
              <th>#</th>
              <th>Action</th>
              <th>What happened</th>
              <th>Rolls</th>
            </tr>
          </thead>
          <tbody>
            {log.length === 0 ? (
              <tr>
                <td colSpan={4} className="pb-reason">
                  No rolls yet.
                </td>
              </tr>
            ) : (
              log.map((round, i) => (
                <tr key={round.round} className={i === 0 ? 'latest' : ''}>
                  <td>{round.round}</td>
                  <td>
                    {ACTION_LABEL[round.action]}
                    <div className="pb-reason">
                      {round.rangeBefore === round.rangeAfter
                        ? round.rangeAfter
                        : `${round.rangeBefore} → ${round.rangeAfter}`}
                    </div>
                  </td>
                  <td>{round.text}</td>
                  <td className="pb-dice">
                    {round.rolls.map((roll, j) => (
                      <div key={j} className={roll.hit ? 'hit' : 'miss'}>
                        {roll.side === 'character' ? 'You' : initial(combat.enemy.name)} {roll.die1}+{roll.die2}+
                        {roll.modifier}={roll.total}/{roll.target} {roll.hit ? (roll.damage > 0 ? `✓ ${roll.damage}` : '✓') : '✗'}
                      </div>
                    ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant C — Arena (compact). Medallions with a Health ring on a small
// arena, action tiles, and a "last round" callout above the older log.
// Scaled to A/B so the side panel stays visible.

export function VariantC({ combat, playthroughId, step, guardUp, rounds, consumables }: VariantProps) {
  const near = combat.range === 'near';
  const [latest, ...older] = [...rounds].reverse();
  return (
    <div className="pc">
      <header className="pc-head">
        <div>
          <div className="pc-kicker">
            Combat · {combat.locationName} · Round {combat.round}
          </div>
          <h1>{combat.encounterName}</h1>
        </div>
        <Narration combat={combat} className="pc-narr" />
      </header>

      <section className={`pc-arena ${combat.range}`} aria-label={`Range: ${near ? 'Near' : 'Far'}`}>
        <div className="pc-ground" aria-hidden />
        <div className="pc-gap" aria-hidden>
          {near ? <span className="pc-clash">⚔</span> : <span className="pc-far">‹ — — &nbsp;Far&nbsp; — — ›</span>}
        </div>
        <Medallion
          side="char"
          name={combat.characterName}
          health={combat.character.health}
          max={combat.character.maxHealth}
          detail={`${combat.character.weaponName} · ${combat.character.reach} · ${combat.character.damage} dmg`}
          guard={guardUp}
        />
        <Medallion
          side="enemy"
          name={combat.enemy.name}
          health={combat.enemy.health}
          max={combat.enemy.maxHealth}
          detail={`${combat.enemy.reach} · ${combat.enemy.damage} dmg`}
        />
        <div className="pc-range">{near ? 'NEAR' : 'FAR'}</div>
      </section>

      <section className="pc-tiles" aria-label="Actions">
        {groups(combat, consumables).map((g) => (
          <div key={g.title} className="pc-tile">
            <h3>
              <span className="pc-glyph" aria-hidden>
                {g.glyph}
              </span>
              {g.title}
            </h3>
            {g.actions.length === 0 ? <p className="pc-reason">{g.empty}</p> : null}
            {g.actions.map((a) => (
              <ActionForm
                key={`${a.id}-${a.itemId ?? ''}`}
                availability={a}
                playthroughId={playthroughId}
                step={step}
                className="pc-btn"
                reasonClassName="pc-reason"
              />
            ))}
          </div>
        ))}
      </section>

      <section className="pc-logwrap" aria-label="Combat log">
        {latest === undefined ? (
          <p className="pc-reason">The fight begins. No rolls yet.</p>
        ) : (
          <>
            <div className="pc-latest">
              <div className="pc-kicker">Last round · {latest.round}</div>
              <p>{latest.text}</p>
              <div className="pc-dice-row">
                {latest.rolls.map((roll, j) => (
                  <span key={j} className={`pc-die ${roll.hit ? 'hit' : 'miss'}`}>
                    {rollText(roll, combat)}
                  </span>
                ))}
              </div>
            </div>
            {older.length > 0 ? (
              <ol className="pc-older">
                {older.map((round) => (
                  <li key={round.round}>
                    <b>{round.round}.</b> {round.text}
                    {round.rolls.length > 0 ? (
                      <span className="pc-reason"> · {round.rolls.map((r) => rollText(r, combat)).join(' · ')}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function Medallion({
  side,
  name,
  health,
  max,
  detail,
  guard,
}: {
  side: 'char' | 'enemy';
  name: string;
  health: number;
  max: number;
  detail: string;
  guard?: boolean;
}) {
  const p = pct(health, max);
  return (
    <div className={`pc-med ${side}`}>
      <div
        className={p <= 34 ? 'pc-ring low' : 'pc-ring'}
        style={{ ['--p' as string]: `${p}%` }}
        title={`Health ${health}/${max}`}
      >
        <div className="pc-face">{initial(name)}</div>
        {guard ? <span className="pc-guard">Guard up</span> : null}
      </div>
      <div className="pc-name">{name}</div>
      <div className="pc-hpnum">
        {health}/{max}
      </div>
      <div className="pc-detail">{detail}</div>
    </div>
  );
}
