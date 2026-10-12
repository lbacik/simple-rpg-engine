// PROTOTYPE (throwaway): three variants of the side panel where Character,
// Inventory and Journal open in modals instead of tabs. Switch with
// `?variant=A|B|C|current` on /play/[playthroughId] (dev builds only).
//
//   A  Separate modals: character sheet with attribute pips, inventory as
//      paper-doll slots + item tiles with a detail pane.
//   B  One "ledger" modal with tabs: a two-page book spread for the
//      Character, an inventory table grouped by kind.
//   C  Slide-over drawer from the right: stat-block Character, filterable
//      compact inventory rows, quick switching inside the drawer.
//
// Item actions (Equip / Unequip / Use) are stubs here: they show a toast and
// change nothing. The question is what this should look like, not wiring.

'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ProtoAction, ProtoItem, ProtoSheet } from './side-panel.prototype-data';
import './side-panel.prototype.css';

type Panel = 'character' | 'inventory' | 'journal';

/* ------------------------------------------------------------------ icons */

type IconName =
  | 'weapon'
  | 'outfit'
  | 'talisman'
  | 'consumable'
  | 'key'
  | 'character'
  | 'inventory'
  | 'journal'
  | 'close'
  | 'external';

const ICON_PATHS: Record<IconName, ReactNode> = {
  weapon: (
    <>
      <path d="M20 4 9.5 14.5" />
      <path d="M20 4h-4M20 4v4" />
      <path d="M6.5 11.5l6 6" />
      <path d="M8.5 15.5 4 20" />
    </>
  ),
  outfit: <path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3q-4 3-8 0Z" />,
  talisman: (
    <>
      <path d="M7 3q5 7 10 0" />
      <circle cx="12" cy="15" r="5" />
      <path d="M12 12l2 3-2 3-2-3Z" />
    </>
  ),
  consumable: (
    <>
      <path d="M10 3h4M10.5 3v6l-5 9.5Q5 21 7.5 21h9q2.5 0 2-2.5l-5-9.5V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4.5" />
      <path d="M11.2 11.2 20 20M16 16l2-2M18.5 18.5l2-2" />
    </>
  ),
  character: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21q0-7 8-7t8 7" />
    </>
  ),
  inventory: <path d="M5 9h14l-1 12H6ZM9 9V7q0-3.5 3-3.5T15 7v2" />,
  journal: <path d="M4 4.5q4-1 8 1.5 4-2.5 8-1.5V19q-4-1-8 1-4-2-8-1ZM12 6v14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
};

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

function itemIcon(item: ProtoItem): IconName {
  if (item.kind === 'equipment') return item.slot ?? 'weapon';
  return item.kind === 'consumable' ? 'consumable' : 'key';
}

const SLOT_LABELS = { weapon: 'Weapon', outfit: 'Outfit', talisman: 'Talisman' } as const;

/* ------------------------------------------------------- shared plumbing */

function Modal({
  open,
  onClose,
  label,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`proto-modal ${className ?? ''}`}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="proto-close" onClick={onClose} aria-label="Close">
      <Icon name="close" size={20} />
    </button>
  );
}

function useStub(): [string | undefined, (action: string, target: string) => void] {
  const [toast, setToast] = useState<string>();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 2200);
    return () => clearTimeout(timer);
  }, [toast]);
  return [toast, (action, target) => setToast(`Prototype: “${action} ${target}” is a stub.`)];
}

function Toast({ text }: { text: string | undefined }) {
  return text ? (
    <p className="proto-toast" role="status">
      {text}
    </p>
  ) : null;
}

function ActionButton({
  action,
  target,
  onStub,
  compact,
}: {
  action: ProtoAction | undefined;
  target: string;
  onStub: (action: string, target: string) => void;
  compact?: boolean;
}) {
  if (!action) return null;
  return (
    <span className={compact ? 'proto-action compact' : 'proto-action'}>
      <button
        type="button"
        className="button secondary"
        disabled={action.reason !== undefined}
        title={action.reason}
        onClick={() => onStub(action.label, target)}
      >
        {action.label}
      </button>
      {action.reason && !compact ? <span className="reason">{action.reason}</span> : null}
    </span>
  );
}

