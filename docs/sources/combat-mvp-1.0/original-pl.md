# Warmaster — postawy, karty i odległości

**Autorski system walki bez mapy do jednoosobowego RPG w przeglądarce**  
**Specyfikacja MVP 1.0 · 18 października 2026 · język: polski**

Dokument jest samodzielną specyfikacją: wystarcza do implementacji i rozegrania walk bez podręczników innych gier. Gracz prowadzi jednego bohatera przeciw 1–5 przeciwnikom. Opcjonalnie pomaga mu jeden automatyczny towarzysz. Decyzja na rundę to **postawa + jedna karta lub czynność + wymagany cel**. Ruch również zużywa akcję.

**Pochodzenie reguł.** Wszystkie liczby, formuły, karty, kolejność faz, algorytmy AI i model odległości w rozdziałach 1–16 są autorską propozycją. Inspiracje ograniczają się do abstrakcyjnych dystansów i związania w *13th Age*, wyboru postawy w *The One Ring* oraz wyboru oddziałujących na siebie działań w *Mouse Guard*. Dokument nie odtwarza reguł tych gier i nie wymaga ich łączenia. Rozdział 17 wskazuje źródła oraz różnice. Parametry są punktem wyjścia do testów, a nie deklaracją potwierdzonego balansu.

## 1. Cel i zakres MVP

Walka ma nagradzać rozpoznanie zamiaru przeciwnika, wybór celu, zarządzanie wytrzymałością i przyjęcie świadomego ryzyka. Pozycja ma znaczenie przez zasięg oraz konkretne związania, bez współrzędnych, pól, kierunków i mierzenia metrów.

Wersja bazowa obejmuje:

- Trzy odległości: **Zwarcie / Blisko / Daleko**.
- Trzy postawy: **Agresywna / Zrównoważona / Defensywna**.
- Sześć stale widocznych kart: **Potężne uderzenie, Kontratak, Zwód, Osłona, Szarża, Przygotowanie**.
- Zwykły Atak, Obrona oraz trzy czynności ruchowe jako dostępne przyciski pomocnicze.
- Jawne, zamrożone zamiary przeciwników i towarzysza.
- Deterministyczne trafienia, obrażenia i rozstrzyganie remisów.
- Maksymalnie dwa pierwotne ataki wrogów w rundzie, łącznie dla całej drużyny gracza.
- Zwycięstwo, porażkę, poddanie i limit 30 rund.

Nie ma dobierania kart, talii odrzutów, losowych krytyków, ekwipunku, rozwoju poziomów, leczenia ani efektów okresowych. Karta jest sposobem przedstawienia umiejętności, nie zużywalnym przedmiotem. Wszystkie sześć kart jest odblokowanych od pierwszej walki. Bohater nie ma strzału w bazowym zestawie; dystansowy przeciwnik i opcjonalny łucznik wystarczają do sprawdzenia zasięgów.

Pełna informacja oznacza, że dla konkretnego celu może istnieć najlepszy ruch. MVP sprawdza jakość kompromisów między zdrowiem, czasem, wytrzymałością i bezpieczeństwem towarzysza. Nie symuluje zgadywania ukrytej karty.

## 2. Słownik, jednostki i stan początkowy

### 2.1. Parametry uczestnika

| Pole | Bohater | Znaczenie |
|---|---:|---|
| `hp`, `maxHp` | 40/40 | Zdrowie; 0 oznacza natychmiastowe wyeliminowanie |
| `stamina`, `maxStamina` | 10/10 | Wytrzymałość płacona przy zatwierdzeniu wyboru |
| `skill` | 4 | Bazowa skuteczność ataku |
| `defense` | 4 | Bazowa trudność trafienia postaci |
| `armor` | 1 | Redukcja każdego trafionego pakietu obrażeń |
| `power` | 0 | Dodatek do surowych obrażeń własnego trafienia |
| `stance` | Zrównoważona | Bieżąca postawa; w każdej rundzie wybierana ponownie |
| `groupId` | `g0` | Grupa bliskości, opisana w rozdziale 3 |
| `guard` | 0 | Pula ochrony zużywana po pancerzu; znika po rundzie |
| `readyRound` | `null` | Numer rundy, w której działa Przygotowanie |
| `availableRound` | Wszystkie karty od 1 | Najwcześniejsza runda ponownego użycia każdej karty |

Przeciwnicy mają HP, umiejętność, obronę, pancerz, moc, postawę i pozycję, ale **nie mają wytrzymałości ani odnowień kart**. Ich ograniczeniami są jawny cykl działania i dwa miejsca ataku. To zamierzona asymetria MVP. Towarzysz ma wytrzymałość i używa reguł bohatera, z ograniczonym zestawem działań.

Wszystkie wielkości mechaniczne są całkowite. `clamp(x, lo, hi) = min(hi, max(lo, x))`. HP i wytrzymałość mieszczą się w przedziale od 0 do maksimum. Obrażenia mogą wynieść 0. Nadmiar obrażeń przepada.

### 2.2. Pojęcia

| Pojęcie | Definicja |
|---|---|
| Wolny | Uczestnik nie ma żadnego związania z żywym wrogiem |
| Związany | Uczestnik ma co najmniej jedno związanie z żywym wrogiem |
| Zamiar | Ujawnione działanie, postawa i cel AI na bieżącą rundę |
| Atak pierwotny | Atak, Potężne uderzenie, Zwód, ofensywna część Szarży lub Strzał |
| Atak bezpośredni | Atak, Potężne uderzenie lub ofensywna część Szarży; tylko te działania uruchamiają Kontratak |
| Próba ataku | Atak po sprawdzeniu, że obie postacie żyją i jego zasięg jest legalny; może chybić |
| Riposta | Dodatkowy pojedynczy cios będący częścią Kontrataku; nie uruchamia kolejnych reakcji |
| Osłona | Nazwa karty przejmującej jeden atak na sojusznika |
| Ochrona `guard` | Liczbowa pula absorpcji; odrębna od przekierowania przez Osłonę |
| Anulowanie | Zapowiedziany efekt nie dochodzi do skutku, np. cel zginął albo strzelec został związany |

Każda postać ma niezmienny identyfikator ASCII: `h01`, `c01`, `e01` itd. Remisy ID rozstrzyga rosnące porównanie znak po znaku. Kolejność kart na ekranie nie zmienia ID.

## 3. Odległości i związanie bez mapy

### 3.1. Jednoznaczna reprezentacja odległości

Odległość jest **relacją między dwiema postaciami**, nie etykietą wroga mierzoną wyłącznie od bohatera. Dzięki temu działa również przy towarzyszu.

Silnik przechowuje:

1. Jeden `groupId` dla każdej żywej postaci. Wspólna grupa oznacza, że postacie są blisko siebie.
2. Zbiór nieuporządkowanych par `engagements`, np. `[h01, e01]`. Para oznacza związanie dwóch przeciwników.

Odległość `range(a, b)` wylicza się zawsze tak:

```text
jeśli a.id == b.id: SELF, używane tylko do walidacji celu na siebie
jeśli para(a, b) należy do engagements: ZWARCIE
jeśli a.groupId == b.groupId: BLISKO
w przeciwnym razie: DALEKO
```

`SELF` jest znacznikiem technicznym, nie czwartym dystansem walki. Związanie wolno utworzyć wyłącznie między żywymi przeciwnikami w tej samej grupie. Nie ma związania sojusznika z sojusznikiem. Odległość jest symetryczna.

Grupy nie są polami ani rzędami. Są minimalną pamięcią relacji bliskości: postacie w tej samej grupie są wzajemnie Blisko, poza bezpośrednio związanymi parami. Dwie różne grupy są zawsze Daleko. Nie przechowuje się metrów ani kolejności grup. Można je przedstawiać jako listy „przy bohaterze”, „przy łuczniku”, bez planszy.

**Konsekwencja tej abstrakcji:** dołączenie do grupy celu przybliża postać także do wszystkich innych członków tej grupy. To jawna reguła, a nie przypadkowa zmiana pozostałych odległości. W MVP nie występuje układ „A blisko B, B blisko C, A daleko C” dla trzech niezwiązanych postaci.

### 3.2. Co umożliwiają dystanse

| Relacja do celu | Możliwe działania |
|---|---|
| Zwarcie | Atak wręcz, Potężne uderzenie, Zwód, Kontratak przeciw temu napastnikowi |
| Blisko, przeciwnik | Wolny aktor może wejść w Zwarcie przez Podejście lub Szarżę |
| Blisko, sojusznik | Można wybrać go jako cel Osłony |
| Daleko | Wolny aktor potrzebuje Podejścia do grupy celu, zanim będzie mógł wejść w Zwarcie |
| Blisko lub Daleko | Strzał, jeżeli strzelec jest wolny; status celu nie blokuje strzału |

Wszyscy widzą wszystkie żywe postacie. Nie ma osłon terenowych ani przeszkód. Samo znajdowanie się w grupie wroga nie ogranicza wyboru celów. Pancerz i aktywna Osłona są jedynymi barierami po spełnieniu zasięgu.

### 3.3. Wiele związań

Bohater może być związany jednocześnie z `e01`, `e02` i `e03`. Atak wręcz może wybrać dowolnego z tych wrogów. Jeśli bohater i towarzysz są związani z tym samym wrogiem, nie oznacza to ich związania z pozostałymi przeciwnikami.

Nowy wolny napastnik może dołączyć do walki z już związanym celem. Nie ma limitu liczby krawędzi; limit dwóch ataków wrogów opisany w rozdziale 9 dotyczy zapowiedzi ataków, nie geometrii ani związań.

Związany aktor nie może użyć Podejścia, Szarży ani Odwrotu. Może atakować własnych związanych wrogów, bronić się, przygotować, osłonić pobliskiego sojusznika albo wykonać Odskok. Nie może „przeklikać” się w Zwarcie z nowym celem bez usunięcia obecnych związań.

Eliminacja usuwa natychmiast wszystkie krawędzie martwej postaci. Pozostałe krawędzie pozostają. Śmierć jednego z trzech wrogów nie uwalnia od pozostałych dwóch.

### 3.4. Czynności ruchowe

