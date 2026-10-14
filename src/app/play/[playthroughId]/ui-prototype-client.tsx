'use client';

// THROWAWAY UI exploration. All actions below only update local preview state.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { MapView } from '@/engine/map';
import type { RenderedJournalEntry } from '@/app/lib/journal';
import { JournalEntries } from './journal/journal-entries';
import styles from './ui-prototype.module.css';

type Panel = 'character' | 'inventory' | 'journal' | 'map';
type Data = {
  playthroughId: string; demo: boolean; scenarioTitle: string; title: string; location: string; lang: string;
  html: string; illustration?: { src: string; alt: string };
  choices: { id: string; text: string; detail: string }[];
  map: MapView;
  character: { name: string; template: string; health: number; attributes: { id: string; label: string; value: number }[] };
  items: { id: string; name: string; description: string; quantity: number; equipped: boolean }[];
  journal: { entries: RenderedJournalEntry[]; nextCursor: number | null; total: number };
  state: object;
  text: { character: string; inventory: string; journal: string; map: string; health: string; choices: string; close: string; equipped: string; prototype: string; variants: string[]; descriptions: string[]; adventure: string; chapter: string; journey: string; here: string; decide: string; entries: string; prev: string; next: string; preview: string; hint: string; state: string; demo: string; live: string; original: string; noImage: string };
};

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'journal' ? <><path d="M3 4q5-1 9 2 4-3 9-2v15q-5-1-9 2-4-3-9-2Z"/><path d="M12 6v15M6 9l3 1M15 10l3-1M6 13l3 1M15 14l3-1"/></> :
    name === 'inventory' ? <><path d="M5 8h14l-1 13H6ZM9 8V6a3 3 0 0 1 6 0v2M5 12h14"/><path d="M10 12v3h4v-3"/></> :
    name === 'character' ? <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2M8 15l4 5 4-5"/></> :
    name === 'health' ? <path d="m12 21-9-9C-2 4 7 0 12 7c5-7 14-3 9 5Z"/> :
    name === 'might' ? <><path d="m5 19 14-14M15 3l6 6M3 15l6 6M17 3l4 4M3 21l3-3"/></> :
    name === 'agility' ? <><path d="m13 2-8 12h7l-1 8 8-12h-7Z"/></> :
    name === 'wits' ? <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></> :
    name === 'presence' ? <><path d="m3 6 4 5 5-8 5 8 4-5-2 13H5ZM5 22h14"/></> :
    <><circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4ZM12 1v3M12 20v3M1 12h3M20 12h3"/></>}
  </svg>;
}

function Art({ data }: { data: Data }) {
  return <figure className={styles.art}>{data.illustration ? <img src={data.illustration.src} alt={data.illustration.alt} /> : <div className={styles.noArt}><Icon name="map" size={90}/><p>{data.text.noImage}</p></div>}<figcaption><Icon name="map" size={16}/><span lang={data.lang}>{data.location}</span></figcaption></figure>;
}

