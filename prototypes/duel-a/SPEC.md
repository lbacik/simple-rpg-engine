# Wariant A Pojedynek z zamiarami i tempem

**Specyfikacja implementacyjna 1.0 · 18 października 2026 · projekt Warmaster**

Ten dokument definiuje samodzielny prototyp pojedynku turowego jednego bohatera z jednym przeciwnikiem w przeglądarce. Gracz zna zamiar wroga, wybiera jedną odpowiedź i zarządza wytrzymałością. Kontry, zwody i szybkość działań pozwalają wykorzystać sytuację. Tempo przenosi niewielką przewagę inicjatywy między rundami. Nie ma mapy ani odległości.

**Status reguł:** wszystkie reguły, liczby, formuły, macierz interakcji i algorytmy z rozdziałów 1–13 są autorską propozycją. Nie są reprodukcją Mouse Guard, Burning Wheel ani Ironsworn. Zweryfikowane odnośniki i zakres inspiracji znajdują się w rozdziale 14. Parametry są gotowym punktem startowym do implementacji, lecz ich balans wymaga testów.

Drugi, niezależny prototyp opisuje [specyfikacja wariantu C](01_wariant_C_walka_z_grupa.md). A oznacza tutaj kierunek „taktyczny pojedynek” z końca poprzedniej rozmowy. Oba prototypy mają wspólny sposób pomiaru, lecz odrębne zasady.

## 1 Cel projektowy i zakres

Pytanie prototypu brzmi: **czy dobieranie odpowiedzi do znanego zamiaru, zasobu i tempa daje interesujący pojedynek przez kilka rund?**

Gracz nie ma zgadywać wyniku ukrytego rzutu. Powinien rozstrzygać, czy opłaca się odbić atak, przełamać obronę, odzyskać wytrzymałość albo zaakceptować ranę w zamian za większe obrażenia. Szybszy cios ma znaczenie przede wszystkim wtedy, gdy wyeliminuje wroga przed jego działaniem.

Założenia MVP:

- Dokładnie dwóch uczestników, po jednej akcji każdego na rundę.
- Wróg wybiera i ujawnia pełną akcję przed wyborem bohatera. Po zatwierdzeniu jej nie zmienia.
- Obie strony korzystają z tych samych akcji i formuł; profile mogą różnić się HP, pancerzem i szybkością.
- Deterministyczne obrażenia i kolejność; brak rzutów, losowych krytyków i procentowej celności.
- Brak talii, postaw, ekwipunku, obrażeń okresowych, ogłuszeń i towarzyszy w wersji bazowej.
- Tempo nie daje dodatkowej tury ani akcji. Zmienia wyłącznie kolejność niektórych ciosów.

Przy pełnej informacji istnieje najlepsza odpowiedź dla określonego celu i horyzontu planowania. Prototyp ma sprawdzić, czy gracz widzi kilka użytecznych kompromisów, a nie udawać nieprzewidywalnego przeciwnika.

## 2 Stan walki i wartości początkowe

### 2.1 Parametry uczestnika

| Pole | Bohater bazowy | Przeciwnik bazowy | Znaczenie |
|---|---:|---:|---|
| `hp`, `maxHp` | 32/32 | 32/32 | HP = 0 oznacza eliminację |
| `stamina`, `maxStamina` | 10/10 | 10/10 | Zasób opłacany przy zatwierdzeniu rundy |
| `armor` | 1 | 1 | Redukcja każdego pakietu obrażeń |
| `power` | 0 | 0 | Dodatek do surowych obrażeń własnego ciosu lub riposty |
| `baseSpeed` | 2 | 2 | Składnik inicjatywy działań ofensywnych |
| `guard` | 0 | 0 | Pula osłony tylko na bieżącą rundę |
| `availableRound` | Wszystkie akcje od 1 | Wszystkie akcje od 1 | Dostępność według numeru rundy |

Obie strony odnawiają 2 wytrzymałości na koniec każdej pełnej nieterminalnej rundy. Nie wolno wydać punktów oczekiwanej regeneracji. Nie ma ukrytej redukcji obrażeń przy wyczerpaniu: niedostępne są tylko akcje, których nie można opłacić.

### 2.2 Tempo

Wspólna zmienna `tempo` jest liczbą całkowitą od −2 do +2; początkowo 0.

| Wartość | Kontrola nad starciem | Premia do inicjatywy |
|---:|---|---|
| −2, −1 | Przeciwnik | Wróg +1, bohater +0 |
| 0 | Brak przewagi | Obie strony +0 |
| +1, +2 | Bohater | Bohater +1, wróg +0 |

Wartości 1 i 2 dają taką samą premię, ale wartość 2 trudniej odwrócić. Nie zwiększają obrażeń. Jest to autorski licznik przewagi, niezależny od inicjatywy w Ironsworn i kostki eskalacji z 13th Age.

Wszystkie obliczenia są całkowite. `clamp(x, a, b) = min(b, max(a, x))`. Przy aktualizacji tempa `sign(x)` daje −1, 0 lub +1. Nie ma zaokrąglania procentów.

## 3 Akcje i koszty

Wybór akcji obejmuje zawsze przeciwnika albo siebie; nie wymaga klikania celu. Każda strona ma dostęp do wszystkich sześciu akcji od początku.

| ID i akcja | Koszt wytrzymałości | Surowe obrażenia | Modyfikator szybkości | CD | Efekt |
|---|---:|---:|---:|---:|---|
| `strike` Atak | 2 | 8 + moc | +2 | 0 | Bezpośredni atak |
| `heavy` Mocny atak | 4 | 13 + moc | +0 | 0 | Wolniejszy bezpośredni atak |
| `feint` Zwód | 2 | 5 + moc albo 8 + moc | +3 | 0 | Ignoruje osłonę; premia +3 przeciw Obronie lub Kontrze |
| `counter` Kontra | 4 | Riposta 7 + moc | Nie dotyczy | 1 | Paruje 6 surowych obrażeń bezpośredniego ataku i może ripostować |
| `guard` Obrona | 0 | 0 | Nie dotyczy | 0 | Osłona 8; dodatkowa regeneracja 1 |
| `recover` Odpoczynek | 0 | 0 | Nie dotyczy | 0 | Osłona 2; dodatkowa regeneracja 4 |

Modyfikator szybkości dotyczy jedynie trzech ciosów pierwotnych: Ataku, Mocnego ataku i Zwodu. Kontra nie ściga się z nimi w kolejce; jej parowanie jest przygotowane przed atakami, a riposta następuje po nich, jeśli spełniono warunki.