Każda czynność zużywa całą akcję rundy. Nie daje zwykłego ataku, ochrony ani dodatkowej regeneracji. Można łączyć ją z dowolną postawą.

| Czynność | Koszt | Warunek przy wyborze | Wynik |
|---|---:|---|---|
| Podejście `approach` do celu Daleko | 0 | Aktor wolny; dowolny inny żywy cel | Zapisz wariant `JOIN`: aktor dołącza do grupy celu; nie tworzy związania |
| Podejście `approach` do wroga Blisko | 0 | Aktor wolny; żywy przeciwnik | Zapisz wariant `ENGAGE`: utwórz jedno związanie z wybranym wrogiem |
| Odskok `disengage` | 1 | Aktor związany | Usuń wszystkie jego związania; pozostaje w tej samej grupie |
| Odwrót `withdraw` | 0 | Aktor wolny | Przenieś go do nowej pustej grupy; wobec wszystkich innych jest Daleko |

Wolno podejść do dalekiego sojusznika, aby móc osłonić go w kolejnej rundzie. Podejście do sojusznika już Blisko jest nielegalne. Podejście do wroga w Zwarciu także jest nielegalne.

Przy wykonaniu `JOIN` używa się aktualnej grupy zapisanego celu. Jeśli aktor jest już w tej grupie, ruch nie zmienia stanu i nie zamienia się w związanie. `ENGAGE` wymaga, aby cel nadal był Blisko; gdy odszedł Daleko, ruch przepada. W obu wariantach aktor musi nadal być wolny, a cel żywy. Nowa grupa Odwrotu dostaje kolejne ID z licznika zapisanego w stanie, np. `g2`. Grupy puste można usuwać, lecz nie zmieniać ID pozostałych.

**Nie ma ataków okazyjnych ani testu wyrwania się.** Odskok usuwa nawet trzy związania za tę samą cenę. W tej rundzie unieważni ataki wymagające starego Zwarcia, ale późniejsze Podejście lub Szarża wroga może utworzyć nowe związanie. Bezpieczne oddalenie się od Zwarcia do Daleko wymaga zwykle dwóch własnych akcji: Odskok, następnie Odwrót. Odwrót nie jest ucieczką z potyczki.

## 4. Postawy

Postawa obowiązuje od zatwierdzenia rundy do końca jej rozstrzygnięcia, również zanim postać wykona swój cios. Wybór i zmiana nie kosztują wytrzymałości. Nie ma kary za zmianę między rundami.

| Postawa | Modyfikator ataku | Modyfikator obrony | Dostępne karty specjalne |
|---|---:|---:|---|
| Agresywna `aggressive` | +2 | −2 | Potężne uderzenie, Zwód, Szarża, Przygotowanie |
| Zrównoważona `balanced` | 0 | 0 | Potężne uderzenie, Kontratak, Zwód, Osłona, Przygotowanie |
| Defensywna `defensive` | −2 | +2 | Kontratak, Osłona, Przygotowanie |

Atak podstawowy, Obrona, Podejście, Odskok i Odwrót są dostępne w każdej postawie. Strzał jednostek, które go mają, jest dostępny w każdej postawie. Postawa nie zmienia dystansu, liczby akcji, pancerza ani regeneracji.

Modyfikatory stosuje się do wszystkich ataków postaci, także riposty i Strzału, oraz do obrony przeciw wszystkim atakom, także dystansowym. Zwód ma wyjątek: ignoruje dodatni bonus postawy do obrony celu. Liczbowe efekty są autorskie; nie są wartościami z *The One Ring*.

## 5. Karty i akcje

### 5.1. Tabela implementacyjna

`A` oznacza Agresywną, `Z` Zrównoważoną, `D` Defensywną. Obrażenia w tabeli są surowe, przed mocą, Przygotowaniem i redukcjami. Priorytet służy wyłącznie do kolejności ciosów: większy działa wcześniej.

| ID / karta | Koszt | Postawy | Cel i zasięg przy wyborze | Celność karty | Obrażenia bazowe | Priorytet | CD |
|---|---:|---|---|---:|---:|---:|---:|
| `heavy` Potężne uderzenie | 4 | A, Z | Jeden wróg w Zwarciu | −1 | 13 | 10 | 1 |
| `counter` Kontratak | 3 | Z, D | Na siebie; co najmniej jedno związanie | +2 dla riposty | 7 dla riposty | Reakcja | 1 |
| `feint` Zwód | 2 | A, Z | Jeden wróg w Zwarciu | +2 | 6, lub 9 przeciw postawie D | 30 | 0 |
| `cover` Osłona | 2 | Z, D | Jeden inny żywy sojusznik Blisko | — | — | Obrona | 0 |
| `charge` Szarża | 3 | A | Jeden wróg Blisko; aktor wolny | 0 | 6 | 20 | 0 |
| `prepare` Przygotowanie | 0 | A, Z, D | Na siebie | — | — | Wsparcie | 0 |

`CD = 1` blokuje użycie przez jedną pełną następną rundę. Karta zagrana w rundzie `r` jest dostępna od `r + 2`. Ogólnie `availableRound = r + CD + 1`. Początkowo wszystkie karty mają wartość 1. CD = 0 pozwala powtórzyć kartę w następnej rundzie. Odnowienie i koszt zużywa się już przy zatwierdzeniu, nawet gdy późniejszy efekt zostanie anulowany.

### 5.2. Potężne uderzenie

Po zadeklarowaniu postać otrzymuje **Odsłonięcie: −2 do obrony do końca bieżącej rundy**. Działa ono również przed jej atakiem i po chybieniu. Nie zależy od tego, czy cios zdążył dojść do skutku. Odsłonięcie kumuluje się z postawą Agresywną: bohater o bazowej obronie 4 ma wtedy obronę 0.

Sam cios ma niższy priorytet niż zwykły Atak. Opłaca się do przełamania HP lub pancerza, ale może pozwolić wrogowi uderzyć wcześniej. Nie ignoruje ochrony ani pancerza i nie przerywa działania poza zwykłą eliminacją celu.

### 5.3. Kontratak

Karta przygotowuje jeden znacznik kontry. Nie wybiera się z góry napastnika. Zużywa go **pierwsza legalna próba ataku bezpośredniego**, której faktycznym odbiorcą jest kontrujący i której napastnik jest z nim związany w chwili ataku.

Procedura:

1. Zużyj znacznik, nawet jeśli atak później chybi.
2. Oblicz trafienie. Trafiony cios otrzymuje parowanie 6 surowych obrażeń, przed pancerzem i ochroną.
3. Po rozliczeniu ciosu, jeśli obie strony nadal żyją i są związane, wykonaj natychmiast jedną ripostę: celność +2, bazowe obrażenia 7.
4. Riposta może nastąpić także po chybieniu napastnika lub pełnym sparowaniu. Jest osobną próbą trafienia.

Kontratak nie chroni przed Zwodem, Strzałem ani ripostą. Nie daje puli `guard`. Nie reaguje na samą zapowiedź anulowanego ataku. Przeciw dwóm ciosom paruje tylko pierwszy. Riposta nie wyzwala Kontrataku ani przekierowania Osłony; nie ma łańcuchów reakcji. Po śmiertelnym trafieniu kontrujący nie ripostuje. Niewykorzystany znacznik znika po rundzie bez zwrotu kosztu.

### 5.4. Zwód

Zwód:

- Ma wyższy priorytet niż Atak i Potężne uderzenie.
- Ignoruje dodatni bonus postawy celu do obrony; ujemna modyfikacja Agresywnej nadal działa.
- Ignoruje całą ochronę `guard`, nie zużywając jej.
- Zadaje bazowo 9 zamiast 6 przeciw faktycznemu odbiorcy w postawie Defensywnej.
- Nie uruchamia Kontrataku, ale podlega pancerzowi.

Zwód nie usuwa postawy, przygotowania ani zamiaru przeciwnika. „Przełamanie defensywy” oznacza opisane pominięcie bonusu i ochrony, a nie ogłuszenie. Jeśli atak przejmie Osłona, wszystkie powyższe właściwości sprawdza się wobec osłaniającego.

### 5.5. Osłona

Karta przyznaje osłaniającemu ochronę 6 na bieżącą rundę i zapisuje wskazanego sojusznika jako podopiecznego. Nie przenosi postaci ani nie tworzy związania.

Pierwszy legalny **atak pierwotny** na podopiecznego zostaje przekierowany na osłaniającego, jeśli obaj żyją i nadal są Blisko. Wybór celu ataku i zasięg bada się najpierw wobec pierwotnego celu, następnie obronę i obrażenia liczy się wobec osłaniającego. Nie wykonuje się drugiego testu zasięgu do nowego odbiorcy: przejęcie jest właśnie wyjątkiem pozwalającym osłonić sąsiada. Obejmuje ciosy wręcz i Strzał.

Przekierowanie zużywa się przy próbie, także jeśli atak chybi. Bezpośrednie ataki na osłaniającego mogą wcześniej zużyć jego ochronę, ale nie zużywają znacznika przekierowania. Następne ataki na podopiecznego trafiają normalnie do niego. Jeśli warunek bliskości nie jest spełniony, atak idzie w pierwotny cel, a znacznik pozostaje do ewentualnego późniejszego ataku w tej rundzie.

Atak może zostać przekierowany najwyżej raz. Wzajemna Osłona bohatera i towarzysza nie tworzy pętli. Gdy kilka efektów chroniłoby tę samą postać, wygrywa osłaniający o najniższym ID; inne znaczniki nie są zużywane. W MVP maksymalnie jeden towarzysz sprawia, że ten ostatni przypadek dotyczy głównie przyszłych rozszerzeń.

Bez towarzysza karta jest widoczna, ale nieaktywna z opisem „Wymaga pobliskiego sojusznika”. Postać nie może osłaniać siebie. Nie ma automatycznego przechwytywania ruchu wrogów.

### 5.6. Szarża

Przy wyborze wymaga wolnego aktora, postawy Agresywnej i wroga Blisko. Nie sięga bezpośrednio do Daleko.

