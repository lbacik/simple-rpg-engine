# Campaign Health is the hero's Combat HP; only Health, wounds and Companion presence cross the Combat boundary

Status: accepted.

Source: [Define how simple-rpg-engine Combat connects to Scenario play](https://github.com/lbacik/simple-rpg-engine/issues/183#issuecomment-6251696849), within [Map: adapt Combat to simple-rpg-engine MVP with command-panel UI](https://github.com/lbacik/simple-rpg-engine/issues/179). It applies the upstream constraints of [#181](https://github.com/lbacik/simple-rpg-engine/issues/181) and [#182](https://github.com/lbacik/simple-rpg-engine/issues/182) without reopening them.

Combat in Scenario play is **one standalone MVP Combat per Encounter**, embedded in a Playthrough by the Scenario adapter. The only things that cross the Combat boundary are:

- the Character's Health;
- the Participants' wounds;
- whether a Companion is present.

Everything else starts fresh in every Combat.

## Health

- **Character Health is the hero's HP.** Maximum Health is 40, taken from the `hero` profile in the rules table, not from a separate constant. A new Character starts at 40.
- Health enters Combat at its current value and leaves it at its final value. There is no rescaling. While a Combat runs, `h01.hp` in the Combat state is authoritative; `character.health` and wounds are written once, when the Combat ends, never per Round.
- Health reaching 0, in or out of Combat, still kills the Character and leads to the `deathEnding`.
- `heal`/`damage` Effects, Consumable `heal` values and Health Conditions are re-ranged to 1–40. This is not a rule change: the MVP's "no healing" governs a Combat, and campaign healing happens only outside one.

## Stamina, cooldowns and Prepare

None of these exist outside Combat, and the Playthrough stores none of them. Every Combat starts with stamina at the profile maximum, every `availableRound` at 1, and `readyRound: null`.

## Result routing

| Combat result | Routes to | Character |
|---|---|---|
| `WIN` | the Encounter's `victory` Outcome (optional, as today) | Health = final HP |
| `LOSS` | the Scenario's `deathEnding` | Health 0, dead |
| `LOSS_SURRENDER` | the Encounter's new **required** `surrender` Outcome | Health = final HP (> 0) |
| `DRAW_LIMIT` | the Encounter's new **required** `draw` Outcome | Health = final HP (> 0) |

Escape from Combat is removed, and the Encounter's `escape` Outcome is removed with it. Surrender and draw leave the Encounter undefeated; a repeat fight includes survivors only, in the authored arrangement, with wounds kept and everything else (groups, engagements, `phaseOffset`, `power`, `waitAge`, stance, Prepare) restarted.

## Companion

- At most one **Companion** per Playthrough, defined at the Scenario level by an `id`, a name (Scenario text, translatable) and a profile, `party-sentinel` or `party-archer`.
- Joining and leaving run through new Effects, `companion-join: <id>` and `companion-leave`. Joining while another Companion is present replaces it, and the Journal records the departure. Joining a lost Companion is a no-op.
- In Combat the Companion enters every fight at full HP and full stamina, always starts in the hero's group, and its `ref` is the Companion id.
- A Companion at 0 HP in Combat is lost permanently: removed from the Playthrough, recorded as lost, and the fight continues. New Conditions `{companion: <id>}` (present) and `{companionLost: <id>}` (died in Combat) let authors react to it.

## Attributes, Equipment and Consumables

- Attributes are unchanged for Tests and Conditions and have no Combat role.
- Equipment keeps only its Attribute bonuses; weapon Damage and Reach are retired. Equip and Unequip stay illegal during a Combat.
- Consumables are usable only outside Combat; the in-Combat `use-item` action is removed and the inventory stays disabled during Combat with the reason `in-combat`.

## Playthrough v3 Combat shape

```ts
activeCombat: { encounterId: string; combat: CombatState } | null
encounters: Record<EncounterId, Record<ParticipantId, number /* damageTaken */>>
companion: { id: CompanionId } | null
lostCompanions: CompanionId[]
character: { ...; health: number /* 0..40 */ }
```

Combat state refs hold Participant ids for enemies, the Companion id for `c01`, and null for `h01`.

## Journal projection (ADR 0004)

- `combat-start`: the Participants, the Companion if present, and the opening narration.
- `combat-round`, `version: 3`: the core's typed events for that Round plus the actor-to-`ref` mapping, rendered from the catalogue on read.
- `combat-end`: `howEnded` of `win`, `surrender` or `draw`; `LOSS` is followed by an `ending` entry as death is today.
- New entries: Companion joined, Companion left, Companion lost in Combat.

## Considered Options

- **Full-HP start for every Scenario Combat** (the MVP's independent-skirmish start): simpler, but it erases campaign attrition — the "hit, then surrender" pattern and multi-Encounter Scenarios would have no memory. The MVP full-state start applies to independent test skirmishes, not to a campaign.
- **Per-Round writeback of Health and wounds**: keeps the two copies in sync, but stores two copies of one value in a single document; a crash between them leaves ambiguity about which is authoritative. Single writeback at Combat end keeps `h01.hp` the one authority during the fight.
- **Combat restart in a Playthrough**: rejected — it would undo progress. Restart is Arena-only; Scenario play offers export of the current `CombatState` for Arena replay instead.

## Consequences

- There is no Combat restart in Scenario play (named deviation from MVP §14.3; its counterpart is the Arena).
- The hero's HP enters a Combat at the Character's current Health instead of full, and the Companion's presence persists between Combats (named deviation from MVP §10.1/§15.2). No rule changes; `rulesVersion` stays `simple-rpg-engine-stance-cards-1.0`.
- Authored contract (handed to content migration): Encounter gains required `surrender` and `draw` Outcomes and loses `escape`; Scenario-level Companion definitions; `companion-join`/`companion-leave` Effects; `companion`/`companionLost` Conditions; 1–40 re-ranging; weapon `damage`/`reach` retired.

## Supersessions

None to earlier ADRs beyond what #181/#182 already record. The handoff scope change withdraws this resolution's line "v1/v2 entries keep the frozen legacy renderers": pre-v0.6.0 entries are discarded by the release ([ADR 0009](0009-game-data-from-earlier-combat-rules-is-discarded-at-release.md)).
