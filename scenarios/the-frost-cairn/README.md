# The Frost Cairn (Kurhan Mrozu)

An authentic early-medieval Norse Viking Scenario in English with a complete Polish Translation (*Kurhan Mrozu*).

A bitter, unnatural rime-frost creeps down from the sea cliffs of Skallavik. Last night, an ancient coastal burial mound—the Frost Cairn—opened. Draugar (undead sea-warriors) crept into the great hall, stole the clan's sacred **Hearth-Rune** that keeps their fires burning through the dark months, and dragged the chieftain's daughter, **Astrid the Skald**, into the depths of the barrow. The player swears a blood oath before the hearth and embarks on a perilous quest across frozen pebble shores, windswept pine crags, and subterranean ice vaults to slay the ancient Sea-King **Jarl Harek Iron-Tooth**, rescue Astrid, and reclaim the sacred rune.

The package contains:
- **8 Locations** with full Euclidean map coordinates
- **19 Scenes** (triggered on-enter, on-demand, and follow-on scenes)
- **5 Enemies** and **9 Encounters** (duels and multi-participant pairs)
- **22 Items** (weapons, outfits, talismans, consumables, and quest keys)
- **4 Character Templates** (Sworn Huscarl, Fjord Scout, Rune-Skald, Bear-Shirt)
- **4 Endings** (2 victory, 2 defeat including the required death ending)
- **11 Declared Flags** tracking story decisions and progress
- **Complete Polish Translation** (`translations/pl/`)
- Comprehensive illustration prompts for all 27 assets in [`images/prompts.json`](images/prompts.json)

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
   - If Astrid was rescued, her sacred binding song suppresses Harek's thralls, allowing a one-on-one duel with the Sea-King (`harek-duel`).
   - If Astrid was not rescued, Harek is aided by an undead spearguard (`harek-and-guard`).
   - Defeating Harek awards the Hearth-Rune (`sepulchre-victory`).
7. **The Collapse & Endings (`cairn-collapse`):**
   - Taking the Hearth-Rune collapses the barrow. Sprint to safety with Astrid (`cairn-sealed`) or dive through the rubble alone (`frost-broken`).

---

## Encounters & Combat

| Encounter | Enemy / Participants | Range | Role |
|---|---|---|---|
| `shore-wolves` | 2 × Shore Fen-Hound | far | Strand ambush; avoidable via herring or Presence |
| `ridge-sentry` | Draugr Sentry | near | Ridge guard; avoidable via Agility sneak |
| `gate-guards` | Draugr Sentry + Draugr Frost-Archer | far | Frontal gate assault |
| `gate-sentry-lone` | Draugr Sentry | near | Gate sentry after luring archer away |
| `gallery-patrol` | 2 × Draugr Sentry | near | Crypt patrol; avoidable via Agility sneak |
| `crevice-skulker` | Draugr Frost-Archer | far | Sea-fissure ledge sniper |
| `shrine-berserker` | Draugr Berserker | near | Mini-boss guarding Astrid; stunned with lyre |
| `harek-duel` | Jarl Harek Iron-Tooth | far | Boss duel (with Astrid singing binding verses) |
| `harek-and-guard` | Jarl Harek + Draugr Sentry | far | Penalty boss fight if Astrid was not rescued |

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

The scenario ships **without image binaries**, as requested. Everything needed to generate and wire them is in place:

- [`images/prompts.json`](images/prompts.json): Complete prompt catalog containing:
  - Shared ink-and-graphite sketchbook `stylePrompt` matching the engine's visual aesthetic
  - Consistent character cast sheet (Torvald, Astrid, Hilda, Einar, Harek, Berserker)
  - 27 prompt specifications (8 Locations and 19 Scenes) with target resolution (1536 × 1024 WebP) and bilingual alt text (`alt` and `altPl`).
- [`images.yaml`](images.yaml) and [`translations/pl/images.yaml`](translations/pl/images.yaml): Manifest-ready image mappings.

### How to Activate Images After Generation:
1. Generate the WebP files and save them to `images/<id>.webp` (under 2 MiB each).
2. In `scenario.yaml`, add:
   ```yaml
   images:
     - images.yaml
   ```
3. In `translations/pl/translation.yaml`, add:
   ```yaml
   images:
     - translations/pl/images.yaml
   ```
4. In each Location file, add `illustration: loc-<location-id>`.
5. In each Scene file, add `illustration: <scene-id>`.
6. Run `npm run validate scenarios/the-frost-cairn`.

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
