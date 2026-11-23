# Troubleshooting, tests, and architecture

## Common problems

| Symptom | What to check |
| --- | --- |
| Windows shows a SmartScreen warning | Download the executable and checksum from the release and verify the file. [Verification steps](Installation.md#check-the-download-and-windows-smartscreen) |
| The rider waits at the start | Keyboard simulation starts at 0 W. Press **↑** or move the **Power** slider, or check that a connected power device is sending readings. |
| A trainer or sensor does not appear | Check the BLE adapter and operating system permissions. Close other apps that may be using the device and try **Devices** again. |
| You see watts but the resistance does not change | Check the device’s control support and selected mode. Use the separate resistance test in **Device check**. |
| The ride paused after a disconnect | Reconnect the trainer and choose **Resume ride**. |
| The frame rate drops | Try **Low** graphics or enable adaptive scenery and shadows. |
| An interrupted ride is offered at startup | Select **Restore** to bring it back paused. Reconnect any equipment you need before resuming. |

If you need to report a problem, use **Settings → Logs → Download ride logs**. The JSON can include your device and route names, so review it before sharing. Include your Windows version, equipment model, and steps to reproduce the issue. [GitHub Issues](https://github.com/Securityoe/OskiRide/issues)

## Run the regression tests

```powershell
npm ci
npm ci --prefix tools/3d
node --test tests/security/server.test.cjs
npm run test:consistency
```

The suite uses Microsoft Edge and BLE test doubles. It checks browser behavior, settings, session handling, and FIT/TCX output. Use real hardware to confirm pairing and resistance on a particular trainer.

## Where the code lives

| Source | Responsibility |
| --- | --- |
| `index.html`, `style.css`, `src/main.js` | Interface, HUD, ride loop, camera, and telemetry |
| `src/gpx/` and `src/physics/` | GPX processing, built-in routes, climb detection, and riding physics |
| `src/ble/` | Trainers, sensors, and Zwift Click controllers |
| `src/workouts/` | Training plans, workout file import, and SIM/ERG selection |
| `src/session/`, `src/ui/`, and `src/diagnostics/` | Ride state, recovery, history, journal charts, and logs |
| `src/world/` and `grafika/` | Road, terrain, lighting, adaptive graphics, rider and spectator assets |
| `src/export/` | FIT and TCX activity export |
| `server.js` and `electron-main.js` | Local server and desktop wrapper |
| `tools/3d/` | Blender helpers, glTF validators, and browser test tooling |

[Documentation index](README.md) · [Full feature guide](Features.md)
