# 2. Trenażery i Bluetooth (BLE)

W angielskim interfejsie otwórz **Devices**. Próbę odczytów i oporu znajdziesz w **Device check**. Bez źródła mocy jazda w symulacji zaczyna się od 0 W.

Odczyty, tryby oporu i miejsca parowania zebrano w angielskiej tabeli. [Zgodność sprzętu i zakres testów](en/Equipment.md#hardware-compatibility)

Moduł `src/ble/trainerController.js` odpowiada za komunikację Web Bluetooth API z trenażerami Smart, miernikami mocy, czujnikami kadencji/prędkości i pulsometrami.

---

## Obsługiwane protokoły GATT / BLE

| Usługa / Protokół | UUID / Charakterystyka | Zakres obsługi w kodzie |
| --- | --- | --- |
| **FTMS (Fitness Machine Service)** | `0x1826` (`0x2AD2` Indoor Bike Data, `0x2AD9` Control Point) | Odczyt mocy i kadencji; komendy `Request Control`, `Start/Resume`, symulacja nachylenia **SIM** (`0x11`), moc docelowa **ERG** (`0x05`) oraz fallback na poziom oporu (`0x04`) |
| **Cycling Power Service (CPS)** | `0x1818` (`0x2A63` Measurement) | Odczyt mocy chwilowej oraz wyliczanie kadencji z obrotów korby (*Crank Revolutions*, flaga `0x0020`) |
| **Heart Rate Service (HRM)** | `0x180D` (`0x2A37` Measurement) | Odczyt tętna w formatach `UINT8` i `UINT16` |
| **Cycling Speed and Cadence (CSCP)** | `0x1816` (`0x2A5B` Measurement) | Odczyt obrotów koła i korby oraz wyliczanie mocy wirtualnej **zPower** |
| **Tacx FE-C over BLE (Nordic UART)** | `6E40FEC1-...` (`FEC2` / `FEC3`) | Ramki ANT+ FE-C Page 51 (nachylenie trasy) oraz Page 25 (odczyt mocy i kadencji) dla starszych trenażerów Tacx |
| **Wahoo Direct BLE** | Rozszerzenie CPS (`0xA026E005-...`) | Komendy symulacji nachylenia (`0x43`) oraz mocy docelowej ERG (`0x42`) dla starszych modeli Wahoo KICKR |
| **Battery Service** | `0x180F` (`0x2A19` Battery Level) | Odczyt poziomu naładowania baterii urządzenia / manetki |

> **Ważne rozróżnienie:** Odczyt telemetrii (watów, kadencji, tętna) i aktywne sterowanie oporem (SIM/ERG) są w OskiRide rozdzielone. Sam miernik mocy (`0x1818`) lub czujnik prędkości (`0x1816`) dostarcza dane do fizyki ruchu, ale nie zmienia oporu trenażera. Działanie konkretnego modelu trenażera w trybie SIM/ERG należy zawsze potwierdzić próbą sprzętową.

---

## Tryby sterowania oporem: SIM vs ERG

Silnik `src/workouts/trainerMode.js` wymusza ścisłą wyłączność między trybami:

- **Tryb SIM (symulacja trasy).** Trenażer odwzorowuje nachylenie drogi. Uwzględnia ustawienia **Trainer difficulty** (0–100%), **Resistance response**, limit nachylenia na zjazdach i wirtualny bieg, jeśli jest aktywny.
- **Tryb ERG (Stała moc docelowa):** Trenażer utrzymuje zadane waty niezależnie od kadencji i profilu trasy (podczas treningu strukturalnego lub po ręcznym ustawieniu celu ERG). Zmiana trybu natychmiast anuluje kolejkę komend i rampę poprzedniego trybu. Blok `FreeRide` w treningu strukturalnym automatycznie przełącza trenażer na tryb SIM.

---

## Krzywe mocy wirtualnej (zPower) dla trenażerów klasycznych

OskiRide ma **18 profili zPower** do oszacowania mocy z prędkości koła odczytanej przez czujnik CSC. Krzywe mają postać $P(v) = a \cdot v^3 + b \cdot v^2 + c \cdot v$. Modele wybierzesz w **Devices**.

- **Tacx** — Blue Matic, Blue Motion, Booster, Satori Pro.
- **Elite** — Novo Force, Qubo Power Mag, Qubo Fluid.
- **Kurt Kinetic** — Road Machine, Rock and Roll.
- **B'Twin / Van Rysel** — In'Ride 100 i In'Ride 500.
- **Saris / CycleOps** — Fluid2 i Mag.
- **Minoura** — MagRide 60/80.
- **Krzywe ogólne** — trenażer płynowy, magnetyczny (pozycja 3), rolki szosowe i rower stacjonarny.

Status realizmu fizyki jest pokazywany na odznace w HUD (`#hud-realism-badge`) oraz w oknie parowania urządzeń.

---

## Bezpieczna pauza, Test urządzeń i Kalibracja Spindown

1. **Kropka diagnostyczna trenażera (prawy górny róg):**
   - **Szara** — brak połączenia,
   - **Żółta** — łączenie lub automatyczne ponawianie,
   - **Zielona** — połączono,
   - **Czerwona** — utracono połączenie.
2. **Bezpieczna pauza po utracie trenażera:** Utrata połączenia z trenażerem podczas jazdy natychmiast pauzuje sesję i interwał, zatrzymuje liczniki, anuluje rampę ERG i blokuje przypadkowe zastąpienie trenażera mocą z klawiatury. Po odzyskaniu połączenia aplikacja wysyła neutralne obciążenie SIM i czeka na kliknięcie **„Wznów jazdę”**.
3. **Test urządzeń (30 s + próba oporu 5 s):** W menu głównym przycisk **Test urządzeń** sprawdza przez 30 sekund napływ świeżych próbek mocy, kadencji i tętna (odrzuca dane symulowane i przestarzałe), a następnie pozwala ręcznie uruchomić 5-sekundową próbę skoku i powrotu oporu.
4. **Kalibracja Spindown:** Asystent wybiegu koła zamachowego prowadzi użytkownika przez rozpędzenie trenażera do $37\text{ km/h}$ i mierzy czas swobodnego wybiegu do $15\text{ km/h}$.
