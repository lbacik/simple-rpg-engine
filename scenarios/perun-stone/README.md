# Perun's Stone

An English fantasy mystery with a full Polish Translation (*Kamień Peruna*), set in a Slavic village and built on Slavic folklore. Forty days of drought have followed the theft of the thunderstone from Perun's Oak. The keeper of the oak blames the herb-woman at the forest's edge and is building a pyre. The Character must find the real thief before the village acts.

The package contains 7 Locations, 29 Scenes, four Character Templates, two optional Encounters, 14 items and seven Endings. It includes 36 Illustrations (7 Locations and 29 Scenes), with alternative text in English and Polish. See the [illustration gallery](images/index.html) and [Illustrations](#illustrations).

## Folklore used

- **Perun's Oak and the thunderstone** (*piorunek*): the sacred oak, the eternal fire and the "thunderbolt" stones of folk belief. The six-petalled rosette was carved on houses as a thunder mark.
- **Kupała Night**: bonfires, and girls floating wreaths on the water.
- **Południca (the Noon Wraith)**: she walks the rye at noon with a sickle, asks questions (traditionally about flax) and punishes wrong answers. She vanishes once the noon hour has passed.
- **Leszy**: the forest lord who leads travellers in circles. The traditional remedy is to wear clothes inside out and shoes on the wrong feet. He accepts bread and salt as an offering.
- **Utopiec**: a water demon who keeps the souls of the drowned under upturned pots. His strength lies in the water dripping from his left coat-tail. Millers traditionally made bargains with him.
- **Baba Jaga**: the hut on a hen's foot that turns at the words "turn your back to the forest and your face to me". Here she is Jagna, a misjudged herbalist.
- **Szeptucha, guślarz, druzhina**: the Character Templates.

## Puzzles

1. **The investigation.** Clues are spread across the map: the wheat flour in the empty chest (Perun's Oak), the drowned embers with duckweed in them (flavour), Wojtek's "white upiór" on the mill dyke (village), Radzim's brim-full pond on a dry river (mill), Marzenka's fate (Jagna or the Południca) and the Leszy's testimony.
2. **Catching the miller in three lies** (`miller-questioning`). Radzim tells three lies in sequence. Each lie must be countered by the one piece of evidence that disproves it. The evidence Choices appear only when the Character has found that evidence; the weak arguments are always offered. Any wrong argument ends the interrogation, and it must be restarted from the first lie.
   - "I haven't been up the hill" → the wheat flour (`flour-found`).
   - "I slept like a stone" → the night witness (`ghost-seen` or `leszy-heard`).
   - "A miller needs water, not thunder" → Marzenka (`knows-marzenka`).
3. **The Noon Wraith's three riddles** (optional). The answers are rye, the flax sequence taught by the spinning women's song, and "an equal" (from the folk riddle "God never, a king rarely, you every day"). Each wrong answer costs 2 Health. The reward is Marzenka's story and the Noon Wraith's Sickle.
4. **The utopiec's three pots.** The pot that hides the stone tells the truth, and the other two lie. Only the white bird pot gives a consistent assignment. Each wrong pot costs 3 Health, and the game can be replayed.
5. **Naming the thief** (`name-the-thief`). Bogumił acts on whatever name he is given. Naming Jagna, the Leszy or Bogumił himself leads, after one confirmation step, to a defeat. Naming Radzim works only with both the stone and his confession.

## Author walkthrough (spoilers)

A route with no Tests and no Combat, valid for every Template:

- `village-arrival`: `accept` (bread and salt).
- `perun-oak`: open `oak-chest`, `examine-chest`.
- `debina`: open `shepherd-boy`, `kind`.
- `mill`: `ask-pond` in `mill-arrival`.
- `rye-field`: `answer` the riddles (`rye`, `order-sung`, `equal`) or `wait` for dusk.
- `forest-edge`: `old-words`, then in `jagna-counsel` `tell-pond` (Marzenka plus the Kupała ash).
- `mill`: `miller-questioning` → `press` → `show-flour` → `show-witness` → `show-marzenka` → `promise`.
- `mill-pond`: `utopiec-bargain` → `play` → `lift-bird` (or `throw-ash`).
- `perun-oak`: `name-the-thief` → `name-radzim-proven`.

An alternative route reaches the pond through the forest: Jagna's `ask-forest`, `inside-out` in `forest-maze`, `bread` for the Leszy. Without Radzim's confession, it ends in `rain-and-silence`.

The Tests are shortcuts: Presence (hard) to talk the Noon Wraith past noon, Wits (ordinary) to cross the forest maze, and Presence (hard) to win the Leszy over with a promise. Both Encounters are optional. The Leszy's wolf is an ordinary duel, and the utopiec is a boss duel comparable to the Barrow Wight.

## Encounters (content format v2, #184)

| Encounter | Participant (profile) | Start | Role |
|---|---|---|---|
| `wolf-fight` | Leszy's Wolf (raider) | far | optional duel |
| `utopiec-fight` | Utopiec (brute) | melee | boss duel |

Profiles follow the #184 Q11 table (leszy-wolf → raider; utopiec →
brute). `startRange` values follow the Q12 table; all `power` and
`phaseOffset` values are 0 (no Q13 tuning was needed). Both Encounters
carry required `surrender` and `draw` Outcomes (draft text, pending
driving-developer review).

## Endings

| Ending | Requirement |
| --- | --- |
| `thunder-returns` (victory) | The thunderstone and Radzim's confession; tell the whole truth. |
| `rain-and-silence` (victory) | The thunderstone; blame only the water demon. |
| `witch-pyre` (defeat) | Name Jagna and confirm. |
| `forest-fire` (defeat) | Name the Leszy and confirm. |
| `keeper-cast-out` (defeat) | Name Bogumił and confirm. |
| `abandoned` (defeat) | Refuse the commission in the opening Scene. |
| `death` (defeat) | Reach zero Health. |

## Illustrations

The package includes one Illustration for each of its 7 Locations and 29 Scenes. The images use broken ink and graphite lines on warm ivory paper, following the two sketch references in `tmp/`. Recurring characters use their first scene as a visual reference. Compositions show the narrated moment before the player's choice without revealing a puzzle's answer.

Browse all 36 images in the [illustration gallery](images/index.html). Each file in `images/` is a 1536 × 1024 WebP below the engine's 2 MiB limit. The base manifest loads [`images.yaml`](images.yaml), and the Polish Translation loads [`translations/pl/images.yaml`](translations/pl/images.yaml) for Polish alternative text. Every Location and Scene references its Illustration.

[`images/prompts.json`](images/prompts.json) records the final prompts used with the built-in `image_gen` tool, the shared style, cast descriptions, reference images, image paths and alternative text in both languages.

## Validation

```sh
npm run validate -- scenarios/perun-stone
```