Cooldown 1 oznacza niedostępność przez następną pełną rundę. Po Kontrze użytej w rundzie `r` zapisz `counter.availableRound = r + 2`. Nie można jej użyć w `r + 1`, można w `r + 2`. Pozostałe akcje są dostępne w następnej rundzie.

Obrona przywraca łącznie 3 wytrzymałości po rundzie, Odpoczynek 6, a pozostałe działania 2. Wszystkie przyrosty ogranicza `maxStamina`. Osłony nie przechodzą między rundami. Nie ma regeneracji HP.

### 3.1 Zwód

Surowa siła Zwodu wynosi `5 + power`, a jeśli wybrana przez przeciwnika akcja to `guard` lub `counter`, wynosi `8 + power`. Rozpoznanie opiera się na zadeklarowanej akcji, nie na pozostałej osłonie.

Zwód ignoruje każdą osłonę `guard`, także 2 z Odpoczynku, i nie podlega parowaniu Kontry. Nadal podlega pancerzowi. Nie anuluje własną regułą drugiej akcji; zabicie przeciwnika może normalnie usunąć jego późniejszy cios.

### 3.2 Kontra

Kontra reaguje wyłącznie na `strike` i `heavy`, określane jako **atak bezpośredni**. Przed pancerzem zmniejsza surowe obrażenia tego ciosu o 6, do minimum 0. Nie daje osłony i nie działa przeciw Zwodowi.

Riposta może nastąpić tylko wtedy, gdy:

1. atak bezpośredni przeciwnika rzeczywiście został wykonany;
2. kontrujący przeżył wszystkie ciosy pierwotne;
3. przeciwnik nadal żyje w fazie ripost.

Nawet cios całkowicie sparowany wyzwala ripostę. Samo zapowiedzenie ataku, który nie doszedł do skutku, jej nie wyzwala. Riposta nie jest atakiem bezpośrednim na potrzeby wyzwalania kolejnej Kontry: nie ma łańcuchów ripost.

Kontra przeciw Kontrze nie zadaje obrażeń. Kontra przeciw Obronie lub Odpoczynkowi zużywa zasób i cooldown bez parowania, riposty ani dodatkowej regeneracji.

## 4 Pętla rundy i algorytm rozstrzygnięcia

Fazy: `PLAN`, `CHOOSE`, `RESOLVE`, `FINISHED`. Pierwsza runda ma numer 1. Stan `CHOOSE` zawiera już niezmienny zamiar wroga.

1. **Przygotowanie.** Usuń starą osłonę i znaczniki wykonania. Zapamiętaj `tempoAtStart`, HP obu stron oraz ich wytrzymałość.
2. **Plan wroga.** Uruchom AI z rozdziału 8. Zamroź akcję. Nie odejmuj jeszcze kosztu. Interfejs pokazuje akcję, jej koszt, potencjalne obrażenia i szybkość.
3. **Wybór bohatera.** Gracz wybiera legalną odpowiedź. Podgląd może dokładnie obliczyć całą rundę.
4. **Walidacja i koszty.** Po poprawnym potwierdzeniu opłać obie akcje, ustaw cooldowny, zablokuj ponowne zatwierdzenie tej rewizji. Koszt nie jest zwracany, jeśli postać później zginie przed swoim ciosem.
5. **Przygotowanie reakcji.** Obrona ustawia osłonę 8, Odpoczynek osłonę 2, Kontra ustawia parowanie 6 wobec ataku bezpośredniego. Działają przed wszystkimi ciosami niezależnie od szybkości.
6. **Ciosy pierwotne.** Utwórz zdarzenia dla Ataku, Mocnego ataku i Zwodu. Posortuj je malejąco po inicjatywie. Wykonuj grupy o tej samej inicjatywie jednocześnie według rozdziału 5.
7. **Riposty.** Jeżeli walka trwa, wykonaj kwalifikujące się riposty. W hipotetycznej sytuacji kilku ripost byłyby jednoczesne; w bazowym pojedynku może wystąpić najwyżej jedna.
8. **Tempo.** Jeżeli walka trwa, oblicz zmianę na podstawie faktycznych strat HP z tej rundy.
9. **Regeneracja.** Odnów wytrzymałość obu żywych stron, usuń osłonę i znaczniki. Zapisz log i przejdź do kolejnej rundy.

Sprawdzaj zakończenie po każdej grupie jednoczesnych ciosów i po ripostach: tylko wróg ma HP = 0 → `WIN`; tylko bohater ma HP = 0 → `LOSS`; obaj mają HP = 0 → `DRAW_MUTUAL`. Zakończenie zatrzymuje dalsze fazy, nie nalicza regeneracji ani aktualizacji tempa. Zapłacone koszty pozostają zapisane.

Po pełnym zamknięciu rundy 30 bez eliminacji ustaw `DRAW_LIMIT`. „Poddaj walkę” w fazie wyboru daje `LOSS_SURRENDER`. Limit chroni przed nieskończonym odpoczywaniem i nie stanowi mechanizmu balansu. Wyników limitu nie zaliczaj do zwycięstw.

## 5 Formuły obrażeń i inicjatywy

### 5.1 Inicjatywa działania

```text
tempoBonus(hero) = 1, jeśli tempoAtStart > 0; w innym razie 0
tempoBonus(enemy) = 1, jeśli tempoAtStart < 0; w innym razie 0

initiative(actor, action) = actor.baseSpeed
                          + action.speedModifier
                          + tempoBonus(actor)
```

Premię ustala się na początku rundy. Obrażenia ani chwilowe prowadzenie w HP nie zmieniają kolejki w jej trakcie. Nie ma rzutów na inicjatywę.

Przy różnych wartościach szybszy cios wykonuje się pierwszy. Jeżeli zabije przeciwnika, wolniejszy cios nie dochodzi do skutku. **Samo trafienie nie przerywa akcji żyjącego celu.**

Przy równych wartościach oba ciosy oblicza się ze stanu na początku danej grupy. Potem jednocześnie odejmuje się HP i osłonę. Śmierć od ciosu w tej samej grupie nie usuwa własnego ciosu. Nie rozstrzygaj remisu na korzyść gracza ani na podstawie kolejności elementów tablicy.

### 5.2 Pakiet obrażeń

```text
raw = baseDamage + actor.power + feintBonusIfApplicable
parry = 6, jeśli target.action == counter
             i incoming.action należy do {strike, heavy}; inaczej 0
afterParry = max(0, raw - parry)
afterArmor = max(0, afterParry - target.armor)
absorbed = 0, jeśli incoming.action == feint
           inaczej min(target.guard, afterArmor)
hpDamage = afterArmor - absorbed
hpLoss = min(target.hp, hpDamage)
target.guard -= absorbed
target.hp -= hpLoss
```

