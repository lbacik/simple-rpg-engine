# Tactical Combat balance harness (PROTOTYPE, issue #83)

Throwaway prototype for [Prototype: tactical Combat balance and meaningful action trade-offs](https://github.com/lbacik/simple-rpg-engine/issues/83). Not production code; it lives only on this branch.

- `combat-balance.prototype.html`: open it in a browser. Play any Template against any shipped Encounter or reference fixture with solver hints, run six seeded walkthroughs, and compute summary tables for any tuning preset.
- `rules.mjs`: pure rules module following `docs/spec/mechanics.md`, with tuning knobs (`DEFAULTS`, `TUNED` = accepted tuning, `LEGACY` = the pre-tactical rules).
- `fixtures.mjs`: Templates at effective Attributes with starting Equipment, the shipped Enemies and Encounters, and the two reference fixtures.
- `solver.mjs`: exact optimal play by value iteration over the reachable Round states, plus exact outcome distributions for a policy.
- `run2.mjs` (old vs new summary; `TUNE='{"heavyBonus":3,"escapeBonusAt":"commit"}' node run2.mjs`), `run3.mjs` (heavy variants), `run4.mjs` (minimum death risk), `story.mjs` (seeded solver fights), `verify-walks.mjs`.
- `build.mjs` regenerates the HTML from `shell.html`, `content.js`, `page.js` and the modules: `node build.mjs`.
