/**
 * Silnik Treningow Ustrukturyzowanych (Structured Workouts) dla OskiRide
 * Obsluguje:
 * - Parser plikow XML .ZWO (Zwift Workout / TrainingPeaks)
 * - Parser plikow tekstowych .MRC / .ERG
 * - Wbudowana biblioteke gotowych treningow kolarskich (Sweet Spot, VO2max, Tabata, Over-Unders, Baza Z2)
 * - Wyliczanie zadanego obciazenia w watach (FTP-based) oraz sterowanie trybem trenażera ERG
 */

const RAW_PRESETS = [
  {
    id: 'sweet-spot-2x15',
    name: 'Sweet Spot 2×15 min',
    category: 'Threshold and endurance',
    description: 'Sustained sweet spot intervals build threshold power and muscular endurance.',
    author: 'OskiRide Performance',
    blocks: [
      { type: 'warmup', durationSec: 600, powerLowPct: 0.50, powerHighPct: 0.75, targetCadence: 90, name: 'Progressive warm-up' },
      { type: 'steadystate', durationSec: 900, powerPct: 0.90, targetCadence: 88, name: 'Interval 1: Sweet spot (90% FTP)' },
      { type: 'rest', durationSec: 300, powerPct: 0.55, targetCadence: 85, name: 'Active recovery' },
      { type: 'steadystate', durationSec: 900, powerPct: 0.90, targetCadence: 88, name: 'Interval 2: Sweet spot (90% FTP)' },
      { type: 'cooldown', durationSec: 300, powerLowPct: 0.65, powerHighPct: 0.45, targetCadence: 85, name: 'Cool-down' }
    ]
  },
  {
    id: 'vo2max-5x3',
    name: 'VO2 Max 5×3 min (115% FTP)',
    category: 'Aerobic power (VO₂max)',
    description: 'Hard intervals to improve aerobic capacity and sustained climbing power.',
    author: 'OskiRide Performance',
    blocks: [
      { type: 'warmup', durationSec: 600, powerLowPct: 0.50, powerHighPct: 0.80, targetCadence: 92, name: 'Warm-up with build' },
      { type: 'steadystate', durationSec: 180, powerPct: 1.15, targetCadence: 100, name: 'Interval 1/5: VO2 Max (115% FTP)' },
      { type: 'rest', durationSec: 180, powerPct: 0.50, targetCadence: 85, name: 'Recovery' },
      { type: 'steadystate', durationSec: 180, powerPct: 1.15, targetCadence: 100, name: 'Interval 2/5: VO2 Max (115% FTP)' },
      { type: 'rest', durationSec: 180, powerPct: 0.50, targetCadence: 85, name: 'Recovery' },
      { type: 'steadystate', durationSec: 180, powerPct: 1.15, targetCadence: 100, name: 'Interval 3/5: VO2 Max (115% FTP)' },
      { type: 'rest', durationSec: 180, powerPct: 0.50, targetCadence: 85, name: 'Recovery' },
      { type: 'steadystate', durationSec: 180, powerPct: 1.15, targetCadence: 100, name: 'Interval 4/5: VO2 Max (115% FTP)' },
      { type: 'rest', durationSec: 180, powerPct: 0.50, targetCadence: 85, name: 'Recovery' },
      { type: 'steadystate', durationSec: 180, powerPct: 1.15, targetCadence: 100, name: 'Interval 5/5: VO2 Max (115% FTP)' },
      { type: 'cooldown', durationSec: 360, powerLowPct: 0.65, powerHighPct: 0.40, targetCadence: 85, name: 'Cool-down' }
    ]
  },
  {
    id: 'tabata-hiit',
    name: 'Tabata HIIT 2× (40/20s @ 125% FTP)',
    category: 'Anaerobic power',
    description: 'Short anaerobic intervals to practice repeated attacks and uphill accelerations.',
    author: 'OskiRide Performance',
    blocks: [
      { type: 'warmup', durationSec: 600, powerLowPct: 0.50, powerHighPct: 0.85, targetCadence: 95, name: 'Warm-up' },
      // Runda 1 (5 powtórzeń 40s/20s)
      { type: 'steadystate', durationSec: 40, powerPct: 1.25, targetCadence: 105, name: 'Surge 1/5' },
      { type: 'rest', durationSec: 20, powerPct: 0.50, targetCadence: 85, name: 'Recovery' },
      { type: 'steadystate', durationSec: 40, powerPct: 1.25, targetCadence: 105, name: 'Surge 2/5' },
      { type: 'rest', durationSec: 20, powerPct: 0.50, targetCadence: 85, name: 'Recovery' },
      { type: 'steadystate', durationSec: 40, powerPct: 1.25, targetCadence: 105, name: 'Surge 3/5' },
      { type: 'rest', durationSec: 20, powerPct: 0.50, targetCadence: 85, name: 'Recovery' },
      { type: 'steadystate', durationSec: 40, powerPct: 1.25, targetCadence: 105, name: 'Surge 4/5' },
      { type: 'rest', durationSec: 20, powerPct: 0.50, targetCadence: 85, name: 'Recovery' },
      { type: 'steadystate', durationSec: 40, powerPct: 1.25, targetCadence: 105, name: 'Surge 5/5' },
      { type: 'rest', durationSec: 240, powerPct: 0.55, targetCadence: 85, name: 'Between sets (4 min)' },
      // Runda 2 (5 powtórzeń 40s/20s)
      { type: 'steadystate', durationSec: 40, powerPct: 1.25, targetCadence: 105, name: 'Surge 1/5' },
      { type: 'rest', durationSec: 20, powerPct: 0.50, targetCadence: 85, name: 'Recovery' },
      { type: 'steadystate', durationSec: 40, powerPct: 1.25, targetCadence: 105, name: 'Surge 2/5' },
      { type: 'rest', durationSec: 20, powerPct: 0.50, targetCadence: 85, name: 'Recovery' },
      { type: 'steadystate', durationSec: 40, powerPct: 1.25, targetCadence: 105, name: 'Surge 3/5' },
      { type: 'rest', durationSec: 20, powerPct: 0.50, targetCadence: 85, name: 'Recovery' },
      { type: 'steadystate', durationSec: 40, powerPct: 1.25, targetCadence: 105, name: 'Surge 4/5' },
      { type: 'rest', durationSec: 20, powerPct: 0.50, targetCadence: 85, name: 'Recovery' },
      { type: 'steadystate', durationSec: 40, powerPct: 1.25, targetCadence: 105, name: 'Surge 5/5' },
      { type: 'cooldown', durationSec: 420, powerLowPct: 0.65, powerHighPct: 0.40, targetCadence: 85, name: 'Cool-down' }
    ]
  },
  {
    id: 'over-unders-3x9',
    name: 'Over-Unders 2×9 min (95% / 105% FTP)',
    category: 'FTP threshold',
    description: 'Alternate just below and above threshold to practice holding power through surges.',
    author: 'OskiRide Performance',
    blocks: [
      { type: 'warmup', durationSec: 600, powerLowPct: 0.50, powerHighPct: 0.85, targetCadence: 90, name: 'Warm-up' },
      // Blok 1
      { type: 'steadystate', durationSec: 120, powerPct: 0.95, targetCadence: 90, name: 'Under (95% FTP)' },
      { type: 'steadystate', durationSec: 60, powerPct: 1.05, targetCadence: 95, name: 'Over (105% FTP)' },
      { type: 'steadystate', durationSec: 120, powerPct: 0.95, targetCadence: 90, name: 'Under (95% FTP)' },
      { type: 'steadystate', durationSec: 60, powerPct: 1.05, targetCadence: 95, name: 'Over (105% FTP)' },
      { type: 'steadystate', durationSec: 120, powerPct: 0.95, targetCadence: 90, name: 'Under (95% FTP)' },
      { type: 'steadystate', durationSec: 60, powerPct: 1.05, targetCadence: 95, name: 'Over (105% FTP)' },
      { type: 'rest', durationSec: 240, powerPct: 0.55, targetCadence: 85, name: 'Recovery' },
      // Blok 2
      { type: 'steadystate', durationSec: 120, powerPct: 0.95, targetCadence: 90, name: 'Under (95% FTP)' },
      { type: 'steadystate', durationSec: 60, powerPct: 1.05, targetCadence: 95, name: 'Over (105% FTP)' },
      { type: 'steadystate', durationSec: 120, powerPct: 0.95, targetCadence: 90, name: 'Under (95% FTP)' },
      { type: 'steadystate', durationSec: 60, powerPct: 1.05, targetCadence: 95, name: 'Over (105% FTP)' },
      { type: 'steadystate', durationSec: 120, powerPct: 0.95, targetCadence: 90, name: 'Under (95% FTP)' },
      { type: 'steadystate', durationSec: 60, powerPct: 1.05, targetCadence: 95, name: 'Over (105% FTP)' },
      { type: 'cooldown', durationSec: 360, powerLowPct: 0.65, powerHighPct: 0.40, targetCadence: 85, name: 'Cool-down' }
    ]
  },
  {
    id: 'endurance-z2-60',
    name: 'Zone 2 Endurance (60 min @ 68% FTP)',
    category: 'Endurance',
    description: 'An easy aerobic ride to build endurance.',
    author: 'OskiRide Performance',
    blocks: [
      { type: 'warmup', durationSec: 480, powerLowPct: 0.50, powerHighPct: 0.65, targetCadence: 90, name: 'Warm-up' },
      { type: 'steadystate', durationSec: 2760, powerPct: 0.68, targetCadence: 90, name: 'Zone 2 endurance (68% FTP)' },
      { type: 'cooldown', durationSec: 360, powerLowPct: 0.65, powerHighPct: 0.45, targetCadence: 85, name: 'Cool-down' }
    ]
  }
];