Dla Zwodu przyjmij `baseDamage = 5` i `feintBonusIfApplicable = 3` tylko przeciw `guard`/`counter`; dla pozostałych ciosów premia wynosi 0. Dla riposty `baseDamage = 7`, `parry = 0`, brak premii za zwód. Pancerz i osłona nadal działają przeciw ripoście.

Zapisuj zarówno `hpDamage`, jak i rzeczywistą stratę `hpLoss`, aby nadmiarowe obrażenia nie zniekształcały metryk ani tempa. Nie ma minimalnego 1 obrażenia.

### 5.3 Aktualizacja tempa

Niech `enemyLoss` i `heroLoss` oznaczają sumy faktycznej straty HP obu stron w zakończonej rundzie, obejmujące riposty.

```text
if enemyLoss > heroLoss:
    tempoNext = clamp(tempoAtStart + 1, -2, 2)
else if enemyLoss < heroLoss:
    tempoNext = clamp(tempoAtStart - 1, -2, 2)
else:
    tempoNext = tempoAtStart - sign(tempoAtStart)
```

Przy równych stratach przewaga zbliża się o jeden do zera, nawet jeśli obie strony straciły po 0 HP. Udana Kontra lub Zwód nie daje dodatkowego punktu tempa poza wynikiem obrażeń. Osłona nie jest obrażeniem HP. Leczenia w MVP nie ma.

## 6 Macierz interakcji

Poniższa macierz jest **wyliczoną tabelą autorskiego systemu**, nie tabelą Mouse Guard. Zakłada brak mocy, pancerz 1 obu stron i wystarczające HP do przeżycia rundy. Komórka `x / y` oznacza stratę HP wroga / stratę HP bohatera. Przy śmiertelnych ciosach sprawdź inicjatywę: wcześniejsza eliminacja może usunąć późniejszy atak.

| Akcja bohatera ↓ i wroga → | Atak | Mocny atak | Zwód | Kontra | Obrona | Odpoczynek |
|---|---|---|---|---|---|---|
| Atak | 7 / 7 | 7 / 12 | 7 / 4 | 1 / 6 | 0 / 0 | 5 / 0 |
| Mocny atak | 12 / 7 | 12 / 12 | 12 / 4 | 6 / 6 | 4 / 0 | 10 / 0 |
| Zwód | 4 / 7 | 4 / 12 | 4 / 4 | 7 / 0 | 7 / 0 | 4 / 0 |
| Kontra | 6 / 1 | 6 / 6 | 0 / 7 | 0 / 0 | 0 / 0 | 0 / 0 |
| Obrona | 0 / 0 | 0 / 4 | 0 / 7 | 0 / 0 | 0 / 0 | 0 / 0 |
| Odpoczynek | 0 / 5 | 0 / 10 | 0 / 4 | 0 / 0 | 0 / 0 | 0 / 0 |

Widać trzy kompromisy:

- Kontra mocno ogranicza zwykły Atak, ale przeciw Mocnemu atakowi daje wymianę po 6 HP i zużywa 4 wytrzymałości.
- Zwód ma dobre obrażenia przeciw Obronie i Kontrze, lecz słabsze przeciw atakującym.
- Odpoczynek odtwarza więcej zasobu niż Obrona, ale przepuszcza znacznie więcej obrażeń.

Pełna zapowiedź nie powinna automatycznie oznaczać Kontry na każdy atak: przeszkadzają koszt, cooldown i różnica między zwykłym a Mocnym atakiem. Jeśli testy wykażą jedną dominującą sekwencję, to sygnał do zmiany parametrów.

## 7 Przykład trzech rund

Scenariusz A01. Obie strony mają 32 HP, pancerz 1, moc 0, szybkość bazową 2 i wytrzymałość 10. Tempo wynosi 0. Wróg stosuje cykl Mocny atak → Obrona → Atak; cykl jest jawny w trybie nauki. Brak losowania.

### Runda 1 Kontra na mocny atak

1. Wróg zapowiada Mocny atak. Gracz wybiera Kontrę. Obie strony wydają po 4 wytrzymałości i mają po 6. Kontra bohatera będzie ponownie dostępna w rundzie 3.
2. Kontra przygotowuje parowanie. Wróg wykonuje cios: `13 − 6 − 1 = 6` obrażeń HP. Bohater ma 26 HP i żyje.
3. Atak bezpośredni został wykonany, więc bohater ripostuje: `7 − 1 = 6`. Wróg ma 26 HP.
4. Straty są równe, tempo pozostaje 0. Po regeneracji obaj mają po 8 wytrzymałości.

### Runda 2 Zwód przeciw obronie

1. Wróg zapowiada Obronę, koszt 0. Bohater wybiera Zwód, płaci 2 i ma 6 wytrzymałości.
2. Wróg otrzymuje osłonę 8 przed ciosami. Zwód ma surowe obrażenia `5 + 3 = 8`, ignoruje tę osłonę i po pancerzu odbiera 7 HP. Wróg ma 19 HP.
3. Bohater nie traci HP. Tempo zmienia się z 0 na +1. Osłona wroga przepada po rundzie.
4. Bohater odnawia 2 do 8 wytrzymałości. Wróg odnawia łącznie 3, ale z 8 rośnie tylko do limitu 10.

### Runda 3 Wolniejszy cios za większe obrażenia

1. Wróg zapowiada Atak. Bohater wybiera Mocny atak. Wytrzymałość wroga spada `10 − 2 = 8`, a bohatera `8 − 4 = 4`.
2. Inicjatywa wroga: `2 + 2 + 0 = 4`. Inicjatywa bohatera: `2 + 0 + 1 = 3`. Premia tempa nie wystarcza, by Mocny atak wyprzedził zwykły Atak.
3. Wróg odbiera bohaterowi `8 − 1 = 7` HP. Bohater ma 19 HP i nadal wykona swój cios.
4. Bohater odbiera wrogowi `13 − 1 = 12` HP. Wróg ma 7 HP.
5. Bohater zadał większą stratę HP, więc tempo rośnie z +1 do +2. Regeneracja daje bohaterowi 6 i wrogowi 10 wytrzymałości.

