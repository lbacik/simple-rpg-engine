# The Journal stores engine events and Scenario text as presented, and renders Interface Text when read

Content language follows the current Interface Language, so a player who switches language mid-Playthrough has a Journal that holds text in two languages. The Journal therefore splits what it stores along the line between Scenario text and Interface Text. **Scenario text** (narration, Choice wording, Ending titles, and the Scenario names an engine event mentions, such as items, Enemies and Locations) is stored **as presented**, in the language it was shown in, and each entry records that language. **Engine-generated entries** (Tests, Combat rounds and ends, state changes, inventory actions, travel, the Enemy-defeated notice, and the victory or defeat kind of an Ending) are stored as **structured events** (kind, content ids, numbers, and those names) and rendered through the catalogue of the Interface Language current when the Journal is read. A Journal read after a switch shows all of its Interface Text in the new language, while every piece of Scenario text keeps the language and wording it was played in.

## Considered Options

- **Store engine-generated entries as the text rendered at the time**: a faithful record of the screen, but after a switch the Journal's labels and messages alternate between languages, and a result panel reloaded after a switch shows the old language.
- **Resolve names by id from the current content at read time**: the names follow the current language, but they no longer match the stored narration around them, and they are missing once the content changes or the Scenario leaves the collection.

## Consequences

- "As presented" now covers Scenario text only. Interface Text in the Journal, including in old entries, follows the current Interface Language and the current wording of the catalogue.
- Rendering the Journal needs only the stored entries and the catalogue, never the Scenario content. An incompatible Playthrough, or one whose Scenario has left the collection ([ADR 0001](0001-content-compatibility-by-reference-check.md)), still shows its whole Journal.
- Every event shape ever stored must stay renderable, so an event shape changes only together with a migration that rewrites the stored rows. Rows stored before this decision hold English text only. They are kept and shown verbatim, tagged `en`.
- A name inside an engine message is Scenario text in the entry's language, so after a switch an English message can show a Polish name ("Attack: Miecz — hit, 3 damage"). It matches the narration stored around it and carries that narration's `lang`.

## Combat MVP 1.0 amendment (accepted)

Source: the scope change in the [Combat MVP 1.0 implementation handoff](../spec/combat-mvp-1.0-handoff.md#scope-change-at-this-ticket).

- **The Journal guarantee holds for entries written from v0.6.0.** Scenario text stays stored as presented; engine-generated entries stay stored as structured events rendered through the catalogue on read.
- **Earlier entries were discarded by the release.** The v0.6.0 migration deletes every Journal entry, so the frozen legacy renderers for v1/v2 Combat entries and their catalogue keys are removed with the old rules. The "kept and shown verbatim, tagged `en`" rows no longer exist.
