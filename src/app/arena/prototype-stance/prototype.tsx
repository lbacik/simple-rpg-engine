'use client';

// THROWAWAY: Three structurally different combat interfaces on one arena route.
// Question: which hierarchy best explains stance → action → target, visible intents and relations?
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import './prototype.css';

type Stance = 'A' | 'Z' | 'D';
type Actor = { id: string; name: string; hp: number; armor: number; group: string; stance: Stance; intent: string; target: string; priority: string; slot: boolean };
const names = { A: 'Agresywna', Z: 'Zrównoważona', D: 'Defensywna' };
const mods = { A: 2, Z: 0, D: -2 };
const variants = { A: 'Stół taktyczny', B: 'Jedna decyzja naraz', C: 'Panel dowodzenia' };
const actions = [
  { id: 'heavy', name: 'Potężne uderzenie', icon: '✦', cost: 4, stances: 'AZ', text: '13 obrażeń · celność −1 · priorytet 10 · CD 1', kind: 'enemy' },
  { id: 'counter', name: 'Kontratak', icon: '↶', cost: 3, stances: 'ZD', text: 'Parowanie 6 · jedna riposta 7 · CD 1', kind: 'self' },
  { id: 'feint', name: 'Zwód', icon: '◇', cost: 2, stances: 'AZ', text: '6 / 9 obrażeń · ignoruje ochronę · priorytet 30', kind: 'enemy' },
  { id: 'cover', name: 'Osłona', icon: '◈', cost: 2, stances: 'ZD', text: 'Ochrona 6 · przejmij pierwszy atak na sojusznika', kind: 'ally' },
  { id: 'charge', name: 'Szarża', icon: '➶', cost: 3, stances: 'A', text: 'Z Blisko do Zwarcia + cios 6 · priorytet 20', kind: 'enemy' },
  { id: 'prepare', name: 'Przygotowanie', icon: '☀', cost: 0, stances: 'AZD', text: 'Regeneracja 5 · w następnej rundzie +2 / +3', kind: 'self' },
  { id: 'strike', name: 'Atak', icon: '†', cost: 0, stances: 'AZD', text: '8 obrażeń · priorytet 20', kind: 'enemy' },
  { id: 'brace', name: 'Obrona', icon: '⬡', cost: 0, stances: 'AZD', text: 'Ochrona 6 na tę rundę', kind: 'self' },
  { id: 'approach', name: 'Podejście', icon: '→', cost: 0, stances: 'AZD', text: 'Dołącz do grupy lub zwiąż bliskiego wroga', kind: 'other' },
  { id: 'disengage', name: 'Odskok', icon: '↗', cost: 1, stances: 'AZD', text: 'Usuń wszystkie związania · pozostań Blisko', kind: 'self' },
  { id: 'withdraw', name: 'Odwrót', icon: '⇥', cost: 0, stances: 'AZD', text: 'Będąc wolnym, oddal się od wszystkich', kind: 'self' },
];
function fixture(scenario: string): Actor[] {
  const enemy = (id: string, name: string, hp: number, group: string, stance: Stance, intent: string, priority: string, slot: boolean, armor = 0): Actor => ({ id, name, hp, group, stance, intent, priority, slot, armor, target: 'h01' });
  if (scenario === 'T1') return [enemy('e01', 'Osiłek', 26, 'g0', 'A', 'Potężne uderzenie', '10', true, 1)];
  if (scenario === 'T5') return [enemy('e01', 'Łucznik', 12, 'g1', 'Z', 'Strzał', '20', true)];
  return [enemy('e01', 'Bandyta I', 14, 'g0', 'A', 'Atak', '20', true), enemy('e02', 'Bandyta II', 14, 'g0', 'A', 'Atak', '20', true), enemy('e03', 'Strażnik', 20, 'g0', 'D', 'Obrona', '—', false, 1), enemy('e04', 'Łucznik I', 12, 'g1', 'Z', 'Czekanie · ochrona 3', '—', false), enemy('e05', 'Łucznik II', 12, 'g1', 'Z', 'Czekanie · ochrona 3', '—', false)];
}

