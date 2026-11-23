# Funkcje OskiRide 1.0.1

OskiRide to lokalny symulator kolarstwa 3D. Możesz poznawać trasy z GPX, odtwarzać trening interwałowy i wracać do zapisanych przejazdów. Do jazdy wystarczy klawiatura. Trenażer i czujniki Bluetooth umożliwiają jazdę na podstawie odczytów ze sprzętu. [Pobierz wydanie na Windows x64](https://github.com/Securityoe/OskiRide/releases/tag/v1.0.1) · [Instalacja i sprawdzenie pliku](Instalacja-i-Uruchomienie.md)

## Gdzie znaleźć funkcje

| Chcesz | Otwórz w aplikacji |
| --- | --- |
| Wybrać trasę, wczytać GPX lub zmienić punkt startu | **Ride** |
| Zacząć plan z biblioteki lub wczytać trening z pliku | **Workouts** |
| Połączyć trenażer, czujniki lub manetki | **Devices** |
| Sprawdzić odczyty i odczuwalną zmianę oporu | **Device check** |
| Zmienić profil kolarza, ustawienia trenażera, grafikę lub rywala | **Settings** |
| Otworzyć historię, wykresy postępów i porównać jazdy | **Journal** |
| Zobaczyć zdarzenia i pobrać raport techniczny | **Settings → Logs** |

Przed startem ustaw FTP, masę i typ roweru w **Settings**. Możesz też zmienić nazwę kolarza i kolor koszulki. Wybierz **Ride → Start ride**. Przy jeździe bez źródła mocy symulacja zaczyna się od **0 W**. Dodaj moc klawiszem ↑ lub suwakiem **Power**. W wydaniu 1.0.1 pojedyncze etykiety, między innymi przy zmianie kamery i dodawaniu ulubionych tras, są jeszcze po polsku.

## Trasy i GPX

| Trasa | Charakter |
| --- | --- |
| **Alpine Pass** | Górska przełęcz z podjazdem KOM, tunelami i zjazdem |
| **Alpe d’Huez** | Podjazd HC o długości ok. 13,9 km oparty na śladzie GPX, z 21 ponumerowanymi zakrętami |
| **Winding Switchbacks** | Techniczna trasa z ciasnymi zakrętami i dwoma podjazdami |
| **Interval Valley** | Pofałdowana szosa z krótszymi podjazdami pod zmiany tempa |
| **Flat Time Trial** | Płaska trasa do jazdy na czas i treningu w równym tempie |

- **Import GPX** przyjmuje plik z dysku lub przeciągnięty do okna. Na podstawie śladu aplikacja buduje drogę, oblicza dystans, wygładza wysokość i wyznacza nachylenie. Obsługuje też nazwane punkty na trasie oraz wykorzystuje zapisane czasy GPX, jeśli ślad je zawiera.
- **My GPX routes** przechowuje poprawnie zaimportowane trasy lokalnie. Możesz je wybierać ponownie, zmieniać nazwy, dodawać do ulubionych, wyszukiwać i usuwać. Ponowny import identycznej zawartości nie tworzy duplikatu. Przycisk **Ride history** otwiera przejazdy zapisane dla danej trasy.
- **Start location** lub kliknięcie profilu wysokości pozwala zacząć w wybranej części trasy. W jeździe widać minimapę, profil całej trasy i nachylenie na najbliższych 1,5 km. Alerty podają odległość do ostrych zakrętów i podjazdów, a przy podjeździe widać dystans do szczytu i pozostałe przewyższenie.
- Podjazdy otrzymują kategorie **HC lub Cat. 1–4**. Bramy i oznaczenia pokazują start, odcinki trasy, szczyty KOM i metę. [Trasy GPX i świat 3D](Trasy-GPX-i-Swiat-3D.md)

## Jazda, sterowanie i rywale

- Prędkość wynika z mocy, masy kolarza i roweru, nachylenia, oporu toczenia oraz oporu powietrza. Symulacja uwzględnia składnik wiatru zależny od kierunku jazdy, a jazda za pacerem zmniejsza opór aerodynamiczny. Dostępne są rower szosowy aero, czasowy oraz MTB/gravel.
- HUD pokazuje waty i W/kg, prędkość, kadencję, tętno z czujnika, bieg, czas, dystans, przewyższenie i nachylenie. Widać też strefę mocy, wskazania kadencji, wiatr, rywali i źródła odczytów. **Ride panel** przełącza dolny panel między sterowaniem z wykresami a samymi wykresami.
- **Wirtualne biegi 1–24** mają trzy profile napędu. Wybierz szosowy uniwersalny, górski lub czasowy w **Gear ratios**. Ustawienie **Virtual shifting** może włączać biegi automatycznie po podłączeniu Zwift Click, wymuszać ich działanie lub pozwalać na jazdę na fizycznej kasecie.
- **Virtual ghost** jedzie według czasów GPX, domyślnego tempa lub mocy 100% albo 85% FTP. **Second ghost: personal best** odtwarza rekord, najlepszy zapisany odcinek lub wybrany przejazd tej samej trasy z dziennika. Pacerzy sterowani przez aplikację jadą w kilku tempach. Rywali można śledzić na drodze i w HUD.
- Jazdę można rozpocząć, wstrzymać, wznowić, skończyć ręcznie lub dojechać do mety. Pauza zatrzymuje liczniki i zegar treningu. Jeśli aplikacja steruje trenażerem, pauza zleca neutralne obciążenie. **Restart route** wraca do początku trasy.

| Sterowanie | Działanie podczas jazdy |
| --- | --- |
| **↑ / ↓** | Zwiększa lub zmniejsza moc symulacji. Przy zewnętrznym źródle mocy klawisze sterują biegami wirtualnymi, gdy są aktywne. |
| **Q / E** lub przyciski **− / +** w HUD | Lżejszy lub cięższy bieg |
| **C** | Zmienia widok za kolarzem, z kierownicy lub z góry |
| **Esc** | Otwiera lub zamyka menu |
| **Gamepad** | **L1** albo kierunek w dół lub lewo zmienia bieg na lżejszy. **R1** albo kierunek w górę lub prawo zmienia go na cięższy. |

## Bluetooth i sterowanie oporem

| Sprzęt lub protokół | Co obsługuje OskiRide |
| --- | --- |
| **Smart trainer z FTMS** | Odczyty mocy i kadencji, symulację nachylenia (SIM) i utrzymywanie mocy docelowej (ERG). Aplikacja może użyć poziomu oporu, gdy urządzenie udostępnia tę metodę. |
| **Tacx FE-C przez BLE i Wahoo Direct BLE** | Implementacje protokołów dla wybranych urządzeń. Działanie odczytu i komend oporu zależy od modelu. |
| **Miernik mocy Bluetooth (CPS)** | Moc z pedałów, korby lub innego miernika. Kadencja jest dostępna, gdy urządzenie przekazuje obroty korby. |
| **Czujnik prędkości lub kadencji (CSC)** | Odczyty z koła lub korby. Prędkość koła można wykorzystać do oszacowania mocy zPower. |
| **Pulsometr Bluetooth (Heart Rate Service)** | Tętno w trakcie jazdy i w zapisanej telemetrii, jeśli dane są dostępne. |
| **Zwift Click V1 i V2** | Bezpośrednie parowanie, wirtualne biegi i odczyt baterii, jeśli manetka go udostępnia. Lewą i prawą Click V2 paruje się osobno. |

- **SIM** dostosowuje opór do nachylenia. W **Trainer difficulty** zmienisz siłę odwzorowania nachylenia od 0 do 100%. **Downhill resistance** ustawia minimalne nachylenie przesyłane na zjazdach. **Resistance response** reguluje szybkość zmian.
- **ERG** steruje trenażerem tak, aby utrzymał moc docelową. **ERG interval transition** pozwala wybrać zmianę natychmiastową lub rampę 3 s. **Power smoothing** ustawia wygładzanie wyświetlanej mocy na 1, 3 lub 5 s. Aplikacja wybiera jeden tryb sterowania na dany moment. W blokach `FreeRide` używa SIM.
- **zPower** przelicza prędkość z czujnika według jednej z 18 krzywych dostępnych w **Devices**. W bazie są profile klasycznych trenażerów magnetycznych i płynowych, rolek oraz roweru stacjonarnego. Miernik mocy i czujnik prędkości dostarczają dane. Regulacja oporu wymaga trenażera z funkcją sterowania.
- **Device check** sprawdza świeże odczyty mocy, kadencji i tętna przez 30 s. Osobną próbę oporu na 5 s uruchamiasz ręcznie i potwierdzasz, czy czuć zmianę. **Calibrate** otwiera procedurę wybiegu **Spindown**.
- Po utracie połączenia z używanym trenażerem aplikacja wstrzymuje jazdę i trening oraz blokuje automatyczne przejście na moc z klawiatury. Po ponownym połączeniu wznowienie wymaga wybrania **Resume ride**. Kropka na HUD sygnalizuje stan połączenia i otwiera **Devices**.
- W **Bluetooth controllers → Button mapping and test** możesz przypisać dodatkowe przyciski do menu, kamery, pauzy lub biegu. Na Click V2 domyślnie **Z** otwiera menu, strzałki lewej manetki przesuwają zaznaczenie, a **B** zatwierdza. **Test buttons** pokazuje, który przycisk jest wciśnięty. HUD ostrzega o utracie łączności i odczytanym poziomie baterii 20% lub mniej.

Zgodność odczytów i reakcji oporu sprawdź na swoim urządzeniu. Testy programowe z atrapami BLE weryfikują przepływ komend. [Trenażery i Bluetooth](Trenazery-i-Bluetooth.md) · [Manetki i skróty](Manetki-Zwift-Click.md)

## Treningi i dane podczas wysiłku

- Wbudowane plany w **Workouts** obejmują **Sweet Spot 2×15 min**, **VO₂ Max 5×3 min**, **Tabata HIIT 2×**, **Over-Unders 2×9 min** i **Zone 2 Endurance**.
- **Import workout** wczytuje ZWO, MRC i ERG. Aplikacja obsługuje interwały, rampy, rozgrzewkę, schłodzenie, powtórzenia i odcinki swobodne w obsługiwanych formatach. Moc docelowa może wynikać z procentu FTP lub wartości w watach. Import wybiera plan, a **Start workout** rozpoczyna trening.
- Baner treningu pokazuje bieżący krok, pozostały czas, docelową moc i kadencję, jeśli plan ją określa. Gdy aktywujesz **ERG mode** i połączysz sterowalny trenażer, plan przekazuje mu moc docelową. Z klawiaturą lub jednostką zPower można śledzić plan i samodzielnie dostosowywać wysiłek. [Treningi i dziennik](Treningi-i-Dziennik-Postepow.md)

## Podsumowanie, historia i eksport

- **Ride summary** pokazuje czas, dystans, przewyższenie, moc średnią i W/kg, kadencję, tętno, energię oraz wynik względem rywala. Dostępne są **NP, IF, TSS, VI i EF**, rozkład czasu w strefach Coggana **Z1–Z7** oraz krzywa mocy z wartościami **Pmax, 5 s, 15 s, 1 min, 5 min i 20 min**. Widok zawiera wykres telemetrii oraz szacunki wykorzystania węglowodanów, tłuszczu i utraty płynów.
- **Journal** pokazuje zakończone przejazdy zapisane lokalnie, jeśli jazda zawiera próbki i pamięć aplikacji jest dostępna. Filtry obejmują trasę oraz okres. Wykresy tygodniowe i miesięczne pokazują dystans, czas, przewyższenie oraz najlepszą moc 5 i 20 min. Z dziennika możesz otworzyć podsumowanie zapisanej jazdy, pobrać jej plik lub usunąć wpis.
- **Compare rides** porównuje dwa zapisy w tabeli i na wykresach mocy, tętna, kadencji, prędkości i wysokości. Oś pozioma może przedstawiać czas lub przejechany dystans. Dla zgodnej trasy dostępne jest też porównanie według miejsca na trasie.
- **Download FIT** i **Download TCX** zapisują aktywność w pliku. Eksport zawiera dostępne próbki GPS i telemetrii, w tym moc, kadencję, prędkość, wysokość oraz tętno. **Open Strava** otwiera stronę ręcznego przesłania pobranego pliku.

## Sceneria, rower i wydajność

- **Settings → Compare rider models** otwiera **Rider Studio** z modelami **Velocity**, **Alpine**, **Nocturne** i **Heritage**. Możesz zmienić pozę i kadencję w podglądzie, obrócić modele, przybliżyć widok i wybrać model do jazdy.
- Sylwetka reaguje na kadencję, wybieg, sprint i przechył w zakrętach. Dostępne są widok za kolarzem, widok z kierownicy oraz kamera nad trasą, a także ustawienie pola widzenia. Przy szybkiej jeździe i sprincie gra dodaje efekty prędkości.
- Świat obejmuje niebo 3D, oświetlenie PBR, odbicia na lakierze, góry, tunele, las, zabudowę, oznakowanie, bramy LED i 12 animowanych modeli kibiców. **Time of day** pozwala wybrać dzień, płynne przejście w zachód, zachód lub noc. **Weather and road surface** zmienia wygląd suchej i mokrej szosy oraz efekty deszczu i śniegu.
- W **Graphics quality** wybierzesz **Low**, **Standard** lub **High**. Automatyczne dopasowanie grafiki może ograniczyć cienie i zasięg scenerii przy dłuższych spadkach płynności oraz stopniowo przywrócić szczegóły. Licznik FPS umożliwia sprawdzenie wyniku na własnym komputerze.
- **Alpe d’Huez crowd audio** włącza doping w okolicy zakrętu 7 i pozwala zmieniać jego głośność. [Świat 3D i grafika](Trasy-GPX-i-Swiat-3D.md)

## Dane lokalne, odzyskiwanie i diagnostyka

- Profil kolarza, zapisane trasy, historia oraz wybrane ustawienia trafiają do pamięci lokalnej. Typowy przejazd i podgląd tras działają lokalnie. Plik do Stravy wysyłasz samodzielnie.
- Aplikacja okresowo zapisuje stan aktywnej jazdy. **Restore** przywraca przerwaną sesję w pauzie wraz z zapisaną trasą, licznikami i planem. Sprzęt można podłączyć ponownie w **Devices**.
- **Settings → Logs** pokazuje oddzielne logi jazd. Zapis obejmuje stan sesji, połączenia, zdarzenia sterowania, błędy i próbki wydajności. **Download ride logs** pobiera raport JSON z wybranej jazdy. Przed udostępnieniem przejrzyj raport, który może zawierać nazwę trasy i urządzenia. [Architektura, testy i FAQ](Architektura-i-FAQ.md)

## Uruchomienie ze źródeł

Publiczne wydanie 1.0.1 to instalator Windows 10/11 x64. Repozytorium zawiera też serwer lokalny, powłokę Electron, testy regresji oraz zasoby 3D, w tym materiały Blender i logo do druku 3D. Działanie Web Bluetooth w trybie przeglądarkowym zależy od przeglądarki, systemu i adaptera. [Instalacja lub uruchomienie ze źródeł](Instalacja-i-Uruchomienie.md) · [Materiały graficzne](../grafika/README.md)
