# Combat Interface Text is a typed catalogue slice shipped to the browser

Status: accepted.

Source: [Validate production UI C with real simple-rpg-engine interaction states](https://github.com/lbacik/simple-rpg-engine/issues/185#issuecomment-6261310235), within [Map: adapt Combat to simple-rpg-engine MVP with command-panel UI](https://github.com/lbacik/simple-rpg-engine/issues/179). Reference prototype `prototype/combat-ui-c-states` @ `8fc2031` (throwaway; production UI is rebuilt, not promoted).

Combat Interface Text — disabled reasons, forecast and log events, results and notices — is a **separate typed catalogue slice in both languages (EN/PL), shipped to the browser** so the isomorphic preview ([ADR 0008](0008-shared-combat-core-replacing-tactical-rules.md)) renders locally. This **supersedes the "no catalogue shipped to the browser" part of [ADR 0003](0003-interface-text-from-a-typed-catalogue.md) for that slice only**; the rest of the catalogue stays server-side.

## What the slice covers

- Every `listOptions` reason code with its parameters (all applicable reasons per action and per target, never only the first).
- Every core event type (movement, blow order with expandable arithmetic, Cover/Counter/riposte tags, cancellations with reasons, the terminal-cutoff line, HP/stamina and engagements after the Round, regeneration — none after a terminal Round).
- Combat results (`WIN`/`LOSS`/`LOSS_SURRENDER`/`DRAW_LIMIT`), stale/rejected/imported-unverified/unreadable-save notices, and every `ParseIssue`.
- A missing key fails typecheck, as in ADR 0003. Only that slice reaches client bundles.

## UI direction this serves

Command-panel hierarchy (prototype C): three columns (hero status, stances and Companion; intents as the target list with text + icon legality and slot status; stance, cards and round forecast); forecast rendered only from `previewRound` events with no forecast arithmetic outside the core; per-Round grouped Combat log with step-by-step skippable replay; result panel replacing the forecast (Arena: Fight again and export; Scenario: a continue button naming the Outcome, plus export; no restart); in-page banners and confirmations, never browser dialogs; sticky threat strip below the narrow breakpoint; keyboard target selection, visible focus, screen-reader names and announced disabled reasons; and a no-JavaScript flow where stance, card and target choices are links/forms whose parameters change no state, the server renders the same forecast through `previewRound`, and Confirm and Surrender are plain POSTs.

## Considered Options

- **Render the preview server-side only** (keep the whole catalogue server-side per ADR 0003): no client bundle change, but every stance/card/target change needs a round trip, and the MVP's isomorphic preview cannot run in the browser.
- **Ship the whole catalogue to the browser**: simpler split, but exposes all server wording and grows every client bundle for text most pages never render.
- **Pass rendered sentences from the server**: smaller client change, but fixes the language at commit time and puts rendering inside the rules — the option ADR 0003 already rejected.

## Consequences

- ADR 0003 otherwise stands: the engine still emits structured events and labels, never sentences; each language still shapes its own messages as functions of their arguments; Scenario names are still placed only where no inflection is needed.
- Stance changes accuracy and defense (±2), never damage. Combat is fully deterministic: no dice and no randomness.
- Arena import accepts a file and pasted JSON through one validation and one set of `ParseIssue` messages (UI choice; the strict parse is the save-lifecycle contract).
