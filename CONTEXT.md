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
A named, single placement of an Enemy in a Scenario, with its own opening narration and Outcomes for victory and escape.
_Avoid_: Fight, battle instance

**Ending**:
A Scenario-defined conclusion of a Playthrough, either a victory or a defeat; every Scenario has one defeat Ending for the Character's death.
_Avoid_: Game over, finale

**Key Item**:
An item with no mechanical effect, used only to satisfy Conditions or be given and taken by Effects.
_Avoid_: Quest item, plot item

### Play

**Session**:
An anonymous browser session created automatically; it owns any number of Playthroughs.
_Avoid_: User, account

**Playthrough**:
One run of a Scenario by a player, with its own Character and state.
_Avoid_: Game, save, run

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
A fight between the Character and one Enemy, ending in death or the Character's escape.
_Avoid_: Battle

**Equipment**:
Items worn or wielded by the Character, providing passive Attribute bonuses or determining attack Damage.
_Avoid_: Gear, loadout

**Consumable**:
A single-use item that restores Health and is consumed when used.
_Avoid_: Potion, charge
