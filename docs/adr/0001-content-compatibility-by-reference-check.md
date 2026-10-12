# Playthrough compatibility with changed Scenario content is decided by a reference check, not by versions

The server only ever holds the current version of each Scenario, while Playthroughs persist across content changes. Each Playthrough pins its Scenario id, the author's content `version` and a loader-computed content hash. When the hash differs, the loader checks mechanically whether every content id the stored state refers to still exists with the right type: Location, Scene, (Scene, Choice), Encounter, item, slot, Flag, Character Template and Ending. The check also fails when stored state would break an invariant that depends on content: an equipped item that is no longer Equipment of its slot, or an active Combat whose Enemy no longer has more maximum Health than the Damage taken. If everything holds, play continues and the pin is updated. Otherwise the Playthrough is incompatible and becomes read-only: its Journal stays fully visible, and its Ending, Character sheet and map stay visible where the content they need still exists. A Scenario that is removed from the collection or no longer valid makes all its Playthroughs read-only in the same way. Incompatibility is derived when the Playthrough is read; it is not a stored lifecycle status next to `active` and `ended`.

## Considered Options

- **Freeze on any `version` change**: simple, but it strands Playthroughs over trivial edits such as a typo fix, and it misses edits made without bumping `version`.
- **Keep every Scenario version side by side**: exact, but it needs versioned storage of packages and multiple loaded registries, which is too much for the prototype.

## Consequences

- The content hash, not the author's `version`, triggers the check, so silent edits are caught. `version` stays informational.
- A Playthrough that passes the check can still see changed narration or rules mid-run. This is accepted, and the Journal keeps the Scenario text as it was presented ([ADR 0004](0004-journal-stores-events-and-scenario-text-as-presented.md)).
- Stored state must refer to content only by id. This invariant comes from the Playthrough state model and keeps the check mechanical.
- Because stored state holds only ids, read-only views are best effort. Names, map coordinates and Ending titles come from the current content, and anything whose id is gone is left out. When the Scenario has left the collection, only the Journal remains, and the Ending is read from its Journal entry. Snapshotting display data into the state was rejected as too heavy for the prototype.