W fazie ruchu tworzy związanie z celem, jeżeli aktor nadal jest wolny i cel nadal jest Blisko. Zapisuje sukces ruchu. W fazie ciosów z priorytetem 20 wykonuje atak o bazowych obrażeniach 6, ale tylko jeśli ruch się udał, obie postacie żyją i nadal są związane.

Nieudany ruch nie zamienia Szarży w zwykły Atak, nawet jeśli ktoś później utworzy wymagane związanie. Udana Szarża może zablokować zapowiedziany Strzał przez związanie strzelca. Nie blokuje jego innego ataku wręcz ani Przygotowania. Wrogowie, którzy używają Szarży, podlegają tym samym regułom poza opłatą wytrzymałości.

### 5.7. Przygotowanie

W bieżącej rundzie postać nie atakuje i nie otrzymuje ochrony. Zapisz `readyRound = r + 1`. Na koniec bieżącej, nieterminalnej rundy żywy bohater lub towarzysz odzyskuje dodatkowe 3 wytrzymałości, czyli łącznie 5 z regeneracją bazową.

W rundzie `r + 1` pierwsza zadeklarowana ofensywna karta lub akcja tej postaci otrzymuje **+2 do trafienia i +3 do surowych obrażeń**. Dotyczy Ataku, Potężnego uderzenia, Zwodu, Szarży, Strzału i riposty Kontrataku. Bonus przechwytuje się przy zatwierdzeniu akcji do jej danych, a znacznik zużywa wtedy, nawet jeśli później nie będzie legalnego trafienia lub Kontratak nie zostanie wyzwolony.

Przygotowanie nie kumuluje się i nie daje dodatkowej akcji. Jeśli w następnej rundzie wybrano ruch, Obronę albo Osłonę, bonus przepada na koniec tej rundy. Powtórzenie Przygotowania ustanawia nowy bonus na kolejną rundę, bez zachowania starego. Wróg może otrzymać premię do następnego ataku, ale nie korzysta z regeneracji zasobu, którego nie ma.

### 5.8. Akcje podstawowe

| ID / akcja | Koszt | Warunek | Efekt |
|---|---:|---|---|
| `strike` Atak | 0 | Jeden wróg w Zwarciu | Celność 0, bazowe obrażenia 8, priorytet 20, CD 0 |
| `brace` Obrona | 0 | Na siebie | Ochrona 6; brak ataku i dodatkowej regeneracji |
| `shot` Strzał | 0 | Tylko jednostka z tą umiejętnością; wolna; wróg Blisko lub Daleko | Celność 0, obrażenia według profilu, priorytet 20 |

Wrogowie mogą mieć własną bazową wartość Ataku i Potężnego uderzenia z tabeli profili. Pozostałe modyfikatory, Odsłonięcie i priorytety pozostają takie same. Bohater i towarzysz stosują wartości tabel kart, o ile profil towarzysza nie definiuje własnego Strzału.

## 6. Trafienie, obrona i obrażenia

### 6.1. Trafienie bez losowania

Najpierw sprawdź, czy atakujący i pierwotny cel żyją i czy atak jest legalny w aktualnym stanie. Atak wręcz wymaga ich konkretnego związania. Strzał wymaga wolnego strzelca. Dopiero legalna próba może wyzwolić Osłonę lub Kontratak.

Po ewentualnym przekierowaniu ustal faktycznego odbiorcę `t`:

```text
attackScore = attacker.skill + stanceAttack(attacker)
              + cardAccuracy + preparedAccuracy

stanceDefenseUsed = stanceDefense(t)
jeśli atak to Zwód: stanceDefenseUsed = min(0, stanceDefenseUsed)

defenseScore = max(0, t.defense + stanceDefenseUsed - exposedPenalty(t))
hit = attackScore >= defenseScore
```

`exposedPenalty` wynosi 2 po zadeklarowanym Potężnym uderzeniu, w przeciwnym razie 0. `preparedAccuracy` wynosi 2 lub 0. Remis jest trafieniem. Nie ma rzutów, progów krytycznych ani gwarantowanego trafienia. Chybienie zadaje 0 i nie zużywa ochrony. Interfejs pokazuje „trafi” lub „chybi”, nie procentową szansę.

### 6.2. Kolejność redukcji

```text
raw = max(0, baseDamage + attacker.power + preparedDamage)
afterParry = max(0, raw - parry)        # parry = 6 tylko dla wyzwolonej Kontry
afterArmor = max(0, afterParry - t.armor)

jeśli atak to Zwód:
    absorbed = 0
inaczej:
    absorbed = min(t.guard, afterArmor)
    t.guard -= absorbed

hpLoss = afterArmor - absorbed
t.hp = max(0, t.hp - hpLoss)
```

Powyższy blok wykonuje się tylko przy trafieniu. `preparedDamage` wynosi 3 lub 0. Bazę Zwodu wybierz według postawy faktycznego odbiorcy. Pancerz odejmuje się od każdego osobnego trafienia. Ochrona jest wspólną, malejącą pulą dla wszystkich ataków tej rundy; nie odnawia się między ciosami. Nie ma minimalnych obrażeń.

Przykład redukcji: surowe 12, parowanie 6, pancerz 1, ochrona 3 → `12 − 6 = 6`, `6 − 1 = 5`, ochrona pochłania 3, utrata HP = 2. Nie wolno odjąć ochrony przed pancerzem ani zastosować jej pełnej wartości do każdego ataku.

### 6.3. Kolejność ciosów i eliminacja

Ataki pierwotne sortuje się po:

1. Priorytecie malejąco: Zwód 30, Atak/Strzał/Szarża 20, Potężne uderzenie 10.
2. Roli aktora: bohater, potem towarzysz, potem przeciwnicy.
3. ID aktora rosnąco.

Postawa nie zmienia priorytetu. Remisy nie są jednoczesne. Pierwszy cios może wyeliminować drugiego aktora i usunąć jego późniejszy atak. Riposta następuje natychmiast po wyzwalającym ją ataku, zanim kolejka przejdzie dalej.

Po każdej zmianie HP usuń związania wyeliminowanych i sprawdź wynik: HP bohatera = 0 oznacza `LOSS`; brak żywych wrogów oznacza `WIN`. W MVP nie ma jednoczesnego zadania obrażeń obydwu stronom. Eliminacja towarzysza nie kończy walki. Żadna zapowiedziana akcja nie wybiera nowego celu po śmierci poprzedniego.

## 7. Pełna kolejność rundy

Fazy stanu: `PLAN`, `CHOOSE`, `RESOLVE`, `FINISHED`. Runda pierwsza ma numer 1.

| Krok | Faza | Czynności |
|---:|---|---|
| 1 | `PLAN` | Usuń pozostałości ochrony, kontry, Osłony, Odsłonięcia i premii przypiętych do poprzedniej akcji; zachowaj związania, HP, wytrzymałość, `availableRound` i ważne Przygotowanie |
| 2 | `PLAN` | Na podstawie stanu początkowego wybierz postawy, działania i cele wrogów; przydziel dwa miejsca ataku; zamroź plan |
| 3 | `PLAN` | Wybierz plan towarzysza według rozdziału 10 na podstawie tego samego stanu i zamrożonego planu wrogów |
| 4 | `CHOOSE` | Pokaż wszystkie zamiary; gracz wybiera postawę, jedną akcję i wymagany cel |
| 5 | `RESOLVE` | Atomowo zweryfikuj całą komendę, koszty, postawę, zasięg, cel i odnowienie. Błąd pozostawia stan bez zmian w `CHOOSE` |
| 6 | `RESOLVE` | Przy legalnej komendzie odejmij koszt bohatera i towarzysza, ustaw odnowienia, zastosuj wszystkie wybrane postawy, przechwyć bonusy Przygotowania do akcji ofensywnych |
| 7 | `RESOLVE` | Jednocześnie ustanów efekty deklaracji: Odsłonięcie, ochronę Obrony/Osłony/czekania wroga, znaczniki Osłony i Kontry, następne Przygotowanie |
| 8 | `RESOLVE` | Wykonaj ruchy: bohater → towarzysz → wrogowie po ID; Szarża wykonuje tutaj tylko część ruchową |
| 9 | `RESOLVE` | Zbuduj kolejkę ataków pierwotnych według rozdziału 6; przed każdym ponownie sprawdzaj życie i zasięg; rozliczaj przekierowanie, Kontrę, trafienie, obrażenia oraz ewentualną ripostę |
| 10 | `RESOLVE` | Jeśli walka trwa: żywy bohater i towarzysz odzyskują 2 wytrzymałości, a po Przygotowaniu dodatkowe 3; ogranicz do maksimum |
| 11 | `RESOLVE` | Zaktualizuj wiek oczekiwania wrogów; usuń efekty rundy; usuń niewykorzystane Przygotowanie ważne najpóźniej w tej rundzie; zapisz dziennik |
| 12 | `PLAN` / `FINISHED` | Po pełnej rundzie 30 bez zwycięstwa/porażki ustaw `DRAW_LIMIT`; inaczej zwiększ numer i przejdź do planowania |

Efekty deklaracji działają przed wszystkimi ciosami, także gdy ich właściciel miałby działać później. Niektóre znaczniki mogą więc zostać ustanowione, a następnie utracić znaczenie po eliminacji właściciela. Nie ma osobnej fazy ataków drużyny gracza przed wszystkimi wrogami.

W MVP między zatwierdzeniem a fazą ruchu nic nie zmienia pozycji ani HP, dlatego plan towarzysza wybrany w kroku 3 ma nadal legalną deklarację. Nie zmienia on planu po wyborze gracza. Walidacja implementacji musi mimo to odrzucić uszkodzony zapis lub nieaktualną komendę, zamiast opłacić część rundy.

Runda terminalna kończy się natychmiast po śmiertelnym trafieniu: bez regeneracji, naliczania wieku, usuwania efektów i dalszych ciosów. Zapis końcowy oznacz jako `FINISHED`, zachowując rzeczywiście wykonane zdarzenia. Na ekranie wyniku efekty tymczasowe nie są prezentowane jako aktywna kolejna runda. Przycisk „Poddaj walkę” w `CHOOSE` ustawia `LOSS_SURRENDER` bez symulowania ataków.

