# The Whispering Woods

The example Scenario for the prototype: a girl has vanished from the
village of Ashford, and the woods beyond the fields have begun to whisper.
Find her before the barrow claims her.

The package contains 7 Locations, 14 Scenes, three Character Templates,
three Encounters, and Endings including the required death ending, with
a full Polish Translation.

## Encounters (content format v2, #184)

| Encounter | Participant (profile) | Start | Role |
|---|---|---|---|
| `camp-bandit` | Bandit Archer (archer) | far | duel at the hunters' camp |
| `hollow-wolf` | Grey Wolf (raider) | far | duel in the wolf hollow |
| `wight-fight` | Barrow Wight (brute) | melee | boss duel in the barrow tomb |

Profiles follow the #184 Q11 table (grey-wolf → raider; barrow-wight →
brute; bandit-archer → archer). `startRange` values follow the Q12 table
(far stays far; near + non-archer becomes melee); all `power` and
`phaseOffset` values are 0 (no Q13 tuning was needed). Every Encounter
carries required `surrender` and `draw` Outcomes (draft text, pending
driving-developer review); both inherit the old `escape` move.

## Validation

To validate the scenario from the repository root:

```sh
npm run validate scenarios/whispering-woods
```

Result:

```
0 errors, 0 warnings
```
