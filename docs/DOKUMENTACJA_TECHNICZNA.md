# Dokumentacja Techniczna Systemu OskiRide

**Aktualizacja zakresu: 29.10.2026.** Pełny katalog funkcji, narzędzi, materiałów i otwartych zgłoszeń znajduje się w [dokumentacji użytkownika](../wiki/en/README.md). Stan opisany tutaj oznacza implementację w plikach; nie potwierdza zgodności wszystkich modeli trenażerów, firmware ani stałych 60 FPS. Testy mock BLE nie są testami fizycznego sprzętu. Kategorie podjazdów i filtrowanie geometrii są heurystykami projektu, a nie certyfikacją norm drogowych lub UCI.

Dokumentacja opisuje architekturę techniczną, protokoły łączności bezprzewodowej BLE, silnik fizyki kolarskiej, algorytmy wirtualnej zmiany biegów oraz system analityki sportowej zaimplementowany w projekcie **OskiRide**.

---

## 1. Architektura Systemu i Moduły

Aplikacja zbudowana jest w architekturze modularnego JavaScriptu (ES Modules), renderowania 3D w Three.js oraz powłoki desktopowej Electron.

### Główne komponenty:
* [`src/main.js`](../src/main.js) – pętla symulacji (`animate`), zarządzanie stanem aplikacji (`state`), kamera, HUD, obsługa wejść (klawiatura, Gamepad API) oraz podsumowanie treningu.
* [`src/ble/trainerController.js`](../src/ble/trainerController.js) – dwukierunkowa komunikacja Bluetooth FTMS (kontrola oporu, odczyt mocy i kadencji) oraz pulsometru (HRM).
* [`src/ble/zwiftController.js`](../src/ble/zwiftController.js) – bezpośrednie połączenie manetek Zwift przez Web Bluetooth, bateria i ponawianie połączenia.
* [`src/physics/cyclingPhysics.js`](../src/physics/cyclingPhysics.js) – matematyczny model dynamiki ruchu kolarza (siły oporu, gęstość powietrza ISA, bezwładność kół, tabela wirtualnych przełożeń).
* [`src/gpx/gpxParser.js`](../src/gpx/gpxParser.js) – parsowanie plików GPX, wyznaczanie profilu wysokościowego, segmentacja podjazdów ClimbPro i geometrii zakrętów.
* [`src/export/tcxExporter.js`](../src/export/tcxExporter.js) – eksport aktywności do formatu XML `.TCX` zgodnego z Garmin Connect, Strava i Intervals.icu.
* `src/world/worldBuilder.js` – proceduralny generator trasy 3D z sektorami widoczności i kontrolą rozmieszczania scenerii.
* `src/world/sceneryPlacement.js` – wspólny indeks przestrzenny drogi i obiektów, używany do kontroli kolizji przed dodaniem scenerii.
* `src/world/spectatorCrowd.js` – ładowanie i optymalizacja modeli kibiców GLB, współdzielenie zasobów, niezależne miksery animacji oraz kontrola widoczności.

---

## 2. Łączność Bluetooth Low Energy (BLE)

Aplikacja wykorzystuje **Web Bluetooth API** (włączone w Electronie przełącznikiem `enable-web-bluetooth`). Utrzymuje równolegle wiele połączeń peryferyjnych GATT.

### 2.1. Protokół Trenażera Smart (FTMS & Power)
1. **Fitness Machine Service (FTMS `0x1826`):**
   * **Indoor Bike Data (`0x2AD2`, Notify):** strumieniowanie aktualnej mocy (W), kadencji (RPM) i prędkości.
   * **Fitness Machine Control Point (`0x2AD9`, Write/Indicate):**
     * `0x00` – Request Control,
     * `0x07` – Start / Resume,
     * `0x11` – Set Indoor Bike Simulation Parameters (wysyłanie nachylenia drogi, $C_{rr}$ oraz oporu aerodynamicznego wiatru).
2. **Cycling Power Service (`0x1818`, `0x2A63`):** fallback dla trenażerów lub mierników mocy starszego typu.
3. **Heart Rate Service (`0x180D`, `0x2A37`):** odczyt tętna kolarza w formacie UINT8 / UINT16.

### 2.2. Bezpośrednie sterowanie z manetek Zwift

[`zwiftController.js`](../src/ble/zwiftController.js) łączy wybraną manetkę przez usługę GATT `00000001-19ca-4651-86e5-fa29dcdd09d1`. Włącza notyfikacje `00000002-…` i dostępne wskazania `00000004-…` przed zapisem w `00000003-…`. Inicjalizację `RideOn` rozszerza o `02 03` dla obu manetek Click V2. Zdefiniowany komunikat o zatrzymaniu przycisków lewej manetki zgłasza potrzebę aktywacji w Zwift. Po utracie GATT aplikacja ponawia połączenie maksymalnie sześć razy. Poziom baterii odczytuje z `0x180F` / `0x2A19` lub z poprawnej ramki `0x19`.