Kosztów nie można finansować regeneracją, która dopiero nastąpi. Wytrzymałość 0 nie osłabia bazowych statystyk; blokuje wyłącznie płatne działania. Zawsze legalna Obrona zapewnia możliwość zakończenia wyboru.

## 8. AI pojedynczego przeciwnika

### 8.1. Profile startowe

Każdy wróg ma `power = 0`, `waitAge = 0` i `phaseOffset = 0`, chyba że scenariusz stanowi inaczej. `S` oznacza Atak, `H` Potężne uderzenie, `B` Obronę, `P` Przygotowanie, `R` Strzał. Postawy podano przy każdej akcji.

| Profil | HP | Umiejętność | Obrona | Pancerz | Atak / Potężne / Strzał | Powtarzany cykl |
|---|---:|---:|---:|---:|---|---|
| Bandyta `raider` | 14 | 4 | 4 | 0 | 7 / 12 / — | `S(A), H(A), S(Z), B(D)` |
| Osiłek `brute` | 26 | 4 | 4 | 1 | 8 / 12 / — | `H(A), P(D), S(Z)` |
| Strażnik `sentinel` | 20 | 4 | 4 | 1 | 6 / 11 / — | `B(D), S(Z), H(A)` |
| Łucznik `archer` | 12 | 4 | 4 | 0 | 4 / — / 6 | `R(Z), R(Z), P(D)` |

Wybór pozycji cyklu: `index = (round - 1 + phaseOffset) mod length(cycle)`. Cykl postępuje według rund globalnych także po anulowaniu ataku, przemieszczeniu, czekaniu lub braku miejsca. Wróg nie zapamiętuje niewykonanego Potężnego uderzenia do następnej rundy. Przesunięcie fazy jest widoczną częścią scenariusza, nie losowaniem.

### 8.2. Wybór celu

Wróg atakujący wręcz wybiera spośród swoich związanych przeciwników tego o najmniejszym bieżącym HP; remis rozstrzyga ID. Jeśli z nikim nie jest związany, wybiera żywego bohatera. Nie omija bohatera, żeby samodzielnie gonić wolnego towarzysza.

Wolny łucznik wybiera żywego bohatera. Związany łucznik zawsze zastępuje cały wpis cyklu zwykłym Atakiem w postawie Zrównoważonej na związanego przeciwnika według powyższej reguły, nawet jeśli wpisem było Przygotowanie. To jedyny taki wyjątek profilu.

Wszystkie cele zostają zamrożone przed wyborem gracza. Po późniejszej śmierci celu, jego odejściu lub związaniu strzelca akcja może przepaść, ale wróg nie zmienia jej na korzystniejszą. Osłona może przejąć legalny atak według swoich jawnych reguł.

### 8.3. Dostosowanie zamiaru do zasięgu

Dla wpisu melee `S` lub `H`:

- Jeśli wróg jest związany z wybranym celem: zachowuje wpis.
- Jeśli jest wolny, a cel jest Daleko: zastępuje wpis Podejściem `JOIN`, zachowując postawę wpisu.
- Jeśli jest wolny, a cel jest Blisko i wpis ma postawę Agresywną: zastępuje wpis Szarżą; bazowe obrażenia Szarży wynoszą 6 dla każdego profilu.
- Jeśli jest wolny, a cel jest Blisko i wpis ma postawę Zrównoważoną: zastępuje wpis Podejściem `ENGAGE` w Zrównoważonej.

Obrona i Przygotowanie nie wymagają związania, więc pozostają sobą. Wolny Strzał ma legalny zasięg do każdego wroga. Brak żywego bohatera jest już stanem końcowym, więc AI nie musi planować nowej rundy.

Jeżeli wróg zapowiedział zwykły Atak, a bohater zrobi Odskok, wróg nie dopisuje Szarży po fakcie. Jeśli zapowiedział Szarżę, a wcześniejszy ruch bohatera związał go z innym uczestnikiem, nie jest już wolny i jego ruch się nie uda.

AI nie czyta aktualnie zaznaczanej karty ani nie przelicza planu po zatwierdzeniu gracza. Ponowne otwarcie zapisu w `CHOOSE` przywraca ten sam plan.

## 9. Kilku przeciwników naraz

### 9.1. Budżet dwóch ataków

Po wybraniu indywidualnych zamiarów zbuduj listę wrogów, których wynikowym zamiarem jest atak pierwotny, wliczając Szarżę i Strzał. Podejście, Obrona i Przygotowanie nie są kandydatami. Wrogowie MVP nie używają Kontrataku, Zwodu ani Osłony.

Kandydatów sortuj kolejno po:

1. `waitAge` malejąco.
2. Bazowych obrażeniach wynikowego zamiaru malejąco, bez mocy i Przygotowania.
3. ID rosnąco.

Pierwszych dwóch otrzymuje `attackSlot = true`. Pozostali zastępują wynikowy zamiar **Czekaniem z osłoną** `wait`: nie przemieszczają się, nie atakują i otrzymują ochronę 3 w fazie deklaracji. Zachowują wybraną postawę. Nie dostają Odsłonięcia za odrzucone Potężne uderzenie. Nie zużywają Przygotowania, lecz jego ważność nadal może skończyć się po rundzie.

Po nieterminalnej rundzie żywym kandydatom z miejscem ustaw `waitAge = 0`, także po anulowaniu ich ataku. Żywym kandydatom bez miejsca zwiększ wiek o 1. Pozostałym żywym wrogom ustaw 0. Martwych pomiń.

To rotacja dostępu do ataku, nie kolejność samego wykonania ciosów. Ciosy nadal sortuje rozdział 6. Zwolnione miejsce po zabiciu lub związaniu strzelca **nie jest uzupełniane w tej rundzie**. UI pokazuje Czekanie jako odrębny jawny zamiar, nie ukryty trzeci atak.

### 9.2. Znaczenie przewagi liczebnej

Trzeci i kolejny wróg:

- Mają własne HP i muszą zostać pokonani.
- Mogą wejść w Zwarcie zwykłym Podejściem, jeśli taki zamiar wynikał z planu.
- Mogą przejąć miejsce ataku w następnej rundzie przez wiek oczekiwania.
- Mogą w danej rundzie bronić się lub przygotować zamiast ubiegać się o miejsce.

Nie ma dodatkowej, ukrytej premii „za otoczenie”, presji, mnożnika obrażeń ani zwiększania limitu przy towarzyszu. To utrzymuje MVP małe. Pięciu wrogów nadal oznacza dłuższą walkę i więcej zmian celów; nie pięć równoczesnych ciosów w bohatera.

Limit dotyczy wszystkich ataków wrogów na bohatera i towarzysza łącznie. Atak bohatera, atak towarzysza i ich riposty nie zajmują tych miejsc. Nie ma wrogich ripost w zestawie bazowym, więc górny limit dwóch prób pierwotnych nie ukrywa dodatkowych reakcji.

## 10. Automatyczny towarzysz

### 10.1. Zasady wspólne

MVP pozwala włączyć **jednego** towarzysza albo grać bez niego. Większa liczba to rozszerzenie. Towarzysz wykonuje jedną akcję i wybiera jedną postawę na rundę. Nie otrzymuje darmowego ruchu. Jego plan jest widoczny przed decyzją gracza i nie jest po niej zmieniany.

| Parametr | Strażnik drużyny | Łucznik drużyny |
|---|---:|---:|
| HP | 24 | 18 |
| Wytrzymałość | 8/8 | 8/8 |
| Umiejętność / obrona | 4 / 4 | 4 / 4 |
| Pancerz / moc | 1 / 0 | 0 / 0 |
| Początkowa grupa | Taka jak bohatera | Taka jak bohatera |
| Zestaw | Atak, Osłona, Obrona, Przygotowanie, Podejście, Odskok | Strzał 5, Atak, Przygotowanie, Podejście, Odskok |

Atak wręcz towarzysza ma bazowe 8 jak u bohatera. Obydwaj odzyskują 2 wytrzymałości po nieterminalnej rundzie i dodatkowe 3 po Przygotowaniu. Nie mają własnych odnowień poza uniwersalną semantyką CD 0 dostępnych działań. Nie mogą używać innych kart.

Towarzysz przy HP = 0 zostaje wyłączony do końca potyczki. Nie wybiera planu, nie daje premii i nie otrzymuje obrażeń. Bohater może dalej wygrać. Nie ma leczenia ani wskrzeszenia w walce. Nowa potyczka testowa zaczyna się od pełnego stanu wszystkich uczestników.

### 10.2. AI Strażnika drużyny — pierwsza pasująca reguła

1. Jeśli ma mniej niż 2 wytrzymałości: Przygotowanie w Defensywnej.
2. Jeśli bohater jest Blisko i co najmniej jeden wrogi zamiar z przydzielonym miejscem ataku wskazuje bohatera: Osłona bohatera w Defensywnej.
3. Jeśli jest związany: Atak w Zrównoważonej na swojego związanego wroga o najmniejszym HP, remis po ID.
4. Jeśli bohater jest Daleko: Podejście `JOIN` do bohatera w Defensywnej.
5. W przeciwnym razie: Obrona w Defensywnej.

Strażnik nie przechwytuje zamiaru dopiero przekierowanego przez cudzą Osłonę i nie przewiduje wyboru bohatera. Warunek 2 sprawdza surowy, zamrożony cel zapowiedzi. Częste używanie Osłony jest świadomym kosztem utraty jego ofensywy.

### 10.3. AI Łucznika drużyny — pierwsza pasująca reguła

1. Jeśli jest związany i ma co najmniej 1 wytrzymałości: Odskok w Defensywnej.
2. Jeśli jest związany i ma 0 wytrzymałości: Przygotowanie w Defensywnej.
3. Jeśli jest wolny: Strzał w Zrównoważonej w żywego wroga o najmniejszym HP, remis po ID.

Przy wyborze celu nie prognozuje akcji bohatera. Jeśli bohater zabije wybrany cel wcześniej, Strzał towarzysza przepada. Wszyscy wrogowie są w zasięgu wolnego łucznika. Towarzysz nie zajmuje miejsca w budżecie wrogów.

## 11. Przykłady obliczeniowe

