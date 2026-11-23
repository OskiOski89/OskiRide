# Bluetooth equipment and controls

Open **Devices** to pair your equipment. **Device check** shows whether it is delivering readings. The trainer indicator is gray when disconnected, yellow while connecting or reconnecting, green when connected, and red when the connection drops.

| Equipment | Readings or controls |
| --- | --- |
| **FTMS smart trainer** | Power and cadence, SIM grade control, ERG target power, and resistance levels when the trainer exposes them |
| **Tacx FE-C over BLE** | Grade, power, and cadence for compatible models |
| **Wahoo Direct BLE** | Grade and target power commands for models that support this protocol |
| **Cycling Power Service (CPS)** | Power and, when provided, crank data for cadence |
| **Cycling Speed and Cadence (CSC)** | Wheel and crank data |
| **Bluetooth Heart Rate Service** | Heart rate |
| **Zwift Click V1 and V2** | Virtual shifting, battery readings when available, and extra controls on Click V2 |

Power meters and speed sensors supply telemetry. Automatic resistance adjustments require a controllable trainer. Available readings and resistance response vary by model and firmware.

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