// Wylicz czasy startSec i endSec dla każdego bloku w presetach
for (const p of RAW_PRESETS) {
  let sec = 0;
  for (const b of p.blocks) {
    b.startSec = sec;
    b.endSec = sec + b.durationSec;
    sec += b.durationSec;
  }
  p.totalDurationSec = sec;
}

export const WORKOUT_PRESETS = Object.freeze(RAW_PRESETS);

/**
 * Parsuje plik treningowy XML .ZWO (standard Zwift / TrainingPeaks)
 */
export function parseZwoWorkout(xmlContent) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlContent, 'application/xml');
  const errorNode = xml.querySelector('parsererror');
  if (errorNode) {
    throw new Error('Invalid ZWO XML: ' + errorNode.textContent);
  }

  const nameEl = xml.querySelector('workout_file > name');
  const descEl = xml.querySelector('workout_file > description');
  const authorEl = xml.querySelector('workout_file > author');

  const workoutName = nameEl ? nameEl.textContent.trim() : 'Imported ZWO workout';
  const description = descEl ? descEl.textContent.trim() : '';
  const author = authorEl ? authorEl.textContent.trim() : 'Imported';

  const workoutNode = xml.querySelector('workout_file > workout');
  if (!workoutNode) {
    throw new Error('No <workout> section in the ZWO file.');
  }

  const blocks = [];
  let currentStartSec = 0;

  for (const node of workoutNode.children) {
    const tag = node.tagName.toLowerCase();
    const durationSec = parseInt(node.getAttribute('Duration') || '0', 10);
    if (durationSec <= 0 && tag !== 'intervalst') continue;

    const targetCadence = node.getAttribute('Cadence') ? parseInt(node.getAttribute('Cadence'), 10) : null;

    if (tag === 'warmup') {
      const pLow = parseFloat(node.getAttribute('PowerLow') || '0.5');
      const pHigh = parseFloat(node.getAttribute('PowerHigh') || '0.75');
      blocks.push({
        type: 'warmup',
        durationSec,
        startSec: currentStartSec,
        endSec: currentStartSec + durationSec,
        powerLowPct: pLow,
        powerHighPct: pHigh,
        targetCadence: targetCadence || 90,
        name: 'Warm-up'
      });
      currentStartSec += durationSec;
    } else if (tag === 'cooldown') {
      const pLow = parseFloat(node.getAttribute('PowerLow') || '0.7');
      const pHigh = parseFloat(node.getAttribute('PowerHigh') || '0.45');
      blocks.push({
        type: 'cooldown',
        durationSec,
        startSec: currentStartSec,
        endSec: currentStartSec + durationSec,
        powerLowPct: pLow,
        powerHighPct: pHigh,
        targetCadence: targetCadence || 85,
        name: 'Cool-down'
      });
      currentStartSec += durationSec;
    } else if (tag === 'steadystate') {
      const power = parseFloat(node.getAttribute('Power') || '0.75');
      blocks.push({
        type: 'steadystate',
        durationSec,
        startSec: currentStartSec,
        endSec: currentStartSec + durationSec,
        powerPct: power,
        targetCadence,
        name: 'Steady pace'
      });
      currentStartSec += durationSec;
    } else if (tag === 'ramp') {
      const pLow = parseFloat(node.getAttribute('PowerLow') || '0.6');
      const pHigh = parseFloat(node.getAttribute('PowerHigh') || '0.9');
      blocks.push({
        type: 'ramp',
        durationSec,
        startSec: currentStartSec,
        endSec: currentStartSec + durationSec,
        powerLowPct: pLow,
        powerHighPct: pHigh,
        targetCadence,
        name: 'Power ramp'
      });
      currentStartSec += durationSec;
    } else if (tag === 'intervalst') {
      const repeat = parseInt(node.getAttribute('Repeat') || '1', 10);
      const onDur = parseInt(node.getAttribute('OnDuration') || '60', 10);
      const offDur = parseInt(node.getAttribute('OffDuration') || '60', 10);
      const onPower = parseFloat(node.getAttribute('OnPower') || '1.0');
      const offPower = parseFloat(node.getAttribute('OffPower') || '0.5');
      const onCadence = node.getAttribute('Cadence') ? parseInt(node.getAttribute('Cadence'), 10) : null;
      const offCadence = node.getAttribute('CadenceResting') ? parseInt(node.getAttribute('CadenceResting'), 10) : null;

      for (let r = 1; r <= repeat; r++) {
        blocks.push({
          type: 'steadystate',
          durationSec: onDur,
          startSec: currentStartSec,
          endSec: currentStartSec + onDur,
          powerPct: onPower,
          targetCadence: onCadence,
          name: `Interval ${r}/${repeat}`
        });
        currentStartSec += onDur;

        blocks.push({
          type: 'rest',
          durationSec: offDur,
          startSec: currentStartSec,
          endSec: currentStartSec + offDur,
          powerPct: offPower,
          targetCadence: offCadence,
          name: `Recovery ${r}/${repeat}`
        });
        currentStartSec += offDur;
      }
    } else if (tag === 'freeride') {
      blocks.push({
        type: 'freeride',
        durationSec,
        startSec: currentStartSec,
        endSec: currentStartSec + durationSec,
        name: 'Free ride (SIM)'
      });
      currentStartSec += durationSec;
    }
  }

  return {
    id: 'imported-zwo-' + Date.now(),
    name: workoutName,
    description,
    author,
    totalDurationSec: currentStartSec,
    blocks
  };
}

