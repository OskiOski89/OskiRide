/**
 * Generator i eksporter plików binarnych Garmin .FIT (Flexible and Interoperable Data Transfer)
 * Kompatybilny w 100% z Garmin Connect, Strava, Wahoo, Intervals.icu i GoldenCheetah.
 * Standard protokołu FIT 2.0 (Little Endian, CRC-16 CCITT).
 */

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
  0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];

/**
 * Aktualizuje sumę kontrolną CRC-16 CCITT o 1 bajt
 */
export function updateFitCrc(crc, byteVal) {
  let tmp = CRC_TABLE[crc & 0x0f];
  crc = (crc >> 4) & 0x0fff;
  crc = crc ^ tmp ^ CRC_TABLE[byteVal & 0x0f];
  tmp = CRC_TABLE[crc & 0x0f];
  crc = (crc >> 4) & 0x0fff;
  crc = crc ^ tmp ^ CRC_TABLE[(byteVal >> 4) & 0x0f];
  return crc & 0xffff;
}

/**
 * Wylicza CRC-16 z wycinka bufora bajtów
 */
export function calculateFitCrc(bytes, start = 0, end = bytes.length) {
  let crc = 0;
  for (let i = start; i < end; i++) {
    crc = updateFitCrc(crc, bytes[i]);
  }
  return crc;
}

// FIT Epoch: 1989-12-31 00:00:00 UTC (631065600 s względem Unix Epoch)
const FIT_EPOCH_MS = 631065600000;

export function toFitTimestamp(dateOrIso) {
  const ms =
    typeof dateOrIso === 'string'
      ? new Date(dateOrIso).getTime()
      : dateOrIso instanceof Date
      ? dateOrIso.getTime()
      : Number(dateOrIso);
  if (isNaN(ms) || ms < FIT_EPOCH_MS) return 0;
  return Math.round((ms - FIT_EPOCH_MS) / 1000);
}

export function degToSemicircles(deg) {
  if (typeof deg !== 'number' || isNaN(deg)) return 0;
  // 1 stopień = 2^31 / 180 semicircles
  return Math.round(deg * (2147483648 / 180));
}

class ByteWriter {
  constructor(initialCapacity = 65536) {
    this.buffer = new Uint8Array(initialCapacity);
    this.view = new DataView(this.buffer.buffer);
    this.offset = 0;
  }

  ensureCapacity(additionalBytes) {
    if (this.offset + additionalBytes > this.buffer.length) {
      const newCap = Math.max(this.buffer.length * 2, this.offset + additionalBytes + 4096);
      const newBuf = new Uint8Array(newCap);
      newBuf.set(this.buffer);
      this.buffer = newBuf;
      this.view = new DataView(this.buffer.buffer);
    }
  }

  writeUint8(val) {
    this.ensureCapacity(1);
    this.view.setUint8(this.offset, val & 0xff);
    this.offset += 1;
  }

  writeInt8(val) {
    this.ensureCapacity(1);
    this.view.setInt8(this.offset, val);
    this.offset += 1;
  }

  writeUint16(val) {
    this.ensureCapacity(2);
    this.view.setUint16(this.offset, val & 0xffff, true);
    this.offset += 2;
  }

  writeInt16(val) {
    this.ensureCapacity(2);
    this.view.setInt16(this.offset, val, true);
    this.offset += 2;
  }

  writeUint32(val) {
    this.ensureCapacity(4);
    this.view.setUint32(this.offset, val >>> 0, true);
    this.offset += 4;
  }

  writeInt32(val) {
    this.ensureCapacity(4);
    this.view.setInt32(this.offset, val, true);
    this.offset += 4;
  }

  writeString(str, fixedLen) {
    this.ensureCapacity(fixedLen);
    const enc = new TextEncoder().encode(str || '');
    for (let i = 0; i < fixedLen; i++) {
      this.buffer[this.offset + i] = i < enc.length ? enc[i] : 0;
    }
    this.offset += fixedLen;
  }

  getBytes() {
    return this.buffer.subarray(0, this.offset);
  }
}

/**
 * Generuje binarny bufor Uint8Array pliku FIT na podstawie punktów i metadanych przejazdu
 */