Wszystkie przykłady stosują dokładnie podane reguły. Postawy oznaczono A/Z/D. O ile nie wskazano inaczej, bohater ma statystyki początkowe, a przeciwnicy moc 0. „Koniec” w tabelach oznacza stan po regeneracji, poza rundą kończącą walkę.

### 11.1. Pełny pojedynek: bohater kontra Osiłek

Start: bohater 40 HP, 10 wytrzymałości; Osiłek 26 HP, pancerz 1, cykl od pierwszego wpisu. Obaj w `g0`, istnieje związanie `[h01, e01]`.

| Runda | Jawny zamiar Osiłka | Wybór bohatera | Obliczenia i wynik | Stan końcowy |
|---:|---|---|---|---|
| 1 | Potężne uderzenie A, bazowe 12 | Kontratak D, koszt 3 | Osiłek: atak `4+2−1=5` przeciw obronie bohatera `4+2=6`: **chybia**. Próba zużywa Kontrę i wyzwala ripostę. Osiłek ma obronę `max(0,4−2−2)=0`. Riposta: `4−2+2=4 ≥ 0`, obrażenia `7−1=6` | Bohater 40 HP, wytrz. `10−3+2=9`; Osiłek 20 HP; Kontra dostępna od r. 3 |
| 2 | Przygotowanie D | Zwód Z, koszt 2 | Zwód ignoruje bonus D do obrony: `4+2=6 ≥ 4`. Baza przeciw D = 9, po pancerzu `9−1=8`. Osiłek ustanawia Przygotowanie na r. 3 | Bohater 40 HP, wytrz. `9−2+2=9`; Osiłek 12 HP |
| 3 | Atak Z z Przygotowaniem | Potężne uderzenie A, koszt 4 | Zwykły cios Osiłka ma priorytet 20, więc poprzedza Potężne 10. Atak `4+2=6` przeciw obronie odsłoniętego bohatera `4−2−2=0`; surowe `8+3=11`, po pancerzu 10. Bohater następnie trafia: `4+2−1=5 ≥ 4`; zadaje `13−1=12` | Bohater 30 HP, wytrz. 5; Osiłek 0 HP; **WIN**, bez końcowej regeneracji |

Pierwsza riposta jest legalna mimo chybienia Osiłka. Przygotowanie r. 2 daje bonus do ataku r. 3, ale nie chroni przed Zwodem w rundzie, w której jest ustanawiane. Bohater w r. 3 wybiera zakończenie walki za cenę utraty 10 HP. Samo Potężne nie pozwala wyprzedzić zwykłego Ataku.

### 11.2. Kontratak przeciw dwóm trafiającym ciosom

Ten przykład jest osobnym stanem testowym: bohater w D, bez Przygotowania, ma Kontrę. Dwaj związani napastnicy wykonują Atak A o bazowych 7; każdy ma `skill=4`, `defense=4`, pancerz 0. Obaj mają już miejsca ataku.

1. Pierwszy: skuteczność `4+2=6`, obrona bohatera `4+2=6`: trafia. Parowanie i pancerz: `max(0,7−6−1)=0` HP. Riposta trafia jego obronę `4−2=2`, ponieważ `4−2+2=4`; zadaje 7.
2. Drugi: też trafia `6 ≥ 6`, ale znacznik Kontry jest zużyty. Bohater traci `7−1=6` HP i nie ripostuje ponownie.

Wynik od pełnego zdrowia: bohater 34 HP, pierwszy napastnik −7 HP, drugi bez obrażeń. W walce grupowej Kontratak nie jest pełną obroną przed całą rundą.

### 11.3. Trzech Bandytów i rotacja miejsc ataku

Start: trzej Bandyci `e01`, `e02`, `e03` mają po 14 HP, `phaseOffset=0`, są związani z bohaterem w jednej grupie; wiek każdego = 0.

**Runda 1:** wszyscy chcą Ataku A o bazowych 7. Remisy dają miejsca `e01` i `e02`; `e03` czeka, ma ochronę 3 i zachowuje A. Bohater wybiera Kontratak D. Rozliczenie jak w 11.2: bohater kończy z 34 HP i 9 wytrzymałości, `e01` ma 7 HP, pozostali 14. Wiek `e03` rośnie do 1; pozostali mają 0.

**Runda 2:** wszyscy chcą Potężnego uderzenia A o bazowych 12. Miejsca otrzymują najpierw `e03` przez wiek 1, potem `e01` przez niższe ID przy remisie; `e02` czeka z ochroną 3, bez Odsłonięcia.

Bohater wybiera Atak A na `e01`. Jego priorytet 20 poprzedza oba Potężne 10. Trafia `4+2=6` przeciw odsłoniętej obronie `max(0,4−2−2)=0` i zadaje 8: `e01` ginie. Nie przydzielamy zwolnionego miejsca `e02`.

Pozostaje cios `e03`: atak `4+2−1=5` trafia bohatera z obroną `4−2=2`; obrażenia `12−1=11`. Bohater kończy z **23 HP i 10 wytrzymałości**; żyją `e02` i `e03`. Nadal istnieją dwa ich związania z bohaterem. `e02` ma wiek 1, `e03` ma 0. Selekcja miejsc i kolejność ciosów to dwie różne procedury.

### 11.4. Daleko → Blisko → Zwarcie i przerwanie Strzału

Start: bohater w `g0`; samotny Łucznik w `g1`; brak związań. Ich odległość to Daleko. Łucznik zaczyna cykl od `R(Z)`.

- **Runda 1:** bohater wybiera Podejście D, wariant `JOIN` do Łucznika. Przechodzi do `g1`, więc obaj są Blisko. Nie ma ataku bohatera ani związania. Strzał Łucznika pozostaje legalny, lecz `4 < 4+2`: chybia.
- **Runda 2:** Łucznik zapowiada drugi Strzał Z. Bohater wybiera Szarżę A za 3. Ruch tworzy `[h01,e01]` przed fazą ciosów. Bohater trafia `4+2=6 ≥ 4`, zadaje 6, Łucznik ma 6 HP. Zapowiedziany Strzał przepada, ponieważ strzelec jest związany. Nie zamienia się w Atak wręcz. Bohater kończy rundę z 9 wytrzymałości.
- **Runda 3:** związany Łucznik zastępuje wpis Przygotowania Atakiem Z o bazowych 4. Bohater wybiera Atak A; remis priorytetu 20 rozstrzyga się na korzyść bohatera. Trafienie `6 ≥ 4` zadaje 8 i eliminuje Łucznika przed jego ciosem. Wynik: WIN, bohater 40 HP, wytrzymałość 9, bez regeneracji rundy terminalnej.

Szarża była dostępna dopiero po skróceniu Daleko do Blisko. Sam fakt wejścia do grupy nie związał Łucznika. Przykład zakłada otwartą przestrzeń i brak innych wrogów.

### 11.5. Osłona i zużywanie jednej puli ochrony

Osobny stan: bohater 40 HP, towarzysz 18 HP z pancerzem 0, obaj Blisko. Bohater deklaruje Osłonę Z na towarzysza i dostaje ochronę 6. Dwaj wolni Łucznicy Z mają legalne, zamrożone Strzały o bazowych 6 na towarzysza. Towarzysz używa Przygotowania Z i pozostaje w tej samej grupie.

1. Pierwszy Strzał zostaje przejęty. Przeciw obronie bohatera: `4 ≥ 4`, trafienie. Po pancerzu `6−1=5`; ochrona pochłania 5. Bohater nie traci HP, pozostaje mu ochrona 1. Znacznik przekierowania jest zużyty.
2. Drugi Strzał idzie w towarzysza. Trafia `4 ≥ 4`, zadaje 6 po pancerzu 0. Towarzysz ma 12 HP. Pozostała ochrona bohatera nie chroni automatycznie podopiecznego.

Zmiana postawy bohatera na D spowodowałaby chybienie pierwszego strzału (`4 < 6`), ale także zużyłaby przekierowanie. Gdyby pierwszym atakiem był Zwód przeciw osłaniającemu w D, sprawdzano by bazę 9, pominięto bonus D do obrony oraz ochronę, lecz zastosowano pancerz.

## 12. Model danych i zapis

Poniższy JSON przedstawia kompletny stan **przed planowaniem rundy 1** pojedynku z 11.1. Statystyki profili i kart są w wersjonowanej tabeli reguł; instancja przechowuje stan zmienny. Dla bohatera `profileId=hero` odwołuje się do rozdziału 2, dla Osiłka do rozdziału 8.

```json
{
  "rulesVersion": "warmaster-stance-cards-1.0",
  "stateVersion": 0,
  "round": 1,
  "phase": "PLAN",
  "result": null,
  "nextGroupSerial": 1,
  "actors": [
    {
      "id": "h01",
      "team": "heroes",
      "role": "hero",
      "profileId": "hero",
      "hp": 40,
      "stamina": 10,
      "stance": "balanced",
      "groupId": "g0",
      "readyRound": null,
      "availableRound": {
        "heavy": 1, "counter": 1, "feint": 1,
        "cover": 1, "charge": 1, "prepare": 1
      }
    },
    {
      "id": "e01",
      "team": "enemies",
      "role": "enemy",
      "profileId": "brute",
      "hp": 26,
      "stamina": null,
      "stance": "balanced",
      "groupId": "g0",
      "readyRound": null,
      "availableRound": {},
      "phaseOffset": 0,
      "waitAge": 0
    }
  ],
  "engagements": [["e01", "h01"]],
  "frozenEnemyPlans": [],
  "frozenCompanionPlan": null,
  "log": []
}
```

Pary związania zapisuj jako posortowane ID, bez duplikatów. `groupId` to etykieta, nie współrzędna. `nextGroupSerial` musi być większy od każdego użytego numeru grupy: scenariusz z `g0` i `g1` zaczyna z licznikiem 2. Profil i `rulesVersion` definiują maksima oraz statystyki bazowe; ładowanie przy niezgodnej wersji zasad wymaga migracji albo odrzucenia, nie cichego użycia innych liczb. Brak wpisu `availableRound` dla pomocniczej akcji z CD 0 oznacza dostępność od rundy 1.

