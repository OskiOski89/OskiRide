# OskiRide — logo do druku 3D

Model odtworzony z zatwierdzonego logo „Słońce i las”: znak OR i napis OskiRide. Oryginalny PNG pozostaje bez zmian. Zamknięte kontury zostały wyprowadzone z grafiki, oczyszczone z drobnych artefaktów i wyciągnięte w pionie. To model wypukłego logo na zaokrąglonej płytce.

## Gotowy model

**`oskiride-logo-160mm.stl`** — jedna połączona, szczelna bryła do druku jednokolorowego.

- Wymiary: **160 × 35,974 × 3,6 mm**.
- Podstawa: **2 mm**.
- Wypukły znak i litery: dodatkowe **1,6 mm**.
- Margines wokół grafiki: około **3 mm**.
- Jednostki: **milimetry**. STL nie zapisuje jednostki; wybierz mm przy imporcie, jeśli slicer o to poprosi.

Połóż płaską podstawę na stole, osią Z do góry. W tej orientacji wypukłe elementy stoją na podstawie i nie wymagają podpór. Podstawa łączy również kropki nad literami i pozostałe oddzielne fragmenty napisu.

## Druk w kolorach marki

STL nie zapisuje kolorów. Można użyć pliku **`oskiride-logo-kolory.3mf`**, który zawiera wspólne położenie trzech części i ich kolory referencyjne:

| Część | Osobny STL | Kolor |
| --- | --- | --- |
| Podstawa | `oskiride-podstawa.stl` | Krem #FBF5EA |
| Znak OR | `oskiride-znak-OR.stl` | Żółty #F2C94C |
| Napis OskiRide | `oskiride-napis.stl` | Leśna zieleń #234C3B |

Przypisz filamenty w slicerze. Alternatywnie zaimportuj wszystkie trzy osobne STL jednocześnie jako **jeden obiekt z częściami**, zachowując ich wspólne współrzędne. Części logo zaczynają się na wysokości Z = 2 mm; są przeznaczone do druku razem z podstawą.

Żółty znak i zielony napis leżą na tych samych warstwach. Do obu kolorów potrzebny jest druk wielokolorowy lub osobne przygotowanie i montaż części. Sama zmiana filamentu na wysokości 2 mm daje jeden kolor dla całego wypukłego logo.

## Pozostałe pliki

- `oskiride-logo-wektor.svg` — zamknięte obrysy bez zależności od fontów, do dalszej pracy w CAD.
- `walidacja.json` — wymiary i wyniki kontroli geometrii po ponownym odczycie STL.
- `podglad.html` — interaktywny podgląd rzeczywistych części w projekcie. Po uruchomieniu `node server.js` otwórz http://localhost:8080/grafika/marka-oskiride/druk-3d/podglad.html. Podgląd korzysta z lokalnej biblioteki Three.js projektu.

Kontrola głównego STL: jedna połączona bryła, poprawne kierunki ścian, dodatnia objętość, brak otwartych i niewłaściwie współdzielonych krawędzi. Kontrola 3MF obejmuje integralność archiwum i odczyt XML; plik nie zawiera profilu konkretnej drukarki. Wydruku fizycznego nie wykonywano.

## Regenerowanie w projekcie

Skrypt: `tools/3d/build-logo-stl.py`. Zależności: `tools/3d/requirements-logo-stl.txt`. Biblioteki można zainstalować w lokalnym katalogu `tools/3d/.cache/logo-stl-python`, który skrypt wykrywa automatycznie.

```text
python -m pip install --target tools/3d/.cache/logo-stl-python -r tools/3d/requirements-logo-stl.txt
python tools/3d/build-logo-stl.py
```

Parametry `--width`, `--base-height`, `--relief` i `--margin` przyjmują wartości w milimetrach. Zmiana szerokości skaluje obrysy w płaszczyźnie; wysokość podstawy i wypukłego logo pozostaje określona oddzielnie. Skrypt zapisuje pliki we wskazanym `--output`, więc do dodatkowego wariantu użyj innego katalogu, aby zachować poprzednie części.
