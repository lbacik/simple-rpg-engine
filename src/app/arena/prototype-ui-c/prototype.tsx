'use client';

// THROWAWAY (#185): prototype C (command panel) fed by a real MVP 1.0 resolver.
// Question: does the accepted three-column hierarchy stay understandable with
// real forecasts, cancellations, terminal cutoffs, disabled reasons, companion
// perspective, import/export and server feedback? The bottom bar cycles review
// states, not layouts; every state stays playable.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInterfaceLanguage } from '../../language-context';
import {
  ACTIONS, ROUND_LIMIT, STANCE_MOD, TARGET_KIND, actor, alive, companion, engagedWith, enemies, hero, isPrimaryAttack, listOptions, maxHp, parseImport,
  previewRound, profileOf, range, resolveRound, surrender, type ActionId, type AttackEvent, type CombatEvent, type CombatState, type Command,
  type ParseIssue, type Plan, type Range, type Reason, type Rejection, type Setup, type Stance,
} from './engine';
import { PRESETS, PRESET_LABEL, REVIEW_STATES, SCENARIO_NAMES, SCENARIO_TITLE, play, withOffsets, type PresetId, type ReviewState, type RoundRecord } from './fixtures';
import { TEXT, type Lang, type Text } from './text';
import './prototype.css';

const STANCES: Stance[] = ['aggressive', 'balanced', 'defensive'];
const STANCE_ICON: Record<Stance, string> = { aggressive: '▲', balanced: '◆', defensive: '▼' };
const RANGE_ICON: Record<Range, string> = { self: '◎', melee: '⚔', near: '◐', far: '◌' };
const ACTION_ICON: Partial<Record<ActionId, string>> = { heavy: '✦', counter: '↶', feint: '◇', cover: '◈', charge: '➶', prepare: '☀', strike: '†', brace: '⬡', approach: '→', disengage: '↗', withdraw: '⇥', shot: '➹', wait: '⏸' };
const SPECIALS: ActionId[] = ['heavy', 'counter', 'feint', 'cover', 'charge', 'prepare'];
const BASIC: ActionId[] = ['strike', 'brace'];
const MOVES: ActionId[] = ['approach', 'disengage', 'withdraw'];
const OUTCOME = { WIN: 'victory', LOSS: 'deathEnding', LOSS_SURRENDER: 'surrender', DRAW_LIMIT: 'draw' } as const;

type Doc = { step: number; origin: 'setup' | 'import'; importedFrom?: 'PLAN' | 'CHOOSE' | 'FINISHED'; setup: Setup | null; preset: PresetId | null; offsets: boolean; state: CombatState; history: RoundRecord[] };
type NoticeState = { kind: 'stale' } | { kind: 'rejected'; text: string } | { kind: 'unreadable' } | null;
type ServerMode = 'accept' | 'stale' | 'reject' | 'slow';

export default function UiCPrototype({ stateKey }: { stateKey: string }) {
  const router = useRouter();
  const index = REVIEW_STATES.findIndex(s => s.key === stateKey);
  const review = REVIEW_STATES[index];
  const go = (offset: number) => router.replace(`?state=${REVIEW_STATES[(index + offset + REVIEW_STATES.length) % REVIEW_STATES.length].key}`, { scroll: false });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      // Arrow keys switch review states only when nothing on the page has focus, so they never fight keyboard play.
      const active = document.activeElement;
      if (active && active !== document.body && !(active as HTMLElement).closest('.pc-switcher')) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); go(e.key === 'ArrowLeft' ? -1 : 1); }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  });
  return (
    <>
      <Fight key={stateKey} review={review} />
      {process.env.NODE_ENV !== 'production' && (
        <nav className="pc-switcher" aria-label="Prototype review state">
          <button onClick={() => go(-1)} aria-label="Previous state">←</button>
          <label>
            <small>PROTOTYPE STATE {index + 1} / {REVIEW_STATES.length}</small>
            <select value={stateKey} onChange={e => router.replace(`?state=${e.target.value}`, { scroll: false })}>
              {REVIEW_STATES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <button onClick={() => go(1)} aria-label="Next state">→</button>
        </nav>
      )}
    </>
  );
}

function docFrom(review: ReviewState): Doc {
  const { state, history } = review.played();
  const setup = review.context === 'scenario' ? null : review.preset ? (review.offsets ? withOffsets(PRESETS[review.preset]) : PRESETS[review.preset]) : null;
  return { step: history.length + 1, origin: review.origin, importedFrom: review.importedFrom, setup, preset: review.preset, offsets: !!review.offsets, state, history: review.origin === 'import' ? [] : history };
}

