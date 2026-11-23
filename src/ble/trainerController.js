import * as THREE from 'three';
import { VIRTUAL_GEAR_RATIOS, getVirtualGearRatios } from '../physics/cyclingPhysics.js';

export function isVirtualShiftingActive(state) {
  return state.virtualShiftingMode === 'always' || (state.virtualShiftingMode !== 'off'
    && Boolean(state.zwiftControllerConnected));
}

// Standardowe identyfikatory serwisów i charakterystyk Bluetooth SIG
export const BLE_SERVICES = {
  FTMS: 0x1826,                 // Fitness Machine Service
  CYCLING_POWER: 0x1818,        // Cycling Power Service (CPS)
  SPEED_CADENCE: 0x1816,        // Cycling Speed and Cadence Service (CSCP)
  HEART_RATE: 0x180d,           // Heart Rate Service (HRS)
  BATTERY: 0x180f,              // Battery Service
  DEVICE_INFO: 0x180a,          // Device Information Service

  // Zastrzeżone/własne protokoły producentów (Direct BLE)
  TACX_FEC: '6e40fec1-b5a3-f393-e0a9-e50e24dcca9e',  // Tacx FE-C over BLE (Nordic UART)
  WAHOO_TRAINER: 'a026e001-0a7d-4ab3-97fa-f1500f4387b0', // Wahoo Direct Fitness Service
};

export const BLE_CHARS = {
  // FTMS (0x1826)
  INDOOR_BIKE_DATA: 0x2ad2,
  FTMS_CONTROL_POINT: 0x2ad9,
  FITNESS_MACHINE_FEATURE: 0x2acc,
  FITNESS_MACHINE_STATUS: 0x2ada,

  // Cycling Power (0x1818)
  CYCLING_POWER_MEASUREMENT: 0x2a63,

  // Cycling Speed & Cadence (0x1816)
  CSC_MEASUREMENT: 0x2a5b,

  // Heart Rate (0x180D)
  HEART_RATE_MEASUREMENT: 0x2a37,

  // Battery (0x180F)
  BATTERY_LEVEL: 0x2a19,

  // Device Info (0x180A)
  MANUFACTURER_NAME: 0x2a29,
  MODEL_NUMBER: 0x2a24,

  // Tacx FE-C (UART over BLE)
  TACX_TX: '6e40fec2-b5a3-f393-e0a9-e50e24dcca9e', // Write do trenażera Tacx
  TACX_RX: '6e40fec3-b5a3-f393-e0a9-e50e24dcca9e', // Notify z trenażera Tacx

  // Wahoo Direct Trainer
  WAHOO_CONTROL: 'a026e005-0a7d-4ab3-97fa-f1500f4387b0', // Sterowanie Wahoo KICKR v1-v3
};

/**
 * Rozszerzona lista prefiksów nazw urządzeń kolarskich
 * Obejmuje 100% popularnych marek trenażerów, mierników mocy, rowerów smart i czujników
 */
export const TRAINER_NAME_PREFIXES = [
  // Wahoo Fitness
  'KICKR', 'WAHOO', 'Wahoo',
  // Tacx / Garmin
  'Tacx', 'TACX', 'NEO', 'Flux', 'FLUX', 'Flow', 'FLOW', 'Vortex', 'Bushido', 'Genius',
  // Elite
  'Elite', 'ELITE', 'Direto', 'Suito', 'Justo', 'Avanti', 'Drivo', 'Rampa', 'Turno', 'Tuo', 'Nerio',
  // Saris / CycleOps
  'Saris', 'SARIS', 'Hammer', 'H2', 'H3', 'H4', 'CycleOps',
  // Magene & ThinkRider
  'Magene', 'MAGENE', 'T100', 'T300', 'T500', 'T600', 'ThinkRider', 'THINKRIDER', 'X3', 'X5', 'X7', 'A1',
  // Decathlon & Zycle & Oreka & Wattbike
  'Van Rysel', 'VAN RYSEL', 'Decathlon', 'D100', 'D500', 'D900', 'Zycle', 'ZYCLE', 'Smart Z', 'Oreka', 'Wattbike', 'WATTBIKE',
  // Stages & Zwift
  'Stages', 'STAGES', 'SB20', 'Zwift', 'ZWIFT', 'Hub', 'Ride',
  // Rowery stacjonarne / Smart Spinning
  'Schwinn', 'SCHWINN', 'Bowflex', 'BOWFLEX', 'IC4', 'C6', 'Keiser', 'KEISER', 'Yesoul', 'YESOUL', 'Renpho', 'Domyos', 'DOMYOS', 'Toorx', 'Bkool', 'BKOOL', 'RacerMate',
  // Ogólne nazwy trenażerów i rowerów
  'Trainer', 'TRAINER', 'Bike', 'BIKE', 'Cycle', 'CYCLE', 'Spin', 'SPIN', 'Power', 'POWER',
  // Mierniki mocy (Pedals / Cranks)
  'Assioma', 'ASSIOMA', 'Rally', 'Vector', '4iiii', 'Quarq', 'QUARQ', 'SRM', 'Rotor', 'Sigeyi', 'XCadey',
  // Czujniki prędkości i kadencji
  'Speed', 'Cadence', 'SPD', 'CAD', 'Cycplus', 'Moofit', 'Coospo',
];

/**
 * Bogata baza modeli trenażerów klasycznych i rolek z fabrycznymi krzywymi oporu zPower:
 * P(v) = a*v^3 + b*v^2 + c*v + d  (gdzie v to prędkość koła w km/h)
 */
