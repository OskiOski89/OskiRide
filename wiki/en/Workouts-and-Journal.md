# Workouts, ride analysis, and exports

## Structured workouts

| Built-in plan | Duration |
| --- | --- |
| Sweet Spot 2×15 min | 50 min |
| VO2 Max 5×3 min | 43 min |
| Tabata HIIT 2× | 30 min 20 s |
| Over-Unders 2×9 min | 38 min |
| Zone 2 Endurance | 60 min |

Choose **Workouts → Import workout** to open a ZWO, MRC, or ERG file. Supported ZWO blocks include `Warmup`, `Cooldown`, `SteadyState`, `Ramp`, `IntervalsT`, and `FreeRide`. MRC commonly uses percentages of FTP and ERG specifies power in watts. The selected plan starts when you choose **Start workout**.

The workout display shows the active block, countdown, power target, and cadence when included in the plan. Enable **ERG mode** to send the target power to a compatible trainer. Free-ride blocks use SIM. [Workout in progress](Screenshots.md#workout-in-progress) · [Trainer settings and compatibility](Equipment.md)

## Review and compare rides

**Ride summary** shows duration, distance, elevation, energy, power, cadence, and heart rate when recorded. It includes Coggan zones Z1–Z7 and the following power metrics.

| Metric | Meaning |
| --- | --- |
| NP | Normalized Power |
| IF | Intensity Factor relative to FTP |
| TSS | Training Stress Score |
| VI | Variability Index |
| EF | Efficiency Factor when sufficient data is available |
| MMP | Mean maximal power, with peak sprint power and best averages for 5 s, 15 s, 1 min, 5 min, and 20 min |

In **Journal**, filter saved rides by route or date and switch between weekly and monthly totals. Select two to enable **Compare rides**. Compare available power, heart rate, cadence, speed, and elevation traces by time or distance. For matching routes you can also compare positions along the course. Older rides can have estimated distances or timestamps.

To race one of your recorded efforts, open **Settings** and enable **Second ghost: personal best**. Choose the route record or a particular saved ride. The first ghost can follow GPX timestamps or a power target relative to FTP.

## Export an activity

In the ride summary, use **Download FIT** or **Download TCX**. Both exports include available GPS and telemetry. Use **Open Strava** to open the manual upload page and select your exported file. [Recovery and local storage](Troubleshooting.md)