Przy tworzeniu i wczytywaniu stanu sprawdź unikalność ID, istnienie profili, zakresy HP i zasobów oraz poprawność związań: dwaj różni żywi przeciwnicy w tej samej grupie. Odwrotne i powtórzone pary należy sprowadzić do jednej pary kanonicznej przed rozpoczęciem gry. Odrzuć odwołania do nieistniejących postaci, związania między drużynowymi sojusznikami, brak bohatera, więcej niż jednego towarzysza oraz stan aktywnej walki bez żywego bohatera lub wrogów. Stan końcowy zachowuje wynik i może zawierać wyeliminowane postacie. Przy imporcie `CHOOSE` zweryfikuj także zamrożone plany; nie przeliczaj ich na inne cele.

Komenda gracza:

```json
{
  "expectedStateVersion": 1,
  "round": 1,
  "stance": "defensive",
  "actionId": "counter",
  "targetId": "h01"
}
```

`stateVersion` zwiększa się po zakończonym planowaniu oraz po zaakceptowanej komendzie; próba walidacji i zmiana zaznaczenia UI go nie zwiększają. W przykładzie stan `PLAN` z wersją 0 staje się `CHOOSE` z wersją 1. Duplikat komendy po zatwierdzeniu zostaje odrzucony przez fazę lub wersję, bez ponownej opłaty.

Zamrożony plan zawiera co najmniej `actorId`, `stance`, `actionId`, `targetId`, `moveVariant`, `wasCandidate`, `attackSlot`, `baseDamage`, `priority`. Dla czekającego wroga `actionId=wait`, `wasCandidate=true`, `attackSlot=false`. Pole `wasCandidate` zachowuje informację sprzed zamiany na Czekanie. Dla akcji na siebie `targetId` to własne ID; dla Odwrotu `null`. Nie wyznaczaj ponownie celu w czasie wykonywania planu.

Efekty rundy (`guard`, `exposed`, `counterToken`, `coverWard`, `chargeMoveSucceeded`, `preparedAccuracy`, `preparedDamage`) można trzymać w roboczym stanie rozstrzygania. MVP zapisuje do przeglądarki tylko stabilne fazy `CHOOSE` i `FINISHED`. Nie zapisuje połowy animowanej rundy. `CHOOSE` musi zawierać pełne plany i odpowiedni numer wersji.

Dziennik zdarzeń obejmuje źródło, cel pierwotny, odbiorcę, wynik zasięgu, skuteczność, obronę, trafienie, surowe obrażenia, parowanie, pancerz, pochłonięcie, utratę HP i powód anulowania. Do odtwarzania zachowaj stan początkowy, wersję reguł i listę zaakceptowanych komend; nie potrzeba ziarna losowości.

## 13. Pseudokod silnika

Pseudokod jest normatywny dla kolejności. Funkcje pomocnicze odwołują się do reguł poprzednich rozdziałów; wszystkie operują na kopii stanu, a dopiero pełne zaakceptowane rozstrzygnięcie zastępuje stan interfejsu.

### 13.1. Planowanie AI i miejsc

```text
function planRound(state):
    assert state.phase == PLAN and state.result == null
    clearRoundEffects(state)
    plans = []
    for enemy in livingEnemies(state) sorted by id:
        entry = enemy.cycle[(state.round - 1 + enemy.phaseOffset) % len(enemy.cycle)]
        if enemy.profile == archer and isEngaged(enemy):
            plan = strikeBalancedAtLowestHpEngagedOpponent(enemy)
        else if entry.action in [strike, heavy]:
            target = lowestHpEngagedOpponent(enemy) or hero(state)
            if engaged(enemy, target):
                plan = entryWithTarget(entry, target)
            else if range(enemy, target) == DALEKO:
                plan = approach(entry.stance, target, JOIN)
            else if entry.stance == aggressive:
                plan = charge(aggressive, target, baseDamage=6)
            else:
                plan = approach(balanced, target, ENGAGE)
        else if entry.action == shot:
            plan = shot(entry.stance, hero(state), enemy.profile.shotDamage)
        else:
            plan = selfAction(entry)
        plan.wasCandidate = isPrimaryAttack(plan)
        plans.append(plan)

    candidates = plans where wasCandidate
    sort candidates by (-actor.waitAge, -plan.baseDamage, actor.id)
    for index, plan in enumerate(candidates):
        plan.attackSlot = index < 2
        if not plan.attackSlot:
            replaceActionWithWait(plan)   # zachowaj postawę i wasCandidate

    state.frozenEnemyPlans = plans
    state.frozenCompanionPlan = chooseCompanionPlan(state, plans)
    state.phase = CHOOSE
    state.stateVersion += 1
    return state
```

Plan nie rozlicza Przygotowania, nie pobiera kosztu i nie nakłada jeszcze Odsłonięcia. Te operacje należą do deklaracji faktycznie zachowanego działania.

### 13.2. Rozstrzygnięcie rundy

```text
function submitRound(inputState, command):
    error = validateCommandAndFrozenPlans(inputState, command)
    if error: return Rejected(error, unchanged=inputState)

    s = deepCopy(inputState)
    s.phase = RESOLVE
    s.stateVersion += 1
    plans = [heroPlan(command)] + optionalCompanionPlan(s) + enemyPlans(s)

    for plan in plans:
        actor = getActor(plan.actorId)
        payCostAndSetAvailableRound(actor, plan, s.round)
        actor.stance = plan.stance
        if isOffensiveAction(plan) and actor.readyRound == s.round:
            plan.preparedAccuracy = 2
            plan.preparedDamage = 3
            actor.readyRound = null
        else:
            plan.preparedAccuracy = 0
            plan.preparedDamage = 0

    for plan in plans:
        if plan.actionId == heavy: actor(plan).exposed = true
        if plan.actionId in [brace, cover]: actor(plan).guard = 6
        if plan.actionId == wait: actor(plan).guard = 3
        if plan.actionId == counter: actor(plan).counterToken = true
        if plan.actionId == cover: actor(plan).coverWard = plan.targetId
        if plan.actionId == prepare: actor(plan).readyRound = s.round + 1

    for plan in plans sorted by (roleOrder(actor), actor.id):
        executeMovementPartIfAny(s, plan)

    attacks = plans where isPrimaryAttack(plan)
    sort attacks by (-plan.priority, roleOrder(actor), actor.id)
    for attack in attacks:
        if s.result != null: break
        resolvePrimaryAttack(s, attack)

    if s.result != null:
        s.phase = FINISHED
        return Accepted(s)

    for living actor in [hero, optionalCompanion]:
        gain = 2 + (3 if actor.plan.actionId == prepare else 0)
        actor.stamina = min(actor.maxStamina, actor.stamina + gain)

    for living enemy:
        p = itsFrozenPlan
        if p.wasCandidate and not p.attackSlot: enemy.waitAge += 1
        else: enemy.waitAge = 0

    expireReadyBonusesWithRoundAtMost(s.round)
    clearRoundEffects(s)
    if s.round == 30:
        s.result = DRAW_LIMIT
        s.phase = FINISHED
    else:
        s.round += 1
        s.phase = PLAN
    return Accepted(s)
```

`isOffensiveAction` obejmuje ataki pierwotne oraz Kontratak; `isPrimaryAttack` nie obejmuje Kontrataku. Funkcja opłaty pomija wrogów; dla pozostałych CD akcji bez odnowienia można pominąć w zapisie. `clearRoundEffects` nie usuwa `readyRound`, związań ani odnowień.

### 13.3. Atak i reakcje

```text
function resolvePrimaryAttack(s, p):
    a = actor(p)
    original = actor(p.targetId)
    if not alive(a) or not alive(original):
        logCancel("actor_or_target_dead"); return
    if not attackRangeStillLegal(s, p):
        logCancel("range_or_charge_invalid"); return

    t = original
    protector = lowestIdEligibleProtectorOf(original)
    if protector exists:
        t = protector
        consumeCoverRedirect(protector)  # brak ponownego przekierowania

    triggeredCounter = (
        isDirectAttack(p)
        and t.counterToken
        and engaged(a, t)
    )
    if triggeredCounter: t.counterToken = false

    # test oraz bazę Zwodu licz wobec t, nie original
    hit = computeAttackScore(a, p) >= computeDefenseScore(t, p)
    if hit:
        parry = 6 if triggeredCounter else 0
        applyDamageAndCheckTerminal(s, a, t, p, parry)
    else:
        logMiss(a, original, t, p)

    if s.result != null: return
    if triggeredCounter and alive(a) and alive(t) and engaged(a, t):
        riposte = makeRiposte(from=t, to=a,
                              accuracy=2, baseDamage=7,
                              bonuses=t.counterPlan.preparedBonuses)
        # Bez Osłony i Kontrataku; normalny test trafienia, pancerz i guard.
        resolveAttackWithoutReactions(s, riposte)
```

`attackRangeStillLegal` wymaga dla Szarży również udanego jej ruchu. `applyDamageAndCheckTerminal` natychmiast usuwa związania postaci o HP 0 i sprawdza wynik z rozdziału 6. Plan Ataku może być w kolejce mimo śmierci autora; zostanie pominięty przez powyższy warunek. To samo dotyczy strzału w już wyeliminowany cel.

### 13.4. Ruch

```text
function executeMovementPartIfAny(s, p):
    a = actor(p)
    if not alive(a): return
    if p.actionId == disengage:
        removeAllEngagementsOf(a)
        return
    if p.actionId == withdraw:
        if isFree(a):
            a.groupId = "g" + s.nextGroupSerial
            s.nextGroupSerial += 1
        return
    if p.actionId not in [approach, charge]: return
    t = actor(p.targetId)
    if not alive(t) or not isFree(a): return
    if p.actionId == approach and p.moveVariant == JOIN:
        a.groupId = t.groupId
    else if range(a, t) == BLISKO and a.team != t.team:
        addEngagement(a, t)
        if p.actionId == charge: p.chargeMoveSucceeded = true
```

Odskok późniejszego aktora może usunąć związanie utworzone wcześniejszą Szarżą; wtedy jej późniejszy cios przepada. Dwa plany Szarży skierowane na siebie nie dają dwóch ciosów automatycznie: wcześniejszy ruch tworzy związanie, przez co późniejszy szarżujący nie jest już wolny i nie wykona własnego ruchu. Reguła kolejności ruchów rozstrzyga ten przypadek jawnie.