| Koniec rundy | HP bohatera | HP wroga | Wytrzymałość bohatera | Wytrzymałość wroga | Tempo |
|---:|---:|---:|---:|---:|---:|
| 0 | 32 | 32 | 10 | 10 | 0 |
| 1 | 26 | 26 | 8 | 8 | 0 |
| 2 | 26 | 19 | 8 | 10 | +1 |
| 3 | 19 | 7 | 6 | 10 | +2 |

Alternatywy rundy 3 przy tym samym planie: Obrona pochłonęłaby cały Atak, zachowałaby HP bohatera 26 i HP wroga 19, odnowiłaby wytrzymałość bohatera do 10, a tempo wróciłoby do 0. Zwód zostawiłby bohatera z 19 HP, wroga z 15 HP, bohatera z 8 wytrzymałości i tempo 0. Kontra byłaby już dostępna: dałaby straty 1 HP bohatera i 6 HP wroga, wytrzymałość bohatera 6 i tempo +2.

### 7.1 Osobny przykład inicjatywy i śmierci

Obie strony mają 5 HP, pancerz 1 i szybkość 2, wybierają Atak. Przy tempie 0 inicjatywa wynosi 4 dla obu: oba ciosy zadają po 7 potencjalnych obrażeń, faktycznie po 5 HP; wynik to `DRAW_MUTUAL`. Przy tempie +1 bohater działa z inicjatywą 5, wróg z 4: wróg ginie przed swoim ciosem, wynik to `WIN`, a bohater pozostaje z 5 HP.

Obie strony płacą koszt w obu sytuacjach. Nie nalicza się regeneracji rundy terminalnej.

## 8 AI przeciwnika

AI wybiera akcję przed graczem. Wolno mu korzystać z opublikowanego stanu i historii zakończonych rund. Nie ma dostępu do aktualnie wskazywanej ani przyszłej akcji bohatera. Pełna zapowiedź jest wiążąca.

### 8.1 Profile MVP

| Scenariusz i profil | HP | Pancerz | Szybkość | Wytrzymałość | Algorytm |
|---|---:|---:|---:|---:|---|
| A01 Bandyta treningowy | 32 | 1 | 2 | 10/10 | Cykl `[heavy, guard, strike]` |
| A02 Berserker | 38 | 0 | 1 | 10/10 | Cykl `[heavy, strike, heavy, recover]` |
| A03 Szermierz | 28 | 1 | 3 | 10/10 | Polityka reaktywna poniżej |
| A04 Wartownik | 36 | 2 | 1 | 10/10 | Cykl `[guard, counter, strike, recover]` |

Moc każdego profilu wynosi 0. Wszystkie akcje są początkowo gotowe. Bohater w każdym scenariuszu zachowuje statystyki bazowe. Przygotuj także kopię A01 bez ujawniania przyszłego cyklu, lecz z pełnym zamiarem bieżącej rundy; to ta sama mechanika, inny poziom objaśnień.

### 8.2 AI cykliczne

Indeks cyklu to `(round − 1) mod długość`. Jeśli wskazana akcja nie jest dostępna przez koszt lub cooldown, wróg wybiera Odpoczynek. Fallback nadal przesuwa cykl: w następnej rundzie liczy się nowy numer rundy, a nie powtórzenie niezrealizowanej pozycji.

```text
chooseCyclicIntent(state, profile):
    wanted = profile.cycle[(state.round - 1) mod len(profile.cycle)]
    if isLegalAction(enemy, wanted, state.round):
        return wanted
    return recover
```

### 8.3 AI reaktywne szermierza

Kolejność warunków jest częścią specyfikacji. Historia zawiera ostatnią zatwierdzoną akcję bohatera z poprzedniej zakończonej rundy; przed pierwszą rundą jest `null`.

```text
chooseFencerIntent(state):
    e = state.enemy
    last = state.lastHeroAction
    if e.stamina < 2:
        return recover
    if last in {guard, counter} and legal(feint):
        return feint
    if last in {strike, heavy} and legal(counter):
        return counter
    if e.stamina <= 4:
        return guard
    if state.tempo < 0 and legal(heavy):
        return heavy
    return strike
```

`legal(action)` sprawdza koszt i `availableRound ≤ round` według tej samej funkcji co dla bohatera. `strike` w ostatniej gałęzi jest legalny, bo wcześniejszy warunek odrzucił wytrzymałość poniżej 2; nie ma własnego cooldownu.

Historia, cykl i zasób pozwalają graczowi planować dalej niż jedną rundę. W MVP nie stosuj losowego wyboru ani automatycznej kontry na aktualny wybór bohatera.

### 8.4 Pseudokod rozstrzygnięcia

```text
resolveRound(state, heroCommand):
    require phase == CHOOSE and correct stateRevision
    validateHeroCommandOrReturnErrorWithoutMutation()
    next = clone(state)
    actions = {hero: heroCommand.actionId, enemy: lockedEnemyIntent.actionId}
    payBothCostsAndSetCooldowns(next, actions)
    setGuardAndParryForBoth(next, actions)
    groups = groupPrimaryAttacksByInitiativeDescending(next, actions,
                                                       tempoAtStart)
    executedDirectAttacks = empty set
    for group in groups:
        snapshot = clone(next)
        packets = []
        for attack in group:
            if snapshot.actor(attack).hp > 0:
                packets.append(calculatePacket(snapshot, attack, actions))
                if attack.action in {strike, heavy}:
                    executedDirectAttacks.add(attack.actorId)
        applyPacketsSimultaneously(next, packets)
        if someoneDead(next): return finishWithWinLossOrMutual(next)
    ripostes = []
    for actor in [hero, enemy]:
        opponent = other(actor)
        if actions[actor] == counter and actor.hp > 0
           and opponent.hp > 0 and opponent.id in executedDirectAttacks:
            ripostes.append(ripostePacket(actor, opponent, raw=7+actor.power))
    applyPacketsSimultaneously(next, ripostes)
    if someoneDead(next): return finishWithWinLossOrMutual(next)
    updateTempoFromActualHpLoss(next, state)
    regenerateBoth(next, base=2, guardExtra=1, recoverExtra=4)
    next.lastHeroAction = actions.hero
    clearRoundGuardAndParry(next)
    if next.round == 30: return finish(DRAW_LIMIT)
    next.round += 1
    next.phase = PLAN
    return next
```

Przy grupie jednoczesnych ciosów w bazowym pojedynku jest najwyżej jeden pakiet przychodzący na uczestnika. Dlatego nie trzeba ustalać podziału osłony pomiędzy wiele jednoczesnych trafień w ten sam cel. Wielokrotne trafienia to przyszłe rozszerzenie wymagające dodatkowej reguły.