export const VIRTUAL_POWER_PRESETS = {
  // Brak profilu (status niekompatybilności z realizmem)
  none: {
    id: 'none',
    name: 'No zPower profile',
    brand: 'None',
    settingHint: 'Choose a trainer model to enable zPower.',
    coeffs: { a: 0, b: 0, c: 0, d: 0 },
    isCompatible: false,
  },
  // Tacx
  tacx_blue_matic: {
    id: 'tacx_blue_matic',
    name: 'Tacx Blue Matic (T2650)',
    brand: 'Tacx',
    settingHint: 'Set the lever to position 3 · Tire pressure: 7.5 bar',
    coeffs: { a: 0.0039, b: 0.11, c: 4.2, d: 0 },
    isCompatible: true,
  },
  tacx_blue_motion: {
    id: 'tacx_blue_motion',
    name: 'Tacx Blue Motion (T2600)',
    brand: 'Tacx',
    settingHint: 'Set the lever to position 4 · Tire pressure: 7.5 bar',
    coeffs: { a: 0.0041, b: 0.13, c: 4.5, d: 0 },
    isCompatible: true,
  },
  tacx_booster: {
    id: 'tacx_booster',
    name: 'Tacx Booster (T2500)',
    brand: 'Tacx',
    settingHint: 'Set the lever to position 3 · Tire pressure: 7.5 bar',
    coeffs: { a: 0.0045, b: 0.14, c: 4.8, d: 0 },
    isCompatible: true,
  },
  tacx_satori: {
    id: 'tacx_satori',
    name: 'Tacx Satori Pro (T1856)',
    brand: 'Tacx',
    settingHint: 'Set the lever to position 3 · Tire pressure: 7.5 bar',
    coeffs: { a: 0.0043, b: 0.12, c: 4.4, d: 0 },
    isCompatible: true,
  },
  // Elite
  elite_novo_force: {
    id: 'elite_novo_force',
    name: 'Elite Novo Force (Magnetyczny)',
    brand: 'Elite',
    settingHint: 'Set the lever to position 3 · Tire pressure: 7.5 bar',
    coeffs: { a: 0.0040, b: 0.12, c: 4.6, d: 0 },
    isCompatible: true,
  },
  elite_qubo_mag: {
    id: 'elite_qubo_mag',
    name: 'Elite Qubo Power Mag',
    brand: 'Elite',
    settingHint: 'Set the lever to position 3 · Tire pressure: 7.5 bar',
    coeffs: { a: 0.0042, b: 0.13, c: 4.7, d: 0 },
    isCompatible: true,
  },
  elite_qubo_fluid: {
    id: 'elite_qubo_fluid',
    name: 'Elite Qubo Fluid (Olejowy)',
    brand: 'Elite',
    settingHint: 'Automatic hydraulic resistance · Tire pressure: 7.5 bar',
    coeffs: { a: 0.0051, b: 0.06, c: 5.2, d: 0 },
    isCompatible: true,
  },
  // Kurt Kinetic
  kinetic_road_machine: {
    id: 'kinetic_road_machine',
    name: 'Kurt Kinetic Road Machine',
    brand: 'Kinetic',
    settingHint: 'Classic fluid trainer · Tire pressure: 7.5 bar',
    coeffs: { a: 0.0053, b: 0.05, c: 5.0, d: 0 },
    isCompatible: true,
  },
  kinetic_rock_roll: {
    id: 'kinetic_rock_roll',
    name: 'Kurt Kinetic Rock and Roll',
    brand: 'Kinetic',
    settingHint: 'Fluid trainer with side-to-side motion · Tire pressure: 7.5 bar',
    coeffs: { a: 0.0053, b: 0.05, c: 5.0, d: 0 },
    isCompatible: true,
  },
  // Decathlon Van Rysel / B'Twin
  decathlon_inride_100: {
    id: 'decathlon_inride_100',
    name: 'B\'Twin / Van Rysel In\'Ride 100',
    brand: 'Decathlon',
    settingHint: 'Set the lever to position 3 · Tire pressure: 7.0 bar',
    coeffs: { a: 0.0038, b: 0.10, c: 4.3, d: 0 },
    isCompatible: true,
  },
  decathlon_inride_500: {
    id: 'decathlon_inride_500',
    name: 'B\'Twin / Van Rysel In\'Ride 500 (Olejowy)',
    brand: 'Decathlon',
    settingHint: 'Oil-based fluid resistance · Tire pressure: 7.0 bar',
    coeffs: { a: 0.0049, b: 0.07, c: 5.1, d: 0 },
    isCompatible: true,
  },
  // Saris / CycleOps
  saris_fluid2: {
    id: 'saris_fluid2',
    name: 'Saris / CycleOps Fluid2',
    brand: 'Saris',
    settingHint: 'Oil-based fluid trainer · Tire pressure: 7.5 bar',
    coeffs: { a: 0.0052, b: 0.05, c: 5.1, d: 0 },
    isCompatible: true,
  },
  saris_mag: {
    id: 'saris_mag',
    name: 'Saris / CycleOps Mag',
    brand: 'Saris',
    settingHint: 'Set the lever to position 3 · Tire pressure: 7.5 bar',
    coeffs: { a: 0.0041, b: 0.11, c: 4.4, d: 0 },
    isCompatible: true,
  },
  // Minoura
  minoura_magride: {
    id: 'minoura_magride',
    name: 'Minoura MagRide 60 / 80',
    brand: 'Minoura',
    settingHint: 'Set the lever to position 3 · Tire pressure: 7.5 bar',
    coeffs: { a: 0.0042, b: 0.12, c: 4.5, d: 0 },
    isCompatible: true,
  },
  // Profile uniwersalne
  fluid: {
    id: 'fluid',
    name: 'Generic fluid trainer',
    brand: 'Generic',
    settingHint: 'Hydraulic resistance rises with speed (v³).',
    coeffs: { a: 0.0053, b: 0.05, c: 5.0, d: 0 },
    isCompatible: true,
  },
  magnetic: {
    id: 'magnetic',
    name: 'Generic magnetic trainer (level 3)',
    brand: 'Generic',
    settingHint: 'Set the lever to the middle position (3 of 5 or 4 of 8).',
    coeffs: { a: 0.0042, b: 0.12, c: 4.5, d: 0 },
    isCompatible: true,
  },
  rollers: {
    id: 'rollers',
    name: 'Road rollers',
    brand: 'Rollers',
    settingHint: 'Klasyczne 3 rolki szosowe',
    coeffs: { a: 0.0028, b: 0.04, c: 3.8, d: 0 },
    isCompatible: true,
  },
  spinbike: {
    id: 'spinbike',
    name: 'Stationary / spin bike',
    brand: 'Spin',
    settingHint: 'Medium flywheel resistance',
    coeffs: { a: 0.0048, b: 0.08, c: 4.8, d: 0 },
    isCompatible: true,
  },
};

// Zachowanie kompatybilności wstecznej dla VIRTUAL_POWER_CURVES
export const VIRTUAL_POWER_CURVES = VIRTUAL_POWER_PRESETS;

/**
 * Oblicza wirtualną moc w watach na podstawie prędkości koła w km/h
 */
export function calculateVirtualPowerWatts(speedKmh, curveKey = 'fluid') {
  if (speedKmh <= 2.0) return 0;
  const preset = VIRTUAL_POWER_PRESETS[curveKey] || VIRTUAL_POWER_PRESETS.fluid;
  if (!preset || !preset.isCompatible) return 0;
  const { a, b, c, d = 0 } = preset.coeffs;
  const v = Math.max(0, speedKmh);
  const watts = a * Math.pow(v, 3) + b * Math.pow(v, 2) + c * v + d;
  return Math.round(THREE.MathUtils.clamp(watts, 0, 1800));
}

/**
 * Uniwersalny Kontroler Bluetooth Low Energy (BLE) dla wszystkich trenażerów i czujników kolarskich:
 *
 * Obsługiwane technologie i protokoły:
 * 1. FTMS (Fitness Machine Service 0x1826) - Wahoo, Tacx, Elite, Saris, Magene, Decathlon Van Rysel, Zwift Hub.
 *    - SIM OpCode 0x11: pełna fizyka nachylenia trasy, oporu toczenia Crr i opływu powietrza Cw.
 *    - OpCode 0x04 (Target Resistance Fallback): płynna regulacja poziomów oporu dla rowerów spin (Schwinn IC4, Bowflex C6, Domyos, Yesoul).
 *    - ERG OpCode 0x05: zadana moc treningowa w watach.
 * 2. Tacx FE-C over BLE (Nordic UART) - starsze trenażery Tacx (Vortex Smart, Bushido Smart, Genius, Flow, starszy Flux/Neo).
 *    - Ramka FE-C Page 51 (Track Resistance: Grade, Crr, Cw) oraz Page 49 (Target Power ERG).
 *    - Odbiór Page 16 (prędkość) oraz Page 25 (rzeczywista moc i kadencja).
 * 3. Wahoo Direct Trainer Service - starsze KICKR (v1, v2, v3, SNAP).
 *    - Sterowanie nachyleniem OpCode 0x43 oraz mocą zadaną OpCode 0x42.
 * 4. Cycling Power Service (CPS 0x1818) - mierniki mocy (Assioma, Stages, 4iiii, Quarq, SRM, Rotor, Magene).
 *    - Rzeczywista moc chwilowa + dekoder kadencji z obrotów korby (Crank Revolutions).
 * 5. Cycling Speed & Cadence (CSCP 0x1816) - trenażery klasyczne + czujnik prędkości / kadencji.
 *    - Wyliczanie wirtualnej mocy (zPower) wg krzywych oporu Fluid/Magnetic/Rollers.
 * 6. Bezstratna kolejka zapisu BLE (Queue), Anti-Dropout Deadman Buffer i Auto-Reconnect Watchdog.
 */
export class TrainerController {
  constructor(state, onStatusChange) {
    this.state = state;
    this.onStatusChange = onStatusChange || (() => {});

    // Urządzenia BLE
    this.bleDevice = null;
    this.hrmDevice = null;
    this.deviceName = 'Smart trainer';
    this.manufacturerName = '';
    this.activeProtocol = 'ftms-sim'; // Domyślnie 'ftms-sim', negocjowane w setupTrainerServices

    // Charakterystyki sterujące
    this.ftmsControlPointChar = null;
    this.tacxTxChar = null;
    this.wahooControlChar = null;

    // Wsparcie cech FTMS
    this.ftmsSupportsSim = true;
    this.ftmsSupportsResistanceLevel = false;
    this.ftmsSupportsTargetPower = false;
    this.ftmsMinResistance = 1;
    this.ftmsMaxResistance = 100;

    // Rampa nachylenia i synchronizacja oporu
    this.lastSentGradePct = null;
    this.currentSmoothedGrade = null;
    this.lastBleSendTime = 0;
    this.lastUpdateTime = 0;

    // 1. Auto-reconnect
    this.isAutoReconnecting = false;
    this.reconnectAttempt = 0;
    this.maxReconnectAttempts = 6;
    this.reconnectTimeoutId = null;
    this.manualDisconnect = false;

    // 2. Bezstratna kolejka zapisu BLE (Queue)
    this.isWritingBle = false;
    this.pendingControlWrite = null;
    this.controlGeneration = 0;
    this.trainerMode = state.trainerMode === 'erg' ? 'erg' : 'sim';

    // ERG Soft-Start rampa narastania mocy
    this.ergTargetWatts = null;
    this.ergCurrentWatts = null;
    this.ergRampIntervalId = null;

    // 3. Filtr dropoutow mocy i kadencji (Anti-Dropout Deadman Buffer)
    this.lastPositiveWatts = 0;
    this.lastPositiveWattsTime = 0;
    this.lastPositiveCadence = 0;
    this.lastPositiveCadenceTime = 0;
    this.lastPacketTime = 0;

    // 4. Dekodery obrotów korby i koła (dla CPS oraz CSCP)
    this.lastCrankRevs = null;
    this.lastCrankEventTime = null;
    this.lastWheelRevs = null;
    this.lastWheelEventTime = null;
    this.wheelCircumferenceM = 2.105; // Standard 700x25c szosowe

    // 5. Asystent kalibracji Spindown
    this.isSpindownActive = false;
    this.spindownPhase = null; // 'spinup' | 'coasting' | 'success' | 'cancelled'
    this.spindownStartCoastTime = 0;
    this.spindownCallback = null;
    this.lastObservedSpeedKmh = 0;
  }

