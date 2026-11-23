# 3. Manetki Zwift Click i sterowanie

W wydaniu 1.0.0 wybierz **Devices → Bluetooth controllers**. Parowanie uruchamia **Connect controller**, a sprawdzenie przycisków **Test buttons**.

OskiRide obsługuje bezpośrednie połączenie Bluetooth z kontrolerami **Zwift Click V1** oraz **Zwift Click V2 (lewa i prawa manetka)** bez użycia zewnętrznych programów pośredniczących (integracja z mostem MySWITCH / OpenBikeControl została wycofana na rzecz bezpośredniego parowania BLE w przeglądarce i Electron).

---

## Parowanie Zwift Click V1 i Click V2

1. Otwórz **Urządzenia → Manetki Bluetooth**.
2. Wybierz model:
   - **Zwift Click V1** (dwuprzyciskowa manetka `+` / `−`),
   - **Zwift Click V2 — Prawa** lub **Zwift Click V2 — Lewa** (w Click V2 każdą stronę paruje się osobno).
3. Kliknij **Połącz manetkę** i wybierz urządzenie w oknie przeglądarki lub Electron.
4. Panel wyświetla stan połączenia każdej strony oraz poziom naładowania baterii (`Battery Service 0x180F`).

---

## Wirtualna zmiana biegów (1–24)

- Fizyczny przycisk **`+`** zawsze wrzuca **cięższy bieg** (wyższe przełożenie), a przycisk **`−`** zrzuca na **lżejszy bieg** pod górę.
- Dostępne są **24 przełożenia wirtualne** w trzech profilach napędu (`Ustawienia → Stopniowanie biegów`):
  - **Szosowe uniwersalne (`allaround`)** — odpowiednik 50/34 z kasetą 11–34T,
  - **Górskie (`climbing`)** — lżejsze przełożenia na strome przełęcze,
  - **Płaskie / Aero (`flat`)** — gęste stopniowanie przy wysokich prędkościach.
- Tryb wirtualnych biegów można ustawić na **Automatycznie** (aktywuje się po sparowaniu manetki Zwift), **Zawsze** lub **Wyłączone** (jazda na fizycznej kasecie roweru).

---

## Obsługa menu z kierownicy i przypisanie przycisków

Dla kontrolerów **Zwift Click V2**:

- Przycisk **`Z`** domyślnie otwiera i zamyka menu główne podczas jazdy.
- **Strzałki kierunkowe** lewej manetki przesuwają zaznaczenie między elementami menu, kartami tras i treningów.
- Przycisk **`B`** zatwierdza wybór (wybranie trasy wbudowanej, zapisanego GPX lub treningu automatycznie przenosi zaznaczenie na przycisk startu jazdy).
- Pozostałe przyciski można dowolnie przypisać w sekcji **Przypisanie i test przycisków** (zmiana biegów, zmiana kamery, pauza, menu).

### Podpowiedzi symboli i test z podświetleniem

- **Dynamiczne podpowiedzi:** Po naciśnięciu dowolnego przycisku podłączonej manetki w menu oraz przy przycisku **Menu** na ekranie jazdy pojawiają się kolorowe, okrągłe symbole przycisków i krzyżak kierunkowy. Dotknięcie myszy, ekranu lub klawiatury przywraca klasyczny widok.
- **Test przycisków na schemacie:** W **Przypisanie i test przycisków → Testuj przyciski** widoczne są schematy lewej i prawej manetki Click V2. Naciśnięcie fizycznego przycisku podświetla jego obrys na schemacie i wyświetla przypisaną akcję bez jej uruchamiania w grze.
- **Alerty podczas jazdy:** Gra ostrzega komunikatem na HUD, gdy poziom baterii manetki spadnie do **20% lub mniej**, przy utracie połączenia lub gdy lewa manetka wymaga wybudzenia/aktywacji.

---

## Skróty klawiaturowe i Gamepad

| Klawisz / Przycisk | Działanie |
| --- | --- |
| `Esc` | Otwiera lub zamyka menu główne |
| `C` | Przełącza między widokiem za kolarzem, z kierownicy i z góry |
| `E`, `]`, `+` / `=` | Cięższy bieg wirtualny (bieg w górę) |
| `Q`, `[`, `-` | Lżejszy bieg wirtualny (bieg w dół) |
| `Strzałka w górę / w dół` (w symulacji z klawiatury) | Zwiększa / zmniejsza moc symulacji (W) |
| `Strzałka w górę / w dół` (z zewnętrznym źródłem mocy) | Zmienia wirtualny bieg, jeśli jest aktywny |
| **Gamepad:** `R1` lub góra/prawo | Cięższy bieg |
| **Gamepad:** `L1` lub dół/lewo | Lżejszy bieg |