## 9 Struktury danych i zapis

Przykład kompletnego stanu do wybrania odpowiedzi w pierwszej rundzie A01:

```json
{
  "schemaVersion": 1,
  "ruleset": "A-1.0",
  "encounterId": "A01",
  "revision": 1,
  "round": 1,
  "phase": "CHOOSE",
  "result": null,
  "tempo": 0,
  "tempoAtStart": 0,
  "lastHeroAction": null,
  "hero": {
    "id":"hero","hp":32,"maxHp":32,"armor":1,"power":0,
    "baseSpeed":2,"stamina":10,"maxStamina":10,"guard":0,
    "availableRound": {
      "strike":1,"heavy":1,"feint":1,"counter":1,"guard":1,"recover":1
    }
  },
  "enemy": {
    "id":"enemy","hp":32,"maxHp":32,"armor":1,"power":0,
    "baseSpeed":2,"stamina":10,"maxStamina":10,"guard":0,
    "availableRound": {
      "strike":1,"heavy":1,"feint":1,"counter":1,"guard":1,"recover":1
    },
    "ai":{"kind":"cycle","cycle":["heavy","guard","strike"]}
  },
  "lockedEnemyIntent":{"actionId":"heavy"}
}
```

Komenda i fragment zdarzeń:

```json
{"stateRevision":1,"actionId":"counter"}
```

```json
[
  {"round":1,"type":"ACTION_COMMITTED","actorId":"hero","actionId":"counter",
   "cost":4,"availableRound":3},
  {"round":1,"type":"DAMAGE","sourceId":"enemy","targetId":"hero",
   "kind":"primary","raw":13,"parried":6,"afterArmor":6,
   "absorbed":0,"hpDamage":6,"hpLoss":6},
  {"round":1,"type":"DAMAGE","sourceId":"hero","targetId":"enemy",
   "kind":"riposte","raw":7,"parried":0,"afterArmor":6,
   "absorbed":0,"hpDamage":6,"hpLoss":6}
]
```

Pełny log obejmuje obie opłaty, grupy inicjatywy, anulowane po śmierci ciosy, regenerację, zmianę tempa i wynik. `parried` zapisuj jako faktycznie odjętą ilość `min(raw, 6)`, nie stałe 6, gdy cios był słabszy. `kind` rozróżnia pierwotny cios i ripostę.

Minimalne funkcje publiczne:

```text
createDuel(config) -> DuelState
prepareRound(state) -> stateWithLockedIntent
listLegalActions(state, actorId) -> ActionId[]
previewRound(state, heroCommand) -> predictedStateAndEvents
resolveRound(state, heroCommand) -> { nextState, events }
serialize(state) -> JSON
restore(JSON) -> validatedState
```

`previewRound` korzysta z tego samego rozstrzygnięcia na kopii. Zatwierdzenie ze starą rewizją albo bez wytrzymałości nie zmienia kosztów, cooldownów, zamiaru ani logu. Odtworzenie zapisu w `CHOOSE` zachowuje zamrożoną akcję wroga. Historia i wersja konfiguracji muszą wystarczyć do odtworzenia reaktywnego AI.

`revision` zwiększaj o 1 po każdym przyjętym rozstrzygnięciu, także terminalnym. Przygotowanie następnego planu nie zwiększa jej ponownie. Wywołanie `prepareRound` poza fazą `PLAN` odrzucaj bez zmiany stanu. Odtworzenie błędnych danych albo nieznanej wersji zasad ma zgłosić błąd, zamiast naprawiać zapis przez zmianę mechaniki.

Konfiguracja akcji zawiera: `id`, `cost`, `baseDamage`, `speedModifier` albo `null`, `cooldown`, `kind`, `guardAmount`, `extraRegen`. Warunkowe efekty Zwodu i Kontry obsługuj w jednym module interakcji; opis UI powinien być generowany z tych samych danych. Nie zapisuj przypadkowych wartości procentowych „szansy kontry”, bo w bazowych zasadach taka szansa nie istnieje.

## 10 Propozycja interfejsu

```text
BOHATER  HP 26/32   Wytrzymałość 8/10   Pancerz 1
PRZECIWNIK  HP 19/32   Wytrzymałość 10/10   Pancerz 1
RUNDA 3    Tempo +1 → bohater ma +1 do inicjatywy

ZAMIAR WROGA: Atak 8   Koszt 2   Inicjatywa 4

[Atak 2] [Mocny 4] [Zwód 2] [Kontra 4] [Obrona 0] [Odpoczynek 0]

WYBRANO: Mocny atak 13   Inicjatywa 3
Kolejność: Atak wroga → Mocny atak bohatera
Podgląd: stracisz 7 HP; wróg straci 12 HP;
po rundzie wytrzymałość 6/10 i tempo +2.
                                           [Rozstrzygnij rundę]
```

Wymagania:

- Pełny zamiar pokazuj stale, bez konieczności otwierania dymka. Opis fabularny może go uzupełniać.
- Rozdziel „surowe obrażenia”, „przewidywaną stratę HP” i „kolejność”. Gracz nie powinien odczytywać 13 jako gwarantowanej straty HP.
- Przy Kontrze pokaż osobno parowanie i ripostę, w tym informację „zginiesz przed ripostą”, jeśli tak wynika z podglądu.
- Przy Zwodzie zaznacz ignorowanie osłony oraz premię tylko przeciw Obronie i Kontrze.
- Ikona i podpis wyjaśniają tempo; sam kolor ani nazwa „inicjatywa” nie wystarczą.
- Przy remisie kolejności napisz „jednocześnie”; pokaż możliwość obopólnej eliminacji.
- Skróty 1–6 wybierają akcję, Enter potwierdza. Wybranie akcji nie rozstrzyga automatycznie rundy.
- Nieaktywna Kontra pokazuje konkretny numer rundy dostępności, a akcja za droga — brakującą wytrzymałość.
- Dziennik ma kolejność przygotowanie → ciosy według inicjatywy → riposta → tempo → regeneracja.
- Obsługa bez animacji i eksport logu są częścią MVP. Na małym ekranie informacje układają się pionowo.

## 11 Balans i testy

### 11.1 Hipotezy i zagrożenia

Pełna zapowiedź ma ograniczać zgadywanie. Ceną może być sprowadzenie decyzji do jednej oczywistej odpowiedzi. Kontra ma cooldown i koszt, a Mocny atak potrafi przebić jej parowanie. Zwód ma premię przeciw wybranym akcjom, ale nie eliminuje automatycznie innych stylów. Tempo różnicuje zwłaszcza sytuacje śmiertelnego ciosu.