  get isConnected() {
    return Boolean(this.bleDevice && this.bleDevice.gatt && this.bleDevice.gatt.connected && this.state.bleConnected);
  }

  /**
   * Główna funkcja nawiązywania połączenia z dowolnym trenażerem, miernikiem mocy lub czujnikiem
   * @param {boolean} useUniversalSearch - jeśli true, używa trybu acceptAllDevices bez filtrów nazw/usług
   */
  async connectTrainer(useUniversalSearch = false) {
    if (!navigator.bluetooth) {
      this.onStatusChange(
        'Web Bluetooth is unavailable. Use Chrome, Edge, or the desktop app.',
        false
      );
      return;
    }

    try {
      this.manualDisconnect = false;
      this.clearAutoReconnect();
      this.onStatusChange('Searching for a Bluetooth trainer or cycling sensor…', false);

      const allOptionalServices = [
        BLE_SERVICES.FTMS,
        BLE_SERVICES.CYCLING_POWER,
        BLE_SERVICES.SPEED_CADENCE,
        BLE_SERVICES.HEART_RATE,
        BLE_SERVICES.BATTERY,
        BLE_SERVICES.DEVICE_INFO,
        BLE_SERVICES.TACX_FEC,
        BLE_SERVICES.WAHOO_TRAINER,
        '00001826-0000-1000-8000-00805f9b34fb',
        '00001818-0000-1000-8000-00805f9b34fb',
        '00001816-0000-1000-8000-00805f9b34fb',
        '0000180f-0000-1000-8000-00805f9b34fb',
        '0000180a-0000-1000-8000-00805f9b34fb',
      ];

      let requestOptions;

      if (useUniversalSearch) {
        requestOptions = {
          acceptAllDevices: true,
          optionalServices: allOptionalServices,
        };
      } else {
        // Zbuduj bogatą listę filtrów obejmującą 100% trenażerów, mierników i czujników
        const filters = [
          { services: [BLE_SERVICES.FTMS] },
          { services: [BLE_SERVICES.CYCLING_POWER] },
          { services: [BLE_SERVICES.SPEED_CADENCE] },
          { services: [BLE_SERVICES.TACX_FEC] },
          { services: [BLE_SERVICES.WAHOO_TRAINER] },
          ...TRAINER_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
        ];

        requestOptions = {
          filters,
          optionalServices: allOptionalServices,
        };
      }

      this.bleDevice = await navigator.bluetooth.requestDevice(requestOptions);
      this.deviceName = this.bleDevice.name || 'Bluetooth smart trainer';

      this.bleDevice.addEventListener('gattserverdisconnected', () => {
        this.handleGattDisconnection();
      });

      this.onStatusChange(`Connecting to ${this.deviceName}...`, false);
      const server = await this.bleDevice.gatt.connect();

      // Automatyczna negocjacja usług (FTMS, Tacx FE-C, Wahoo, CPS, CSCP)
      const connectionSummary = await this.setupTrainerServices(server);

      this.state.bleConnected = true;
      this.reconnectAttempt = 0;

      const summaryText = connectionSummary || 'Connected (full telemetry)';
      this.onStatusChange(
        `Connected to ${this.deviceName} [${summaryText}]`,
        true,
        this.deviceName
      );

      this.syncControlAfterConnection();
    } catch (err) {
      if (err.name === 'NotFoundError' || err.message.includes('User cancelled')) {
        this.onStatusChange('Bluetooth device selection canceled.', false);
      } else {
        this.onStatusChange(`Device connection error: ${err.message}`, false);
      }
    }
  }

  /**
   * Automatyczna negocjacja i konfiguracja usług w kolejności priorytetu
   */
  async setupTrainerServices(server) {
    this.activeProtocol = null;
    this.ftmsControlPointChar = null;
    this.tacxTxChar = null;
    this.wahooControlChar = null;

    const detectedFeatures = [];

    // 1. Sprawdź Device Information Service (odczyt producenta / modelu)
    try {
      const devInfoService = await server.getPrimaryService(BLE_SERVICES.DEVICE_INFO);
      try {
        const mfgChar = await devInfoService.getCharacteristic(BLE_CHARS.MANUFACTURER_NAME);
        const mfgVal = await mfgChar.readValue();
        this.manufacturerName = new TextDecoder().decode(mfgVal).trim();
      } catch (_) {}
    } catch (_) {}

    // 2. Sprawdź Battery Service
    try {
      const battService = await server.getPrimaryService(BLE_SERVICES.BATTERY);
      const battChar = await battService.getCharacteristic(BLE_CHARS.BATTERY_LEVEL);
      const battVal = await battChar.readValue();
      this.state.trainerBatteryPct = battVal.getUint8(0);
      detectedFeatures.push(`Bat: ${this.state.trainerBatteryPct}%`);
    } catch (_) {}

    // 3. Sprawdź FTMS (0x1826) - najnowocześniejszy standard branżowy
    let ftmsConnected = false;
    try {
      const ftmsService = await server.getPrimaryService(BLE_SERVICES.FTMS);

      // Sprawdź cechy trenażera (Feature Char 0x2ACC)
      try {
        const featureChar = await ftmsService.getCharacteristic(BLE_CHARS.FITNESS_MACHINE_FEATURE);
        const featVal = await featureChar.readValue();
        const featFlags = featVal.getUint32(0, true);
        // Bit 13: Indoor Bike Simulation Parameters
        this.ftmsSupportsSim = (featFlags & (1 << 13)) !== 0;
        // Bit 7: Resistance Level
        this.ftmsSupportsResistanceLevel = (featFlags & (1 << 7)) !== 0;
        // Bit 14: Target Power (ERG)
        this.ftmsSupportsTargetPower = (featFlags & (1 << 14)) !== 0;
      } catch (_) {
        this.ftmsSupportsSim = true;
      }

      // Odbiór danych z trenażera (Indoor Bike Data 0x2AD2)
      try {
        const bikeDataChar = await ftmsService.getCharacteristic(BLE_CHARS.INDOOR_BIKE_DATA);
        await bikeDataChar.startNotifications();
        bikeDataChar.addEventListener('characteristicvaluechanged', (e) =>
          this.handleIndoorBikeData(e)
        );
        ftmsConnected = true;
      } catch (dataErr) {
        console.warn('FTMS Indoor Bike Data unavailable:', dataErr);
      }

      // Sterowanie oporem (FTMS Control Point 0x2AD9)
      try {
        this.ftmsControlPointChar = await ftmsService.getCharacteristic(
          BLE_CHARS.FTMS_CONTROL_POINT
        );
        // Żądanie kontroli: Request Control (0x00) & Start/Resume (0x07)
        try {
          await this.ftmsControlPointChar.writeValue(new Uint8Array([0x00]));
        } catch (_) {}
        try {
          await this.ftmsControlPointChar.writeValue(new Uint8Array([0x07]));
        } catch (_) {}

        if (this.ftmsSupportsSim) {
          this.activeProtocol = 'ftms-sim';
          detectedFeatures.push('FTMS SIM (route grade)');
        } else if (this.ftmsSupportsResistanceLevel) {
          this.activeProtocol = 'ftms-res';
          detectedFeatures.push('FTMS resistance level');
        } else {
          this.activeProtocol = 'ftms-sim';
          detectedFeatures.push('FTMS');
        }
      } catch (cpErr) {
        console.warn('FTMS Control Point unavailable:', cpErr);
        if (ftmsConnected && !this.activeProtocol) {
          this.activeProtocol = 'ftms-telemetry';
          detectedFeatures.push('FTMS telemetry');
        }
      }
    } catch (_) {
      // Brak FTMS na urządzeniu
    }

    // 4. Sprawdź Tacx FE-C over BLE (dla starszych modeli Tacx: Vortex, Bushido, Flow, Genius)
    if (!this.activeProtocol || this.activeProtocol === 'ftms-telemetry') {
      try {
        const tacxService = await server.getPrimaryService(BLE_SERVICES.TACX_FEC);
        this.tacxTxChar = await tacxService.getCharacteristic(BLE_CHARS.TACX_TX);
        const rxChar = await tacxService.getCharacteristic(BLE_CHARS.TACX_RX);
        await rxChar.startNotifications();
        rxChar.addEventListener('characteristicvaluechanged', (e) =>
          this.handleTacxFecData(e)
        );
        this.activeProtocol = 'tacx-fec';
        detectedFeatures.push('Tacx FE-C (resistance control)');
      } catch (_) {}
    }

    // 5. Sprawdź Wahoo Direct Trainer Service (starsze Wahoo KICKR v1-v3, SNAP)
    if (!this.activeProtocol || this.activeProtocol === 'ftms-telemetry') {
      try {
        const wahooService = await server.getPrimaryService(BLE_SERVICES.WAHOO_TRAINER);
        this.wahooControlChar = await wahooService.getCharacteristic(BLE_CHARS.WAHOO_CONTROL);
        this.activeProtocol = 'wahoo';
        detectedFeatures.push('Wahoo KICKR BLE');
      } catch (_) {}
    }

    // 6. Sprawdź Cycling Power Service (0x1818) - mierniki mocy lub trenażery z niezależnym broadcastem mocy
    try {
      const cpsService = await server.getPrimaryService(BLE_SERVICES.CYCLING_POWER);
      const powerChar = await cpsService.getCharacteristic(BLE_CHARS.CYCLING_POWER_MEASUREMENT);
      await powerChar.startNotifications();
      powerChar.addEventListener('characteristicvaluechanged', (e) =>
        this.handleCyclingPowerData(e)
      );
      if (!this.activeProtocol) {
        this.activeProtocol = 'cps';
        detectedFeatures.push('Power meter (CPS)');
      } else {
        detectedFeatures.push('CPS power');
      }
    } catch (_) {}

    // 7. Sprawdź Cycling Speed and Cadence Service (0x1816) - czujniki prędkości/kadencji i trenażery klasyczne
    try {
      const cscService = await server.getPrimaryService(BLE_SERVICES.SPEED_CADENCE);
      const cscChar = await cscService.getCharacteristic(BLE_CHARS.CSC_MEASUREMENT);
      await cscChar.startNotifications();
      cscChar.addEventListener('characteristicvaluechanged', (e) =>
        this.handleCscData(e)
      );
      if (!this.activeProtocol) {
        this.activeProtocol = 'cscp';
        detectedFeatures.push('Speed and cadence (zPower)');
      } else {
        detectedFeatures.push('CSC cadence');
      }
    } catch (_) {}

    return detectedFeatures.join(' · ');
  }

