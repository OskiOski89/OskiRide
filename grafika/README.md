# Cztery propozycje kolarza OskiRide

Podgląd porównawczy: [grafika/index.html](index.html), po uruchomieniu `node server.js` pod adresem `http://localhost:8080/grafika/index.html`.

| Wariant | Kierunek wizualny | Model |
| --- | --- | --- |
| 01 Velocity | Miedziany strój z jasnym blokiem, piaskowa rama, kask race | `kolarz-01-velocity.glb` |
| 02 Alpine | Zieleń, ukośny panel, wentylowany kask, niższy profil obręczy | `kolarz-02-alpine.glb` |
| 03 Nocturne | Granat, złote linie, zamknięty kask aero, głębokie obręcze | `kolarz-03-nocturne.glb` |
| 04 Heritage | Kremowy strój z klubowymi pasami, smukła czerwona rama | `kolarz-04-heritage.glb` |

## Jedna kinematyka

`kinematyka.js` zawiera wspólny solver pochodzący z poprzedniego `src/world/cyclistAvatar.js`. Poprawiony kierunek pedałowania zmniejsza fazę korby przy dodatniej kadencji: w układzie +Z do przodu przedni pedał opada, a górny przesuwa się do przodu. Wszystkie cztery warianty używają tego samego solvera przez adapter `kolarz.js`. Adapter odwzorowuje pozycje i obroty na wspólny szkielet postaci oraz koła, korbę i pedały nowego modelu. Nie ma czterech osobnych solverów ani innej fizyki dla poszczególnych strojów.

Modele mają skórkowaną siatkę postaci, 15 sterowanych kości i główną kość szkieletu. Geometria zmienia wygląd stroju, kasku, sylwetki i roweru. Znak obrotu korby jest przeliczany między układem współrzędnych modelu a wspólną fazą pedałów. Klip `Pedal_Seated_60rpm` w GLB służy do przenośnego podglądu; aplikacja nadal steruje szkieletem z tej samej kinematyki na żywo.

Strona porównawcza ma wspólną kamerę, kadencję, pozycję i pauzę. Wybór jest zapisywany lokalnie pod kluczem `oskiride-cyclist-design`. Przycisk „Jedź wybranym” wraca do aplikacji z wybranym wyglądem. Z menu ustawień aplikacji można wrócić do porównania.

Loader pobiera świeży `modele.json` i dodaje skrót zawartości GLB do adresu każdego modelu. Dzięki temu poprzedni model z pamięci przeglądarki nie zastępuje nowego pliku po ponownym otwarciu strony. Do już otwartej karty jazdy nowa siatka trafia po odświeżeniu tej karty; odświeżenie samej galerii nie zmienia trwającej sesji jazdy w innej karcie.

## Pliki i odtworzenie

- `kolarz.blend` — edytowalna scena Blendera z czterema wariantami, szkieletami i animacjami.
- `kolarz.glb` — domyślny model Velocity, identyczny z plikiem wariantu 01.
- `modele.json` — materiały, nazwy plików, rzeczywiste rozmiary i budżet geometrii. Każdy wariant ma około 28,6 tys. trójkątów i około 745 KiB; model używa 30 wywołań rysowania przed dodatkowymi przebiegami cieni.
- `podglad-4-propozycje.png` — zrzut działającego podglądu.

Z katalogu projektu:

```powershell
npm --prefix tools/3d ci
node tools/3d/build-cyclists.mjs
./tools/3d/blender.ps1 --background --python grafika/przygotuj_blendera.py
node tools/3d/validate-models.mjs
```

Generator nadpisuje własne pliki wariantów i domyślny GLB. Skrypt Blendera nadpisuje `kolarz.blend`; zachowaj osobną kopię przed ręczną pracą artystyczną.

Modele i ich geometria są przygotowane dla OskiRide, bez importowania modeli postaci lub rowerów innych produktów. Lokalna kopia Three.js 0.160.0 oraz jej loader i narzędzia mają licencję w `vendor/LICENSE`. Aplikacja i podgląd korzystają z tej samej wersji silnika bez pobierania go z CDN.

## Kontrola

Od 30.10.2026 wspólna kinematyka wykrywa nagły wzrost mocy i przełącza postać w sprint również przy wysokiej kadencji. Używa bieżącej mocy i FTP, własnego filtra, podtrzymania oraz płynnego powrotu do siodła. Ustalona jazda na wprost w siodle nie dodaje kołysania. `roadLeanApplied` rozdziela pochylenie drogi w grze i podglądzie.

Oficjalny walidator glTF: 4 pliki, 0 błędów, 0 ostrzeżeń. `tools/3d/verify-variants.browser.js` porównuje pozycje czterech modeli ze wspólnym solverem w siedmiu scenariuszach: postój, pedałowanie, stanie, zjazd oraz skręty w obie strony. Sprawdza też kierunek pedałowania, wagi szkieletu i zgodność trybu Ducha oraz przedniej lampki. Skrypt jest przeznaczony do polecenia `playwright-cli run-code`. `npm --prefix tools/3d run test:pedalling` niezależnie sprawdza kierunek obu nóg, okres obrotu, jazdę bez pedałowania i kierunek animacji zapisanych w czterech GLB.
