# OskiRide — logo stojące, grubość 20 mm

Gotowy wariant logo „Słońce i las”, ustawiony pionowo na dolnej krawędzi. Napis czyta się poziomo. Poprzednie warianty zostały zachowane.

## Model

- Plik: `modele/oskiride-logo-160mm-pionowe-20mm.stl`.
- Szerokość: **160 mm** (X).
- Wysokość: **35,974 mm**, czyli około 36 mm (Z).
- Całkowita grubość: **20 mm / 2 cm** (Y), razem z wypukłym logo.
- Kremowy korpus: **18,4 mm**. Wypukły znak i napis: dodatkowe **1,6 mm**.
- Dolna krawędź znajduje się na **Z = 0**. Bryła ma zaokrąglone narożniki i płaskie oparcie dolnej krawędzi.

Model jest jednym połączonym, szczelnym elementem. Po ponownym odczycie STL sprawdzono wymiary, dodatnią objętość, kierunki ścian i brak otwartych lub niewłaściwie współdzielonych krawędzi. Wyniki: `sprawdzenie-koncowe.json`. Wydruku fizycznego nie wykonywano.

## Kolory i położenie do druku

STL nie zapisuje kolorów ani jednostek: importuj w milimetrach. Plik `modele/oskiride-logo-kolory.3mf` zawiera trzy wyrównane części z kolorami referencyjnymi: kremowy korpus #FBF5EA, żółty znak OR #F2C94C oraz zielony napis #234C3B. Przypisz odpowiednie filamenty w slicerze. Te same części znajdują się w osobnych STL; importuj je razem jako jeden obiekt wieloczęściowy, zachowując współrzędne.

Model zapisano w pozycji stojącej. Płaski tył pozwala obrócić go o 90° i ułożyć w slicerze tyłem do stołu, aby znak i napis powstawały na górze. Po wydruku można postawić go na dolnej krawędzi. Po ustawieniu do druku sprawdź podgląd warstw w używanym slicerze.

## Podgląd i źródła

- Podgląd w projekcie: http://localhost:8080/grafika/marka-oskiride/druk-3d/pionowe-20mm/podglad.html
- `podglad-3d.png` — widok rzeczywistych modeli STL.
- `podglad.html` — kopia edytowalnego podglądu; do działania wymaga lokalnego serwera i bibliotek Three.js projektu.
- `modele/oskiride-logo-wektor.svg` — zamknięte obrysy logo do dalszej pracy w CAD.
- `sources/` — kopie skryptów, wymagań, oryginalnego PNG oraz plików podglądu w ich układzie projektowym.

Odtworzenie w głównym folderze projektu:

```text
python tools/3d/build-logo-stl.py --width 160 --base-height 18.4 --relief 1.6 --upright --output "output/logo-print/models"
```

Biblioteki zapisano w `tools/3d/requirements-logo-stl.txt`. Skrypt wykrywa lokalny katalog `tools/3d/.cache/logo-stl-python`. Pakiet nie zawiera profilu drukarki ani pliku G-code.