/**
 * Parsuje plik tekstowy .MRC / .ERG (format CompuTrainer)
 */
export function parseMrcWorkout(mrcContent, format = 'auto') {
  const lines = mrcContent.split(/\r?\n/);
  let name = '';
  let description = '';
  let powerUnit = format === 'erg' ? 'watts' : 'percent';
  const courseData = [];

  let inData = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;

    if (line.toUpperCase().startsWith('[COURSE HEADER]')) {
      inData = false;
      continue;
    }
    if (line.toUpperCase().startsWith('[COURSE DATA]')) {
      inData = true;
      continue;
    }
    if (line.toUpperCase().startsWith('[END COURSE DATA]')) {
      inData = false;
      break;
    }

    if (!inData) {
      if (/^MINUTES\s+WATTS\b/i.test(line)) {
        powerUnit = 'watts';
      } else if (/^MINUTES\s+(PERCENT|%)/i.test(line)) {
        powerUnit = 'percent';
      } else if (line.toUpperCase().startsWith('DESCRIPTION')) {
        description = line.substring(line.indexOf('=') + 1).trim();
      } else if (line.toUpperCase().startsWith('FILE NAME')) {
        name = line.substring(line.indexOf('=') + 1).trim();
      }
    } else {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const min = Number(parts[0]);
        const power = Number(parts[1]);
        if (!Number.isFinite(min) || !Number.isFinite(power) || min < 0 || power < 0) {
          throw new Error('Invalid time or power in the workout file.');
        }
        if (courseData.length && min < courseData[courseData.length - 1].min) {
          throw new Error('Times in the workout file must be in ascending order.');
        }
        courseData.push({ min, power });
      }
    }
  }

  if (courseData.length < 2 || courseData[0].min !== 0) {
    throw new Error('A workout must have at least two points and start at minute 0.');
  }
  const isWatts = powerUnit === 'watts';
  const formatName = isWatts ? 'ERG' : 'MRC';
  const blocks = [];
  let currentStartSec = 0;
  for (let i = 0; i < courseData.length - 1; i++) {
    const cur = courseData[i];
    const nxt = courseData[i + 1];
    const durSec = Math.round((nxt.min - cur.min) * 60);
    if (durSec <= 0) continue;

    const currentPower = isWatts ? cur.power : cur.power / 100;
    const nextPower = isWatts ? nxt.power : nxt.power / 100;
    const isRamp = currentPower !== nextPower;
    if (isRamp) {
      blocks.push({
        type: 'ramp',
        durationSec: durSec,
        startSec: currentStartSec,
        endSec: currentStartSec + durSec,
        ...(isWatts
          ? { powerLowWatts: currentPower, powerHighWatts: nextPower }
          : { powerLowPct: currentPower, powerHighPct: nextPower }),
        name: `Ramp ${formatName}`
      });
    } else {
      blocks.push({
        type: !isWatts && currentPower < 0.6 ? 'rest' : 'steadystate',
        durationSec: durSec,
        startSec: currentStartSec,
        endSec: currentStartSec + durSec,
        ...(isWatts ? { powerWatts: currentPower } : { powerPct: currentPower }),
        name: `Interval ${formatName}`
      });
    }
    currentStartSec += durSec;
  }

  if (!blocks.length) throw new Error('The workout file contains no segments with positive duration.');
  return {
    id: `imported-${formatName.toLowerCase()}-` + Date.now(),
    name: name || `Workout ${formatName}`,
    description,
    author: `Imported ${formatName}`,
    powerUnit,
    totalDurationSec: currentStartSec,
    blocks
  };
}

