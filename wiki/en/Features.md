# OskiRide 1.0.1 features

OskiRide is a local 3D indoor cycling simulator. Ride a GPX route, follow a structured workout, or race one of your saved efforts. You can control power with the keyboard or ride using readings from Bluetooth equipment. [Download for Windows x64](https://github.com/Securityoe/OskiRide/releases/tag/v1.0.1) · [Installation and download verification](Installation.md)

## Find your way around

| To do this | Open |
| --- | --- |
| Pick a route, import GPX, or choose where to start | **Ride** |
| Pick a built-in workout or import a workout file | **Workouts** |
| Pair a trainer, sensor, or controller | **Devices** |
| Check live readings and test trainer resistance | **Device check** |
| Set up your rider, trainer, graphics, or ghosts | **Settings** |
| Look up previous rides, see trends, or compare efforts | **Journal** |
| View diagnostic events and export a log | **Settings → Logs** |

In **Settings**, enter your FTP and body weight, select your bike type, and optionally change your rider name and jersey color. Choose a route in **Ride** and select **Start ride**. Keyboard simulation starts at **0 W**. Press **↑** or use the **Power** slider to get moving. In 1.0.1, a few labels are in Polish, including the handlebar camera label and the button for adding favorite routes.

## Routes and GPX

| Built-in course | Terrain |
| --- | --- |
| **Alpine Pass** | Mountain pass with a KOM climb, tunnels, and a descent |
| **Alpe d’Huez** | A GPX-based 13.9 km HC climb with 21 numbered bends |
| **Winding Switchbacks** | A technical course with tight turns and two climbs |
| **Interval Valley** | Rolling terrain with short climbs for changes of pace |
| **Flat Time Trial** | Flat terrain for time trials and steady efforts |

- Select **Import GPX** or drag a GPX file into the app window. OskiRide builds a rideable road from the track, calculates distance and grade, and smooths the elevation profile. It also reads named waypoints and uses GPX timestamps when present.
- **My GPX routes** keeps imported routes on your device. Reopen, rename, favorite, search, or delete a route. Reimporting the same file contents keeps the existing entry. **Ride history** opens saved rides for the selected route.
- Set **Start location** or click the elevation profile to start at a different point. While riding, the heads-up display (HUD) shows the minimap, full elevation profile, and grade for the next 1.5 km. Turn and climb alerts show the distance ahead. Climb details show the remaining distance and elevation gain to the summit.
- Climbs receive an **HC or Category 1–4** rating. Gates and signs mark the start, route sections, KOM summits, and finish. [Routes and 3D scenery](Routes-and-Graphics.md)

## Riding, controls, and ghosts

- Speed depends on power, rider and bike weight, grade, rolling resistance, and aerodynamic drag. The simulation accounts for the direction of the wind. Drafting behind a pacer reduces aerodynamic drag. Choose an aero road bike, time trial bike, or MTB/gravel bike.
- The HUD shows power in watts and W/kg, speed, cadence, heart rate from a connected sensor, gear, time, distance, elevation gain, and grade. It also shows power zones, cadence cues, wind, rider gaps, and data sources. **Ride panel** switches between controls with charts and charts only.
- **Virtual shifting** provides 24 gears and three **Gear ratios** profiles for all-round road riding, climbing, or time trials. Set virtual shifting to **Auto (Zwift Click)**, **Always on (Cog / keyboard)**, or **Off (physical cassette)**.
- **Virtual ghost** follows GPX timestamps, a default pace, or a target of 100% or 85% FTP. **Second ghost: personal best** replays a route record, best saved segment, or selected ride on that route. Pacer riders have different target paces. You can follow riders on the road and in the HUD.
- Start, pause, resume, finish manually, or ride to the finish line. Pausing stops the ride and workout timers and requests neutral resistance when OskiRide is controlling the trainer. **Restart route** returns you to the beginning.

| Control | Action |
| --- | --- |
| **↑ / ↓** | Raise or lower simulated power. With an external power source, these keys shift virtual gears when enabled. |
| **Q / E** or **− / +** on the HUD | Shift to an easier or harder gear |
| **C** | Cycle between chase, handlebar, and overhead views |
| **Esc** | Open or close the menu |
| **Gamepad** | **L1**, down, or left shifts to an easier gear. **R1**, up, or right shifts to a harder gear. |

## Bluetooth and resistance control

| Equipment or protocol | What OskiRide supports |
| --- | --- |
| **FTMS smart trainer** | Power and cadence readings, grade-based resistance (SIM), and target power (ERG). A trainer may also expose resistance level control. |
| **Tacx FE-C over BLE and Wahoo Direct BLE** | Protocol support for selected devices. Available readings and resistance commands depend on the model. |
| **Bluetooth power meter (CPS)** | Power readings and cadence when the meter sends crank revolution data. |
| **Speed or cadence sensor (CSC)** | Wheel and crank readings. Wheel speed can be used to estimate power with zPower. |
| **Bluetooth heart rate monitor** | Heart rate in the HUD and recorded ride data when a sensor provides it. |
| **Zwift Click V1 and V2** | Direct pairing, virtual shifting, and battery readings when available. Pair the left and right Click V2 controllers separately. |

- **SIM** adjusts resistance based on grade. **Trainer difficulty** scales the grade effect from 0% to 100%. **Downhill resistance** limits the minimum grade sent to the trainer, and **Resistance response** adjusts how quickly it changes.
- **ERG** adjusts resistance to hold a target power. **ERG interval transition** offers an immediate change or a 3-second ramp. **Power smoothing** offers 1-, 3-, and 5-second display settings. The app uses one control mode at a time and switches to SIM for `FreeRide` blocks.
- **zPower** estimates watts from wheel speed using one of 18 curves in **Devices**. The profiles cover classic magnetic and fluid trainers, rollers, and stationary bikes. A controllable trainer is required for automatic resistance changes.
- **Device check** looks for fresh power, cadence, and heart rate readings for 30 seconds. Start the separate 5-second resistance test and confirm whether you feel a change. **Calibrate** opens the guided **Spindown** procedure.
- If the trainer disconnects during a ride, the app pauses the ride and workout. Reconnect and select **Resume ride** to continue. The connection indicator in the HUD opens **Devices**.
- **Bluetooth controllers → Button mapping and test** allows you to assign extra buttons to shifting, camera, pause, or menu actions. On Click V2, **Z** toggles the menu by default, the left arrows move the selection, and **B** confirms it. **Test buttons** shows which physical button was pressed. Ride alerts cover disconnects and battery readings at or below 20%.

Physical readings and changes in resistance depend on the connected equipment. Automated BLE tests exercise the app’s command paths. [Equipment, pairing, and troubleshooting](Equipment.md)

## Structured workouts

- **Workouts** includes **Sweet Spot 2×15 min**, **VO2 Max 5×3 min**, **Tabata HIIT 2×**, **Over-Unders 2×9 min**, and **Zone 2 Endurance**.
- **Import workout** supports ZWO, MRC, and ERG files. Supported blocks include steady efforts, intervals, ramps, warm-ups, cool-downs, repeats, and free riding. Power can be specified as a percentage of FTP or in watts, depending on the format. Import selects a plan. Choose **Start workout** when ready.
- The workout banner shows the current step, countdown, power target, and cadence target when specified. Enable **ERG mode** to send the power target to a supported trainer. You can also follow the workout by adjusting your effort manually, including with keyboard power or zPower. [Workout and activity guide](Workouts-and-Journal.md)

## Ride summary, journal, and export

- **Ride summary** shows time, distance, elevation gain, average power, W/kg, cadence, heart rate, energy, and results against a ghost. It includes **NP, IF, TSS, VI, and EF**, time in Coggan zones **Z1–Z7**, and best power for **Pmax, 5 s, 15 s, 1 min, 5 min, and 20 min**. The summary also displays ride traces and estimated carbohydrate use, fat use, and fluid loss.
- **Journal** lists completed rides saved locally when telemetry and storage are available. Filter by route or date. Group distance, ride time, elevation gain, and best 5- or 20-minute power by week or month. Open a saved ride to view its summary, export a file, or delete the entry.
- **Compare rides** shows two saved activities side by side. It plots power, heart rate, cadence, speed, or elevation against ride time or distance ridden. Matching routes also support comparison by position on the route.
- **Download FIT** and **Download TCX** export available GPS and telemetry samples, including power, cadence, speed, elevation, and heart rate. **Open Strava** takes you to the page where you can upload a file manually.

## 3D scenery, rider models, and graphics

- **Settings → Compare rider models** opens Rider Studio. Compare **Velocity**, **Alpine**, **Nocturne**, and **Heritage**, change pose and cadence, rotate and zoom the preview, and select a model for the ride.
- Rider animation responds to pedaling, coasting, sprints, and cornering lean. Use chase, handlebar, or overhead cameras and adjust the field of view. High-speed riding and sprints add speed effects.
- The scene includes a 3D sky, physically based rendering (PBR), frame reflections, mountains, tunnels, forests, buildings, signs, LED gates, and 12 animated spectator models. **Time of day** offers day, day to sunset, sunset, and night. **Weather and road surface** changes the look of the road and adds rain or snow effects.
- **Graphics quality** offers **Low**, **Standard**, and **High**. Adaptive graphics can reduce shadows and scenery range during sustained frame-rate drops and gradually restore detail. Use the FPS counter to check performance on your system.
- **Alpe d’Huez crowd audio** plays near bend 7. You can turn it on or off and set its volume. [Routes and graphics guide](Routes-and-Graphics.md)

## Local data, recovery, and diagnostics

- Rider settings, routes, ride history, and preferences are stored on your device. You can ride and preview routes locally. Uploads to Strava use the manual file upload page.
- OskiRide periodically saves the active ride. **Restore** brings back the route, counters, and workout plan in a paused state. Reconnect your equipment in **Devices** and choose **Resume ride**.
- **Settings → Logs** lists individual ride logs with session events, connection changes, control changes, errors, and performance samples. **Download ride logs** saves a JSON report. Review it before sharing because it can contain your route and equipment names. [Troubleshooting, tests, and architecture](Troubleshooting.md)

## Run from source

The 1.0.1 download is a Windows 10/11 x64 installer. The repository also includes a local server, an Electron wrapper, regression tests, and 3D assets, including Blender source files and printable logo models. Web Bluetooth availability in browser mode depends on the browser, operating system, and adapter. [Installation, source setup, and build commands](Installation.md)
