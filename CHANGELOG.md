# Dziennik zmian (Changelog) — OskiRide

Wszystkie istotne zmiany, funkcje i weryfikacje w projekcie **OskiRide** są dokumentowane w tym pliku.
Format oparty jest na zasadach [Keep a Changelog](https://keepachangelog.com/).

- **GitHub Wiki (dokumentacja użytkownika i architektura):** [wiki/Home.md](wiki/Home.md)
- **Dokumentacja techniczna:** [Opis implementacji](docs/DOKUMENTACJA_TECHNICZNA.md)

---

## [1.0.1] — 2026-11-23

- Restricted the source server to loopback and to the files needed by the app and its bundled previews.
- Isolated desktop windows and restricted navigation, Bluetooth selection, and renderer messages to the app views that use them.
- Enabled integrity verification for the packaged Electron archive and disabled unused Node execution and debugging options in the packaged binary.
- Added documentation on locally stored ride data, exported files, and diagnostic logs. [Privacy and ride data](wiki/en/Privacy.md)
- Refreshed the GitHub README with a branded cover and ride preview, organized the nine screenshots by ride stage, and moved download links to the top of the release notes. [Screenshots](wiki/en/Screenshots.md) · [Release notes](docs/Release-Notes.md)
- Refined the README cover with a subtler forest-green background.
- Added a hardware compatibility table with verification status and prepared a 1280 × 640 image for shared repository links. [Hardware compatibility](wiki/en/Equipment.md#hardware-compatibility)
- Updated repository, download, and image links after the GitHub account rename.
- Added a short explanation of the idea behind OskiRide to the README.
- Clarified the README heading and repository description to identify OskiRide as a Windows indoor cycling simulator.
- Added a trainer-test form for Windows pairing, SIM, and ERG results, plus a short [roadmap](ROADMAP.md).
- Prioritized physical hardware coverage and more faithful GPX route reconstruction in the roadmap.
- Shortened the ride demo ending and removed a brief camera flash from the GitHub video and README preview.

## [1.0.0] — 2026-11-23

- Consolidated release media under `docs/media/` and moved regression checks into `tests/consistency/`.
- Przygotowano pierwsze wydanie dla Windows x64 z instalatorem NSIS i sumą SHA-256.
- Uzupełniono opis wydania i instrukcję instalacji o komunikat SmartScreen oraz sposób sprawdzenia sumy SHA-256 przed uruchomieniem.
- Opublikowano przewodnik po funkcjach 1.0.0 i rozbudowano przegląd możliwości w README oraz opisie wydania. [Przewodnik po funkcjach](wiki/Funkcje-OskiRide.md)
- Published an English README and user documentation, with screenshots of riding, the workout library, and Rider Studio. [English documentation](wiki/en/README.md) · [Screenshots](wiki/en/Screenshots.md)
- Expanded the screenshot gallery with English captions for the GPX library, Bluetooth pairing, rain, ride summaries, and ride comparisons. [Screenshot gallery](wiki/en/Screenshots.md)
- Added a keyboard-powered ride demo, a screenshot of an active workout interval, and a sample GPX route for the first ride. [Ride demo](README.md#ride-demo) · [Sample GPX](wiki/en/Installation.md#try-a-sample-gpx)
- Zaktualizowano Electron do wersji 45.4.1 i ograniczono paczkę do plików używanych przez aplikację.
- W wydaniu jest 12 animowanych kibiców. Osobisty portret i związane z nim materiały pozostały lokalnie.
- Przetłumaczono interfejs na angielski i dodano slogan „Ride beyond the room.” Opis wydania jest angielski, a instrukcje w Wiki są po polsku.
- Start bez źródła mocy czeka przy 0 W na ruch suwaka lub strzałkę w górę. [Release notes](docs/Release-Notes.md)

## [2026-11-16]

### Dodano — przygotowanie repozytorium GitHub, ujednolicenie Changeloga i polskie GitHub Wiki (`wiki/`)

- Utworzono komplet stron polskiego **GitHub Wiki** w katalogu [`wiki/`](wiki/Home.md): `Home.md`, `_Sidebar.md`, `_Footer.md`, `Instalacja-i-Uruchomienie.md`, `Trenazery-i-Bluetooth.md`, `Manetki-Zwift-Click.md`, `Trasy-GPX-i-Swiat-3D.md`, `Treningi-i-Dziennik-Postepow.md` oraz `Architektura-i-FAQ.md` (z instrukcją publikacji kodu i Wiki na GitHubie).
- Dodano reguły pomijające instalatory i duże archiwa narzędziowe.
- Ujednolicono changelog i dokumentację w katalogu `wiki/`.

### Zweryfikowano — przegląd spójności projektu i poprawki menu

- Dodano aktywację importu treningu klawiszami Enter i Spacja, dynamiczny tytuł aktywnego widoku dla czytników ekranu oraz powiększono tekst objaśnień. Uzgodniono dokumentację urządzeń z bezpośrednim parowaniem Zwift Click.
- Sprawdzono identyfikację **„Słońce i las”**, przebieg jazdy, strukturę kodu i zgodność dokumentacji ze stanem aplikacji.
- Przeszło **13 kontroli menu** oraz **107 kontroli regresji** w Edge z atrapami BLE oraz weryfikacją identyfikatorów, ustawień i eksportów FIT/TCX.

### Dodano — czytelna ikona aplikacji i paska zadań: samo logo OR na kafelku

- Przygotowano kwadratową ikonę aplikacji ze słonecznym monogramem **OR** (`#F2C94C`) osadzonym na zaokrąglonym kafelku w kolorach leśnej zieleni (`#234C3B` → `#172B23`, bez napisu `OskiRide`): `grafika/marka-oskiride/oskiride-icon.png` (`512×512`), `oskiride-icon.ico` (`16–256 px`, 7 rozmiarów dla paska zadań Windows) oraz `oskiride-icon.svg`. Kafelek zapewnia pełny kontrast na każdym kolorze paska zadań.
- Podpięto nową ikonę w `electron-main.js`, `package.json` (`electron-builder`) oraz `<link rel="icon">` w `index.html` i stronach pomocniczych, zachowując pełne logo `OR OskiRide` wewnątrz HUD i menu.
- Przeszło **6 kontroli** plików ikon, serwera i przeglądarki Edge.

### Dodano — drugi duch: własny rekord z Dziennika postępów

- Dodano niezależnego drugiego ducha 3D (**🏆 DUCH (REKORD)**), który odtwarza przebieg najlepszego lub wybranego zapisanego przejazdu danej trasy z Dziennika postępów (IndexedDB) równolegle z pierwszym duchem (np. z pliku GPX lub FTP).
- W **Ustawienia jazdy → Obraz, rywal i zPower** dodano przełącznik **Drugi rywal: własny rekord z dziennika** oraz wybór konkretnego przejazdu (**Najlepszy czas (rekord trasy)** lub pojedyncza próba z historii). Górny pasek HUD, minimapa, profil wysokości, lista kolarzy i podsumowanie jazdy pokazują oba duchy osobno.
- Przeszło **10 kontroli** drugiego ducha w Edge i Electron oraz **107 kontroli regresji** OskiRide.

### Dodano — oświetlenie PBR, kopuła nieba, rzeźbione góry, drzewa i głazy 3D, bramy LED i efekty prędkości

- Dodano proceduralną kopułę nieba 3D (`src/world/skyEnvironment.js`) z gradientem atmosferycznym Rayleigh/Mie, tarczą słoneczną lub księżycową, dwuwarstwowymi chmurami (Cumulus i Cirrus) podświetlanymi od strony słońca, gwiazdami w nocy oraz zawijanymi na GPU cząsteczkami atmosferycznymi (`OskiRide_AtmosphericMotes`).
- Dodano 3 prefiltrowane mapy środowiskowe PBR (`THREE.PMREMGenerator`: dzień, zachód słońca, noc) przypisywane do `scene.environment`, dostrojono odbicia materiałów roweru i kolarza (`Frame_Paint`, `Carbon`, `Alloy`, `Shield_Lens`, `Helmet_Shell`) oraz podniesiono rozdzielczość cieni w trybie **Ultra** do `2048×2048`.
- Dodano mapę szorstkości i kruszywa asfaltu (`roughnessMap`), organiczną teksturę darni i skał na nasypie przydrożnym (`getTerrainTextures` + UV), rzeźbione masywy alpejskie 3D z żlebami śnieżnymi, rzeźbione świerki i omszałe głazy z cieniowaniem wierzchołkowym (`vertexColors`) oraz poświatę latarni drogowych (`lampHaloMat`).
- Dodano podświetlone listwy i poświatę LED na bramach START / KOM / META (`src/world/routeArches.js`), linie pędu powietrza 3D (`OskiRide_SpeedLines`) powyżej $48\text{ km/h}$ i w sprincie oraz dynamiczne poszerzanie kąta widzenia kamery (FOV) na szybkich zjazdach i w sprincie.
- Przeszło **27 kontroli** grafiki PBR, terenu, drzew, bram LED i efektów prędkości oraz **107 kontroli regresji** OskiRide w Edge.

### Dodano i zmieniono — bezpośrednie parowanie manetek Zwift Click V1/V2, test z podświetleniem i obsługa menu z kierownicy

- **Bezpośrednie parowanie bez mostu:** Usunięto zależność od zewnętrznego mostu MySWITCH / OpenBikeControl. W **Urządzenia → Manetki Bluetooth** dostępny jest bezpośredni wybór **Zwift Click V1** oraz osobne parowanie lewej i prawej **Zwift Click V2**, z odczytem baterii i automatycznym ponawianiem połączenia.
- **Fizyczne `+` i `−` do zmiany biegów:** Przypisano `+` do cięższego i `−` do lżejszego biegu na Click V1 i V2.
- **Interaktywny test przycisków:** W **Przypisanie i test przycisków → Testuj przyciski** wyświetlane są osobne schematy lewej i prawej Click V2, stan połączenia, podświetlenie obrysu wciśniętego przycisku i przypisana akcja bez wykonywania jej w grze.
- **Nawigacja w menu z kierownicy i ostrzeżenia:** Przycisk **Z** przełącza menu, strzałki lewej Click V2 przesuwają zaznaczenie, a **B** zatwierdza wybór (wybór trasy lub treningu przenosi fokus na przycisk startu). Dodano alerty jazdy o niskiej baterii ($\le 20\%$), utracie połączenia i potrzebie aktywacji manetki.
- **Podpowiedzi i symbole przycisków:** Po użyciu podłączonej manetki w menu i przy przycisku **Menu** pojawiają się kolorowe symbole przycisków oraz krzyżak kierunkowy; użycie myszy, dotyku lub klawiatury przywraca zwykły widok.

### Dodano — Dziennik postępów i porównanie przejazdów

- Dodano **Dziennik postępów** (w menu głównym oraz skrót **Przejazdy** przy trasach w bibliotece GPX) przechowujący wszystkie ukończone jazdy lokalnie w IndexedDB (z automatyczną migracją wcześniejszej historii). Filtry trasy i okresu aktualizują sumy oraz wykresy tygodniowe/miesięczne.
- Dodano **Porównanie dwóch jazd**: tabela różnic oraz nałożone wykresy mocy, tętna, kadencji, prędkości i wysokości (dla zgodnej trasy próbki są porównywane na tym samym kilometrze).
- Przeszły **38 kontroli dziennika** i **107 kontroli regresji** w Edge.

---

## [2026-11-01]

### Zweryfikowano — uruchomienie lokalnego serwera OskiRide

- Potwierdzono obsługę `http://localhost:8080/index.html` przez `server.js` (`HTTP/1.1 200 OK`, `text/html; charset=utf-8`).

---

## [2026-10-30]

### Naprawiono — poprawny przechył w zakrętach (`roadLean.js`)

- Usunięto odwrócony znak pochylenia oraz zależność amplitudy od gęstości próbek GPX. Gracz, rywal i pacerzy korzystają ze wspólnego modułu `src/world/roadLean.js` wyliczającego kąt $\arctan(v^2 \cdot \kappa / g)$ z rzeczywistej krzywizny wyświetlanej szosy, z limitem $35^\circ$ i płynnym powrotem do pionu. Sprawdzono oba kierunki i cztery modele.

### Dodano — animacja sprintu po skoku mocy

- Wspólna kinematyka czterech modeli wykrywa wzrost mocy względem ostatnich sekund i FTP, również przy wysokiej kadencji. Płynnie uruchamia pozycję poza siodłem i pracę roweru, po odpuszczeniu wraca do stabilnej jazdy w siodle. Testy obejmują filtry pików, przejścia, cztery modele i suwak mocy w grze.

### Dodano — diagnostyka i logi każdej jazdy

- Kropka w prawym górnym rogu pokazuje stan trenażera: brak połączenia, łączenie/ponawianie, połączenie i utratę połączenia. Kliknięcie otwiera urządzenia; licznik FPS został ukryty z zachowaniem jego identyfikatora.
- **Ustawienia → Logi** zawierają osobne zapisy nowych jazd: zdarzenia sesji i urządzeń, ostrzeżenia, błędy, źródła danych i pomiary wydajności. Dostępne są wybór jazdy, wcześniejsze wpisy, odświeżanie oraz eksport pełnego JSON.
- Logi zapisują się lokalnie w IndexedDB bez limitu 20 jazd. Obsłużono odmowę dostępu, brak miejsca, ponawianie zapisu i pobieranie niezapisanych wpisów z bieżącego uruchomienia.
- Weryfikacja tego etapu: **33 kontrole diagnostyki i 124 kontrole wcześniejszej regresji**.

### Dodano — pauza po utracie trenażera i test urządzeń

- Utrata trenażera pauzuje jazdę oraz interwał, zatrzymuje liczniki, anuluje rampę ERG i oczekujące cele. Klawiatura nie zastępuje automatycznie utraconego urządzenia.
- Ponowne połączenie zleca neutralne SIM i pozostawia pauzę do przycisku **Wznów jazdę**. Wymóg ponownego połączenia jest zachowywany także w odzyskiwaniu sesji po restarcie.
- **Test urządzeń** sprawdza przez 30 sekund świeże odczyty mocy, kadencji i tętna. Stare i symulowane dane nie zaliczają testu; brak opcjonalnego pulsometru jest rozróżniany od awarii.
- Osobna, ręcznie uruchamiana próba oporu trwa 5 sekund: neutralne ustawienie, mały krok i powrót. Reakcję fizyczną potwierdza użytkownik. Próba nie nalicza jazdy i nie zmienia zapisanego wyboru SIM/ERG.
- Obsłużono anulowanie, utratę połączenia, wyjście z widoku, przejście okna w tło i nieudany powrót. Jeśli po próbie nie potwierdzono neutralnego polecenia, start pozostaje zablokowany do jego przywrócenia.
- Weryfikacja tego etapu: **223 kontrole z atrapami urządzeń**.

### Dodano — biblioteka własnych tras GPX

- **Graj → Moje trasy GPX**: automatyczny zapis poprawnych nowych importów, własne nazwy, ulubione, wyszukiwanie, filtrowanie i ponowny wybór bez wgrywania pliku.
- Lista pokazuje długość, przewyższenie i liczbę podjazdów. Identyczna zawartość GPX nie tworzy dodatkowej kopii i zachowuje wcześniejszą nazwę oraz ulubione.
- Dodano potwierdzane usuwanie, anulowanie usunięcia i ponowienie zapisu bieżącej trasy. Wybór i zmiany są blokowane podczas aktywnej sesji oraz próby oporu.
- Metadane i źródłowe GPX zapisują się w osobnych magazynach IndexedDB bez limitu 20 tras. Błąd zapisu jest widoczny; wczytany GPX pozostaje dostępny do jazdy.

### Dodano — automatyczne dopasowanie grafiki

- Przełącznik w ustawieniach, domyślnie włączony i zapisywany w profilu, ogranicza cienie oraz dalszą dekoracyjną scenerię przy utrzymujących się spadkach płynności.
- Dodano dwa poziomy ograniczenia, rozgrzewkę pomiaru, okresy stabilizacji i stopniowy powrót po poprawie. Menu, pauza i tło nie są podstawą decyzji o poprawie wydajności.
- Automat nie przebudowuje świata ani drogi. Zachowuje krzywą, geometrię, zakresy jezdni i elementy infrastruktury. Wybrany ręcznie preset pozostaje poziomem wyjściowym; wyłączenie automatu natychmiast go przywraca.
- Aktualny stan jest opisany w ustawieniach, a zmiany trafiają do logów. Automat nie obniża wewnętrznej rozdzielczości renderowania.
- Weryfikacja biblioteki i grafiki: **169 kontroli oraz 27 wariantów świata**. Decyzje automatu sprawdzano na kontrolowanych czasach klatek; nie są one pomiarem zysku FPS.

Podane wyniki dotyczą osobnych etapów i obejmują powtarzane regresje — nie należy ich sumować jako unikalnych testów. Próby urządzeń wykonywano z atrapami; nie potwierdzają fizycznej reakcji konkretnego trenażera ani działania instalatora Electron.

## [2026-10-29]

### Poprawiono — spójność treningów i interfejsu

- Ujednolicono wybór i wyłączność SIM/ERG, anulowanie kolejki oraz ramp, FreeRide → SIM, ręczny cel ERG i powrót do właściwego trybu po treningu.
- Import MRC/ERG rozróżnia procent FTP i waty; import wybiera plan i czeka na jawny start sesji. Uzgodniono silnik kroków z HUD i rzeczywiste czasy planów.
- Poprawiono polskie formaty liczb i jednostek, strefy Z1–Z7, kontrast, czytelność oraz układ menu przy 390/760/1366 px. Uzupełniono dokumentację zakresu projektu.
- Weryfikacja etapu: **70/70 kontroli**, eksport FIT/TCX i sumy CRC FIT.

### Dodano — wspólna sesja, profil i odzyskiwanie

- Stany przygotowania, jazdy, pauzy i zakończenia; zgodne przyciski startu, wznowienia i nowej jazdy oraz zamrożone zakończone podsumowanie.
- Lokalny profil i preferencje, podgląd przed startem oraz rozróżnienie źródeł i świeżości mocy, kadencji, tętna i sterowania.
- Odzyskiwanie presetu lub GPX z próbkami, licznikami i planem, zawsze w pauzie. Obsłużono uszkodzoną i pełną pamięć oraz zachowanie ostatniego zapisu przy błędzie historii.
- Weryfikacja etapu: **124/124 kontroli**.

### Poprawiono — renderowanie i sprawdzono wskazany GPX

- Partie statycznej scenerii i instancje, zwalnianie zasobów świata, lokalny obszar cieni, bufor profilu wysokości oraz ograniczenie alokacji w pętli renderowania.
- Ujednolicono dokładność drogi między jakościami. Skan wskazanego GPX obejmował 315 tys. promieni bez kolizji ze scenerią; próbki terenu nie wykazały wyniesień ponad asfalt większych niż 15 cm. Sprawdzono kamery i zwalnianie zasobów.
- W sześciu miejscach GPX i trzech jakościach zmierzono około 60 FPS na Intel Iris Xe przy 1366×768/DPR 1. Budżet wywołań renderera w gęstej scenerii pozostaje przekroczony; wynik nie jest gwarancją dla innego sprzętu i rozdzielczości.
- Przeszły **27 wariantów świata i 124 kontrole regresji**.

### Poprawiono — twarz osobistego kibica Oski

- Model 13 ma atlas twarzy przygotowany z portretu użytkownika, osadzony w GLB i dopasowany do zakrzywionej głowy z reliefem nosa i policzków.
- Loader zachowuje teksturę i UV podczas optymalizacji. Zachowano napis Oski na plecach, animację i budżet pięciu siatek.


## [2026-10-28]

### Dodano — Podsumowanie treningu (Pmax, MMP, Strava) i Podjazd Alpe d'Huez (Tour de France)

- **Podsumowanie jazdy i analityka wysiłku (Ride Debrief & Strava Integration):**
  - Bezpośredni przycisk **„Zakończ trening”** (`#btn-end-ride`) na dolnym pasku sterowania HUD, zapisujący sesję i otwierający pełne podsumowanie w dowolnej chwili.
  - Wzbogacenie krzywej mocy MMP o moc maksymalną **Pmax** (sprint peak w W i W/kg) obok 5s, 15s, 1m, 5m i 20m.
  - Wykres HTML5 Canvas z pełną krzywą Power Duration, linią odniesienia FTP zawodnika i gradientem.
  - Wykres czasu w 7 strefach Coggana (Z1–Z7) oraz zaawansowane wskaźniki NP, IF, TSS, VI, EF.
  - Jednoklikowa integracja ze Stravą: przycisk **„Prześlij na Stravę ↗”** (`#btn-finish-strava`) w jednym kliknięciu pobiera plik `.tcx` i otwiera stronę uploadu aktywności Strava.
- **Legendarny podjazd Alpe d'Huez (Tour de France):**
  - Oficjalna trasa Alpe d'Huez w generatorze tras (`src/gpx/gpxParser.js`): dystans $13,8\text{ km}$, start w Bourg d'Oisans ($744\text{ m n.p.m.}$), meta na szczycie stacji Alpe d'Huez ($1854\text{ m n.p.m.}$), przewyższenie $+1\,110\text{ m}$, średnie nachylenie $8,1\%$.
  - Odwzorowanie 21 słynnych serpentyn (*Les 21 virages*) z wypłaszczeniem w wierzchołkach łuków oraz stromymi rampami leśnymi ($10,5\% - 11,2\%$) i rejonem Dutch Corner (zakręt 7).
  - Automatyczna kategoria **HC (Hors Catégorie)** z bramą `👑 KOM #1 (HC • 1854m)` oraz dopingującymi kibicami 3D.
  - Prawdziwe współrzędne GPS Alp Francuskich (`lat: 45.0585, lon: 6.0350`) dopasowujące eksport TCX do oficjalnego segmentu Strava.
  - Nowa karta trasy `#card-route-alpedhuez` w menu głównym.
- **Materiały i dokumentacja:**


### Dodano — osobisty kibic numer 13 z napisem Oski

- Dodano `13-portret.glb`: postać użytkownika ze zdjęć, jasna koszula z zielonym napisem **Oski** na plecach, ciemne spodnie, własna geometria twarzy, fryzury i brody oraz animacja machania. Zdjęcia nie są eksportowane jako tekstury.
- Katalog i wspólny GLB zawierają 13 wariantów; liczba par w strefach wynika z rozmiaru katalogu. Testy sprawdzają obecność osobistej postaci na czterech trasach i trzech poziomach jakości na trasie górskiej.
- Źródło: `tools/3d/spectator_portrait.py`.


### Dodano — Detekcja realizmu zPower, Panel parowania Zwift i Kalibracja Spindown

- **Detekcja kompatybilności z realizmem i biblioteka presetów zPower (`src/ble/trainerController.js`):**
  - Wbudowano bazę 19 modeli trenażerów klasycznych i rolek (Tacx Blue Matic/Motion/Booster/Satori, Elite Novo Force/Qubo Mag/Fluid, Kurt Kinetic Road Machine/Rock and Roll, Decathlon In'Ride 100/500, Saris Fluid2/Mag, Minoura MagRide, rolki i spin bike) ze współczynnikami krzywych $P(v) = a \cdot v^3 + b \cdot v^2 + c \cdot v$.
  - Funkcja `getRealismStatus()` sprawdza stopień realizmu:
    * Dla trenażerów Smart (FTMS SIM, Tacx FE-C, Wahoo Direct) -> `Realizm fizyki: WŁĄCZONY (100% opór trasy)`.
    * Dla czujników prędkości ze sparowanym modelem trenażera -> `Realizm fizyki: WŁĄCZONY (zPower: [Model])` z podpowiedzią ustawienia manetki i ciśnienia.
    * Dla czujników prędkości bez wybranego profilu (`none`) -> `Trenażer niekompatybilny z realizmem fizyki (wybierz profil zPower)`.
    * Dynamiczna odznaka na HUD (`#hud-realism-badge`) oraz baner informacyjny w panelu parowania.
- **Graficzny panel parowania urządzeń w stylu Zwift (`index.html`, `style.css`, `src/main.js`):**
  - Dodano modal `#pairing-modal` z 4 kafelkami (Trenażer Smart, Miernik mocy, Prędkość & zPower z listą 19 modeli, Pulsometr).
  - Dostęp do panelu z nagłówka menu (`#btn-open-pairing`), ekranu startowego (`#btn-home-devices`) oraz kliknięcia w odznakę na HUD.
- **Wbudowany asystent kalibracji Spindown (`#spindown-modal`, `src/ble/trainerController.js`):**
  - Zaimplementowano asystenta kalibracji wybiegu koła zamachowego: instrukcje, licznik prędkości 0–37 km/h, pulsujący monit *„PUŚĆ PEDAŁY!”* i pomiar czasu wybiegu do 15 km/h.

### Dodano — 12 kibiców 3D i tablica z logo OskiRide

- Przygotowano 12 autorskich modeli low-poly z trzysekundowymi pętlami animacji: machanie, oklaski, szalik, flaga Polski, podskoki, fotografowanie, dzwonek, bidon, tablica i megafon. Modele GLB, plik `kibice.blend`, generator i podglądy znajdują się w `grafika/kibice/` oraz `tools/3d/build-spectators.py`.
- Zastąpiono wcześniejszych uproszczonych kibiców w strefach bufetów, szczytów KOM i mety. Rozmieszczanie uwzględnia wysokość pobocza, tunele, sektory widoczności i rezerwację obrysu animacji w systemie kolizji scenerii.
- Dodano `src/world/spectatorCrowd.js`: współdzielenie geometrii i materiałów, 4–5 siatek na postać, własne miksery i fazy ruchu, ograniczenie animacji do widocznych postaci oraz zwalnianie mikserów po przebudowie świata.
- W modelu `10-tablica.glb` zastąpiono strzałki oficjalnym znakiem OR i napisem OskiRide na kremowym tle. Logo wykorzystuje przednie trójkąty istniejących wzorców STL marki i pozostaje widoczne po optymalizacji geometrii w grze.
- Walidacja 12 modeli i wspólnego GLB zakończyła się bez błędów i ostrzeżeń. Test Three.js potwierdził zgodność geometrii i animacji, pełną dwunastkę na czterech trasach oraz trzy poziomy jakości na trasie górskiej. Raporty: `grafika/kibice/walidacja.json` i `walidacja-runtime.json`; szczegóły w [sekcji 9.10 dokumentacji technicznej](docs/DOKUMENTACJA_TECHNICZNA.md#910-kibice-3d-i-tablica-z-logo-oskiride).

### Poprawiono — kolizje scenerii i generowanie trasy

- Dodano wspólny indeks przestrzenny `src/world/sceneryPlacement.js`: kontrola całych segmentów drogi, obróconych i skalowanych obwiedni obiektów oraz odstępów między elementami scenerii.
- Zachowano dozwolone łączenia kolejnych segmentów infrastruktury, usunięto podwójny system barierek i odsunięto filary bram poza asfalt. Bramy otrzymują pierwszeństwo przed opcjonalną scenerią.
- Przyspieszono wygładzanie poziome GPX i ponawianie aktualizacji okna widoczności; naprawiono zakres rysowania przy mecie.
- Test `tools/3d/verify-route-world.mjs` przeszedł dla 21 wariantów tras i jakości, bez błędów JavaScript. Zakres weryfikacji i lokalne pomiary opisano w dokumentacji technicznej, sekcje 9.7–9.9.

### Dodano (Added)

#### Pełna obsługa wszystkich trenażerów, mierników mocy i czujników BLE
- **Rozszerzenie protokołów trenażerów w `src/ble/trainerController.js`:**
  - **FTMS (Fitness Machine Service 0x1826):** Pełne sterowanie symulacją nachylenia trasy OpCode 0x11, tryb ERG OpCode 0x05 oraz automatyczny fallback na OpCode 0x04 (Target Resistance Level) dla rowerów spinningowych i stacjonarnych (Schwinn IC4, Bowflex C6, Yesoul, Domyos).
  - **Tacx FE-C over BLE (Nordic UART):** Pełna obsługa starszych trenażerów Tacx (Vortex Smart, Bushido Smart, Genius, Flow, starsze Flux/Neo). Nadawanie ANT+ FE-C Page 51 (Track Resistance) i odbiór Page 25 (moc chwilowa i kadencja) z sumą kontrolną XOR.
  - **Wahoo Direct BLE:** Obsługa starszych modeli Wahoo KICKR (v1-v3, SNAP) za pomocą komend OpCode 0x43 (Grade SIM) i OpCode 0x42 (Target Power ERG).
  - **Mierniki mocy (CPS 0x1818):** Wbudowano dekoder kadencji z danych obrotów korby (Crank Revolutions flagi 0x0020), eliminując konieczność stosowania osobnego czujnika kadencji przy pomiarze z korby lub pedałów (Favero Assioma, Stages, 4iiii, Quarq, Garmin Rally, Magene).
  - **Trenażery klasyczne i rolki (CSCP 0x1816 + zPower):** Odczyt prędkości z obrotów koła i wyliczanie mocy wirtualnej Virtual Power (zPower) wg krzywych: trenażer płynowy (Fluid), trenażer magnetyczny (Magnetic L3), rolki kolarskie (Rollers) oraz rower spinningowy.
  - **Odporność na błędy (Boundary Protection):** Zabezpieczono wszystkie parsery ramek BLE przed wyjątkami `RangeError` przy skróconych lub niestandardowych pakietach.
- **Inteligentny selektor urządzeń Bluetooth w Electron (`electron-main.js`):**
  - Wdrożono algorytm heurystyczny scoringu urządzeń kolarskich z debouncingiem 350 ms, uniemożliwiający omyłkowe łączenie z przypadkowymi peryferiami (słuchawki, telewizory, zegarki) w zasięgu komputera.
- **Interfejs użytkownika i ustawienia (`index.html`, `src/main.js`):**
  - Dodano wybór profilu krzywej wirtualnej mocy w ustawieniach jazdy (`#virtual-power-curve-select`).
  - Dodano przycisk **„Wyszukaj dowolny trenażer (tryb uniwersalny BLE)”** (`acceptAllDevices: true`) do łączenia z urządzeniami niestandardowymi lub DIY (ESP32).
  - Dodano wskaźnik naładowania baterii trenażera na przycisku parowania.

## [Nieopublikowane] / [2026-10-27]

### Dodano (Added)

#### 1. Bezpośrednia obsługa manetek Zwift Play oraz Zwift Click (Web Bluetooth API)
- Utworzono moduł [`src/ble/zwiftController.js`](src/ble/zwiftController.js) umożliwiający natywne połączenie BLE bez zewnętrznych programów pośredniczących (takich jak MySWITCH czy QZ).
- Dekodowanie ramek protokołu Zwift Play (`0x23`) z 32-bitową odwróconą bitmapą przycisków:
  - Manetka `+` (wrzucenie twardszego biegu),
  - Manetka `-` (zrzucenie na lżejszy bieg pod górę),
  - Przyciski akcji `A` i `B` (otwieranie/zamykanie menu),
  - Strzałki kierunkowe (przełączanie widoku kamery).
- Pełna obsługa kontrolera Zwift Click v1/v2 z mechanizmem eliminacji drgań styków (debouncing 120 ms).
- Obsługa odczytu poziomu naładowania baterii (`Battery Service 0x180F`).
- Przycisk parowania **„Manetki Zwift”** w nagłówku menu z dynamicznym wskaźnikiem statusu i poziomu baterii.
- Obsługa **Gamepad API** (Windows DirectInput / XInput) dla bezprzewodowych pilotów oraz klawiszy `+`, `-`, `=`, `_`.

#### 2. Wirtualna zmiana przełożeń dla Zwift Cog (24 realne biegi szosowe)
- Zaimplementowano tabelę 24 fizycznych przełożeń (`VIRTUAL_GEAR_RATIOS`) odpowiadających realnemu napędowi szosowemu 2×12 (korba 50/34 z kasetą 11–34T), od przełożenia 1.00 (młynek 34×34) do 5.09 (blat 56×11).
- **Dwa tryby jazdy:**
  - **Ze sparowanym kontrolerem (Zwift Cog):** łańcuch spoczywa na pojedynczej zębatce, a trenażer FTMS koryguje opór pod nogą w czasie rzeczywistym zgodnie z wybranym przełożeniem wirtualnym.
  - **Bez sparowanego kontrolera (klasyczna kaseta):** trenażer przekazuje 1:1 nachylenie trasy z profilu GPX, a kolarz zmienia biegi klamkomanetkami na rowerze (HUD wyświetla status *„Fizyczna kaseta”*).
- Dodano przełącznik trybu wirtualnych biegów w menu ustawień (*Automatycznie / Zawsze / Wyłączone*).

#### 3. Zaawansowana fizyka i realizm jazdy
- **Płynna rampa nachylenia trenażera (*Grade Smoothing*):** opór FTMS na koło zamachowe narasta z maksymalną prędkością 1.8% nachylenia na sekundę, eliminując szarpnięcia stawów kolanowych przy szumach GPS/GPX. Zmiana wirtualnego biegu manetką wysyła impuls natychmiastowy (`force`).
- **Barometryczna gęstość powietrza wg wysokości n.p.m.:** zaimplementowano międzynarodowy standard ISA $\rho(h) = 1.225 \cdot e^{-h / 8500}$. Na alpejskich przełęczach (1500–2500 m n.p.m.) opór aerodynamiczny $F_{\text{aero}}$ maleje o 15–25%, realistycznie zwiększając prędkość na zjazdach i płaskowyżach.
- **Bezwładność wirujących kół szosowych (*Rotational Inertia*):** uwzględniono moment pędu kół 700c (+1.8 kg masy pozornej), gwarantując naturalny wybieg (*coasting*) po zaprzestaniu pedałowania oraz płynne wtaczanie się na przeciwstoki.
- **Płynna krzywa tunelu aerodynamicznego (*Drafting Curve*):** opór powietrza maleje płynnie od 35% tuż za kołem kolarza/Pacera do 0% przy 12 metrach. Pigułka HUD na żywo wyświetla dokładny procent zysku aerodynamicznego.
- **Fizyka pochylania roweru w zakrętach (*Bike Roll & Lean Angle*):** kolarz, rower, Wirtualny Rywal (Ghost) oraz Pacerzy AI dynamicznie kładą się do wnętrza łuku drogi na podstawie prędkości i promienia zakrętu (do $\pm 24^\circ$).

#### 4. Akustyka i analityka sportowa
- **Proceduralny szum pędu powietrza (*Aerodynamic Wind Rush*):** wbudowano bezplikowy syntezator Web Audio API generujący miękki szum opływu kasku. Przy niskich prędkościach na podjazdach panuje cisza, a powyżej 50 km/h na zjeździe pojawia się autentyczny świst pędu powietrza.
- **Mechaniczny klik zmiany biegu (*Audio Click*):** 35-milisekundowy dźwięk potwierdzający wbicie biegu wirtualnego na manetce (wyższy ton dla `+`, niższy dla `-`).
- **Medyczno-sportowa analityka mocy dra Andrew Coggana:**
  - **Normalized Power (NP):** wyliczana z 30-sekundowej średniej kroczącej podnoszonej do 4. potęgi,
  - **Intensity Factor (IF):** stosunek wysiłku do progu FTP,
  - **Training Stress Score (TSS):** punkty obciążenia treningowego,
  - Wskaźniki widoczne są w podsumowaniu przejazdu, zapisywane w historii treningów oraz dostępne na żywo w dymku średniej mocy na HUDzie.

#### 5. Maksymalizacja realizmu profili tras GPX i geometrii 3D
- **Odległościowy filtr Gaussa dla wysokości n.p.m. (*Spatial Gaussian Elevation Filter*):**
  - Zastąpiono prymitywną 5-punktową średnią kroczącą filtrem gausowskim o promieniu $\pm 38\text{ m}$ ($\sigma = 16\text{ m}$) opartym o rzeczywisty dystans metryczny wzdłuż trasy.
  - Eliminuje schodkowe skoki wysokościomierzy barometrycznych i błędy kwantyzacji GPS z urządzeń Garmin/Wahoo/Hammerhead, zachowując nienaruszony, autentyczny grzbiet wzniesień i przełęczy.
- **Inżynieryjne nachylenie szosy z bazy cięciwy (*Chord Baseline Grade*):**
  - Nachylenie drogi (%) wyliczane jest na cięciwie symetrycznej $28\text{ m}$ ($\pm 14\text{ m}$) zamiast jednokrokowego różniczkowania punkt-punkt, co zapobiega sztucznym „ścianom” przy mikroskopijnych szumach GPS.
  - Ogranicznik krzywizny pionowej ($|d\text{Grade}/ds| \le 0.22\%/\text{m}$) gwarantuje, że profil pionowy trasy spełnia normy inżynierii drogowej i płynnie steruje oporem koła zamachowego trenażera FTMS.
- **Rzeczywiste przewyższenie trasy z histerezą (*Cumulative Elevation Ascent Hysteresis*):**
  - Wdrożono sprawdzony algorytm progowy ($\Delta H \ge 0.6\text{ m}$) wyliczania sumy przewyższeń, zapobiegający wielokrotnemu zawyżaniu łącznego podjazdu (+m) przez drobne fluktuacje sygnału GPS.
- **Trójwymiarowa przechyłka poprzeczna szosy na łukach (*Superelevation & Road Banking*):**
  - Na łukach i serpentynach siatka asfaltu oraz przyległy taras nasypu pochylają się poprzecznie do wnętrza zakrętu (do $5.5\%$ spadku poprzecznego), odzwierciedlając prawdziwe profile górskich dróg alpejskich.
  - Wysokość osadzenia kolarza, Wirtualnego Rywala i Pacerów AI jest dynamicznie korygowana o przechyłkę na ich torze jazdy, dzięki czemu koła rowerów idealnie dotykają asfaltu w każdym przechyle.
- **Fizyczna symulacja prędkości Ducha GPX metodą Newtona-Raphsona:**
  - Dla tras planowanych (Komoot, Strava, RideWithGPS) bez znaczników czasu `<time>` wprowadzono numeryczne rozwiązywanie pełnego równania oporów ruchu ($P = 220\text{ W}$, masa 83.5 kg, opór aero i grawitacja). Duch pokonuje 10% podjazd z realną prędkością ok. 9.7 km/h zamiast nierealistycznych 14.4 km/h, a na stromych zjazdach rozpędza się grawitacyjnie do 65–75 km/h.
  - Dla plików z realnych jazd (Garmin/Strava) zaimplementowano filtr długich postojów na światłach lub bufetach ($dt > 10\text{ s}$ przy $ds < 4\text{ m}$), kompresujący postój do 2 sekund, dzięki czemu rywal nie zamarza na poboczu.
- **Wielosegmentowy profil wysokościowy ClimbPro (standard UCI / Tour de France):**
  - Mini-profil HUD oraz podgląd trasy w menu głównym otrzymały kolorowanie sektorów wg nachylenia:
    - 🟢 Zielony ($0.0 - 2.9\%$): łagodny,
    - 🔵 Błękitny ($3.0 - 5.9\%$): umiarkowany,
    - 🟡 Żółty ($6.0 - 8.9\%$): wymagający,
    - 🟠 Pomarańczowy ($9.0 - 12.9\%$): stromy,
    - 🔴 Czerwony ($\ge 13.0\%$): ściana,
    - ⚪ Szary ($<0\%$): zjazd.
- **Kierunek geograficzny, azymut i róża wiatrów:**
  - Wyliczanie azymutu geograficznego ($0–360^\circ$) dla każdego punktu trasy zorientowanej w układzie metrycznym (Północ = $-Z$, Wschód = $+X$).
  - Na panelu HUD obok wysokości n.p.m. wyświetla się dynamiczny wskaźnik kierunku (np. `142° SE`, `16° N`).
  - Na minimapie dodano elegancką różę wiatrów z czerwoną igłą wskazującą Północ (`N`).

#### 6. Sceneria 3D, punkty POI z GPX, kokpit napędu Di2 i wykresy mety
- **Wizualizacja przełożeń wirtualnych jak w elektronicznych grupach Shimano Di2 / SRAM AXS:**
  - Wzbogacono wskaźnik biegów na HUDzie oraz na dolnym pasku o precyzyjną informację o uzębieniu: np. **`Bieg 12/24 · 50×19T`** lub **`Bieg 1/24 · 34×34T`** (młynek pod górę).
  - Kolarz z trenażerem ze Zwift Cog natychmiast widzi, jakie realne przełożenie napędu szosowego emuluje trenażer pod nogą.
- **Fizjologiczne strefy tętna HR Z1–Z5 dla pulsometrów Bluetooth Low Energy:**
  - Dodano automatyczne wyliczanie strefy tętna (Z1 Regeneracja, Z2 Baza tlenowa, Z3 Tempo, Z4 Próg mleczanowy, Z5 Maksimum) na podstawie tętna maksymalnego $HR_{\text{max}}$.
  - Pigułka tętna na HUDzie zmienia kolor i podpis w czasie rzeczywistym (od błękitu bazy tlenowej po czerwień strefy beztlenowej).
- **Punkty orientacyjne z pliku GPX (`<wpt>`) i trójwymiarowe bramy szczytowe:**
  - Silnik GPX parsuje znaczniki `<wpt>` (szczyty, bufety, punkty widokowe, premie górskie) i przypisuje je do metrycznego kilometrażu trasy.
  - W świecie 3D na wysokości każdego waypointa generowana jest monumentalna brama z tablicą informacyjną (np. *„⛰️ PRZEŁĘCZ · 1198M”*).
- **Alpejskie słupki kilometrowe (Milestones) i barierki ochronne (Guardrails):**
  - Wzdłuż pobocza szosy co 1000 metrów rozmieszczono kamienne słupki kilometrowe z żółtą kopułką i numerem kilometra (`1 KM`, `2 KM`...), zastępując powtarzalne bramy autostradowe.
  - Na stromych zboczach (ekspozycja $>22\text{ m}$ nad doliną) oraz na ostrych nawrotach wygenerowano drewniano-stalowe barierki ochronne, potęgujące wrażenie jazdy po wysokogórskiej przełęczy.
- **Interaktywna lupa i kursor profilu wysokościowego (*Profile Scrubber*):**
  - Najechanie kursorem myszy na profil wysokościowy (na HUDzie lub w Menu Głównym) wyświetla pionową linię oraz dymek informacyjny z dokładnymi współrzędnymi: kilometrem, wysokością m n.p.m. i nachyleniem %.
- **Wieloliniowy wykres telemetryczny w oknie podsumowania na mecie:**
  - W oknie ukończenia treningu (`#finish-modal`) zaimplementowano canvasowy wykres telemetryczny:
    - Zielona sylwetka profilu wysokościowego trasy w tle,
    - Żółta linia przebiegu generowanej mocy (W),
    - Czerwona linia tętna (BPM) z pulsometru,
    - Błękitna linia prędkości (km/h),
    - Interaktywny kursor hover pokazujący dokładne parametry w dowolnym punkcie przejechanego dystansu.

#### 7. Pakiet Realizmu 1–5 (Biomechanika, akustyka napędu, Grand Tour, wektor wiatru, akustyka przestrzenna)
- **1. Dynamiczna Biomechanika Kolarza (Jazda na stojąco i Aero Tuck):**
  - Jazda na stojąco z siodełka (*out-of-the-saddle climbing*) włączająca się automatycznie na stromych podjazdach ($\ge 8.0\%$) lub przy generowaniu wysokiej mocy ($\ge 320\text{ W}$ przy kadencji $< 74\text{ RPM}$). Uniesienie i wysunięcie miednicy, wyprost tułowia oraz zsynchronizowany z obrotem korby boczny kołys roweru (`standSway`).
  - Pozycja aerodynamiczna *Aero Tuck* na szybkich zjazdach (nachylenie $\le -3.8\%$, prędkość $> 13.5\text{ m/s} = 48.6\text{ km/h}$), obniżająca kolarza i redukująca opór aerodynamiczny $C_d A$ o $14\%$.
- **2. Całkowite wyłączenie syntetycznych dźwięków jazdy:**
  - Zgodnie z dyspozycją użytkownika wyłączono wszelkie syntetyczne dźwięki jazdy z komputera (szum wiatru, szum opon, dźwięk wolnobiegu, dzwonki pasterskie i pogłos tunelu).
  - Kolarz trenujący w pomieszczeniu słyszy wyłącznie naturalny dźwięk mechaniki własnego roweru, napędu i trenażera, co zapewnia 100% naturalny odbiór bez irytującego hałasu z głośników laptopa.
- **3. Klimat Górskich Etapów Grand Tour (Tour de France / Giro d'Italia):**
  - Malowane kredą napisy kibiców na asfalcie na stromych ściankach ($\ge 8.5\%$) oraz przed szczytami KOM (*„ALLEZ! ⚡”*, *„HOP! HOP! HOP!”*, *„DAJESZ NA STOJĄCO!”*, *„BRAWO! 🚴”*, *„👑 KOM 👑”*, *„1 KM DO SZCZYTU”*) w barwach kredowej bieli, żółci Tour de France (`#facc15`) i różu Giro (`#ec4899`).
  - Podwójne szewrony ostrzegawcze na ostrych łukach (tablica ostrzegawcza 28 m przed szczytem łuku oraz szewron wejściowy 6 m przed).
- **4. Wektor Wiatru Atmosferycznego i Aerodynamika Kierunkowa:**
  - Dynamiczny wektor wiatru o zmiennym kierunku i sile. Wyliczanie składowej czołowej/plecowej ($v_{\text{head}} = v_{\text{wind}} \cos\Delta\theta$), pozornej prędkości strug powietrza $v_{\text{app}}$ oraz współczynnika bocznego oporu yaw wpływających bezpośrednio na fizyczną siłę oporu aerodynamicznego $F_{\text{aero}}$.
  - Pigułka wiatru na panelu HUD (`#hud-wind`) obok wysokości n.p.m. z dynamiczną strzałką i klasami kolorystycznymi: sprzyjający z wiatrem (zielony ⬇️), czołowy w twarz (czerwony ⬆️) i boczny (żółty ↔️).
  - Błękitny wektor wiatru wyrysowywany na róży kompasowej minimapy.
- **5. Detekcja Przestrzenna Środowiska 3D (tunele skalne bez syntetycznego audio):**
  - Wykrywanie wjazdu kolarza do przelotowych tuneli górskich 3D (`state.isInsideTunnel`) na podstawie interwałów dystansowych bez generowania sztucznego pogłosu z głośników komputera.
- **Bezwarunkowy brak wirtualnych hamulców:** Zgodnie ze ścisłą dyrektywą użytkownika aplikacja nie implementuje żadnych hamulców ani sterowania hamowaniem.

#### 8. Zaawansowane usprawnienia połączenia Rider – Trenażer Smart (FTMS 1–4)
- **1. Automatyczne wznawianie sesji w tle (Auto-Reconnect & Keep-Alive Watchdog):**
  - Wdrożono mechanizm ciągłego nadzoru połączenia Bluetooth LE z trenażerem. W przypadku zerwania sygnału radiowego aplikacja podejmuje 6 automatycznych prób wznowienia sesji GATT w tle z algorytmem Exponential Backoff (1.5s, 2.5s, 4.0s, 6.5s, 10s, 14s) bez konieczności dotykania komputera.
  - Po odzyskaniu łączności natychmiast synchronizuje subskrypcje telemetryczne oraz przesyła aktualne nachylenie szosy.
- **2. Bezstratna kolejka zapisu BLE (Non-blocking Queued Writes):**
  - Wyeliminowano błędy `GATT operation already in progress`. Jeśli nowa zmiana nachylenia lub wirtualny bieg nadejdzie w trakcie trwania poprzedniej transmisji, pakiet trafia do bufora `pendingSimulationBuffer` i zostaje wysłany natychmiast po zwolnieniu szyny BLE.
- **3. Inteligentny bufor anty-dropoutowy mocy i kadencji (Deadman Buffer):**
  - Chwilowe zaniki pojedynczych pakietów radiowych BLE (dropy na 0 W przy pedałowaniu) są maskowane 1.3-sekundowym filtrem bezwładności, eliminując sztuczne szarpanie prędkości w grze.
  - Dopiero gdy kolarz rzeczywiście przestanie kręcić korbą (kadencja = 0 przez $>1.2\text{ s}$), moc jest płynnie zerowana.
- **4. Pełna fizyczna ramka FTMS OpCode 0x11 (Grade, Wind Speed, Crr, Cw):**
  - Zastąpiono sztywne zera pełną specyfikacją Bluetooth SIG FTMS: przekazywanie rzeczywistej składowej wzdłużnej wiatru (w jednostkach $0.001\text{ m/s}$), nachylenia ($0.01\%$), współczynnika toczenia opony $C_{rr}$ ($0.0001$) oraz współczynnika oporu aero $C_w = C_d A \cdot \rho(h)$ zależnego od wysokości n.p.m. (standard ISA).
  - Umożliwia natywną symulację bezwładności koła zamachowego w mikrokontrolerach trenażerów Wahoo KICKR, Tacx Neo, Elite Direto XR i Magene.

### Zmieniono (Changed)
- **Płynne łuki drogowe zamiast „drogi z linijki” (Inżynieryjne klotoidy i zaokrąglanie zakrętów):**
  - Wdrożono algorytm [`smoothRouteHorizontalArcs`](src/gpx/gpxParser.js) w module `src/gpx/gpxParser.js`. Zagęszcza on rzadkie punkty GPS (np. co 4.0 m) i wygładza współrzędne poziome $(x, z)$ przestrzennym filtrem Gaussa ($\sigma = 13\text{ m}$, promień $30\text{ m}$).
  - Eliminuje kanciaste, proste segmenty łączące odległe punkty GPS i zamienia ostre załamania w autentyczne, aerodynamiczne łuki szosowe z płynną rotacją wektora stycznego.
  - Wygładzono wektor boczny krawędzi asfaltu (`roadEdgeRight`) w [`src/world/worldBuilder.js`](src/world/worldBuilder.js), dzięki czemu krawędzie jezdni i linie środkowe są całkowicie obłe i gładkie.
- **Bezwarunkowa ochrona jezdni przed kolizjami z obiektami 3D (Brak drzew i skał na drodze):**
  - Zaimplementowano funkcję `isPositionClearOfRoad(pos, itemRadius, roadSamples)` w [`src/world/worldBuilder.js`](src/world/worldBuilder.js) weryfikującą odległość od KAŻDEGO odcinka szosy na całej trasie (w tym sąsiednich pętli serpentyn alpejskich).
  - Wymuszono pozycjonowanie drzew, skał, domków i płotków prostopadle do szosy wektorem `rawRight` (eliminując dryf wektora uśrednionego) z odsunięciem pnia na bezpieczną odległość $6.3 - 7.7\text{ m}$ od osi jezdni. W przypadku kolizji z sąsiednią serpentyną obiekt jest przenoszony na drugą stronę lub pomijany, całkowicie wykluczając wrastanie drzew i skał w pas ruchu kolarza.
- **Całkowite usunięcie zbędnych instrukcji („Dobierz lżejszy bieg”, „Wyższy bieg”, „Zwolnij”, „Hamuj”):**
  - Zgodnie ze ścisłą dyspozycją użytkownika wyeliminowano ze skanera trasy [`src/physics/cyclingPhysics.js`](src/physics/cyclingPhysics.js) oraz szablonu [`index.html`](index.html) wszelkie zbędne podtytuły i instrukcje nakazujące zmianę przełożenia lub zwalnianie/hamowanie.
  - Karta ostrzegawcza [`#hazard-banner`](src/main.js) prezentuje wyłącznie czyste, obiektywne dane telemetryczne (np. *„Stromy podjazd +10,5%”* oraz *„Za 60 m”* lub profil łuku drogi), nie narzucając kolarzowi żadnych zbędnych poleceń. Przyciski zmiany biegów otrzymały neutralne etykiety *„Bieg w dół”* / *„Bieg w górę”*.