function Fight({ review }: { review: ReviewState }) {
  const appLang = useInterfaceLanguage();
  const [lang, setLang] = useState<Lang>(appLang);
  const t = TEXT[lang];
  const [doc, setDoc] = useState<Doc>(() => docFrom(review));
  const s = doc.state;
  const scenario = review.context === 'scenario';
  const h = hero(s);
  const [stance, setStance] = useState<Stance>(h.stance);
  const [actionId, setActionId] = useState<ActionId | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [perspective, setPerspective] = useState('h01');
  const [notice, setNotice] = useState<NoticeState>(review.notice === 'stale' ? { kind: 'stale' } : review.notice === 'rejected' ? { kind: 'rejected', text: t.reason({ code: 'on_cooldown', availableRound: 3 }, () => '') } : review.notice === 'unreadable' ? { kind: 'unreadable' } : null);
  const [panel, setPanel] = useState<ReviewState['panel'] | null>(review.panel ?? null);
  const [serverMode, setServerMode] = useState<ServerMode>('accept');
  const [pending, setPending] = useState(false);
  const [replay, setReplay] = useState<{ round: number; shown: number } | null>(null);
  const [reloadMsg, setReloadMsg] = useState(false);

  const name = (id: string | null): string => {
    if (!id) return '—';
    const a = actor(s, id);
    if (!a) return id;
    if (a.role === 'hero') return t.profile.hero;
    if (scenario && SCENARIO_NAMES[a.ref]) return SCENARIO_NAMES[a.ref][lang];
    if (a.role === 'companion') return t.profile[a.profileId];
    const same = enemies(s).filter(e => e.profileId === a.profileId);
    return same.length > 1 ? `${t.profile[a.profileId]} ${same.indexOf(a) + 1}` : t.profile[a.profileId];
  };

  const options = useMemo(() => (s.phase === 'CHOOSE' ? listOptions(s, stance) : []), [s, stance]);
  const option = options.find(o => o.actionId === actionId) ?? null;
  const kind = actionId ? TARGET_KIND[actionId] : 'none';
  const resolvedTarget = !actionId ? null : kind === 'self' ? h.id : kind === 'none' ? null : targetId;
  const command: Command | null = actionId && s.phase === 'CHOOSE' ? { round: s.round, stance, actionId, targetId: resolvedTarget } : null;
  const needsTarget = !!actionId && (kind === 'enemy' || kind === 'ally' || kind === 'any') && !resolvedTarget;
  const preview = command && !needsTarget ? previewRound(s, command) : null;
  const targetReasonFor = (id: string): Reason | null | undefined => option?.targets.find(x => x.id === id)?.reason;

  function choose(id: ActionId) {
    const opt = options.find(o => o.actionId === id)!;
    if (opt.reason) return;
    setActionId(id);
    const legal = opt.targets.filter(x => !x.reason);
    const k = TARGET_KIND[id];
    if (k === 'enemy' || k === 'ally' || k === 'any') setTargetId(legal.length === 1 ? legal[0].id : legal.some(x => x.id === targetId) ? targetId : null);
  }
  function pickTarget(id: string) {
    if (!actionId || kind === 'self' || kind === 'none') return;
    setTargetId(id);
  }
  function changeStance(next: Stance) {
    setStance(next);
    const opt = listOptions(s, next).find(o => o.actionId === actionId);
    if (opt?.reason) { setActionId(null); setTargetId(null); }
  }

  async function commit() {
    if (!command || pending) return;
    setPending(true);
    setNotice(null);
    await new Promise(r => setTimeout(r, serverMode === 'slow' ? 2000 : 700));
    const mode = serverMode;
    setServerMode('accept');
    setPending(false);
    if (mode === 'stale') { setNotice({ kind: 'stale' }); return; }
    if (mode === 'reject') { setNotice({ kind: 'rejected', text: t.ui.rejectedRound }); return; }
    const r = resolveRound(s, command);
    if ('code' in r) { setNotice({ kind: 'rejected', text: rejectionText(r, t, name) }); return; }
    setDoc(d => ({ ...d, step: d.step + 1, state: r.state, history: [...d.history, { round: command.round, command, events: r.events }] }));
    setActionId(null); setTargetId(null);
    setReplay({ round: command.round, shown: 0 });
  }
  useEffect(() => {
    if (!replay) return;
    const rec = doc.history.find(x => x.round === replay.round);
    const total = rec ? visibleEvents(rec.events).length : 0;
    if (replay.shown >= total) return;
    const id = setTimeout(() => setReplay(r => (r ? { ...r, shown: r.shown + 1 } : r)), 450);
    return () => clearTimeout(id);
  }, [replay, doc.history]);

  function restartFrom(setup: Setup | null) {
    if (!setup) return;
    const { state } = play(setup, []);
    setDoc(d => ({ ...d, step: d.step + 1, origin: 'setup', importedFrom: undefined, setup, state, history: [] }));
    setStance('balanced'); setActionId(null); setTargetId(null); setNotice(null); setPanel(null); setReplay(null);
  }
  function confirmSurrender() {
    setDoc(d => ({ ...d, step: d.step + 1, state: surrender(d.state) }));
    setPanel(null); setActionId(null);
  }
  function imported(state: CombatState, from: 'PLAN' | 'CHOOSE' | 'FINISHED') {
    setDoc(d => ({ ...d, step: d.step + 1, origin: 'import', importedFrom: from, state, history: [] }));
    setStance(hero(state).stance); setActionId(null); setTargetId(null); setPanel(null); setNotice(null); setReplay(null);
  }
  function simulateReload() {
    const restored = JSON.parse(JSON.stringify(doc.state)) as CombatState;
    setDoc(d => ({ ...d, state: restored }));
    setActionId(null); setTargetId(null); setReloadMsg(true);
  }

  const companionActor = companion(s);
  const slotsUsed = s.frozenEnemyPlans.filter(p => p.attackSlot).length;
  const finished = s.phase === 'FINISHED';
  const canRestart = !scenario && (doc.origin === 'setup' || doc.importedFrom === 'PLAN');
  const title = scenario ? SCENARIO_TITLE[lang] : doc.preset ? PRESET_LABEL[doc.preset][lang] : t.ui.contextArena;

  // ---------- pieces ----------
  const heroPanel = (
    <section className="pc-box pc-hero pc-area-hero" aria-label={t.ui.you}>
      <span className="pc-eyebrow">{t.ui.you} · h01</span>
      <h2>{t.profile.hero}</h2>
      <Meter value={h.hp} max={40} label={`${h.hp} / 40 ${t.ui.hp}`} tone={h.hp <= 10 ? 'low' : 'ok'} />
      <Pips value={h.stamina ?? 0} max={10} label={`${h.stamina} / 10 ${t.ui.stamina}`} />
      {scenario && h.hp < 40 && doc.history.length === 0 && <p className="pc-note">{t.ui.scenarioHpNote(h.hp)}</p>}
      <p className="pc-dim">
        {STANCE_ICON[stance]} {t.stance[stance]} · {t.ui.attack} {4 + STANCE_MOD[stance]} · {t.ui.defense} {Math.max(0, 4 - STANCE_MOD[stance] - (actionId === 'heavy' ? 2 : 0))} · {t.ui.armor} 1
      </p>
      <p>{engagedWith(s, h.id).length ? <>⚔ {t.ui.engagedWith(engagedWith(s, h.id).map(name).join(', '))}</> : <>◯ {t.ui.free}</>}</p>
      <p className="pc-dim">☀ {h.readyRound ? t.ui.prepared(h.readyRound) : t.ui.notPrepared}</p>
      <p className="pc-dim">
        ⧗ {Object.entries(h.availableRound).filter(([, r]) => (r ?? 0) > s.round).map(([a, r]) => t.ui.availableFrom(t.action[a as ActionId], r!)).join(' · ') || t.ui.allReady}
      </p>
    </section>
  );

  const threatStrip = !finished && (
    <div className="pc-threat-strip" aria-hidden="true">
      {s.frozenEnemyPlans.filter(p => p.attackSlot).map(p => (
        <span key={p.actorId}>⚔ {name(p.actorId)}: {t.action[p.actionId]} → {name(p.targetId)}</span>
      ))}
    </div>
  );

  const intents = (
    <section className="pc-area-intents" aria-label={t.ui.intents}>
      <div className="pc-section-title">
        <h2>{t.ui.intents}</h2>
        <span>⚔ {t.ui.slots(slotsUsed)}</span>
      </div>
      <div className="pc-intents">
        {enemies(s).map(e => {
          const plan = s.frozenEnemyPlans.find(p => p.actorId === e.id);
          if (e.hp <= 0) return (
            <div key={e.id} className="pc-intent pc-out"><small>{e.id}</small> <b>{name(e.id)}</b> — ✝ {t.ui.eliminated}</div>
          );
          const targetable = !!actionId && (kind === 'enemy' || kind === 'any');
          const reason = targetable ? targetReasonFor(e.id) : undefined;
          return (
            <button key={e.id} type="button" className={`pc-intent ${resolvedTarget === e.id ? 'selected' : ''} ${targetable ? (reason ? 'illegal' : 'legal') : ''}`}
              aria-pressed={resolvedTarget === e.id} aria-disabled={!targetable || !!reason} onClick={() => !reason && targetable && pickTarget(e.id)}>
              <span className="pc-intent-top">
                <small>{e.id} · {RANGE_ICON[range(s, perspective, e.id)]} {t.range[range(s, perspective, e.id)]}{perspective !== 'h01' ? ` (${name(perspective)})` : ''}</small>
                <SlotBadge plan={plan} t={t} />
              </span>
              <span className="pc-intent-name"><b>{name(e.id)}</b><span>{e.hp}/{maxHp(e)} {t.ui.hp}</span></span>
              <Meter value={e.hp} max={maxHp(e)} tone="enemy" />
              <span className="pc-dim">{STANCE_ICON[plan?.stance ?? e.stance]} {t.stance[plan?.stance ?? e.stance]} · {t.ui.armor} {profileOf(e).armor}{e.readyRound === s.round ? ` · ☀ +2/+3` : ''}</span>
              {plan && !finished && <strong className="pc-intent-plan">{ACTION_ICON[plan.actionId]} {t.action[plan.actionId]} → {plan.targetId === e.id ? t.ui.self : name(plan.targetId)}{isPrimaryAttack(plan.actionId) ? ` · ${t.ui.priority(plan.priority)}` : ''}</strong>}
              {targetable && <small className={reason ? 'pc-reason' : 'pc-ok'}>{reason ? `✕ ${t.reason(reason, name)}` : `✓ ${t.ui.targetLegal}`}</small>}
            </button>
          );
        })}
      </div>
    </section>
  );

  const allyPanel = (
    <section className="pc-area-ally">
      {companionActor ? (
        companionActor.hp > 0 ? (
          <AllyCard s={s} t={t} name={name} selected={resolvedTarget === companionActor.id}
            targetable={!!actionId && (kind === 'ally' || kind === 'any')} reason={targetReasonFor(companionActor.id)} onPick={() => pickTarget(companionActor.id)} finished={finished} />
        ) : (
          <div className="pc-box pc-ally pc-ally-lost">
            <span className="pc-eyebrow">{t.ui.companion} · c01</span>
            <h3>✝ {name(companionActor.id)}</h3>
            <p>{scenario ? t.ui.companionLostScenario : t.ui.companionLost}</p>
          </div>
        )
      ) : null}
    </section>
  );

  const inventory = scenario && (
    <section className="pc-box pc-area-inv">
      <span className="pc-eyebrow">{t.ui.inventory}</span>
      <p className="pc-dim">🔒 {t.ui.inventoryDisabled}</p>
    </section>
  );

  const stancePanel = (
    <section className="pc-box pc-area-stance">
      <span className="pc-eyebrow">{t.ui.stanceStep}</span>
      <div className="pc-stances" role="group" aria-label={t.ui.stanceStep}>
        {STANCES.map(st => (
          <button key={st} type="button" aria-pressed={stance === st} disabled={finished} onClick={() => changeStance(st)}>
            <strong>{STANCE_ICON[st]} {t.stance[st]}</strong>
            <small>{t.ui.attack} {fmt(STANCE_MOD[st])} · {t.ui.defense} {fmt(-STANCE_MOD[st])}</small>
          </button>
        ))}
      </div>
    </section>
  );

  const actionButton = (id: ActionId, big: boolean) => {
    const opt = options.find(o => o.actionId === id);
    const reason = finished ? null : opt?.reason ?? null;
    return (
      <button key={id} type="button" className={`${big ? 'pc-card' : 'pc-basic'} ${actionId === id ? 'selected' : ''}`} aria-pressed={actionId === id}
        aria-disabled={finished || !!reason} onClick={() => !finished && choose(id)}>
        <span className="pc-card-top"><b aria-hidden="true">{ACTION_ICON[id]}</b><strong>{t.action[id]}</strong><small>{t.ui.costShort(ACTIONS[id].cost)}</small></span>
        {big && <small>{t.actionSummary[id]}</small>}
        {reason && <small className="pc-reason">✕ {t.reason(reason, name)}</small>}
      </button>
    );
  };
  const cardsPanel = (
    <section className="pc-box pc-area-cards">
      <span className="pc-eyebrow">{t.ui.actionStep}</span>
      <div className="pc-cards">{SPECIALS.map(id => actionButton(id, true))}</div>
      <span className="pc-subhead">{t.ui.basicActions}</span>
      <div className="pc-basics">{BASIC.map(id => actionButton(id, false))}</div>
      <span className="pc-subhead">{t.ui.movement}</span>
      <div className="pc-basics">{MOVES.map(id => actionButton(id, false))}</div>
    </section>
  );

  const relationIds = s.actors.filter(alive).map(a => a.id);
  const groups = [...new Set(s.actors.filter(alive).map(a => a.groupId))].sort();
  const targetingPanel = (
    <section className="pc-box pc-area-target">
      <span className="pc-eyebrow">{t.ui.targetStep}</span>
      {actionId && !finished ? (
        <p>
          <strong>{t.action[actionId]}</strong> → {kind === 'self' ? `${t.profile.hero} (${t.ui.self})` : kind === 'none' ? '—' : resolvedTarget ? name(resolvedTarget) : <em>{t.ui.pickTarget}</em>}
        </p>
      ) : <p className="pc-dim">{t.ui.forecastNone}</p>}
      <label className="pc-perspective">
        {t.ui.perspective}{' '}
        <select value={perspective} onChange={e => setPerspective(e.target.value)}>
          {relationIds.map(id => <option key={id} value={id}>{name(id)}</option>)}
        </select>
      </label>
      <div className="pc-relations">
        {relationIds.filter(id => id !== perspective).map(id => (
          <span key={id}>{name(id)}: <b>{RANGE_ICON[range(s, perspective, id)]} {t.range[range(s, perspective, id)]}</b></span>
        ))}
      </div>
      <details className="pc-groups">
        <summary>{t.ui.groups}</summary>
        {groups.map(g => <p key={g}><b>{t.ui.groupLabel(g)}:</b> {s.actors.filter(a => alive(a) && a.groupId === g).map(a => name(a.id)).join(', ')}</p>)}
        <p><b>⚔</b> {s.engagements.map(([a, b]) => `${name(a)} — ${name(b)}`).join(' · ') || t.ui.none}</p>
      </details>
    </section>
  );

  const forecastPanel = finished ? (
    <ResultPanel s={s} t={t} scenario={scenario} name={name} canRestart={canRestart} canFightAgain={!!doc.setup} viewOnly={doc.importedFrom === 'FINISHED'}
      onAgain={() => restartFrom(doc.setup)} onRestart={() => restartFrom(doc.setup)} onExport={() => setPanel('export')} />
  ) : (
    <section className="pc-box pc-forecast pc-area-forecast" aria-live="polite">
      <span className="pc-eyebrow">{t.ui.forecast}</span>
      {!actionId && <p className="pc-dim">{t.ui.forecastNone}</p>}
      {actionId && needsTarget && <p className="pc-dim">{t.ui.pickTarget}</p>}
      {preview && 'code' in preview && <p className="pc-reason">✕ {t.ui.forecastIllegal}: {rejectionText(preview, t, name)}</p>}
      {preview && !('code' in preview) && command && <Forecast before={s} after={preview.state} events={preview.events} command={command} t={t} name={name} />}
      <button type="button" className="pc-primary" disabled={!preview || 'code' in preview || pending} aria-busy={pending} onClick={commit}>
        {pending ? t.ui.confirming : `${t.ui.confirm} →`}
      </button>
      {panel === 'surrender' ? (
        <div className="pc-confirm" role="group" aria-label={t.ui.surrender}>
          <p>{scenario ? t.ui.surrenderScenario : t.ui.surrenderConfirm}</p>
          <div><button type="button" onClick={() => setPanel(null)}>{t.ui.cancel}</button><button type="button" className="pc-danger" onClick={confirmSurrender}>{t.ui.yesSurrender}</button></div>
        </div>
      ) : (
        <button type="button" className="pc-quiet" disabled={pending} onClick={() => setPanel('surrender')}>⚑ {t.ui.surrender}</button>
      )}
    </section>
  );

  return (
    <main className="pc" lang={lang}>
      <div className="pc-heading">
        <div>
          <span className="pc-eyebrow">{scenario ? `SIMPLE-RPG-ENGINE / ${t.ui.contextScenario.toUpperCase()}` : t.ui.eyebrow}</span>
          <h1>{title}</h1>
          <p className="pc-dim">{t.ui.round(s.round, ROUND_LIMIT)} · {t.ui.phase[s.phase === 'FINISHED' ? 'FINISHED' : 'CHOOSE']} · {scenario ? t.ui.contextScenario : t.ui.contextArena}</p>
        </div>
        <div className="pc-heading-tools">
          <div role="group" aria-label={t.ui.language} className="pc-lang">
            {(['pl', 'en'] as Lang[]).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
          </div>
          {!scenario && <button type="button" onClick={() => setPanel(panel === 'setup' ? null : 'setup')}>{t.ui.setup}</button>}
          <button type="button" onClick={() => setPanel(panel === 'export' || panel === 'import' ? null : 'export')}>{t.ui.io}</button>
        </div>
      </div>
      <div className="pc-banner">{t.ui.banner}</div>

      {notice && (
        <div className={`pc-notice pc-notice-${notice.kind}`} role="alert">
          <span>{notice.kind === 'stale' ? `⟳ ${t.ui.noticeStale}` : notice.kind === 'rejected' ? `✕ ${t.ui.noticeRejected(notice.text)}` : `⚠ ${t.ui.unreadable}`}</span>
          <button type="button" onClick={() => setNotice(null)}>{t.ui.dismiss}</button>
        </div>
      )}
      {doc.origin === 'import' && <div className="pc-notice pc-notice-import">⇩ {doc.importedFrom === 'FINISHED' ? t.ui.finishedViewOnly : t.ui.importedBanner}</div>}
      {reloadMsg && <div className="pc-notice pc-notice-import" role="status">↻ {t.ui.reloadDone} <button type="button" onClick={() => setReloadMsg(false)}>{t.ui.dismiss}</button></div>}

      {panel === 'setup' && !scenario && (
        <SetupPanel t={t} lang={lang} inProgress={!finished && notice?.kind !== 'unreadable'} initial={doc.preset ?? 'T1'} onStart={(p, offsets) => { setDoc(d => ({ ...d, preset: p, offsets })); restartFrom(offsets ? withOffsets(PRESETS[p]) : PRESETS[p]); }} onClose={() => setPanel(null)} />
      )}
      {(panel === 'export' || panel === 'import') && (
        <IoPanel t={t} s={s} scenario={scenario} tab={panel} setTab={setPanel} inProgress={!finished} onImported={imported} initialDraft={review.importDraft ?? ''} />
      )}

      {notice?.kind === 'unreadable' && panel === 'setup' ? null : (
        <>
          {threatStrip}
          <div className="pc-command">
            <div className="pc-col">{heroPanel}{allyPanel}{inventory}</div>
            <div className="pc-col">{intents}{targetingPanel}</div>
            <div className="pc-col">{stancePanel}{cardsPanel}{forecastPanel}</div>
          </div>
          <Log history={doc.history} t={t} name={name} replay={replay} setReplay={setReplay} imported={doc.origin === 'import'} />
        </>
      )}

      <section className="pc-dev" aria-label="Prototype controls">
        <span className="pc-eyebrow">PROTOTYPE CONTROLS · {review.label}</span>
        <p>{review.note}</p>
        <fieldset>
          <legend>{t.ui.serverMode}</legend>
          {(['accept', 'stale', 'reject', 'slow'] as ServerMode[]).map(m => (
            <label key={m}><input type="radio" name="server" checked={serverMode === m} onChange={() => setServerMode(m)} /> {m === 'accept' ? t.ui.serverAccept : m === 'stale' ? t.ui.serverStale : m === 'reject' ? t.ui.serverReject : t.ui.serverSlow}</label>
          ))}
        </fieldset>
        <button type="button" onClick={simulateReload} disabled={finished}>↻ {t.ui.reload}</button>
        <details>
          <summary>{t.ui.state} · step {doc.step} · origin {doc.origin}</summary>
          <pre>{JSON.stringify({ step: doc.step, origin: doc.origin, importedFrom: doc.importedFrom, selection: { stance, actionId, targetId: resolvedTarget }, state: s }, null, 2)}</pre>
        </details>
      </section>
    </main>
  );
}

// ---------- helpers and sub-components ----------
const fmt = (n: number) => (n > 0 ? `+${n}` : n === 0 ? '0' : `−${-n}`);
const visibleEvents = (events: CombatEvent[]) => events.filter(e => e.kind !== 'declare');

function rejectionText(r: Rejection, t: Text, name: (id: string) => string) {
  if (r.code === 'phase') return t.ui.rejectedPhase;
  if (r.code === 'round') return t.ui.rejectedRound;
  return r.reason ? t.reason(r.reason, name) : r.code;
}

function Meter({ value, max, label, tone }: { value: number; max: number; label?: string; tone: 'ok' | 'low' | 'enemy' }) {
  return (
    <div className="pc-meter-wrap">
      {label && <strong className="pc-meter-label">{tone === 'low' ? '⚠ ' : ''}{label}</strong>}
      <div className={`pc-meter pc-meter-${tone}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <span style={{ width: `${Math.round((value / max) * 100)}%` }} />
      </div>
    </div>
  );
}
function Pips({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="pc-pips" aria-label={label}>
      <strong>{label}</strong>
      <span aria-hidden="true">{Array.from({ length: max }, (_, i) => <i key={i} className={i < value ? 'on' : ''} />)}</span>
    </div>
  );
}
function SlotBadge({ plan, t }: { plan?: Plan; t: Text }) {
  if (!plan) return null;
  if (plan.attackSlot) return <b className="pc-badge pc-badge-slot">⚔ {t.ui.slot}</b>;
  if (plan.actionId === 'wait') return <b className="pc-badge pc-badge-wait">⏸ {t.ui.waiting}{plan.replacedActionId ? ` · ${t.ui.waitingWould(t.action[plan.replacedActionId])}` : ''}</b>;
  return <b className="pc-badge">◇ {t.action[plan.actionId]}</b>;
}

function AllyCard({ s, t, name, selected, targetable, reason, onPick, finished }: { s: CombatState; t: Text; name: (id: string | null) => string; selected: boolean; targetable: boolean; reason: Reason | null | undefined; onPick: () => void; finished: boolean }) {
  const c = companion(s)!;
  const plan = s.frozenCompanionPlan;
  const body = (
    <>
      <span className="pc-eyebrow">{t.ui.companion} · c01{!finished ? ` · ${t.ui.companionFrozen}` : ''}</span>
      <span className="pc-intent-name"><b>{name(c.id)}</b><span>{c.hp}/{maxHp(c)} {t.ui.hp} · {c.stamina}/8 {t.ui.stamina}</span></span>
      <Meter value={c.hp} max={maxHp(c)} tone={c.hp <= 6 ? 'low' : 'ok'} />
      <span className="pc-dim">{RANGE_ICON[range(s, 'h01', c.id)]} {t.range[range(s, 'h01', c.id)]} · {engagedWith(s, c.id).length ? `⚔ ${engagedWith(s, c.id).map(name).join(', ')}` : `◯ ${t.ui.freeShort}`}</span>
      {plan && !finished && <strong className="pc-intent-plan">{ACTION_ICON[plan.actionId]} {t.action[plan.actionId]} ({t.stanceShort[plan.stance]}) → {plan.targetId === c.id ? t.ui.self : name(plan.targetId)}</strong>}
      {targetable && <small className={reason ? 'pc-reason' : 'pc-ok'}>{reason ? `✕ ${t.reason(reason, name as (id: string) => string)}` : `✓ ${t.ui.targetLegal}`}</small>}
    </>
  );
  return targetable ? (
    <button type="button" className={`pc-box pc-ally pc-intent ${selected ? 'selected' : ''} ${reason ? 'illegal' : 'legal'}`} aria-pressed={selected} aria-disabled={!!reason} onClick={() => !reason && onPick()}>{body}</button>
  ) : <div className="pc-box pc-ally">{body}</div>;
}

function Forecast({ before, after, events, command, t, name }: { before: CombatState; after: CombatState; events: CombatEvent[]; command: Command; t: Text; name: (id: string | null) => string }) {
  const terminal = !!after.result;
  const heroDecl = events.find(e => e.kind === 'declare' && e.actorId === 'h01');
  const regen = events.find(e => e.kind === 'regen' && e.actorId === 'h01');
  const blows = events.filter(e => e.kind === 'attack' || e.kind === 'cancelled');
  const moves = events.filter(e => e.kind === 'move');
  const queued = [
    ...(isPrimaryAttack(command.actionId) ? ['h01'] : []),
    ...(before.frozenCompanionPlan && isPrimaryAttack(before.frozenCompanionPlan.actionId) ? ['c01'] : []),
    ...before.frozenEnemyPlans.filter(p => isPrimaryAttack(p.actionId)).map(p => p.actorId),
  ];
  const skipped = terminal ? queued.filter(id => !blows.some(b => b.actorId === id && !(b.kind === 'attack' && b.riposte))) : [];
  return (
    <div className="pc-forecast-body">
      <h2>{STANCE_ICON[command.stance]} {t.action[command.actionId]}{command.targetId && command.targetId !== 'h01' ? ` → ${name(command.targetId)}` : ''}</h2>
      <div className="pc-stats">
        <span><strong>{heroDecl && heroDecl.kind === 'declare' ? heroDecl.cost : 0}</strong><small>{t.ui.costNow}</small></span>
        <span><strong>{terminal ? '—' : `+${regen && regen.kind === 'regen' ? regen.gain : 0}`}</strong><small>{terminal ? t.ui.noRegenTerminal : t.ui.regenEnd}</small></span>
      </div>
      {terminal && <p className={`pc-result-line pc-result-${after.result}`}>{after.result === 'WIN' ? '★' : '✝'} {t.result[after.result!]}</p>}
      {moves.length > 0 && (<><span className="pc-subhead">{t.ui.moves}</span><ol className="pc-events">{moves.map((e, i) => <EventRow key={i} e={e} t={t} name={name} mode="forecast" />)}</ol></>)}
      <span className="pc-subhead">{t.ui.queue}</span>
      <ol className="pc-events">
        {blows.map((e, i) => <EventRow key={i} e={e} t={t} name={name} mode="forecast" />)}
        {skipped.length > 0 && <li className="pc-cutoff">⛔ {t.ui.terminalCutoff}: {skipped.map(id => name(id)).join(', ')}</li>}
        {blows.length === 0 && <li className="pc-dim">—</li>}
      </ol>
      <details className="pc-decl">
        <summary>{t.ui.declarations}</summary>
        <ul className="pc-events">{events.filter(e => e.kind === 'declare').map((e, i) => <EventRow key={i} e={e} t={t} name={name} mode="forecast" />)}</ul>
      </details>
      <span className="pc-subhead">{t.ui.after}</span>
      <table className="pc-after">
        <tbody>
          {after.actors.filter(a => alive(actor(before, a.id))).map(a => {
            const b = actor(before, a.id)!;
            return (
              <tr key={a.id} className={a.hp === 0 ? 'out' : b.hp !== a.hp ? 'changed' : ''}>
                <th scope="row">{name(a.id)}</th>
                <td>{a.hp === 0 ? '✝ ' : b.hp !== a.hp ? '▼ ' : ''}{t.ui.hpDelta(b.hp, a.hp)} {t.ui.hp}</td>
                <td>{a.stamina !== null ? `${t.ui.staminaDelta(b.stamina ?? 0, a.stamina)} ${t.ui.stamina}` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pc-dim">⚔ {t.ui.engagementsAfter}: {after.engagements.map(([a, b]) => `${name(a)} — ${name(b)}`).join(' · ') || t.ui.none}</p>
      {!terminal && <p className="pc-dim pc-small">{t.ui.regenNote}</p>}
    </div>
  );
}

function EventRow({ e, t, name, mode }: { e: CombatEvent; t: Text; name: (id: string | null) => string; mode: 'forecast' | 'log' }) {
  switch (e.kind) {
    case 'declare': {
      const bits = [e.cost ? t.ui.costShort(e.cost) : '', e.guard ? t.ui.eventGuard(e.guard) : '', e.exposed ? t.ui.eventExposed : '', e.preparedBonus ? t.ui.eventPreparedBonus : ''].filter(Boolean);
      return <li>{ACTION_ICON[e.actionId]} {t.ui.eventDeclare(name(e.actorId), t.action[e.actionId], t.stanceShort[e.stance], e.targetId && e.targetId !== e.actorId ? name(e.targetId) : null)}{bits.length ? ` · ${bits.join(' · ')}` : ''}</li>;
    }
    case 'move':
      return <li>{ACTION_ICON[e.actionId]} {t.ui.eventMove(name(e.actorId), t.ui.moveOutcome[e.outcome], ['disengaged', 'withdrew'].includes(e.outcome) ? null : name(e.targetId))}</li>;
    case 'cancelled':
      return <li className="pc-cancel">✕ {t.ui.eventCancelled(name(e.actorId), t.action[e.actionId], t.cancel(e.reason))}</li>;
    case 'attack':
      return <AttackRow e={e} t={t} name={name} mode={mode} />;
    case 'regen':
      return <li className="pc-dim">+ {t.ui.eventRegen(name(e.actorId), e.gain, e.staminaAfter)}</li>;
    case 'result':
      return <li className={`pc-result-line pc-result-${e.result}`}>{e.result === 'WIN' ? '★' : '✝'} {t.ui.eventResult(t.result[e.result])}</li>;
  }
}

function AttackRow({ e, t, name, mode }: { e: AttackEvent; t: Text; name: (id: string | null) => string; mode: 'forecast' | 'log' }) {
  const m = t.ui.math;
  const outcome = e.hit
    ? `✓ ${mode === 'forecast' ? t.ui.willHit : t.ui.hit}${e.damage ? ` · ${t.ui.eventHit(e.damage.hpLoss, e.damage.hpAfter)}` : ''}`
    : `○ ${mode === 'forecast' ? t.ui.willMiss : t.ui.eventMiss}`;
  return (
    <li className={`pc-attack ${e.riposte ? 'pc-riposte' : ''}`}>
      <details>
        <summary>
          <span>{e.riposte ? `↶ ${t.ui.eventRiposte}: ` : `${ACTION_ICON[e.actionId]} `}{t.ui.eventAttack(name(e.actorId), e.riposte ? t.action.counter : t.action[e.actionId], name(e.recipientId))}</span>
          {e.redirectedBy && <span className="pc-tag pc-tag-cover">◈ {t.ui.eventRedirected(name(e.redirectedBy), name(e.originalTargetId))}</span>}
          {e.counterTriggered && <span className="pc-tag pc-tag-counter">↶ {t.ui.eventCounter}</span>}
          <span className={e.hit ? 'pc-hit' : 'pc-miss'}>{outcome}</span>
          {e.eliminated && <span className="pc-tag pc-tag-out">✝ {t.ui.eventEliminated(name(e.recipientId))}</span>}
        </summary>
        <div className="pc-math">
          <p>{m.attack} <b>{e.attack.total}</b> = {m.skill} {e.attack.skill} {fmt(e.attack.stance)} {m.stanceMod} {e.attack.card ? `${fmt(e.attack.card)} ${m.card}` : ''} {e.attack.prepared ? `${fmt(e.attack.prepared)} ${m.preparedAcc}` : ''}</p>
          <p>{m.defense} <b>{e.defense.total}</b> = {m.base} {e.defense.base} {fmt(e.defense.stanceUsed)} {m.stanceMod}{e.defense.stance !== e.defense.stanceUsed ? ` (${m.feintIgnores}: ${fmt(e.defense.stance)})` : ''} {e.defense.exposed ? `−${e.defense.exposed} ${m.exposed}` : ''} → {e.attack.total} {e.hit ? '≥' : '<'} {e.defense.total}</p>
          {e.damage && (
            <p>
              {m.raw} {e.damage.raw} = {m.base} {e.damage.base}{e.damage.power ? ` ${fmt(e.damage.power)} ${m.power}` : ''}{e.damage.prepared ? ` ${fmt(e.damage.prepared)} ${m.preparedDmg}` : ''}
              {e.damage.parry ? ` · −${e.damage.parry} ${m.parry}` : ''} · −{e.damage.armor} {m.armorRed}
              {e.damage.feintIgnoresGuard ? ` · ${m.feintGuard}` : e.damage.guardBefore ? ` · −${e.damage.absorbed} ${m.guardAbs(e.damage.guardBefore)}` : ''} → {m.hpLoss} <b>{e.damage.hpLoss}</b>
            </p>
          )}
        </div>
      </details>
    </li>
  );
}

function Log({ history, t, name, replay, setReplay, imported }: { history: RoundRecord[]; t: Text; name: (id: string | null) => string; replay: { round: number; shown: number } | null; setReplay: (r: { round: number; shown: number } | null) => void; imported: boolean }) {
  return (
    <section className="pc-box pc-log" aria-label={t.ui.log}>
      <h2>{t.ui.log}</h2>
      {imported && <p className="pc-dim">⇩ {t.ui.importedBanner}</p>}
      {history.length === 0 && <p className="pc-dim">{t.ui.logEmpty}</p>}
      {history.map((rec, i) => {
        const events = visibleEvents(rec.events);
        const replaying = replay?.round === rec.round;
        const shown = replaying ? events.slice(0, replay!.shown) : events;
        const isLast = i === history.length - 1;
        return (
          <details key={rec.round} open={isLast} className="pc-log-round">
            <summary>
              {t.ui.round(rec.round, ROUND_LIMIT)} · {STANCE_ICON[rec.command.stance]} {t.stance[rec.command.stance]} · {t.action[rec.command.actionId]}{rec.command.targetId && rec.command.targetId !== 'h01' ? ` → ${name(rec.command.targetId)}` : ''}
            </summary>
            <div className="pc-log-tools">
              {replaying && replay!.shown < events.length ? (
                <><span aria-live="polite">{t.ui.step(replay!.shown, events.length)}</span><button type="button" onClick={() => setReplay({ round: rec.round, shown: events.length })}>{t.ui.skip} ⏭</button></>
              ) : (
                <button type="button" onClick={() => setReplay({ round: rec.round, shown: 0 })}>▶ {t.ui.replay}</button>
              )}
            </div>
            <ol className="pc-events">{shown.map((e, j) => <EventRow key={j} e={e} t={t} name={name} mode="log" />)}</ol>
            <details className="pc-decl"><summary>{t.ui.declarations}</summary><ul className="pc-events">{rec.events.filter(e => e.kind === 'declare').map((e, j) => <EventRow key={j} e={e} t={t} name={name} mode="log" />)}</ul></details>
          </details>
        );
      })}
    </section>
  );
}

function ResultPanel({ s, t, scenario, name, canRestart, canFightAgain, viewOnly, onAgain, onRestart, onExport }: { s: CombatState; t: Text; scenario: boolean; name: (id: string | null) => string; canRestart: boolean; canFightAgain: boolean; viewOnly: boolean; onAgain: () => void; onRestart: () => void; onExport: () => void }) {
  const r = s.result!;
  const h = hero(s);
  const c = companion(s);
  return (
    <section className={`pc-box pc-result pc-area-forecast pc-result-box-${r}`} aria-live="polite">
      <span className="pc-eyebrow">{t.ui.resultTitle} · {t.ui.round(s.round, ROUND_LIMIT)}</span>
      <h2>{r === 'WIN' ? '★' : r === 'DRAW_LIMIT' ? '⚖' : r === 'LOSS_SURRENDER' ? '⚑' : '✝'} {t.result[r]}</h2>
      <p>{name('h01')}: {h.hp} / 40 {t.ui.hp}{c ? ` · ${name(c.id)}: ${alive(c) ? `${c.hp} ${t.ui.hp}` : `✝ ${scenario ? t.ui.companionLostScenario : t.ui.companionLost}`}` : ''}</p>
      {scenario ? (
        <>
          <button type="button" className="pc-primary" disabled={viewOnly}>{t.ui.continueOutcome(t.ui.outcome[OUTCOME[r]])} →</button>
          <p className="pc-dim pc-small">{t.ui.noRestartScenario}</p>
        </>
      ) : (
        <>
          {!viewOnly && canFightAgain && <button type="button" className="pc-primary" onClick={onAgain}>{t.ui.fightAgain}</button>}
          {!viewOnly && (canRestart ? <button type="button" onClick={onRestart}>{t.ui.restart}</button> : <p className="pc-dim pc-small">{t.ui.restartUnavailable}</p>)}
        </>
      )}
      <button type="button" className="pc-quiet" onClick={onExport}>⇧ {t.ui.export}</button>
    </section>
  );
}

function SetupPanel({ t, lang, inProgress, initial, onStart, onClose }: { t: Text; lang: Lang; inProgress: boolean; initial: PresetId; onStart: (p: PresetId, offsets: boolean) => void; onClose: () => void }) {
  const [preset, setPreset] = useState<PresetId>(initial);
  const [offsets, setOffsets] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="pc-box pc-setup" aria-label={t.ui.setup}>
      <span className="pc-eyebrow">{t.ui.setup}</span>
      <label>{t.ui.preset} <select value={preset} onChange={e => setPreset(e.target.value as PresetId)}>{(Object.keys(PRESETS) as PresetId[]).map(p => <option key={p} value={p}>{PRESET_LABEL[p][lang]}</option>)}</select></label>
      <label><input type="checkbox" checked={offsets} onChange={e => setOffsets(e.target.checked)} /> {t.ui.offsets} — {t.ui.offsetsOn}</label>
      {confirming ? (
        <div className="pc-confirm"><p>{t.ui.importReplaceWarn}</p><div><button type="button" onClick={() => setConfirming(false)}>{t.ui.cancel}</button><button type="button" className="pc-danger" onClick={() => onStart(preset, offsets)}>{t.ui.importReplaceConfirm}</button></div></div>
      ) : (
        <div className="pc-row"><button type="button" className="pc-primary" onClick={() => (inProgress ? setConfirming(true) : onStart(preset, offsets))}>{t.ui.startFight}</button><button type="button" onClick={onClose}>{t.ui.cancel}</button></div>
      )}
    </section>
  );
}

function IoPanel({ t, s, scenario, tab, setTab, inProgress, onImported, initialDraft }: { t: Text; s: CombatState; scenario: boolean; tab: 'export' | 'import'; setTab: (p: 'export' | 'import' | null) => void; inProgress: boolean; onImported: (s: CombatState, from: 'PLAN' | 'CHOOSE' | 'FINISHED') => void; initialDraft: string }) {
  const json = JSON.stringify(s, null, 2);
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState<'file' | 'paste'>('paste');
  const [draft, setDraft] = useState(initialDraft);
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [confirm, setConfirm] = useState(false);
  function attempt(text: string) {
    const r = parseImport(text);
    if ('issues' in r) { setIssues(r.issues); setConfirm(false); return; }
    setIssues([]);
    if (inProgress && !confirm) { setConfirm(true); return; }
    const raw = JSON.parse(text) as { phase: 'PLAN' | 'CHOOSE' | 'FINISHED' };
    onImported(r.state, raw.phase);
  }
  return (
    <section className="pc-box pc-io" aria-label={t.ui.io}>
      <div className="pc-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'export'} onClick={() => setTab('export')}>⇧ {t.ui.export}</button>
        {!scenario && <button type="button" role="tab" aria-selected={tab === 'import'} onClick={() => setTab('import')}>⇩ {t.ui.import}</button>}
        <button type="button" onClick={() => setTab(null)}>{t.ui.dismiss}</button>
      </div>
      {tab === 'export' ? (
        <>
          <textarea readOnly value={json} rows={8} aria-label={t.ui.export} />
          <div className="pc-row">
            <button type="button" onClick={() => { const url = URL.createObjectURL(new Blob([json], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `combat-round-${s.round}.json`; a.click(); URL.revokeObjectURL(url); }}>{t.ui.download}</button>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(json); setCopied(true); }}>{copied ? `✓ ${t.ui.copied}` : t.ui.copy}</button>
          </div>
          {scenario && <p className="pc-dim pc-small">{t.ui.noRestartScenario}</p>}
        </>
      ) : (
        <>
          <div className="pc-row" role="group">
            <button type="button" aria-pressed={source === 'file'} onClick={() => setSource('file')}>{t.ui.importFile}</button>
            <button type="button" aria-pressed={source === 'paste'} onClick={() => setSource('paste')}>{t.ui.importPaste}</button>
          </div>
          {source === 'file' ? (
            <input type="file" accept="application/json,.json" onChange={async e => { const f = e.target.files?.[0]; if (f) { const text = await f.text(); setDraft(text); attempt(text); } }} />
          ) : (
            <><textarea value={draft} onChange={e => { setDraft(e.target.value); setConfirm(false); }} rows={6} aria-label={t.ui.importPaste} /><button type="button" onClick={() => attempt(draft)}>{t.ui.importGo}</button></>
          )}
          {issues.length > 0 && <div className="pc-reason" role="alert"><p>{t.ui.importIssues}</p><ul>{issues.map((i, k) => <li key={k}>✕ {t.parse(i)}</li>)}</ul></div>}
          {confirm && (
            <div className="pc-confirm"><p>⚠ {t.ui.importReplaceWarn}</p><div><button type="button" onClick={() => setConfirm(false)}>{t.ui.cancel}</button><button type="button" className="pc-danger" onClick={() => attempt(draft)}>{t.ui.importReplaceConfirm}</button></div></div>
          )}
        </>
      )}
    </section>
  );
}
