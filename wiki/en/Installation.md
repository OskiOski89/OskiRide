# Installation and first ride

## Windows installer

1. Download `OskiRide-Setup-1.0.1-x64.exe` and `SHA256SUMS.txt` from **Assets** into the same folder. [OskiRide 1.0.1 release](https://github.com/Securityoe/OskiRide/releases/tag/v1.0.1)
2. [Verify the download](#check-the-download-and-windows-smartscreen) and run the installer on 64-bit Windows 10 or 11. The package includes Electron and the 3D assets.
3. Open **OskiRide** from the Windows Start menu. A Bluetooth Low Energy adapter is needed to pair Bluetooth equipment.

### Check the download and Windows SmartScreen

The 1.0.1 installer is unsigned, so Microsoft Defender SmartScreen may show a warning. Open PowerShell in the folder where you saved both files. [How Windows SmartScreen works](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath .\OskiRide-Setup-1.0.1-x64.exe).Hash
Get-Content -LiteralPath .\SHA256SUMS.txt
```

Compare the first result with the hash in front of the installer filename. Letter case does not matter. Matching hashes confirm that the file contents match the published installer. If they differ, leave the installer unopened and download both files again from the release. [PowerShell checksum documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-filehash)

## First ride

1. In **Settings**, enter your name, FTP in watts, and body weight in kilograms. Pick an aero road, time trial, or MTB/gravel bike.
2. If using Bluetooth equipment, open **Devices** and pair your trainer or sensors. **Device check** offers a 30-second readings check and a separate 5-second resistance test. [Pairing and equipment](Equipment.md)
3. Choose **Ride** for a built-in or imported GPX route, or **Workouts** for a built-in plan or imported ZWO, MRC, or ERG file.
4. Choose **Start ride** or **Start workout**. Simulated power starts at **0 W**. Use **↑** and **↓** or the **Power** slider to set it. [All features and controls](Features.md)

### Try a sample GPX

1. Download `OskiRide-Sample-Alpine.gpx`, a synthetic 4.3 km route also shown in the screenshot gallery. [Download the sample GPX](https://github.com/Securityoe/OskiRide/releases/download/v1.0.1/OskiRide-Sample-Alpine.gpx) · [GPX library screenshot](Screenshots.md#route-selection-and-gpx-library)
2. In OskiRide, open **Ride → Import GPX** and select the downloaded file. Confirm that it appears in **My GPX routes**.
3. Use **Start location** to pick a point along the elevation profile, then select **Start ride**.

## Run from source in a browser

Use Node.js 24 LTS and a WebGL-compatible browser. Bluetooth requires Web Bluetooth support, an available adapter, and system permissions. Chrome and Edge are the browser options documented for this project. The bundled Three.js modules and loaders are in `grafika/vendor/`.

From the repository root, run `npm start` or `node server.js`. The local server uses port 8080. [Open OskiRide](http://localhost:8080/index.html) · [Open Rider Studio](http://localhost:8080/grafika/index.html)

The server listens on your computer's loopback interface and serves the app and bundled previews. [Privacy and ride data](Privacy.md)

## Run or build the Electron app

```powershell
npm ci
npm run desktop
```

Run `npm run build:win` to build the Windows x64 installer in `dist/`. The project also includes the `npm run build:mac` target. The published 1.0.1 installer is for Windows. [Troubleshooting and tests](Troubleshooting.md)
