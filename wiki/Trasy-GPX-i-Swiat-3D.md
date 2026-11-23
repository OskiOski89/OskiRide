# 4. Trasy GPX i świat 3D

W wersji angielskiej trasy wybierzesz w **Ride**, a własny ślad wczytasz przez **Import GPX**. Biblioteka to **My GPX routes**.

OskiRide przekształca zapisane ślady GPS (`.gpx`) oraz wbudowane trasy w trójwymiarowy świat szosowy z dynamicznym oświetleniem PBR, górami, tunelami, kibicami i pełną kinematyką kolarza.

---

## Trasy wbudowane i Biblioteka własnych tras GPX

### 5 tras wbudowanych w **Ride**

1. **Alpine Pass (`mountain`)** — klasyczna trasa górska z podjazdami, tunelami i serpentynami.
2. **Alpe d’Huez (`alpedhuez`)** — podjazd na podstawie śladu GPX z 21 ponumerowanymi nawrotami i kategorią **HC**. Karta trasy pokazuje ok. 13,9 km.
3. **Winding Switchbacks (`switchbacks`)** — techniczna trasa z gęstymi zakrętami i przechyłką drogi.
4. **Interval Valley (`rolling`)** — pofałdowana trasa szosowa do treningu zmiennego tempa.
5. **Flat Time Trial (`flat`)** — płaska trasa do jazdy na czas.

### Biblioteka własnych tras w **Ride → My GPX routes**

- Każdy poprawnie zaimportowany plik `.gpx` (przez przycisk lub przeciągnięcie na okno) jest automatycznie zapisywany lokalnie w bazie **IndexedDB** (bez limitu 20 tras).
- Dostępne są własne nazwy, oznaczanie **Ulubionych**, wyszukiwanie, filtrowanie, podgląd dystansu, przewyższenia i liczby skategoryzowanych podjazdów oraz przycisk **Przejazdy** otwierający historię danej trasy w Dzienniku postępów.
- Identyczna zawartość pliku GPX nie tworzy duplikatu i zachowuje nadaną nazwę oraz status ulubionej trasy.
- Suwak przed startem oraz interaktywny profil wysokościowy pozwalają rozpocząć jazdę z dowolnego kilometra trasy.

---

## Przetwarzanie GPX i kategoryzacja podjazdów (`src/gpx/gpxParser.js`)

- **Odległościowy filtr Gaussa wysokości n.p.m.:** wygładza schodkowe błędy wysokościomierzy barometrycznych i GPS w promieniu metrycznym wzdłuż trasy, zachowując autentyczne szczyty przełęczy.
- **Nachylenie z bazy cięciwy:** wyliczane na symetrycznym odcinku drogi, co eliminuje sztuczne jednopunktowe „ściany” oporu na trenażerze.
- **Kategorie podjazdów (HC, Kat. 1–4):** automatyczna detekcja wzniesień z bramami **👑 KOM** na szczytach i strefami kibiców.

---

## Świat 3D, oświetlenie PBR i automatyczna grafika

- **Kopuła nieba 3D (`src/world/skyEnvironment.js`) i oświetlenie PBR:**
  - Trzy pory dnia: **Dzień**, **Zachód słońca** i **Noc**.
  - Proceduralny gradient atmosferyczny Rayleigh/Mie, tarcza słoneczna lub księżycowa, dwuwarstwowe chmury (Cumulus i Cirrus), gwiazdy w nocy oraz cząsteczki atmosferyczne GPU (`OskiRide_AtmosphericMotes`).
  - Prefiltrowane mapy środowiskowe PBR (`THREE.PMREMGenerator`) nadające realistyczne odbicia na lakierze ramy, karbonie, metalu i wizjerze kasku.
- **Droga, teren i sceneria (`src/world/worldBuilder.js`, `sceneryPlacement.js`):**
  - Asfalt z mapą szorstkości (`roughnessMap`), pobocza z teksturą darni i skał, rzeźbione masywy alpejskie ze żlebami śnieżnymi, świerki i omszałe głazy z cieniowaniem wierzchołkowym (`vertexColors`), tunele górskie, barierki, słupki kilometrowe i poświata latarni.
  - Podświetlone bramy LED **START / KOM / META** (`src/world/routeArches.js`).
  - Indeks przestrzenny `sceneryPlacement.js` gwarantuje brak kolizji drzew, skał i budynków z jezdnią (także na ciasnych serpentynach).
- **Efekty prędkości:** powyżej $48\text{ km/h}$ oraz podczas sprintu pojawiają się przestrzenne linie pędu powietrza (`OskiRide_SpeedLines`) oraz dynamiczne poszerzenie pola widzenia kamery (FOV).
- **Automatyczne dopasowanie grafiki.** Opcja monitoruje czas klatki podczas jazdy. Przy utrzymujących się spadkach płynności ogranicza cienie i daleką scenerię, a gdy FPS się ustabilizuje, stopniowo wraca do wybranego presetu **Low**, **Standard** lub **High**.

---

## 4 modele kolarza, kinematyka i 12 kibiców 3D

### Cztery warianty kolarza i roweru (`grafika/`)

Dostępne w grze oraz w porównywarce 2×2 pod adresem `http://localhost:8080/grafika/index.html`:
- **01 Velocity** (`kolarz-01-velocity.glb`) — miedziany strój, jasna rama, kask szosowy.
- **02 Alpine** (`kolarz-02-alpine.glb`) — leśna zieleń, wentylowany kask górski.
- **03 Nocturne** (`kolarz-03-nocturne.glb`) — granat ze złotymi liniami, kask aero, wysokie stożki.
- **04 Heritage** (`kolarz-04-heritage.glb`) — kremowy strój klubowy, klasyczna czerwona rama.

### Wspólna kinematyka (`grafika/kinematyka.js`, `src/world/roadLean.js`)

- **Pedałowanie i wybieg 1:1:** faza korby reaguje bez opóźnień na kadencję, a po zaprzestaniu pedałowania podczas jazdy korba płynnie poziomuje się w pozycji spoczynkowej (godzina 3:00 i 9:00).
- **Sprint po skoku mocy:** detektor wykrywa gwałtowny wzrost mocy względem ostatnich sekund i FTP (również przy wysokiej kadencji), płynnie podnosi kolarza z siodła i uruchamia kołysanie roweru; podczas równej jazdy w siodle sylwetka pozostaje stabilna.
- **Przechył w zakrętach (`roadLean.js`):** kolarz, duchy i pacerzy pochylają się do wnętrza zakrętu zgodnie z fizycznym wzorem $\arctan(v^2 \cdot \kappa / g)$ wyliczanym z rzeczywistej krzywizny szosy (z limitem $35^\circ$).

### 12 animowanych kibiców 3D (`grafika/kibice/`, `src/world/spectatorCrowd.js`)

- W strefach bufetów, na szczytach KOM i przed metą stoi 12 wariantów animowanych kibiców (machanie, oklaski, szalik, flaga Polski, podskoki, aparat, dzwonek, bidon, tablica z oficjalnym logo **OR OskiRide**, megafon).