export default function CombatPrototype({ variant }: { variant: 'A' | 'B' | 'C' }) {
  const router = useRouter();
  const [scenario, setScenario] = useState('T7');
  const [stance, setStance] = useState<Stance>('Z');
  const [actionId, setAction] = useState('feint');
  const [target, setTarget] = useState('e01');
  const [perspective, setPerspective] = useState('h01');
  const [step, setStep] = useState(0);
  const [record, setRecord] = useState<string[]>([]);
  const actors = fixture(scenario);
  const companion = scenario === 'T7';
  const engaged = scenario === 'T5' ? [] : scenario === 'T1' ? ['e01'] : ['e01', 'e02'];
  const action = actions.find(a => a.id === actionId)!;
  const relation = (id: string, from = 'h01') => id === from ? 'Na siebie' : ((from === 'h01' && engaged.includes(id)) || (id === 'h01' && engaged.includes(from))) ? 'Zwarcie' : (actors.find(a => a.id === id)?.group ?? 'g0') === (actors.find(a => a.id === from)?.group ?? 'g0') ? 'Blisko' : 'Daleko';
  const reason = (a: typeof action, id?: string): string => {
    if (!a.stances.includes(stance)) return `Wymaga postawy ${a.stances.split('').map(s => names[s as Stance]).join(' lub ')}`;
    if (a.id === 'counter' && !engaged.length) return 'Wymaga związania';
    if (a.id === 'cover' && !companion) return 'Wymaga sojusznika Blisko';
    if (['charge', 'approach', 'withdraw'].includes(a.id) && engaged.length) return 'Najpierw wykonaj Odskok';
    if (a.id === 'disengage' && !engaged.length) return 'Nie masz żadnych związań';
    if (id && a.kind === 'enemy' && !id.startsWith('e')) return 'Wybierz przeciwnika';
    if (id && ['heavy', 'feint', 'strike'].includes(a.id) && relation(id) !== 'Zwarcie') return `Cel jest ${relation(id)}`;
    if (id && a.id === 'charge' && relation(id) !== 'Blisko') return 'Szarża wymaga wroga Blisko';
    if (id && a.id === 'approach' && (relation(id) === 'Zwarcie' || (id === 'c01' && relation(id) === 'Blisko'))) return 'Ten cel nie wymaga Podejścia';
    return '';
  };
  const selectedTarget = action.kind === 'self' ? 'h01' : action.kind === 'ally' ? 'c01' : target;
  const invalid = reason(action, selectedTarget);
  function changeVariant(offset: number) {
    const keys = ['A', 'B', 'C'];
    router.replace(`?variant=${keys[(keys.indexOf(variant) + offset + 3) % 3]}`, { scroll: false });
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable], [role="slider"]')) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const keys = ['A', 'B', 'C'];
        router.replace(`?variant=${keys[(keys.indexOf(variant) + (e.key === 'ArrowLeft' ? 2 : 1)) % 3]}`, { scroll: false });
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [router, variant]);
  const choose = (id: string) => { setAction(id); setRecord([]); };
  const hero = <section className="wp-hero wp-box"><span className="wp-eyebrow">TWOJA POSTAĆ · h01</span><h2>Wędrowiec</h2><div className="wp-stats"><strong>40 <small>/ 40 HP</small></strong><strong>10 <small>/ 10 wytrz.</small></strong></div><div className="wp-health"/><p>Pancerz 1 · Atak {4 + mods[stance]} · Obrona {4 - mods[stance]}</p><p>⛓ {engaged.length ? `Związany z: ${engaged.map(id => actors.find(a => a.id === id)?.name).join(', ')}` : 'Wolny — możesz się przemieszczać'}</p><small>Przygotowanie: nieaktywne · wszystkie karty gotowe</small></section>;
  const foes = <section className="wp-threats"><div className="wp-section-title"><h2>Jawne zamiary</h2><span>{actors.filter(a => a.slot).length}/2 miejsc ataku</span></div><div className="wp-enemies">{actors.map(a => <button key={a.id} className={`wp-enemy ${target === a.id ? 'selected' : ''} ${!reason(action, a.id) && action.kind !== 'self' && action.kind !== 'ally' ? 'legal' : ''}`} onClick={() => { setTarget(a.id); setRecord([]); }} aria-pressed={target === a.id}><span className="wp-enemy-top"><small>{a.id} · {relation(a.id, perspective)}</small><b>{a.slot ? '⚔ Aktywny' : '◇ Wsparcie / czeka'}</b></span><h3>{a.name} <span>{a.hp} HP</span></h3><p>{names[a.stance]} · pancerz {a.armor}</p><strong>{a.intent}</strong><p>→ {a.slot ? 'Wędrowiec' : 'Na siebie'} · priorytet {a.priority}</p>{action.kind !== 'self' && action.kind !== 'ally' && <small>{reason(action, a.id) || '✓ Legalny cel wybranej akcji'}</small>}</button>)}</div></section>;
  const ally = companion && <section className="wp-box wp-ally"><span className="wp-eyebrow">TOWARZYSZ · c01 · PLAN ZAMROŻONY</span><h3>Łucznik drużyny <span>18 HP · 8 wytrz.</span></h3><p>Strzał → Bandyta I · Zrównoważona · priorytet 20</p><small>Cel nie zmieni się, nawet jeśli wyeliminujesz go wcześniej.</small></section>;
  const stances = <section className="wp-box"><span className="wp-eyebrow">01 / WYBIERZ POSTAWĘ</span><div className="wp-stances">{(['A', 'Z', 'D'] as Stance[]).map(s => <button key={s} aria-pressed={stance === s} onClick={() => { setStance(s); setRecord([]); }}><strong>{names[s]}</strong><small>Atak {mods[s] > 0 ? '+' : ''}{mods[s]} · Obrona {mods[s] < 0 ? '+' : ''}{-mods[s]}</small></button>)}</div></section>;
  const cards = <section className="wp-box"><span className="wp-eyebrow">02 / JEDNA KARTA LUB CZYNNOŚĆ</span><div className="wp-cards">{actions.map((a, index) => <button key={a.id} className={`${actionId === a.id ? 'selected' : ''} ${index > 5 ? 'basic' : ''}`} disabled={!!reason(a)} onClick={() => choose(a.id)}><span className="wp-card-top"><b>{a.icon}</b><small>{a.cost} wytrz.</small></span><strong>{a.name}</strong><small>{a.text}</small>{reason(a) && <small className="wp-reason">{reason(a)}</small>}</button>)}</div></section>;
  const targeting = <section className="wp-box"><span className="wp-eyebrow">03 / CEL I RELACJE</span><p><strong>{action.name}</strong> → {selectedTarget === 'h01' ? 'Wędrowiec (na siebie)' : selectedTarget === 'c01' ? 'Łucznik drużyny' : actors.find(a => a.id === target)?.name}</p><p>{invalid || '✓ Wybór jest legalny. Cel możesz zmienić na liście przeciwników.'}</p><label>Odległości z perspektywy <select value={perspective} onChange={e => setPerspective(e.target.value)}><option value="h01">Wędrowca</option>{companion && <option value="c01">Towarzysza</option>}{actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><div className="wp-relations">{[{id:'h01',name:'Wędrowiec'}, ...(companion ? [{id:'c01',name:'Towarzysz'}] : []), ...actors].filter(a => a.id !== perspective).map(a => <span key={a.id}>{a.name}: <b>{relation(a.id, perspective === 'h01' ? 'h01' : perspective)}</b></span>)}</div></section>;
  const preview = <section className="wp-box wp-preview" aria-live="polite"><span className="wp-eyebrow">PODGLĄD DECYZJI · DEMO UI</span><h2>{invalid ? 'Zmień wybór' : action.name}</h2><p>{names[stance]} → {selectedTarget}</p><div className="wp-stats"><strong>{action.cost}<small> koszt teraz</small></strong><strong>+{actionId === 'prepare' ? 5 : 2}<small> na końcu rundy*</small></strong></div><p>* Tylko jeśli walka nadal trwa. Klikanie kart nie pobiera wytrzymałości.</p><div className="wp-demo-note">Makieta podglądu: końcowe HP, anulowania i związania wymagają nowego silnika. Ten ekran nie symuluje pełnej rundy.</div><button className="wp-primary" disabled={!!invalid} onClick={() => setRecord([`Wybrano: ${names[stance]} · ${action.name} → ${selectedTarget}.`, 'Zatwierdzenie demonstracyjne. Stan walki pozostaje bez zmian; brak podłączonego silnika.'])}>Zatwierdź wybór · demo →</button><button className="wp-quiet" onClick={() => setRecord(['Poddanie — demonstracja ekranu zakończenia. Zrestartuj scenariusz, aby wrócić do wyboru.'])}>Poddaj walkę · demo</button></section>;
  return <main className={`wp wp-${variant}`}><div className="wp-heading"><div><span className="wp-eyebrow">SIMPLE-RPG-ENGINE / LABORATORIUM WALKI</span><h1>Każda decyzja ma swoją cenę.</h1><p>Runda 1 / 30 · Wybór · {variants[variant]}</p></div><label>Scenariusz <select value={scenario} onChange={e => { setScenario(e.target.value); setTarget('e01'); setRecord([]); setStep(0); }}><option value="T1">T1 · Pojedynek z Osiłkiem</option><option value="T5">T5 · Dotrzeć do łucznika</option><option value="T7">T7 · Pięciu wrogów i towarzysz</option></select></label></div><div className="wp-banner">PROTOTYP INTERFEJSU · stan w pamięci · przykłady pierwszej rundy ze specyfikacji MVP 1.0</div>
    {variant === 'A' && <><div className="wp-arena">{hero}<div>{foes}{ally}</div></div><div className="wp-decision"><div>{stances}{cards}{targeting}</div>{preview}</div></>}
    {variant === 'B' && <><div className="wp-briefing">{foes}{ally}</div><div className="wp-guided"><aside>{hero}<p className="wp-guidance">Najpierw przeczytaj zamiary. Potem wybierz sposób odpowiedzi. Ruch również zużywa całą akcję.</p></aside><div><nav className="wp-steps" aria-label="Etapy decyzji">{['Postawa', 'Akcja', 'Cel i decyzja'].map((s,i) => <button key={s} aria-pressed={step === i} onClick={() => setStep(i)}>{i+1}. {s}</button>)}</nav>{step === 0 ? stances : step === 1 ? cards : <>{targeting}{preview}</>}<div className="wp-step-nav"><button disabled={step === 0} onClick={() => setStep(step-1)}>← Wstecz</button><button disabled={step === 2} onClick={() => setStep(step+1)}>Dalej →</button></div></div></div></>}
    {variant === 'C' && <div className="wp-command"><aside>{hero}{stances}{ally}</aside><div>{foes}{targeting}</div><aside>{cards}{preview}</aside></div>}
    <section className="wp-box wp-journal"><h2>Dziennik demonstracji</h2>{record.length ? record.map((line,i) => <p key={i}>{line}</p>) : <p>Runda 1 · Zamiary ujawnione. Oczekiwanie na wybór bohatera.</p>}<button onClick={() => { setStance('Z'); setAction('feint'); setTarget('e01'); setPerspective('h01'); setRecord([]); setStep(0); }}>Restart scenariusza</button></section><details className="wp-state"><summary>Pełny stan widoku i założenia prototypu</summary><pre>{JSON.stringify({ scenario, round:1, phase:'CHOOSE', variant, hero:{hp:40,stamina:10,groupId:'g0',prepared:false}, stance, action:actionId, target:selectedTarget, perspective, engagements:engaged.map(id=>['h01',id]), actors, validation:invalid || 'legal', simulation:false },null,2)}</pre></details>
    {process.env.NODE_ENV !== 'production' && <nav className="wp-switcher" aria-label="Wariant prototypu"><button onClick={() => changeVariant(-1)} aria-label="Poprzedni wariant">←</button><span><small>PROTOTYP {variant} / 3</small><strong>{variants[variant]}</strong></span><button onClick={() => changeVariant(1)} aria-label="Następny wariant">→</button></nav>}
  </main>;
}
