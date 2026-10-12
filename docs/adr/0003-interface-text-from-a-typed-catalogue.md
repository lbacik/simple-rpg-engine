# The engine emits no Interface Text; a typed catalogue renders it and never inflects Scenario names

The Interface Text comes in two Interface Languages, English and Polish, and much of it combines engine wording with Scenario names and numbers (Combat rounds, Tests, inventory and state changes). The engine and `view` therefore return **structured events and labels**: a kind, content ids and numbers, never a sentence. The application renders them through a **hand-rolled, typed TypeScript catalogue**, one object per Interface Language, kept in a framework-free module that the engine does not import. Each language's messages are functions of their arguments, and they place a Scenario-provided name only where that language needs no inflection, as a label or in the nominative ("Atak: Miecz — trafienie, 3 obrażenia"), because Polish would otherwise need the name in a grammatical case that no catalogue can derive.

## Considered Options

- **The engine renders sentences with a catalogue passed in**: a smaller change to today's code, but it fixes the language at the moment an action runs and keeps rendering inside the rules.
- **next-intl (ICU messages in JSON)**: translator-friendly tooling, but about 29 extra packages, a `next.config.ts` plugin, untyped arguments without experimental code generation, and only `use-intl/core` for code outside React. For two developer-maintained languages the typed object is simpler and checks more.
- **Translations supply case forms of names** (for example an instrumental form of each item name): grammatical sentences, but every Scenario, in its base language too, would have to author case forms for every name an engine message might use, and the set of cases would be tied to the engine's current wording.

## Consequences

- A missing message or a wrong argument list in a language is a `tsc` error. There is no runtime fallback between catalogues.
- Polish Interface Text reads like labels where a name is involved. English messages may still be sentences, since each language shapes its own messages.
- Scenario text is never case-transformed (no lower-casing of a weapon name inside a message).
- The events carry enough to render any message later, which leaves open whether the Journal stores events or rendered text.
- Moving to a library later means rewriting function messages as ICU strings: mechanical, but it touches every message.