function WorldMap({ data }: { data: Data }) {
  const nodes = data.map.nodes;
  const minX = Math.min(...nodes.map((n) => n.x)); const maxX = Math.max(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y)); const maxY = Math.max(...nodes.map((n) => n.y));
  const x = (value: number) => maxX === minX ? 50 : 19 + (value - minX) / (maxX - minX) * 62;
  const y = (value: number) => maxY === minY ? 45 : 17 + (value - minY) / (maxY - minY) * 57;
  return <div className={styles.worldMap}>
    <svg viewBox="0 0 100 100" aria-hidden="true" className={styles.terrain}>
      {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M-10 ${i*9} Q30 ${i*9-23} 60 ${i*9+6} T120 ${i*9-5}`} />)}
      <path className={styles.river} d="M70-10Q30 30 57 48T42 110"/>
      {data.map.edges.map((edge) => {
        const from = nodes.find((n) => n.id === edge.from); const to = nodes.find((n) => n.id === edge.to);
        return from && to ? <line className={styles.mapEdge} key={`${edge.from}-${edge.to}`} x1={x(from.x)} y1={y(from.y)} x2={x(to.x)} y2={y(to.y)}/> : null;
      })}
    </svg>
    <span className={styles.north}>N<br/>↑</span>
    {nodes.map((node) => <div key={node.id} className={`${styles.mapNode} ${node.isCurrent ? styles.currentNode : ''}`} style={{ left: `${x(node.x)}%`, top: `${y(node.y)}%` }}>
      <span className={styles.pin}>{node.isCurrent ? <Icon name="map" size={20}/> : node.status === 'unknown' ? '?' : '◆'}</span>
      <span lang={data.lang}>{node.name}</span>{node.isCurrent && <small>{data.text.here}</small>}
    </div>)}
    <span className={styles.mapScale}>───── &nbsp; {data.text.journey}</span>
  </div>;
}

function Character({ data, compact = false }: { data: Data; compact?: boolean }) {
  return <section className={`${styles.character} ${compact ? styles.compactCharacter : ''}`} aria-label={data.text.character}>
    <div className={styles.characterHeading}><div className={styles.medallion}><Icon name="character" size={34}/></div><div><h3>{data.character.name}</h3><p lang={data.lang}>{data.character.template}</p></div></div>
    <div className={styles.healthLabel}><span><Icon name="health" size={15}/> {data.text.health}</span><b>{data.character.health}<small> / 12</small></b></div>
    <div className={styles.healthBar} role="meter" aria-label={data.text.health} aria-valuemin={0} aria-valuemax={12} aria-valuenow={data.character.health}><span style={{width: `${data.character.health / 12 * 100}%`}}/></div>
    {!compact && <div className={styles.attributes}>{data.character.attributes.map((attr) => <div key={attr.id}><Icon name={attr.id}/><b>{attr.value}</b><small>{attr.label}</small></div>)}</div>}
  </section>;
}

function Tools({ data, open }: { data: Data; open: (panel: Panel) => void }) {
  return <nav className={styles.tools} aria-label={data.text.adventure}>{(['character', 'inventory', 'journal', 'map'] as const).map((panel) => <button key={panel} onClick={() => open(panel)}><Icon name={panel}/><span>{data.text[panel]}</span>{panel === 'journal' && <small>{data.journal.total}</small>}{panel === 'inventory' && <small>{data.items.length}</small>}</button>)}</nav>;
}

function Decisions({ data, selected, choose }: { data: Data; selected: string | null; choose: (id: string) => void }) {
  return <section className={styles.decisions} aria-label={data.text.choices}><p className={styles.eyebrow}>{data.text.decide}</p>{data.choices.map((choice, i) => <button key={choice.id} className={selected === choice.id ? styles.selectedChoice : ''} aria-pressed={selected === choice.id} onClick={() => choose(choice.id)}><span className={styles.choiceNumber}>{String(i + 1).padStart(2, '0')}</span><span lang={data.lang}>{choice.text}{choice.detail && <small>{choice.detail}</small>}</span><span aria-hidden="true">↗</span></button>)}{selected && <p role="status" className={styles.previewNotice}>{data.text.preview}</p>}</section>;
}

function Story({ data }: { data: Data }) {
  return <><p className={styles.eyebrow}>{data.text.chapter}</p><h1 lang={data.lang}>{data.title}</h1><div className={styles.narration} lang={data.lang} dangerouslySetInnerHTML={{__html: data.html}}/></>;
}

type VariantProps = { data: Data; selected: string | null; choose: (id: string) => void; open: (panel: Panel) => void };
export function VariantA({ data, selected, choose, open }: VariantProps) {
  return <div className={styles.chronicle}>
    <article className={styles.chronicleStory}><div className={styles.storyTitle}><p className={styles.eyebrow}>{data.text.chapter}</p><h1 lang={data.lang}>{data.title}</h1></div><Art data={data}/><div className={styles.storyBody}><div className={styles.narration} lang={data.lang} dangerouslySetInnerHTML={{__html:data.html}}/><Decisions data={data} selected={selected} choose={choose}/></div></article>
    <aside className={styles.sidebar}><Character data={data}/><Tools data={data} open={open}/><section className={styles.mapCard}><div className={styles.sectionHeading}><h3>{data.text.map}</h3><Icon name="map"/></div><WorldMap data={data}/></section></aside>
  </div>;
}
export function VariantB({ data, selected, choose, open }: VariantProps) {
  return <div className={styles.atlas}><aside className={styles.atlasRail}><Character data={data} compact/><Tools data={data} open={open}/><div className={styles.railTitle}><Icon name="map" size={46}/><p>{data.text.adventure}</p><h2 lang={data.lang}>{data.scenarioTitle}</h2></div></aside><section className={styles.atlasWorld}><div className={styles.sectionHeading}><p className={styles.eyebrow}>{data.text.journey}</p><span lang={data.lang}>{data.location}</span></div><WorldMap data={data}/><div className={styles.atlasThumbnail}><Art data={data}/></div></section><article className={styles.atlasStory}><Story data={data}/><Decisions data={data} selected={selected} choose={choose}/></article></div>;
}
export function VariantC({ data, selected, choose, open }: VariantProps) {
  return <div className={styles.stage}><section className={styles.stageScene}><Art data={data}/><article className={styles.stageStory}><Story data={data}/></article></section><aside className={styles.stageDecisions}><Character data={data} compact/><Decisions data={data} selected={selected} choose={choose}/><Tools data={data} open={open}/></aside></div>;
}

function PreviewModal({ panel, data, close }: { panel: Panel; data: Data; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!; const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; focused?.focus(); };
  }, []);
  let content: ReactNode;
  if (panel === 'journal') content = data.demo ? <div className={styles.demoJournal}>{data.journal.entries.map((entry) => <article key={entry.seq}><p className={styles.eyebrow}>{entry.label}</p><div dangerouslySetInnerHTML={{__html:entry.html}}/></article>)}</div> : <JournalEntries playthroughId={data.playthroughId} initialEntries={data.journal.entries} initialNextCursor={data.journal.nextCursor} total={data.journal.total}/>;
  else if (panel === 'character') content = <Character data={data}/>;
  else if (panel === 'map') content = <WorldMap data={data}/>;
  else content = <div className={styles.itemGrid}>{data.items.map((item) => <article key={item.id}><div className={styles.itemIcon}><Icon name={item.equipped ? 'might' : 'inventory'} size={38}/></div><h3 lang={data.lang}>{item.name} <small>×{item.quantity}</small></h3>{item.equipped && <span className={styles.itemTag}>{data.text.equipped}</span>}<p lang={data.lang}>{item.description}</p></article>)}</div>;
  return <dialog ref={ref} className={styles.modal} aria-labelledby="prototype-modal-title" onCancel={close} onClick={(e) => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } }}><header className={styles.modalHeader}><div><p className={styles.eyebrow}>{data.scenarioTitle}</p><h2 id="prototype-modal-title"><Icon name={panel} size={28}/> {data.text[panel]}</h2>{panel === 'journal' && <p>{data.text.entries}</p>}</div><button aria-label={data.text.close} onClick={close}>×</button></header><div className={styles.modalBody}>{content}</div></dialog>;
}

export function GameUiPrototype({ variant, data }: { variant: string; data: Data }) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const index = ['A', 'B', 'C'].indexOf(variant); const current = index < 0 ? 0 : index;
  const [panel, setPanel] = useState<Panel | null>(null); const [selected, setSelected] = useState<string | null>(null);
  const cycle = (direction: number) => { const query = new URLSearchParams(params.toString()); query.set('variant', ['A','B','C'][(current + direction + 3) % 3]!); router.replace(`${pathname}?${query}`, {scroll:false}); };
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (panel || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); const query = new URLSearchParams(window.location.search);
        query.set('variant', ['A','B','C'][(current + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3]!);
        router.replace(`${pathname}?${query}`, {scroll:false});
      }
    };
    document.addEventListener('keydown', handle); return () => document.removeEventListener('keydown', handle);
  }, [current, panel, pathname, router]);
  const props = { data, selected, choose: setSelected, open: setPanel };
  return <main className={`${styles.prototype} ${styles[`variant${['A','B','C'][current]}`]}`} data-ui-prototype>
    <header className={styles.adventureHeader}><div className={styles.brand}><Icon name="map" size={30}/><div><p className={styles.eyebrow}>{data.text.adventure}</p><strong lang={data.lang}>{data.scenarioTitle}</strong></div></div><span className={styles.locationBadge}><span/> <span lang={data.lang}>{data.location}</span></span></header>
    {current === 0 ? <VariantA {...props}/> : current === 1 ? <VariantB {...props}/> : <VariantC {...props}/>}
    <footer className={styles.prototypeMeta}><span>{data.demo ? data.text.demo : data.text.live} · {data.text.hint}</span><details><summary>{data.text.state}</summary><pre>{JSON.stringify({ variant: ['A','B','C'][current], panel, selectedChoice: selected, ...data.state }, null, 2)}</pre></details>{!data.demo && <a href={pathname}>{data.text.original}</a>}</footer>
    {panel && <PreviewModal panel={panel} data={data} close={() => setPanel(null)}/>}
    {process.env.NODE_ENV !== 'production' && <nav className={styles.switcher} aria-label={data.text.prototype}><button onClick={() => cycle(-1)} aria-label={data.text.prev}>←</button><div><small>{data.text.prototype} · {current + 1}/3</small><strong>{['A','B','C'][current]} · {data.text.variants[current]}</strong></div><button onClick={() => cycle(1)} aria-label={data.text.next}>→</button><p>{data.text.descriptions[current]}</p></nav>}
  </main>;
}