function JournalBody({ sheet, playthroughId }: { sheet: ProtoSheet; playthroughId: string }) {
  return (
    <div className="proto-journal">
      <p className="meta">
        {sheet.journalTotal} entries · latest first ·{' '}
        <a href={`/play/${playthroughId}/journal`} target="_blank" rel="noreferrer">
          Open in new tab <Icon name="external" size={14} />
        </a>
      </p>
      <ol>
        {sheet.journal.map((entry) => (
          <li key={entry.seq}>
            <p className="meta">
              {entry.label} · step {entry.step}
            </p>
            <div dangerouslySetInnerHTML={{ __html: entry.html }} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function healthLow(sheet: ProtoSheet): boolean {
  return sheet.health <= Math.ceil(sheet.maxHealth / 3);
}

/** Initial in a ring whose fill is the Health fraction (as in the Combat arena). */
function Medal({ sheet, size }: { sheet: ProtoSheet; size: 'sm' | 'lg' }) {
  const percent = Math.round((sheet.health / sheet.maxHealth) * 100);
  return (
    <span
      className={`proto-medal ${size}${healthLow(sheet) ? ' low' : ''}`}
      style={{ ['--hp' as string]: `${percent}%` }}
      aria-hidden="true"
    >
      <span>{sheet.name.slice(0, 1).toUpperCase()}</span>
    </span>
  );
}

function HealthSegments({ sheet }: { sheet: ProtoSheet }) {
  return (
    <span
      className={`proto-segments${healthLow(sheet) ? ' low' : ''}`}
      role="img"
      aria-label={`Health ${sheet.health} of ${sheet.maxHealth}`}
    >
      {Array.from({ length: sheet.maxHealth }, (_, index) => (
        <span key={index} className={index < sheet.health ? 'on' : ''} />
      ))}
    </span>
  );
}

/* ============================================================ variant A */

function AttributePips({ attribute }: { attribute: ProtoSheet['attributes'][number] }) {
  return (
    <span className="proto-pips" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={index < attribute.base ? 'base' : index < attribute.effective ? 'bonus' : ''}
        />
      ))}
    </span>
  );
}

function CharacterSheetA({ sheet }: { sheet: ProtoSheet }) {
  return (
    <div className="proto-a-sheet">
      <header className="proto-a-hero">
        <Medal sheet={sheet} size="lg" />
        <div>
          <h2>{sheet.name}</h2>
          <p className="meta">
            {sheet.templateName ?? 'Unknown template'} · {sheet.locationName}
          </p>
          {sheet.templateDescription ? <p className="proto-lede">{sheet.templateDescription}</p> : null}
        </div>
      </header>
      <div className="proto-a-cols">
        <section aria-label="Attributes">
          <h3>Attributes</h3>
          <ul className="proto-a-attrs">
            {sheet.attributes.map((attribute) => (
              <li key={attribute.key}>
                <span className="proto-a-attr-name">{attribute.label}</span>
                <AttributePips attribute={attribute} />
                <span className="proto-a-attr-total">{attribute.effective}</span>
                {attribute.counted.length > 0 || attribute.ignored.length > 0 ? (
                  <span className="proto-a-attr-src">
                    base {attribute.base}
                    {attribute.counted.map((name) => ` · +1 ${name}`)}
                    {attribute.ignored.length > 0 ? (
                      <s title="Bonus capped at +2">
                        {attribute.ignored.map((name) => ` +1 ${name}`)}
                      </s>
                    ) : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="proto-legend meta">
            <span className="proto-pips">
              <span className="base" />
            </span>{' '}
            base{' '}
            <span className="proto-pips">
              <span className="bonus" />
            </span>{' '}
            equipment bonus (max +2)
          </p>
        </section>
        <section aria-label="Condition">
          <h3>Health</h3>
          <p className="proto-big">
            {sheet.health}
            <span className="meta"> / {sheet.maxHealth}</span>
          </p>
          <HealthSegments sheet={sheet} />
          <h3>Equipped</h3>
          <ul className="proto-a-mini-slots">
            {sheet.slots.map(({ slot, item }) => (
              <li key={slot} className={item ? '' : 'empty'}>
                <Icon name={slot} size={18} />
                <span className="meta">{SLOT_LABELS[slot]}</span>
                <span>{item?.name ?? '—'}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function InventoryA({
  sheet,
  onStub,
}: {
  sheet: ProtoSheet;
  onStub: (action: string, target: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(sheet.items[0]?.id);
  const selected = sheet.items.find((item) => item.id === selectedId);
  return (
    <div className="proto-a-inv">
      <h2>Inventory</h2>
      {sheet.inCombat ? <p className="meta">Inventory actions are unavailable during Combat.</p> : null}
      <div className="proto-a-inv-grid">
        <section aria-label="Equipped" className="proto-a-doll">
          <h3>Equipped</h3>
          {sheet.slots.map(({ slot, item, action }) => (
            <div key={slot} className={item ? 'proto-a-slot' : 'proto-a-slot empty'}>
              <span className="proto-a-slot-icon">
                <Icon name={slot} size={28} />
              </span>
              <div>
                <p className="meta">{SLOT_LABELS[slot]}</p>
                <p>
                  <strong>{item?.name ?? 'Empty'}</strong>
                  {item?.magic ? <span className="proto-spark"> ✦</span> : null}
                </p>
                {item ? <p className="meta">{item.details.slice(1).join(' · ') || ' '}</p> : null}
                <ActionButton action={action} target={item?.name ?? ''} onStub={onStub} compact />
              </div>
            </div>
          ))}
        </section>
        <section aria-label="Carried">
          <h3>Carried</h3>
          {sheet.items.length === 0 ? (
            <p>Empty.</p>
          ) : (
            <ul className="proto-a-tiles">
              {sheet.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`proto-a-tile${item.id === selectedId ? ' selected' : ''}${item.equippedIn ? ' equipped' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={item.id === selectedId}
                  >
                    {item.magic ? <span className="proto-spark corner">✦</span> : null}
                    {item.quantity > 1 ? <span className="proto-qty">×{item.quantity}</span> : null}
                    <Icon name={itemIcon(item)} size={34} />
                    <span className="proto-a-tile-name">{item.name}</span>
                    {item.equippedIn ? <span className="proto-ribbon">equipped</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected ? (
            <div className="proto-a-detail">
              <p>
                <strong>{selected.name}</strong> × {selected.quantity}
                {selected.magic ? <span className="magic"> ✨ magic</span> : null}
              </p>
              {selected.description ? <p className="proto-lede">{selected.description}</p> : null}
              <p className="proto-chips">
                {selected.details.map((detail) => (
                  <span key={detail}>{detail}</span>
                ))}
              </p>
              <ActionButton action={selected.action} target={selected.name} onStub={onStub} />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function VariantA({
  sheet,
  map,
  playthroughId,
}: {
  sheet: ProtoSheet;
  map: ReactNode;
  playthroughId: string;
}) {
  const [open, setOpen] = useState<Panel | null>(null);
  const [toast, stub] = useStub();
  const close = () => setOpen(null);
  const launchers: { panel: Panel; label: string; sub: string }[] = [
    { panel: 'character', label: 'Character', sub: `Health ${sheet.health}/${sheet.maxHealth}` },
    { panel: 'inventory', label: 'Inventory', sub: `${sheet.items.length} items` },
    { panel: 'journal', label: 'Journal', sub: `${sheet.journalTotal} entries` },
  ];
  return (
    <aside className="side proto-side" aria-label="Character and inventory">
      <div className="proto-map">{map}</div>
      <div className="proto-a-status">
        <Medal sheet={sheet} size="sm" />
        <div>
          <strong>{sheet.name}</strong>
          <p className="meta">{sheet.templateName}</p>
          <HealthSegments sheet={sheet} />
        </div>
      </div>
      <nav className="proto-a-launch" aria-label="Open panels">
        {launchers.map((launcher) => (
          <button key={launcher.panel} type="button" onClick={() => setOpen(launcher.panel)}>
            <Icon name={launcher.panel} size={26} />
            <span>{launcher.label}</span>
            <span className="meta">{launcher.sub}</span>
          </button>
        ))}
      </nav>
      <Modal open={open === 'character'} onClose={close} label="Character" className="proto-w-md">
        <CloseButton onClose={close} />
        <CharacterSheetA sheet={sheet} />
      </Modal>
      <Modal open={open === 'inventory'} onClose={close} label="Inventory" className="proto-w-lg">
        <CloseButton onClose={close} />
        <InventoryA sheet={sheet} onStub={stub} />
        <Toast text={toast} />
      </Modal>
      <Modal open={open === 'journal'} onClose={close} label="Journal" className="proto-w-md">
        <CloseButton onClose={close} />
        <h2>Journal</h2>
        <JournalBody sheet={sheet} playthroughId={playthroughId} />
      </Modal>
    </aside>
  );
}

/* ============================================================ variant B */

function Crest({ sheet }: { sheet: ProtoSheet }) {
  return (
    <svg className="proto-b-crest" viewBox="0 0 100 116" aria-hidden="true">
      <path d="M50 4 94 18v38c0 30-20 48-44 56C26 104 6 86 6 56V18Z" />
      <path className="inner" d="M50 14 84 25v31c0 24-15 39-34 46-19-7-34-22-34-46V25Z" />
      <text x="50" y="72" textAnchor="middle">
        {sheet.name.slice(0, 1).toUpperCase()}
      </text>
    </svg>
  );
}

function CharacterSpreadB({ sheet }: { sheet: ProtoSheet }) {
  return (
    <div className="proto-b-spread">
      <section className="proto-b-page left" aria-label="Portrait">
        <Crest sheet={sheet} />
        <h2>{sheet.name}</h2>
        <p className="proto-b-sub">{sheet.templateName}</p>
        {sheet.templateDescription ? <p className="proto-lede">{sheet.templateDescription}</p> : null}
        <div
          className={`proto-b-hearts${healthLow(sheet) ? ' low' : ''}`}
          role="img"
          aria-label={`Health ${sheet.health} of ${sheet.maxHealth}`}
        >
          {Array.from({ length: sheet.maxHealth }, (_, index) => (
            <span key={index} className={index < sheet.health ? 'on' : ''}>
              ♥
            </span>
          ))}
        </div>
        <p className="meta">
          Health {sheet.health} of {sheet.maxHealth} · {sheet.locationName}
        </p>
      </section>
      <section className="proto-b-page right" aria-label="Attributes">
        <h3>Attributes</h3>
        <table className="proto-b-table">
          <thead>
            <tr>
              <th scope="col">Attribute</th>
              <th scope="col">Base</th>
              <th scope="col">Gear</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {sheet.attributes.map((attribute) => (
              <tr key={attribute.key}>
                <th scope="row">
                  {attribute.label}
                  {attribute.counted.length + attribute.ignored.length > 0 ? (
                    <span className="meta proto-b-src">
                      {attribute.counted.join(', ')}
                      {attribute.ignored.length > 0 ? ` (${attribute.ignored.join(', ')} ignored: cap +2)` : ''}
                    </span>
                  ) : null}
                </th>
                <td>{attribute.base}</td>
                <td>{attribute.counted.length > 0 ? `+${attribute.counted.length}` : '—'}</td>
                <td className="proto-b-total">{attribute.effective}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Equipped</h3>
        <dl className="proto-b-equipped">
          {sheet.slots.map(({ slot, item }) => (
            <div key={slot}>
              <dt>{SLOT_LABELS[slot]}</dt>
              <dd>{item?.name ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

const KIND_GROUPS = [
  { kind: 'equipment', label: 'Equipment' },
  { kind: 'consumable', label: 'Consumables' },
  { kind: 'key', label: 'Key items' },
] as const;

function InventoryLedgerB({
  sheet,
  onStub,
}: {
  sheet: ProtoSheet;
  onStub: (action: string, target: string) => void;
}) {
  return (
    <div className="proto-b-inv">
      <div className="proto-b-strip">
        {sheet.slots.map(({ slot, item, action }) => (
          <div key={slot} className={item ? '' : 'empty'}>
            <Icon name={slot} size={20} />
            <span>
              <span className="meta">{SLOT_LABELS[slot]}</span>
              <br />
              {item?.name ?? 'Empty'}
            </span>
            <ActionButton action={action} target={item?.name ?? ''} onStub={onStub} compact />
          </div>
        ))}
      </div>
      {sheet.inCombat ? <p className="meta">Inventory actions are unavailable during Combat.</p> : null}
      {KIND_GROUPS.map(({ kind, label }) => {
        const items = sheet.items.filter((item) => item.kind === kind);
        if (items.length === 0) return null;
        return (
          <section key={kind} aria-label={label}>
            <h3>
              {label} <span className="meta">({items.length})</span>
            </h3>
            <table className="proto-b-table proto-b-items">
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="proto-b-icon">
                      <Icon name={itemIcon(item)} size={22} />
                    </td>
                    <th scope="row">
                      {item.name}
                      {item.magic ? <span className="proto-spark"> ✦</span> : null}
                      {item.equippedIn ? <span className="proto-badge">equipped</span> : null}
                      {item.description ? <span className="meta proto-b-src">{item.description}</span> : null}
                    </th>
                    <td className="proto-b-qty">×{item.quantity}</td>
                    <td className="meta">{item.details.slice(item.kind === 'key' ? 0 : 1).join(' · ') || item.details[0]}</td>
                    <td>
                      <ActionButton action={item.action} target={item.name} onStub={onStub} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {sheet.items.length === 0 ? <p>Empty.</p> : null}
    </div>
  );
}

function VariantB({
  sheet,
  map,
  playthroughId,
}: {
  sheet: ProtoSheet;
  map: ReactNode;
  playthroughId: string;
}) {
  const [open, setOpen] = useState<Panel | null>(null);
  const [toast, stub] = useStub();
  const close = () => setOpen(null);
  const rows: { panel: Panel; label: string; sub: string }[] = [
    { panel: 'character', label: 'Character sheet', sub: `${sheet.health}/${sheet.maxHealth} ♥` },
    { panel: 'inventory', label: 'Inventory', sub: `${sheet.items.length}` },
    { panel: 'journal', label: 'Journal', sub: `${sheet.journalTotal}` },
  ];
  return (
    <aside className="side proto-side" aria-label="Character and inventory">
      <p className="proto-b-who">
        <strong>{sheet.name}</strong> <span className="meta">· {sheet.templateName}</span>
      </p>
      <div className="proto-map">{map}</div>
      <ul className="proto-b-menu">
        {rows.map((row) => (
          <li key={row.panel}>
            <button type="button" onClick={() => setOpen(row.panel)}>
              <Icon name={row.panel} size={20} />
              <span>{row.label}</span>
              <span className="proto-b-count">{row.sub}</span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
      <Modal open={open !== null} onClose={close} label="Ledger" className="proto-w-xl proto-b-modal">
        <header className="proto-b-tabs">
          <nav aria-label="Ledger sections">
            {rows.map((row) => (
              <button
                key={row.panel}
                type="button"
                aria-current={open === row.panel ? 'page' : undefined}
                className={open === row.panel ? 'active' : ''}
                onClick={() => setOpen(row.panel)}
              >
                <Icon name={row.panel} size={18} /> {row.panel === 'character' ? 'Character' : row.label}
              </button>
            ))}
          </nav>
          <CloseButton onClose={close} />
        </header>
        <div className="proto-b-body">
          {open === 'character' ? <CharacterSpreadB sheet={sheet} /> : null}
          {open === 'inventory' ? <InventoryLedgerB sheet={sheet} onStub={stub} /> : null}
          {open === 'journal' ? <JournalBody sheet={sheet} playthroughId={playthroughId} /> : null}
        </div>
        <Toast text={toast} />
      </Modal>
    </aside>
  );
}

/* ============================================================ variant C */

function StatBlockC({ sheet }: { sheet: ProtoSheet }) {
  const bonusLines = sheet.attributes.flatMap((attribute) => [
    ...attribute.counted.map((name) => ({ key: `${attribute.key}-${name}`, text: `+1 ${attribute.label} from ${name}`, ignored: false })),
    ...attribute.ignored.map((name) => ({ key: `${attribute.key}-${name}-x`, text: `+1 ${attribute.label} from ${name} — ignored, bonus capped at +2`, ignored: true })),
  ]);
  return (
    <div className="proto-c-block">
      <h2>{sheet.name}</h2>
      <p className="proto-c-italic">
        {sheet.templateName}
        {sheet.status === 'ended' ? ' · journey ended' : ` · at ${sheet.locationName}`}
      </p>
      <hr className="proto-c-rule" />
      {sheet.templateDescription ? <p className="proto-lede">{sheet.templateDescription}</p> : null}
      <p>
        <strong>Health</strong> {sheet.health} / {sheet.maxHealth}
      </p>
      <span className={`proto-c-bar${healthLow(sheet) ? ' low' : ''}`}>
        <span style={{ width: `${(sheet.health / sheet.maxHealth) * 100}%` }} />
      </span>
      <hr className="proto-c-rule" />
      <div className="proto-c-attrs">
        {sheet.attributes.map((attribute) => (
          <div key={attribute.key}>
            <span className="proto-c-abbr">{attribute.label.slice(0, 3).toUpperCase()}</span>
            <span className="proto-c-num">{attribute.effective}</span>
            <span className="meta">
              {attribute.effective === attribute.base ? 'base' : `${attribute.base} + ${attribute.effective - attribute.base}`}
            </span>
          </div>
        ))}
      </div>
      <hr className="proto-c-rule" />
      <p>
        <strong>Bonuses.</strong>{' '}
        {bonusLines.length === 0 ? <span className="meta">None from equipment.</span> : null}
      </p>
      <ul className="proto-c-lines">
        {bonusLines.map((line) => (
          <li key={line.key} className={line.ignored ? 'ignored' : ''}>
            {line.text}
          </li>
        ))}
      </ul>
      <p>
        <strong>Equipped.</strong>{' '}
        {sheet.slots
          .map(({ slot, item }) => `${SLOT_LABELS[slot]}: ${item?.name ?? '—'}`)
          .join(' · ')}
      </p>
    </div>
  );
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'equipment', label: 'Gear' },
  { key: 'consumable', label: 'Consumables' },
  { key: 'key', label: 'Key' },
] as const;

function InventoryC({
  sheet,
  onStub,
}: {
  sheet: ProtoSheet;
  onStub: (action: string, target: string) => void;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const items = sheet.items.filter((item) => filter === 'all' || item.kind === filter);
  return (
    <div className="proto-c-inv">
      <div className="proto-c-slots">
        {sheet.slots.map(({ slot, item, action }) => (
          <div key={slot} className={item ? '' : 'empty'}>
            <Icon name={slot} size={24} />
            <span className="meta">{SLOT_LABELS[slot]}</span>
            <strong>{item?.name ?? 'Empty'}</strong>
            <ActionButton action={action} target={item?.name ?? ''} onStub={onStub} compact />
          </div>
        ))}
      </div>
      {sheet.inCombat ? <p className="meta">Inventory actions are unavailable during Combat.</p> : null}
      <p className="proto-c-filters" role="group" aria-label="Filter items">
        {FILTERS.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            aria-pressed={filter === candidate.key}
            className={filter === candidate.key ? 'on' : ''}
            onClick={() => setFilter(candidate.key)}
          >
            {candidate.label}
          </button>
        ))}
      </p>
      <ul className="proto-c-rows">
        {items.map((item) => (
          <li key={item.id}>
            <details>
              <summary>
                <span className="proto-c-row-icon">
                  <Icon name={itemIcon(item)} size={22} />
                </span>
                <span className="proto-c-row-main">
                  <strong>{item.name}</strong>
                  {item.quantity > 1 ? <span className="meta"> ×{item.quantity}</span> : null}
                  {item.magic ? <span className="proto-spark"> ✦</span> : null}
                  {item.equippedIn ? <span className="proto-badge">equipped</span> : null}
                  <span className="meta proto-c-row-sub">{item.details.join(' · ')}</span>
                </span>
              </summary>
              {item.description ? <p className="proto-lede">{item.description}</p> : null}
            </details>
            <ActionButton action={item.action} target={item.name} onStub={onStub} compact />
          </li>
        ))}
        {items.length === 0 ? <li className="meta">Nothing here.</li> : null}
      </ul>
    </div>
  );
}

function VariantC({
  sheet,
  map,
  playthroughId,
}: {
  sheet: ProtoSheet;
  map: ReactNode;
  playthroughId: string;
}) {
  const [open, setOpen] = useState<Panel | null>(null);
  const [toast, stub] = useStub();
  const close = () => setOpen(null);
  const percent = Math.round((sheet.health / sheet.maxHealth) * 100);
  const tiles: { panel: Panel; label: string; badge: string }[] = [
    { panel: 'character', label: 'Character', badge: `${sheet.health}` },
    { panel: 'inventory', label: 'Inventory', badge: `${sheet.items.length}` },
    { panel: 'journal', label: 'Journal', badge: `${sheet.journalTotal}` },
  ];
  return (
    <aside className="side proto-side" aria-label="Character and inventory">
      <div className="proto-map">{map}</div>
      <div className="proto-c-tiles">
        {tiles.map((tile) => (
          <button key={tile.panel} type="button" onClick={() => setOpen(tile.panel)}>
            <span className="proto-c-tile-icon">
              <Icon name={tile.panel} size={28} />
              <span
                className={`proto-c-badge${tile.panel === 'character' && healthLow(sheet) ? ' low' : ''}`}
              >
                {tile.badge}
              </span>
            </span>
            <span>{tile.label}</span>
            {tile.panel === 'character' ? (
              <span className="proto-c-minibar" aria-hidden="true">
                <span style={{ width: `${percent}%` }} />
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <Modal open={open !== null} onClose={close} label="Details" className="proto-drawer">
        <header className="proto-c-head">
          <p className="proto-c-seg" role="group" aria-label="Panels">
            {tiles.map((tile) => (
              <button
                key={tile.panel}
                type="button"
                className={open === tile.panel ? 'on' : ''}
                aria-pressed={open === tile.panel}
                onClick={() => setOpen(tile.panel)}
              >
                <Icon name={tile.panel} size={18} />
                <span>{tile.label}</span>
              </button>
            ))}
          </p>
          <CloseButton onClose={close} />
        </header>
        <div className="proto-c-body">
          {open === 'character' ? <StatBlockC sheet={sheet} /> : null}
          {open === 'inventory' ? <InventoryC sheet={sheet} onStub={stub} /> : null}
          {open === 'journal' ? <JournalBody sheet={sheet} playthroughId={playthroughId} /> : null}
        </div>
        <Toast text={toast} />
      </Modal>
    </aside>
  );
}

/* ----------------------------------------------------------------- entry */

export function SidePanelPrototype({
  variant,
  sheet,
  map,
  playthroughId,
}: {
  variant: string;
  sheet: ProtoSheet;
  map: ReactNode;
  playthroughId: string;
}) {
  if (variant === 'B') return <VariantB sheet={sheet} map={map} playthroughId={playthroughId} />;
  if (variant === 'C') return <VariantC sheet={sheet} map={map} playthroughId={playthroughId} />;
  return <VariantA sheet={sheet} map={map} playthroughId={playthroughId} />;
}