export function generateFitBinary(
  recordedPoints,
  totalDistanceM = 0,
  elapsedSeconds = 0,
  routeName = 'Workout',
  metadata = {}
) {
  if (!recordedPoints || recordedPoints.length === 0) {
    throw new Error('No ride points recorded.');
  }

  const writer = new ByteWriter();

  // 14 bajtów rezerwacji na FIT File Header
  writer.offset = 14;

  const firstPt = recordedPoints[0];
  const lastPt = recordedPoints[recordedPoints.length - 1];
  const startIso = firstPt.isoTime || new Date(Date.now() - elapsedSeconds * 1000).toISOString();
  const endIso = lastPt.isoTime || new Date().toISOString();

  const startTimestamp = toFitTimestamp(startIso);
  const endTimestamp =
    toFitTimestamp(endIso) || startTimestamp + Math.max(1, Math.round(elapsedSeconds));

  // --- LOCAL MSG 0: file_id (MesgNum 0) ---
  writer.writeUint8(0x40); // Def local 0
  writer.writeUint8(0x00);
  writer.writeUint8(0x00);
  writer.writeUint16(0); // mesgNum 0
  writer.writeUint8(5); // 5 pól
  // Field 0: type (enum, 1B)
  writer.writeUint8(0); writer.writeUint8(1); writer.writeUint8(0x00);
  // Field 1: manufacturer (uint16, 2B)
  writer.writeUint8(1); writer.writeUint8(2); writer.writeUint8(0x84);
  // Field 2: product (uint16, 2B)
  writer.writeUint8(2); writer.writeUint8(2); writer.writeUint8(0x84);
  // Field 3: serial_number (uint32z, 4B)
  writer.writeUint8(3); writer.writeUint8(4); writer.writeUint8(0x8c);
  // Field 4: time_created (uint32, 4B)
  writer.writeUint8(4); writer.writeUint8(4); writer.writeUint8(0x86);

  // Data: file_id
  writer.writeUint8(0x00); // Data local 0
  writer.writeUint8(4); // 4 = activity
  writer.writeUint16(1); // 1 = Garmin / standard
  writer.writeUint16(1);
  writer.writeUint32(1010101);
  writer.writeUint32(startTimestamp);

  // --- LOCAL MSG 1: file_creator (MesgNum 49) ---
  writer.writeUint8(0x41); // Def local 1
  writer.writeUint8(0x00);
  writer.writeUint8(0x00);
  writer.writeUint16(49); // mesgNum 49
  writer.writeUint8(2); // 2 pola
  // Field 0: software_version (uint16, 2B)
  writer.writeUint8(0); writer.writeUint8(2); writer.writeUint8(0x84);
  // Field 1: hardware_version (uint8, 1B)
  writer.writeUint8(1); writer.writeUint8(1); writer.writeUint8(0x02);

  // Data: file_creator
  writer.writeUint8(0x01); // Data local 1
  writer.writeUint16(100); // v1.00
  writer.writeUint8(1);

  // --- LOCAL MSG 2: device_info (MesgNum 23) ---
  writer.writeUint8(0x42); // Def local 2
  writer.writeUint8(0x00);
  writer.writeUint8(0x00);
  writer.writeUint16(23); // mesgNum 23
  writer.writeUint8(5); // 5 pól
  // Field 253: timestamp (uint32, 4B)
  writer.writeUint8(253); writer.writeUint8(4); writer.writeUint8(0x86);
  // Field 0: device_index (uint8, 1B)
  writer.writeUint8(0); writer.writeUint8(1); writer.writeUint8(0x02);
  // Field 1: device_type (uint8, 1B)
  writer.writeUint8(1); writer.writeUint8(1); writer.writeUint8(0x02);
  // Field 2: manufacturer (uint16, 2B)
  writer.writeUint8(2); writer.writeUint8(2); writer.writeUint8(0x84);
  // Field 4: product_name (string 16B)
  writer.writeUint8(4); writer.writeUint8(16); writer.writeUint8(0x07);

  // Data: device_info
  writer.writeUint8(0x02); // Data local 2
  writer.writeUint32(startTimestamp);
  writer.writeUint8(0); // creator
  writer.writeUint8(0);
  writer.writeUint16(1);
  writer.writeString('OskiRide Trainer', 16);

  // --- LOCAL MSG 3: event (MesgNum 21) ---
  writer.writeUint8(0x43); // Def local 3
  writer.writeUint8(0x00);
  writer.writeUint8(0x00);
  writer.writeUint16(21); // mesgNum 21
  writer.writeUint8(5); // 5 pól
  // Field 253: timestamp (uint32, 4B)
  writer.writeUint8(253); writer.writeUint8(4); writer.writeUint8(0x86);
  // Field 0: event (enum, 1B)
  writer.writeUint8(0); writer.writeUint8(1); writer.writeUint8(0x00);
  // Field 1: event_type (enum, 1B)
  writer.writeUint8(1); writer.writeUint8(1); writer.writeUint8(0x00);
  // Field 3: data (uint32, 4B)
  writer.writeUint8(3); writer.writeUint8(4); writer.writeUint8(0x86);
  // Field 4: event_group (uint8, 1B)
  writer.writeUint8(4); writer.writeUint8(1); writer.writeUint8(0x02);

  // Start Timer Event
  writer.writeUint8(0x03); // Data local 3
  writer.writeUint32(startTimestamp);
  writer.writeUint8(0); // 0 = timer
  writer.writeUint8(0); // 0 = start
  writer.writeUint32(0);
  writer.writeUint8(0);

  // --- LOCAL MSG 4: record (MesgNum 20) ---
  writer.writeUint8(0x44); // Def local 4
  writer.writeUint8(0x00);
  writer.writeUint8(0x00);
  writer.writeUint16(20); // mesgNum 20
  writer.writeUint8(9); // 9 pól
  // Field 253: timestamp (uint32, 4B)
  writer.writeUint8(253); writer.writeUint8(4); writer.writeUint8(0x86);
  // Field 0: position_lat (sint32, 4B)
  writer.writeUint8(0); writer.writeUint8(4); writer.writeUint8(0x85);
  // Field 1: position_long (sint32, 4B)
  writer.writeUint8(1); writer.writeUint8(4); writer.writeUint8(0x85);
  // Field 2: altitude (uint16, 2B, scale 5, offset 500)
  writer.writeUint8(2); writer.writeUint8(2); writer.writeUint8(0x84);
  // Field 3: heart_rate (uint8, 1B)
  writer.writeUint8(3); writer.writeUint8(1); writer.writeUint8(0x02);
  // Field 4: cadence (uint8, 1B)
  writer.writeUint8(4); writer.writeUint8(1); writer.writeUint8(0x02);
  // Field 5: distance (uint32, 4B, scale 100 cm)
  writer.writeUint8(5); writer.writeUint8(4); writer.writeUint8(0x86);
  // Field 6: speed (uint16, 2B, scale 1000 mm/s)
  writer.writeUint8(6); writer.writeUint8(2); writer.writeUint8(0x84);
  // Field 7: power (uint16, 2B, watts)
  writer.writeUint8(7); writer.writeUint8(2); writer.writeUint8(0x84);

  // Iteracja po punktach i zapis rekordów
  let maxSpeedMps = 0;
  let maxWatts = 0;
  let maxCadence = 0;
  let maxHr = 0;
  let sumWatts = 0;
  let sumCadence = 0;
  let sumHr = 0;
  let hrCount = 0;
  let totalAscent = 0;
  let totalDescent = 0;
  let prevEle = null;

  for (let i = 0; i < recordedPoints.length; i++) {
    const pt = recordedPoints[i];
    const ptTs = toFitTimestamp(pt.isoTime) || startTimestamp + i;
    const latSemi = degToSemicircles(pt.lat);
    const lonSemi = degToSemicircles(pt.lon);

    const eleVal = typeof pt.ele === 'number' && !isNaN(pt.ele) ? pt.ele : 0;
    const fitAlt = Math.max(0, Math.min(65534, Math.round((eleVal + 500) * 5)));

    if (prevEle !== null) {
      const diff = eleVal - prevEle;
      if (diff > 0) totalAscent += diff;
      else totalDescent += Math.abs(diff);
    }
    prevEle = eleVal;

    const hr = Math.round(pt.hr || 0);
    const cad = Math.round(pt.cadence || 0);
    const fitHr = hr > 0 ? Math.min(255, hr) : 0xff; // 0xFF = brak danych HR
    const fitCad = Math.min(254, Math.max(0, cad));
    if (hr > 0) {
      sumHr += hr;
      hrCount++;
      if (hr > maxHr) maxHr = hr;
    }
    sumCadence += cad;
    if (cad > maxCadence) maxCadence = cad;

    const distM = typeof pt.dist === 'number' && !isNaN(pt.dist) ? pt.dist : 0;
    const fitDist = Math.max(0, Math.round(distM * 100));

    const spdMps = typeof pt.speedMps === 'number' && !isNaN(pt.speedMps) ? pt.speedMps : 0;
    const fitSpeed = Math.max(0, Math.min(65534, Math.round(spdMps * 1000)));
    if (spdMps > maxSpeedMps) maxSpeedMps = spdMps;

    const w = Math.round(pt.watts || 0);
    const fitPower = Math.max(0, Math.min(65534, w));
    sumWatts += w;
    if (w > maxWatts) maxWatts = w;

    // Data: record (local 4)
    writer.writeUint8(0x04);
    writer.writeUint32(ptTs);
    writer.writeInt32(latSemi);
    writer.writeInt32(lonSemi);
    writer.writeUint16(fitAlt);
    writer.writeUint8(fitHr);
    writer.writeUint8(fitCad);
    writer.writeUint32(fitDist);
    writer.writeUint16(fitSpeed);
    writer.writeUint16(fitPower);
  }

  // Stop Timer Event
  writer.writeUint8(0x03); // Data local 3
  writer.writeUint32(endTimestamp);
  writer.writeUint8(0); // 0 = timer
  writer.writeUint8(4); // 4 = stop_all
  writer.writeUint32(0);
  writer.writeUint8(0);

  // Zbiorcze statystyki
  const numPts = Math.max(1, recordedPoints.length);
  const avgWatts = Math.round(sumWatts / numPts);
  const avgCadence = Math.round(sumCadence / numPts);
  const avgHr = hrCount > 0 ? Math.round(sumHr / hrCount) : 0xff;
  const avgSpeedMps = elapsedSeconds > 0 ? totalDistanceM / elapsedSeconds : 0;

  const tm = metadata.trainingMetrics || {};
  const np = tm.np || avgWatts;
  const tss = tm.tss || 0;
  const ifVal = tm.ifVal || np / Math.max(80, metadata.ftpWatts || 250);
  const ftp = metadata.ftpWatts || 250;
  const calories = metadata.calories || Math.round(avgWatts * elapsedSeconds * 0.000259);

  const startLatSemi = degToSemicircles(firstPt.lat);
  const startLonSemi = degToSemicircles(firstPt.lon);
  const endLatSemi = degToSemicircles(lastPt.lat);
  const endLonSemi = degToSemicircles(lastPt.lon);

  // --- LOCAL MSG 5: lap (MesgNum 19) ---
  writer.writeUint8(0x45); // Def local 5
  writer.writeUint8(0x00);
  writer.writeUint8(0x00);
  writer.writeUint16(19); // mesgNum 19: lap
  writer.writeUint8(25); // 25 pól
  writer.writeUint8(253); writer.writeUint8(4); writer.writeUint8(0x86); // timestamp
  writer.writeUint8(254); writer.writeUint8(2); writer.writeUint8(0x84); // message_index
  writer.writeUint8(0); writer.writeUint8(1); writer.writeUint8(0x00); // event
  writer.writeUint8(1); writer.writeUint8(1); writer.writeUint8(0x00); // event_type
  writer.writeUint8(2); writer.writeUint8(4); writer.writeUint8(0x86); // start_time
  writer.writeUint8(3); writer.writeUint8(4); writer.writeUint8(0x85); // start_position_lat
  writer.writeUint8(4); writer.writeUint8(4); writer.writeUint8(0x85); // start_position_long
  writer.writeUint8(5); writer.writeUint8(4); writer.writeUint8(0x85); // end_position_lat
  writer.writeUint8(6); writer.writeUint8(4); writer.writeUint8(0x85); // end_position_long
  writer.writeUint8(7); writer.writeUint8(4); writer.writeUint8(0x86); // total_elapsed_time ms
  writer.writeUint8(8); writer.writeUint8(4); writer.writeUint8(0x86); // total_timer_time ms
  writer.writeUint8(9); writer.writeUint8(4); writer.writeUint8(0x86); // total_distance cm
  writer.writeUint8(11); writer.writeUint8(2); writer.writeUint8(0x84); // total_calories
  writer.writeUint8(13); writer.writeUint8(2); writer.writeUint8(0x84); // avg_speed
  writer.writeUint8(14); writer.writeUint8(2); writer.writeUint8(0x84); // max_speed
  writer.writeUint8(15); writer.writeUint8(1); writer.writeUint8(0x02); // avg_heart_rate
  writer.writeUint8(16); writer.writeUint8(1); writer.writeUint8(0x02); // max_heart_rate
  writer.writeUint8(17); writer.writeUint8(1); writer.writeUint8(0x02); // avg_cadence
  writer.writeUint8(18); writer.writeUint8(1); writer.writeUint8(0x02); // max_cadence
  writer.writeUint8(19); writer.writeUint8(2); writer.writeUint8(0x84); // avg_power
  writer.writeUint8(20); writer.writeUint8(2); writer.writeUint8(0x84); // max_power
  writer.writeUint8(21); writer.writeUint8(2); writer.writeUint8(0x84); // total_ascent
  writer.writeUint8(22); writer.writeUint8(2); writer.writeUint8(0x84); // total_descent
  writer.writeUint8(25); writer.writeUint8(1); writer.writeUint8(0x00); // sport
  writer.writeUint8(26); writer.writeUint8(1); writer.writeUint8(0x00); // sub_sport

  // Data: lap (local 5)
  writer.writeUint8(0x05);
  writer.writeUint32(endTimestamp);
  writer.writeUint16(0); // lap 0
  writer.writeUint8(9); // lap
  writer.writeUint8(1); // stop
  writer.writeUint32(startTimestamp);
  writer.writeInt32(startLatSemi);
  writer.writeInt32(startLonSemi);
  writer.writeInt32(endLatSemi);
  writer.writeInt32(endLonSemi);
  writer.writeUint32(Math.round(elapsedSeconds * 1000));
  writer.writeUint32(Math.round(elapsedSeconds * 1000));
  writer.writeUint32(Math.round(totalDistanceM * 100));
  writer.writeUint16(Math.min(65534, Math.round(calories)));
  writer.writeUint16(Math.min(65534, Math.round(avgSpeedMps * 1000)));
  writer.writeUint16(Math.min(65534, Math.round(maxSpeedMps * 1000)));
  writer.writeUint8(avgHr);
  writer.writeUint8(maxHr > 0 ? maxHr : 0xff);
  writer.writeUint8(Math.min(254, avgCadence));
  writer.writeUint8(Math.min(254, maxCadence));
  writer.writeUint16(Math.min(65534, avgWatts));
  writer.writeUint16(Math.min(65534, maxWatts));
  writer.writeUint16(Math.min(65534, Math.round(totalAscent)));
  writer.writeUint16(Math.min(65534, Math.round(totalDescent)));
  writer.writeUint8(2); // 2 = cycling
  writer.writeUint8(58); // 58 = virtual_activity (Zwift / Virtual Ride standard)

  // --- LOCAL MSG 6: session (MesgNum 18) ---
  writer.writeUint8(0x46); // Def local 6
  writer.writeUint8(0x00);
  writer.writeUint8(0x00);
  writer.writeUint16(18); // mesgNum 18: session
  writer.writeUint8(29); // 29 pól
  writer.writeUint8(253); writer.writeUint8(4); writer.writeUint8(0x86); // timestamp
  writer.writeUint8(254); writer.writeUint8(2); writer.writeUint8(0x84); // message_index
  writer.writeUint8(0); writer.writeUint8(1); writer.writeUint8(0x00); // event
  writer.writeUint8(1); writer.writeUint8(1); writer.writeUint8(0x00); // event_type
  writer.writeUint8(2); writer.writeUint8(4); writer.writeUint8(0x86); // start_time
  writer.writeUint8(3); writer.writeUint8(4); writer.writeUint8(0x85); // start_position_lat
  writer.writeUint8(4); writer.writeUint8(4); writer.writeUint8(0x85); // start_position_long
  writer.writeUint8(5); writer.writeUint8(1); writer.writeUint8(0x00); // sport
  writer.writeUint8(6); writer.writeUint8(1); writer.writeUint8(0x00); // sub_sport
  writer.writeUint8(7); writer.writeUint8(4); writer.writeUint8(0x86); // total_elapsed_time ms
  writer.writeUint8(8); writer.writeUint8(4); writer.writeUint8(0x86); // total_timer_time ms
  writer.writeUint8(9); writer.writeUint8(4); writer.writeUint8(0x86); // total_distance cm
  writer.writeUint8(11); writer.writeUint8(2); writer.writeUint8(0x84); // total_calories
  writer.writeUint8(14); writer.writeUint8(2); writer.writeUint8(0x84); // avg_speed
  writer.writeUint8(15); writer.writeUint8(2); writer.writeUint8(0x84); // max_speed
  writer.writeUint8(16); writer.writeUint8(1); writer.writeUint8(0x02); // avg_heart_rate
  writer.writeUint8(17); writer.writeUint8(1); writer.writeUint8(0x02); // max_heart_rate
  writer.writeUint8(18); writer.writeUint8(1); writer.writeUint8(0x02); // avg_cadence
  writer.writeUint8(19); writer.writeUint8(1); writer.writeUint8(0x02); // max_cadence
  writer.writeUint8(20); writer.writeUint8(2); writer.writeUint8(0x84); // avg_power
  writer.writeUint8(21); writer.writeUint8(2); writer.writeUint8(0x84); // max_power
  writer.writeUint8(22); writer.writeUint8(2); writer.writeUint8(0x84); // total_ascent
  writer.writeUint8(23); writer.writeUint8(2); writer.writeUint8(0x84); // total_descent
  writer.writeUint8(25); writer.writeUint8(2); writer.writeUint8(0x84); // first_lap_index
  writer.writeUint8(26); writer.writeUint8(2); writer.writeUint8(0x84); // num_laps
  writer.writeUint8(34); writer.writeUint8(2); writer.writeUint8(0x84); // normalized_power
  writer.writeUint8(35); writer.writeUint8(2); writer.writeUint8(0x84); // training_stress_score
  writer.writeUint8(36); writer.writeUint8(2); writer.writeUint8(0x84); // intensity_factor
  writer.writeUint8(87); writer.writeUint8(2); writer.writeUint8(0x84); // threshold_power

  // Data: session (local 6)
  writer.writeUint8(0x06);
  writer.writeUint32(endTimestamp);
  writer.writeUint16(0);
  writer.writeUint8(8); // session
  writer.writeUint8(1); // stop
  writer.writeUint32(startTimestamp);
  writer.writeInt32(startLatSemi);
  writer.writeInt32(startLonSemi);
  writer.writeUint8(2); // cycling
  writer.writeUint8(58); // virtual_activity
  writer.writeUint32(Math.round(elapsedSeconds * 1000));
  writer.writeUint32(Math.round(elapsedSeconds * 1000));
  writer.writeUint32(Math.round(totalDistanceM * 100));
  writer.writeUint16(Math.min(65534, Math.round(calories)));
  writer.writeUint16(Math.min(65534, Math.round(avgSpeedMps * 1000)));
  writer.writeUint16(Math.min(65534, Math.round(maxSpeedMps * 1000)));
  writer.writeUint8(avgHr);
  writer.writeUint8(maxHr > 0 ? maxHr : 0xff);
  writer.writeUint8(Math.min(254, avgCadence));
  writer.writeUint8(Math.min(254, maxCadence));
  writer.writeUint16(Math.min(65534, avgWatts));
  writer.writeUint16(Math.min(65534, maxWatts));
  writer.writeUint16(Math.min(65534, Math.round(totalAscent)));
  writer.writeUint16(Math.min(65534, Math.round(totalDescent)));
  writer.writeUint16(0); // first_lap_index
  writer.writeUint16(1); // num_laps
  writer.writeUint16(Math.min(65534, Math.round(np)));
  writer.writeUint16(Math.min(65534, Math.round(tss * 10)));
  writer.writeUint16(Math.min(65534, Math.round(ifVal * 1000)));
  writer.writeUint16(Math.min(65534, Math.round(ftp)));

  // --- LOCAL MSG 7: activity (MesgNum 34) ---
  writer.writeUint8(0x47); // Def local 7
  writer.writeUint8(0x00);
  writer.writeUint8(0x00);
  writer.writeUint16(34); // mesgNum 34: activity
  writer.writeUint8(7); // 7 pól
  writer.writeUint8(253); writer.writeUint8(4); writer.writeUint8(0x86); // timestamp
  writer.writeUint8(0); writer.writeUint8(4); writer.writeUint8(0x86); // total_timer_time ms
  writer.writeUint8(1); writer.writeUint8(2); writer.writeUint8(0x84); // num_sessions
  writer.writeUint8(2); writer.writeUint8(1); writer.writeUint8(0x00); // type
  writer.writeUint8(3); writer.writeUint8(1); writer.writeUint8(0x00); // event
  writer.writeUint8(4); writer.writeUint8(1); writer.writeUint8(0x00); // event_type
  writer.writeUint8(5); writer.writeUint8(4); writer.writeUint8(0x86); // local_timestamp

  // Data: activity (local 7)
  writer.writeUint8(0x07);
  writer.writeUint32(endTimestamp);
  writer.writeUint32(Math.round(elapsedSeconds * 1000));
  writer.writeUint16(1); // 1 session
  writer.writeUint8(0); // type: manual
  writer.writeUint8(26); // event: activity
  writer.writeUint8(1); // event_type: stop
  writer.writeUint32(endTimestamp);

  // Całkowita liczba bajtów danych
  const totalDataBytes = writer.offset - 14;

  // --- 14-BAJTOWY NAGŁÓWEK FIT ---
  const headerView = new DataView(writer.buffer.buffer);
  headerView.setUint8(0, 14); // Header size = 14
  headerView.setUint8(1, 0x20); // Protocol version 2.0
  headerView.setUint16(2, 2132, true); // Profile version (21.32)
  headerView.setUint32(4, totalDataBytes, true); // Data size (uint32 LE)
  // ".FIT" w bajtach [0x2E, 0x46, 0x49, 0x54]
  writer.buffer[8] = 0x2e;
  writer.buffer[9] = 0x46;
  writer.buffer[10] = 0x49;
  writer.buffer[11] = 0x54;

  // Header CRC (z pierwszych 12 bajtów nagłówka)
  const headerCrc = calculateFitCrc(writer.buffer, 0, 12);
  headerView.setUint16(12, headerCrc, true);

  // File Trailer CRC-16 (ze wszystkich bajtów od 0 do końca danych)
  const fileBytesWithoutCrc = writer.buffer.subarray(0, writer.offset);
  const fileCrc = calculateFitCrc(fileBytesWithoutCrc, 0, writer.offset);
  writer.writeUint16(fileCrc);

  return writer.getBytes();
}

/**
 * Eksportuje przejazd z OskiRide do natywnego pliku binarnego .FIT
 */
export function exportRideToFIT(
  recordedPoints,
  totalDistanceM = 0,
  elapsedSeconds = 0,
  routeName = 'Workout',
  metadata = {}
) {
  if (!recordedPoints || recordedPoints.length === 0) {
    alert('No ride data recorded. Ride a short distance before exporting.');
    return;
  }

  const fitBytes = generateFitBinary(
    recordedPoints,
    totalDistanceM,
    elapsedSeconds,
    routeName,
    metadata
  );

  const blob = new Blob([fitBytes], { type: 'application/vnd.ant.fit' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  const firstPt = recordedPoints[0];
  const startTimeIso = firstPt.isoTime || new Date().toISOString();
  const dateTag = startTimeIso.slice(0, 19).replace(/[:T]/g, '-');
  const safeRoute =
    String(routeName)
      .replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'Workout';

  a.href = url;
  a.download = `OskiRide-${safeRoute}-${dateTag}.fit`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
