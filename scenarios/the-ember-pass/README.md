# The Ember Pass

An English fantasy Scenario with a full Polish Translation (*Przełęcz Żaru*). It is built around Combat. The Character fights up a mountain road held by the Cinder Clan, frees the captives of Kessford, breaks the shaman's ward and lights the beacon that calls the king's riders.

The package contains 9 Locations, 21 Scenes, 10 Enemies, 14 Encounters (6 against two participants, 8 duels), 17 items, four Character Templates, four Endings and 30 Illustrations. Browse the [illustration gallery](images/index.html) or the [prompt set](images/prompts.json) (see [Illustrations](#illustrations)).

## Story and pacing

1. **Kessford.** Reeve Maren Holt gives the commission and a leg of smoked mutton. Ysolde the healer and Dunric the smith offer help that grows with progress.
2. **The lower road.** Two wolves block the road. The troll ford is optional and has the best early loot.
3. **Greywatch tower.** Storm the door against a raider and a bowman together, or climb the north wall and fight them one at a time.
4. **The pass gate or the mine.** Fight both gate guards, bluff one of them away, or take the old mine (two fights) up a shaft that comes out inside the war camp. The shrine above the gate is an optional duel with a full heal and a talisman as the reward.
5. **The war camp.** Free the captives (a duel with the pen guard, or a hard Agility Test). Break the shaman's rite: the shaman and his ash hound fight together, and this fight is required.
6. **The summit.** Gharra Ashmane fights alone if the captives are free, because they keep her bowman busy. Otherwise she fights alongside the bowman, which is deliberately beyond the hard tier. Then light the beacon.

## Encounters and balance

All figures come from a Monte Carlo run of the real engine (`applyAction`): 1,500 fights per cell, starting at full Health, with a reasonable heuristic player who never escapes. "Late gear" means the upgrades a player usually holds by then (Highland Blade, Deepdelver Mail, Hearth Amulet). The tiers follow [mechanics.md](../../docs/spec/mechanics.md#balance-targets).

| Encounter | Participants | Start | Sellsword | Ranger | Warden | Witch | Role |
|---|---|---|---|---|---|---|---|
| `road-wolves` | 2 × Ridge Wolf | far | 98% | 100% | 95% | 84% | avoidable (mutton, Presence) |
| `tower-assault` | Cinder Raider + Clan Bowman | far | 85% | 99% | 88% | 69% | hard tier; or the climb route |
| `tower-roof` → `tower-stairs` | Clan Bowman, then Cinder Raider | near | 100% | 100% | 99% | 97% | climb route, chained duels |
| `ford-troll` | Ford Troll | far | 91% | 99% | 86% | 97% | optional mini-boss |
| `mine-crawler` | Tunnel Crawler | near | 100% | 100% | 100% | 100% | mine route |
| `depths-pair` | Deep Ghoul + Tunnel Crawler | far | 87% | 98% | 86% | 80% | mine route |
| `gate-guards` | 2 × Cinder Raider | far | 98% | 100% | 95% | 83% | gate route |
| `gate-lone-guard` | Cinder Raider | near | 100% | 100% | 100% | 100% | after a successful bluff |
| `shrine-brute` | Clan Brute | far | 98% | 99% | 92% | 97% | optional |
| `pen-brute` | Clan Brute | near | 98% | 98% | 92% | 97% | frees the captives |
| `shaman-rite` | Ember Shaman + Ash Hound | far | 80% | 99% | 84% | 66% | required |
| `warlord-duel` | Gharra Ashmane | far | 63% / 82% | 88% / 93% | 65% / 93% | 69% / 85% | boss (start / late gear) |
| `warlord-and-guard` | Gharra + Clan Bowman | far | 11% / 20% | 53% / 72% | 19% / 72% | 11% / 27% | penalty for skipping the captives |

Full-campaign runs (2,000 playthroughs in which the same heuristic player explores at random, fights everything it meets, escapes only below 5 Health with no Consumables, and drinks at 8 Health or less) reach a victory in about two thirds of games. The commonest deaths are the tower assault and the shaman. A careful player who escapes earlier, rests and visits Ysolde does better. In 3,000 further playthroughs by a fully random agent, no state was left without a legal action, and every Ending was reached.

Healing is plentiful because Health never regenerates. The sources are two starting draughts, Ysolde (a draught and two tendings, gated by progress), the caravan wreck, the tower loot, the guardroom rest, the troll, the mine cache, the gate guards, the shrine (a full heal) and the freed captives.

## Author walkthrough (spoilers)

- `kessford-arrival`: `accept` (or `ask`, then `accept`). Visit `smith-dunric` and take the lantern (`lantern`). Take a draught from `healer-ysolde`.
- `south-road`: `wolves-on-road`. Choose `fight`, or `mutton` to skip the fight. Optionally open `caravan-wreck`.
- Optionally visit `troll-ford`: `fight` for the River-Pearl Ward, Ember Tonic and a draught, or `riddle` / `mutton` for an Ember Tonic.
- `greywatch`: `tower-approach`. Choose `storm` (both enemies together), or `climb` (Agility, ordinary) for the roof duel followed by the stairs duel. Victory gives two draughts and the cinder ingot. Take the ingot to Dunric (`forge`) for the Highland Blade. Open `greywatch-lookout` and, when wounded, `greywatch-rest`.
- Gate route: `gate-standoff` with `fight`, or `bluff` (Presence, ordinary) for a single guard. Mine route (needs the lantern): `mine-mouth`, then `mine-depths`, then `mine-vault`. The vault gives the Deepdelver Mail and an Ember Tonic and opens the shaft to the war camp.
- Optional: `ember-shrine`. `shrine-defiler` is a duel, and `shrine-blessing` gives a full heal and the Hearth Amulet.
- `war-camp`: `camp-arrival`. In `captive-pens`, choose `fight` or `sneak` (Agility, hard). Then `fire-circle`, which is the required shaman fight and opens the summit.
- `beacon-summit`: in `summit-standoff`, `duel` is offered with the captives freed and `guarded` without them. After the victory, `beacon-lighting` leads to `pass-reclaimed` (captives freed) or `lone-flame`.

## Endings

| Ending | Requirement |
|---|---|
| `pass-reclaimed` (victory) | Free the captives, defeat Gharra, light the beacon. |
| `lone-flame` (victory) | Defeat Gharra and light the beacon without freeing the captives. |
| `turned-back` (defeat) | Refuse the commission in Kessford. |
| `death` (defeat) | Reach zero Health. This is the manifest's death Ending. |

## Illustrations

The package includes one Illustration for each of its 9 Locations and 21 Scenes. The images use broken ink and graphite lines on warm ivory paper, following the two sketch references in `tmp/`. Scene compositions show the narrated moment before the player's choice; the summit beacon remains unlit.

Browse all 30 images in the [illustration gallery](images/index.html). Each file in `images/` is a 1536 × 1024 WebP below the engine's 2 MiB limit. The base manifest loads [`images.yaml`](images.yaml), and the Polish Translation loads [`translations/pl/images.yaml`](translations/pl/images.yaml) for Polish alternative text. Every Location and Scene references its Illustration.

[`images/prompts.json`](images/prompts.json) records the final prompts used with the built-in `image_gen` tool, the shared style, the cast descriptions, image paths and alternative text in both languages. Additional references preserve Maren's appearance, recurring architecture, and the shaman and ash hound across their Scenes.

## Validation

From the repository root:

```sh
npm run validate -- scenarios/the-ember-pass
```

The package and its Polish Translation validate with no errors and no warnings.
