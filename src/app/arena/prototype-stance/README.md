# Prototypy interfejsu simple-rpg-engine — kod jednorazowy

Pytanie: który układ najlepiej tłumaczy decyzję postawa → akcja → cel przy jawnych zamiarach i relacyjnych dystansach?

Źródło: `tmp/figth/03_system_postawy_karty_odleglosci_MVP.md`, rozdziały 4–5, 14 i 15.2.

Uruchomienie: `npm run prototype:fight`.
Adres: http://localhost:3011/arena/prototype-stance?variant=A

- A — Stół taktyczny: równoległy przegląd sytuacji, karty i boczny podgląd.
- B — Jedna decyzja naraz: stale widoczne zamiary, następnie kroki postawa / akcja / cel.
- C — Panel dowodzenia: trzy kolumny, lista zamiarów w centrum, kompaktowe akcje po prawej.

Warianty przełącza dolny pasek oraz klawisze ← / →. Parametr `variant` zachowuje wybrany układ po odświeżeniu. Zmiana wariantu zachowuje wybór w pamięci. Scenariusze T1, T5 i T7 pokazują stan pierwszej rundy. Można zmieniać perspektywę relacji, wybierać akcje i cele, zobaczyć powody blokad, zatwierdzić demonstrację oraz zrestartować widok. Pełny stan jest rozwijany u dołu strony.

To prototyp UI, nie implementacja silnika. Nie oblicza końcowych HP ani kolejnych rund; zatwierdzenie zapisuje jedynie komunikat demonstracyjny. Nie obsługuje zapisów, importu ani eksportu. W produkcji trasa zwraca 404. Nie modyfikuje danych Areny.

Weryfikacja: TypeScript, ESLint, uruchomienie A/B/C w Chromium przy szerokości 1440 i 390 px, przełączenie wariantu, wybór Podejścia w T5 i demonstracyjne zatwierdzenie. Bez błędów przeglądarki i poziomego przepełnienia.

Źródło prototypu: gałąź `codex/prototype-stance-combat`. Werdykt: oczekuje na ocenę użytkownika; żaden wariant nie został wybrany ani przeniesiony do produkcji. Nie wskazano issue implementacyjnego; przy wyborze wariantu należy dodać do niego odnośnik do tej gałęzi i uzasadnienie decyzji.