[`zwiftProtocol.js`](../src/ble/zwiftProtocol.js) wyszukuje prawą i lewą stronę Click V2 osobno na podstawie danych producenta `0x094A` z kodem `0x0A` lub `0x0B`. Rozpoznaje stany Click V1 w `0x37` oraz bitmapy `0x23` zapisane jako Protobuf. Dla połączeń Click V2 filtruje przyciski według strony, także gdy ramka zawiera bity obu stron. Zbocza liczone są osobno dla każdego urządzenia. [Badania protokołu Click V1](https://github.com/jat255/zwift_click_handling/blob/main/app.py) · [Inicjalizacja i bitmapa Click V2](https://github.com/grachpower/free-bike-control/tree/main/freeBikeControl)

[`zwiftShifterView.js`](../src/ui/zwiftShifterView.js) przypisuje fizyczne **+** i **−** na manetkach Click do cięższego i lżejszego biegu. Pozostałe przypisania zapisuje lokalnie pod `oskiride_shifter_bindings_v1`. Starsze domyślne przypisanie **B** zmienia podczas odczytu na **Bez akcji**. Chrome i Edge używają własnego okna wyboru Web Bluetooth. Electron pokazuje listę zwróconą dla konkretnego żądania i potwierdza wybór przez IPC okna OskiRide. W trybie automatycznym połączenie Click aktywuje wirtualne biegi. [Obsługa urządzeń w Electron](https://www.electronjs.org/docs/latest/tutorial/devices#web-bluetooth-api)

---

## 3. Wirtualna Zmiana Przełożeń (Zwift Cog / Virtual Shifting)

W OskiRide zaimplementowano dwa niezależne, ergonomiczne tryby pracy napędu:

```
                            [Tryb napędu w OskiRide]
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
   [Brak sparowanych manetek]                             [Sparowane manetki Zwift]
   (Standardowa kaseta w rowerze)                         (Zestaw Zwift Cog na trenażerze)
   • Bieg zmieniany manetką w rowerze                     • Bieg zmieniany przyciskami +/- na kierownicy
   • Trenażer oddaje 1:1 nachylenie z GPX                 • Łańcuch na jednej stałej zębatce Zwift Cog
   • Brak ingerencji w wirtualny opór                     • OskiRide przelicza opór FTMS wg tabeli 24 biegów
   • Na HUD: "Fizyczna kaseta"                            • Na HUD: "Bieg X/24"
```

### Tabela 24 przełożeń szosowych (`VIRTUAL_GEAR_RATIOS`):
To syntetyczna sekwencja 24 przełożeń inspirowana napędem szosowym 2×12. Wyższe pozycje obejmują również inne tarcze niż 50/34; nie jest to dokładna lista kombinacji jednej fizycznej kasety. Aktualny kod rozszerza zestaw o profile `allaround`, `climbing` i `flat`:
* **Biegi 1–5 (młynek górski):** `1.000` (34×34), `1.133` (34×30), `1.259` (34×27), `1.417` (34×24), `1.545` (34×22)
* **Biegi 6–11 (podjazd / tempo):** `1.700` (34×20), `1.889` (34×18), `2.000` (34×17), `2.125` (34×16), `2.267` (34×15), `2.429` (34×14)
* **Bieg 12 (baza / neutralne przełożenie 1:1):** `2.632` (50×19)
* **Biegi 13–18 (płaskie / szybkie tempo):** `2.778` (50×18), `2.941` (50×17), `3.125` (50×16), `3.333` (50×15), `3.571` (50×14), `3.846` (50×13)
* **Biegi 19–24 (blat na sprint i zjazd):** `4.167` (50×12), `4.333` (52×12), `4.545` (50×11), `4.727` (52×11), `4.909` (54×11), `5.091` (56×11)

### Przeliczanie oporu wysyłanego do trenażera:
$$\text{ratioMultiplier} = \frac{\text{VIRTUAL\_GEAR\_RATIOS}[\text{gear} - 1]}{\text{VIRTUAL\_GEAR\_RATIOS}[11]}$$
$$\text{targetGrade} = \left(\text{rawGrade} \cdot \text{ratioMultiplier} + (\text{ratioMultiplier} - 1.0) \cdot 4.2\right) \cdot \frac{\text{trainerDifficulty}}{100}$$

* Na podjazdach bieg lżejszy proporcjonalnie odciąża opór koła zamachowego, pozwalając na płynne kręcenie z kadencją 85–95 obr./min.
* Na płaskim i zjazdach bieg twardy zwiększa opór, zapobiegając „przekręceniu” kadencji i umożliwiając generowanie mocy rzędu 400–600 W.

---

## 4. Silnik Fizyki Kolarskiej (`cyclingPhysics.js`)

Dynamika jazdy opiera się na rozszerzonym modelu sił oporu ruchu (Martin et al.):

### 4.1. Bilans sił oporu i napędu
$$F_{\text{net}} = F_{\text{drive}} - (F_{\text{gravity}} + F_{\text{rolling}} + F_{\text{aero}})$$

1. **Siła napędowa ($F_{\text{drive}}$):**
   $$F_{\text{drive}} = \frac{P \cdot \eta}{\max(v, 1.25)}$$
   gdzie $P$ to moc w watach, a $\eta = 0.97$ to sprawność napędu łańcuchowego.
2. **Siła grawitacji ($F_{\text{gravity}}$):**
   $$F_{\text{gravity}} = M_{\text{total}} \cdot g \cdot \sin(\theta)$$
   gdzie $M_{\text{total}} = m_{\text{kolarz}} + m_{\text{rower}}$, $g = 9.81\text{ m/s}^2$, $\theta = \arctan(\text{gradePct} / 100)$.
3. **Opór toczenia ($F_{\text{rolling}}$):**
   $$F_{\text{rolling}} = M_{\text{total}} \cdot g \cdot \cos(\theta) \cdot C_{rr}$$
   gdzie $C_{rr}$ zależy od typu roweru (szosa aero: `0.0038`, czasowy: `0.0034`, MTB/gravel: `0.0055`).
4. **Opór aerodynamiczny ($F_{\text{aero}}$):**
   $$F_{\text{aero}} = \frac{1}{2} \cdot \rho(h) \cdot (C_d A \cdot k_{\text{draft}} \cdot k_{\text{aeroTuck}}) \cdot v^2$$

### 4.2. Barometryczna gęstość powietrza na wysokościach n.p.m. (ISA)
Gęstość powietrza $\rho(h)$ maleje wraz ze wzrostem wysokości n.p.m. zgodnie ze standardem międzynarodowej atmosfery wzorcowej (ISA):
$$\rho(h) = 1.225 \cdot e^{-\frac{h}{8500}}$$
* Na poziomie morza ($0\text{ m}$): $\rho = 1.225\text{ kg/m}^3$,
* Na wysokości $1000\text{ m}$: $\rho = 1.089\text{ kg/m}^3$ (opór aero mniejszy o 11%),
* Na przełęczy alpejskiej ($2000\text{ m}$): $\rho = 0.968\text{ kg/m}^3$ (opór aero mniejszy o 21%).

### 4.3. Bezwładność wirujących kół szosowych (*Rotational Inertia*)
Przyspieszenie liniowe uwzględnia moment bezwładności obu kół szosowych $700\text{c}$ ($I_{\text{wheel}} = \frac{1}{2} m r^2$):
$$M_{\text{rotational}} = \frac{2 \cdot I_{\text{wheel}}}{r^2} \approx 1.8\text{ kg}$$
$$a = \frac{F_{\text{net}}}{M_{\text{total}} + M_{\text{rotational}}}$$
Dzięki temu kolarz zyskuje autentyczny wybieg (*coasting*) po zaprzestaniu pedałowania.

### 4.4. Płynny tunel aerodynamiczny (*Drafting Curve*)
Zamiast skokowej zmiany, redukcja oporu $k_{\text{draft}}$ zależy płynnie od odległości $d$ za kolarzem poprzedzającym ($0.8\text{ m} \le d \le 12.0\text{ m}$):
$$\text{discount} = 0.35 \cdot \max\left(0, 1.0 - \frac{d - 0.8}{11.2}\right)$$
$$k_{\text{draft}} = 1.0 - \text{discount}$$

---

## 5. Rampa Nachylenia Trenażera (*Grade Smoothing*)

W module [`src/ble/trainerController.js`](../src/ble/trainerController.js) zastosowano programowy filtr zmiany nachylenia. W aktualnym kodzie parametr `trainerResponsiveness` przewiduje tempo 1,2%/s (`smooth`), 2,0%/s (`standard`) albo 3,8%/s (`dynamic`). Zmiana z `force = true` omija tę rampę. Zapis korzysta z kolejki i ograniczeń transmisji; czas fizycznej reakcji zależy od urządzenia. Filtr nie jest funkcją o potwierdzonym działaniu medycznym.

---

## 6. Wizualizacja 3D i Dźwięk

### 6.1. Pochylenie roweru w zakrętach (*Bike Lean / Roll Angle*)
Od 30.10 główna gra korzysta z `src/world/roadLean.js`. Krzywizna $\kappa$ jest obliczana w metrach z rzeczywiście wyświetlanej krzywej szosy, na odcinku około ±3,5 m. Kąt docelowy:
$$\theta_{\text{lean}} = \text{clamp}\left(\arctan(v^2\kappa / 9.81), -35^\circ, 35^\circ\right)$$
Wartość jest wygładzana z czynnikiem `1 - exp(-5.5 * dt)`. Po orientacji przez `lookAt` dodatni lokalny obrót Z odpowiada łukowi w prawo, ujemny — w lewo. Wspólny helper obsługuje gracza, rywala i pacerów:
```javascript
applyRoadLean(playerAvatar.group, state, routeCurve, u, state.speedMps, dt);
```

Jest to uproszczony model wizualny osi szosy, z limitem amplitudy i opóźnieniem wygładzania. Nie symuluje pełnej dynamiki opon. Poprzednia wersja używała kąta próbek GPX i odwrotnego znaku.

### 6.2. Proceduralny Szum Wiatru (*Aerodynamic Wind Rush*)
Wcześniejszy wariant przewidywał syntezę szumu przez Web Audio. Zgodnie z późniejszą dyspozycją użytkownika syntetyczne dźwięki jazdy są wyłączone; nie opisywać tej funkcji jako aktywnej. Aktualną zasadę wyciszenia zawiera także sekcja 10.2.

### 6.3. Klik Mechaniczny Zmiany Biegu
Klik syntetyczny również jest wyłączony. `playShiftClick()` w bieżącym `src/main.js` jest pustą funkcją. Skill audio opisuje możliwy warsztat przyszłych prac, nie stan uruchomionego silnika dźwięku.

---

## 7. Analityka Mocy: Normalized Power (NP), IF i TSS

Zaimplementowano standard analityczny dra Andrew Coggana:

1. **Normalized Power (NP):**
   * Wyznaczenie 30-sekundowej średniej kroczącej mocy:
     $$P_{30\text{s}}(t) = \frac{1}{30} \sum_{i=t-29}^{t} P(i)$$
   * Podniesienie każdej wartości do 4. potęgi i uśrednienie w czasie przejazdu:
     $$\text{Avg}_4 = \frac{1}{N} \sum_{t} \left(P_{30\text{s}}(t)\right)^4$$
   * Wyciągnięcie pierwiastka 4. stopnia:
     $$\text{NP} = \sqrt[4]{\text{Avg}_4}$$
2. **Intensity Factor (IF):**
   $$\text{IF} = \frac{\text{NP}}{\text{FTP}}$$
3. **Training Stress Score (TSS):**
   $$\text{TSS} = \frac{t_{\text{sec}} \cdot \text{NP} \cdot \text{IF}}{\text{FTP} \cdot 3600} \cdot 100$$
Wskaźniki prezentowane są na żywo w dymku HUD oraz w oknie podsumowania po zakończeniu treningu.

---

## 8. Rurociąg Realizmu Tras GPX i Geometrii 3D

W module [`src/gpx/gpxParser.js`](../src/gpx/gpxParser.js) oraz [`src/world/worldBuilder.js`](../src/world/worldBuilder.js) wdrożono zaawansowany silnik topografii i geometrii drogowej:

### 8.1. Odległościowy Filtr Gaussa dla Wysokości (*Spatial Gaussian Elevation Filter*)
Zamiast prostej średniej indeksowej, wysokość każdego punktu $i$ filtrowana jest w oknie odległości metrycznej $W = \pm 40\text{ m}$ z wagami Gaussa ($\sigma = 16.0\text{ m}$):
$$w_j = \exp\left(-\frac{(s_j - s_i)^2}{2 \sigma^2}\right), \quad \hat{y}_i = \frac{\sum_{j} w_j y_j}{\sum_{j} w_j}$$
Usuwa to szum barometryczny i schodkowanie GPS bez spłaszczania szczytów i przełęczy górskich.

### 8.2. Inżynieryjne Nachylenie Drogi i Ogranicznik Krzywizny Pionowej
Nachylenie szosy wyliczane jest na bazie symetrycznej cięciwy $28\text{ m}$ ($\pm 14\text{ m}$):
$$\text{Grade}_i = \frac{\hat{y}(s_i + 14) - \hat{y}(s_i - 14)}{28} \times 100\%$$
Zastosowano ogranicznik skoku nachylenia w pionie zgodny z normami inżynierii drogowej:
$$|\text{Grade}_i - \text{Grade}_{i-1}| \le 0.22\% \times \Delta s$$
Zapobiega to mikroskopijnym szumom GPS i nagłym szarpnięciom oporu trenażera FTMS.

### 8.3. Przechyłka Poprzeczna Szosy na Łukach (*Superelevation & Banking*)
Na łukach drogi siatka szosy i nasypu pochylają się poprzecznie do wnętrza zakrętu:
$$\text{Banking} = \text{clamp}(\kappa \cdot 8.5, -0.055, 0.055)$$
gdzie $\kappa = \frac{d\theta}{ds}$ to krzywizna pozioma. Wierzchołki szosy otrzymują przesunięcie pionowe:
$$y_{\text{left}} = y_{\text{center}} + 0.05 + \text{Banking} \cdot \frac{w}{2}, \quad y_{\text{right}} = y_{\text{center}} + 0.05 - \text{Banking} \cdot \frac{w}{2}$$
Pozycja kolarza, Ducha i botów AI uwzględnia to nachylenie na ich torze jazdy, utrzymując idealny kontakt opon z nawierzchnią.

### 8.4. Numeryczna Symulacja Prędkości Ducha GPX (Metoda Newtona-Raphsona)
Dla plików bez znaczników `<time>` prędkość wirtualnego rywala wyliczana jest numerycznie z równania oporów ruchu:
$$f(v) = \left[m g (\sin \theta + C_{rr} \cos \theta) + \frac{1}{2} \rho C_d A v^2\right] v - P_{\text{rider}} = 0$$
Rozwiązanie metodą Newtona-Raphsona gwarantuje fizycznie dokładne tempo (ok. 9.7 km/h na 10% przy 220W, a na zjazdach z grawitacyjnym wybiegiem do 75 km/h).
Dla plików z czasem GPS zaimplementowano filtr kompresujący postoje ($>10\text{ s}$ przy $ds < 4\text{ m}$) do 2 sekund, by rywal nie zamarzał na poboczu.

### 8.5. Histereza Sumy Przewyższeń i Standard ClimbPro UCI
1. **Histereza podjazdów:** Przewyższenie sumowane jest tylko dla trendów wznoszących przekraczających próg $0.6\text{ m}$, eliminując sztuczne zawyżanie sumy podjazdów (+m).
2. **Kategoryzacja podjazdów UCI / Tour de France:**
   * $\text{Score} = L \cdot \left(\frac{\text{grade}_{\text{avg}}}{100}\right) \cdot \text{grade}_{\text{avg}}$,
   * $\text{Score} > 350$ lub $\Delta H > 450\text{ m}$: **HC** (Hors Catégorie),
   * $\text{Score} > 180$ lub $\Delta H > 250\text{ m}$: **Kat. 1**,
   * $\text{Score} > 90$ lub $\Delta H > 140\text{ m}$: **Kat. 2**,
   * $\text{Score} > 40$ lub $\Delta H > 70\text{ m}$: **Kat. 3**,
   * pozostałe: **Kat. 4**.
3. **Kolorowanie sektorów:** profile wysokościowe na HUD i w menu kolorowane są według nachylenia (zielony $<3\%$, błękitny $3-6\%$, żółty $6-9\%$, pomarańczowy $9-13\%$, czerwony $>13\%$, szary zjazd).

---

## 9. Architektura Scenerii 3D, Kokpitu Napędu i Wykresów Mety

### 9.1. Tabela Uzębienia Napędu i Strefy Tętna HR Z1–Z5
W module [`src/physics/cyclingPhysics.js`](../src/physics/cyclingPhysics.js) zdefiniowano tablicę `VIRTUAL_GEAR_DETAILS` mapującą każdy z 24 biegów wirtualnych na fizyczną tarczę korby i zębatkę kasety:
* Bieg 1–11: Mała tarcza $34\text{T}$ z zębatkami od $34\text{T}$ do $14\text{T}$ (przełożenia $1.000$ do $2.429$),
* Bieg 12–19: Duża tarcza $50\text{T}$ z zębatkami od $19\text{T}$ do $12\text{T}$ (przełożenia $2.632$ do $4.167$),
* Bieg 20–24: Blaty $52\text{T}–56\text{T}$ z koronką $11\text{T}–12\text{T}$ (sprint i zjazdy, przełożenia do $5.091$).

Strefy tętna wyliczane są wg standardu kardiologicznego z tętna maksymalnego $HR_{\text{max}}$:
* Z1: $<60\% HR_{\text{max}}$ (Regeneracja aktywna),
* Z2: $60–70\% HR_{\text{max}}$ (Baza tlenowa),
* Z3: $70–80\% HR_{\text{max}}$ (Tempo),
* Z4: $80–90\% HR_{\text{max}}$ (Próg beztlenowy / mleczanowy),
* Z5: $>90\% HR_{\text{max}}$ (Maksimum wydolnościowe).

### 9.2. Waypointy GPX i Proceduralne Bramy Szczytowe
Parser GPX [`src/gpx/gpxParser.js`](../src/gpx/gpxParser.js) ekstrahuje tagi `<wpt>` (nazwa, wysokość, współrzędne) i rzutuje je na najbliższy kilometraż trasy. W module [`src/world/worldBuilder.js`](../src/world/worldBuilder.js) na wysokości każdego punktu orientacyjnego stawiana jest brama z tablicą Canvas 2D (`⛰️ NAZWA · WYSOKOŚĆ`).

### 9.3. Alpejskie Barierki Ochronne i Kamienie Milowe
1. **Kamienie milowe (`createMilestonePost`):** Co $1000\text{ m}$ trasy na poboczu generowany jest granitowy obelisk z żółtą kopułką i numerem kilometra (`KM 1`, `KM 2`...).
2. **Barierki ochronne (`createAlpineGuardrails`):** Na odcinkach o ekspozycji wysokościowej $>22\text{ m}$ nad dnem doliny oraz w ostrych łukach wzdłuż krawędzi szosy stawiane są drewniane słupki z podwójną belką ochronną, zapobiegając wrażeniu pustki nad urwiskiem.

### 9.4. Interaktywna Lupa Profilu i Wykres Mety
1. **Lupa profilu (*Profile Scrubber*):** Zdarzenia `pointermove` na canvasach profilu wyliczają odległość $s = \text{ratio} \cdot L$ i renderują kursor z dymkiem (`[km] · [wysokość] · [nachylenie]`).
2. **Wykres telemetryczny (`#finish-telemetry-canvas`):** Renderuje wieloliniowy przebieg przejazdu (Moc [W] na żółto, Tętno [BPM] na czerwono, Prędkość [km/h] na błękitno, Profil trasy na zielono) z obsługą kursora odczytu wartości w dowolnym punkcie trasy.

### 9.5. Skaner Ostrzeżeń Trasy (`scanUpcomingRoute`)
Funkcja analizuje geometrię drogi w oknie 20–220 m przed kolarzem:
1. **Zakręty i nawroty ($\ge 30^\circ$ skrętu):** Karta ostrzeżeń wyświetla ikonę strzałki skrętu, kierunek (np. *„Zakręt w prawo”*, *„Ostry nawrót w lewo”*) oraz zaokrąglony dystans (co 5 m). Usunięto nieadekwatne komunikaty instruujące hamowanie lub zwalnianie (`subtitle: ''`).
2. **Strome ścianki podjazdowe ($\ge 8.5\%$ nachylenia powyżej 30 m):** Wyświetla komunikat o ściance z dokładnym nachyleniem (np. *„Stromy podjazd +10,5%”*) oraz odległością w metrach (`subtitle: ''`). Zgodnie z dyspozycją użytkownika wyeliminowano wszelkie protekcjonalne porady typu „dobierz lżejszy bieg” lub „wyższy bieg”. Karta jest czystym wskaźnikiem telemetrycznym.

### 9.6. Inżynieryjne Zaokrąglanie Łuków Szosy (`smoothRouteHorizontalArcs`)
W module [`src/gpx/gpxParser.js`](../src/gpx/gpxParser.js) wprowadzono dwuetapowy rurociąg przekształcania wielokątnej łamanej GPS w łuki drogowe:
1. **Zagęszczanie próbek metrycznych:** Trasa jest resamplowana ze stałym krokiem $\Delta s = 4.0\text{ m}$.
2. **Poziomy filtr Gaussa dla współrzędnych $(x, z)$:**
   $$\hat{x}_i = \frac{\sum w_j x_j}{\sum w_j}, \quad \hat{z}_i = \frac{\sum w_j z_j}{\sum w_j}, \quad w_j = \exp\left(-\frac{(s_j - s_i)^2}{2 \sigma_{xz}^2}\right)$$
   gdzie $\sigma_{xz} = 13.0\text{ m}$, a promień okna to $30.0\text{ m}$.
   * Dla prostych odcinków punkty pozostają współliniowe bez zniekształceń.
   * Na zakrętach ostry kąt wierzchołka GPS zostaje zastąpiony ciągłym łukiem przejściowym (klotoidą), redukując maksymalny skok kąta stycznej z $49^\circ$ do poniżej $6^\circ$ i eliminując efekt „drogi z linijki”.
   * Dodatkowo wektor boczny `roadEdgeRight` uśredniany jest 3-punktowo, co zapewnia gładkie, obłe krawędzie asfaltu i linii pasów.

### 9.7. Kontrola kolizji scenerii z drogą i innymi obiektami

Aktualizacja z 28.10.2026 obejmuje `src/world/worldBuilder.js` i nowy moduł `src/world/sceneryPlacement.js`.

- **Całe segmenty drogi:** indeks przestrzenny w komórkach 24 × 24 m obejmuje wszystkie odcinki między kolejnymi próbkami trasy. Wykrywa przeszkody także między rzadkimi próbkami i przy odległych w kilometrażu serpentynach.
- **Gabaryty zamiast samego środka:** `addRoadsideObject` przekształca obwiednie poszczególnych siatek do współrzędnych świata, uwzględniając obrót i skalę. W rzucie poziomym sprawdzana jest ich otoczka wypukła, a w pionie zakres wysokości. To konserwatywne przybliżenie geometrii może odrzucić również obiekt, którego rzeczywista powierzchnia zmieściłaby się w danym miejscu.
- **Skrajnia:** dla drogi o szerokości 7,2 m test przyjmuje połowę szerokości plus 0,15 m zapasu. Kontrola pionowa uwzględnia przestrzeń do 2,5 m nad jezdnią. Oddzielne części bramy pozwalają zachować przejazd pod belką, bez traktowania całej bramy jako pełnej przeszkody.
- **Odstępy między obiektami:** po zatwierdzeniu miejsce zostaje zarezerwowane; następne obiekty są sprawdzane z zapasem 0,12 m. Dotyczy to m.in. drzew, skał, domków, znaków, lamp, płotków, namiotów i jezior. Dla kibiców rezerwowany jest obszar animacji, a dla turbin także przestrzeń obrotu wirnika.
- **Łączenia infrastruktury:** barierki, mury i tunele mogą stykać się w obrębie tego samego typu, jeśli ich przedziały dystansu `routeSpan` łączą się lub nakładają. Element z innego fragmentu serpentyny nie otrzymuje takiego wyjątku.
- **Kolejność rozmieszczania:** tunele są sprawdzane w całości przed dodaniem. Bramy i oznaczenia trasy rezerwują miejsce przed opcjonalną scenerią, a drzewa i skały wypełniają wolne przestrzenie na końcu. Dla drzew, skał i domków wstępny test może wybrać przeciwną stronę drogi; końcowy test odrzuca kolidujący obiekt.

Usunięto równoległe generowanie dwóch systemów barierek. Filary bram odsunięto poza asfalt, a barierki pomijają wnętrza tuneli. Liczniki `routeGroup.userData.placementStats` zawierają `placed`, `rejectedRoad` i `rejectedObject`; obejmują próby rozmieszczenia, również kontrole wstępne tuneli.

### 9.8. Wydajność wygładzania GPX i okna widoczności

W `smoothRouteHorizontalArcs` wskaźnik segmentu przesuwa się wzdłuż wejściowej trasy, zamiast rozpoczynać wyszukiwanie od początku dla każdej próbki. Poziomy filtr Gaussa odwiedza tylko próbki w lokalnym oknie. Dla stałego kroku 4 m i promienia 30 m ogranicza to pracę filtra do stałej liczby sąsiadów na punkt, zachowując parametry wygładzania oraz dokładne punkty startu i mety.

`updateVisibleWindow` zapamiętuje granice aktualnego zakresu próbek i sektora. Kolejne wywołanie z tym samym zakresem pomija ponowne obliczenia. Standardowe okno obejmuje 220 m za kolarzem i 2200 m przed nim; może zostać skrócone przy pobliskim powrocie trasy. Wykrywanie takiego powrotu uwzględnia różnicę wysokości poniżej 7 m. Poprawiono też zakresy rysowania przy mecie, aby nie wychodziły poza indeksy siatki.

Te zmiany dotyczą generowania i widoczności świata. Nie zmieniają fizyki treningu ani sterowania oporem BLE.

### 9.9. Testy regresji i zapis wyników

Z katalogu głównego projektu, przy zainstalowanych zależnościach `tools/3d` i przeglądarce Google Chrome:

```powershell
# W pierwszym terminalu, jeśli serwer nie jest jeszcze uruchomiony:
node server.js
```

```powershell
# W drugim terminalu:
node tools/3d/verify-route-world.mjs
```

Test obejmuje 7 tras × 3 poziomy jakości (`eco`, `medium`, `ultra`): cztery trasy wbudowane, `przelecz-gorska.gpx`, syntetyczne ciasne nawroty oraz prostą trasę długości 30 m. Sprawdza skończone współrzędne geometrii, zakresy rysowania przy mecie, zachowanie bram START/META, obecność scenerii i tuneli na łagodnej trasie, błędy konsoli oraz czas aktualizacji okna. Oddzielne przypadki regresji sprawdzają przeszkodę między rzadkimi próbkami, nakładanie obiektów, różnice wysokości, przejazd pod bramą i łączenia barierek. Dodatkowy pomiar dotyczy wygładzania syntetycznej trasy około 100 km.

W przebiegu z 28.10.2026 wszystkie **21 wariantów** przeszło testy bez błędów JavaScript. Budowa świata zajęła około **20–339 ms**, największy średni czas aktualizacji okna w jednym wariancie wyniósł około **0,022 ms**, a wygładzenie syntetycznej trasy około 100 km — **56 ms**. Są to pomiary lokalnego przebiegu w Chrome bez widocznego okna, nie pomiar pełnego czasu klatki ani gwarancja 60 FPS na każdym komputerze. Test nie dowodzi braku przecięć geometrii dla dowolnego pliku GPX.

Raport JSON i zrzut widoku jazdy zapisują się w `output/route-world/`.

### 9.10. Kibice 3D i tablica z logo OskiRide

Stan na 28.10.2026. OskiRide korzysta z 13 autorskich modeli kibiców low-poly, które zastępują wcześniejsze uproszczone postacie przy bufetach, szczytach KOM i mecie. Katalog, źródło Blender i podglądy znajdują się w [`grafika/kibice/`](../grafika/kibice/README.md).

| Model GLB | Gest lub wyróżnik |
| --- | --- |
| `01-machanie.glb` | Machanie, zielona czapka |
| `02-oklaski.glb` | Klaskanie |
| `03-szalik.glb` | Uniesiony szalik i okulary |
| `04-flaga.glb` | Flaga Polski i kucyk |
| `05-doping.glb` | Obie ręce w górze i podskok |
| `06-kibicka.glb` | Machanie i fryzura bob |
| `07-fotograf.glb` | Aparat, kapelusz i kamizelka |
| `08-dzwonek.glb` | Potrząsanie dzwonkiem, broda i szorty |
| `09-bidon.glb` | Doping z bidonem, kurtka i kucyk |
| `10-tablica.glb` | Uniesiona tablica z oficjalnym logo OskiRide |
| `11-mlody-kibic.glb` | Niższa sylwetka, bluza z kapturem i podskoki |
| `12-megafon.glb` | Megafon, siwa broda, okulary i kamizelka |
| `13-portret.glb` | Osobisty kibic: jasna koszula, napis Oski na plecach, brązowa fryzura, rudawa broda i machanie |

Każdy model ma jedną trzysekundową pętlę ruchu ze zgodnymi klatkami początku i końca. Animowane są sztywne segmenty w hierarchii węzłów, bez skórkowanego szkieletu. Pliki używają metrów, osi Y skierowanej w górę i przodu postaci w kierunku +Z; początek pojedynczego modelu znajduje się na ziemi między stopami. Wspólny `kibice-grupa.glb` zawiera całą trzynastkę, a `kibice.blend` pozwala edytować modele i animacje. Studio renderujące podglądy nie jest eksportowane do GLB.

**Osobisty wariant 13.** Model użytkownika jest budowany przez `tools/3d/spectator_portrait.py` na podstawie zdjęć referencyjnych. Po korekcie z 29.10.2026 twarz używa atlasu `13-twarz-albedo-v2.png` przygotowanego wbudowanym imagegen i osadzonego w GLB. `spectator_face.py` tworzy zakrzywioną powierzchnię twarzy z reliefem nosa i policzków; loader zachowuje jej UV i materiał z obrazem, zamiast łączyć go z siatkami kolorowymi. Test potwierdza dekodowanie obrazu i zachowanie mapowania. Oryginalne zdjęcie z otoczeniem nie jest osadzane w modelu. Ma własną geometrię twarzy, włosów i brody, jasną koszulę z długimi rękawami i zielonym napisem **Oski** na plecach oraz animację machania. Napis jest dopasowany do powierzchni koszuli i zachowuje kolor po łączeniu siatek. Podglądy: [przód](../grafika/kibice/13-portret-podglad.png), [twarz](../grafika/kibice/13-portret-twarz.png), [plecy](../grafika/kibice/13-portret-tyl.png).

**Logo na tablicy.** Kibicka `10-tablica` trzyma kremową tablicę z żółtym znakiem OR (`#F2C94C`) i zielonym napisem OskiRide (`#234C3B`). Kształty pochodzą z zatwierdzonych wzorców `grafika/marka-oskiride/druk-3d/oskiride-znak-OR.stl` oraz `oskiride-napis.stl`. Generator pobiera tylko ich przednie trójkąty, zachowując obrys i otwory liter. Logo jest częścią geometrii, więc nie wymaga pobierania tekstury ani specjalnej obsługi w rendererze. Model z tablicą ma 4486 trójkątów. [Zbliżenie kibicki z logo](../grafika/kibice/kibicka-logo.png).

**Rozmieszczanie.** `createFanZone` w `src/world/worldBuilder.js` próbuje ustawić do siedmiu par kibiców (liczba wynika z `ceil(SPECTATOR_DESIGNS.length / 2)`) wzdłuż drogi i wybiera kolejne warianty z pełnej trzynastki. Każda postać patrzy na szosę, otrzymuje wysokość z `getEmbankmentY` i trafia do sektora swojego dystansu. Tunele są pomijane. Przed asynchronicznym pobraniem GLB system `sceneryPlacement.js` rezerwuje obrys animacji; kolizje z drogą i innymi obiektami mogą zmniejszyć liczbę osób w strefie.

**Ładowanie i animacja.** `src/world/spectatorCrowd.js` buforuje szablony modeli w pamięci strony. Skrót zawartości z `modele.json` jest dodawany do adresu GLB, aby zmieniony model otrzymał nowy adres w pamięci podręcznej przeglądarki. Po aktualizacji zasobów należy odświeżyć otwartą grę, ponieważ już działająca strona nadal przechowuje załadowane szablony.

Moduł łączy statyczne powierzchnie według animowanego rodzica i zapisuje kolory materiałów jako kolory wierzchołków. Zachowuje bezpośrednio animowane węzły rekwizytów. W rezultacie postać ma 4–5 siatek; kopie współdzielą geometrię i materiał, ale mają własne węzły, miksery, fazy i tempo ruchu. `animateSpectators` jest wywoływane z `src/main.js`. Pozycję przy trasie przechowuje nadrzędna grupa, więc lokalny podskok zapisany w GLB nie nadpisuje wysokości ustawienia postaci.

| Jakość grafiki | Zasięg widoczności przed kolarzem | Za kolarzem | Rzucanie cieni |
| --- | ---: | ---: | --- |
| Eco (`eco`) | 140 m | 90 m | Nie |
| Standard (`medium`) | 300 m | 90 m | Nie |
| Ultra (`ultra`) | 500 m | 90 m | Tak |

Animacje poza zasięgiem lub w ukrytych sektorach nie są aktualizowane. Przebudowa trasy albo zmiana jakości zwalnia stare miksery; zakończenie opóźnionego pobierania nie dodaje postaci do nieaktualnego świata. W razie błędu pobierania wyświetlana jest uproszczona postać zastępcza i zapisywane ostrzeżenie w konsoli.

**Odtworzenie i kontrola.** Polecenia uruchamia się z katalogu głównego projektu, po przygotowaniu lokalnego Blendera zgodnie z [`tools/3d/README.md`](../tools/3d/README.md). Generator nadpisuje własne GLB, manifest i plik Blender; przed ręczną edycją modelu należy zachować osobną kopię.

```powershell
./tools/3d/blender.ps1 --background --python-exit-code 1 --python tools/3d/build-spectators.py
node tools/3d/validate-spectators.mjs
```

Po uruchomieniu serwera `node server.js` test silnika można wykonać w drugim terminalu:

```powershell
./tools/3d/node_modules/.bin/playwright-cli.cmd -s=spectators open http://localhost:8080
./tools/3d/node_modules/.bin/playwright-cli.cmd -s=spectators run-code --filename tools/3d/verify-spectators.browser.js --raw
./tools/3d/node_modules/.bin/playwright-cli.cmd -s=spectators close
```

Walidacja glTF objęła 13 pojedynczych modeli i wspólny plik grupy: **0 błędów i 0 ostrzeżeń**. Sprawdza również czas i zamknięcie pętli, skalę oraz położenie modeli nad ziemią. Wyniki: [`walidacja.json`](../grafika/kibice/walidacja.json).

Test Three.js porównuje obrys wierzchołków oryginalnych i zoptymalizowanych modeli w kilku chwilach animacji, sprawdza współdzielenie zasobów, niezależność mikserów, pomijanie animacji ukrytych osób, położenie na poboczu, kierunek twarzy, przypisanie do sektorów, omijanie tuneli oraz sprzątanie po zmianie świata. W zapisanym przebiegu z 28.10.2026 różnica obrysów nie przekroczyła `6,7 × 10⁻⁸ m`, a maksymalna liczba siatek na postać wyniosła 5.

| Trasa testowa | Jakość | Rozmieszczeni kibice | Różne warianty |
| --- | --- | ---: | ---: |
| `mountain` | Standard | 38 | 13 |
| `mountain` | Eco | 38 | 13 |
| `mountain` | Ultra | 38 | 13 |
| `switchbacks` | Standard | 56 | 13 |
| `rolling` | Standard | 74 | 13 |
| `flat` | Standard | 26 | 13 |

Źródło wyników: [`walidacja-runtime.json`](../grafika/kibice/walidacja-runtime.json). Liczba osób może zmienić się między przebiegami, ponieważ losowo rozmieszczona sceneria wpływa na wolne miejsca. Ten test potwierdza działanie modeli i integracji w wymienionych przypadkach; nie jest pomiarem pełnej wydajności klatek ani gwarancją braku kolizji dla dowolnego GPX. [Podgląd całego zestawu](../grafika/kibice/podglad.png), [widok w grze](../grafika/kibice/w-grze.png).

## 10. Pakiet Realizmu 1–5: Biomechanika, Akustyka Napędu, Grand Tour, Wektor Wiatru i Akustyka Przestrzenna

### 10.1. Dynamiczna Biomechanika Kolarza (Standing Climb & Aero Tuck)
W modułach [`src/physics/cyclingPhysics.js`](../src/physics/cyclingPhysics.js) oraz [`grafika/kinematyka.js`](../grafika/kinematyka.js) zaimplementowano płynne przejścia stanu kolarza:
1. **Jazda na stojąco z siodełka (*Standing Climb*):**
   * **Warunek aktywacji animacji od 30.10:** podjazd od 8% albo wykryty zryw mocy względem ostatnich sekund i FTP. Sprint działa także przy wysokiej kadencji; nie bazuje już na dawnym warunku `320 W + kadencja <74 RPM`. Detektor i filtry opisano w sekcji 12 oraz raporcie sprintu.
   * **Kinematyka 3D:** Uniesienie miednicy w górę ($\Delta y = +0.13\text{ m}$), przesunięcie bioder do przodu ($\Delta z = +0.08\text{ m}$), wyprost tułowia oraz dynamiczny kołys boczny roweru `standSway` zsynchronizowany z fazą obrotu korby:
     $$\text{standSway} = \sin(\text{crankAngle}) \cdot 0.088\text{ rad} \approx 5.0^\circ$$
2. **Pozycja aerodynamiczna na zjazdach (*Aero Tuck*):**
   * **Warunek aktywacji:** $\text{nachylenie} \le -3.8\% \wedge v > 13.5\text{ m/s} \; (48.6\text{ km/h})$.
   * **Aerodynamika:** Redukcja powierzchni czołowej $C_d A$ o $14\%$ ($C_d A_{\text{tuck}} = C_d A \cdot 0.86$), co pozwala kolarzowi naturalnie osiągać prędkości $65–80\text{ km/h}$ na alpejskich zjazdach bez pedałowania.
   * **Kinematyka 3D:** Obniżenie tułowia na kierownicę ($\Delta y = -0.15\text{ m}$, pochylenie klatki piersiowej do przodu).

### 10.2. Wyciszenie Syntetycznych Dźwięków Jazdy
Zgodnie z dyspozycją użytkownika wyłączono wszelkie generatory syntetycznego audio (szum wiatru, szum opon, dźwięk wolnobiegu, dzwonki pasterskie i pogłos tunelu). Kolarz trenujący w domu na trenażerze Smart odbiera wyłącznie naturalne, autentyczne dźwięki napędu własnego roweru, trenażera i wentylatora, bez sztucznych dźwięków emitowanych z głośników komputera.

### 10.3. Klimat Wyścigów Grand Tour (Tour de France / Giro d'Italia)
W module [`src/world/worldBuilder.js`](../src/world/worldBuilder.js):
1. **Malowane kredą napisy na stromych ściankach:**
   * Na każdym odcinku o nachyleniu $\ge 8.5\%$ generowane są kredowe napisy kibiców (*„ALLEZ! ⚡”*, *„HOP! HOP! HOP!”*, *„DAJESZ NA STOJĄCO!”*, *„BRAWO! 🚴”*, *„ATTAQUE! 💥”*, *„OGIEŃ! 🔥”*).
   * Tekstury Canvas 2D renderowane są z cieniem asfaltowym (`shadowBlur = 4`) i autentyczną paletą kolorów Grand Tour: kredowa biel, żółć Tour de France (`#facc15`), róż Giro d'Italia (`#f43f5e`) oraz błękit nieba (`#38bdf8`).
2. **Podwójne szewrony ostrzegawcze na łukach:**
   * Przed ostrymi zakrętami ($\ge 34^\circ$) stawiane są dwie tablice: ostrzeżenie wstępne ($28\text{ m}$ przed szczytem łuku) oraz szewron wejściowy wierzchołka ($6\text{ m}$ przed).

### 10.4. Wektor Wiatru Atmosferycznego i Aerodynamika Kierunkowa
1. **Fizyka oporu z wiatrem:**
   * Azymut wiatru $\theta_{\text{wind}}$ (domyślnie $220^\circ$ SW) i prędkość $v_{\text{wind}} = 4.2\text{ m/s}$ ($15.1\text{ km/h}$).
   * Kąt względny strug: $\Delta\theta = \theta_{\text{heading}} - \theta_{\text{wind}}$.
   * Składowa czołowa: $v_{\text{head}} = v_{\text{wind}} \cos\Delta\theta$ (dodatnia pod wiatr, ujemna z wiatrem).
   * Pozorna prędkość powietrza: $v_{\text{app}} = \max(0, v_{\text{rider}} + v_{\text{head}})$.
   * Siła oporu aerodynamicznego:
     $$F_{\text{aero}} = \frac{1}{2} \rho(h) \cdot C_d A \cdot v_{\text{app}}^2 \cdot \left(1 + 0.18 |\sin\Delta\theta| \frac{v_{\text{wind}}}{v_{\text{app}} + 0.1}\right)$$
2. **Interfejs HUD i Minimapa:**
   * Panel HUD (`#hud-wind`) wyświetla pigułkę z kierunkiem i siłą wiatru: zielona (⬇️ z wiatrem), czerwona (⬆️ pod wiatr), żółta (↔️ wiatr boczny).
   * Róża wiatrów na minimapie rysuje błękitną strzałkę wektora rzeczywistego wiania wiatru.

### 10.5. Detekcja Przestrzenna Środowiska 3D
1. **Wykrywanie tuneli górskich 3D:**
   * Wykrywanie przebywania kolarza wewnątrz tunelu realizowane jest w czasie $O(1)$ na podstawie tablicy przedziałów `state.tunnelIntervals`, służąc do kontroli oświetlenia, widoczności scenerii i efektów kamery.

### 10.6. Bezwarunkowe Wykluczenie Wirtualnych Hamulców
Zgodnie z wyraźną, bezwzględną dyspozycją użytkownika (*„Nigdy nie rob hamulców”*), w projekcie OskiRide:
* Nie implementuje się żadnych wirtualnych hamulców ani układów sztucznego spowalniania roweru na zjazdach/zakrętach.
* Brak jakichkolwiek skrótów klawiszowych, przycisków na kontrolerach Zwift Play czy przycisków dotykowych odpowiedzialnych za hamowanie.
* Kolarz kontroluje prędkość wyłącznie fizyką oporów ruchu, aerodynamiką i własną mocą na trenażerze.

## 11. Zaawansowana Architektura Łączności Rider – Trenażer Smart (FTMS 1–4)

### 11.1. Auto-Reconnect z Exponential Backoff i Keep-Alive
W module [`src/ble/trainerController.js`](../src/ble/trainerController.js) zaimplementowano automat ponownego łączenia sesji GATT w przypadku zerwania łączności radiowej (`gattserverdisconnected`):
* Kolejne próby wykonywane są w tle z progresywnym opóźnieniem:
  $$t_{\text{backoff}} = \min\left(1500 \cdot 1.55^{k-1}, 14000\right)\text{ ms}, \quad k \in \{1, \dots, 6\}$$
* Po udanym ponownym połączeniu subskrypcje charakterystyk `0x2ad2` (Indoor Bike Data) oraz żądanie kontroli `0x2ad9` (Control Point) są rekonfigurowane, a aktualne nachylenie szosy natychmiast synchronizowane.

### 11.2. Bezstratna Kolejka Zapisu BLE (Non-blocking Queued Writes)
* Rozwiązano problem błędów stosu BLE Windows (`GATT operation already in progress`).
* Wprowadzono asynchroniczną maszynę stanów z flagą `isWritingBle` oraz buforem `pendingSimulationBuffer`.
* Wszelkie pakiety oporu nadsyłane w trakcie trwającej transmisji radiowej są buforowane i wysyłane natychmiast po jej zakończeniu z bezpiecznym interwałem ochronnym $45\text{ ms}$, gwarantując 0% utraconych zmian oporu.

### 11.3. Inteligentny Filtr Chwilowych Zaników Mocy (Anti-Dropout Deadman Buffer)
* W pakietach `Indoor Bike Data` (0x2ad2) i `Cycling Power` (0x1818) wprowadzono filtr bezwładności:
  * Jeśli moc wynosi $0\text{ W}$, ale kadencja $> 20\text{ RPM}$ i od ostatniego odczytu minęło $< 1.3\text{ s}$, pakiet jest klasyfikowany jako zakłócenie radiowe i moc jest podtrzymywana z subtelnym wygaszaniem ($P = 0.96 \cdot P_{\text{last}}$).
  * Dopiero gdy kadencja spadnie do zera przez $> 1.2\text{ s}$ lub upłynie $> 2.0\text{ s}$ bez danych, moc zostaje wyzerowana.

### 11.4. Pełna Ramka Fizyczna FTMS OpCode 0x11
Format 7-bajtowej ramki zadawania parametrów symulacji drogowej:
* **Bajt 0:** `0x11` (OpCode: Set Indoor Bike Simulation Parameters).
* **Bajt 1–2 (Wind Speed):** Składowa wzdłużna wiatru `state.windHeadwindMps` w jednostkach $0.001\text{ m/s}$ (SInt16 little-endian, zakres $-32768$ do $+32767$).
* **Bajt 3–4 (Grade):** Nachylenie drogi `effectiveGrade` po wygładzeniu rampy i wirtualnych biegach w jednostkach $0.01\%$ (SInt16 little-endian).
* **Bajt 5 (Crr):** Współczynnik oporu toczenia $C_{rr} \cdot 10000$ (UInt8, typowo $38$ dla $0.0038$).
* **Bajt 6 (Cw):** Współczynnik oporu aerodynamicznego $C_w = C_d A \cdot \rho(h) \cdot 100$ (UInt8, z uwzględnieniem wysokości n.p.m. wg ISA).


---

## 10. Zaawansowane funkcje treningowe, sensoryczne i wizualne (Pakiet 1–5)

### 10.1. Silnik Treningów Ustrukturyzowanych (`src/workouts/workoutEngine.js`)
* **Obsługiwane formaty plików:**
  * **XML .ZWO (Zwift Workout / TrainingPeaks):** parsowanie bloków `<warmup>`, `<cooldown>`, `<SteadyState>`, `<Ramp>`, `<IntervalsT>` oraz `<FreeRide>`.
  * **Format tekstowy .MRC / .ERG (CompuTrainer):** parsowanie sekcji `[COURSE HEADER]` oraz `[COURSE DATA]`.
* **Wbudowane presety kolarskie:**
  1. *Sweet Spot 2×15 min* (50 min, budowa progu FTP i bazy tlenowej),
  2. *VO2 Max 5×3 min* (43 min, praca na 115% FTP),
  3. *Tabata HIIT 2×(40/20s)* (30 min 20 s, beztlenowe mikro-interwały 125% FTP),
  4. *Over-Unders 2×9 min* (38 min, falowanie 95%/105% FTP; zachowany wewnętrzny identyfikator `over-unders-3x9`),
  5. *Baza Tlenowa Z2* (60 min @ 68% FTP).
* **Sterowanie trybem ERG:** Automatyczne nadawanie mocy docelowej w watach do trenażera (`setTargetPowerWatts` w FTMS OpCode `0x05`, Tacx Page 49 lub Wahoo OpCode `0x42`).
* **Widget HUD:** Pasek treningu `#workout-banner` wyświetlający czas pozostały w bloku, zadaną moc, zadaną kadencję, numer powtórzenia i pasek postępu w barwach stref Coggana Z1–Z7, zgodnych z bieżącym HUD.

### 10.2. Wielourządzeniowa matryca parowania BLE (Multi-Device BLE Matrix)
* Niezależne kafelki parowania w menu:
  * **Trenażer FTMS** (`0x1826` / Tacx UART / Wahoo),
  * **Miernik mocy BLE** (`0x1818` CPS — pedały Assioma/Garmin Rally, korby Stages/Inpeak/4iiii, pająki Quarq),
  * **Czujnik kadencji i prędkości** (`0x1816` CSCP),
  * **Pulsometr** (`0x180D` HRM),
  * **Manetki Zwift Click** (V1 oraz lewa i prawa V2).

### 10.3. Taktyczne AI Pacerów i Wizualizacja Tunelu Aerodynamicznego (3D Drafting Ribbon)
* **Pacer A (Climber 4.2 W/kg):** Atakuje na podjazdach ($>1.5\%$) generując do $+35\%$ watów, a na zjazdach obniża moc o $25\%$.
* **Pacer C (Grupa 2.5 W/kg):** Dostosowuje tempo do gracza — utrzymuje stabilną moc w strefie draftingowej ($0.8\text{ m} < \text{gap} < 12.0\text{ m}$), zwalnia o $10\%$ gdy gracz lekko traci koło ($12\text{ m} < \text{gap} < 35\text{ m}$) i kontratakuje po wyprzedzeniu.
* **3D Drafting Stream Ribbon (`draftingRibbonMesh`):** Geometryczna wstęga Three.js łącząca tylne koło pacera z przednim kołem gracza w tunelu aero. Zawiera falowanie sinusoidalne, blendowanie addytywne i błękitną poświatę.

### 10.4. Dynamiczna Pora Dnia i Szosowa Lampka LED 3D
* **Tryb `dynamic`:** Płynna interpolacja oświetlenia w funkcji dystansu trasy od południowego słońca (`0x68a4d8`) przez złote popołudnie (Golden Hour `0xea580c`) po zmierzch (`0x1e293b`).
* **Reflektor Three.js `SpotLight` (`bikeSpotLight`):** Mocowany na kierownicy awatara gracza ($42\text{ m}$ zasięgu, barwa ciepła $0\text{xfffaee}$). Aktywuje się automatycznie po wjeździe w tunel skalny oraz przy zachodzie słońca i w nocy.

### 10.5. Live KOM & PR Challenger (Pasek Holenderskiej Wstążki)
* Aktywny na podjazdach ClimbPro (`#climbpro-challenger`).
* Wylicza w czasie rzeczywistym dystansową i czasową deltę do wirtualnego rywala / rekordu trasy (zielony badge `ahead` np. `+42 m (−4.2 s)` lub czerwony `behind`) oraz pozostałe przewyższenie do zdobycia szczytu (`+X m w pionie`).


## 12. Cztery modele kolarza i wspólna kinematyka

Runtime przechodzi przez `src/world/cyclistAvatar.js` do `grafika/kolarz.js`. Ten adapter wczytuje GLB i odwzorowuje ruch jednego solvera `grafika/kinematyka.js` na szkielet i elementy roweru. Velocity, Alpine, Nocturne i Heritage różnią się wyglądem; mają wspólne zasady ruchu.

Jednostka to metr, oś Y jest skierowana w górę, +Z do przodu. Przy dodatniej kadencji faza korby maleje, dzięki czemu przedni pedał opada. Wersja modelu jest pobierana z `grafika/modele.json` i dopisywana do URL zasobu jako skrót zawartości. Modele mają ciągłą geometrię spodenek zamiast oddzielnej owalnej bryły bioder. GLB zawiera również podglądowy klip `Pedal_Seated_60rpm`; w grze szkieletem steruje solver na żywo.

Porównanie 2×2 w `grafika/index.html` współdzieli kamerę, kadencję, pozycję i pauzę. Wybór wyglądu zapisuje się pod `oskiride-cyclist-design`. Edytowalna scena: `grafika/kolarz.blend`. Generator: `tools/3d/build-cyclists.mjs`, odtworzenie sceny: `grafika/przygotuj_blendera.py`.

Od 30.10 solver wykrywa sprint z bieżącej mocy, krótkiego filtra i wolniejszej bazy wysiłku, z progami względem FTP, czasem potwierdzenia i podtrzymaniem. `sprintBlend` pochyla tułów i wzmacnia zsynchronizowany z korbą ruch wspólnego pivotu postaci i roweru. Na wprost przy ustalonej jeździe siedzącej dodatkowy ruch boczny jest zerowy. `roadLeanApplied` zapobiega powtórzeniu pochylenia, które główna gra nadała już całej grupie. Wstawanie od 8% pozostaje osobną regułą. Weryfikacja obejmowała cztery wyglądy i próbę suwakiem w grze.

## 13. Rozszerzony kontroler trenażera i ustawienia

`trainerController.js` zawiera FTMS, CPS, HRM, CSC, Tacx FE-C przez BLE i Wahoo Direct. Są odrębne metody parowania głównego urządzenia, miernika mocy i czujnika kadencji. Krzywe Fluid, Magnetic, Rollers i Spinbike pozwalają obliczać moc wirtualną z prędkości; wartości te pozostają oszacowaniem. Sam czujnik prędkości lub mocy nie zapewnia sterowania oporem.

Kod ma obsługę kolejki zapisu, ponawiania głównego połączenia, krótkich zaników telemetrycznych i dodatkowych parametrów trenażera. Ustawienia wygładzania mocy 1/3/5 s, reakcji nachylenia, profilu przełożeń, limitu zjazdowego i rampy ERG są zapisywane pod `oskiride_trainer_settings_v2`. Nie utożsamiać tej konfiguracji z potwierdzeniem dowolnego firmware urządzenia.

Od 29.10.2026 kontroler ma jawny efektywny tryb SIM/ERG. Zmiana trybu anuluje rampę i oczekujące komendy poprzedniego trybu; wpisy kolejki zawierają protokół i generację sterowania. Zapis już przekazany do GATT może się zakończyć, ale stary oczekujący zapis nie jest ponawiany. Trening czasowo nadpisuje wybór ręczny, FreeRide wybiera SIM, a koniec planu przywraca ręczny tryb. Przed startem sesji, po zakończeniu i podczas kalibracji nie są generowane polecenia jazdy. Przepływ sprawdzono z mockiem BLE; Control Point, dobór protokołu i realna reakcja nadal wymagają próby sprzętowej.

## 14. Treningi ZWO, MRC i ERG

Wybór efektywnego trybu i harmonogram komend wydzielono do `src/workouts/trainerMode.js`. Formatowanie polskich liczb i czasu jest w `src/ui/formatters.js`; obliczenia, wartości opcji i eksporty pozostają w formacie liczbowym. `main.js` nadal integruje scenę i UI, lecz odświeżenie samego HUD nie wysyła komend BLE.

`src/workouts/workoutEngine.js` eksportuje bibliotekę pięciu planów, `parseZwoWorkout`, `parseMrcWorkout` i `getWorkoutStateAtTime`. W głównym kodzie są import, wybór, start i zakończenie planu, zegar oraz panel kroku z celem mocy i kadencji. Zegar przyrasta podczas ruchu kolarza. Automatyzacja ERG wysyła cel po zmianie albo po około 1,5 s.

ZWO obejmuje podstawowe bloki rozgrzewki, schłodzenia, stałej mocy, ramp, interwałów i swobodnej jazdy. `parseMrcWorkout(content, format)` obsługuje MRC w procentach FTP oraz ERG w watach: jednostkę określa nagłówek MINUTES PERCENT/WATTS, a przy braku nagłówka wskazówka rozszerzenia ERG. Moc absolutna jest przechowywana w polach powerWatts/powerLowWatts/powerHighWatts i nie zmienia się po zmianie FTP. Puste, ujemne lub nieuporządkowane dane są odrzucane. Import wybiera plan; rozpoczęcie wymaga przycisku. Czas planu jest sumą bloków, HUD otrzymuje aktywny blok i numer kroku liczony od 1. Sesja nie nalicza czasu, dystansu ani energii przed startem. Przewinięcie GPX ustawia osobne przesunięcie czasu rywala, bez dopisywania czasu do sesji użytkownika.

## 15. Parowanie i test Zwift Click

**Urządzenia → Manetki Bluetooth** umożliwia bezpośrednie parowanie Click V1 oraz każdej strony Click V2. Po wybraniu modelu użytkownik otwiera wybór urządzeń przyciskiem **Połącz manetkę**. [Instrukcja parowania](../wiki/Manetki-Zwift-Click.md)

[`shifter-preload.cjs`](../shifter-preload.cjs) udostępnia wybór urządzenia Bluetooth w Electron. Test manetek pokazuje stan każdej strony, podświetla odebrany przycisk i wyświetla jego przypisanie. W czasie testu wejście trafia do diagnostyki. [Test manetek](../wiki/en/Equipment.md#zwift-click-keyboard-and-gamepad)

## 16. Kibice, marka i materiały

Trzynaście modeli kibiców (w tym osobisty wariant 13 z napisem Oski) i animacje znajdują się w `grafika/kibice/`. `spectatorCrowd.js` ładuje i optymalizuje zasoby, utrzymuje własne miksery postaci oraz aktualizuje widoczne strefy. Rozmieszczenie korzysta z kontroli obrysów scenerii; szczegóły i raporty zawiera [README kibiców](../grafika/kibice/README.md).

Marka Słońce i las korzysta z żółtego #F2C94C, zielonego #234C3B, kremu #FBF5EA i ciemnego #172B23. Logo źródłowe, paleta i motyw są w `grafika/marka-oskiride/`. W podfolderze `druk-3d/` są STL, 3MF, SVG, archiwum i instrukcja drukowania. Zasoby pozostają własnymi materiałami projektu.

Skaner ostrzeżeń zwraca pusty podtytuł. Pozostają informacja o podjeździe lub zakręcie oraz dystans, bez „Dobierz lżejszy bieg” i „Zwolnij”.

## 17. Odtwarzanie, testy i wspólna dokumentacja

[Instrukcja testów](../wiki/en/Troubleshooting.md#run-the-regression-tests) opisuje testy modułów aplikacji oraz próby sprzętowe. Historyczne raporty zachowują swój zakres.
