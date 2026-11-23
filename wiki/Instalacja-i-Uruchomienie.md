# 1. Instalacja i uruchomienie

OskiRide jest napisany w modularnym języku JavaScript (ES Modules) bez obowiązkowego bundlera. Silnik **Three.js 0.160.0** wraz z loaderami (`GLTFLoader`) znajduje się lokalnie w katalogu `grafika/vendor/`, dzięki czemu aplikacja działa w pełni offline po uruchomieniu lokalnego serwera lub powłoki Electron.

---

## Instalator Windows x64

1. W **Assets** pobierz do tego samego folderu instalator `OskiRide-Setup-1.0.1-x64.exe` i plik `SHA256SUMS.txt`. [OskiRide 1.0.1 w GitHub Releases](https://github.com/Securityoe/OskiRide/releases/tag/v1.0.1)
2. [Sprawdź sumę kontrolną](#sprawdzenie-instalatora-i-komunikat-smartscreen) i uruchom instalator na Windows 10/11 (x64). Pakiet zawiera środowisko Electron i zasoby 3D.
3. Uruchom **OskiRide** z menu Start. Interfejs wydania jest po angielsku. Do łączenia z urządzeniami potrzebny jest adapter Bluetooth Low Energy.
4. Wybierz **Ride → Start ride**. Symulacja zaczyna się od 0 W. Dodaj moc strzałką ↑ lub suwakiem, aby ruszyć.

### Sprawdzenie instalatora i komunikat SmartScreen

Instalator 1.0.1 nie ma podpisu cyfrowego. Windows może wyświetlić ostrzeżenie SmartScreen, ponieważ nie może potwierdzić tożsamości wydawcy na podstawie podpisu. [Jak działa SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)

Otwórz PowerShell w folderze z pobranymi plikami i wykonaj oba polecenia.

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath .\OskiRide-Setup-1.0.1-x64.exe).Hash
Get-Content -LiteralPath .\SHA256SUMS.txt
```

Porównaj wynik pierwszego polecenia z ciągiem znaków przed nazwą instalatora. Wielkość liter nie ma znaczenia. Zgodność sum potwierdza, że pobrany plik jest identyczny z plikiem opublikowanym w wydaniu. Jeśli sumy się różnią, nie uruchamiaj instalatora. Pobierz oba pliki ponownie z GitHub Releases. [Dokumentacja Get-FileHash](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-filehash)

## Wymagania przy uruchamianiu ze źródeł

- **Node.js 24 LTS** wraz z `npm`.
- **Przeglądarka z obsługą WebGL 2 i Web Bluetooth API**:
  - **Google Chrome** lub **Microsoft Edge** (Windows 10/11, macOS, Linux z włączonym BlueZ),
  - albo natywna powłoka desktopowa **Electron** dołączona do projektu.
- **Adapter Bluetooth Low Energy (BLE 4.0+)** — wymagany do bezpośredniego połączenia z trenażerem Smart, miernikiem mocy, pulsometrem, czujnikami kadencji/prędkości oraz manetkami Zwift Click. Bez czujników dostępna jest jazda w trybie symulacji mocy (suwak lub klawisze strzałek).

---

## Uruchomienie w przeglądarce

W głównym katalogu projektu uruchom wbudowany serwer HTTP:

```powershell
node server.js
```

lub:

```powershell
npm start
```

Serwer nasłuchuje na porcie `8080`:

- **Główna aplikacja (symulator jazdy):** `http://localhost:8080/index.html`
- **Porównanie 2×2 czterech modeli kolarza:** `http://localhost:8080/grafika/index.html`

> **Uwaga:** `server.js` wysyła nagłówki wyłączające buforowanie (`Cache-Control: no-store`), a modele `.glb` są dodatkowo wersjonowane skrótem zawartości z manifestu.

---

## Uruchomienie wersji desktopowej (Electron)

Aby uruchomić OskiRide w dedykowanym oknie aplikacji desktopowej (z własną ikoną kafelkową **OR** na pasku zadań i wbudowanym selektorem urządzeń Bluetooth):

```powershell
npm ci
npm run desktop
```

### Budowanie paczek dystrybucyjnych (`electron-builder`)

W `package.json` zdefiniowano skrypty pomocnicze:

```powershell
npm run build:win
npm run build:mac
```

Skrypty zapisują paczki w `dist/`. Cel Windows tworzy instalator x64. Pierwsze wydanie obejmuje Windows. Do potwierdzenia oporu w trybach SIM i ERG potrzebna jest próba z fizycznym trenażerem.

---

## Pierwsze kroki po uruchomieniu

1. **Profil kolarza (`Ustawienia`):** Ustaw imię, próg **FTP (W)**, masę ciała (**kg**) oraz typ roweru (Szosowy All-Rounder, Aero lub Górski/Gravel). Dane zapisują się lokalnie w przeglądarce (`oskiride_rider_profile_v1`).
2. **Parowanie urządzeń (`Urządzenia` w górnym pasku):** Połącz trenażer Smart, miernik mocy, pulsometr, czujnik prędkości (z wyborem krzywej zPower) lub manetki **Zwift Click V1 / V2**. Możesz wykonać 30-sekundowy **Test urządzeń** oraz 5-sekundową próbę oporu.
3. **Wybór trasy lub treningu (`Graj` / `Treningi`):**
   - Wybierz jedną z 5 tras wbudowanych (np. *Przełęcz Alpejska*, *Alpe d'Huez*) albo wgraj własny plik `.gpx` (zapisze się automatycznie w **Moje trasy GPX**).
   - Opcjonalnie wybierz trening strukturalny z biblioteki lub zaimportuj plik `.zwo`, `.mrc` albo `.erg`.
4. **Start sesji:** Kliknij **„Rozpocznij jazdę”** lub **„Rozpocznij trening”**. Dopiero od tego momentu sesja nalicza czas, dystans, przewyższenie i energię.
