# The Drowned Ledger

An English Scenario about a failing harbour wall, a submerged district, and the people erased from the city's account of its survival. The central question is what rescue means when repairing the machinery also preserves an injustice.

The package contains 16 Locations, 43 Scenes, four Character Templates, four optional Encounters, 20 items and seven Endings. For comparison, The Whispering Woods contains seven Locations and 14 Scenes. This Scenario adds an investigation, three maintenance tasks, rescue work, a witnessed agreement and a finale with four possible approaches.

The package includes 59 sketch Illustrations: one for each of its 16 Locations and 43 Scenes. Broken ink and graphite lines, selective crosshatching and warm ivory paper follow the sketch references supplied in `tmp/`. Each Illustration is optional and has English alternative text in `images.yaml`. Map coordinates describe the Location graph and are not image assets.

Browse the complete set in [the illustration gallery](images/index.html). The images are 1536 × 1024 WebP files in `images/`, each below the engine's 2 MiB limit. The [prompt set](images/prompts.json) records the prompts used with the built-in image generation tool, including the two final corrections. Scene compositions show the narrated moment before the player's decision; the four resolution Scenes do not depict their completed Endings.

## Story and pacing

1. **Greyhaven above the water:** meet surveyor Ivo Pell, obtain supplies, question Captain Mara Venn, and optionally free the ferry Mercy with its stranded passengers.
2. **Lowwater beneath the basin:** pass the dead porter, discover the memorial and original ledger, repair the pumps, and cast a new counterweight. The archive, pump hall and foundry can be visited in any order.
3. **People beyond the machinery:** rescue diver Tamsin Reed, hear survivors and descendants at Lantern Island, and prepare the signal tower. These actions change which resolutions are available.
4. **The last watch:** hear engineer Hester Marr's account, inspect the heart vault, and choose a witnessed correction, a personal sacrifice, a controlled evacuation or destruction of the engine.

There is no timed failure, hidden countdown or need to rush. The opening danger supplies narrative urgency; the player may revisit Locations and finish preparations before committing to an Ending. The main route has a guaranteed peaceful method for every obstacle. Tests offer shortcuts, extra supplies or small benefits; a failed Test never removes a required item or blocks progress.

## Author walkthrough (spoilers)

The following route uses no Tests or Combat and works with every Character Template. Displayed labels are in the YAML; IDs below make the route easy to reproduce.

- In `market-arrival`, choose `hear-surveyor`, then `accept` in `town-briefing`. Optional supplies are available at `relief-table` and, after `take-seal` in `watch-captain`, at `watch-stores`.
- At the lockhouse, finish `lockhouse-arrival`, then open `descent-preparations` and choose `manual-release` (or `use-seal`). Descend to `stairwell`, choose `use-rail`, then open `drowned-porter` and choose `sign-book` or `show-chart`.
- Enter `sunken-square`. In `square-arrival`, choose `look-around`. For the witnessed correction, open `street-memorial` and choose `read-names`.
- At `archive`, choose `name-porter` in `archive-door` (the seal and nameplate also work). Enter `archive-vault`, open `ledger-discovery`, choose `read-account`, then finish `ledger-account`. This obtains the original ledger and reveals its history.
- At `pump-hall`, finish `pump-arrival`, then enter `cistern` and answer Tamsin. Open `cistern-cache` and take the locking pin. Optionally rescue Tamsin with `drain-carefully` in `cistern-diver`. Return to `pump-hall`, open `pump-calibration` and choose `fit-pin`.
- At `foundry`, open `foundry-sentinel` and choose `explain-repair` or `show-chart`. Open `foundry-workbench`, choose `follow-smith`, then `take-weight` in `smith-memory`.
- For the witnessed correction, visit `refuge` through the square's service passage, finish `refuge-arrival`, then choose `record-witnesses` in `witness-council`. The ferry is not required to reach the refuge. `refuge-rest` provides one recovery when wounded.
- With the ledger read, pumps set and weight forged, travel from the square to `causeway`. Open `causeway-crossing` and choose `install-weight`. The weight is consumed, but the forged Flag preserves the Connection for later return trips.
- At `bell-chamber`, open `keeper-audience`, hear `keeper-truth` or request the options directly, then finish `keeper-answer`. In `heart-threshold`, present Hester's plate or the ledger. `heart-controls` now offers the finale; every proposal has a reconsider Choice that returns to the controls.

For evacuation preparations, return to `quay`, finish its arrival, and choose `work-winch` in `ferry-rescue`. This rescues the passengers and sets `ferry-rescued`. After opening the causeway, visit `signal-tower`, finish `tower-arrival`, and choose `show-danger` or `show-survey` in `tower-watch`. In `beacon-lighting`, use Mercy's oil or the emergency locker. This sets `beacon-lit`. Lighting the beacon prepares the signal; the actual evacuation signal is sent only in a finale.

All four Encounters can be avoided through guaranteed Choices. After a surrender or a draw, wounded participants persist and a peaceful approach remains available. The heart auditor is re-offered on entry; the porter, foreman and channel watchman are re-offered as on-demand Scenes. Defeated Encounters are not started again.

## Encounters (content format v2, #184)

| Encounter | Participant (profile) | Start | Role |
|---|---|---|---|
| `porter-fight` | Drowned Porter (raider) | melee | optional duel |
| `foundry-fight` | Iron Foreman (brute) | melee | optional duel |
| `tower-fight` | Channel Watchman (archer) | far | optional duel |
| `auditor-fight` | Brass Auditor (sentinel) | melee | heart-vault duel |

Profiles follow the #184 Q11 table (drowned-porter → raider;
iron-foreman → brute; brass-auditor → sentinel; channel-watchman →
archer). `startRange` values follow the Q12 table; all `power` and
`phaseOffset` values are 0 (no Q13 tuning was needed). Every Encounter
carries required `surrender` and `draw` Outcomes (draft text, pending
driving-developer review).

## Ending requirements

| Ending | Requirement and commitment |
| --- | --- |
| `covenant-renewed` (victory) | Recover the ledger, read the memorial names and record the refuge witnesses. Choose `correct-account`, then `sign`. No ferry rescue, signal, successful Test or Combat is required. |
| `new-keeper` (victory) | Reach the controls and choose `become-keeper`, then `take-watch`. Greyhaven survives, but the Character remains as keeper and the drowned account is unfinished. |
| `city-evacuated` (victory) | Rescue Mercy and light the beacon. Choose `evacuate`, then `open-spillway`. The people survive a controlled evacuation; their city is lost. |
| `engine-broken` (victory) | Rescue Mercy and light the beacon. Choose `break-engine`, then `break-prepared`. Warning and escape routes save the people, while the sudden surge destroys their harbour. |
| `flood-unleashed` (defeat) | With either evacuation preparation missing, choose `break-engine`, then the explicitly warned `break-unprepared`. |
| `abandoned` (defeat) | Leave in the opening Scene. |
| `death` (defeat) | Reach zero Health. This is the manifest's death Ending. |

The whole main route and the witnessed correction can be completed without losing Health. Supplies support the optional Tests and Combat: starting tonics, the commission, relief table, watch cupboard, ferry rescue, cistern cache, pump repair, diver rescue and a single refuge rest. Equipment obtained during play goes into inventory and must be equipped by the player.

## Validation

From the repository root:

```sh
npm run validate -- scenarios/the-drowned-ledger
```

The package follows `docs/spec/scenario-format.md`. No engine changes or additional dependencies are required.
