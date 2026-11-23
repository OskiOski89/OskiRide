# 6. Architektura, testy, FAQ i publikacja na GitHubie

---

## Architektura projektu i mapa katalogów

| Ścieżka | Rola w projekcie |
| --- | --- |
| `index.html`, `style.css` | Główny układ interfejsu, modali, menu oraz HUD |
| `grafika/marka-oskiride/` | Zasoby marki **Słońce i las** (`theme.css`, `tokens.css`, `base.css`, logo SVG/PNG, ikona kafelkowa `oskiride-icon.ico/.png/.svg`, modele do druku 3D) |
| `src/main.js` | Punkt wejścia aplikacji: pętla renderowania, stan gry, obsługa UI, kamera, telemetria, duchy 3D, historia i dziennik postępów |
| `src/gpx/gpxParser.js` | Parser GPX, wygładzanie Gaussa, nachylenie z cięciwy, kategoryzacja podjazdów i generowanie 5 tras wbudowanych |
| `src/physics/cyclingPhysics.js` | Silnik fizyki ruchu (grawitacja, opór toczenia, opór aerodynamiczny z gęstością powietrza n.p.m., bezwładność kół, drafting, wirtualne biegi 1–24) |
| `src/ble/trainerController.js` | Obsługa Web Bluetooth API dla trenażerów (FTMS, Tacx FE-C, Wahoo Direct), mierników mocy (CPS), pulsometrów (HRM), czujników CSC i 18 krzywych zPower |
| `src/ble/zwiftController.js` | Bezpośrednie parowanie BLE i dekodowanie przycisków manetek Zwift Click V1 oraz lewej/prawej Click V2 |
| `src/world/worldBuilder.js` | Budowa szosy 3D, nasypów, gór alpejskich, tuneli, drzew, głazów i sektorów widoczności |
| `src/world/skyEnvironment.js` | Kopuła nieba 3D (Rayleigh/Mie, chmury, gwiazdy, cząsteczki) i mapy środowiskowe PBR (`PMREMGenerator`) |
| `src/world/routeArches.js` | Bramy START, KOM i META z podświetleniem LED |
| `src/world/sceneryPlacement.js` | Indeks przestrzenny zapobiegający kolizjom obiektów scenerii z jezdnią |
| `src/world/spectatorCrowd.js` | Ładowanie i animacja 12 wariantów kibiców 3D |
| `src/world/roadLean.js` | Obliczanie przechyłu w zakrętach z rzeczywistej krzywizny drogi i prędkości |
| `grafika/kolarz.js`, `kinematyka.js` | Loader 4 modeli kolarza (`01 Velocity`, `02 Alpine`, `03 Nocturne`, `04 Heritage`) i wspólny solver szkieletu (pedałowanie, sprint, wybieg) |
| `src/workouts/workoutEngine.js`, `trainerMode.js` | Parsery treningów (`.zwo`, `.mrc`, `.erg`), biblioteka planów oraz wyłączność sterowania SIM / ERG |
| `src/session/rideSession.js`, `rideRecovery.js` | Maszyna stanów sesji (`ready`, `riding`, `paused`, `finished`) i checkpoint odzyskiwania jazdy |
| `src/export/fitExporter.js`, `tcxExporter.js` | Eksportery plików treningowych `.fit` (binarny z CRC) oraz `.tcx` (XML) |
| `server.js`, `electron-main.js` | Lokalny serwer HTTP (`localhost:8080`) oraz powłoka desktopowa Electron |
| `tools/3d/` | Skrypty Blender/Python, walidatory glTF i testy automatyczne Playwright |
| `wiki/` | Pliki niniejszego polskiego **GitHub Wiki** |
| `docs/`, `tests/consistency/` | Dokumentacja techniczna, materiały wydania i testy regresji |

---

## Diagnostyka, logi jazdy i testy regresji

### Diagnostyka i logi (`Ustawienia → Logi`)

- Każda rozpoczęta jazda tworzy osobny dziennik diagnostyczny zapisywany lokalnie w **IndexedDB** (bez limitu 20 jazd).
- Rejestrowane są zdarzenia sesji, parowania i rozłączenia BLE, przełączenia trybów SIM/ERG, decyzje automatycznej grafiki, ostrzeżenia oraz błędy.
- Dostępny jest podgląd na żywo oraz pobranie pełnego raportu w pliku `.json`.

