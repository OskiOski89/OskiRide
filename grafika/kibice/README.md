# Kibice OskiRide

Dwanaście autorskich postaci w publicznym wydaniu OskiRide. Kolory materiałów są zapisane w geometrii.

| Model | Gest / akcesoria | Trójkąty |
| --- | --- | ---: |
| `01-machanie.glb` | Machanie, zielona czapka | 2698 |
| `02-oklaski.glb` | Klaskanie | 3082 |
| `03-szalik.glb` | Uniesiony szalik, okulary | 2794 |
| `04-flaga.glb` | Flaga Polski, kucyk | 2698 |
| `05-doping.glb` | Obie ręce w górze, podskok | 2442 |
| `06-kibicka.glb` | Machanie, fryzura bob | 2642 |
| `07-fotograf.glb` | Fotografowanie, aparat, kapelusz, kamizelka | 2962 |
| `08-dzwonek.glb` | Potrząsanie dzwonkiem, broda, szorty | 2954 |
| `09-bidon.glb` | Doping z bidonem, kurtka, kucyk | 2958 |
| `10-tablica.glb` | Uniesiona tablica z oficjalnym logo OskiRide | 4486 |
| `11-mlody-kibic.glb` | Podskoki, bluza z kapturem, niższa sylwetka | 3502 |
| `12-megafon.glb` | Megafon, siwa broda, okulary, kamizelka | 3070 |

- `podglad-nowi.png`: sześć nowych postaci w zbliżeniu.
- `kibicka-logo.png`: zbliżenie kibicki trzymającej logo OskiRide.
- `modele.json`: katalog modeli i parametry.
- `walidacja.json`: wyniki walidacji glTF oraz kontroli animacji i skali.

Jednostka: metr. GLB: oś Y w górę, przód postaci +Z. Początek każdego pojedynczego modelu jest na ziemi między stopami. Sylwetki mają około 1,4–1,9 m do czubka głowy; podniesione ręce i flaga zwiększają obrys. Każdy GLB ma jeden trzysekundowy klip dopingu, z identyczną pierwszą i ostatnią klatką. To animacje sztywnych segmentów w hierarchii węzłów, bez skórkowanego szkieletu. Szalik ma stały kształt; falowanie flagi jest wymodelowane, a jej ruch wynika z ruchu ręki.

Tablica modelu `10-tablica` używa oryginalnego obrysu znaku OR oraz napisu OskiRide z plików `grafika/marka-oskiride/druk-3d/oskiride-znak-OR.stl` i `oskiride-napis.stl`. Zawiera tylko przednie trójkąty tych wzorców, bez dodatkowych tekstur. Logo ma zatwierdzone kolory #F2C94C i #234C3B na kremowym tle. Kształty liter i otworów są zachowane także po łączeniu geometrii w grze.

## Użycie w Three.js

```js
const gltf = await loader.loadAsync('/grafika/kibice/01-machanie.glb');
const fan = gltf.scene;
scene.add(fan);
const mixer = new THREE.AnimationMixer(fan);
mixer.clipAction(gltf.animations[0]).play();
// W pętli klatek: mixer.update(deltaSeconds).
```

Do niezależnie animowanych kopii użyj `gltf.scene.clone(true)` i osobnego miksera dla każdej kopii. Materiały i geometria pozostają współdzielone. Zróżnicuj czas początkowy animacji.

## Integracja w grze

`src/world/worldBuilder.js` zastępuje wcześniejszych kibiców tym zestawem przy bufetach, szczytach KOM i mecie. Strefa wyznacza liczbę par z `ceil(SPECTATOR_DESIGNS.length / 2)`, obecnie sześć, i wybiera kolejne postacie z zestawu. Ostateczna liczba zależy od miejsca: wspólny system rozmieszczania scenerii odrzuca kolizje z szosą i innymi obiektami. Kibice omijają tunele, patrzą na drogę i stoją na wysokości `getEmbankmentY`. Obrys całej animacji jest rezerwowany przed pobraniem GLB. Każda postać trafia do swojego sektora dystansu.

`src/world/spectatorCrowd.js` pobiera każdy wariant raz z wersjonowaniem według skrótu GLB z `modele.json`. Łączy statyczne powierzchnie w geometrię z kolorami wierzchołków, zachowując animowane węzły, również bezpośrednio animowane rekwizyty. W grze postać ma 4–5 siatek. Kopie współdzielą geometrię i materiał, ale mają własne miksery i fazy ruchu. Nie używają instancjonowania GPU.

Odległość widoczności przed kolarzem: 140 m (eco), 300 m (medium), 500 m (ultra); za kolarzem: 90 m. Animacje poza tym zakresem oraz w ukrytych sektorach nie są aktualizowane. Tylko jakość ultra dodaje kibicom cienie rzucane na otoczenie. Po zmianie trasy lub jakości stare miksery są zwalniane; opóźnione pobranie modelu nie dodaje go do nieaktualnego świata. Stara animacja podskakiwania całej grupy z `src/main.js` została zastąpiona ruchem zapisanym w GLB, więc stopy i ustawienie w świecie pozostają niezależne.

## Weryfikacja

Z katalogu projektu:

```powershell
node tools/3d/validate-spectators.mjs
./tools/3d/node_modules/.bin/playwright-cli.cmd -s=spectators open http://localhost:8080
./tools/3d/node_modules/.bin/playwright-cli.cmd -s=spectators run-code --filename tools/3d/verify-spectators.browser.js
```

Test przeglądarkowy porównuje geometrię i animacje po optymalizacji z oryginalnymi GLB, sprawdza 12 modeli publicznych na trasach mountain / switchbacks / rolling / flat oraz trzy poziomy jakości, współdzielenie zasobów, lokalizację na poboczu i w sektorach, ukrywanie oraz sprzątanie mikserów. Serwer OskiRide musi działać przed uruchomieniem Playwright.