## 14. Interfejs przeglądarkowy

### 14.1. Układ ekranu

1. **Stan bohatera:** HP, wytrzymałość, bieżąca/wybierana postawa, aktywne Przygotowanie i lista „Związany z: …”.
2. **Karty przeciwników:** nazwa, HP, pancerz, postawa, dokładny zamiar, cel, priorytet, dystans od wybranej postaci i oznaczenie miejsca ataku lub Czekania.
3. **Towarzysz:** HP, wytrzymałość, zamrożony plan i jego cel. Możliwość obejrzenia relacji odległości z jego perspektywy.
4. **Panel decyzji:** trzy postawy, sześć kart, Atak, Obrona i dostępne ruchy. Po wyborze karty wyróżnij legalne cele.
5. **Podgląd rundy:** prognozowane końcowe HP, wytrzymałość, anulowane zamiary i związania po pełnym rozstrzygnięciu wybranego wariantu.
6. **Dziennik:** kolejne zdarzenia z możliwością rozwinięcia liczb; przycisk „Rozegraj rundę” i „Poddaj walkę”.

Karty wrogów można sortować, ale nie przeciągać jako ruchu. Układ graficzny nie ma znaczenia mechanicznego. Oprócz dystansu względem bohatera dostępny jest mały panel relacji po wskazaniu uczestnika; sama lista „Blisko bohatera” nie wystarcza do wyjaśnienia zasięgu towarzysza.

Przykład tekstu karty: „Potężne uderzenie · koszt 4 · trafienie 5 przeciw obronie 4 · 12 obrażeń po pancerzu · działasz po Ataku wroga · twoja obrona w tej rundzie: 0”. Dla Kontry przeciw grupie: „Sparujesz pierwszy legalny cios: e01. Drugi cios nie będzie sparowany”.

### 14.2. Podgląd musi korzystać z silnika

Prognozę licz na kopii stanu przez tę samą funkcję co zatwierdzenie. Nie wystarczy zsumowanie oczekiwanych obrażeń: wcześniejsza eliminacja, Szarża, Odskok, Osłona i riposta zmieniają dalszą kolejkę. Podgląd nie mutuje bieżącego stanu ani planu AI i nie zapisuje logu do prawdziwej walki.

Zmiana zaznaczonej postawy aktualizuje dostępność kart i prognozę. Nielegalna kombinacja nie może zostać zatwierdzona. Powód wyłączenia jest tekstowy: „Brak 1 wytrzymałości”, „Dostępne od rundy 4”, „Cel jest Daleko”, „Najpierw wykonaj Odskok”, „Wymaga sojusznika Blisko”.

UI powinien pokazywać regenerację jako efekt końca rundy, z dopiskiem, że nie wystąpi po jej wcześniejszym zakończeniu. Wyboru nie wolno opłacać podczas klikania podglądu. Przycisk zatwierdzenia blokuje się na czas rozstrzygania. Animacje tylko odtwarzają gotowy dziennik; ich szybkość i pominięcie nie wpływają na wynik.

### 14.3. Dostępność i obsługa

- Wszystkie akcje, cele i potwierdzenie dostępne klawiaturą; widoczny fokus i czytelne etykiety.
- Dystanse, postawy i zagrożenia oznaczone tekstem oraz ikoną, nie samym kolorem.
- Możliwość natychmiastowego pominięcia animacji i odczytu pełnego dziennika.
- Na wąskim ekranie zamiary wrogów pozostają widoczne nad wyborem karty.
- Lokalny zapis po planowaniu każdej rundy, eksport/import JSON i restart scenariusza.
- Liczby bazowe, premie i redukcje dostępne na rozwinięciu, bez konieczności czytania pseudokodu.

## 15. Balans i plan weryfikacji

### 15.1. Dlaczego takie wartości

Bohater z bazowym Atakiem 8 eliminuje Bandytę bez pancerza w dwóch trafieniach. Potężne 13 nie eliminuje Bandyty mającego pełne 14 HP, ale po wcześniejszym zranieniu może zaoszczędzić rundę. Osiłek z pancerzem 1 przyjmuje 7 ze zwykłego Ataku i 12 z Potężnego.

Kontratak za 3 przy regeneracji 2 kosztuje netto 1 zasobu w nieterminalnej rundzie, ale CD 1 uniemożliwia nieprzerwane kontrujące bronienie się. Potężne kosztuje netto 2 i daje Odsłonięcie. Zwód kosztuje netto 0, lecz zadaje tylko 6 przeciw postawom bez Defensywnej; darmowy Atak ma wtedy większe obrażenia. Szarża płaci za ruch z atakiem i wymusza ryzyko Agresywnej. Przygotowanie daje 5 regeneracji za całą rundę bez bezpośredniej ochrony.

Istotna własność progów: zwykły Atak bohatera w D ma skuteczność 2 i często chybia obronę 4. Postawa D nie powinna być zawsze dobrym wyborem ofensywnym. Przygotowanie podnosi ją do 4 na jedną ofensywną akcję. Zwód może trafić cel w D, ponieważ pomija jego premię obronną.

Te argumenty uzasadniają startowe relacje liczb, ale nie zastępują rozgrywek ani symulacji. Przykłady z rozdziału 11 są wyliczeniami referencyjnymi; nie stanowią pomiaru balansu populacji graczy.

### 15.2. Scenariusze dołączane do prototypu

W każdej walce bohater zaczyna z pełnym zdrowiem i wytrzymałością; towarzysz również. Wszyscy wrogowie mają pełne HP, `waitAge=0`. Jeśli tabela nie stanowi inaczej, `phaseOffset=0`, wszyscy są w `g0`, a wskazane związania istnieją już przed rundą 1. Scenariusz jest niezależnym testem, nie kolejną walką kampanii.

| ID | Skład i pozycja | Towarzysz | Co sprawdzamy |
|---|---|---|---|
| T1 | Jeden Osiłek `e01`, związany z bohaterem | Brak | Odtworzenie pełnego pojedynku 11.1 |
| T2 | Jeden Strażnik `e01`, związany z bohaterem | Brak | Czy Zwód i Przygotowanie przełamują cykl obronny |
| T3 | Trzej Bandyci `e01–e03`, wszyscy związani z bohaterem | Brak | Rotacja miejsc, Kontra na jeden cios, wybór eliminacji |
| T4 | Bandyta `e01` związany z bohaterem; Łucznik `e02` w `g1` | Brak | Koszt uwolnienia i dojścia do strzelca |
| T5 | Samotny Łucznik `e01` w `g1`, bohater w `g0`, brak związań | Brak | Referencja 11.4 i skuteczność Szarży |
| T6 | Dwaj Bandyci `e01–e02` związani z bohaterem; Łucznik `e03` w `g1` | Strażnik drużyny w `g0` | Osłona kontra ofensywa; budżet ataków drużyny |
| T7 | Dwaj Bandyci `e01–e02` związani z bohaterem; Strażnik `e03` w `g0`; dwaj Łucznicy `e04–e05` w `g1` | Łucznik drużyny w `g0` | Obciążenie informacją, pięciu wrogów, długi ogon walki |

Poza testem referencyjnym powtórz scenariusze z przesunięciami faz wrogów równymi `0,1,2,…` według ich ID, modulo długości ich cyklu. To kontrolowana zmiana, a nie próba uzyskania losowego wyniku z tej samej komendy.

T1 i T5 mają podane legalne zwycięskie sekwencje. T2–T7 są scenariuszami diagnostycznymi o niepotwierdzonej trudności; nie zakładaj, że każdy musi być łatwy lub wygrywalny dowolną strategią. Przed udostępnieniem jako kampanii sprawdź istnienie zwycięskiej ścieżki dla zadanych warunków.

### 15.3. Minimalne testy akceptacyjne silnika

Poniższe testy odnoszą się do zachowania publicznego silnika. Testy inicjowane od nietypowego stanu muszą jawnie ustawić pozycje, postawy, zamiary i premie; nie należy domyślać się ich z poprzedniego testu.

| Test | Oczekiwany wynik |
|---|---|
| Identyczny stan i komenda | Identyczny wynik i dziennik niezależnie od czasu oraz animacji |
| Cały pojedynek 11.1 | WIN w r. 3; bohater 30 HP, 5 wytrzymałości |
| Sekwencja 11.4 | WIN w r. 3; bohater 40 HP, 9 wytrzymałości |
| Remis trafienia | Atak 6 przeciw obronie 6 trafia |
| Pancerz wyższy niż siła | Utrata 0 HP, ochrona nie maleje |
| Zwód przeciw D z ochroną 6 i pancerzem 1 | Z bazą 9 zadaje 8 HP, przy legalnym trafieniu; ochrona nadal 6 |
| Dwa trafienia Ataku 7 przeciw Kontrze D | Jak 11.2: utrata łącznie 6 HP; jedna riposta |
| Chybiony atak bezpośredni na Kontrę | Znacznik zużyty; jedna riposta, jeśli obie postacie żyją i są związane |
| Strzał lub Zwód na Kontrę | Nie zużywa znacznika Kontry i nie wywołuje riposty |
| Atak anulowany przez Odskok | Nie wywołuje Kontry ani Osłony, bo nie jest legalną próbą |
| Osłona dwóch Strzałów | Referencja 11.5: bohater 40 HP, towarzysz 12 HP |
| Wzajemna Osłona | Najwyżej jedno przekierowanie danego ataku |
| Dwie strony Szarżują na siebie | Wcześniejszy ruch tworzy związanie; późniejsza Szarża nie otrzymuje darmowego ciosu |
| Odskok z trzech związań | Wszystkie trzy krawędzie usunięte; grupa bez zmiany |
| Podejście `JOIN` do grupy trzech postaci | Aktor Blisko wszystkich trzech, bez automatycznych związań |
| Zgon jednego z trzech związanych wrogów | Znikają tylko krawędzie tego wroga |
| Szarża na wolnego Łucznika ze Strzałem | Związanie przed ciosami; zapowiedziany Strzał anulowany |
| Trzech kandydatów i zabicie jednego aktywnego | Brak uzupełnienia miejsca w tej rundzie; maksimum dwa zamiary |
| Przygotowanie i następna Kontra bez wyzwolenia | Bonus zużyty przy deklaracji i nie przechodzi dalej |
| Przygotowanie dwa razy z rzędu | Tylko jeden bonus na kolejną rundę, bez kumulacji |
| Kontra użyta w r. 1 | Nielegalna w r. 2, legalna od r. 3 |
| Nielegalny cel, postawa, koszt lub stara wersja | Cały stan pozostaje bez zmian, bez pobrania wytrzymałości |
| Śmierć towarzysza | Jego związania usunięte; walka trwa z bohaterem |
| Śmierć celu przed ciosem towarzysza | Brak automatycznego wyboru innego celu |
| Runda terminalna | Żadnych kolejnych ataków i regeneracji po wyniku |
| Brak zakończenia po 30 pełnych rundach | DRAW_LIMIT, nigdy WIN |