### Uruchamianie testów regresji

```powershell
npm run test:consistency
```

Zestaw testów weryfikuje w przeglądarce Microsoft Edge (z użyciem atrap BLE) ponad 100 punktów kontrolnych: identyfikatory DOM, stany sesji, wyłączność SIM/ERG, bibliotekę GPX, dziennik postępów, obsługę manetek Zwift Click, grafikę PBR, drugiego ducha oraz poprawność eksportu FIT i TCX.

---

## FAQ i znane ograniczenia

1. **Czy testy z atrapami BLE gwarantują działanie każdego fizycznego trenażera?**
   Nie. Testy automatyczne weryfikują logikę aplikacji i format ramek GATT, natomiast fizyczna reakcja oporu w trybach SIM i ERG oraz parowanie konkretnego egzemplarza trenażera lub manetki wymagają zawsze próby na docelowym sprzęcie.
2. **Dlaczego nie słychać syntetycznych dźwięków wiatru i zmiany biegów?**
   Syntetyczne efekty audio są celowo wyciszone w bieżącym kodzie zgodnie z ustaleniami projektu.
3. **Co zrobić, gdy przeglądarka nie widzi urządzeń Bluetooth?**
   Upewnij się, że korzystasz z **Chrome**, **Edge** lub wersji desktopowej **Electron** (`npm run desktop`), Bluetooth w systemie Windows/macOS jest włączony, a trenażer lub manetka Zwift Click nie są w tym samym czasie połączone z inną aplikacją (np. telefonem lub Zwiftem).

---

## Publikacja kodu, wydania i Wiki

Gdy będziesz gotowy dodać projekt na GitHuba na koniec prac:

### Krok 1. Wysłanie głównego repozytorium

Repozytorium zawiera kod źródłowy, dokumentację, materiały wydania i testy. Plik `.gitignore` pomija instalatory, pliki aktywności, osobiste materiały i duże paczki narzędzi.

```powershell
git init
git add .
git commit -m "Pierwsze wydanie OskiRide z pelna dokumentacja, Changelogiem i Wiki"
git branch -M main
git remote add origin https://github.com/<TWOJ-LOGIN>/<TWOJE-REPO>.git
git push -u origin main
```

### Krok 2. Wydanie z instalatorem

Utwórz wydanie z tagiem `v1.0.1` na gałęzi `main`. Użyj przygotowanego [opisu wydania](../docs/Release-Notes.md), a w **Assets** dodaj instalator oraz `SHA256SUMS.txt`.

### Krok 3. Opublikowanie stron GitHub Wiki z folderu `wiki/`

Na GitHubie każda zakładka **Wiki** jest osobnym repozytorium Git o adresie `https://github.com/<TWOJ-LOGIN>/<TWOJE-REPO>.wiki.git`:

1. Wejdź na stronę swojego repozytorium na GitHubie → zakładka **Wiki** → kliknij **Create the first page** i zapisz dowolną stronę startową (to zainicjuje repozytorium `.wiki.git` po stronie GitHuba).
2. W PowerShellu sklonuj repozytorium Wiki, skopiuj gotowe pliki z katalogu `wiki/` i wyślij je na GitHuba:

```powershell
git clone https://github.com/<TWOJ-LOGIN>/<TWOJE-REPO>.wiki.git oskiride-wiki
Copy-Item -Path "wiki\*.md" -Destination "oskiride-wiki\" -Force
cd oskiride-wiki
# Opcjonalnie zamień końcówki .md w linkach wewnętrznych pod silnik GitHub Wiki:
Get-ChildItem *.md | ForEach-Object {
  (Get-Content $_.FullName -Raw) -replace '\((Funkcje-OskiRide|Instalacja-i-Uruchomienie|Trenazery-i-Bluetooth|Manetki-Zwift-Click|Trasy-GPX-i-Swiat-3D|Treningi-i-Dziennik-Postepow|Architektura-i-FAQ|Home)\.md\)', '($1)' | Set-Content $_.FullName -Encoding UTF8
}
git add .
git commit -m "Dodano pelne polskie Wiki OskiRide"
git push
cd ..
```