  /**
   * Obsługa niespodziewanego rozłączenia i uruchomienie wznawiania w tle
   */
  handleGattDisconnection() {
    this.state.bleConnected = false;
    this.cancelPendingControl();
    this.ftmsControlPointChar = null;
    this.tacxTxChar = null;
    this.wahooControlChar = null;
    this.activeProtocol = null;

    if (!this.manualDisconnect && this.bleDevice) {
      this.scheduleAutoReconnect();
    } else {
      this.onStatusChange('Trainer disconnected. Keyboard simulation is available.', false);
    }
  }

  /**
   * Auto-Reconnect z algorytmem Exponential Backoff
   */
  scheduleAutoReconnect() {
    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      this.onStatusChange(
        `Lost connection to ${this.deviceName}. Select “Connect trainer” to resume.`,
        false
      );
      this.isAutoReconnecting = false;
      return;
    }

    this.isAutoReconnecting = true;
    this.reconnectAttempt++;

    const backoffMs = Math.round(Math.min(1500 * Math.pow(1.55, this.reconnectAttempt - 1), 14000));

    this.onStatusChange(
      `Lost connection to ${this.deviceName}. Retrying in the background (${this.reconnectAttempt}/${this.maxReconnectAttempts}) za ${(backoffMs / 1000).toFixed(1)}s...`,
      false
    );

