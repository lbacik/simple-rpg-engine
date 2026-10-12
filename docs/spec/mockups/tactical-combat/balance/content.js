// PROTOTYPE walkthroughs and findings (issue #83). Seeds were picked so each story plays out as described.

const WALKS = [
  {
    title: 'Scholar vs Grey Wolf: an attack race',
    char: 'scholar', enc: 'hollow-wolf', preset: 'accepted', seed: 2,
    text: [
      'The Scholar (Might 0, staff 2 Damage) needs 9+ to hit the wolf, and the wolf needs 7+ to hit back for 2. Round 1 is free: the wolf only closes in.',
      'Watch for: Defend no longer earns Damage (the counterattack needs the same 9+ roll for 1 Damage), and Distract only delays, so the solver simply Attacks and heals. With perfect play the Scholar wins about half the time; under the old rules it was 96%, mostly through the free counterattack.',
    ],
    steps: ['defend', 'attack:grey-wolf', 'attack:grey-wolf', 'consume', 'attack:grey-wolf', 'attack:grey-wolf', 'attack:grey-wolf', 'attack:grey-wolf', 'attack:grey-wolf', 'consume'].map((a) => ({ action: a, label: a.split(':')[0] })),
  },
  {
    title: 'Same fight with off-balance +2',
    char: 'scholar', enc: 'hollow-wolf', preset: 'offbalance', seed: 2,
    text: [
      'Experiment: a Wary Enemy is off-balance, so your Attacks against it get +2. A successful Distract (5+ for the Scholar) cancels the bite and the next Round\'s Attack needs 7+ instead of 9+.',
      'Watch for: the win chance rises from about 51% to 91%, and Distract becomes the Scholar\'s signature move. The cost: a fixed two-Round rhythm (Distract, Attack, Distract, Attack) that the solver repeats almost every time.',
    ],
    steps: ['defend', 'distract:grey-wolf', 'attack:grey-wolf', 'distract:grey-wolf', 'attack:grey-wolf', 'distract:grey-wolf', 'attack:grey-wolf', 'consume', 'distract:grey-wolf', 'attack:grey-wolf'].map((a) => ({ action: a, label: a.split(':')[0] })),
  },
  {
    title: 'Soldier vs Barrow Wight: the wind-up window',
    char: 'soldier', enc: 'wight-fight', preset: 'accepted', seed: 2,
    text: [
      'The wight is a <code>heavy</code> Enemy. In Round 2 it winds up (no attack); in Round 3 its slow Heavy blow deals 3 + 3 = 6.',
      'Watch for: the solver answers the wind-up with Fall back. In Round 2 the roll fails, but in Round 3 the slow Fall back comes before the slow blow (Agility tie, the Character first) and succeeds: the blow is cancelled out of Reach, and the wight spends Round 4 closing in while the Soldier heals. With Heavy +2 attacking straight through the blow was best; at +3 the wind-up is a real decision. Soldier vs wight: 47% under the old rules, 86% at +2, 75% at +3.',
    ],
    steps: ['attack:barrow-wight', 'fallback', 'fallback', 'consume', 'attack:barrow-wight', 'attack:barrow-wight'].map((a) => ({ action: a, label: a.split(':')[0] })),
  },
  {
    title: 'Hunter vs wolf + archer: ignoring the aimed shot',
    char: 'hunter', enc: 'ref-wolf-archer', preset: 'accepted', seed: 2,
    text: [
      'The archer takes aim in Round 2 and shoots in Round 3 (slow, 2 + 3 = 5 Damage). The Hunter (Agility 4) is hit only on 11+, or 13+ when Defending.',
      'Watch for: with Agility 4 the aimed shot is a 1-in-6 threat, so the solver keeps shooting the wolf and the Distract option rarely matters. High Agility makes most Intents irrelevant.',
    ],
    steps: ['attack:grey-wolf', 'attack:grey-wolf', 'attack:grey-wolf', 'attack:grey-wolf', 'consume', 'attack:bandit-archer'].map((a) => ({ action: a, label: a.split(':')[0] })),
  },
  {
    title: 'Soldier vs two wolves: staggering their arrival',
    char: 'soldier', enc: 'ref-two-wolves', preset: 'accepted', seed: 2,
    text: [
      'Both wolves start Far and close in during Round 1. The solver Distracts wolf B\'s Close in: if it works, wolf B arrives a Round later, so for one Round only wolf A bites.',
      'Watch for: the Soldier acts after both wolves (Agility 1 vs 2), so every Round starts with up to 4 Damage. Focus fire on wolf A, then the Health race against wolf B. With perfect play the Soldier wins only about 36%.',
    ],
    steps: ['distract:grey-wolf-b', 'attack:grey-wolf-a', 'attack:grey-wolf-a', 'attack:grey-wolf-a', 'defend', 'defend'].map((a) => ({ action: a, label: a.replace('grey-wolf-', 'wolf ') })),
  },
  {
    title: 'Crew Advocate vs two wolves: getting out',
    char: 'advocate', enc: 'ref-two-wolves', preset: 'accepted', seed: 4,
    text: [
      'The Advocate (Agility 0) cannot win this fight (about 2% with perfect play). In Round 1 nothing is Near when the Advocate chooses Escape, so the +2 holds even though both wolves close in first: 7+. After that it needs 9+.',
      'Watch for: every failed Escape costs up to 4 Health. Even a player who only tries to survive dies about 15% of the time: the accepted cost of Agility 0. This seed is one of the bad runs.',
    ],
    steps: ['escape', 'escape', 'consume', 'escape', 'consume', 'escape', 'escape'].map((a) => ({ action: a, label: a })),
  },
];