### 15.4. Pomiary rozgrywek

Zapisuj długość walki, wynik, HP końcowe, zużycie zasobów, liczbę zmian postawy, częstości kart, anulowane ataki, niewykorzystane Kontry, ochronę zużytą i zmarnowaną, czas decyzji oraz powód każdej eliminacji. W raportach oddziel scenariusze, towarzyszy i przesunięcia faz. Powtarzanie identycznej deterministycznej sekwencji nie jest nową próbką trudności.

Pierwsza seria: minimum 20 rozegranych walk z kilkoma strategiami i co najmniej trzema osobami, jeśli są dostępne. Porównaj grę nastawioną na szybkie zwycięstwo, zachowanie HP i korzystanie z podglądu. Dodatkowo automatycznie porównaj proste polityki: tylko Atak A, Atak Z, Zwód gdy cel ma D, Kontra gdy jest dostępna i wyzwalana, wybór ruchu minimalizującego utratę HP w bieżącej rundzie. Każda polityka musi mieć legalny plan awaryjny: Podejście, Odskok lub Obrona.

Cele diagnostyczne, a nie obiecane wyniki: zwykły pojedynek około 3–7 rund, potyczka grupowa około 5–12, mniej niż 10% walk kończących się limitem i brak jednej płatnej karty dominującej we wszystkich scenariuszach. Wartość ponad 60% użyć jednej karty specjalnej w różnych scenariuszach jest sygnałem do analizy, nie automatycznym dowodem błędu. Czas decyzji oceniaj po krótkiej nauce zasad, osobno od pierwszego kontaktu.

Gdy pojawi się problem, zmieniaj jedną zmienną naraz: najpierw HP i siłę konkretnych profili, potem koszt lub CD problematycznej karty. Próg trafienia jest szczególnie czuły: zmiana o 1 może przełączyć całą kategorię ciosów z trafień w chybienia. Nie podnoś jednocześnie obrony, pancerza i ochrony, bo utrudni to ustalenie przyczyny. Zmiany zasad wymagają nowego `rulesVersion` i ponownego przeliczenia przykładów referencyjnych.

## 16. Rozszerzenia opcjonalne — poza MVP

Poniższe pomysły nie są aktywnymi regułami i nie wolno dopisywać ich milcząco do prototypu bazowego.

| Rozszerzenie | Pytanie projektowe | Co wymaga osobnej specyfikacji |
|---|---|---|
| Niepełne zamiary | Czy przewidywanie przeciwnika daje więcej emocji? | Jakie informacje są ukryte, kiedy losowane i jak zapisywane; podgląd nie może zdradzać planu |
| Talie i ręka | Czy ograniczona dostępność kart zwiększa różnorodność? | Dobieranie, odrzucanie, rozmiar ręki, deterministyczny zapis losowania |
| Więcej towarzyszy | Czy współpraca przeważa nad nadmiarem informacji? | Limit działań drużyny, reguły celów, Osłony i zmiana budżetu wrogów |
| Automatyczne przechwycenie | Czy Strażnik powinien zatrzymywać Szarżę? | Warunki wolności, koszt reakcji, priorytet wobec Osłony i związania |
| Różne bronie i strzał bohatera | Czy zasięgi zmieniają styl gry? | Wartości ataków, koszty, legalność w Zwarciu, relacja do istniejących kart |
| Wrogie Zwody i Kontry | Czy pojedynek wymaga bogatszych odpowiedzi? | Budżet ripost wrogów i zgodność z limitem dwóch ataków; zakaz nieskończonych reakcji |
| Kontrola i przerwania | Czy gracz ma za mało wpływu na dwa aktywne zagrożenia? | Status, czas trwania, odporność, koszt, reguły bossów |
| Teren i osłony | Czy cele potrzebują dodatkowej ochrony dystansowej? | Jawne właściwości grup, przechodzenie, zasięg widzenia i legalność Strzału |
| Ucieczka ze starcia | Czy można zakończyć walkę kosztem fabularnym? | Warunek, wynik odrębny od zwycięstwa, los towarzysza i koszt kampanii |
| Niewielka losowość | Czy stałe progi są zbyt przewidywalne? | Rozkład testu, ziarno, zapis, prawdopodobieństwa UI i nowe scenariusze referencyjne |

Najpierw należy ocenić wybór postawa–karta–cel oraz czytelność ruchu. Rozszerzenia mogą zmienić to, co próbuje mierzyć MVP; każde powinno mieć osobny przełącznik i wersję zasad.

## 17. Inspiracje i zweryfikowane źródła

Źródła sprawdzono 18 października 2026. Poniższe odnośniki prowadzą do źródeł pierwotnych: oficjalnego SRD, wydawcy albo oficjalnej strony gry. Linki do produktów służą identyfikacji pierwowzoru; nie są bezpłatnym pełnym regulaminem. Do rozegrania niniejszego MVP nie trzeba niczego kupować.

### 17.1. 13th Age — abstrakcyjna pozycja i związanie

Oficjalny [13th Age Archmage Engine — System Reference Document, PDF u Pelgrane Press](https://pelgranepress.com/files/13th_Age/13th_Age_System_Reference_Document.pdf#page=154), sekcja **Combat Rules → Combat Actions → Position**. Najlepiej wyszukać nagłówki `Nearby`, `Far Away`, `Engaged/Next to`, `Disengaging`. „Version 2.0” na okładce tego SRD oznacza wersję dokumentu Archmage Engine, nie deklarację, że są to zasady drugiej edycji 13th Age.

Pierwowzór opisuje ogólną pozycję, bliskość i związanie z konkretnymi przeciwnikami. **Inspiracja tutaj:** brak siatki i pamięć tego, kto walczy z kim. **Autorskie różnice:** ścisłe trzy poziomy zasięgu, grupy bliskości, deterministyczny Odskok, brak ataków okazyjnych i koszt ruchu równy całej akcji. Są to własne uproszczenia silnika przeglądarkowego, a nie streszczenie pełnych zasad SRD.

### 17.2. The One Ring — wybór postawy

Oficjalny [The One Ring — Starter Set, Free League Publishing](https://freeleaguepublishing.com/shop/the-one-ring/starter-set/) identyfikuje grę i zawarte w zestawie karty postaw bojowych. Uzupełniające źródło wydawcy: [The One Ring — oficjalna errata do zasad podstawowych, PDF](https://freeleaguepublishing.com/wp-content/uploads/2021/TOR_Core_Rules_Errata_2204.pdf), zawierająca odniesienia do postaw bojowych, m.in. Rearward. To errata, a nie kompletny opis mechaniki postaw.

**Inspiracja tutaj:** wybór sposobu uczestniczenia w walce oraz powiązanie go z atakiem, obroną i dostępnymi działaniami. **Autorskie różnice:** dokładnie trzy postawy, modyfikatory +2/0/−2, wspólna formuła trafienia i powyższa lista kart. Nie są to przeliczone wartości testów, zadań bojowych ani komplet postaw z podręcznika *The One Ring*. Źródła nie są instrukcją stosowania naszych liczb.

### 17.3. Mouse Guard — wybór działania i jego interakcje

[Mouse Guard — oficjalna strona RPG](https://www.mouseguard.net/rpg/) opisuje grę Luke’a Crane’a i zestaw zawierający karty graczy. Na stronie zamieszczono również podglądy podręcznika. Jest to źródło identyfikujące pierwowzór i formę komponentów, a nie bezpłatny SRD ani pełna instrukcja konfliktów.

**Inspiracja tutaj:** przedstawienie możliwości jako działań, których wartość zależy od odpowiedzi przeciwnika, oraz wygodna forma kart. **Autorskie różnice:** sześć polskich kart, jawny plan AI, wytrzymałość, indywidualne HP, priorytety i wszystkie konkretne interakcje. Nazwy kart w tej specyfikacji nie są listą oficjalnych kart *Mouse Guard*. Nie przenosimy pełnego systemu konfliktów ani jego macierzy testów; sam fakt obecności kart w pierwowzorze nie oznacza zgodności mechanicznej.

### 17.4. Granica między źródłem a projektem

| Element | Zaczerpnięta idea | Własna reguła obowiązująca w tym MVP |
|---|---|---|
| Pozycja | Abstrakcyjny zasięg i związania: 13th Age | `groupId` + graf, konkretne ruchy, brak ataków okazyjnych |
| Postawa | Wybór stylu walki: The One Ring | Trzy postawy, ±2, ograniczenia kart |
| Akcja | Interakcje wyborów i karty: Mouse Guard | Sześć kart, koszty, CD i kolejność efektów |
| Wielu przeciwników | Potrzeba czytelnego starcia solo | Dwa miejsca ataku, wiek oczekiwania i Czekanie |
| Rozstrzygnięcie | Potrzeba powtarzalnego prototypu | Stałe progi, obrażenia, priorytety i pełny podgląd |
| Towarzysze | Potrzeba współpracy bez ręcznego sterowania drużyną | Dwa profile, jawne priorytety AI i pojedyncza Osłona |

Odnośniki dokumentują inspiracje. Wszystkie nieopisane w źródłach szczegóły tej specyfikacji należy rozumieć jako autorski projekt z rozdziałów 1–16, nie jako brakującą zasadę, którą trzeba odszukać w cudzym podręczniku.
