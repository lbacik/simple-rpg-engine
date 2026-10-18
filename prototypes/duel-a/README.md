# Prototyp pojedynku A — kod do odrzucenia

Otwórz `prototype.html` w przeglądarce. Nie wymaga serwera ani instalacji.

Pytanie: czy jawny zamiar, wytrzymałość i tempo dają kilka interesujących odpowiedzi przez kolejne rundy? Werdykt projektowy: oczekuje na ręczne ogranie. Nie przeniesiono reguł do kodu produkcyjnego.

Zawiera sześć akcji, profile A01–A04, podgląd, wspólny deterministyczny silnik, scenariusze prowadzone, eksport i odtworzenie stanu JSON, dziennik oraz podstawowe pomiary. Eksport obejmuje historię bieżącej sesji; import odtwarza stan walki i zaczyna nowy pomiar. Czas decyzji pomija czas ukrycia karty. Scenariusze diagnostyczne należy rozpoczynać przez ich zakładki; dowolna gra może zmienić oczekiwany przebieg kroków.

Silnik znajduje się w osobnym bloku `script#engine`, bez zależności od interfejsu. Stan żyje w pamięci, zapis jest wyłącznie ręcznym plikiem. Kopia specyfikacji wejściowej: `SPEC.md`. Wyłączenie premii tempa jest osobnym eksperymentem, uruchamia nową walkę.

Gałąź archiwalna: `codex/prototype-duel-a`. Nie scalać powłoki prototypu do main. Po sesji zapisać werdykt i dopiero wtedy wdrażać zatwierdzone decyzje.

Sprawdzenie 18.10.2026: składnia obu bloków skryptu poprawna; 36/36 zestawień macierzy zgodnych; przykład trzech rund daje 19/7 HP, 6/10 wytrzymałości, tempo +2. Ręczny smoke check przeglądarki: wybór Kontry i zatwierdzenie, scenariusz obopólnej eliminacji, ekran 390 px bez przewijania poziomego, brak błędów JavaScript. Symulacje czterech profili zakończyły walki; eksport/odtworzenie stanu sprawdzono w kolejnych rundach, również przy limicie 30. To sprawdzenia działania prototypu, bez utrwalania zestawu testów i bez werdyktu o balansie.