const FINDINGS = `<p class="muted small">The summary tables tab recomputes everything for any preset. Figures are for full Health with perfect play.</p>
<h2>Accepted in review</h2>
<ul>
  <li><b>Heavy attack: Enemy Damage +3</b> (was +2). The barrow wight is a boss again (Soldier 75%), and the largest possible blow stays at 9.</li>
  <li><b>Escape's +2 comes from the state shown on commitment.</b> If nothing was Near when the Character chose Escape, a faster Enemy closing in first no longer removes the bonus. Crew Advocate's minimum death risk against two Enemies falls from 24–26% to 14–15%.</li>
  <li><b>No rule change for low-Might Templates.</b> Scholar vs Grey Wolf stays at 51%; the Scholar's strength lies outside Combat. The off-balance experiment stays here as a preset.</li>
  <li><b>Two participants = the hard tier.</b> The reference is Grey Wolf + Bandit Archer: fighting Templates win 68–98%, the others must be able to Escape (minimum death ≤ 4%, or ≤ 15% at Agility 0). Two Grey Wolves are beyond the hard tier (Soldier 36%), recorded as the same-kind fixture.</li>
</ul>
<h2>What the spec did before review</h2>
<ul>
  <li><b>Duels mostly keep the old balance.</b> Of the 25 shipped duels, 20 stay within 5 points of the old rules. No Template can die before its first useful action at full Health.</li>
  <li><b>The Scholar lost its way to win.</b> Grey Wolf: 96% → 51%. Under the old rules the free counterattack was the Scholar's Damage source. The rolled counterattack (decided in #78) removed it, and Distract gives nothing back.</li>
  <li><b>A <code>heavy</code> Enemy is weaker than a <code>steady</code> one.</b> A wind-up costs a whole attack and buys +2 Damage on one slow, answerable blow. Barrow Wight vs Soldier: 46% (old) → 86%. Every heavy Enemy loses strength, Bandit Archer and Channel Watchman included.</li>
  <li><b>Two Enemies double the pressure without a matching answer.</b> Two Grey Wolves: Hunter 89%, Runner 92%, Warden 63%, Soldier 36%, Scholar 0%, Engineer 0%, Advocate 2%. Wolf + archer is similar. The pressure is not instant: Round 1 is always a closing Round. The losing Templates can still leave (survival-first death 0–9%, except the Advocate at 24–26%).</li>
  <li><b>Agility is the master Attribute.</b> Agility 4 Templates win almost everything and ignore most Intents (hit on 11+). Initiative itself is cheap: making the Character act last within each Speed costs at most 15 points (Soldier vs wight) and usually 0–5.</li>
  <li><b>No dominant fast-action loop.</b> With a slight preference for shorter fights, the solver Defends or Distracts in 0–45% of Rounds, depending on the matchup. A Defend/counterattack grind appears only without any time preference (Hunter: 13 to 27 Rounds), and only in fights that are already won.</li>
</ul>`;
