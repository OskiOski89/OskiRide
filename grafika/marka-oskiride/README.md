# OskiRide — Słońce i las

Aktualne logo: słoneczny żółty monogram OR i leśna zieleń napisu OskiRide. Paleta odchodzi od pomarańczu i terakoty, zachowując ciepły, przyjazny charakter.

## Pliki

- `oskiride-logo.png` — aktualne pełne logo (`OR OskiRide`) z przezroczystością, po zmianie kolorów przez imagegen.
- `oskiride-icon.png`, `oskiride-icon.ico`, `oskiride-icon.svg` — kwadratowa ikona aplikacji i favicon zawierająca wyłącznie słoneczny monogram `OR` (bez napisu `OskiRide`), czytelna w małych rozmiarach na pasku zadań i kartach przeglądarki.
- `theme.css` — wspólne zmienne kolorów i motyw używany przez aplikację.
- `paleta.html` — podgląd palety, przycisków i przykładowych liczników; otwórz lokalnie albo pod adresem http://localhost:8080/grafika/marka-oskiride/paleta.html po uruchomieniu serwera.
- `prompt-logo.txt` — opis generowania wybranego logo.
- `warianty/` — poprzednie logo w miodzie i terakocie.

## Kolory i zastosowanie

| Kolor | HEX | Rola |
| --- | --- | --- |
| Słoneczny żółty | #F2C94C | Monogram, rozpoczęcie jazdy, wyróżnienia na ciemnym tle |
| Leśna zieleń | #234C3B | Logotyp, główne przyciski, aktywna trasa, suwaki |
| Krem | #FBF5EA | Tło menu i podkład pod logo |
| Ciepły papier | #FFFCF7 | Karty i pola formularzy |
| Jasna oliwka | #ECEEDC | Grupy ustawień i drugorzędne przyciski |
| Ciemna zieleń tekstu | #20372C | Tekst na jasnym tle i na żółtym przycisku |
| Leśny cień | #172B23 | Panele HUD podczas jazdy |
| Stonowana zieleń | #5E6A5B | Pomocniczy tekst na jasnym tle |
| Szałwia | #557347 | Sukces, połączony trenażer, eksport treningu |
| Ceglana czerwień | #A83F45 | Błędy i ostrzeżenia |

W menu logo wyświetlamy na kremowym podkładzie. Na ciemnym HUD logo ma przezroczyste tło, żółty monogram i jasny napis; wariant wyświetlania powstaje przez filtr SVG `oskiride-logo-on-dark`, bez zmiany źródłowego PNG i kształtu znaku. Na żółtym tle stosujemy ciemnozielony tekst; na leśnej zieleni — ciepły biały. Żółty służy do akcentów, a nie drobnego tekstu na kremie. Tekst pomocniczy na ciemnym HUD: #CAD6C1.

Strefy mocy i kolory nachylenia mają odrębne znaczenie treningowe i pozostają wielobarwne. Motyw dotyczy interfejsu, nie oświetlenia świata 3D ani modelu kolarza.

Gotowy model do druku 3D znajduje się w podfolderze `druk-3d/`: STL 160 mm, części do druku wielokolorowego, 3MF i wektor SVG. Szczegóły oraz wyniki kontroli są w `druk-3d/README.md` i `druk-3d/walidacja.json`.