Największe ryzyka:

- **Kontra na każdy zwykły Atak.** Sprawdź koszt oraz częstotliwość zwykłych ataków w AI, zanim dodasz losowe niepowodzenie kontry.
- **Obrona jako darmowe ładowanie zasobu.** Wróg musi czasem używać Mocnego ataku lub Zwodu; ich częstość powinna być jawna w scenariuszu.
- **Zwód zbyt uniwersalny.** Przy koszcie 2 może konkurować ze zwykłym Atakiem szybkością i przebijaniem osłon. Porównaj rzeczywiste wybory.
- **Tempo niewidoczne.** Jeśli prawie nigdy nie zmienia kolejności mającej konsekwencje, może być zbędnym licznikiem.
- **Szybkość bazowa zbyt silna.** Przewaga profilu może zawsze wygrywać wyścig; testuj profile równej szybkości i różniące się o 1 osobno.
- **Zbyt łatwy cykl treningowy.** Przewidywalność służy nauce, nie wystarcza do oceny regrywalności.

Strojenie: najpierw profile HP/pancerza, następnie koszty i regeneracja, potem siła parowania i riposty, na końcu szybkość oraz tempo. Wersję bez tempa testuj jako osobną konfigurację; nie zmieniaj jednocześnie jego formuły i całej tabeli obrażeń.

### 11.2 Testy akceptacyjne

| ID | Wejście | Oczekiwany wynik |
|---|---|---|
| A-T01 | Trzy rundy z rozdziału 7 | HP 19/7, wytrzymałość 6/10, tempo +2 |
| A-T02 | Atak 8 w Kontrę, pancerz celu 1, obie strony żyją | Cel traci 1 HP; riposta 7 przeciw pancerzowi 1 daje 6 HP |
| A-T03 | Mocny 13 w Kontrę, pancerz celu 1 | 6 HP przed ripostą |
| A-T04 | Zwód w Obronę, pancerz 1 | 7 HP, osłona 8 pozostaje niezużyta do końca rundy |
| A-T05 | Zwód w Odpoczynek, pancerz 1 | 4 HP, brak premii +3, ignoruje osłonę 2 |
| A-T06 | Kontra przeciw Kontrze | Brak obrażeń, obie strony płacą 4 i ustawiają cooldown |
| A-T07 | Kontrujący z 5 HP dostaje Mocny 13 przy pancerzu 1 | Traci 5 HP i ginie; nie ripostuje |
| A-T08 | Kontra użyta w rundzie 1 | Niedostępna w 2, dostępna w 3 |
| A-T09 | Atak kontra Atak, po 5 HP, tempo 0, szybkość 2 | DRAW_MUTUAL; bez regeneracji |
| A-T10 | Ten sam stan, tempo +1 | Bohater wygrywa bez utraty HP |
| A-T11 | Tempo −2, straty HP równe | Następne tempo −1 |
| A-T12 | Tempo +2, wróg traci więcej HP | Tempo pozostaje +2 |
| A-T13 | Wytrzymałość 0 | Dostępne Obrona i Odpoczynek; brak pozostałych akcji |
| A-T14 | Wytrzymałość 9, Odpoczynek, brak śmierci | Wytrzymałość 10, nie 15 |
| A-T15 | Nielegalny wybór albo stara rewizja | Brak mutacji obu zasobów, planu i cooldownów |
| A-T16 | A01, legalny wybór gracza zmieniany w podglądzie | Zamiar wroga pozostaje heavy w całej rundzie 1 |
| A-T17 | Zapis CHOOSE i odtworzenie z identycznym wyborem | Identyczny wynik i sekwencja zdarzeń mechanicznych |
| A-T18 | Macierz z rozdziału 6, po 100 HP, pancerz 1, moc 0 | Wszystkie 36 par dają dokładnie podane straty |

Niezmienniki: zasoby w granicach, tempo w −2…+2, co najwyżej jeden pierwotny cios na stronę, najwyżej jedna riposta w bazowym pojedynku, brak akcji po eliminacji poza własnym ciosem z tej samej grupy jednoczesnej. Przetestuj również bardzo wysoki pancerz, całkowite sparowanie słabego ciosu i brak zależności od kolejności uczestników w tablicy.

### 11.3 Scenariusze diagnostyczne

A01 służy nauce, A02 odróżnieniu obrony od parowania, A03 reakcji na historię i szybkości, A04 kosztowi walki z pancerzem i obroną. Dodatkowe krótkie stany do ręcznego uruchomienia: po 5 HP i remis inicjatywy; 2 wytrzymałości bohatera wobec Mocnego ataku; Kontra na cooldownie wobec Ataku; wróg z 7 HP i tempem po stronie bohatera.

Nie wszystkie muszą być uczciwymi pełnymi walkami. Służą do sprawdzenia, czy określona reguła jest widoczna i rozumiana.

## 12 Wspólne metryki i porównanie z wariantem C

Nie przeprowadzono jeszcze badania graczy ani kalibracji. Cele poniżej są propozycjami testowymi, identycznymi co do definicji z dokumentem C.

| Metryka | Cel roboczy A | Cel roboczy C | Jak porównać |
|---|---|---|---|
| Rundy zwycięskich starć zwykłych | Mediana 5–9 | Mediana 6–10 | Porażki i remisy osobno |
| Czas decyzji po nauce | Mediana 5–15 s | Mediana 8–20 s | Ta sama obsługa i animacje |
| Poprawne przewidzenie wyniku | ≥ 80% | ≥ 80% | Pytania o HP i wykonane działania bez podglądu |
| Wygrane po nauce | 50–75% w starciach zwykłych | 50–75% | Najpierw zbliżona trudność w pilotażu |
| Najczęstsza akcja | Sygnał alarmowy powyżej 60% w różnych zwykłych starciach | Tak samo | Uwzględnij legalność i rolę scenariusza |
| Wartość reakcji | Riposty wykonane / wybrane Kontry | Przerwane ataki / zapowiedziane ataki | Opisują różne mechaniki; nie twórz wspólnego rankingu |
| Wpływ tempa | Rundy, w których premia zmieniła kolejność lub wynik | Nie dotyczy | Przelicz kopię rundy z premią tempa równą 0 |
| Zmiany przewagi | Zmiany strony posiadającej tempo | Nie dotyczy | Przejście +1 → 0 → −1 to jedna zmiana strony |
| Wybór celów | Nie dotyczy | Zmiany celu / rundy ofensywne | Naturalna przewaga zakresu C |
| Ocena decyzji | Skala 1–5 | Ta sama skala | Pytanie o co najmniej dwie warte rozważenia akcje |

