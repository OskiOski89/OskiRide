# OskiRide — Wiki projektu

[English documentation](en/README.md) · [Screenshot gallery](en/Screenshots.md)

Dane kolarza, trasy i historia jazd są zapisane na urządzeniu. Pliki FIT, TCX i logi JSON mogą zawierać dane treningowe lub informacje o urządzeniach. [Prywatność i eksport danych](en/Privacy.md)

OskiRide to lokalny symulator kolarski 3D z importem GPX i obsługą trenażerów Bluetooth. Publiczne wydanie 1.0.1 jest dostępne dla Windows x64. Ze źródeł aplikację można uruchomić w przeglądarce lub powłoce Electron. [Przewodnik po wszystkich funkcjach](Funkcje-OskiRide.md)

Identyfikacja wizualna projektu to **Słońce i las**: monogram **OR**, słoneczny żółty (`#F2C94C`), leśna zieleń (`#234C3B`), głęboka zieleń (`#172B23`) i ciepły krem (`#FBF5EA`).

---

## Spis treści Wiki

1. **[Instalacja i uruchomienie](Instalacja-i-Uruchomienie.md)**
   Instalator Windows x64, pierwsze uruchomienie, wymagania oraz uruchomienie ze źródeł.
2. **[Trenażery i Bluetooth](Trenazery-i-Bluetooth.md)**
   Obsługiwane protokoły BLE (FTMS, Cycling Power, HRM, CSC, Tacx FE-C over BLE, Wahoo Direct), odczyty i sterowanie oporem (SIM / ERG), 18 krzywych mocy wirtualnej **zPower**, kalibracja **Spindown**, pauza po utracie połączenia i 30-sekundowy test w **Device check**.
3. **[Manetki Zwift Click i sterowanie](Manetki-Zwift-Click.md)**
   Bezpośrednie parowanie Bluetooth z **Zwift Click V1** oraz lewą i prawą **Zwift Click V2** (bez zewnętrznego mostu), wirtualna zmiana biegów 1–24 (Zwift Cog vs fizyczna kaseta), przypisanie przycisków, interaktywny test z podświetleniem schematu, obsługa menu z kierownicy, podpowiedzi symboli i alerty baterii.
4. **[Trasy GPX i świat 3D](Trasy-GPX-i-Swiat-3D.md)**
   Pięć tras wbudowanych (w tym podjazd **Alpe d'Huez**), import i **Biblioteka własnych tras GPX** (IndexedDB), wygładzanie wysokości i kategoryzacja podjazdów (HC, Kat. 1–4), oświetlenie PBR i kopuła nieba 3D, rzeźbione góry, drzewa i głazy, bramy LED, cztery modele kolarza, 12 animowanych kibiców, przechył w zakrętach i automatyczne dopasowanie grafiki.
5. **[Treningi i Dziennik postępów](Treningi-i-Dziennik-Postepow.md)**
   Biblioteka treningów strukturalnych, import `.zwo` / `.mrc` / `.erg`, analityka mocy dra Andrew Coggana (NP, IF, TSS, strefy Z1–Z7, krzywa MMP i Pmax), **Dziennik postępów** z porównywaniem dwóch przejazdów na tym samym kilometrze, **dwa duchy 3D** (wirtualny rywal + własny rekord trasy z dziennika), odzyskiwanie przerwanej sesji oraz eksport **FIT / TCX / Strava**.
6. **[Architektura, testy i FAQ (oraz publikacja na GitHub)](Architektura-i-FAQ.md)**
   Mapa modułów `src/`, `grafika/` i `tools/3d/`, diagnostyka i logi każdej jazdy (`Ustawienia → Logi`), testy regresji (`npm run test:consistency`), znane ograniczenia oraz instrukcja krok po kroku publikacji repozytorium i Wiki na GitHubie.

---

## Szybki start

Do jazdy na Windows skorzystaj z [instrukcji instalacji](Instalacja-i-Uruchomienie.md). Poniższe polecenia służą do uruchomienia i testowania kodu źródłowego.

Wersja 1.0.1 ma angielskie menu. **Ride** oznacza jazdę, **Workouts** treningi, **Journal** dziennik, **Settings** ustawienia, a **Devices** panel połączeń Bluetooth.

```powershell
# Uruchomienie lokalnego serwera HTTP (http://localhost:8080/index.html)
node server.js

# Uruchomienie wersji desktopowej Electron
npm ci
npm run desktop

# Uruchomienie testów spójności i regresji (wymaga Microsoft Edge)
npm run test:consistency
```

---

## Najważniejsze odnośniki w repozytorium

- **[Dziennik zmian (CHANGELOG.md)](../CHANGELOG.md)** — chronologiczna lista wydań, nowych funkcji i poprawek.
- **[Dokumentacja techniczna](../docs/DOKUMENTACJA_TECHNICZNA.md)** — opis implementacji i testów.
- **[Dokumentacja techniczna](../docs/DOKUMENTACJA_TECHNICZNA.md)** — wzory fizyczne, algorytmy GPX, ramki BLE i architektura renderera 3D.
