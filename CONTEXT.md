# Simple RPG Engine

A web platform for single-player RPG adventures: authors describe a story as a multi-file YAML package, and the shared engine runs it with common rules and a common UI.

## Language

### Content

**Scenario**:
A validated, multi-file YAML package describing one adventure, available in the server-side collection.
_Avoid_: Game, story, adventure module

**Location**:
A place in a Scenario's world, connected to other Locations; the unit shown on the player's map.
_Avoid_: Room, area

**Connection**:
A one-way passage from one Location to another, optionally available only under a Condition.
_Avoid_: Exit, door, edge

**Scene**:
A single piece of pre-written narration with Choices, either triggered within a Location (on entering it, or on the player's demand) or reached only by following on from another Scene.
_Avoid_: Event, page, node

**Illustration**:
An optional picture shown with a Scene or a Location, supplied by the Scenario and described by alternative text: a Still, optionally with Layers and a Camera that give it Motion; a Scene or Location is complete without one.
_Avoid_: Artwork, picture, banner

**Still**:
The base picture of an Illustration, and all of it that is shown whenever Motion is off.
_Avoid_: Base image, background, backdrop, poster

**Layer**:
A transparent picture composed over an Illustration's Still, optionally animated by its own frames, a Drift or a Flicker.
_Avoid_: Overlay, sprite, sticker

**Drift**:
A Layer's travel from one point of the Still to another over a set time.
_Avoid_: Movement, path, tween, travel

**Flicker**:
An engine-driven variation of a Layer's opacity, kept by the engine within safe limits.
_Avoid_: Effect, pulse, glow

**Camera**:
A zoom, a pan or both, applied to an Illustration's Still and all its Layers together.
_Avoid_: Ken Burns, view, viewport

**Motion**:
The decorative animation of an Illustration (its Layers' frames, Drifts and Flickers, and its Camera), identical on every Showing; with Motion off, only the Still is shown.
_Avoid_: Animation, ambience, effects

**Showing**:
One uninterrupted display of an Illustration with its Scene or Location, from arriving there (or loading the page there) until leaving; Motion starts afresh with every Showing, so a Drift or Camera that does not loop plays once per Showing, unlike a Choice or Scene offered once per Playthrough.
_Avoid_: Visit, view, render

**Choice**:
An option offered by a Scene, optionally gated by a Condition and optionally resolved by a Test, leading to an Outcome.
_Avoid_: Option, answer, link

**Outcome**:
What follows a Choice, a Test result, or the end of a Combat: narration, Effects, and where play continues. A Combat ends in victory, surrender or draw (or the Character's death).
_Avoid_: Result, consequence, branch

**Condition**:
A predicate over the Playthrough's state (Flags, items, Attributes, Health, visits, fired Scenes, defeated Encounters) that gates Scenes, Choices, or Connections.
_Avoid_: Requirement, guard, prerequisite

**Effect**:
One change from the engine's closed vocabulary that an Outcome applies to the Playthrough, such as setting a Flag, giving an item, or starting a Combat.
_Avoid_: Action, command

**Flag**:
A named true/false fact an author sets and checks to remember what has happened in a Playthrough.
_Avoid_: Variable, switch

**Encounter**:
A named placement of one to five Enemies as its Participants, each with its own starting Range, with its own opening narration and Outcomes for victory, surrender and draw; it is defeated when every Participant is. A Companion may fight alongside the Character.
_Avoid_: Fight, battle instance

**Participant**:
One placement of an Enemy in an Encounter, with its own identity within that Encounter, its own starting Range, optional phase offset and power, its own wounds and its own defeat. The authored order of Participants is mechanically meaningful.
_Avoid_: Enemy instance, combatant, foe, slot

**Ending**:
A Scenario-defined conclusion of a Playthrough, either a victory or a defeat; every Scenario has one defeat Ending for the Character's death.
_Avoid_: Game over, finale

**Key Item**:
An item with no mechanical effect, used only to satisfy Conditions or be given and taken by Effects.
_Avoid_: Quest item, plot item

**Base Language**:
The language a Scenario is written in, declared in its manifest; its text is what a player sees when no Translation applies.
_Avoid_: Default language, source language

**Translation**:
A complete rendering of all of a Scenario's text into one other language, adding no content and changing no mechanics.
_Avoid_: Localisation, locale pack, language version

**Content format version**:
The manifest's `schemaVersion`. Version 2 is required; a version 1 package is rejected as a retired format.
_Avoid_: Schema version (of a Playthrough or Arena run)

### Play

**Session**:
An anonymous browser session created automatically; it owns any number of Playthroughs.
_Avoid_: User, account

**Interface Language**:
The language a player has chosen for the Interface Text; it also selects which Translation of a Scenario is shown, falling back to the Base Language.
_Avoid_: Locale, UI locale

**Interface Text**:
Everything a player reads that does not come from a Scenario: the engine's labels, messages and names for its own vocabulary; always shown in the Interface Language.
_Avoid_: UI strings, chrome, messages

**Playthrough**:
One run of a Scenario by a player, with its own Character and state.
_Avoid_: Game, save, run

**Journal**:
The append-only, read-only record of what a Playthrough has presented: narration, Choices taken, rolls, and Outcomes; it records play but never drives it.
_Avoid_: Log, history, transcript

**Character**:
The player's hero, created at the start of a Playthrough and existing only within it.
_Avoid_: Hero, avatar, player

**Character Template**:
A Scenario-defined starting configuration for a Character, including Attributes and starting equipment, selected by the player when beginning a Playthrough.
_Avoid_: Class, archetype

### Mechanics

**Attribute**:
One of the four engine-defined capabilities: Might, Agility, Wits, or Presence.
_Avoid_: Ability score, skill

**Might**:
The Attribute representing physical strength and endurance.
_Avoid_: Strength, Constitution

**Agility**:
The Attribute representing dexterity and stealth.
_Avoid_: Dexterity

**Wits**:
The Attribute representing perception and reasoning.
_Avoid_: Intelligence, Wisdom

**Presence**:
The Attribute representing persuasion and intimidation.
_Avoid_: Charisma

**Test**:
A check against a Difficulty with either a success or a failure outcome.
_Avoid_: Skill check, saving throw

**Difficulty**:
The target a Test must meet or exceed to succeed.
_Avoid_: DC, target number

**Health**:
A combatant's remaining capacity to survive damage, bounded by their maximum Health; reaching zero kills the combatant. The Character's maximum is the hero profile's 40.
_Avoid_: Hit points, life

**Damage**:
A fixed amount of Health lost.
_Avoid_: Attack power

**Enemy**:
A reusable, Scenario-defined, named kind of opponent bound to one fixed Combat profile. It has no Attributes or statistics of its own.
_Avoid_: Monster, mob

**Companion**:
A Scenario-defined ally that joins a Playthrough, fights automatically in its Combats, and is lost permanently if slain in Combat.
_Avoid_: Follower, party member

**Companion definition**:
The Scenario-level id, name and party profile (`party-sentinel` or `party-archer`) of a Companion.
_Avoid_: Ally template

**Combat**:
A fight between the hero (and the Companion, if present) and one to five enemies: one Encounter's surviving Participants in Scenario play, or an Arena Setup's opponents in the Arena. It ends in `WIN`, `LOSS`, `LOSS_SURRENDER` or `DRAW_LIMIT`. There is no escape from Combat.
_Avoid_: Battle

**Round**:
One full Round of a Combat, resolved in the section 7 order (blow priority, then role, then actor id): the hero commits to a stance and one action, and every surviving enemy and the Companion carry out their frozen plans.
_Avoid_: Turn, initiative pass

**Intent**:
The frozen plan of an enemy or the Companion for the current Round — stance, action, target and movement variant — chosen and shown before the hero commits; it resolves as shown or is cancelled, never swapped.
_Avoid_: Telegraph, plan, enemy move

**Stance**:
The posture the hero takes for one Round — Aggressive, Balanced or Defensive — modifying attack and defense and restricting which Cards are available. Chosen anew every Round at no cost.
_Avoid_: Posture, attitude

**Card**:
One of the six special Combat actions with a stamina cost and a cooldown: Heavy Blow (`heavy`), Counterattack (`counter`), Feint (`feint`), Cover (`cover`), Charge (`charge`) or Prepare (`prepare`).
_Avoid_: Ability, special move

**Cooldown**:
The number of Rounds before a played Card is available again. A card played in Round r is available from r + CD + 1.
_Avoid_: Recharge, refresh

**Stamina**:
The resource the hero and the Companion spend to play Cards, restored partly after every non-terminal Round. Enemies have no stamina.
_Avoid_: Energy, action points

**Range**:
The distance between two characters during a Combat, computed as a relation: Melee (the pair is engaged), Near (same proximity group) or Far (different groups).
_Avoid_: Zone, distance

**Group**:
A proximity group: a label (`g0`, `g1`, …) shared by characters standing near each other. Characters in one group are mutually Near, except engaged pairs; different groups are Far.
_Avoid_: Zone, cluster

**Engagement**:
A pair of opponents bound in Melee. An engagement exists only between living opponents in the same group, never between allies. An engaged actor cannot Approach, Charge or Withdraw.
_Avoid_: Tie, lock

**Attack slot**:
One of the at most two enemy primary attacks that resolve in a Round. Enemies beyond the budget wait as Guarded Wait instead of attacking.
_Avoid_: Attack turn, strike chance

**Guarded Wait**:
What an enemy without an attack slot does for the Round: no movement, no attack, guard 3 in the declaration phase, keeping its stance.
_Avoid_: Pass, hold

**Wait age**:
How many Rounds an enemy attack candidate has gone without a slot. It breaks ties for the next Round's attack slots.
_Avoid_: Waiting turns, seniority

**Guard**:
A numeric pool (`guard`) absorbing damage after armor within the Round it was gained in. Separate from redirection by Cover.
_Avoid_: Shield, block pool

**Exposed**:
−2 to defense until the end of the current Round, taken on declaring a Heavy Blow.
_Avoid_: Open, vulnerability window

**Counterattack / Counter / Riposte**:
Counterattack (`counter`) is the Card that parries the first legal blow against the character; the parry reduces that blow by 6. The Riposte is the single extra blow that is part of it; it triggers no further reactions.
_Avoid_: Parry, revenge strike

**Cover / Ward**:
Cover (`cover`) is the Card that takes over one attack on a Near ally. The protector takes the blow; the ward is the ally covered.
_Avoid_: Bodyguard, intercept

**Primary attack**:
Strike, Heavy Blow, Feint, the offensive part of Charge, or Shot. Only primary attacks compete for attack slots.
_Avoid_: Main attack

**Direct attack**:
Strike, Heavy Blow or the offensive part of Charge. Only these trigger Counterattack.
_Avoid_: Melee attack

**Cancellation**:
An announced effect that does not take place, for example because its target died or its range became illegal. The Round still resolves and the action for the Round is spent.
_Avoid_: Fizzle, interrupt

**Profile**:
One closed set of Combat statistics (HP, stamina, skill, defense, armor, actions, cycle): `hero`, `party-sentinel`, `party-archer`, `raider`, `brute`, `sentinel` or `archer`. Content cannot author statistics.
_Avoid_: Stat block, class

**Rules version**:
The identifier of the Combat rules a Combat state was written under: `simple-rpg-engine-stance-cards-1.0`. A mismatched version is rejected, never silently reinterpreted.
_Avoid_: Rules edition, patch

**Combat result**:
How a Combat ended: `WIN`, `LOSS`, `LOSS_SURRENDER` or `DRAW_LIMIT`.
_Avoid_: Outcome (of a Choice), ending

**Surrender**:
The hero yields a Combat and survives (`LOSS_SURRENDER`), routed to the Encounter's `surrender` Outcome. The Encounter is not defeated.
_Avoid_: Escape, retreat, forfeit

**Draw**:
A Combat that reaches the 30-Round limit (`DRAW_LIMIT`), routed to the Encounter's `draw` Outcome. The Encounter is not defeated.
_Avoid_: Stalemate, tie

**Speed** (retired from Combat):
Whether a tactical Combat action resolved early, in the middle or late in a Round. The MVP 1.0 order uses blow priority, role and actor id instead.
_Avoid_: Initiative, tempo

**Reach** (retired from Combat):
Whether a tactical attack could be made only at Near Range or at any Range. Range legality now follows the Melee/Near/Far relation and each action's own condition.
_Avoid_: Weapon type

**Behaviour** (retired from Combat):
A tactical Enemy's engine-defined pattern for selecting Intents. Enemies now follow their profile's open cycle with range adaptation.
_Avoid_: AI, profile, script, tactic

**Equipment**:
Items worn or wielded by the Character, providing passive Attribute bonuses only. Weapon Damage and Reach are retired.
_Avoid_: Gear, loadout

**Consumable**:
A single-use item that restores Health and is consumed when used. Usable only outside Combat.
_Avoid_: Potion, charge

**Arena**:
A mode next to Scenarios for testing the Combat mechanism: fights run directly from an Arena Setup through the engine, with no Scenario, Encounter, Outcome or Ending, and no Playthrough.
_Avoid_: Scenario, test fight

**Arena Setup**:
The description of one Arena fight: one to five opponents from `raider`, `brute`, `sentinel` or `archer` in explicit order, each with a starting group, an engaged-with-hero flag, `phaseOffset` and `power`; an optional `party-sentinel` or `party-archer` Companion; the hero without equipment.
_Avoid_: Encounter, Template

**Arena run**:
One persisted, versioned (`schemaVersion` 1) Arena fight: its origin, remembered Setup and Combat state, importable and exportable as Combat state JSON.
_Avoid_: Saved fight, replay

**Bestiary** (retired):
The offer of Arena Enemy statistics opponents were once drawn from. The Arena now uses the closed profiles; there are no authored statistics.
_Avoid_: Monster manual, catalogue