    this.clearAutoReconnect();
    this.reconnectTimeoutId = setTimeout(async () => {
      if (!this.bleDevice || !this.bleDevice.gatt) {
        this.isAutoReconnecting = false;
        return;
      }

      try {
        const server = await this.bleDevice.gatt.connect();
        const summary = await this.setupTrainerServices(server);

        this.state.bleConnected = true;
        this.isAutoReconnecting = false;
        this.reconnectAttempt = 0;

        this.onStatusChange(
          `Reconnected to ${this.deviceName}! [${summary || 'Active'}]`,
          true,
          this.deviceName
        );

        this.syncControlAfterConnection();
      } catch (err) {
        console.warn(`Reconnect attempt (${this.reconnectAttempt}) failed:`, err.message);
        this.scheduleAutoReconnect();
      }
    }, backoffMs);
  }

  clearAutoReconnect() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  /**
   * Połączenie z czujnikiem tętna (Heart Rate Monitor - 0x180D)
   */
  async connectHeartRateMonitor() {
    if (!navigator.bluetooth) return;
    try {
      this.hrmDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE_SERVICES.HEART_RATE] }],
        optionalServices: [BLE_SERVICES.HEART_RATE, BLE_SERVICES.BATTERY],
      });
      const server = await this.hrmDevice.gatt.connect();
      this.state.heartRateConnected = true;
      this.hrmDevice.addEventListener('gattserverdisconnected',()=>{
        this.state.heartRateConnected=false;this.state.heartRate=0;
      });
      const service = await server.getPrimaryService(BLE_SERVICES.HEART_RATE);
      const char = await service.getCharacteristic(BLE_CHARS.HEART_RATE_MEASUREMENT);
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', (event) => {
        const data = event.target.value;
        if (!data || data.byteLength < 2) return;
        const flags = data.getUint8(0);
        const hr = (flags & 0x01) === 0 ? data.getUint8(1) : data.getUint16(1, true);
        if (hr > 30 && hr < 240) {
          this.state.heartRate = hr;
          this.state.lastHeartRateAtMs = performance.now();
        }
      });
      const hrmName = this.hrmDevice.name || 'Heart rate monitor';
      this.onStatusChange(`Heart rate monitor connected: ${hrmName}`, true);
    } catch (err) {
      console.warn('HRM connection cancelled/failed:', err.message);
    }
  }

  /**
   * Dedykowane parowanie trenażera oporowego (FTMS / Tacx / Wahoo Controllable)
   */
  async connectControllableTrainer() {
    return this.connectTrainer(false);
  }

  /**
   * Dedykowane parowanie miernika mocy (Cycling Power Service 0x1818 - np. Assioma, Stages, Inpeak, 4iiii, Quarq)
   */
  async connectPowerMeter() {
    if (!navigator.bluetooth) return;
    try {
      this.onStatusChange('Searching for a Bluetooth power meter (Cycling Power 0x1818)…', false);
      const powerDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE_SERVICES.CYCLING_POWER] }],
        optionalServices: [BLE_SERVICES.CYCLING_POWER, BLE_SERVICES.BATTERY, BLE_SERVICES.DEVICE_INFO],
      });
      const server = await powerDevice.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICES.CYCLING_POWER);
      const char = await service.getCharacteristic(BLE_CHARS.CYCLING_POWER_MEASUREMENT);
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', (e) => this.handleCyclingPowerData(e,'power-meter'));

      const name = powerDevice.name || 'Bluetooth power meter';
      this.state.powerMeterConnected = true;
      this.state.powerMeterDeviceName = name;
      powerDevice.addEventListener('gattserverdisconnected', () => {
        this.state.powerMeterConnected = false;
        this.onStatusChange(`Power meter disconnected: ${name}`, false);
      });
      this.onStatusChange(`Power meter connected: ${name}`, true, name);
    } catch (err) {
      this.state.powerMeterConnected = false;
      this.onStatusChange(`Power meter pairing canceled: ${err.message}`, false);
    }
  }

  /**
   * Dedykowane parowanie czujnika kadencji (Cycling Speed & Cadence 0x1816)
   */
  async connectCadenceSensor() {
    if (!navigator.bluetooth) return;
    try {
      this.onStatusChange('Searching for a Bluetooth cadence sensor (CSC 0x1816)…', false);
      const cadDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE_SERVICES.SPEED_CADENCE] }],
        optionalServices: [BLE_SERVICES.SPEED_CADENCE, BLE_SERVICES.BATTERY],
      });
      const server = await cadDevice.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICES.SPEED_CADENCE);
      const char = await service.getCharacteristic(BLE_CHARS.CSC_MEASUREMENT);
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', (e) => this.handleCscData(e,'cadence-sensor'));

      const name = cadDevice.name || 'Bluetooth cadence sensor';
      this.state.cadenceSensorConnected = true;
      this.state.cadenceDeviceName = name;
      cadDevice.addEventListener('gattserverdisconnected', () => {
        this.state.cadenceSensorConnected = false;
        this.onStatusChange(`Cadence sensor disconnected: ${name}`, false);
      });
      this.onStatusChange(`Cadence sensor connected: ${name}`, true, name);
    } catch (err) {
      this.state.cadenceSensorConnected = false;
      this.onStatusChange(`Cadence sensor pairing canceled: ${err.message}`, false);
    }
  }

  /**
   * Zwraca precyzyjny status realizmu fizyki trenażera i zPower
   */
  getRealismStatus() {
    if (!this.state.bleConnected) {
      return {
        isRealistic: false,
        status: 'keyboard',
        badge: 'Keyboard',
        title: 'Power source: Keyboard simulation',
        description: 'Use the keyboard arrows to set simulated power.',
        cssClass: 'realism-muted',
      };
    }

    // 1. Trenażer Smart (FTMS SIM, Tacx FE-C, Wahoo Direct) -> 100% Realizm
    if (this.activeProtocol === 'ftms-sim' || this.activeProtocol === 'tacx-fec' || this.activeProtocol === 'wahoo') {
      return {
        isRealistic: true,
        status: 'full-smart',
        badge: 'Resistance control: Smart FTMS',
        title: 'Route resistance control is active',
        description: `Connected to ${this.deviceName}. The trainer adjusts resistance to match the route grade.`,
        cssClass: 'realism-ok',
      };
    }

    // 2. Trenażer spin bike (FTMS RES) -> Poziomy oporu magnetycznego
    if (this.activeProtocol === 'ftms-res') {
      return {
        isRealistic: true,
        status: 'smart-res',
        badge: 'Resistance control: Levels',
        title: 'Trainer resistance: Magnetic',
        description: `Connected to ${this.deviceName}. Resistance follows the elevation profile.`,
        cssClass: 'realism-ok',
      };
    }

    // 3. Miernik mocy (CPS - Assioma, Stages, 4iiii, Quarq itp.) -> Rzeczywiste waty
    if (this.activeProtocol === 'cps') {
      return {
        isRealistic: true,
        status: 'power-meter',
        badge: 'Power source: Power meter',
        title: 'Power source: Power meter',
        description: `Power meter ${this.deviceName} supplies measured power. OskiRide calculates speed from power and route grade.`,
        cssClass: 'realism-ok',
      };
    }

    // 4. Czujnik prędkości (CSCP) -> Zależy od wybranego profilu zPower!
    if (this.activeProtocol === 'cscp') {
      const curveKey = this.state.virtualPowerCurve || 'fluid';
      const preset = VIRTUAL_POWER_PRESETS[curveKey];

      if (preset && preset.isCompatible && curveKey !== 'none') {
        return {
          isRealistic: true,
          status: 'zpower-ok',
          badge: `Power source: zPower (${preset.name})`,
          title: `Power source: zPower (${preset.name})`,
          description: `zPower curve active. ${preset.settingHint || 'Recommended tire pressure: 7.5 bar'}.`,
          cssClass: 'realism-ok',
        };
      } else {
        return {
          isRealistic: false,
          status: 'unrealistic-zpower',
          badge: 'Power source: No zPower profile',
          title: 'No zPower profile for this sensor',
          description: 'A speed sensor is connected. Select a matching zPower trainer profile in Devices.',
          cssClass: 'realism-warn',
        };
      }
    }

    return {
      isRealistic: false,
      status: 'unknown',
      badge: 'Power source: Unknown',
      title: 'Device status unknown',
      description: 'Connect a trainer or sensor to check compatibility.',
      cssClass: 'realism-muted',
    };
  }

  /**
   * Rozpoczyna procedurę kalibracji wybiegu koła zamachowego (Spindown)
   */
  startSpindown(onUpdate) {
    this.cancelPendingControl();
    this.isSpindownActive = true;
    this.spindownPhase = 'spinup';
    this.spindownStartCoastTime = 0;
    this.spindownCallback = onUpdate || (() => {});

    // Próba komendy FTMS OpCode 0x13 (Spin-down Control: Start)
    if (this.ftmsControlPointChar) {
      try {
        this.ftmsControlPointChar.writeValue(new Uint8Array([0x13, 0x01]));
      } catch (_) {}
    }

    this.spindownCallback({
      phase: 'spinup',
      speedKmh: this.lastObservedSpeedKmh || (this.state.speedMps * 3.6),
      targetSpeedKmh: 37.0,
      progressPct: THREE.MathUtils.clamp(((this.lastObservedSpeedKmh || 0) / 37.0) * 100, 0, 100),
      message: 'Pedal until the trainer reaches 37.0 km/h.',
    });
  }

  /**
   * Anulowanie aktywnej kalibracji Spindown
   */
  cancelSpindown() {
    this.isSpindownActive = false;
    this.spindownPhase = null;
    if (this.spindownCallback) {
      this.spindownCallback({ phase: 'cancelled', message: 'Spindown calibration canceled.' });
      this.spindownCallback = null;
    }
  }

  /**
   * Aktualizuje stan procedury Spindown w czasie rzeczywistym
   */
  updateSpindownProgress(currentSpeedKmh) {
    if (!this.isSpindownActive || !this.spindownCallback) return;
    const now = performance.now();
    const speed = Math.max(0, currentSpeedKmh);
    this.lastObservedSpeedKmh = speed;

    if (this.spindownPhase === 'spinup') {
      const progressPct = THREE.MathUtils.clamp((speed / 37.0) * 100, 0, 100);
      if (speed >= 37.0) {
        this.spindownPhase = 'coasting';
        this.spindownStartCoastTime = now;
        this.spindownCallback({
          phase: 'coasting',
          speedKmh: speed,
          targetSpeedKmh: 37.0,
          progressPct: 100,
          message: 'Stop pedaling and let the flywheel coast.',
        });
      } else {
        this.spindownCallback({
          phase: 'spinup',
          speedKmh: speed,
          targetSpeedKmh: 37.0,
          progressPct,
          message: `Accelerate the trainer: ${speed.toFixed(1)} / 37.0 km/h`,
        });
      }
    } else if (this.spindownPhase === 'coasting') {
      const coastTimeSec = (now - this.spindownStartCoastTime) / 1000;
      if (speed <= 15.0) {
        this.spindownPhase = 'success';
        this.isSpindownActive = false;
        const finalTimeSec = Math.max(1.0, coastTimeSec);
        this.state.trainerCalibrated = true;
        this.state.lastCalibrationDate = new Date().toISOString();
        this.state.calibrationTimeSec = Number(finalTimeSec.toFixed(1));

        this.spindownCallback({
          phase: 'success',
          speedKmh: speed,
          coastTimeSec: this.state.calibrationTimeSec,
          message: `Calibration complete. Spindown time: ${this.state.calibrationTimeSec} s.`,
        });
      } else {
        this.spindownCallback({
          phase: 'coasting',
          speedKmh: speed,
          coastTimeSec: Number(coastTimeSec.toFixed(1)),
          progressPct: THREE.MathUtils.clamp(((37.0 - speed) / 22.0) * 100, 0, 100),
          message: `Flywheel coasting… ${speed.toFixed(1)} km/h (do not pedal)`,
        });
      }
    }
  }

  // ============================================================================
  // DEKODOWANIE DANYCH WEJŚCIOWYCH (FTMS, Tacx FE-C, CPS, CSCP)
  // ============================================================================

  /**
   * Dekodowanie FTMS Indoor Bike Data (0x2AD2) z pełną ochroną zakresów pamięci
   */
  handleIndoorBikeData(event) {
    this.currentPacketSource='trainer';
    const data = event.target.value;
    if (!data || data.byteLength < 2) return;

    const flags = data.getUint16(0, true);
    const now = performance.now();
    this.lastPacketTime = now;
    let offset = 2;

    // Bit 0 = 0 -> Instantaneous Speed present
    if ((flags & 0x0001) === 0) {
      if (offset + 2 <= data.byteLength) {
        const rawSpeed = data.getUint16(offset, true) * 0.01; // km/h
        offset += 2;
        this.lastObservedSpeedKmh = rawSpeed;
        this.updateSpindownProgress(rawSpeed);
      }
    }
    // Bit 1 -> Average Speed
    if (flags & 0x0002) {
      if (offset + 2 <= data.byteLength) offset += 2;
    }

    // Bit 2 -> Instantaneous Cadence (0.5 RPM)
    if (flags & 0x0004) {
      if (offset + 2 <= data.byteLength) {
        const rawCadence = Math.round(data.getUint16(offset, true) * 0.5);
        offset += 2;
        this.processIncomingCadence(rawCadence, now);
      }
    }

    // Bit 3 -> Average Cadence
    if (flags & 0x0008) {
      if (offset + 2 <= data.byteLength) offset += 2;
    }
    // Bit 4 -> Total Distance (uint24)
    if (flags & 0x0010) {
      if (offset + 3 <= data.byteLength) offset += 3;
    }
    // Bit 5 -> Resistance Level
    if (flags & 0x0020) {
      if (offset + 2 <= data.byteLength) offset += 2;
    }

    // Bit 6 -> Instantaneous Power (sint16 Watts)
    if (flags & 0x0040) {
      if (offset + 2 <= data.byteLength) {
        const rawWatts = Math.max(0, data.getInt16(offset, true));
        offset += 2;
        this.processIncomingWatts(rawWatts, now);
      }
    }
  }

  /**
   * Dekodowanie pakietów Tacx FE-C over BLE (Nordic UART RX)
   */
  handleTacxFecData(event) {
    this.currentPacketSource='trainer';
    const data = event.target.value;
    if (!data || data.byteLength < 5) return;

    // Tacx BLE przesyła ramki ANT+ FE-C: [0xA4, Len, 0x4E, Channel, Page, ...]
    const sync = data.getUint8(0);
    if (sync !== 0xa4) return;

    const now = performance.now();
    this.lastPacketTime = now;
    const page = data.getUint8(4);

    if (page === 0x19) {
      // Page 25 (0x19) - Specific Trainer Data
      // Byte 6: Cadence (RPM, 0xFF = brak)
      if (data.byteLength >= 11) {
        const rawCadence = data.getUint8(6);
        if (rawCadence !== 0xff) {
          this.processIncomingCadence(rawCadence, now);
        }

        // Byte 9-10: Instantaneous Power (12-bit uint)
        const powerLsb = data.getUint8(9);
        const powerMsbNibble = data.getUint8(10) & 0x0f;
        const rawWatts = powerLsb | (powerMsbNibble << 8);
        this.processIncomingWatts(rawWatts, now);
      }
    } else if (page === 0x10) {
      // Page 16 (0x10) - General FE Data
      // Byte 8-9: Speed (0.001 m/s)
      if (data.byteLength >= 10) {
        const speedMps = data.getUint16(8, true) * 0.001;
        const speedKmh = speedMps * 3.6;
        this.lastObservedSpeedKmh = speedKmh;
        this.updateSpindownProgress(speedKmh);
      }
    }
  }

  /**
   * Dekodowanie Cycling Power Service (0x1818 / Measurement 0x2A63)
   * Zawiera moc chwilową oraz precyzyjne odczyty obrotów korby (kadencja bez dodatkowego czujnika!)
   */
  handleCyclingPowerData(event, source = 'trainer') {
    this.currentPacketSource=source;
    const data = event.target.value;
    if (!data || data.byteLength < 4) return;

    const now = performance.now();
    this.lastPacketTime = now;

    const flags = data.getUint16(0, true);
    const rawWatts = Math.max(0, data.getInt16(2, true));
    this.processIncomingWatts(rawWatts, now);

    let offset = 4;
    if (flags & 0x0001) offset += 1; // Pedal Power Balance
    if (flags & 0x0004) offset += 2; // Accumulated Torque
    if (flags & 0x0010) offset += 6; // Wheel Revolution Data

    // Bit 5 (0x0020) -> Crank Revolution Data Present (Kadencja!)
    if (flags & 0x0020) {
      if (offset + 4 <= data.byteLength) {
        const crankRevs = data.getUint16(offset, true);
        const crankTime = data.getUint16(offset + 2, true); // jednostka: 1/1024s

        if (this.lastCrankRevs !== null && this.lastCrankEventTime !== null) {
          const revDelta = (crankRevs - this.lastCrankRevs) & 0xffff;
          const timeDelta = ((crankTime - this.lastCrankEventTime) & 0xffff) / 1024.0;

          if (timeDelta > 0.1 && timeDelta < 2.5 && revDelta > 0) {
            const computedCadence = Math.round((revDelta / timeDelta) * 60);
            if (computedCadence >= 20 && computedCadence <= 220) {
              this.processIncomingCadence(computedCadence, now);
            }
          } else if (revDelta === 0 && now - this.lastPositiveCadenceTime > 800) {
            // Brak obrotu korby w zadanym oknie czasowym -> natychmiastowe zerowanie kadencji
            this.processIncomingCadence(0, now);
          }
        }
        this.lastCrankRevs = crankRevs;
        this.lastCrankEventTime = crankTime;
      }
    }
  }

  /**
   * Dekodowanie Cycling Speed and Cadence (0x1816 / Measurement 0x2A5B)
   * Obsługuje czujniki prędkości/kadencji i wylicza moc wirtualną (zPower)
   */
  handleCscData(event, source = 'trainer') {
    this.currentPacketSource=source;
    const data = event.target.value;
    if (!data || data.byteLength < 1) return;

    const flags = data.getUint8(0);
    const now = performance.now();
    this.lastPacketTime = now;
    let offset = 1;

    // Bit 0 (0x01) -> Wheel Revolution Data Present (Prędkość koła + Virtual Power)
    if (flags & 0x01) {
      if (offset + 6 <= data.byteLength) {
        const wheelRevs = data.getUint32(offset, true);
        const wheelTime = data.getUint16(offset + 4, true); // 1/1024s
        offset += 6;

        if (this.lastWheelRevs !== null && this.lastWheelEventTime !== null) {
          const revDelta = (wheelRevs - this.lastWheelRevs) >>> 0;
          const timeDelta = ((wheelTime - this.lastWheelEventTime) & 0xffff) / 1024.0;

          if (timeDelta > 0.08 && timeDelta < 3.0 && revDelta > 0) {
            const speedMps = (revDelta * this.wheelCircumferenceM) / timeDelta;
            const speedKmh = speedMps * 3.6;
            this.lastObservedSpeedKmh = speedKmh;
            this.updateSpindownProgress(speedKmh);

            // Jeśli nie ma bezpośredniego miernika mocy, wylicz moc wirtualną (zPower)
            if (this.activeProtocol === 'cscp') {
              const curveKey = this.state.virtualPowerCurve || 'fluid';
              const virtualWatts = calculateVirtualPowerWatts(speedKmh, curveKey);
              this.processIncomingWatts(virtualWatts, now,'virtual-power');
            }
          }
        }
        this.lastWheelRevs = wheelRevs;
        this.lastWheelEventTime = wheelTime;
      }
    }

    // Bit 1 (0x02) -> Crank Revolution Data Present (Kadencja)
    if (flags & 0x02) {
      if (offset + 4 <= data.byteLength) {
        const crankRevs = data.getUint16(offset, true);
        const crankTime = data.getUint16(offset + 2, true);

        if (this.lastCrankRevs !== null && this.lastCrankEventTime !== null) {
          const revDelta = (crankRevs - this.lastCrankRevs) & 0xffff;
          const timeDelta = ((crankTime - this.lastCrankEventTime) & 0xffff) / 1024.0;

          if (timeDelta > 0.1 && timeDelta < 2.5 && revDelta > 0) {
            const computedCadence = Math.round((revDelta / timeDelta) * 60);
            if (computedCadence >= 20 && computedCadence <= 220) {
              this.processIncomingCadence(computedCadence, now);
            }
          } else if (revDelta === 0 && now - this.lastPositiveCadenceTime > 800) {
            // Brak obrotu korby w zadanym oknie czasowym -> natychmiastowe zerowanie kadencji
            this.processIncomingCadence(0, now);
          }
        }
        this.lastCrankRevs = crankRevs;
        this.lastCrankEventTime = crankTime;
      }
    }
  }

  /**
   * Filtr i bufor kadencji
   */
  processIncomingCadence(rawCadence, now) {
    this.state.lastCadenceAtMs=now;
    this.state.lastCadenceSource=this.currentPacketSource || 'trainer';
    if (rawCadence > 0) {
      this.lastPositiveCadence = rawCadence;
      this.lastPositiveCadenceTime = now;
      this.state.cadence = rawCadence;
    } else {
      // Natychmiastowe zatrzymanie kadencji (Zero-Lag Pedaling): brak obrotu = natychmiastowy stop
      this.state.cadence = 0;
    }
  }

  /**
   * Inteligentny bufor mocy zapobiegający szarpnięciom do 0W przy zgubionych pakietach BLE
   */
  processIncomingWatts(rawWatts, now, source = this.currentPacketSource || 'trainer') {
    this.state.lastPowerAtMs=now;
    this.state.lastPowerSource=source;
    if (rawWatts > 0) {
      this.lastPositiveWatts = rawWatts;
      this.lastPositiveWattsTime = now;
      this.state.watts = rawWatts;
      return;
    }

    const elapsedSincePositiveWatts = now - this.lastPositiveWattsTime;
    const isPedaling = this.state.cadence > 20;

    if (isPedaling && elapsedSincePositiveWatts < 900) {
      this.state.watts = Math.max(0, Math.round(this.lastPositiveWatts * 0.96));
    } else if (elapsedSincePositiveWatts < 450) {
      this.state.watts = Math.max(0, Math.round(this.lastPositiveWatts * 0.85));
    } else {
      this.state.watts = 0;
    }
  }

  // ============================================================================
  // STEROWANIE OPOREM (FTMS OpCode 0x11/0x04, Tacx FE-C Page 51, Wahoo OpCode 0x43)
  // ============================================================================

  /**
   * Wysyła nachylenie trasy (%) lub poziom oporu do dowolnego podłączonego trenażera
   */
  canControlTrainer(options = {}) {
    const { allowInactive = false } = options;
    if (this.state.isDeviceTestActive && !options.diagnostic && !options.neutral) return false;
    return this.state.bleConnected && (allowInactive || this.state.hasRideStarted !== false) &&
      (allowInactive || (!this.state.isRideFinished && !this.state.isRidePaused)) && !this.isSpindownActive;
  }

  cancelPendingControl() {
    this.controlGeneration++;
    this.pendingControlWrite?.onResult?.(false);
    this.pendingControlWrite = null;
    if (this.ergRampIntervalId !== null) clearInterval(this.ergRampIntervalId);
    this.ergRampIntervalId = null;
    this.ergCurrentWatts = null;
    this.lastSentGradePct = null;
    this.currentSmoothedGrade = null;
    this.lastBleSendTime = 0;
    this.lastUpdateTime = 0;
  }

  // Tryb efektywny może być chwilowo nadpisany przez trening lub blok FreeRide.
  // state.trainerMode przechowuje wybór użytkownika, przywracany po treningu.
  setTrainerMode(mode) {
    if (mode !== 'sim' && mode !== 'erg') throw new Error('Unknown trainer mode.');
    if ((this.state.isDeviceTestActive || this.state.deviceTestNeedsNeutral) && mode !== 'sim') return false;
    if (this.trainerMode === mode) return false;
    this.cancelPendingControl();
    this.ergTargetWatts = null;
    this.trainerMode = mode;
    return true;
  }

  syncControlAfterConnection() {
    if (!this.state.hasRideStarted || this.state.isRidePaused || this.state.isRideFinished) {
      if (this.state.deviceTestNeedsNeutral) this.clearDiagnosticLoad();
      else this.neutralizeResistance();
      return;
    }
    if (!this.canControlTrainer()) return;
    if (this.trainerMode === 'erg') {
      this.setTargetPowerWatts(this.ergTargetWatts ?? this.state.manualErgTargetWatts ?? this.state.watts, true);
    } else {
      this.updateSimulationGrade(this.state.currentGradePct || 0, true);
    }
  }

  neutralizeResistance() {
    this.cancelPendingControl();
    this.setTrainerMode('sim');
    return this.updateSimulationGrade(0,true,{allowInactive:true,neutral:true});
  }

  // Explicit pre-ride probe: never starts a ride or changes the saved SIM/ERG choice.
  setDiagnosticGrade(grade) {
    if (!this.state.isDeviceTestActive || (this.state.hasRideStarted && !this.state.isRideFinished) ||
        !this.state.bleConnected || this.isSpindownActive ||
        !['ftms-sim','ftms-res','tacx-fec','wahoo'].includes(this.activeProtocol)) return Promise.resolve(false);
    this.setTrainerMode('sim');
    return new Promise(resolve => {
      this.updateSimulationGrade(THREE.MathUtils.clamp(grade,0,1), true, {
        allowInactive: true, diagnostic: true, onResult: resolve,
      }).catch(() => resolve(false));
    });
  }

  clearDiagnosticLoad() {
    this.cancelPendingControl();
    this.setTrainerMode('sim');
    return new Promise(resolve => {
      this.updateSimulationGrade(0,true,{allowInactive:true,neutral:true,onResult:ok=>{
        if(ok)this.state.deviceTestNeedsNeutral=false;
        resolve(ok);
      }}).catch(()=>resolve(false));
    });
  }

  async updateSimulationGrade(rawGradePct, force = false, options = {}) {
    if (!this.canControlTrainer(options) || this.trainerMode !== 'sim') { options.onResult?.(false); return; }
    const now = performance.now();

    const dt = this.lastUpdateTime > 0 ? Math.min((now - this.lastUpdateTime) / 1000, 1.0) : 0.05;
    this.lastUpdateTime = now;

    let targetGrade = rawGradePct * (this.state.trainerDifficultyPct / 100);

    const isVirtualShifting = isVirtualShiftingActive(this.state);

    if (isVirtualShifting && !options.neutral && !options.diagnostic) {
      const gearIdx = THREE.MathUtils.clamp((this.state.virtualGear || 12) - 1, 0, 23);
      const ratios = getVirtualGearRatios(this.state.gearingProfile || 'allaround');
      const ratio = ratios[gearIdx] || VIRTUAL_GEAR_RATIOS[gearIdx] || 2.632;
      const baseRatio = ratios[11] || 2.632; // Bieg 12
      const ratioMultiplier = ratio / baseRatio;

      targetGrade =
        (rawGradePct * ratioMultiplier + (ratioMultiplier - 1.0) * 4.2) *
        (this.state.trainerDifficultyPct / 100);
    }

    // Ochrona przed kręceniem w próżnię na ostrych zjazdach (Downhill Clamp)
    if (rawGradePct < 0) {
      const minDownhillGrade = typeof this.state.downhillClampGrade === 'number'
        ? this.state.downhillClampGrade
        : -1.5;
      targetGrade = Math.max(targetGrade, minDownhillGrade);
    }

    targetGrade = options.diagnostic ? THREE.MathUtils.clamp(rawGradePct,0,1) : THREE.MathUtils.clamp(targetGrade, -20, 25);

    // Wygładzanie rampy nachylenia (Grade Smoothing z regulowaną czułością reakcji)
    if (this.currentSmoothedGrade === null || force) {
      this.currentSmoothedGrade = targetGrade;
    } else {
      const responsiveness = this.state.trainerResponsiveness || 'standard';
      const maxGradeRatePerSec = responsiveness === 'smooth'
        ? 1.2
        : responsiveness === 'dynamic'
        ? 3.8
        : 2.0;
      const maxStep = maxGradeRatePerSec * dt;
      const diff = targetGrade - this.currentSmoothedGrade;
      this.currentSmoothedGrade += THREE.MathUtils.clamp(diff, -maxStep, maxStep);
    }

    const effectiveGrade = THREE.MathUtils.clamp(this.currentSmoothedGrade, -20, 25);

    if (!force && now - this.lastBleSendTime < 500) return;
    if (
      !force &&
      this.lastSentGradePct !== null &&
      Math.abs(effectiveGrade - this.lastSentGradePct) < 0.12
    ) {
      return;
    }

    this.lastBleSendTime = now;
    this.lastSentGradePct = effectiveGrade;

    // 1. FTMS SIM (OpCode 0x11: Set Indoor Bike Simulation Parameters)
    if (this.activeProtocol === 'ftms-sim' && this.ftmsControlPointChar) {
      const buffer = new ArrayBuffer(7);
      const view = new DataView(buffer);
      view.setUint8(0, 0x11); // OpCode 0x11

      const headwindMps = options.neutral || options.diagnostic ? 0 : this.state.windHeadwindMps || 0;
      const windMilliMps = Math.round(headwindMps * 1000);
      view.setInt16(1, THREE.MathUtils.clamp(windMilliMps, -32768, 32767), true);

      const gradeCentiPct = Math.round(effectiveGrade * 100);
      view.setInt16(3, THREE.MathUtils.clamp(gradeCentiPct, -32768, 32767), true);

      const crrUnits = Math.round((this.state.crr || 0.0038) * 10000);
      view.setUint8(5, THREE.MathUtils.clamp(crrUnits, 10, 220));

      const alt = this.state.currentAltitudeM || 0;
      const rho = 1.225 * Math.exp(-alt / 8500);
      const cdA = this.state.cdA || 0.30;
      const cwKgPerM = cdA * rho;
      const cwUnits = Math.round(cwKgPerM * 100);
      view.setUint8(6, THREE.MathUtils.clamp(cwUnits, 15, 120));

      this.enqueueWrite('ftms', buffer, options);
    }
    // 2. FTMS Target Resistance Level (OpCode 0x04) dla rowerów spin (Schwinn IC4, Bowflex C6, Yesoul, Domyos)
    else if (this.activeProtocol === 'ftms-res' && this.ftmsControlPointChar) {
      const normalizedGrade = (effectiveGrade + 20) / 45; // 0..1 dla zakresu -20% do +25%
      const targetLevel = Math.round(
        this.ftmsMinResistance + normalizedGrade * (this.ftmsMaxResistance - this.ftmsMinResistance)
      );
      const testLevel = this.ftmsMinResistance + (effectiveGrade > 0 ? Math.max(1,Math.round((this.ftmsMaxResistance-this.ftmsMinResistance)*.03)) : 0);
      const clampedLevel = options.neutral ? this.ftmsMinResistance : options.diagnostic
        ? THREE.MathUtils.clamp(testLevel,this.ftmsMinResistance,Math.min(255,this.ftmsMaxResistance))
        : THREE.MathUtils.clamp(targetLevel, this.ftmsMinResistance, this.ftmsMaxResistance);

      const buffer = new ArrayBuffer(2);
      const view = new DataView(buffer);
      view.setUint8(0, 0x04); // OpCode 0x04: Set Target Resistance Level
      view.setUint8(1, clampedLevel);

      this.enqueueWrite('ftms', buffer, options);
    }
    // 3. Tacx FE-C over BLE (ANT+ Page 51: Track Resistance)
    else if (this.activeProtocol === 'tacx-fec' && this.tacxTxChar) {
      const buffer = new ArrayBuffer(11);
      const view = new DataView(buffer);
      view.setUint8(0, 0xa4); // Sync
      view.setUint8(1, 0x09); // Długość danych
      view.setUint8(2, 0x4e); // Msg ID (Broadcast)
      view.setUint8(3, 0x00); // Channel
      view.setUint8(4, 0x33); // Page 51 (Track Resistance)
      view.setUint8(5, 0xff); // Reserved
      view.setUint8(6, 0xff); // Reserved

      // Grade: offset -200%, jednostka 0.01%
      const gradeUnits = Math.round((effectiveGrade + 200.0) * 100);
      view.setUint16(7, THREE.MathUtils.clamp(gradeUnits, 0, 65535), true);

      // Crr: jednostka 0.00005 (Crr * 20000)
      const crrTacx = Math.round((this.state.crr || 0.0038) * 20000);
      view.setUint8(9, THREE.MathUtils.clamp(crrTacx, 0, 255));

      // Suma kontrolna XOR
      let checksum = 0;
      const u8 = new Uint8Array(buffer);
      for (let i = 0; i < 10; i++) checksum ^= u8[i];
      view.setUint8(10, checksum);

      this.enqueueWrite('tacx', buffer, options);
    }
    // 4. Wahoo Direct BLE (OpCode 0x43: Set Sim Grade)
    else if (this.activeProtocol === 'wahoo' && this.wahooControlChar) {
      const buffer = new ArrayBuffer(3);
      const view = new DataView(buffer);
      view.setUint8(0, 0x43); // OpCode 0x43: Set Grade
      const gradeCentiPct = Math.round(effectiveGrade * 100);
      view.setInt16(1, THREE.MathUtils.clamp(gradeCentiPct, -32768, 32767), true);

      this.enqueueWrite('wahoo', buffer, options);
    } else options.onResult?.(false);
  }

  /**
   * Obsługa trybu ERG (Target Power) we wszystkich protokołach z opcjonalną rampą Soft-Start
   */
  async setTargetPowerWatts(targetWatts, forceImmediate = false) {
    if (!this.canControlTrainer() || this.trainerMode !== 'erg' || !Number.isFinite(targetWatts)) return;
    const goalWatts = Math.round(THREE.MathUtils.clamp(targetWatts, 25, 1500));
    const softStartSec = Number(this.state.ergSoftStartSec ?? 3);
    if (!forceImmediate && this.ergRampIntervalId !== null && this.ergTargetWatts === goalWatts) return;

    // Natychmiastowy przeskok bez rampy lub brak poprzedniego stanu
    if (forceImmediate || softStartSec <= 0 || this.ergCurrentWatts === null) {
      if (this.ergRampIntervalId) {
        clearInterval(this.ergRampIntervalId);
        this.ergRampIntervalId = null;
      }
      this.ergTargetWatts = goalWatts;
      this.ergCurrentWatts = goalWatts;
      this._sendTargetPowerBle(goalWatts);
      return;
    }

    // Płynny Soft-Start (np. 3 sekundy rampa)
    this.ergTargetWatts = goalWatts;
    if (this.ergRampIntervalId) {
      clearInterval(this.ergRampIntervalId);
    }

    const stepIntervalMs = 150;
    const totalSteps = Math.max(1, Math.round((softStartSec * 1000) / stepIntervalMs));
    const deltaPerStep = (this.ergTargetWatts - this.ergCurrentWatts) / totalSteps;
    let stepCount = 0;

    const generation = this.controlGeneration;
    this.ergRampIntervalId = setInterval(() => {
      if (generation !== this.controlGeneration || !this.canControlTrainer() || this.trainerMode !== 'erg') {
        clearInterval(this.ergRampIntervalId);
        this.ergRampIntervalId = null;
        return;
      }
      stepCount++;
      if (
        stepCount >= totalSteps ||
        Math.abs(this.ergTargetWatts - this.ergCurrentWatts) <= Math.abs(deltaPerStep)
      ) {
        this.ergCurrentWatts = this.ergTargetWatts;
        clearInterval(this.ergRampIntervalId);
        this.ergRampIntervalId = null;
      } else {
        this.ergCurrentWatts += deltaPerStep;
      }
      this._sendTargetPowerBle(Math.round(this.ergCurrentWatts));
    }, stepIntervalMs);
  }

  _sendTargetPowerBle(watts) {
    if (!this.canControlTrainer() || this.trainerMode !== 'erg') return;

    // FTMS OpCode 0x05: Set Target Power
    if (this.ftmsControlPointChar) {
      const buffer = new ArrayBuffer(3);
      const view = new DataView(buffer);
      view.setUint8(0, 0x05);
      view.setInt16(1, watts, true);
      this.enqueueWrite('ftms', buffer);
    }
    // Tacx FE-C Page 49 (0x31: Target Power)
    else if (this.tacxTxChar) {
      const buffer = new ArrayBuffer(11);
      const view = new DataView(buffer);
      view.setUint8(0, 0xa4);
      view.setUint8(1, 0x09);
      view.setUint8(2, 0x4e);
      view.setUint8(3, 0x00);
      view.setUint8(4, 0x31); // Page 49
      view.setUint8(5, 0xff);
      view.setUint8(6, 0xff);
      view.setUint16(7, watts * 4, true); // Krok 0.25W
      view.setUint8(9, 0xff);

      let checksum = 0;
      const u8 = new Uint8Array(buffer);
      for (let i = 0; i < 10; i++) checksum ^= u8[i];
      view.setUint8(10, checksum);

      this.enqueueWrite('tacx', buffer);
    }
    // Wahoo OpCode 0x42: Set Target Power
    else if (this.wahooControlChar) {
      const buffer = new ArrayBuffer(3);
      const view = new DataView(buffer);
      view.setUint8(0, 0x42);
      view.setInt16(1, watts, true);
      this.enqueueWrite('wahoo', buffer);
    }
  }

  /**
   * Zapewnia sekwencyjny zapis do BLE GATT bez błędów "operation already in progress"
   */
  async enqueueWrite(protocolType, buffer, options = {}) {
    if (!this.canControlTrainer(options)) { options.onResult?.(false); return; }
    this.pendingControlWrite?.onResult?.(false);
    this.pendingControlWrite = { protocolType, buffer, mode: this.trainerMode, generation: this.controlGeneration, allowInactive: Boolean(options.allowInactive), diagnostic: Boolean(options.diagnostic), neutral: Boolean(options.neutral), onResult: options.onResult };
    if (this.isWritingBle) return;

    this.isWritingBle = true;
    let activeCommand = null;
    try {
      while (this.pendingControlWrite && this.state.bleConnected) {
        const command = this.pendingControlWrite;
        activeCommand = command;
        this.pendingControlWrite = null;
        if (command.generation !== this.controlGeneration || command.mode !== this.trainerMode || !this.canControlTrainer(command)) { command.onResult?.(false); activeCommand=null; continue; }
        const currentBuffer = command.buffer;
        let written = false;

        if (command.protocolType === 'ftms' && this.ftmsControlPointChar) {
          try {
            await this.ftmsControlPointChar.writeValue(currentBuffer);
            written = true;
          } catch (writeErr) {
            // Jeśli OpCode 0x11 zgłosi Not Supported, natychmiast przestaw na OpCode 0x04 (poziom oporu)
            if (command.mode === 'sim' && command.generation === this.controlGeneration &&
                new Uint8Array(currentBuffer)[0] === 0x11 && this.activeProtocol === 'ftms-sim') {
              console.warn('FTMS opcode 0x11 unsupported. Trying opcode 0x04:', writeErr.message);
              this.activeProtocol = 'ftms-res';
              this.ftmsSupportsSim = false;
            }
          }
        } else if (command.protocolType === 'tacx' && this.tacxTxChar) {
          await this.tacxTxChar.writeValue(currentBuffer);
          written = true;
        } else if (command.protocolType === 'wahoo' && this.wahooControlChar) {
          await this.wahooControlChar.writeValue(currentBuffer);
          written = true;
        }

        command.onResult?.(written && command.generation === this.controlGeneration && Boolean(this.state.bleConnected));
        activeCommand = null;

        if (this.pendingControlWrite) {
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
      }
    } catch (e) {
      activeCommand?.onResult?.(false);
      console.warn('BLE simulation write warning (transient busy):', e.message);
    } finally {
      this.isWritingBle = false;
    }
  }

  /**
   * Rozłączenie manualne na życzenie kolarza
   */
  disconnect() {
    this.manualDisconnect = true;
    this.clearAutoReconnect();
    this.cancelPendingControl();
    if (this.bleDevice && this.bleDevice.gatt && this.bleDevice.gatt.connected) {
      this.bleDevice.gatt.disconnect();
    }
    this.state.bleConnected = false;
    this.ftmsControlPointChar = null;
    this.tacxTxChar = null;
    this.wahooControlChar = null;
    this.activeProtocol = null;
    this.onStatusChange('Trainer disconnected.', false);
  }
}
