# Narzędzia 3D OskiRide

W tym folderze są narzędzia do przygotowania kolarza z rowerem dla obecnego projektu Three.js. Gotowe modele i ich źródła zapisujemy w `grafika/`.

[Dokumentacja techniczna](../../docs/DOKUMENTACJA_TECHNICZNA.md) opisuje modele i zakres testów.

## Blender i połączenie MCP

Wersja przenośna Blendera LTS i serwer `mcp-for-blender` są instalowane w `%LOCALAPPDATA%/OskiRideTools`. Ścieżki fizyczne tej konkretnej instalacji zapisuje ignorowany przez Git plik `toolchain.local.json`; korzystaj z nich przy uruchamianiu programów. Instalacja nie wymaga zmiany systemowego PATH.

Żeby otworzyć Blendera do samodzielnej pracy, w PowerShell w katalogu projektu:

```powershell
$tc = Get-Content tools/3d/toolchain.local.json -Raw | ConvertFrom-Json
& $tc.blender
```

Dodatek `blender_mcp` musi być włączony w Blenderze. Gdy Blender jest otwarty, panel MCP for Blender w bocznym pasku widoku 3D pokazuje stan połączenia.

Test odczytu sceny przez MCP, przy uruchomionym Blenderze:

```powershell
$tc = Get-Content tools/3d/toolchain.local.json -Raw | ConvertFrom-Json
$mcpPython = Join-Path $tc.toolsRoot 'python-tools/mcp-for-blender/Scripts/python.exe'
$env:PYTHONUTF8 = '1'
& $mcpPython tools/3d/check-mcp.py
```

Do wywołań bez okna:

```powershell
./tools/3d/blender.ps1 --background --python grafika/przygotuj_blendera.py
```

To polecenie odtwarza scenę Blender z istniejących wariantów GLB. Aby najpierw odtworzyć same warianty, wykonaj `npm --prefix tools/3d run build:cyclists`. Generatory nadpisują własne eksporty i scenę; przed ręczną pracą artystyczną zachowaj oddzielną wersję źródeł. Sama konfiguracja narzędzi nie generuje modeli automatycznie.

## Kontrola i optymalizacja GLB

Narzędzia npm mają osobny plik `package.json` i lockfile. Nie zmieniają zależności uruchomieniowych aplikacji. Three.js jest przypięty do wersji 0.160.0, zgodnej z obecną mapą importów w `index.html`.

Po przygotowaniu modelu, z katalogu projektu:

```powershell
npm --prefix tools/3d run inspect -- ../../grafika/kolarz.glb
npm --prefix tools/3d run validate -- ../../grafika/kolarz.glb
npm --prefix tools/3d run optimize -- ../../grafika/kolarz.glb ../../grafika/kolarz-opt.glb
```

Skrypty npm wykonują się w `tools/3d`, stąd prefiks `../../`. Optymalizacja tworzy osobny plik. Porównaj animacje i materiały przed zastąpieniem modelu podstawowego.

Lokalne narzędzie Playwright dla Windows:

```powershell
npm --prefix tools/3d run browser -- --help
```

## Weryfikacja kolizji i generowania trasy

Przy uruchomionym `node server.js` na porcie 8080, zainstalowanych zależnościach tego folderu i Google Chrome, wykonaj z katalogu głównego projektu:

```powershell
node tools/3d/verify-route-world.mjs
```

Skrypt sprawdza kolizje na przypadkach regresji oraz buduje 21 wariantów świata: siedem tras w jakości Eco, Standard i Ultra. Kontroluje geometrię, zakres rysowania przy mecie, bramy START/META, błędy konsoli i czas aktualizacji widoczności. Mierzy też wygładzanie syntetycznej trasy około 100 km. Wyniki i zrzut widoku jazdy zapisuje w `output/route-world/`.

Pomiar aktualizacji widoczności nie obejmuje pełnego renderowania klatki. Szczegóły i wyniki przebiegu z 28.10.2026 opisano w sekcjach 9.7–9.9 [dokumentacji technicznej](../../docs/DOKUMENTACJA_TECHNICZNA.md).

## Odtworzenie narzędzi

```powershell
npm --prefix tools/3d ci
python tools/3d/setup-native.py
```

`setup-native.py` pobiera uv z oficjalnych wydań Astral oraz Blendera 4.5 LTS z serwera Blender Foundation, sprawdza ich sumy SHA256 i zapisuje ścieżki. Instalacja pakietu MCP i włączenie dodatku są osobnymi krokami.

Źródła: [MCP for Blender](https://github.com/ahujasid/mcp-for-blender), [animacje szkieletowe Three.js r160](https://github.com/mrdoob/three.js/blob/r160/examples/webgl_animation_skinning_blending.html), [glTF Transform](https://github.com/donmccurdy/glTF-Transform).
