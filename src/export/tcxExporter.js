/**
 * Eksportuje zapisana sesje jazdy z OskiRide do pliku .TCX (kompatybilny ze Strava / Garmin Connect)
 */
export function exportRideToTCX(
  recordedPoints,
  totalDistanceM,
  elapsedSeconds,
  routeName = 'Workout'
) {
  if (!recordedPoints || recordedPoints.length === 0) {
    alert('No ride data recorded. Ride a short distance before exporting.');
    return;
  }

  const startTimeIso = recordedPoints[0].isoTime || new Date().toISOString();

  const trackpointsXml = recordedPoints
    .map(
      (pt) => `          <Trackpoint>
            <Time>${pt.isoTime}</Time>
            <Position>
              <LatitudeDegrees>${pt.lat.toFixed(6)}</LatitudeDegrees>
              <LongitudeDegrees>${pt.lon.toFixed(6)}</LongitudeDegrees>
            </Position>
            <AltitudeMeters>${pt.ele.toFixed(1)}</AltitudeMeters>
            <DistanceMeters>${pt.dist.toFixed(1)}</DistanceMeters>
            <Cadence>${Math.round(pt.cadence)}</Cadence>${
              pt.hr > 0
                ? `\n            <HeartRateBpm><Value>${Math.round(pt.hr)}</Value></HeartRateBpm>`
                : ''
            }
            <Extensions>
              <ns3:TPX>
                <ns3:Speed>${pt.speedMps.toFixed(2)}</ns3:Speed>
                <ns3:Watts>${Math.round(pt.watts)}</ns3:Watts>
              </ns3:TPX>
            </Extensions>
          </Trackpoint>`
    )
    .join('\n');

  const tcxContent = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd"
  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Activities>
    <Activity Sport="Biking">
      <Id>${startTimeIso}</Id>
      <Lap StartTime="${startTimeIso}">
        <TotalTimeSeconds>${Math.round(elapsedSeconds)}</TotalTimeSeconds>
        <DistanceMeters>${totalDistanceM.toFixed(1)}</DistanceMeters>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
${trackpointsXml}
        </Track>
      </Lap>
      <Creator xsi:type="Device_t">
        <Name>OskiRide 3D Virtual Trainer</Name>
      </Creator>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

  const blob = new Blob([tcxContent], { type: 'application/vnd.garmin.tcx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = startTimeIso.slice(0, 19).replace(/[:T]/g, '-');
  const safeRoute = String(routeName)
    .replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28) || 'Workout';
  a.href = url;
  a.download = `OskiRide-${safeRoute}-${dateTag}.tcx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
