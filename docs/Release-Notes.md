# OskiRide 1.0.1 for Windows

**Ride beyond the room.**

OskiRide is a 3D indoor cycling simulator for Windows. Ride a built-in route, import your own GPX file, or follow a structured workout. Pair your Bluetooth smart trainer or try a ride with keyboard-controlled power.

## Security and privacy

- The source server listens on loopback and serves a restricted set of application and preview assets.
- The desktop app restricts navigation and Bluetooth selection to the views that use them. It blocks web requests from the app window and opens the Strava upload page in the system browser.
- The packaged app verifies the integrity of its Electron archive. The installer remains unsigned.
- Profiles, routes, and ride history stay on your device. Activity exports and diagnostic logs can contain personal training or device data. [Privacy and ride data](https://github.com/Securityoe/OskiRide/blob/main/wiki/en/Privacy.md)

## Download and ride

1. Under **Assets**, download `OskiRide-Setup-1.0.1-x64.exe` for 64-bit Windows 10 or 11 and save `SHA256SUMS.txt` in the same folder.
2. [Verify the download](#check-the-download-and-windows-smartscreen), then run the installer and launch **OskiRide** from the Start menu.
3. Open **Ride**, choose a route, and select **Start ride**. Without a power device, you start at **0 W**. Press **↑** or move the power slider to get moving. To pair a trainer, power meter, cadence sensor, heart rate monitor, or Zwift Click, open **Devices**.

To try GPX import, download `OskiRide-Sample-Alpine.gpx`, then select it in **Ride → Import GPX**. The synthetic 4.3 km course appears in **My GPX routes**. [Download the sample GPX](https://github.com/Securityoe/OskiRide/releases/download/v1.0.1/OskiRide-Sample-Alpine.gpx)

## Check the download and Windows SmartScreen

The Windows installer for v1.0.1 is unsigned. Microsoft Defender SmartScreen may show a warning when you open it. Download the installer and checksum from the **Assets** section on this release page. [How Windows SmartScreen works](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)

Open PowerShell in the folder containing both files and run these commands.

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath .\OskiRide-Setup-1.0.1-x64.exe).Hash
Get-Content -LiteralPath .\SHA256SUMS.txt
```

Compare the first result with the hash before the installer filename. Letter case does not matter. A match confirms that your file has the same contents as the installer published with this release. If the hashes differ, leave the installer unopened and download both files again from this page. [PowerShell checksum documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-filehash)

## What you can do in OskiRide

- **Explore routes.** Ride five built-in courses, including Alpe d’Huez, or import and organize GPX files. Pick a starting point and follow the minimap, elevation profiles, and climb and turn alerts.
- **Ride with a trainer or keyboard.** Choose a bike and set your weight and FTP. Simulated power starts at 0 W. Ride with pacers, draft behind them, and race a GPX or FTP ghost alongside a saved personal-best effort.
- **Connect equipment.** Pair Bluetooth FTMS trainers, power meters, speed or cadence sensors, heart rate monitors, and Zwift Click V1 or V2. OskiRide includes protocol support for selected Tacx and Wahoo trainers, 18 zPower curves, spindown, and pre-ride sensor and resistance checks.
- **Shift and control the ride.** Use 24 virtual gears with three gearing profiles. Shift with keyboard shortcuts, a gamepad, or a paired Zwift Click. Click V2 also supports menu navigation, button mapping, and a button test.
- **Follow structured workouts.** Choose from five plans or import ZWO, MRC, or ERG files. See the active interval, power target, and cadence target when specified. Supported trainers can follow the route grade in SIM or hold target power in ERG.
- **Review results and export.** See power zones, NP, IF, TSS, peak power, and ride telemetry. Filter your local journal, view weekly or monthly trends, compare two rides, and export FIT or TCX files for manual upload to Strava or another service.
- **Customize the 3D ride.** Choose among four rider models, three cameras, graphics presets, weather, road appearance, and time of day. Adaptive graphics can adjust scenery and shadows. Alpe d’Huez has crowd audio near bend 7.
- **Recover interrupted rides and diagnose issues.** Restore a saved ride in pause, resume manually after a trainer disconnect, and download JSON logs for individual rides.

Settings, routes, and ride history are stored on your device. Bluetooth compatibility and resistance response depend on your equipment. The interface is primarily in English. [Complete feature guide](https://github.com/Securityoe/OskiRide/blob/main/wiki/en/Features.md) · [Installation and first ride](https://github.com/Securityoe/OskiRide/blob/main/wiki/en/Installation.md) · [Troubleshooting](https://github.com/Securityoe/OskiRide/blob/main/wiki/en/Troubleshooting.md)

For help, include your Windows version, device model, and steps to reproduce the issue. [Report an issue](https://github.com/Securityoe/OskiRide/issues)

## Screenshots

Watch OskiRide start from **0 W**, shift up a virtual gear, and switch to the overhead camera on Alpe d’Huez. [Watch the ride demo in the README](https://github.com/Securityoe/OskiRide#ride-demo) · [Download the MP4](https://github.com/Securityoe/OskiRide/releases/download/v1.0.1/OskiRide-Ride-Demo.mp4)

**Alpe d’Huez.** Follow the pace ghost and track the climb on the minimap and elevation profiles.

![OskiRide on Alpe d’Huez with the ride HUD and pace ghost in view](https://raw.githubusercontent.com/Securityoe/OskiRide/main/docs/media/screenshots/alpe-dhuez-ride.png)

| Route selection | Ride comparison |
| --- | --- |
| <img src="https://raw.githubusercontent.com/Securityoe/OskiRide/main/docs/media/screenshots/routes-and-gpx.png" alt="The Ride tab with built-in routes and a saved GPX route" width="360"> | <img src="https://raw.githubusercontent.com/Securityoe/OskiRide/main/docs/media/screenshots/ride-comparison.png" alt="The Journal comparing power and ride metrics for two sessions" width="360"> |
| Choose a built-in course or import a GPX file in **Ride**. | Use **Journal** to compare power and other metrics across two saved rides. |

See Bluetooth pairing, riding in the rain, the workout library, an active interval, the ride summary, and Rider Studio in the complete gallery. [Explore all nine screenshots](https://github.com/Securityoe/OskiRide/blob/main/wiki/en/Screenshots.md) · [Workout in progress](https://github.com/Securityoe/OskiRide/blob/main/wiki/en/Screenshots.md#workout-in-progress)