**Wpływ tempa:** do kopii rundy wyłącz tylko premię inicjatywy, zachowując wybrane akcje, zasoby i HP. Porównaj kolejność i wynik HP. Sama zmiana inicjatywy bez zmiany kolejności nie liczy się jako wpływ. Gdy zmiana kolejności nie zmieniła HP, raportuj ją osobno od zmiany wyniku.

**Zmiana strony tempa:** pomijaj odcinki z wartością 0 i porównuj kolejne niezerowe znaki. Początkowe 0 → +1 nie jest zmianą właściciela, a +1 → 0 → +1 też nią nie jest. Liczba zmian nie przesądza o jakości walki.

**Czas decyzji:** od pokazania pełnej zapowiedzi do potwierdzenia. Odejmij czas ukrycia karty i animacji. Raportuj medianę i 90. percentyl; trening osobno.

Pierwsza sesja badawcza: 6–10 osób, trening obu wariantów, potem po trzy zwykłe starcia każdego wariantu. Połowa zaczyna od A, połowa od C. UI, podgląd i ustawienia szybkości powinny być porównywalne. Traktuj to jako badanie jakościowe z pomocniczymi liczbami, nie rozstrzygający eksperyment statystyczny.

Porównaj najpierw A i C w pojedynkach, później osobno C przeciw 3–5 wrogom. Wariant A nie ma być oceniany negatywnie za brak wyboru celów, skoro testuje inną hipotezę. Nie sumuj jego trzech pojedynków jako ekwiwalentu jednej walki C przeciw trzem wrogom: regeneracja, presja i ekonomia akcji są inne.

Do wspólnego logu zapisuj: anonimowy identyfikator uczestnika, `ruleset`, pełną konfigurację, numer rundy, stan przed wyborem, zamrożony zamiar, dostępne akcje, wybór, czas, zdarzenia, stan po rundzie i wynik. W A dodaj inicjatywy, faktyczne parowanie, ripostę, `tempoBefore` i `tempoAfter`.

Automatyczne polityki do diagnozy:

1. **Stały Atak:** Atak, jeśli legalny; w przeciwnym razie Odpoczynek.
2. **Obrażenia teraz:** wybierz akcję dającą największą faktyczną stratę HP wroga w pełnym podglądzie.
3. **Przeżycie teraz:** najpierw preferuj stan z żywym bohaterem, następnie większe jego HP, następnie większą stratę HP wroga.

W remisach polityk 2 i 3 preferuj większą wytrzymałość bohatera po rundzie, a potem rosnące ID akcji. Polityki mają diagnostycznie różne cele; żadna nie jest automatycznie rozwiązaniem optymalnym na całą walkę. Dla C użyj analogicznych polityk z jego dokumentu i raportuj różnice.

| Wariant | Scenariusz i wersja | Próby | Wygrane | Mediana rund zwycięstw | Mediana czasu decyzji | Najczęstsza akcja i udział | Ocena 1–5 |
|---|---|---:|---:|---:|---:|---|---:|
| A | Do pomiaru | — | — | — | — | — | — |
| C | Do pomiaru | — | — | — | — | — | — |

Jeżeli A ma szybkie decyzje i wysokie zrozumienie, ale powtarzalny schemat, testuj historię AI, koszty i cykle. Jeśli tempo nie wpływa na wynik, porównaj wersję bez niego. Jeśli C daje ciekawsze planowanie kosztem większego czasu decyzji, wybór zależy od docelowej długości walk i roli walki w całym RPG.

## 13 MVP i warianty rozszerzeń

### MVP obowiązkowe

Sześć akcji, wspólny silnik dla obu stron, pełna zapowiedź, inicjatywa z remisami jednoczesnymi, tempo, cztery profile AI, scenariusze A01–A04, podgląd całej rundy, log, zapis JSON, restart i telemetria. Brak rozwoju postaci oraz losowania.

MVP jest gotowe do testów, gdy wszystkie przypadki A-T01–A-T18 przechodzą, zapis odtwarza identyczną walkę, UI pokazuje legalność i skutki, a podgląd zgadza się z rozstrzygnięciem. Nie utożsamiaj przejścia testów reguł z potwierdzeniem, że mechanika jest już dobrze zbalansowana.

### Osobne eksperymenty po bazowej wersji

| Wariant | Konkretna zmiana | Hipoteza |
|---|---|---|
| Bez tempa | Wszędzie premia inicjatywy 0; pozostałe zasady identyczne | Czy licznik daje wartość większą niż koszt poznawczy |
| Tempo jako zasób | Akcja „Zryw” wydaje 1 punkt własnej przewagi za +2 inicjatywy w tej rundzie | Czy aktywne wydawanie przewagi jest ciekawsze od pasywnego bonusu |
| Częściowa zapowiedź | Pokaż kategorię Atak, Obrona lub Podstęp; dokładną akcję ujawnij po wyborze | Czy niepewność poprawia przewidywanie; podgląd musi pokazywać zbiór możliwych wyników |
| Sekwencja trzech akcji | Obie strony planują trzy kolejne wymiany i ujawniają je po jednej | Czy planowanie z wyprzedzeniem jest ciekawsze; wymaga osobnych reguł kosztów i fallbacków |
| Style broni | Jedna konfiguracja zmienia szybkość lub obrażenia jednej akcji o 1 | Czy mała asymetria wystarcza do odmiennych stylów |
| Postawy | Wybór przed akcją: agresywna +2 obrażeń i −1 pancerza; ostrożna odwrotnie | Czy dodatkowa decyzja daje coś ponad wybór akcji |
| Ucieczka | Akcja bez obrażeń, sukces po przeżyciu rundy z własnym tempem ≥ 1 na początku | Czy budowanie przewagi wspiera cele inne niż eliminacja |
| Jawny losowy rozrzut | Oddzielna wersja: do każdego pakietu dodaj jeden `u` z {−1,0,1}, po 1/3, przed parowaniem | Czy napięcie jest warte utraty dokładnego podglądu |

Rozszerzenia są propozycjami, nie częścią kompletnej wersji bazowej. Każde wymaga doprecyzowania nowych interakcji i testów przed wdrożeniem. Przy losowaniu zapisz algorytm PRNG, jego stan i porządek rzutów; podgląd pokazuje wszystkie możliwe wyniki lub ich zakres. Po wprowadzeniu ukrytej informacji nie wolno nadal wyświetlać jednego pewnego wyniku rundy.

