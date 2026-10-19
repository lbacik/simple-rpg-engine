# The Frost Cairn (Kurhan Mrozu)

An authentic early-medieval Norse Viking Scenario in English with a complete Polish Translation (*Kurhan Mrozu*).

A bitter, unnatural rime-frost creeps down from the sea cliffs of Skallavik. Last night, an ancient coastal burial mound—the Frost Cairn—opened. Draugar (undead sea-warriors) crept into the great hall, stole the clan's sacred **Hearth-Rune** that keeps their fires burning through the dark months, and dragged the chieftain's daughter, **Astrid the Skald**, into the depths of the barrow. The player swears a blood oath before the hearth and embarks on a perilous quest across frozen pebble shores, windswept pine crags, and subterranean ice vaults to slay the ancient Sea-King **Jarl Harek Iron-Tooth**, rescue Astrid, and reclaim the sacred rune.

The package contains:
- **8 Locations** with full Euclidean map coordinates
- **19 Scenes** (triggered on-enter, on-demand, and follow-on scenes)
- **5 Enemies** and **8 Encounters** (duels and multi-participant pairs), plus the Companion `astrid`
- **22 Items** (weapons, outfits, talismans, consumables, and quest keys)
- **4 Character Templates** (Sworn Huscarl, Fjord Scout, Rune-Skald, Bear-Shirt)
- **4 Endings** (2 victory, 2 defeat including the required death ending)
- **11 Declared Flags** tracking story decisions and progress
- **Complete Polish Translation** (`translations/pl/`)
- **27 Illustrations** (8 Locations and 19 Scenes), with bilingual alt text and generation prompts in [`images/prompts.json`](images/prompts.json)

---

## Story and Progression

1. **The Longhouse of Skallavik (`skallavik-hall`):**
   - In `skallavik-arrival`, the player swears the blood oath before Jarl Torvald's hearthfire (or refuses and takes the `oath-forsaken` ending).
   - The player can speak with Torvald (`torvald-briefing`) for barrow lore, visit the blind runewife Hilda (`hilda-runewife`) for healing mead and an amber talisman, and visit one-eyed smith Einar (`einar-smithy`) for pitch torches and climbing rope.
2. **The Frozen Strand (`fjord-strand`):**
   - On the black pebble beach (`strand-ambush`), two shore fen-hounds ambush the player. The player can fight them, bribe them with smoked herring, or scare them off with an ordinary Presence Test.
   - Searching the wrecked knarr (`whale-wreck`) yields tallow salve and a sunstone.
3. **The Howling Ridge (`howling-ridge`):**
   - Ascending the crest (`ridge-climb`), a draugr sentry blocks the path. It can be ambushed silently via Agility or fought directly.
   - At the lookout (`ridge-lookout`), the player scouts two routes into the barrow: the main stone gate or the sea-crevice.
   - At the ruined beacon (`beacon-ruin`), using torches restores health and yields smoked herring.
4. **Infiltration Routes:**
   - **Frontal Assault (`barrow-threshold`):** Two draugar guard the stone portals (`threshold-approach`). Lure the archer away with a Wits Test, or fight both. Force or unlock the heavy stone slabs (`barrow-doors`).
   - **Stealth Descent (`cliff-crevice`):** Use Einar's climbing rope to descend the sea cleft (`crevice-descent`). Fight the ledge archer or sneak past with a hard Agility Test, gaining a silver raven feather and entering the sunken shrine from below.
5. **The Burial Crypts & Sunken Shrine:**
   - In the outer crypts (`burial-gallery`), bypass or defeat an undead patrol (`gallery-entrance`), and recover Astrid's carved birch lyre from an ancient sarcophagus (`thrall-tombs`).
   - In the flooded shrine (`sunken-shrine`), a giant draugr berserker prepares to execute Astrid (`shrine-pool`). Playing her lyre stuns the monster before combat. Freeing her (`astrid-rescue`) grants her assistance: she will sing ancient binding verses in the final confrontation!
6. **The Sepulchre of Jarl Harek (`jarl-barrow`):**
   - Unlocked using the Dragon-Coil Key.
   - A single fight against Harek and an undead spearguard (`harek-and-guard`). Freeing Astrid (`astrid-rescue`) makes her join as the Companion `astrid` (`party-sentinel`); she fights alongside you instead of singing the guard away (the old `harek-duel` binding-song variant is removed in format v2).
   - Defeating Harek awards the Hearth-Rune (`sepulchre-victory`).
7. **The Collapse & Endings (`cairn-collapse`):**
   - Taking the Hearth-Rune collapses the barrow. Sprint to safety with Astrid (`cairn-sealed`) or dive through the rubble alone (`frost-broken`).

---

## Encounters & Combat

