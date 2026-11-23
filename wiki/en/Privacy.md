# Privacy and ride data

OskiRide runs the ride locally. It has no account sign-in or automatic ride upload. Choosing the Strava upload button opens Strava in your browser for manual upload.

| Data | Where it goes |
| --- | --- |
| Rider name, weight, FTP, bike, and preferences | Saved in the local browser or desktop app profile |
| Imported GPX routes | Stored in the local route library, including the coordinates in the imported file |
| Ride history, recovery, and diagnostics | Stored on the device. These can include power, speed, cadence, heart rate from a connected sensor, route names, and device details |
| FIT, TCX, and diagnostic JSON exports | Written to a file when you choose to export. Inspect what you share, especially GPS coordinates, times, heart rate, and device names |

Anyone with access to your operating system account may be able to read your local app profile and exported files. To remove individual entries, use **Delete** in the GPX library or **Delete ride** in the ride details. Clear the app's browser site data to reset the browser profile. Save any exports you want to keep first.

The Windows installer is distributed with a SHA-256 checksum and is unsigned. [Download verification](Installation.md#check-the-download-and-windows-smartscreen)