/**
 * Wylicza aktualny stan treningu na dany moment czasu sesji (w sekundach)
 */
export function getWorkoutStateAtTime(workout, elapsedSec, ftpWatts = 250) {
  if (!workout || !Array.isArray(workout.blocks) || workout.blocks.length === 0) {
    return null;
  }

  const clampedSec = Math.max(0, elapsedSec);
  const totalDur = workout.totalDurationSec || 1;
  const isCompleted = clampedSec >= totalDur;

  // Znajdz aktualny blok (z obsługą bloków bez statycznego startSec/endSec)
  let blockIndex = -1;
  let activeBlock = null;
  let blockStart = 0;
  let runningSec = 0;

  for (let i = 0; i < workout.blocks.length; i++) {
    const b = workout.blocks[i];
    const bDuration = b.durationSec || 60;
    const bStart = b.startSec !== undefined ? b.startSec : runningSec;
    const bEnd = b.endSec !== undefined ? b.endSec : bStart + bDuration;
    runningSec = bEnd;

    if (clampedSec >= bStart && clampedSec < bEnd) {
      blockIndex = i;
      activeBlock = b;
      blockStart = bStart;
      break;
    }
  }

  if (!activeBlock) {
    if (isCompleted) {
      blockIndex = workout.blocks.length - 1;
      activeBlock = workout.blocks[blockIndex];
      blockStart =
        activeBlock.startSec !== undefined
          ? activeBlock.startSec
          : Math.max(0, totalDur - (activeBlock.durationSec || 60));
    } else {
      activeBlock = workout.blocks[0];
      blockIndex = 0;
      blockStart = 0;
    }
  }

  if (!activeBlock) {
    return null;
  }

  const blockElapsed = Math.min(activeBlock.durationSec, clampedSec - blockStart);
  const blockRemaining = Math.max(0, activeBlock.durationSec - blockElapsed);
  const blockProgressRatio = activeBlock.durationSec > 0 ? blockElapsed / activeBlock.durationSec : 1.0;

  // Oblicz moc docelowa w watach
  let targetPowerPct = 0.75;
  if (activeBlock.type === 'warmup' || activeBlock.type === 'cooldown' || activeBlock.type === 'ramp') {
    targetPowerPct = THREE_MathUtils_lerp(activeBlock.powerLowPct, activeBlock.powerHighPct, blockProgressRatio);
  } else if (activeBlock.powerPct !== undefined) {
    targetPowerPct = activeBlock.powerPct;
  }

  let targetWatts = Math.round(targetPowerPct * ftpWatts);
  if (activeBlock.powerWatts !== undefined) {
    targetWatts = Math.round(activeBlock.powerWatts);
  } else if (activeBlock.powerLowWatts !== undefined) {
    targetWatts = Math.round(THREE_MathUtils_lerp(activeBlock.powerLowWatts, activeBlock.powerHighWatts, blockProgressRatio));
  }
  targetPowerPct = targetWatts / Math.max(1, ftpWatts);

  // Strefy Coggana Z1-Z7, z progami zgodnymi z HUD.
  const percentFtp = Math.round(targetPowerPct * 100);
  let zoneNumber = 1;
  let zoneColor = '#94a3b8'; // Z1 Grey
  if (percentFtp < 55) {
    zoneNumber = 1;
    zoneColor = '#94a3b8'; // Szary (Z1 Regeneracja)
  } else if (percentFtp <= 75) {
    zoneNumber = 2;
    zoneColor = '#3b82f6'; // Błękit (Z2 Baza tlenowa)
  } else if (percentFtp <= 90) {
    zoneNumber = 3;
    zoneColor = '#22c55e'; // Zielony (Z3 Tempo)
  } else if (percentFtp <= 105) {
    zoneNumber = 4;
    zoneColor = '#eab308'; // Żółty (Z4 Próg FTP)
  } else if (percentFtp <= 120) {
    zoneNumber = 5;
    zoneColor = '#f97316'; // Pomarańczowy (Z5 VO2 Max)
  } else if (percentFtp <= 150) {
    zoneNumber = 6;
    zoneColor = '#ef4444'; // Czerwony (Z6 Moc beztlenowa)
  } else {
    zoneNumber = 7;
    zoneColor = '#a855f7'; // Fioletowy (Z7 Sprint)
  }

  const isErgMode = activeBlock.type !== 'freeride' && !isCompleted;

  return {
    workoutName: workout.name,
    activeBlock,
    blockIndex: blockIndex + 1,
    totalBlocks: workout.blocks.length,
    activeBlockName: activeBlock.name,
    blockType: activeBlock.type,
    blockElapsedSec: blockElapsed,
    blockRemainingSec: blockRemaining,
    blockTotalSec: activeBlock.durationSec,
    blockProgressRatio,
    targetWatts,
    targetPowerPct,
    targetCadence: activeBlock.targetCadence || null,
    zoneNumber,
    zoneColor,
    isErgMode,
    isFreeRide: activeBlock.type === 'freeride',
    isCompleted,
    totalElapsedSec: clampedSec,
    totalRemainingSec: Math.max(0, totalDur - clampedSec),
    totalDurationSec: totalDur
  };
}

function THREE_MathUtils_lerp(x, y, t) {
  return (1 - t) * x + t * y;
}