| Encounter | Participants (profile) | Start | Role |
|---|---|---|---|
| `shore-wolves` | 2 × Shore Fen-Hound (raider) | far, far | Strand ambush; avoidable via herring or Presence |
| `ridge-sentry` | Draugr Sentry (sentinel) | melee | Ridge guard; avoidable via Agility sneak |
| `gate-guards` | Draugr Sentry (sentinel) + Draugr Frost-Archer (archer) | far, far | Frontal gate assault |
| `gate-sentry-lone` | Draugr Sentry (sentinel) | melee | Gate sentry after luring archer away |
| `gallery-patrol` | 2 × Draugr Sentry (sentinel) | melee, melee | Crypt patrol; avoidable via Agility sneak |
| `crevice-skulker` | Draugr Frost-Archer (archer) | far | Sea-fissure ledge sniper |
| `shrine-berserker` | Draugr Berserker (brute, power 1) | melee | Mini-boss guarding Astrid; stunned with lyre |
| `harek-and-guard` | Jarl Harek (brute, power 2) + Draugr Sentry (sentinel) | far, far | Boss fight; Astrid fights alongside as Companion when rescued |

Profiles follow the #184 Q11 table (fen-hound → raider; draugr-berserker
and jarl-harek → brute; draugr-sentry → sentinel; frost-archer → archer).
`startRange` values follow the Q12 table (far stays far; near +
non-archer becomes melee). `power` is non-zero only for the berserker (1)
and jarl-harek (2) per Q13; no `phaseOffset` tuning was needed.

**Companion:** Astrid is the Companion `astrid` (`party-sentinel`).
Freeing her (`astrid-rescue/free-astrid`) adds `companion-join: astrid`
alongside the kept `astrid-rescued` flag and a rescaled heal (3 → 10).
`cairn-collapse/escape-with-astrid` requires `{companion: astrid}`, so a
slain Astrid cannot "escape" the cairn. Every Encounter carries required
`surrender` and `draw` Outcomes (draft text, pending driving-developer
review).

---

## Endings

| Ending ID | Type | Description |
|---|---|---|
| `cairn-sealed` | Victory | Both Astrid and the Hearth-Rune are brought home to Skallavik. The clan celebrates {name}'s heroic deeds. |
| `frost-broken` | Victory | The Hearth-Rune is recovered and the clan survives, but Astrid was lost to the darkness. |
| `oath-forsaken` | Defeat | The player refuses the blood oath in the longhouse and flees into the freezing blizzard. |
| `death` | Defeat | The player falls in combat or freezes in the barrow. (Scenario death ending). |

---

## Character Templates

1. **Sworn Huscarl**: Might 3, Agility 1, Wits 1, Presence 1. Equipped with Bearded Axe, Riveted Chain Hauberk, and Tallow Salve × 2.
2. **Fjord Scout**: Might 1, Agility 3, Wits 1, Presence 1. Equipped with Fjord Yew Bow, Seal-Pelt Gambeson, and Smoked Fjord Herring × 2.
3. **Rune-Skald**: Might 1, Agility 1, Wits 2, Presence 2. Equipped with Rune-Carved Seax, Grey Wolf Mantle, Amber Sun-Knot, and Tallow Salve.
4. **Bear-Shirt**: Might 3, Agility 2, Wits 0, Presence 1. Equipped with Heavy Broad-Axe, Bear-Claw Amulet, and Spiced Winter Mead.

---

## Illustrations & Generation Prompts

The scenario includes **27 generated illustrations**, connected to all 8 Locations and 19 Scenes in both language versions.

- [`images/prompts.json`](images/prompts.json): Complete prompt catalog containing:
  - Shared ink-and-graphite sketchbook `stylePrompt` matching the engine's visual aesthetic
  - Consistent character cast sheet (Torvald, Astrid, Hilda, Einar, Harek, Berserker)
  - 27 prompt specifications (8 Locations and 19 Scenes) with target resolution (1536 × 1024 WebP) and bilingual alt text (`alt` and `altPl`).
- [`images/`](images/): 1536 × 1024 WebP illustrations, each under 2 MiB, generated with the built-in `image_gen` tool from the shared style prompt, individual prompts, scene details, and relevant cast descriptions. The two images listed in `styleReferences` were used as drawing-technique references only; ice and magical light are rendered in monochrome.
- [`images.yaml`](images.yaml) and [`translations/pl/images.yaml`](translations/pl/images.yaml): Active image catalogs with English and Polish alt text, loaded by their respective manifests.

Each Location references `illustration: loc-<location-id>`, and each Scene references `illustration: <scene-id>`. The Polish Translation reuses these illustrations with localized alt text.

---

## Validation

To validate the scenario from the repository root:

```sh
npm run validate scenarios/the-frost-cairn
```

Result:
```
0 errors, 0 warnings
```
