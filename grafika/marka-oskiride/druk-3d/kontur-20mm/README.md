# OskiRide — logo przestrzenne wycięte po obrysie

Zmiana według zdjęcia użytkownika: przestrzenny znak i litery na niskiej podstawce, z otwartą przestrzenią wokół i wewnątrz obrysów. Nie ma prostokątnej płyty za logo. Przekrój znaku i liter ma pełną grubość **20 mm (2 cm)**.

## Dwa gotowe warianty

| Wariant | Główny STL | Szerokość × grubość × wysokość |
| --- | --- | --- |
| Pełne logo OR + OskiRide | `modele/pelne-logo/oskiride-kontur-20mm.stl` | 160 × 20 × 32,974 mm |
| Sam znak OR, jak statuetka | `modele/sam-znak-OR/oskiride-kontur-20mm.stl` | 76 × 20 × 50,315 mm |

Podstawka ma wysokość 4 mm i grubość 20 mm. W pełnym napisie dwie kropki nad „i” łączą się ze słupkami przez wąskie tylne łączniki: szerokość 1,4 mm i grubość 3 mm. Dzięki temu nie są luźnymi częściami, a od przodu pozostają rozpoznawalne jako kropki. Pozostałe obrysy zachowują kształt zatwierdzonego logo.

Oba główne STL są jedną połączoną, szczelną bryłą, gotową do importu w milimetrach. Dolna krawędź podstawki leży na Z = 0. Sprawdzono pliki po ponownym odczycie: wymiary, objętość, zgodne kierunki ścian i brak otwartych oraz nieprawidłowo współdzielonych krawędzi. Wydruku fizycznego nie wykonywano.

## Kolory i druk

STL nie zapisuje kolorów. W każdym folderze wariantu jest również `oskiride-kontur-kolory.3mf` z kolorami referencyjnymi i osobne części STL. Znak OR: żółty #F2C94C. Napis i niska podstawka: leśna zieleń #234C3B. Zaimportuj części razem jako jeden model wieloczęściowy, zachowując położenie, i przypisz filamenty w slicerze.

Modele zapisano w pozycji stojącej. Ich płaskie tylne powierzchnie pozwalają ułożyć je w slicerze tyłem do stołu, aby wyciągnięcie 20 mm powstawało w osi druku. Przed drukiem sprawdź podgląd warstw. Pakiet nie zawiera profilu drukarki ani G-code.

## Podgląd i źródła

- Podgląd z przełączaniem wariantów: http://localhost:8080/grafika/marka-oskiride/druk-3d/kontur-20mm/podglad.html
- `pelne-logo-3d.png`, `znak-OR-3d.png`: zrzuty rzeczywistych modeli STL.
- `walidacja.json`: wyniki kontroli obu wariantów.
- `sources/tools/3d/`: odtwarzalne skrypty i wymagania Python.
- `sources/grafika/marka-oskiride/druk-3d/oskiride-logo-wektor.svg`: edytowalne obrysy źródłowe.
- `references/statuetka-referencja.png`: zdjęcie użytkownika będące odniesieniem dla formy; geometria i marka pozostają OskiRide.

Odtworzenie w głównym folderze projektu: `python tools/3d/build-outline-logo.py`. Skrypt używa bibliotek z lokalnego `tools/3d/.cache/logo-stl-python` i zapisuje nowy wariant w folderze tego zadania. Poprzednie modele na płycie zostały zachowane jako wcześniejsze wersje.
