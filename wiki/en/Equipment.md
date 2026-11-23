# Bluetooth equipment and controls

Open **Devices** to pair your equipment. **Device check** shows whether it is delivering readings. The trainer indicator is gray when disconnected, yellow while connecting or reconnecting, green when connected, and red when the connection drops.

## Hardware compatibility

### Smart trainers and bikes

In **Devices**, use **Find trainer** for these protocols. The readings and controls depend on the services and features your model and firmware expose.

| Trainer or protocol | Readings in OskiRide | Resistance controls in OskiRide |
| --- | --- | --- |
| **Bluetooth FTMS** (`0x1826`) | Power and cadence when available. Trainer speed feeds the spindown display. | SIM grade, ERG target power, or resistance levels when the trainer supports the relevant command |
| **Tacx FE-C over Bluetooth LE** | Power and cadence from FE-C data pages. Trainer speed feeds the spindown display. | SIM grade and ERG target power on models exposing the Tacx FE-C service |
| **Wahoo Direct BLE** | Power or cadence when a supported telemetry service is also available | SIM grade and ERG target power on models exposing the Wahoo Direct control characteristic |

### Sensors and controls

| Equipment | What OskiRide uses | Where to connect |
| --- | --- | --- |
| **Bluetooth power meter** · Cycling Power Service (`0x1818`) | Measured power. Crank data provides cadence when the device sends it. | **Devices → Find power meter** |
| **Bluetooth speed or cadence sensor** · Cycling Speed and Cadence Service (`0x1816`) | Wheel speed, crank cadence, or both. A wheel-speed reading and a selected trainer profile enable [zPower estimates](#zpower-profiles). | **Devices → Speed and zPower → Find sensor** |
| **Bluetooth heart rate monitor** · Heart Rate Service (`0x180D`) | Heart rate. | **Devices → Find heart rate monitor** |
| **Zwift Click V1** | Virtual gear changes and battery level when available. | **Devices → Bluetooth controllers** |
| **Zwift Click V2** | Virtual gear changes, menu navigation, button mapping and testing, and battery level when available. Pair the left and right units separately. | **Devices → Bluetooth controllers** |
| **Gamepad** · Browser Gamepad API | Virtual shifting with the supported buttons or directional pad. | [Gamepad controls](#zwift-click-keyboard-and-gamepad) |

Power meters and speed sensors supply telemetry. Automatic resistance adjustments require a controllable trainer. [Bluetooth service IDs](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Assigned_Numbers/out/en/index-en.html)

### Test coverage

The tables describe the protocols OskiRide implements. Automated checks use BLE test doubles, including simulated trainer commands and simulated Click V1 and V2 input. Model-by-model testing on physical hardware is pending. Use [Device check](#device-check-and-spindown) to check readings and resistance response on your setup. [Test my trainer](https://github.com/OskiOski89/OskiRide/issues/new?template=trainer-test.yml) · [Automated test setup](Troubleshooting.md#run-the-regression-tests)

## SIM and ERG settings

**SIM** sends grade information to the trainer. Adjust **Trainer difficulty** from 0% to 100%, choose a downhill limit, or change **Resistance response**. **ERG** holds the workout or selected power target on compatible hardware. **ERG interval transition** offers a 3-second ramp or an immediate change. **Power smoothing** offers 1-, 3-, or 5-second display settings. A workout’s `FreeRide` block uses SIM.

## zPower profiles

With a compatible speed sensor, zPower estimates power from wheel speed. **Devices** lists 18 profiles.

- **Tacx** — Blue Matic, Blue Motion, Booster, and Satori Pro.
- **Elite** — Novo Force, Qubo Power Mag, and Qubo Fluid.
- **Kurt Kinetic** — Road Machine and Rock and Roll.
- **B'Twin / Van Rysel** — In'Ride 100 and In'Ride 500.
- **Saris / CycleOps** — Fluid2 and Mag.
- **Minoura** — MagRide 60/80.
- **Generic profiles** — fluid trainer, magnetic trainer at level 3, road rollers, and stationary bike.

## Device check and spindown

**Device check** looks for fresh power, cadence, and heart rate readings over 30 seconds. A separate 5-second test asks whether you felt the change in resistance. **Calibrate** opens the guided spindown procedure, which prompts you to accelerate to 37 km/h and measures the coast down to 15 km/h.

If a trainer disconnects during an active ride, the ride and workout pause. Reconnect the trainer and select **Resume ride**. [Connection troubleshooting](Troubleshooting.md)

## Zwift Click, keyboard, and gamepad

In **Devices → Bluetooth controllers**, select **Connect controller**. Pair left and right Click V2 controllers separately. **+** shifts to a harder gear, and **−** shifts to an easier one. **Button mapping and test** lets you assign other buttons. **Test buttons** highlights incoming button presses. The HUD can show battery readings and warn about disconnects or battery at 20% or less.

On Click V2, **Z** opens or closes the menu by default, the left directional pad moves the selection, and **B** confirms. Available prompts appear when you use a controller and return to the usual view when you switch to the mouse, touch, or keyboard.

On a keyboard, use **Q / E** for easier or harder gears, **C** for cameras, and **Esc** for the menu. **↑ / ↓** adjust simulated power or shift when using external power with virtual shifting enabled. A gamepad can shift with **L1 / R1** or its directional pad. [Ride controls and gearing](Features.md#riding-controls-and-ghosts)