Walka jednego bohatera z grupą nie jest małym rozszerzeniem A. Kontra i jedna odpowiedź na rundę zmieniają wartość przy wielu atakujących. Do tego celu służy odrębny wariant C; połączenie wymaga nowego projektu ekonomii akcji.

## 14 Pierwowzory i różnice

Źródła i adresy sprawdzono 18 października 2026. Materiały produktowe wskazują miejsce dostępu do gry; nie należy traktować ich jako otwartego pełnego zestawu zasad. Nie przenosimy tabel, opisów ani nazw świata przedstawionego.

### 14.1 Mouse Guard

Najważniejszy punkt odniesienia dla kategorii działań i ich zestawiania. System konfliktów używa akcji Attack, Defend, Feint i Maneuver oraz testów zależnych od zestawienia. Oficjalne forum wyjaśnia m.in., że Attack przeciw Attack jest rozstrzygane niezależnymi testami, a Attack przeciw Defend testem przeciwstawnym. To nie odpowiada naszej kolejce ciosów według szybkości. [Wyjaśnienie rozstrzygania na forum wydawcy](https://forums.burningwheel.com/t/conflict-who-strikes-first/23225).

W A wybiera się jedną akcję po ujawnieniu dokładnego zamiaru przeciwnika. Mamy indywidualne HP, wytrzymałość, cooldown, pancerz i deterministyczną macierz. Nie twierdzimy, że 6 punktów parowania, 7 obrażeń riposty lub bonus Zwodu są zasadami Mouse Guard. Planowanie sekwencji pozostaje osobnym przyszłym eksperymentem. [Oficjalne karty postaci i materiały MG](https://www.burningwheel.com/products/mouse-guard-character-gm-sheets-pdf).

### 14.2 Burning Wheel

To punkt odniesienia do dalszego studiowania szczegółowego konfliktu i planowania działań. Wydawca udostępnia podręcznik oraz zestaw arkuszy. Ta specyfikacja nie odtwarza systemu Fight ani jego dokładnych interakcji; pełne reguły trzeba sprawdzać w podręczniku. Sam bezpłatny materiał Hub and Spokes nie jest pełnym opisem Fight. [Burning Wheel Gold Revised](https://www.burningwheel.com/products/burning-wheel-gold-revised-pdf), [oficjalne arkusze do gry](https://www.burningwheel.com/products/burning-wheel-gold-play-sheet-pdfs?variant=45570197487802).

Różnicą A jest przede wszystkim pełna zapowiedź, jedna wymiana na decyzję i brak testów pulą kości. Nie określaj tego prototypu jako implementacji Burning Wheel.

### 14.3 Slay the Spire

Inspiruje ujawnieniem zamiarów przed decyzją. Twórcy opisują rozwój tego interfejsu w wywiadzie. A zastępuje talię stałymi akcjami i symetrycznymi regułami pojedynku. [Gra na stronie Mega Crit](https://www.megacrit.com/games/), [wywiad z twórcami o zamiarach](https://arstechnica.com/video/watch/war-stories-slay-the-spire-war-stories/?c=series).

### 14.4 Ironsworn

Oryginalny Ironsworn jest punktem odniesienia dla odróżnienia kontroli nad starciem od zwykłego miejsca w kolejce. Do samodzielnego przestudiowania tej idei służą oficjalny podręcznik, playkit i skrót zasad. Nie należy mieszać ich z zasadami późniejszego Starforged. [Oficjalne bezpłatne materiały Tomkin Press](https://tomkinpress.com/collections/free-downloads), [podręcznik Ironsworn](https://tomkinpress.com/collections/free-downloads/products/ironsworn-digital-edition-rulebook), [skrót zasad](https://tomkinpress.com/collections/free-downloads/products/ironsworn-rules-summary).

Nasz licznik −2…+2, aktualizowany różnicą strat HP, jest autorski. Nie jest inicjatywą z Ironsworn, jego zasobem momentum ani torem postępu. A ma stałą rundę, akcje obu stron i automatyczne zakończenie przy HP = 0; nie implementuje narracyjnych ruchów Ironsworn.

### 14.5 The One Ring 2e

To odniesienie dla decyzji o sposobie prowadzenia walki. W A nie implementujemy jego postaw ani testów; proponowane rozszerzenie agresywne/ostrożne z rozdziału 13 ma własne liczby. Nie przypisujemy The One Ring stałych bonusów procentowych z wcześniejszej rozmowy. Oficjalna strona wskazuje podręcznik drugiej edycji z rozdziałem walki. [The One Ring Core Rules 2e](https://freeleaguepublishing.com/shop/the-one-ring/core-rules-2/).

### 14.6 Pozostałe punkty odniesienia

- **13th Age SRD.** W rzeczywistych regułach kostka eskalacji rośnie od drugiej rundy i zasadniczo daje bohaterom premię do ataku. Tempo A jest obustronne, zależy od wymiany obrażeń i wpływa na inicjatywę; nie jest adaptacją tej kostki. Nie przenosimy też abstrakcyjnych odległości. [13th Age SRD Combat Rules](https://www.13thagesrd.com/combat-rules/).
- **Into the Breach.** Producent opisuje zapowiadanie ataków przeciwników. Przenosimy zasadę czytelnego zagrożenia jako inspirację projektową, a nie siatkę lub reguły przesuwania. [Opis producenta na Steam](https://store.steampowered.com/app/590380/Into_the_Breach/).
- **Darkest Dungeon.** Oficjalny opis przedstawia turowe RPG o drużynie i stresie. Jest ważniejsze dla C; A nie implementuje stresu, szeregów ani sterowania drużyną. [Oficjalna strona gry](https://www.darkestdungeon.com/darkest-dungeon/).
- **Proces pomiarowy.** Wykład współautora Slay the Spire dotyczy używania metryk w projektowaniu i balansie. Progi 60%, długości starć i pozostałe cele z tego dokumentu są naszymi hipotezami, nie wynikami Mega Crit. [Anthony Giovannetti na GDC 2019](https://gdcvault.com/browse/gdc-19/play/1025731), [slajdy autora](https://media.gdcvault.com/gdc2019/presentations/Giovannetti_Anthony_SlayTheSpire.pdf).

Najkrótsza poprawna etykieta prototypu to „autorski deterministyczny pojedynek inspirowany wyborem reakcji i jawnymi zamiarami”. Nie wymaga znajomości pierwowzorów: wszystkie reguły potrzebne do implementacji wersji bazowej znajdują się powyżej.
