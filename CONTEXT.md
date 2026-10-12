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
An optional picture shown with a Scene, supplied by the Scenario and described by alternative text; a Scene is complete without one.
_Avoid_: Artwork, picture, banner

**Choice**:
An option offered by a Scene, optionally gated by a Condition and optionally resolved by a Test, leading to an Outcome.
_Avoid_: Option, answer, link

**Outcome**:
What follows a Choice, a Test result, or the end of a Combat: narration, Effects, and where play continues.
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
A named placement of one or two Enemies in a Scenario, as its Participants, with its own opening narration and Outcomes for victory and escape; it is defeated when every Participant is.
_Avoid_: Fight, battle instance

**Participant**:
One placement of an Enemy in an Encounter, with its own identity within that Encounter, its own wounds and its own defeat.
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
A combatant's remaining capacity to survive damage, bounded by their maximum Health; reaching zero kills the combatant.
_Avoid_: Hit points, life

**Damage**:
A fixed amount of Health lost.
_Avoid_: Attack power

**Enemy**:
A reusable Scenario-defined kind of opponent with the same four Attributes as a Character, plus its own maximum Health and attack Damage; it is fought through Encounters.
_Avoid_: Monster, mob

**Combat**:
A fight between the Character and the surviving Participants of one Encounter, ending in victory, death or the Character's escape.
_Avoid_: Battle

**Round**:
One exchange of a Combat in which the Character takes one action and every surviving Participant carries out its Intent, all resolved in order of Speed and then Agility.
_Avoid_: Turn, initiative pass

**Intent**:
The action a Participant has committed to for the current Round, chosen and shown before the Character acts; it resolves as shown or is cancelled, never swapped.
_Avoid_: Telegraph, plan, enemy move

**Behaviour**:
An Enemy's engine-defined pattern for selecting its Intents, chosen by the author from a fixed list.
_Avoid_: AI, profile, script, tactic

**Speed**:
Whether a Combat action or Intent resolves early, in the middle or late in a Round: fast, normal or slow.
_Avoid_: Initiative, tempo

**Range**:
The current distance between the Character and one Participant during a Combat: either Near or Far; each Participant has its own.
_Avoid_: Zone, distance

**Reach**:
Whether an attack can be made only at Near Range (melee) or at any Range (ranged).
_Avoid_: Weapon type

**Equipment**:
Items worn or wielded by the Character, providing passive Attribute bonuses or determining attack Damage.
_Avoid_: Gear, loadout

**Consumable**:
A single-use item that restores Health and is consumed when used.
_Avoid_: Potion, charge
