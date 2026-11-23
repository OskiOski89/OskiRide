# 5. Treningi strukturalne, duchy 3D i Dziennik postępów

W wersji angielskiej wybierz **Workouts → Start workout**. Historię przejazdów otworzysz w **Journal**, a rywala z rekordu włączysz przez **Second ghost: personal best**.

OskiRide łączy swobodną jazdę po trasach GPX z planami interwałowymi, wyścigiem z dwoma duchami 3D oraz rozbudowaną analityką potreningową.

---

## Treningi strukturalne (`Treningi`, `src/workouts/workoutEngine.js`)

- **Wbudowana biblioteka planów:**
  1. **Sweet Spot** (50 min),
  2. **VO2 Max** (43 min),
  3. **Tabata** (30 min 20 s),
  4. **Over-Unders 2×9 min** (38 min),
  5. **Baza tlenowa Z2** (60 min).
- **Import własnych plików treningowych:**
  - `.zwo` (Zwift Workout XML — obsługuje bloki `Warmup`, `Cooldown`, `SteadyState`, `Ramp`, `IntervalsT`, `FreeRide`),
  - `.mrc` (moc określona jako **procent FTP**),
  - `.erg` (moc określona bezpośrednio w **watach**).
- Zaimportowanie pliku wybiera plan na liście i czeka na kliknięcie **„Rozpocznij trening”**. Zegar interwałów działa podczas jazdy, automatycznie wysyłając docelowe waty ERG do trenażera (lub przełączając na SIM w blokach `FreeRide`).

---

## Dwa duchy 3D: Wirtualny rywal i własny rekord (`Ustawienia jazdy`)

Podczas jazdy po trasie możesz ścigać się jednocześnie z **dwoma niezależnymi duchami 3D**:

1. **Pierwszy duch (Wirtualny rywal):**
   - Może jechać według oryginalnych znaczników czasu z pliku GPX, stałego tempa lub mocy powiązanej z Twoim FTP.
2. **Drugi duch (`🏆 DUCH (REKORD)` — własny rekord z Dziennika postępów):**
   - Włączany w **Ustawienia jazdy → Obraz, rywal i zPower → Drugi rywal: własny rekord z dziennika**.
   - Pozwala wybrać **Najlepszy czas (rekord trasy)** albo konkretny historyczny przejazd danej trasy zapisany w Dzienniku postępów.
   - Oba duchy są renderowane osobno na szosie 3D, górnym pasku HUD, minimapie, profilu wysokości, liście kolarzy i w podsumowaniu jazdy.

Oprócz duchów na trasie poruszają się również **Pacerzy AI**, za którymi można korzystać z tunelu aerodynamicznego (**Drafting** — redukcja oporu powietrza do 35% na dystansie do 12 m).

---

## Analityka wysiłku i podsumowanie jazdy

Na żywo podczas jazdy oraz w oknie podsumowania (`Zakończ trening` lub po przekroczeniu linii mety) wyliczane są:

- **7 stref mocy dra Andrew Coggana (Z1–Z7)** z czasem i udziałem procentowym w każdej strefie,
- **NP (Normalized Power)** — moc znormalizowana z 30-sekundowej średniej kroczącej podnoszonej do 4. potęgi,
- **IF (Intensity Factor)** — współczynnik intensywności względem FTP,
- **TSS (Training Stress Score)** — punktowe obciążenie treningowe,
- **Krzywa mocy MMP (Mean Maximal Power)** na wykresie HiDPI HTML5 Canvas: szczytowy sprint **Pmax** (W oraz W/kg) oraz rekordy odcinkowe **5 s, 15 s, 1 min, 5 min i 20 min** z linią odniesienia FTP.

---

## Dziennik postępów i porównywanie przejazdów

- Wszystkie ukończone jazdy zapisują się lokalnie w bazie **IndexedDB** (widok **Dziennik** w menu głównym oraz przycisk **Przejazdy** przy każdej trasie w **Moje trasy GPX**).
- **Filtry i statystyki okresowe:** filtrowanie po konkretnej trasie i okresie aktualizuje łączny dystans, czas, przewyższenie, energię oraz wykresy tygodniowe i miesięczne.
- **Porównanie dwóch jazd (`Porównaj jazdy`):**
  - Zaznacz dowolne dwa przejazdy w dzienniku, aby otworzyć tabelę różnic (czas, średnia moc, NP, tętno, kadencja, prędkość) oraz wspólne wykresy przebiegu mocy, tętna, kadencji, prędkości i wysokości.
  - Jeżeli obie jazdy odbyły się na tej samej trasie, próbki są precyzyjnie porównywane **na tym samym kilometrze trasy**.

---

## Odzyskiwanie sesji i eksport FIT / TCX / Strava

- **Automatyczny zapis postępu (`src/session/rideRecovery.js`):** co 5 sekund aktywnej jazdy oraz przy pauzie i zamykaniu karty aplikacja zapisuje stan sesji (`oskiride_ride_recovery_v1`). Po przypadkowym zamknięciu przeglądarki lub restarcie możesz przywrócić przerwaną jazdę (w stanie bezpiecznej pauzy) wraz z dotychczasową telemetrią i planem treningowym.
- **Eksport plików:**
  - **`Pobierz FIT`** (`src/export/fitExporter.js`) — binarny plik `.fit` z sumą kontrolną CRC zgodny z Garmin Connect, Strava, TrainingPeaks i Intervals.icu,
  - **`Pobierz TCX`** (`src/export/tcxExporter.js`) — plik XML `.tcx` z pełną ścieżką GPS i telemetrią (moc, tętno, kadencja, wysokość),
  - **`Przejdź do Stravy ↗`** — otwiera stronę ręcznego wgrania pobranego pliku na Stravę (`strava.com/upload/select`).
