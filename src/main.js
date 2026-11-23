import * as THREE from 'three';
import {
  parseGPXToRoute,
  generatePresetRoute,
  detectClimbs,
  calculateCumulativeAscent,
} from './gpx/gpxParser.js';
import { TrainerController, VIRTUAL_POWER_PRESETS, isVirtualShiftingActive } from './ble/trainerController.js';
import { ZwiftController } from './ble/zwiftController.js';
import {
  stepRiderPhysics,
  sampleRouteAtDistance,
  sampleDistanceAtGhostTime,
  scanUpcomingRoute,
  getGearDetails,
  getHeartRateZoneInfo,
  getCadenceCoachStatus,
  getCogganPowerZone,
  getVirtualGearRatios,
} from './physics/cyclingPhysics.js';
import { createCyclistMesh, animateCyclistMesh } from './world/cyclistAvatar.js?v=20261030-sprint';
import { buildRouteWorld } from './world/worldBuilder.js';
import { applyRoadLean } from './world/roadLean.js?v=20261030-corners';
import { animateSpectators } from './world/spectatorCrowd.js';
import { exportRideToTCX } from './export/tcxExporter.js';
import { exportRideToFIT } from './export/fitExporter.js';
import { formatNumber, formatTimeMMSS, formatWorkoutDuration } from './ui/formatters.js';
import { syncTrainerControl } from './workouts/trainerMode.js';
import { setSessionStatus as applySessionStatus, isRideRunning } from './session/rideSession.js';
import { readProfile, saveProfile, normalizeProfile } from './profile/riderProfile.js';
import { readRecovery, saveRecovery, RIDE_RECOVERY_KEY } from './session/rideRecovery.js';
import { renderSessionView, describeSources } from './ui/sessionView.js';
import { RideDiagnostics, trainerConnectionState } from './diagnostics/rideDiagnostics.js';
import { mountRideLogsView } from './ui/rideLogsView.js';
import { noteTrainerConnection, canResumeTrainerRide, resetTrainerSafety } from './session/trainerSafety.js';
import { mountDeviceTest } from './ui/deviceTestView.js';
import { RouteLibrary, getGpxContentId } from './gpx/routeLibrary.js';
import { mountRouteLibrary } from './ui/routeLibraryView.js';
import { RideHistory } from './session/rideHistory.js';
import {
  filterRouteRecordCandidates,
  formatRecordCandidateOption,
  formatRecordGhostStatus,
  buildRecordGhostSamples,
  sampleRecordGhostAtTime,
  sampleRecordTimeAtDistance,
  computeRecordGhostGap,
} from './session/recordGhost.js';
import { mountRideJournal } from './ui/rideJournalView.js';
import { mountZwiftShifterView } from './ui/zwiftShifterView.js';
import { mountShifterMenuNavigation } from './ui/shifterMenuNavigation.js';
import { mountShifterRideAlerts } from './ui/shifterRideAlerts.js';
import { AdaptiveGraphics } from './world/adaptiveGraphics.js';
import { createSkyEnvironment } from './world/skyEnvironment.js';
import { CrowdAmbience } from './audio/crowdAmbience.js';
import {
  WORKOUT_PRESETS,
  parseZwoWorkout,
  parseMrcWorkout,
  getWorkoutStateAtTime,
} from './workouts/workoutEngine.js';

let diagnostics = null;
let rideLogsView = null;
let deviceTest = null;
let routeLibraryView = null;
let rideJournalView = null;
let shifterView = null;
let adaptiveGraphics = null;
const shifterRideAlerts = mountShifterRideAlerts(document.getElementById('shifter-ride-alerts'));
const routeLibrary = new RouteLibrary();
const rideHistory = new RideHistory();
const crowdAmbience = new CrowdAmbience();
let crowdCenterM = null;
function setSessionStatus(target, status) {
  applySessionStatus(target, status);
  if (status === 'ready') {
    target.rideId = null;
    target.rideStartedAt = null;
    target.rideStartDistanceM = null;
    target.rideDistanceM = 0;
    target.restoredLegacy = false;
  }
  if (status === 'ready' || status === 'finished') resetTrainerSafety(target);
  shifterRideAlerts.setSession(status === 'ready' || status === 'finished' ? null : target.rideId, status === 'riding');
  // Zakończenie zapisujemy w showFinishModal, po zatrzymaniu treningu i oporu.
  if (status !== 'finished') diagnostics?.session(status);
}

// Canvas graphics share the active application's brand palette.
const brandStyles = getComputedStyle(document.documentElement);
const brandColors = Object.freeze({
  yellow: brandStyles.getPropertyValue('--or-yellow').trim() || '#F2C94C',
  forest: brandStyles.getPropertyValue('--or-forest').trim() || '#234C3B',
  sage: brandStyles.getPropertyValue('--or-sage').trim() || '#557347',
  ink: brandStyles.getPropertyValue('--or-ink').trim() || '#20372C',
  lightMuted: brandStyles.getPropertyValue('--or-muted').trim() || '#5E6A5B',
  error: brandStyles.getPropertyValue('--or-error').trim() || '#A83F45',
  cream: brandStyles.getPropertyValue('--or-cream').trim() || '#FBF5EA',
  muted: brandStyles.getPropertyValue('--or-dark-muted').trim() || '#CAD6C1',
});

// ============================================================================
// 1. STAN GRACZA, TRENINGU I SWIATA (OSKIRIDE 3D)
// ============================================================================
const state = {
  name: 'You (OskiRide)',
  routeName: 'Alpine Pass',
  weightKg: 75,
  bikeWeightKg: 7.5,
  bikeType: 'aero', // 'aero' | 'tt' | 'mtb'
  ftpWatts: 250,
  cdA: 0.30,
  crr: 0.0038,
  virtualGear: 12, // 1..24 wirtualne przelozenie
  trainerMode: 'sim', // 'sim' | 'erg'
  manualErgTargetWatts: 180,
  watts: 0,
  smoothedWatts: 0,
  cadence: 85,
  heartRate: 0,
  speedMps: 0,
  distanceM: 0,
  totalDistanceM: 1,
  elevationGainM: 0,
  currentAltitudeM: 0,
  currentGradePct: 0,
  currentTurnAngleDeg: 0,
  lat: 49.25,
  lon: 19.95,
  elapsedSeconds: 0,
  energyJoules: 0,
  trainerDifficultyPct: 100, // 0% - 100% skalowanie oporu nachylenia (jak w Zwift)
  bleConnected: false,
  trainerWasRequired: false,
  requiresTrainerReconnect: false,
  isDeviceTestActive: false,
  deviceTestNeedsNeutral: false,
  trainerBatteryPct: null,
  powerSmoothingSec: 3, // 1 | 3 | 5 sekund
  gearingProfile: 'allaround', // 'allaround' | 'climbing' | 'flat'
  downhillClampGrade: -1.5, // minimalny opor na ostrym zjezdzie (brak krecenia w proznie)
  trainerResponsiveness: 'standard', // 'smooth' | 'standard' | 'dynamic'
  ergSoftStartSec: 3, // 3s lagodny start oporu w trybie ERG
  virtualPowerCurve: 'fluid', // 'fluid' | 'magnetic' | 'rollers' | 'spinbike'
  zwiftControllerConnected: false,
  zwiftBatteryPct: null,
  virtualShiftingMode: 'auto', // 'auto' | 'always' | 'off'
  isDrafting: false,
  cameraMode: 0, // 0 = 3. Osoba (Zwift), 1 = 1. Osoba (POV), 2 = Dron
  quality: 'medium', // 'eco' | 'medium' | 'ultra'
  adaptiveGraphics: true,
  adaptiveGraphicsLevel: 0,
  timeOfDay: 'day', // 'day' | 'sunset' | 'night'
  weather: 'clear', // 'clear' | 'wet' | 'rain' | 'snow'
  ghostMode: 'gpx', // 'gpx' | 'ftp' | 'tempo' | 'off'
  ghostGapSeconds: 0,
  ghostGapMeters: 0,
  recordGhost: true,
  recordGhostSelection: 'best',
  recordGhostGapSeconds: 0,
  recordGhostGapMeters: 0,
  recordGhostTimeOffsetSec: 0,
  windSpeedMps: 4.2, // ~15 km/h domyślny wiatr atmosferyczny
  windDirDeg: 220, // wiatr z kierunku 220° (SW)
  windHeadwindMps: 0,
  windRelAngleDeg: 0,
  isInsideTunnel: false,
  tunnelIntervals: [],
  activeWorkout: null,
  workoutElapsedSec: 0,
  isWorkoutRunning: false,
  workoutErgMode: true,
  lastErgTargetSent: 0,
  lastErgSendTime: 0,
  powerMeterConnected: false,
  cadenceSensorConnected: false,
  isRideFinished: false,
  hasRideStarted: false,
  isRidePaused: false,
  sessionStatus: 'ready',
  riderName: 'OskiRide',
  routeSource: {type:'preset',key:'mountain'},
  ghostTimeOffsetSec: 0,
};
window.state = state;

let routePoints = [];
let routeClimbs = [];
let routeCurve = null;
let routeGroup = null;
let worldAnimated = { balloons: [], spectators: [], streetLights: [] };
let worldVisibleUpdater = null;
const recordedPoints = [];
const zoneSeconds = [0, 0, 0, 0, 0, 0, 0]; // Coggan Z1 - Z7
let recordTimer = 0;
let hudUpdateTimer = 0;
let pausedSpeedMps = 0;
let recoveryTimer = 0;
let pendingRecovery = null;
let lastRecoverySavedAt = 0;
let profileLoading = false;
let finishedRideSnapshot = null;
let activeRecordGhost = null;
let recordGhostRefreshToken = 0;
function isRecordGhostActive() {
  return Boolean(state.recordGhost && activeRecordGhost?.samples?.length);
}
const elevationBaseCache = {points:null,climbs:null,canvas:document.createElement('canvas'),min:0,max:0};

// Licznik FPS
let frameCount = 0;
let fpsAccumTime = 0;
let currentFps = 60;

// ============================================================================
// 2. SCENA 3D THREE.JS (ZOPTYMALIZOWANA POD LAPTOPA)
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x68a4d8);
scene.fog = new THREE.FogExp2(0x7fb2e5, 0.0012);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.25,
  3800
);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
container.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3f6212, 0.92);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.4);
sunLight.position.set(120, 220, 100);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 1024;
sunLight.shadow.mapSize.height = 1024;
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 600;
const d = 25;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
scene.add(sunLight);
const skyEnvironment = createSkyEnvironment(renderer, scene);

// ============================================================================
// 3. AWATAR GRACZA, GHOST RIDER (DUCH ZAWODOW) ORAZ ROBO-PACERZY
// ============================================================================
const playerAvatar = createCyclistMesh({
  frameColor: 0xf97316,
  jerseyColor: 0x0284c7,
  helmetColor: 0xf8fafc,
  showPowerRing: true,
  hasHeadlight: false,
});
scene.add(playerAvatar.group);

// 3D Tunel aerodynamiczny (Wizualizacja strugi opływu powietrza / drafting stream ribbon)
const draftingRibbonGeo = new THREE.PlaneGeometry(0.65, 1.0, 1, 16);
const draftingRibbonMat = new THREE.MeshBasicMaterial({
  color: 0x38bdf8,
  transparent: true,
  opacity: 0.0,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const draftingRibbonMesh = new THREE.Mesh(draftingRibbonGeo, draftingRibbonMat);
const draftPacerPosition = new THREE.Vector3();
const draftRiderPosition = new THREE.Vector3();
draftingRibbonMesh.visible = false;
scene.add(draftingRibbonMesh);

/**
 * Aktualizuje geometrię i przezroczystość strugi aerodynamicznej łączącej koła
 */
function updateDraftingRibbon(leadBot, dt) {
  if (!leadBot || !state.isDrafting) {
    draftingRibbonMat.opacity = Math.max(0, draftingRibbonMat.opacity - dt * 3.0);
    if (draftingRibbonMat.opacity <= 0.01) {
      draftingRibbonMesh.visible = false;
    }
    return;
  }

  draftingRibbonMesh.visible = true;
  const targetOpacity = 0.42 + 0.14 * Math.sin(state.elapsedSeconds * 9.0);
  draftingRibbonMat.opacity = THREE.MathUtils.lerp(
    draftingRibbonMat.opacity,
    targetOpacity,
    Math.min(1, dt * 5.5)
  );

  const pacerPos = draftPacerPosition.copy(leadBot.avatar.group.position);
  pacerPos.y += 0.36;
  const riderPos = draftRiderPosition.copy(playerAvatar.group.position);
  riderPos.y += 0.36;

  const posAttr = draftingRibbonGeo.attributes.position;
  const segs = 16;
  const timeWave = state.elapsedSeconds * 7.5;

  for (let i = 0; i <= segs; i++) {
    const t = i / segs; // 0 = bot z przodu, 1 = gracz z tylu
    const midX = THREE.MathUtils.lerp(pacerPos.x, riderPos.x, t);
    const midY =
      THREE.MathUtils.lerp(pacerPos.y, riderPos.y, t) + Math.sin(timeWave + t * 4.2) * 0.035;
    const midZ = THREE.MathUtils.lerp(pacerPos.z, riderPos.z, t);

    // Dynamiczna szerokosc strugi (rozszerza sie w kierunku zawodnika)
    const width = 0.38 + t * 0.45;
    const dx = -(riderPos.z - pacerPos.z);
    const dz = riderPos.x - pacerPos.x;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (dx / len) * (width * 0.5);
    const nz = (dz / len) * (width * 0.5);

    posAttr.setXYZ(i * 2, midX - nx, midY, midZ - nz);
    posAttr.setXYZ(i * 2 + 1, midX + nx, midY, midZ + nz);
  }
  posAttr.needsUpdate = true;
}

const ghostRider = {
  name: 'Virtual ghost',
  weightKg: 75,
  bikeWeightKg: 8.5,
  watts: 250,
  cadence: 88,
  speedMps: 0,
  distanceM: 0,
  currentAltitudeM: 0,
  currentGradePct: 0,
  currentTurnAngleDeg: 0,
  laneOffset: 0.35,
  avatar: createCyclistMesh({
    frameColor: 0xa855f7,
    jerseyColor: 0xc084fc,
    helmetColor: 0xf3e8ff,
    label: '👻 PACE GHOST',
    isGhost: true,
  }),
};
scene.add(ghostRider.avatar.group);

const recordGhostRider = {
  name: 'Personal best',
  weightKg: 75,
  bikeWeightKg: 7.5,
  watts: 250,
  cadence: 88,
  speedMps: 0,
  distanceM: 0,
  currentAltitudeM: 0,
  currentGradePct: 0,
  currentTurnAngleDeg: 0,
  laneOffset: 0.72,
  avatar: createCyclistMesh({
    frameColor: 0xf2c94c,
    jerseyColor: 0xf59e0b,
    helmetColor: 0xfef3c7,
    label: '🏆 PERSONAL BEST GHOST',
    isGhost: true,
  }),
};
recordGhostRider.avatar.group.visible = false;
const recordGhostSprite = recordGhostRider.avatar.group.children.find(child => child.isSprite);
if (recordGhostSprite?.material?.map?.image) {
  const badgeCanvas = recordGhostSprite.material.map.image;
  const badgeCtx = badgeCanvas.getContext('2d');
  badgeCtx.clearRect(0, 0, badgeCanvas.width, badgeCanvas.height);
  badgeCtx.fillStyle = 'rgba(23, 43, 35, 0.92)';
  badgeCtx.beginPath();
  badgeCtx.roundRect(4, 4, 272, 56, 14);
  badgeCtx.fill();
  badgeCtx.strokeStyle = '#f2c94c';
  badgeCtx.lineWidth = 3;
  badgeCtx.stroke();
  badgeCtx.fillStyle = '#fef3c7';
  badgeCtx.font = 'bold 21px sans-serif';
  badgeCtx.textAlign = 'center';
  badgeCtx.textBaseline = 'middle';
  badgeCtx.fillText('🏆 PERSONAL BEST GHOST', 140, 32);
  recordGhostSprite.material.map.needsUpdate = true;
  recordGhostSprite.position.y = 2.18;
}
scene.add(recordGhostRider.avatar.group);
window.ghostRider = ghostRider;
window.recordGhostRider = recordGhostRider;

const aiPacers = [
  {
    name: 'Pacer D (1.8 W/kg)',
    weightKg: 75,
    watts: 135,
    cadence: 80,
    speedMps: 0,
    distanceM: 45,
    currentAltitudeM: 0,
    currentGradePct: 0,
    currentTurnAngleDeg: 0,
    laneOffset: 1.65,
    avatar: createCyclistMesh({
      frameColor: 0xeab308,
      jerseyColor: 0xfacc15,
      label: 'Pacer D (1.8 W/kg)',
    }),
  },
  {
    name: 'Pacer C (2.5 W/kg)',
    weightKg: 75,
    watts: 188,
    cadence: 86,
    speedMps: 0,
    distanceM: 120,
    currentAltitudeM: 0,
    currentGradePct: 0,
    currentTurnAngleDeg: 0,
    laneOffset: 1.65,
    avatar: createCyclistMesh({
      frameColor: 0x06b6d4,
      jerseyColor: 0x22d3ee,
      label: 'Pacer C (2.5 W/kg)',
    }),
  },
  {
    name: 'Pacer B (3.3 W/kg)',
    weightKg: 72,
    watts: 238,
    cadence: 90,
    speedMps: 0,
    distanceM: 280,
    currentAltitudeM: 0,
    currentGradePct: 0,
    currentTurnAngleDeg: 0,
    laneOffset: 1.65,
    avatar: createCyclistMesh({
      frameColor: 0x22c55e,
      jerseyColor: 0x16a34a,
      label: 'Pacer B (3.3 W/kg)',
    }),
  },
  {
    name: 'Pacer A (4.2 W/kg)',
    weightKg: 68,
    watts: 285,
    cadence: 94,
    speedMps: 0,
    distanceM: 520,
    currentAltitudeM: 0,
    currentGradePct: 0,
    currentTurnAngleDeg: 0,
    laneOffset: 1.65,
    avatar: createCyclistMesh({
      frameColor: 0xef4444,
      jerseyColor: 0xdc2626,
      label: 'Pacer A (4.2 W/kg)',
    }),
  },
];

for (const bot of aiPacers) {
  scene.add(bot.avatar.group);
}

// ============================================================================
// 4. KONTROLER TRENAZERA BLUETOOTH (FTMS + HRM)
// ============================================================================
const bleBtn = document.getElementById('btn-ble-connect');
const bleStatusEl = document.getElementById('ble-status');

function updateRealismUI() {
  if (!trainerController) return;
  const realism = trainerController.getRealismStatus();

  // 1. Badge w dolnym HUD
  const hudBadge = document.getElementById('hud-realism-badge');
  if (hudBadge) {
    hudBadge.textContent = realism.badge;
    hudBadge.className = `realism-badge ${realism.cssClass}`;
    hudBadge.title = `${realism.title}: ${realism.description} (Open devices)`;
  }

  // 2. Baner w oknie parowania Zwift
  const banner = document.getElementById('pairing-realism-banner');
  const bannerTitle = document.getElementById('pairing-realism-title');
  const bannerDesc = document.getElementById('pairing-realism-desc');
  const bannerPill = document.getElementById('pairing-realism-pill');
  if (banner && bannerTitle && bannerDesc && bannerPill) {
    banner.className = `realism-banner ${realism.cssClass}`;
    bannerTitle.textContent = realism.title;
    bannerDesc.textContent = realism.description;
    bannerPill.textContent = realism.badge;
  }

  // 3. Status w launcherze Start
  const homeStatus = document.getElementById('home-devices-status');
  if (homeStatus) {
    if (state.bleConnected) {
      homeStatus.textContent = `${trainerController.deviceName} · ${realism.badge}`;
    } else {
      homeStatus.textContent = 'Smart trainer, power meter, zPower profiles, and spindown calibration';
    }
  }

  // 4. Karty urządzeń w oknie parowania
  const cardTrainer = document.getElementById('card-dev-trainer');
  const badgeTrainer = document.getElementById('badge-dev-trainer');
  const nameTrainer = document.getElementById('name-dev-trainer');
  const subTrainer = document.getElementById('sub-dev-trainer');

  if (cardTrainer && badgeTrainer && nameTrainer && subTrainer) {
    if (state.bleConnected) {
      cardTrainer.classList.add('connected');
      badgeTrainer.textContent = 'Connected';
      nameTrainer.textContent = trainerController.deviceName;
      const batStr = state.trainerBatteryPct !== null ? ` · Bat: ${state.trainerBatteryPct}%` : '';
      subTrainer.textContent = `${trainerController.activeProtocol?.toUpperCase() || 'FTMS'}${batStr}`;
    } else {
      cardTrainer.classList.remove('connected');
      badgeTrainer.textContent = 'Disconnected';
      nameTrainer.textContent = 'No active trainer';
      subTrainer.textContent = 'FTMS · Tacx FE-C · Wahoo Direct';
    }
  }

  const cardPower = document.getElementById('card-dev-power');
  const badgePower = document.getElementById('badge-dev-power');
  const namePower = document.getElementById('name-dev-power');
  const subPower = document.getElementById('sub-dev-power');

  if (cardPower && badgePower && namePower && subPower) {
    if (state.powerMeterConnected || (state.bleConnected && trainerController.activeProtocol === 'cps')) {
      cardPower.classList.add('connected');
      badgePower.textContent = 'Connected';
      namePower.textContent = state.powerDeviceName || trainerController.deviceName;
      subPower.textContent = `Power reading: ${Math.round(state.watts)} W`;
    } else {
      cardPower.classList.remove('connected');
      badgePower.textContent = 'Disconnected';
      namePower.textContent = 'No power meter';
      subPower.textContent = 'Pedals (Assioma, Rally) · Crank (Stages, 4iiii, Quarq)';
    }
  }

  const cardSpeed = document.getElementById('card-dev-speed');
  const badgeSpeed = document.getElementById('badge-dev-speed');
  const hintSpeed = document.getElementById('pairing-zpower-hint');

  if (cardSpeed && badgeSpeed) {
    if (state.cadenceSensorConnected || (state.bleConnected && trainerController.activeProtocol === 'cscp')) {
      cardSpeed.classList.add('connected');
      badgeSpeed.textContent = 'Connected';
    } else {
      cardSpeed.classList.remove('connected');
      badgeSpeed.textContent = 'Disconnected';
    }
  }

  if (hintSpeed) {
    const curveKey = state.virtualPowerCurve || 'fluid';
    const preset = VIRTUAL_POWER_PRESETS[curveKey];
    if (preset) {
      hintSpeed.textContent = preset.settingHint;
      hintSpeed.style.color = preset.isCompatible ? 'var(--or-yellow)' : '#f87171';
    }
  }

  const cardHeart = document.getElementById('card-dev-heart');
  const badgeHeart = document.getElementById('badge-dev-heart');
  const nameHeart = document.getElementById('name-dev-heart');
  const subHeart = document.getElementById('sub-dev-heart');

  if (cardHeart && badgeHeart && nameHeart && subHeart) {
    if (state.heartRate > 0) {
      cardHeart.classList.add('connected');
      badgeHeart.textContent = 'Connected';
      nameHeart.textContent = trainerController.hrmDevice?.name || 'Bluetooth heart rate monitor';
      subHeart.textContent = `Heart rate: ${state.heartRate} bpm`;
    } else {
      cardHeart.classList.remove('connected');
      badgeHeart.textContent = 'Disconnected';
      nameHeart.textContent = 'No heart rate monitor';
      subHeart.textContent = 'BLE Heart Rate standard (Polar, Garmin, Wahoo, Magene)';
    }
  }
}

const trainerController = new TrainerController(state, (statusMsg, connected, deviceName) => {
  bleStatusEl.textContent = statusMsg;
  diagnostics?.event('device', statusMsg, { trainerConnected: state.bleConnected, protocol: trainerController.activeProtocol || null });
  refreshTrainerIndicator();
  if (state.bleConnected) {
    bleBtn.classList.add('connected');
    const batText = state.trainerBatteryPct !== null ? ` ${state.trainerBatteryPct}%` : '';
    bleBtn.querySelector('.button-label').textContent = `${trainerController.deviceName || 'Trainer'}${batText}`;
  } else {
    bleBtn.classList.remove('connected');
    bleBtn.querySelector('.button-label').textContent = 'Connect trainer';
  }
  updateRealismUI();
});

let trainerConnecting = false;
let trainerLost = false;
let previousTrainerConnected = false;
let previousTrainerIndicator = '';

function diagnosticSnapshot() {
  const number = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const hasControl = Boolean(trainerController.ftmsControlPointChar || trainerController.tacxTxChar || trainerController.wahooControlChar);
  return {
    routeName: state.routeName, session: state.sessionStatus, trainerReconnectRequired: state.requiresTrainerReconnect,
    deviceTestActive: state.isDeviceTestActive, elapsedSeconds: number(state.elapsedSeconds),
    distanceM: number(state.distanceM), watts: number(state.watts), cadence: number(state.cadence),
    heartRate: number(state.heartRate), speedKmh: number(state.speedMps * 3.6), gradePct: number(state.currentGradePct),
    trainerConnected: Boolean(state.bleConnected), trainerName: state.bleConnected ? trainerController.deviceName : null,
    protocol: trainerController.activeProtocol || null, controlChannel: hasControl,
    trainerMode: trainerController.trainerMode || state.trainerMode, requestedMode: state.trainerMode,
    ergTargetWatts: number(trainerController.ergTargetWatts), lastSimGradeTargetPct: number(trainerController.lastSentGradePct), virtualGear: state.virtualGear,
    workout: state.activeWorkout?.name || null, workoutElapsedSec: number(state.workoutElapsedSec), quality: state.quality,
    adaptiveGraphics: state.adaptiveGraphics, adaptiveGraphicsLevel: state.adaptiveGraphicsLevel,
    sources: describeSources(state, trainerController.trainerMode, performance.now(), hasControl),
    fps: currentFps, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
  };
}

diagnostics = new RideDiagnostics(diagnosticSnapshot);
document.addEventListener('change', event => {
  const labels = {
    'trainer-mode-select': 'Resistance mode', 'trainer-diff': 'Trainer difficulty',
    'quality-select': 'Graphics quality', 'power-smoothing-select': 'Power smoothing',
    'adaptive-graphics-toggle': 'Automatic graphics adjustment',
    'downhill-clamp-select': 'Downhill resistance', 'trainer-responsiveness-select': 'Resistance response',
    'erg-softstart-select': 'ERG ramp', 'workout-erg-toggle': 'Workout ERG control',
    'virtual-shifting-select': 'Virtual shifting',
    'record-ghost-toggle': 'Second ghost (personal best)',
    'record-ghost-select': 'Ride for second ghost',
  };
  const target = event.target, label = labels[target.id];
  if (label) diagnostics.event('change', label, { value: target.type === 'checkbox' ? target.checked : target.value });
});

function refreshTrainerIndicator() {
  if (noteTrainerConnection(state)) {
    diagnostics?.event('connection', 'Trainer disconnected. The ride will stay paused until you resume it.', {state:'lost',automaticPause:true}, 'warning');
    if (isRideRunning(state)) pauseRide();
    else { persistRideRecovery(); updateHUD(); }
  }
  if (previousTrainerConnected && !state.bleConnected) trainerLost = !trainerController.manualDisconnect;
  if (state.bleConnected) trainerLost = false;
  previousTrainerConnected = Boolean(state.bleConnected);
  const status = trainerConnectionState(state, trainerController, trainerConnecting, trainerLost);
  const indicator = document.getElementById('trainer-connection-indicator');
  indicator.dataset.state = status.key;
  indicator.title = `${status.label}. Open devices.`;
  indicator.setAttribute('aria-label', indicator.title);
  const key = `${status.key}:${status.label}`;
  if (key !== previousTrainerIndicator) {
    previousTrainerIndicator = key;
    diagnostics?.event('connection', status.label, { state: status.key, protocol: trainerController.activeProtocol || null }, status.key === 'lost' ? 'warning' : 'info');
  }
}

async function connectTrainerWithIndicator(universal) {
  if (state.isDeviceTestActive) return;
  trainerConnecting = true;
  refreshTrainerIndicator();
  try { await trainerController.connectTrainer(universal); }
  finally { trainerConnecting = false; refreshTrainerIndicator(); }
}

setInterval(() => { refreshTrainerIndicator(); diagnostics.tick(); }, 1000);
for (const level of ['warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    const message = args.map(value => value instanceof Error ? `${value.name}: ${value.message}` : typeof value === 'string' ? value : String(value)).join(' ');
    diagnostics.event(level === 'warn' ? 'warning' : 'error', message, null, level === 'warn' ? 'warning' : 'error');
  };
}
window.addEventListener('error', event => diagnostics.event('error', event.message || 'Application error', { source: event.filename || null, line: event.lineno || null }, 'error'));
window.addEventListener('unhandledrejection', event => diagnostics.event('error', event.reason?.message || String(event.reason), null, 'error'));
document.addEventListener('visibilitychange', () => {
  diagnostics.event('visibility', document.hidden ? 'Okno w tle' : 'Window in foreground');
  if (document.hidden) diagnostics.flush();
});
window.addEventListener('pagehide', event => {
  if (event.persisted) diagnostics.flush();
  else diagnostics.finish('interrupted', 'Application closed or reloaded');
});

// Manetki Zwift (Zwift Play / Click / wirtualna zmiana biegów)
const zwiftBtn = document.getElementById('btn-zwift-connect');

function usesKeyboardPower() {
  return !state.requiresTrainerReconnect && !state.bleConnected && !state.powerMeterConnected &&
    !(state.cadenceSensorConnected && state.lastPowerSource==='virtual-power');
}

function setSimulationPower(watts) {
  state.watts = watts;
  simWattsSlider.value = watts;
  simWattsLabel.textContent = `${watts} W`;
}

function newRideId() {
  return crypto.randomUUID?.() || `ride_${Date.now()}_${crypto.getRandomValues(new Uint32Array(2)).join('_')}`;
}

// ============================================================================
// 5. BUDOWANIE SWIATA 3D Z DANYCH TRASY + DETEKCJA PODJAZDOW CLIMBPRO
// ============================================================================
function loadRouteIntoWorld(points, routeName = '3D Route', source = state.routeSource) {
  adaptiveGraphics?.reset();
  const releaseResistance = state.hasRideStarted;
  if (releaseResistance && usesKeyboardPower()) setSimulationPower(0);
  if (state.isWorkoutRunning) stopWorkout();
  setSessionStatus(state,'ready');
  state.routeSource = source;
  finishedRideSnapshot = null;
  state.ghostTimeOffsetSec = 0;
  state.recordGhostTimeOffsetSec = 0;
  if (releaseResistance) trainerController.neutralizeResistance();
  else trainerController.cancelPendingControl();
  routePoints = points;
  crowdAmbience.stop();
  crowdCenterM = points.routeId === 'alpedhuez' ? points.bends?.find(bend => bend.number === 7)?.dist : null;
  state.routeName = routeName;
  routeClimbs = detectClimbs(points);

  const built = buildRouteWorld(scene, points, routeGroup, {
    climbs: routeClimbs,
    quality: state.quality,
    waypoints: points.waypoints || [],
  });
  routeGroup = built.routeGroup;
  routeCurve = built.routeCurve;
  skyEnvironment.setRouteGroup(routeGroup);
  state.currentLeanRad = 0;
  ghostRider.currentLeanRad = 0;
  recordGhostRider.currentLeanRad = 0;
  for (const bot of aiPacers) bot.currentLeanRad = 0;
  applyAdaptiveGraphics();
  state.tunnelIntervals = built.tunnelIntervals || [];
  state.totalDistanceM = built.totalDistanceM;
  state.tunnelIntervals = built.tunnelIntervals || [];
  worldAnimated = built.animatedObjects || {
    balloons: [],
    spectators: [],
    streetLights: [],
    windTurbines: [],
    boats: [],
  };
  worldVisibleUpdater = built.updateVisibleWindow || null;
  applyTimeOfDay(state.timeOfDay);
  skyEnvironment.applyWeather(state.weather);

  state.distanceM = 0;
  state.speedMps = 0;
  state.elevationGainM = 0;
  state.elapsedSeconds = 0;
  state.energyJoules = 0;
  recordedPoints.length = 0;
  zoneSeconds.fill(0);
  recordTimer = 0;

  ghostRider.distanceM = 0;
  ghostRider.speedMps = 0;
  recordGhostRider.distanceM = 0;
  recordGhostRider.speedMps = 0;
  recordGhostRider.cadence = 0;

  // Rozmiesc Pacerow blisko startu
  aiPacers[0].distanceM = 20;
  aiPacers[1].distanceM = 45;
  aiPacers[2].distanceM = 80;
  aiPacers[3].distanceM = 130;

  const startTelemetry = sampleRouteAtDistance(routePoints, 0);
  state.currentAltitudeM = startTelemetry.ele;
  state.currentGradePct = startTelemetry.grade;
  state.currentHeadingDeg = startTelemetry.headingDeg || 0;
  state.currentCardinalDir = startTelemetry.cardinalDir || 'N';
  state.currentBankingPct = startTelemetry.bankingPct || 0;
  ghostRider.currentAltitudeM = startTelemetry.ele;
  ghostRider.currentGradePct = startTelemetry.grade;
  ghostRider.currentBankingPct = startTelemetry.bankingPct || 0;
  recordGhostRider.currentAltitudeM = startTelemetry.ele;
  recordGhostRider.currentGradePct = startTelemetry.grade;
  recordGhostRider.currentBankingPct = startTelemetry.bankingPct || 0;
  void refreshRecordGhostForCurrentRoute('best');

  const climbsLabel = document.getElementById('climbs-summary-label');
  if (climbsLabel) {
    climbsLabel.textContent = `Climbs: ${routeClimbs.length}`;
  }

  const totalKm = state.totalDistanceM / 1000;
  const totalAscentM = calculateCumulativeAscent(points);

  const activeRoutePill = document.getElementById('active-route-pill');
  if (activeRoutePill) {
    activeRoutePill.textContent = `Selected: ${routeName}`;
  }

  const startSlider = document.getElementById('start-km-slider');
  const startLabel = document.getElementById('start-km-label');
  const menuStats = document.getElementById('menu-route-stats');
  if (startSlider) {
    startSlider.max = Math.max(0.1, totalKm - 0.1).toFixed(2);
    startSlider.value = 0;
  }
  if (startLabel) {
    startLabel.textContent = '0.0 km (route start)';
  }
  if (menuStats) {
    menuStats.textContent = `${totalKm.toFixed(1)} km, +${Math.round(totalAscentM)} m, climbs: ${routeClimbs.length}`;
  }

  const hasRealGpxTime = points[points.length - 1]?.hasRealGpxTime;
  bleStatusEl.textContent = `${state.bleConnected ? 'Trainer connected' : 'Simulation'}, ${routeName}${hasRealGpxTime ? ' (ghost follows GPX timestamps)' : ''}`;

  drawElevationProfile();
  if (!document.getElementById('settings-modal').classList.contains('hidden')) drawMenuElevationProfile();
  drawZoomElevationProfile();
  drawMinimap();
}

/**
 * Teleportacja kolarza na wybrany dystans (np. po kliknieciu w profil wysokosciowy pod trening konkretnego podjazdu)
 */
function teleportToDistance(targetDistM) {
  if (!routePoints || routePoints.length < 2) return;
  const clamped = THREE.MathUtils.clamp(targetDistM, 0, state.totalDistanceM - 5);
  state.distanceM = clamped;
  state.currentLeanRad = 0;
  ghostRider.currentLeanRad = 0;
  const tel = sampleRouteAtDistance(routePoints, clamped);
  state.currentAltitudeM = tel.ele;
  state.currentGradePct = tel.grade;
  state.currentTurnAngleDeg = tel.turnAngleDeg;
  state.currentHeadingDeg = tel.headingDeg || 0;
  state.currentCardinalDir = tel.cardinalDir || 'N';
  state.currentBankingPct = tel.bankingPct || 0;

  // Zsynchronizuj Ducha oraz czas GPX do miejsca skoku, by moc trenowac odcinek przeciwko Duchowi
  ghostRider.distanceM = clamped;
  ghostRider.currentAltitudeM = tel.ele;
  ghostRider.currentGradePct = tel.grade;
  ghostRider.currentBankingPct = tel.bankingPct || 0;
  state.ghostTimeOffsetSec = state.ghostMode === 'gpx' && tel.ghostElapsedSec > 0
    ? tel.ghostElapsedSec - state.elapsedSeconds : 0;
  recordGhostRider.distanceM = clamped;
  recordGhostRider.currentAltitudeM = tel.ele;
  recordGhostRider.currentGradePct = tel.grade;
  recordGhostRider.currentBankingPct = tel.bankingPct || 0;
  recordGhostRider.currentLeanRad = 0;
  state.recordGhostTimeOffsetSec = activeRecordGhost
    ? sampleRecordTimeAtDistance(activeRecordGhost.samples, clamped) - state.elapsedSeconds : 0;

  if (worldVisibleUpdater) {
    worldVisibleUpdater(clamped);
  }
  bleStatusEl.textContent = `Start: ${formatNumber(clamped / 1000, 2)} km (elevation ${Math.round(
    tel.ele
  )} m above sea level, grade ${formatNumber(tel.grade)}%)`;
  updateHUD();
}

// ============================================================================
// 6. STREFY MOCY FTP, HUD, CLIMBPRO, WYKRESY I MINIMAPA
// ============================================================================
const powerBoxEl = document.getElementById('power-box');
const hudWatts = document.getElementById('hud-watts');
const hudZone = document.getElementById('hud-zone');
const hudWkg = document.getElementById('hud-wkg');
const hudSpeed = document.getElementById('hud-speed');
const hudCadence = document.getElementById('hud-cadence');
const hudHr = document.getElementById('hud-hr');
const hudAvgWatts = document.getElementById('hud-avg-watts');
const hudAvgSpeed = document.getElementById('hud-avg-speed');
const hudGear = document.getElementById('hud-gear');
const hudGearBottom = document.getElementById('hud-gear-bottom');
const hudEta = document.getElementById('hud-eta');
const hudFps = document.getElementById('hud-fps');

const hudDistance = document.getElementById('hud-distance');
const hudElevation = document.getElementById('hud-elevation');
const hudRemaining = document.getElementById('hud-remaining');
const hudTime = document.getElementById('hud-time');
const hudGhostGap = document.getElementById('hud-ghost-gap');
const ghostStatBox = document.getElementById('ghost-stat-box');
const hudRecordGhostGap = document.getElementById('hud-record-ghost-gap');
const recordGhostStatBox = document.getElementById('record-ghost-stat-box');

const hudGrade = document.getElementById('hud-grade');
const hudAltitude = document.getElementById('hud-altitude');
const draftBanner = document.getElementById('draft-banner');
const hazardBanner = document.getElementById('hazard-banner');
const hazardIconEl = document.getElementById('hazard-icon');
const hazardTitleEl = document.getElementById('hazard-title');
const hazardSubtitleEl = document.getElementById('hazard-subtitle');
const hazardDistEl = document.getElementById('hazard-dist');
const climbproBanner = document.getElementById('climbpro-banner');
const climbproTitle = document.getElementById('climbpro-title');
const climbproStats = document.getElementById('climbpro-stats');
const climbproBarFill = document.getElementById('climbpro-bar-fill');
const climbproChallenger = document.getElementById('climbpro-challenger');
const climbproChallengerBadge = document.getElementById('climbpro-challenger-badge');
const climbproChallengerEle = document.getElementById('climbpro-challenger-ele');

const workoutBanner = document.getElementById('workout-banner');
const workoutStepTitle = document.getElementById('workout-step-title');
const workoutStepTimer = document.getElementById('workout-step-timer');
const workoutTargetWatts = document.getElementById('workout-target-watts');
const workoutTargetCad = document.getElementById('workout-target-cad');
const workoutStepNum = document.getElementById('workout-step-num');
const workoutBarFill = document.getElementById('workout-bar-fill');
const workoutErgBadge = document.getElementById('workout-erg-badge');
const nearbyListEl = document.getElementById('nearby-list');
const upcomingAvgGradeEl = document.getElementById('upcoming-avg-grade');

const elevationCanvas = document.getElementById('elevation-canvas');
const eleCtx = elevationCanvas.getContext('2d');
const menuElevationCanvas = document.getElementById('menu-elevation-canvas');
const menuEleCtx = menuElevationCanvas ? menuElevationCanvas.getContext('2d') : null;
const zoomCanvas = document.getElementById('zoom-elevation-canvas');
const zoomCtx = zoomCanvas.getContext('2d');
const minimapCanvas = document.getElementById('minimap-canvas');
const mapCtx = minimapCanvas.getContext('2d');

let hudHoverDist = null;
let menuHoverDist = null;
let finishChartHoverRatio = null;
let currentSummarySnapshot = null;
let currentSummaryIsHistorical = false;
let summaryReturnView = 'home';

function getPowerZoneInfo(watts, ftp) {
  const zone = getCogganPowerZone(watts, ftp);
  const backgrounds = ['#42504A', '#1D5C70', '#3E694C', '#866919', '#9F552E', '#993E42', '#694578'];
  return { label: zone.name, bg: backgrounds[zone.zone - 1], hex: parseInt(zone.color.slice(1), 16) };
}

function getGradeColor(gradePct, alpha = 1) {
  if (gradePct >= 13.0) return `rgba(220, 38, 38, ${alpha})`; // Mur / scianka (czerwony)
  if (gradePct >= 9.0) return `rgba(234, 88, 12, ${alpha})`; // Stromy podjazd (pomaranczowy)
  if (gradePct >= 6.0) return `rgba(234, 179, 8, ${alpha})`; // Wymagajacy (zolty)
  if (gradePct >= 3.0) return `rgba(14, 165, 233, ${alpha})`; // Umiarkowany (jasnoniebieski)
  if (gradePct >= 0.0) return `rgba(34, 197, 94, ${alpha})`; // Lagodny (zielony)
  return `rgba(100, 116, 139, ${alpha})`; // Zjazd (szary)
}

function updateHUD() {
  updateSessionUI();
  const displayWatts = Math.round(state.smoothedWatts);
  hudWatts.textContent = displayWatts;
  const wkg = state.smoothedWatts / Math.max(state.weightKg, 30);
  hudWkg.textContent = `${formatNumber(wkg)} W/kg`;

  // Kolorowanie strefy mocy FTP (HUD, pasek Coggan Z1-Z7 + pierscien pod rowerem)
  const zone = getPowerZoneInfo(displayWatts, state.ftpWatts);
  const coggan = getCogganPowerZone(displayWatts, state.ftpWatts);
  hudZone.textContent = coggan.name;
  powerBoxEl.style.background = zone.bg;
  if (playerAvatar.powerRingMat) {
    playerAvatar.powerRingMat.color.setHex(zone.hex);
  }

  const ribbonSegs = document.querySelectorAll('#hud-power-ribbon .ribbon-seg');
  if (ribbonSegs.length > 0) {
    for (let i = 0; i < ribbonSegs.length; i++) {
      const segZ = parseInt(ribbonSegs[i].getAttribute('data-zone'), 10);
      ribbonSegs[i].classList.toggle('active', segZ === coggan.zone);
    }
  }

  hudSpeed.textContent = formatNumber(state.speedMps * 3.6);

  if (!state.bleConnected && !state.cadenceSensorConnected && !state.powerMeterConnected) {
    // Uwzglednij wirtualny bieg (1..24) przy obliczaniu kadencji na podjazdach i zjazdach
    const gearOffset = (12 - state.virtualGear) * 2.2;
    state.cadence =
      isRideRunning(state) && state.watts > 10
        ? Math.max(45, Math.min(125, Math.round(68 + state.watts * 0.075 + gearOffset - state.currentGradePct * 0.9)))
        : 0;
  }
  hudCadence.textContent = state.cadence;
  const coach = getCadenceCoachStatus(state.cadence, state.currentGradePct, state.smoothedWatts);
  const coachEl = document.getElementById('hud-cadence-coach');
  if (coachEl) {
    coachEl.textContent = coach.label;
    coachEl.className = `cadence-coach-pill coach-${coach.state}`;
  }
  hudCadence.className = `metric-val cad-val cad-${coach.state}`;
  if (state.heartRate > 0) {
    hudHr.textContent = state.heartRate;
    const hrZone = getHeartRateZoneInfo(state.heartRate, state.hrMax || 185);
    const hrSub = document.getElementById('hud-hr-sub');
    if (hrSub) {
      hrSub.textContent = hrZone.label;
      hrSub.style.color = hrZone.color;
    }
  } else {
    hudHr.textContent = '—';
    const hrSub = document.getElementById('hud-hr-sub');
    if (hrSub) {
      hrSub.textContent = 'bpm';
      hrSub.style.color = '';
    }
  }

  // Srednia moc, wirtualna przerzutka oraz ETA do mety
  const avgWatts = state.elapsedSeconds > 1 ? Math.round(state.energyJoules / state.elapsedSeconds) : displayWatts;
  const avgSpeedKmh = formatNumber(state.elapsedSeconds > 2 ? (state.distanceM / state.elapsedSeconds) * 3.6 : 0);
  hudAvgWatts.textContent = `${avgWatts} W`;
  const liveMetrics = computeTrainingMetrics(recordedPoints, state.ftpWatts);
  hudAvgWatts.title = `Average: ${avgWatts} W | Normalized power (NP): ${liveMetrics.np} W | IF: ${formatNumber(liveMetrics.ifVal, 2)} | TSS: ${liveMetrics.tss}`;
  if (hudAvgSpeed) hudAvgSpeed.textContent = `${avgSpeedKmh} km/h`;
  const activeVirtual = isVirtualShiftingActive(state);
  shifterView?.updateGear(state.virtualGear);
  const gearDetails = getGearDetails(state.virtualGear, state.gearingProfile || 'allaround');
  if (hudGear) {
    hudGear.textContent = activeVirtual
      ? `Gear ${state.virtualGear}/24 · ${gearDetails.desc}`
      : 'Fizyczna kaseta';
  }
  if (hudGearBottom) {
    hudGearBottom.textContent = activeVirtual
      ? `Gear ${state.virtualGear} · ${gearDetails.desc}`
      : 'Physical cassette';
  }

  const remainingM = Math.max(0, state.totalDistanceM - state.distanceM);
  if (state.speedMps > 0.8) {
    const etaSec = remainingM / state.speedMps;
    hudEta.textContent = formatTimeMMSS(etaSec);
  } else {
    hudEta.textContent = '00:00';
  }

  hudFps.textContent = `${currentFps} FPS`;

  hudDistance.textContent = formatNumber(state.distanceM / 1000, 2);
  hudElevation.textContent = Math.round(state.elevationGainM);
  hudRemaining.textContent = formatNumber(remainingM / 1000, 2);
  hudTime.textContent = formatTimeMMSS(state.elapsedSeconds);

  // Status Ducha (Ghost Rider)
  if (state.ghostMode === 'off') {
    ghostStatBox.classList.add('hidden');
  } else {
    ghostStatBox.classList.remove('hidden');
    const gapM = state.distanceM - ghostRider.distanceM;
    const refSpeed = Math.max(state.speedMps, ghostRider.speedMps, 4.0);
    const gapSec = gapM / refSpeed;
    state.ghostGapSeconds = gapSec;
    state.ghostGapMeters = gapM;

    const sign = gapSec >= 0 ? '+' : '-';
    hudGhostGap.textContent = `${sign}${formatTimeMMSS(gapSec)} (${gapM >= 0 ? '+' : ''}${Math.round(gapM)} m)`;
    hudGhostGap.style.color = gapSec >= 0 ? '#4ade80' : '#f87171';
  }

  // Status drugiego Ducha (Własny rekord z Dziennika postępów)
  if (!isRecordGhostActive()) {
    recordGhostStatBox?.classList.add('hidden');
  } else {
    recordGhostStatBox?.classList.remove('hidden');
    const { gapSeconds, gapMeters } = computeRecordGhostGap(
      activeRecordGhost,
      state.distanceM,
      state.elapsedSeconds,
      state.speedMps,
      state.recordGhostTimeOffsetSec || 0
    );
    state.recordGhostGapSeconds = gapSeconds;
    state.recordGhostGapMeters = gapMeters;

    const recSign = gapSeconds >= 0 ? '+' : '-';
    if (hudRecordGhostGap) {
      hudRecordGhostGap.textContent = `${recSign}${formatTimeMMSS(Math.abs(gapSeconds))} (${gapMeters >= 0 ? '+' : ''}${Math.round(gapMeters)} m)`;
      hudRecordGhostGap.style.color = gapSeconds >= 0 ? '#4ade80' : '#f87171';
    }
  }

  // Nachylenie, wysokosc n.p.m. i kierunek geograficzny
  const g = state.currentGradePct;
  hudGrade.textContent = `${g >= 0 ? '+' : ''}${formatNumber(g)}%`;
  hudGrade.style.color = getGradeColor(g, 1);
  hudAltitude.textContent = Math.round(state.currentAltitudeM);
  const headingEl = document.getElementById('hud-heading');
  if (headingEl) {
    const deg = Math.round(state.currentHeadingDeg || 0);
    const card = state.currentCardinalDir || 'N';
    headingEl.textContent = `${deg}° ${card}`;
  }
  const windEl = document.getElementById('hud-wind');
  if (windEl) {
    const windSpeedKmh = Math.round((state.windSpeedMps || 0) * 3.6);
    const headMps = state.windHeadwindMps || 0;
    let windClass = 'wind-cross';
    let windIcon = 'icon-wind-cross';
    if (headMps > 0.8) {
      windClass = 'wind-head';
      windIcon = 'icon-wind-head';
    } else if (headMps < -0.8) {
      windClass = 'wind-tail';
      windIcon = 'icon-wind-tail';
    }
    windEl.className = `wind-badge ${windClass}`;
    windEl.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#${windIcon}" /></svg>${windSpeedKmh} km/h`;
    windEl.title = `Wind: ${windSpeedKmh} km/h (direction ${Math.round(state.windDirDeg || 0)}°), headwind component: ${formatNumber(headMps * 3.6)} km/h`;
  }

  // Banery: Drafting, Ostrzezenia o zakretach/sciankach oraz ClimbPro
  if (draftBanner) {
    draftBanner.classList.toggle('hidden', !state.isDrafting);
    if (state.isDrafting) {
      draftBanner.textContent = `Drafting (resistance reduced by ${state.draftDiscountPct || 25}%)`;
    }
  }

  const hazard = scanUpcomingRoute(routePoints, state.distanceM);
  if (hazard) {
    if (hazardIconEl) hazardIconEl.innerHTML = hazard.iconHtml;
    if (hazardTitleEl) hazardTitleEl.textContent = hazard.title;
    if (hazardSubtitleEl) {
      if (hazard.subtitle) {
        hazardSubtitleEl.textContent = hazard.subtitle;
        hazardSubtitleEl.style.display = '';
      } else {
        hazardSubtitleEl.textContent = '';
        hazardSubtitleEl.style.display = 'none';
      }
    }
    if (hazardDistEl) hazardDistEl.textContent = hazard.distText;
    hazardBanner.classList.remove('hidden');
  } else {
    hazardBanner.classList.add('hidden');
  }

  // ClimbPro: sprawdz czy jestesmy na podjezdzie (lub do 150m przed jego rozpoczeciem)
  const activeClimb = routeClimbs.find(
    (c) => state.distanceM >= c.startDist - 150 && state.distanceM <= c.endDist
  );
  if (activeClimb) {
    climbproBanner.classList.remove('hidden');
    if (state.distanceM < activeClimb.startDist) {
      const toStart = Math.round(activeClimb.startDist - state.distanceM);
      climbproTitle.textContent = `Ahead: ${activeClimb.name}`;
      climbproStats.textContent = `Start in ${toStart} m, length ${formatNumber(activeClimb.lengthM / 1000, 2)} km (avg. ${formatNumber(activeClimb.avgGradePct)}%)`;
      climbproBarFill.style.width = '0%';
    } else {
      const toTopM = Math.max(0, activeClimb.endDist - state.distanceM);
      const pctDone = THREE.MathUtils.clamp(
        ((state.distanceM - activeClimb.startDist) / Math.max(1, activeClimb.lengthM)) * 100,
        0,
        100
      );
      climbproTitle.textContent = `${activeClimb.name} (${routeClimbs.indexOf(activeClimb) + 1}/${
        routeClimbs.length
      })`;
      climbproStats.textContent = `To summit: ${formatNumber(toTopM / 1000, 2)} km, avg. ${formatNumber(activeClimb.avgGradePct)}% (max. ${formatNumber(activeClimb.maxGradePct)}%)`;
      climbproBarFill.style.width = `${pctDone.toFixed(1)}%`;

      // Live KOM & PR Challenger Ribbon (Pasek Holenderskiej Wstążki na podjazdach)
      if (climbproChallenger) {
        climbproChallenger.classList.remove('hidden');
        const targetGhost = state.ghostMode !== 'off' ? ghostRider : (isRecordGhostActive() ? recordGhostRider : ghostRider);
        const distDelta = state.distanceM - targetGhost.distanceM;
        const riderSpeed = Math.max(1.8, state.speedMps);
        const timeDeltaSec = state.ghostMode === 'off' && isRecordGhostActive()
          ? state.recordGhostGapSeconds
          : distDelta / riderSpeed;
        const climbRatioDone = THREE.MathUtils.clamp(
          (state.distanceM - activeClimb.startDist) / Math.max(1, activeClimb.lengthM),
          0,
          1
        );
        const remainingAscent = Math.max(
          0,
          Math.round((activeClimb.eleGainM || 60) * (1.0 - climbRatioDone))
        );

        if (climbproChallengerBadge) {
          if (distDelta >= 0) {
            climbproChallengerBadge.className = 'challenger-badge ahead';
            climbproChallengerBadge.textContent = `+${Math.round(distDelta)} m (−${formatNumber(Math.abs(timeDeltaSec))} s)`;
          } else {
            climbproChallengerBadge.className = 'challenger-badge behind';
            climbproChallengerBadge.textContent = `${Math.round(distDelta)} m (+${formatNumber(Math.abs(timeDeltaSec))} s)`;
          }
        }
        if (climbproChallengerEle) {
          climbproChallengerEle.textContent = `To summit: +${remainingAscent} m`;
        }
      }
    }
  } else {
    climbproBanner.classList.add('hidden');
    if (climbproChallenger) climbproChallenger.classList.add('hidden');
  }

  // Pasek Treningu Ustrukturyzowanego (Structured Workout HUD widget)
  if (state.isWorkoutRunning && state.activeWorkout) {
    if (workoutBanner) workoutBanner.classList.remove('hidden');
    const wState = getWorkoutStateAtTime(
      state.activeWorkout,
      state.workoutElapsedSec,
      state.ftpWatts || 250
    );
    if (wState && wState.activeBlock) {
      if (workoutStepTitle) {
        workoutStepTitle.textContent = wState.activeBlock.name || 'Interval';
      }
      if (workoutTargetWatts) {
        workoutTargetWatts.textContent = `${wState.targetWatts} W`;
      }
      if (workoutTargetCad) {
        workoutTargetCad.textContent = wState.targetCadence ? `${wState.targetCadence} rpm` : '—';
      }
      if (workoutStepNum) {
        workoutStepNum.textContent = `${wState.blockIndex}/${wState.totalBlocks}`;
      }

      const remMin = Math.floor(wState.blockRemainingSec / 60);
      const remSec = Math.floor(wState.blockRemainingSec % 60);
      if (workoutStepTimer) {
        workoutStepTimer.textContent = `${String(remMin).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
      }

      if (workoutBarFill) {
        workoutBarFill.style.width = `${(wState.blockProgressRatio * 100).toFixed(1)}%`;
        workoutBarFill.style.backgroundColor = wState.zoneColor;
      }

      if (workoutErgBadge) {
        workoutErgBadge.style.display =
          state.workoutErgMode && !wState.isFreeRide ? 'inline-block' : 'none';
      }

    }
  } else if (workoutBanner) {
    workoutBanner.classList.add('hidden');
  }

  // Lista kolarzy na trasie (Gracz + Duch + Pacerzy)
  const ridersList = [
    { name: state.name, dist: state.distanceM, wkg: formatNumber(wkg), cls: 'self' },
    ...aiPacers.map((b) => ({
      name: b.name.split(' (')[0],
      dist: b.distanceM,
      wkg: formatNumber(b.watts / b.weightKg),
      cls: '',
    })),
  ];

  if (state.ghostMode !== 'off') {
    const ghostWkg = formatNumber(ghostRider.watts / ghostRider.weightKg);
    ridersList.push({
      name: ghostRider.name,
      dist: ghostRider.distanceM,
      wkg: ghostWkg,
      cls: 'ghost',
    });
  }

  if (isRecordGhostActive()) {
    const recWkg = formatNumber(recordGhostRider.watts / Math.max(35, recordGhostRider.weightKg));
    ridersList.push({
      name: recordGhostRider.name,
      dist: recordGhostRider.distanceM,
      wkg: recWkg,
      cls: 'ghost record-ghost',
    });
  }

  ridersList.sort((a, b) => b.dist - a.dist);

  nearbyListEl.innerHTML = ridersList
    .map((r) => {
      const diffM = Math.round(r.dist - state.distanceM);
      const diffLabel =
        r.cls === 'self'
          ? `${r.wkg} W/kg`
          : `${diffM >= 0 ? '+' : ''}${diffM} m (${r.wkg} W/kg)`;
      return `<div class="nearby-item ${r.cls}">
        <span>${String(r.name).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</span>
        <span>${diffLabel}</span>
      </div>`;
    })
    .join('');

  drawElevationProfile();
  if (!document.getElementById('settings-modal').classList.contains('hidden')) drawMenuElevationProfile();
  drawZoomElevationProfile();
  drawMinimap();
}

/**
 * Rysuje pelny profil trasy GPX z kolorowymi podjazdami KOM oraz mozliwoscia klikniecia
 */
function drawElevationProfile() {
  const w = elevationCanvas.width;
  const h = elevationCanvas.height;
  eleCtx.clearRect(0, 0, w, h);
  if (routePoints.length < 2) return;

  const cache=elevationBaseCache;
  const invalid=cache.points!==routePoints||cache.climbs!==routeClimbs||cache.canvas.width!==w||cache.canvas.height!==h;
  let minEle=cache.min,maxEle=cache.max;
  if(invalid){
    minEle=Infinity;maxEle=-Infinity;
    for(const p of routePoints){if(p.ele<minEle)minEle=p.ele;if(p.ele>maxEle)maxEle=p.ele;}
    cache.min=minEle;cache.max=maxEle;
  }
  const eleSpan = Math.max(maxEle - minEle, 25);

  const toXY = (dist, ele) => ({
    x: (dist / state.totalDistanceM) * w,
    y: h - 7 - ((ele - minEle) / eleSpan) * (h - 20),
  });

  if(invalid){
  // Statyczny profil jest rasteryzowany raz na trasę/rozmiar, markery pozostają na żywo.
  eleCtx.textBaseline='alphabetic';
  // Podswietlenie wykrytych podjazdow KOM na pelnym profilu
  for (const c of routeClimbs) {
    const x1 = (c.startDist / state.totalDistanceM) * w;
    const x2 = (c.endDist / state.totalDistanceM) * w;
    eleCtx.fillStyle = 'rgba(239, 68, 68, 0.16)';
    eleCtx.fillRect(x1, 0, Math.max(2, x2 - x1), h);
  }

  // Segmentowe wypelnienie profilu kolorami stref nachylenia (Standard ClimbPro / UCI)
  for (let i = 0; i < routePoints.length - 1; i++) {
    const p0 = routePoints[i];
    const p1 = routePoints[i + 1];
    const pt0 = toXY(p0.dist, p0.ele);
    const pt1 = toXY(p1.dist, p1.ele);
    const segGrade = (p0.grade + p1.grade) * 0.5;

    eleCtx.beginPath();
    eleCtx.moveTo(pt0.x, h);
    eleCtx.lineTo(pt0.x, pt0.y);
    eleCtx.lineTo(pt1.x, pt1.y);
    eleCtx.lineTo(pt1.x, h);
    eleCtx.closePath();

    eleCtx.fillStyle = getGradeColor(segGrade, 0.44);
    eleCtx.fill();
  }

  // Obrys profilu
  eleCtx.beginPath();
  for (let i = 0; i < routePoints.length; i++) {
    const { x, y } = toXY(routePoints[i].dist, routePoints[i].ele);
    if (i === 0) eleCtx.moveTo(x, y);
    else eleCtx.lineTo(x, y);
  }
  eleCtx.strokeStyle = 'rgba(251, 245, 234, 0.95)';
  eleCtx.lineWidth = 1.75;
  eleCtx.stroke();

  // Znaczniki szczytow KOM
  eleCtx.font = 'bold 9px sans-serif';
  eleCtx.textAlign = 'center';
  for (const c of routeClimbs) {
    const { x, y } = toXY(c.endDist, c.endEle);
    eleCtx.fillStyle = '#ef4444';
    eleCtx.fillText(`👑#${c.index}`, x, Math.max(10, y - 5));
  }

  cache.canvas.width=w;cache.canvas.height=h;
  cache.canvas.getContext('2d').drawImage(elevationCanvas,0,0);
  cache.points=routePoints;cache.climbs=routeClimbs;
  }else{
    eleCtx.drawImage(cache.canvas,0,0);
  }

  // Kropki Pacerow
  for (const bot of aiPacers) {
    const { x, y } = toXY(bot.distanceM, bot.currentAltitudeM);
    eleCtx.beginPath();
    eleCtx.arc(x, y, 3, 0, Math.PI * 2);
    eleCtx.fillStyle = '#38bdf8';
    eleCtx.fill();
  }

  // Kropka Ducha (Ghost Rider)
  if (state.ghostMode !== 'off') {
    const { x, y } = toXY(ghostRider.distanceM, ghostRider.currentAltitudeM);
    eleCtx.beginPath();
    eleCtx.arc(x, y, 4.5, 0, Math.PI * 2);
    eleCtx.fillStyle = '#c084fc';
    eleCtx.fill();
    eleCtx.strokeStyle = '#ffffff';
    eleCtx.lineWidth = 1.5;
    eleCtx.stroke();
  }

  // Kropka drugiego Ducha (Własny rekord)
  if (isRecordGhostActive()) {
    const { x, y } = toXY(recordGhostRider.distanceM, recordGhostRider.currentAltitudeM);
    eleCtx.beginPath();
    eleCtx.arc(x, y, 4.5, 0, Math.PI * 2);
    eleCtx.fillStyle = '#f59e0b';
    eleCtx.fill();
    eleCtx.strokeStyle = '#ffffff';
    eleCtx.lineWidth = 1.5;
    eleCtx.stroke();
  }

  // Kropka gracza
  const { x: px, y: py } = toXY(state.distanceM, state.currentAltitudeM);
  eleCtx.beginPath();
  eleCtx.arc(px, py, 5.5, 0, Math.PI * 2);
  eleCtx.fillStyle = brandColors.cream;
  eleCtx.fill();
  eleCtx.lineWidth = 2.5;
  eleCtx.strokeStyle = brandColors.yellow;
  eleCtx.stroke();

  // Interaktywny kursor i dymek lupy profilu na HUD
  if (hudHoverDist !== null && hudHoverDist >= 0 && hudHoverDist <= state.totalDistanceM) {
    const tel = sampleRouteAtDistance(routePoints, hudHoverDist);
    const { x: hx, y: hy } = toXY(hudHoverDist, tel.ele);

    eleCtx.save();
    eleCtx.setLineDash([3, 3]);
    eleCtx.strokeStyle = 'rgba(251, 245, 234, 0.75)';
    eleCtx.lineWidth = 1.5;
    eleCtx.beginPath();
    eleCtx.moveTo(hx, 0);
    eleCtx.lineTo(hx, h);
    eleCtx.stroke();
    eleCtx.restore();

    eleCtx.beginPath();
    eleCtx.arc(hx, hy, 4, 0, Math.PI * 2);
    eleCtx.fillStyle = brandColors.yellow;
    eleCtx.fill();
    eleCtx.strokeStyle = '#0f172a';
    eleCtx.lineWidth = 1.5;
    eleCtx.stroke();

    const tagText = `${formatNumber(hudHoverDist / 1000)} km · ${Math.round(tel.ele)} m · ${tel.grade >= 0 ? '+' : ''}${formatNumber(tel.grade)}%`;
    eleCtx.font = 'bold 10px sans-serif';
    const textW = eleCtx.measureText(tagText).width;
    const boxX = THREE.MathUtils.clamp(hx - textW / 2 - 6, 4, w - textW - 12);
    const boxY = Math.max(4, hy - 22);

    eleCtx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    eleCtx.fillRect(boxX, boxY, textW + 12, 17);
    eleCtx.strokeStyle = 'rgba(242, 201, 76, 0.6)';
    eleCtx.lineWidth = 1;
    eleCtx.strokeRect(boxX, boxY, textW + 12, 17);

    eleCtx.fillStyle = '#ffffff';
    eleCtx.textAlign = 'left';
    eleCtx.textBaseline = 'middle';
    eleCtx.fillText(tagText, boxX + 6, boxY + 8.5);
  }
}

/**
 * Rysuje podglad profilu wysokosci wybranej trasy w Menu Glownym (przed kliknieciem Rozpocznij jazde),
 * z zaznaczonymi podjazdami KOM oraz interaktywnym znacznikiem miejsca startu.
 */
function drawMenuElevationProfile() {
  if (!menuElevationCanvas || !menuEleCtx || routePoints.length < 2) return;
  const w = menuElevationCanvas.width;
  const h = menuElevationCanvas.height;
  menuEleCtx.clearRect(0, 0, w, h);

  let minEle = Infinity;
  let maxEle = -Infinity;
  for (const p of routePoints) {
    if (p.ele < minEle) minEle = p.ele;
    if (p.ele > maxEle) maxEle = p.ele;
  }
  const eleSpan = Math.max(maxEle - minEle, 25);
  const topPad = 18;
  const botPad = 15;
  const plotH = h - topPad - botPad;

  const toXY = (dist, ele) => ({
    x: (dist / state.totalDistanceM) * w,
    y: h - botPad - ((ele - minEle) / eleSpan) * plotH,
  });

  // Podswietlenie podjazdow KOM
  for (const c of routeClimbs) {
    const x1 = (c.startDist / state.totalDistanceM) * w;
    const x2 = (c.endDist / state.totalDistanceM) * w;
    menuEleCtx.fillStyle = 'rgba(168, 63, 69, 0.11)';
    menuEleCtx.fillRect(x1, 0, Math.max(3, x2 - x1), h - botPad);

    const midX = Math.min(w - 42, Math.max(42, (x1 + x2) * 0.5));
    menuEleCtx.fillStyle = brandColors.error;
    menuEleCtx.font = '600 10px "Segoe UI", sans-serif';
    menuEleCtx.textAlign = 'center';
    menuEleCtx.fillText(
      `#${c.index} · ${c.avgGradePct.toFixed(1)}%`,
      midX,
      12
    );
  }

  // Segmentowe wypelnienie profilu kolorami stref nachylenia w Menu Glownym
  for (let i = 0; i < routePoints.length - 1; i++) {
    const p0 = routePoints[i];
    const p1 = routePoints[i + 1];
    const pt0 = toXY(p0.dist, p0.ele);
    const pt1 = toXY(p1.dist, p1.ele);
    const segGrade = (p0.grade + p1.grade) * 0.5;

    menuEleCtx.beginPath();
    menuEleCtx.moveTo(pt0.x, h - botPad);
    menuEleCtx.lineTo(pt0.x, pt0.y);
    menuEleCtx.lineTo(pt1.x, pt1.y);
    menuEleCtx.lineTo(pt1.x, h - botPad);
    menuEleCtx.closePath();

    menuEleCtx.fillStyle = getGradeColor(segGrade, 0.38);
    menuEleCtx.fill();
  }

  // Linia grzbietu profilu
  menuEleCtx.beginPath();
  for (let i = 0; i < routePoints.length; i++) {
    const { x, y } = toXY(routePoints[i].dist, routePoints[i].ele);
    if (i === 0) menuEleCtx.moveTo(x, y);
    else menuEleCtx.lineTo(x, y);
  }
  menuEleCtx.strokeStyle = brandColors.forest;
  menuEleCtx.lineWidth = 2;
  menuEleCtx.stroke();

  // Os dolna i etykiety dystansu / wysokosci
  menuEleCtx.strokeStyle = 'rgba(32, 55, 44, 0.14)';
  menuEleCtx.lineWidth = 1;
  menuEleCtx.beginPath();
  menuEleCtx.moveTo(0, h - botPad);
  menuEleCtx.lineTo(w, h - botPad);
  menuEleCtx.stroke();

  const totalKm = state.totalDistanceM / 1000;
  menuEleCtx.fillStyle = brandColors.lightMuted;
  menuEleCtx.font = '500 10px "Segoe UI", sans-serif';
  menuEleCtx.textAlign = 'left';
  menuEleCtx.fillText('0.0 km', 6, h - 3);
  menuEleCtx.textAlign = 'center';
  menuEleCtx.fillText(`${(totalKm * 0.5).toFixed(1)} km`, w * 0.5, h - 3);
  menuEleCtx.textAlign = 'right';
  menuEleCtx.fillText(`${totalKm.toFixed(1)} km`, w - 6, h - 3);
  menuEleCtx.fillText(
    `${Math.round(minEle)}–${Math.round(maxEle)} m above sea level`,
    w - 6,
    12
  );

  // Znacznik wybranego miejsca startu
  const { x: sx, y: sy } = toXY(state.distanceM, state.currentAltitudeM);
  menuEleCtx.save();
  menuEleCtx.setLineDash([3, 3]);
  menuEleCtx.strokeStyle = brandColors.forest;
  menuEleCtx.lineWidth = 1.5;
  menuEleCtx.beginPath();
  menuEleCtx.moveTo(sx, topPad - 4);
  menuEleCtx.lineTo(sx, h - botPad);
  menuEleCtx.stroke();
  menuEleCtx.restore();

  menuEleCtx.beginPath();
  menuEleCtx.arc(sx, sy, 5.5, 0, Math.PI * 2);
  menuEleCtx.fillStyle = brandColors.yellow;
  menuEleCtx.fill();
  menuEleCtx.lineWidth = 2;
  menuEleCtx.strokeStyle = brandColors.forest;
  menuEleCtx.stroke();

  // Interaktywny kursor i dymek lupy profilu w Menu Glownym
  if (menuHoverDist !== null && menuHoverDist >= 0 && menuHoverDist <= state.totalDistanceM) {
    const tel = sampleRouteAtDistance(routePoints, menuHoverDist);
    const { x: hx, y: hy } = toXY(menuHoverDist, tel.ele);

    menuEleCtx.save();
    menuEleCtx.setLineDash([3, 3]);
    menuEleCtx.strokeStyle = brandColors.forest;
    menuEleCtx.lineWidth = 1.5;
    menuEleCtx.beginPath();
    menuEleCtx.moveTo(hx, topPad);
    menuEleCtx.lineTo(hx, h - botPad);
    menuEleCtx.stroke();
    menuEleCtx.restore();

    menuEleCtx.beginPath();
    menuEleCtx.arc(hx, hy, 4.5, 0, Math.PI * 2);
    menuEleCtx.fillStyle = brandColors.yellow;
    menuEleCtx.fill();
    menuEleCtx.strokeStyle = brandColors.forest;
    menuEleCtx.lineWidth = 1.5;
    menuEleCtx.stroke();

    const tagText = `${formatNumber(menuHoverDist / 1000)} km · ${Math.round(tel.ele)} m above sea level · ${tel.grade >= 0 ? '+' : ''}${formatNumber(tel.grade)}%`;
    menuEleCtx.font = '600 11px "Segoe UI", sans-serif';
    const textW = menuEleCtx.measureText(tagText).width;
    const boxX = THREE.MathUtils.clamp(hx - textW / 2 - 8, 6, w - textW - 16);
    const boxY = Math.max(6, hy - 25);

    menuEleCtx.fillStyle = brandColors.forest;
    menuEleCtx.fillRect(boxX, boxY, textW + 16, 20);
    menuEleCtx.strokeStyle = brandColors.yellow;
    menuEleCtx.lineWidth = 1;
    menuEleCtx.strokeRect(boxX, boxY, textW + 16, 20);

    menuEleCtx.fillStyle = '#ffffff';
    menuEleCtx.textAlign = 'left';
    menuEleCtx.textBaseline = 'middle';
    menuEleCtx.fillText(tagText, boxX + 8, boxY + 10);
  }
}

/**
 * Rysuje zblizenie nadchodzacych 1500m przed kolarzem (ClimbPro Zoom) z kolorowymi kolumnami co 100m
 */
function drawZoomElevationProfile() {
  const w = zoomCanvas.width;
  const h = zoomCanvas.height;
  zoomCtx.clearRect(0, 0, w, h);
  if (routePoints.length < 2) return;

  const lookAheadM = 1500;
  const numSegments = 15; // 15 odcinkow po 100m
  const segLenM = lookAheadM / numSegments;

  const samples = [];
  let minEle = Infinity;
  let maxEle = -Infinity;
  let gradeSum = 0;

  for (let i = 0; i <= numSegments; i++) {
    const dist = (state.distanceM + i * segLenM) % state.totalDistanceM;
    const tel = sampleRouteAtDistance(routePoints, dist);
    if (tel.ele < minEle) minEle = tel.ele;
    if (tel.ele > maxEle) maxEle = tel.ele;
    if (i < numSegments) gradeSum += tel.grade;
    samples.push(tel);
  }

  const avgUpcomingGrade = gradeSum / numSegments;
  if (upcomingAvgGradeEl) {
    upcomingAvgGradeEl.textContent = `Avg. ${avgUpcomingGrade >= 0 ? '+' : ''}${formatNumber(avgUpcomingGrade)}%`;
    upcomingAvgGradeEl.style.color = getGradeColor(avgUpcomingGrade, 1);
  }

  const eleSpan = Math.max(maxEle - minEle, 18);
  const toY = (ele) => h - 14 - ((ele - minEle) / eleSpan) * (h - 26);

  const colW = w / numSegments;

  for (let i = 0; i < numSegments; i++) {
    const s0 = samples[i];
    const s1 = samples[i + 1];
    const x0 = i * colW;
    const x1 = (i + 1) * colW;
    const y0 = toY(s0.ele);
    const y1 = toY(s1.ele);
    const segGrade = ((s1.ele - s0.ele) / segLenM) * 100;

    zoomCtx.beginPath();
    zoomCtx.moveTo(x0, h - 12);
    zoomCtx.lineTo(x0, y0);
    zoomCtx.lineTo(x1, y1);
    zoomCtx.lineTo(x1, h - 12);
    zoomCtx.closePath();
    zoomCtx.fillStyle = getGradeColor(segGrade, 0.55);
    zoomCtx.fill();

    zoomCtx.beginPath();
    zoomCtx.moveTo(x0, y0);
    zoomCtx.lineTo(x1, y1);
    zoomCtx.strokeStyle = getGradeColor(segGrade, 1.0);
    zoomCtx.lineWidth = 2.5;
    zoomCtx.stroke();

    // Podzialka pionowa co 100m
    zoomCtx.strokeStyle = 'rgba(255,255,255,0.08)';
    zoomCtx.lineWidth = 1;
    zoomCtx.beginPath();
    zoomCtx.moveTo(x1, 0);
    zoomCtx.lineTo(x1, h - 12);
    zoomCtx.stroke();

    // Wypisz nachylenie % co drugi slupek
    if (i % 2 === 0) {
      zoomCtx.fillStyle = '#f8fafc';
      zoomCtx.font = 'bold 8.5px sans-serif';
      zoomCtx.textAlign = 'center';
      const labelY = Math.max(10, Math.min(h - 16, (y0 + y1) / 2 - 4));
      zoomCtx.fillText(`${Math.round(segGrade)}%`, x0 + colW * 0.5, labelY);
    }
  }

  // Os odleglosci na dole (+500m, +1.0km, +1.5km)
  zoomCtx.fillStyle = '#94a3b8';
  zoomCtx.font = 'bold 8.5px sans-serif';
  zoomCtx.textAlign = 'left';
  zoomCtx.fillText('NOW', 4, h - 2);
  zoomCtx.textAlign = 'center';
  zoomCtx.fillText('+500m', w * 0.33, h - 2);
  zoomCtx.fillText('+1.0km', w * 0.66, h - 2);
  zoomCtx.textAlign = 'right';
  zoomCtx.fillText('+1.5km', w - 4, h - 2);
}

function drawMinimap() {
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  mapCtx.clearRect(0, 0, w, h);
  if (routePoints.length < 2) return;

  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of routePoints) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const pad = 14;
  const spanX = Math.max(maxX - minX, 10);
  const spanZ = Math.max(maxZ - minZ, 10);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);

  const toCanvas = (x, z) => ({
    cx: w / 2 + (x - (minX + maxX) / 2) * scale,
    cy: h / 2 + (z - (minZ + maxZ) / 2) * scale,
  });

  // Cala trasa
  mapCtx.beginPath();
  for (let i = 0; i < routePoints.length; i++) {
    const { cx, cy } = toCanvas(routePoints[i].x, routePoints[i].z);
    if (i === 0) mapCtx.moveTo(cx, cy);
    else mapCtx.lineTo(cx, cy);
  }
  mapCtx.strokeStyle = brandColors.muted;
  mapCtx.lineWidth = 3;
  mapCtx.stroke();

  if (routeCurve) {
    // Rysuj Pacerow
    for (const bot of aiPacers) {
      const bu = THREE.MathUtils.clamp(bot.distanceM / state.totalDistanceM, 0, 1);
      const bpos = routeCurve.getPointAt(bu);
      const { cx, cy } = toCanvas(bpos.x, bpos.z);
      mapCtx.beginPath();
      mapCtx.arc(cx, cy, 3, 0, Math.PI * 2);
      mapCtx.fillStyle = '#38bdf8';
      mapCtx.fill();
    }

    // Rysuj Ducha
    if (state.ghostMode !== 'off') {
      const gu = THREE.MathUtils.clamp(ghostRider.distanceM / state.totalDistanceM, 0, 1);
      const gpos = routeCurve.getPointAt(gu);
      const { cx, cy } = toCanvas(gpos.x, gpos.z);
      mapCtx.beginPath();
      mapCtx.arc(cx, cy, 4, 0, Math.PI * 2);
      mapCtx.fillStyle = '#c084fc';
      mapCtx.fill();
    }

    // Rysuj drugiego Ducha (Własny rekord)
    if (isRecordGhostActive()) {
      const rgu = THREE.MathUtils.clamp(recordGhostRider.distanceM / state.totalDistanceM, 0, 1);
      const rgpos = routeCurve.getPointAt(rgu);
      const { cx, cy } = toCanvas(rgpos.x, rgpos.z);
      mapCtx.beginPath();
      mapCtx.arc(cx, cy, 4, 0, Math.PI * 2);
      mapCtx.fillStyle = '#f59e0b';
      mapCtx.fill();
    }

    // Rysuj gracza
    const u = THREE.MathUtils.clamp(state.distanceM / state.totalDistanceM, 0, 1);
    const pos = routeCurve.getPointAt(u);
    const { cx, cy } = toCanvas(pos.x, pos.z);
    mapCtx.beginPath();
    mapCtx.arc(cx, cy, 5, 0, Math.PI * 2);
    mapCtx.fillStyle = brandColors.yellow;
    mapCtx.fill();
    mapCtx.strokeStyle = brandColors.cream;
    mapCtx.lineWidth = 2;
    mapCtx.stroke();
  }

  // Wskaznik Polnocy (Compass Rose) na minimapie trasy
  const compX = w - 18;
  const compY = 18;
  mapCtx.save();
  mapCtx.beginPath();
  mapCtx.arc(compX, compY, 11, 0, Math.PI * 2);
  mapCtx.fillStyle = 'rgba(15, 35, 27, 0.72)';
  mapCtx.fill();
  mapCtx.strokeStyle = 'rgba(242, 201, 76, 0.45)';
  mapCtx.lineWidth = 1;
  mapCtx.stroke();

  // Czerwona igla wskazujaca Polnoc (wspolrzedne -Z)
  mapCtx.beginPath();
  mapCtx.moveTo(compX, compY - 7.5);
  mapCtx.lineTo(compX - 3.2, compY + 2);
  mapCtx.lineTo(compX + 3.2, compY + 2);
  mapCtx.closePath();
  mapCtx.fillStyle = '#ef4444';
  mapCtx.fill();

  mapCtx.font = 'bold 8px sans-serif';
  mapCtx.fillStyle = '#f8fafc';
  mapCtx.textAlign = 'center';
  mapCtx.fillText('N', compX, compY + 9);

  // Wektor wiatru atmosferycznego na rozy kompasowej (blekitna strzalka z kierunkiem wiania)
  if (state.windSpeedMps > 0.5) {
    const blowRad = THREE.MathUtils.degToRad(((state.windDirDeg || 0) + 180) % 360);
    const arrowLen = 9.0;
    const ax = compX + Math.sin(blowRad) * arrowLen;
    const ay = compY - Math.cos(blowRad) * arrowLen;
    mapCtx.beginPath();
    mapCtx.moveTo(compX, compY);
    mapCtx.lineTo(ax, ay);
    mapCtx.strokeStyle = '#38bdf8';
    mapCtx.lineWidth = 1.6;
    mapCtx.stroke();
    mapCtx.beginPath();
    mapCtx.arc(ax, ay, 2.0, 0, Math.PI * 2);
    mapCtx.fillStyle = '#38bdf8';
    mapCtx.fill();
  }
  mapCtx.restore();
}

/**
 * Zmienia oswietlenie sceny 3D (Sloneczne Alpy / Zachod Watopia Golden Hour / Nocny Wyscig / Dynamiczna płynna pora)
 */
function applyTimeOfDay(mode) {
  state.timeOfDay = mode;
  if (mode === 'sunset') {
    scene.background.setHex(0xea580c);
    scene.fog.color.setHex(0xf97316);
    scene.fog.density = 0.0011;
    hemiLight.color.setHex(0xfed7aa);
    hemiLight.groundColor.setHex(0x431407);
    hemiLight.intensity = 0.78;
    sunLight.color.setHex(0xffedd5);
    sunLight.intensity = 1.65;
    skyEnvironment.applyMode('sunset');
  } else if (mode === 'night') {
    scene.background.setHex(0x090d16);
    scene.fog.color.setHex(0x0f172a);
    scene.fog.density = 0.0015;
    hemiLight.color.setHex(0x38bdf8);
    hemiLight.groundColor.setHex(0x020617);
    hemiLight.intensity = 0.35;
    sunLight.color.setHex(0x60a5fa);
    sunLight.intensity = 0.42;
    skyEnvironment.applyMode('night');
  } else if (mode === 'dynamic') {
    updateDynamicTimeOfDay();
  } else {
    scene.background.setHex(0x68a4d8);
    scene.fog.color.setHex(0x7fb2e5);
    scene.fog.density = 0.001;
    hemiLight.color.setHex(0xdbeafe);
    hemiLight.groundColor.setHex(0x3f6212);
    hemiLight.intensity = 0.92;
    sunLight.color.setHex(0xfffbeb);
    sunLight.intensity = 1.45;
    skyEnvironment.applyMode('day');
  }
}

/**
 * Płynne przejście pory dnia (dzień ➔ złota godzina / zachód ➔ zmierzch) w trybie dynamicznym
 */
const dynamicDayPalette = {
  daySky:new THREE.Color(0x68a4d8),sunsetSky:new THREE.Color(0xea580c),duskSky:new THREE.Color(0x1e293b),
  dayFog:new THREE.Color(0x7fb2e5),sunsetFog:new THREE.Color(0xf97316),duskFog:new THREE.Color(0x0f172a),
  sunDay:new THREE.Color(0xfffbeb),sunset:new THREE.Color(0xffedd5),sunDusk:new THREE.Color(0xfdba74),
  sky:new THREE.Color(),fog:new THREE.Color(),sun:new THREE.Color(),
};
function updateDynamicTimeOfDay() {
  const distRatio = state.totalDistanceM > 0 ? state.distanceM / state.totalDistanceM : 0;
  const timeRatio = (state.elapsedSeconds % 1200) / 1200; // Cykl 20-minutowy lub proporcja trasy
  const prog = THREE.MathUtils.clamp(Math.max(distRatio, timeRatio), 0, 1);

  const {daySky,sunsetSky,duskSky,dayFog,sunsetFog,duskFog}=dynamicDayPalette;

  let targetSky, targetFog, targetHemiInt, targetSunInt, targetSunColor;
  if (prog < 0.6) {
    const t = prog / 0.6;
    targetSky = dynamicDayPalette.sky.copy(daySky).lerp(sunsetSky, t);
    targetFog = dynamicDayPalette.fog.copy(dayFog).lerp(sunsetFog, t);
    targetHemiInt = THREE.MathUtils.lerp(0.92, 0.78, t);
    targetSunInt = THREE.MathUtils.lerp(1.45, 1.65, t);
    targetSunColor = dynamicDayPalette.sun.copy(dynamicDayPalette.sunDay).lerp(dynamicDayPalette.sunset,t);
  } else {
    const t = (prog - 0.6) / 0.4;
    targetSky = dynamicDayPalette.sky.copy(sunsetSky).lerp(duskSky, t);
    targetFog = dynamicDayPalette.fog.copy(sunsetFog).lerp(duskFog, t);
    targetHemiInt = THREE.MathUtils.lerp(0.78, 0.42, t);
    targetSunInt = THREE.MathUtils.lerp(1.65, 0.65, t);
    targetSunColor = dynamicDayPalette.sun.copy(dynamicDayPalette.sunset).lerp(dynamicDayPalette.sunDusk,t);
  }

  scene.background.copy(targetSky);
  scene.fog.color.copy(targetFog);
  hemiLight.intensity = targetHemiInt;
  sunLight.intensity = targetSunInt;
  sunLight.color.copy(targetSunColor);
  skyEnvironment.applyDynamic(prog);
}

/**
 * Wyznacza najwyzsza srednia moc z zadanego okna czasowego (np. 5s, 60s, 300s, 1200s)
 */
function computePeakWatts(windowSec, pointsList = recordedPoints) {
  if (!pointsList || pointsList.length === 0) {
    return 0;
  }
  const n = pointsList.length;
  const w = Math.min(windowSec, n);
  let sum = 0;
  for (let i = 0; i < w; i++) {
    sum += pointsList[i].watts;
  }
  let maxSum = sum;
  for (let i = w; i < n; i++) {
    sum += pointsList[i].watts - pointsList[i - w].watts;
    if (sum > maxSum) maxSum = sum;
  }
  return Math.round(maxSum / Math.max(1, w));
}

/**
 * Wyznacza Normalized Power (NP), Intensity Factor (IF) oraz Training Stress Score (TSS)
 * zgodnie z medyczno-sportowym standardem dra Andrew Coggana (rolling 30s power, 4th-power weighting)
 */
function computeTrainingMetrics(pointsList = recordedPoints, ftp = state.ftpWatts) {
  if (!pointsList || pointsList.length < 5) {
    const w = pointsList?.length ? Math.round(pointsList.reduce((sum,p)=>sum+p.watts,0)/pointsList.length) : 0;
    const ftpVal = Math.max(80, ftp || 250);
    const ifVal = parseFloat((w / ftpVal).toFixed(2));
    return {
      np: w,
      ifVal,
      tss: 0,
      avgWatts: w,
      maxWatts: w,
      vi: 1.00,
      avgCadence: Math.round(state.cadence || 0),
      maxCadence: Math.round(state.cadence || 0),
      avgHr: state.heartRate > 0 ? state.heartRate : null,
      maxHr: state.heartRate > 0 ? state.heartRate : null,
      ef: null,
    };
  }

  const windowSize = 30;
  const rollingAverages = [];
  let runningSum = 0;
  let totalWatts = 0;
  let maxWatts = 0;
  let totalCad = 0;
  let maxCad = 0;
  let totalHr = 0;
  let maxHr = 0;
  let hrCount = 0;

  for (let i = 0; i < pointsList.length; i++) {
    const p = pointsList[i];
    const w = p.watts || 0;
    totalWatts += w;
    if (w > maxWatts) maxWatts = w;

    const cad = p.cadence || 0;
    totalCad += cad;
    if (cad > maxCad) maxCad = cad;

    const hr = p.hr || 0;
    if (hr > 0) {
      totalHr += hr;
      hrCount++;
      if (hr > maxHr) maxHr = hr;
    }

    runningSum += w;
    if (i >= windowSize) {
      runningSum -= (pointsList[i - windowSize].watts || 0);
      rollingAverages.push(runningSum / windowSize);
    } else {
      rollingAverages.push(runningSum / (i + 1));
    }
  }

  let sum4 = 0;
  for (let i = 0; i < rollingAverages.length; i++) {
    sum4 += Math.pow(rollingAverages[i], 4);
  }
  const avg4 = sum4 / Math.max(1, rollingAverages.length);
  const np = Math.round(Math.pow(avg4, 0.25));

  const ftpValid = Math.max(80, ftp || 250);
  const ifVal = parseFloat((np / ftpValid).toFixed(2));
  const durationSec = pointsList.length;
  const tss = Math.round(((durationSec * np * ifVal) / (ftpValid * 3600)) * 100);

  const avgWatts = Math.round(totalWatts / Math.max(1, pointsList.length));
  const vi = avgWatts > 0 ? parseFloat((np / avgWatts).toFixed(2)) : 1.00;
  const avgCadence = Math.round(totalCad / Math.max(1, pointsList.length));
  const avgHr = hrCount > 0 ? Math.round(totalHr / hrCount) : null;
  const ef = avgHr && avgHr > 0 ? parseFloat((np / avgHr).toFixed(2)) : null;

  return {
    np,
    ifVal,
    tss,
    avgWatts,
    maxWatts,
    vi,
    avgCadence,
    maxCadence: maxCad,
    avgHr,
    maxHr: hrCount > 0 ? maxHr : null,
    ef,
  };
}

function buildCurrentRideSnapshot() {
  const avgWatts =
    state.elapsedSeconds > 1
      ? Math.round(state.energyJoules / state.elapsedSeconds)
      : state.elapsedSeconds > 0 ? Math.round(state.watts) : 0;
  const avgWkg = (avgWatts / Math.max(30, state.weightKg)).toFixed(1);
  const kcal = Math.round(state.energyJoules / 1000);
  const primaryGhostText =
    state.ghostMode !== 'off'
      ? `${state.ghostGapSeconds >= 0 ? '+' : '-'}${formatTimeMMSS(state.ghostGapSeconds)} (${Math.round(state.ghostGapMeters)} m)`
      : null;
  const recordGhostText =
    isRecordGhostActive()
      ? `Record: ${state.recordGhostGapSeconds >= 0 ? '+' : '-'}${formatTimeMMSS(Math.abs(state.recordGhostGapSeconds))} (${Math.round(state.recordGhostGapMeters)} m)`
      : null;
  const ghostText = primaryGhostText && recordGhostText
    ? `${primaryGhostText} · ${recordGhostText}`
    : primaryGhostText || recordGhostText || 'Off';

  const historyPoints = recordedPoints.slice();
  const powerSources = [...new Set(historyPoints.map(point => point.powerSource).filter(Boolean))];

  // Jezeli uzytkownik zapisuje krotki przejazd zanim minela 1 sekunda, dodaj biezacy punkt aby eksport TCX dzialal
  if (historyPoints.length === 0 && state.hasRideStarted && state.elapsedSeconds > 0) {
    historyPoints.push({
      isoTime: new Date().toISOString(),
      lat: state.lat,
      lon: state.lon,
      ele: state.currentAltitudeM,
      dist: Math.max(1, state.distanceM),
      speedMps: state.speedMps,
      watts: Math.round(state.watts),
      cadence: state.cadence,
      hr: state.heartRate,
      rideDistanceM: state.rideDistanceM,
      rideElapsedSeconds: state.elapsedSeconds,
    });
  }

  const trainingMetrics = computeTrainingMetrics(recordedPoints, state.ftpWatts);

  // Szczyty mocy MMP (Pmax, 5s, 15s, 1m, 5m, 20m)
  const pMax = Math.max(trainingMetrics.maxWatts || 0, computePeakWatts(1, recordedPoints) || 0, state.elapsedSeconds > 0 ? Math.round(state.watts || 0) : 0);
  const p5s = computePeakWatts(5, recordedPoints);
  const p15s = computePeakWatts(15, recordedPoints);
  const p1m = computePeakWatts(60, recordedPoints);
  const p5m = computePeakWatts(300, recordedPoints);
  const p20m = computePeakWatts(1200, recordedPoints);

  const wkg5s = p5s / Math.max(30, state.weightKg);
  const wkg20m = p20m / Math.max(30, state.weightKg);
  let phenotype = 'All-rounder';
  if (wkg5s >= 13.5 && (p20m > 0 ? p5s / p20m : 0) >= 3.0) {
    phenotype = 'Sprinter (explosive power)';
  } else if (p20m > 0 && p1m / p20m >= 1.7) {
    phenotype = 'Puncheur (short climbs)';
  } else if (wkg20m >= 3.6 && (p20m > 0 ? p5m / p20m : 0) <= 1.25) {
    phenotype = 'Climber / Time trialist (high FTP)';
  }

  // Model metaboliczny (kcal, węglowodany, tłuszcz, nawodnienie)
  const totalKcal = Math.max(1, kcal);
  const energyKj = Math.round(state.energyJoules / 1000);
  const z = zoneSeconds;
  const totalZSec = Math.max(1, z.reduce((a, b) => a + b, 0));
  const carbWeights = [0.40, 0.50, 0.72, 0.88, 0.95, 1.00, 1.00];
  let weightedCarbPct = 0;
  for (let i = 0; i < 7; i++) {
    weightedCarbPct += ((z[i] || 0) / totalZSec) * carbWeights[i];
  }
  weightedCarbPct = THREE.MathUtils.clamp(weightedCarbPct, 0.35, 1.0);
  const carbsKcal = Math.round(totalKcal * weightedCarbPct);
  const fatKcal = Math.max(0, totalKcal - carbsKcal);
  const carbsGrams = Math.round(carbsKcal / 4.1);
  const fatGrams = Math.round(fatKcal / 9.0);
  const sweatLiters = Number(((state.elapsedSeconds / 3600) * 0.75).toFixed(1));

  let tipText = 'Rehydrate and replenish carbohydrates after your ride.';
  if (carbsGrams > 100) {
    tipText = `High carbohydrate use (${carbsGrams} g). Consider a sports drink and a carbohydrate-rich meal.`;
  } else if (carbsGrams > 50) {
    tipText = `Moderate carbohydrate use (${carbsGrams} g). A sports drink or a snack can help replenish glycogen.`;
  } else {
    tipText = `Easy aerobic effort. Water or an electrolyte drink and a regular meal are suitable.`;
  }

  const nutrition = {
    carbsGrams,
    carbsKcal,
    fatGrams,
    fatKcal,
    sweatLiters,
    tipText,
    carbsPct: Math.round(weightedCarbPct * 100),
    fatPct: Math.round((1 - weightedCarbPct) * 100),
  };

  return {
    id: state.rideId,
    startedAtIso: state.rideStartedAt,
    savedAtIso: new Date().toISOString(),
    routeName: state.routeName,
    routeLengthM: state.totalDistanceM,
    rideStartDistanceM: state.rideStartDistanceM,
    distanceM: state.distanceM,
    distanceTravelledM: state.rideDistanceM,
    finished: state.isRideFinished,
    restoredLegacy: state.restoredLegacy,
    powerSource: powerSources.length > 1 ? 'mixed' : powerSources[0],
    recordedSampleCount: recordedPoints.length,
    elevationGainM: Math.round(state.elevationGainM),
    elapsedSeconds: Math.round(state.elapsedSeconds),
    avgWatts,
    avgWkg,
    energyKj,
    np: trainingMetrics.np,
    ifVal: trainingMetrics.ifVal,
    tss: trainingMetrics.tss,
    vi: trainingMetrics.vi,
    ef: trainingMetrics.ef,
    avgCadence: trainingMetrics.avgCadence,
    maxCadence: trainingMetrics.maxCadence,
    avgHr: trainingMetrics.avgHr,
    maxHr: trainingMetrics.maxHr,
    phenotype,
    nutrition,
    kcal,
    ftpWatts: Math.round(state.ftpWatts),
    weightKg: state.weightKg,
    ghostText,
    zoneSeconds: zoneSeconds.map((s) => Math.round(s)),
    peaks: {
      max: pMax,
      s5: p5s,
      s15: p15s,
      m1: p1m,
      m5: p5m,
      m20: p20m,
    },
    points: historyPoints,
  };
}

function historyStatus(text, error = false) {
  const label = document.getElementById('history-status-label');
  label.textContent = text;
  label.classList.toggle('is-error', error);
}

async function historyRouteKey(source, name) {
  if (source.type === 'preset') return `preset:${source.key}`;
  try {
    return `gpx:${source.libraryId || await getGpxContentId(source.text)}`;
  } catch {
    return `gpx-name:${name.trim().normalize().toLocaleLowerCase('pl-PL')}`;
  }
}

function syncRecordGhostPositionToCurrentTime() {
  if (!activeRecordGhost) {
    recordGhostRider.distanceM = state.distanceM;
    recordGhostRider.speedMps = 0;
    recordGhostRider.cadence = 0;
    recordGhostRider.avatar.group.visible = false;
    return;
  }
  if (!state.hasRideStarted && state.elapsedSeconds === 0) {
    state.recordGhostTimeOffsetSec = state.distanceM > 0.5
      ? sampleRecordTimeAtDistance(activeRecordGhost.samples, state.distanceM)
      : 0;
  }
  const sampled = sampleRecordGhostAtTime(
    activeRecordGhost,
    state.elapsedSeconds + (state.recordGhostTimeOffsetSec || 0)
  );
  recordGhostRider.distanceM = THREE.MathUtils.clamp(sampled.distanceM, 0, state.totalDistanceM);
  recordGhostRider.speedMps = isRideRunning(state) ? sampled.speedMps : 0;
  recordGhostRider.watts = sampled.watts || activeRecordGhost.avgWatts || state.ftpWatts;
  recordGhostRider.cadence = isRideRunning(state) ? sampled.cadence : 0;
  recordGhostRider.weightKg = activeRecordGhost.weightKg || state.weightKg;
  const tel = sampleRouteAtDistance(routePoints, recordGhostRider.distanceM);
  recordGhostRider.currentAltitudeM = tel.ele;
  recordGhostRider.currentGradePct = tel.grade;
  recordGhostRider.currentTurnAngleDeg = tel.turnAngleDeg;
  recordGhostRider.currentBankingPct = tel.bankingPct || 0;
}

async function refreshRecordGhostForCurrentRoute(preferredSelection = state.recordGhostSelection) {
  const token = ++recordGhostRefreshToken;
  const selectEl = document.getElementById('record-ghost-select');
  const statusEl = document.getElementById('record-ghost-status');
  const toggleEl = document.getElementById('record-ghost-toggle');
  if (toggleEl) toggleEl.checked = Boolean(state.recordGhost);
  if (selectEl) selectEl.disabled = !state.recordGhost;

  let candidates = [];
  try {
    const routeKey = await historyRouteKey(state.routeSource, state.routeName);
    const rides = await rideHistory.list();
    if (token !== recordGhostRefreshToken) return;
    candidates = filterRouteRecordCandidates(rides, routeKey, state.routeName, state.totalDistanceM);
  } catch {
    if (token !== recordGhostRefreshToken) return;
    candidates = [];
  }

  if (selectEl) {
    const options = [new Option('Fastest time (route record)', 'best')];
    candidates.forEach((ride, idx) => {
      options.push(new Option(formatRecordCandidateOption(ride, state.totalDistanceM, idx === 0), ride.id));
    });
    selectEl.replaceChildren(...options);
    const validSelection = preferredSelection !== 'best' && candidates.some(r => r.id === preferredSelection)
      ? preferredSelection
      : 'best';
    state.recordGhostSelection = validSelection;
    selectEl.value = validSelection;
    selectEl.disabled = !state.recordGhost || candidates.length === 0;
  }

  let loadedGhost = null;
  const orderedToTry = state.recordGhostSelection !== 'best'
    ? [
        ...candidates.filter(r => r.id === state.recordGhostSelection),
        ...candidates.filter(r => r.id !== state.recordGhostSelection),
      ]
    : candidates;

  for (const candidate of orderedToTry) {
    try {
      const fullRide = await rideHistory.get(candidate.id);
      if (token !== recordGhostRefreshToken) return;
      const built = buildRecordGhostSamples(fullRide, state.totalDistanceM);
      if (built) {
        loadedGhost = built;
        break;
      }
    } catch {
      if (token !== recordGhostRefreshToken) return;
    }
  }

  activeRecordGhost = loadedGhost;
  const isBest = !loadedGhost || candidates[0]?.id === loadedGhost.id;
  if (statusEl) {
    statusEl.textContent = formatRecordGhostStatus(loadedGhost, state.recordGhost, isBest);
  }

  syncRecordGhostPositionToCurrentTime();
  updateHUD();
}

async function saveCurrentRideToHistory(snapshot) {
  if (!snapshot?.id || !snapshot.points?.length) return;
  const source = state.routeSource;
  const save = document.getElementById('btn-save-ride-history');
  const isCurrent = () => currentSummarySnapshot === snapshot && !currentSummaryIsHistorical;
  if (isCurrent()) {
    save.disabled = true;
    historyStatus('Saving ride…');
  }
  try {
    const routeKey = await historyRouteKey(source, snapshot.routeName);
    await rideHistory.save({ ...snapshot, routeKey });
  } catch {
    if (isCurrent()) historyStatus('Could not save the ride. Try again or download a FIT or TCX file.', true);
    return;
  } finally {
    if (isCurrent()) save.disabled = false;
  }
  if (isCurrent()) historyStatus('Ride saved in the journal.');
  if (snapshot.finished && state.isRideFinished && state.rideId === snapshot.id) clearFinishedRecovery(snapshot.id);
  if (menuDialog.dataset.menuView === 'journal' && !settingsModal.classList.contains('hidden')) void rideJournalView.refresh();
  void refreshRecordGhostForCurrentRoute();
}

function renderSummaryView(snapshot, isHistorical = false) {
  for (const id of ['btn-finish-fit', 'btn-finish-tcx']) document.getElementById(id).disabled = !snapshot.points?.length;
  const save = document.getElementById('btn-save-ride-history');
  save.hidden = isHistorical;
  save.disabled = !snapshot.id || !snapshot.points?.length;
  document.getElementById('btn-remove-journal-ride').hidden = !isHistorical;
  document.getElementById('btn-finish-close').textContent = isHistorical ? 'Back to journal' : 'Back to menu';
  historyStatus(isHistorical ? 'Ride saved on this device.' : 'Completed rides are saved automatically.');
  currentSummaryIsHistorical = isHistorical;
  document.getElementById('finish-route-name').textContent = isHistorical
    ? `${snapshot.routeName}, ride on ${new Date(snapshot.startedAtIso || snapshot.savedAtIso).toLocaleString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : snapshot.routeName;
  document.getElementById('finish-time').textContent = formatTimeMMSS(snapshot.elapsedSeconds);
  document.getElementById('finish-dist').textContent = `${((snapshot.distanceTravelledM ?? snapshot.distanceM) / 1000)
    .toFixed(2)
    } km / ${Math.round(snapshot.elevationGainM)} m`;
  document.getElementById('finish-watts').textContent = `${snapshot.avgWatts} W (${snapshot.avgWkg} W/kg, ${snapshot.kcal} kcal)`;
  const npTssEl = document.getElementById('finish-np-tss');
  if (npTssEl) {
    const np = snapshot.np || snapshot.avgWatts || 0;
    const ftp = Math.max(80, snapshot.ftpWatts || state.ftpWatts || 250);
    const ifVal = snapshot.ifVal !== undefined ? Number(snapshot.ifVal) : np / ftp;
    const tss = snapshot.tss !== undefined ? snapshot.tss : Math.round(((snapshot.elapsedSeconds * np * ifVal) / (ftp * 3600)) * 100);
    npTssEl.textContent = `NP ${np} W · IF ${formatNumber(ifVal, 2)} · TSS ${tss}`;
  }

  // Zaawansowane wskaźniki (VI, EF, kadencja, HR, fenotyp)
  const viEfEl = document.getElementById('finish-vi-ef');
  if (viEfEl) {
    const vi = formatNumber(snapshot.vi !== undefined ? Number(snapshot.vi) : (snapshot.np && snapshot.avgWatts ? snapshot.np / snapshot.avgWatts : 1), 2);
    const ef = snapshot.ef ? `${formatNumber(Number(snapshot.ef), 2)} W/(bpm)` : '—';
    viEfEl.textContent = `VI ${vi} · EF ${ef}`;
  }

  const cadHrEl = document.getElementById('finish-cadence-hr');
  if (cadHrEl) {
    const avgCad = snapshot.avgCadence ?? (isHistorical ? 0 : Math.round(state.cadence || 0));
    const maxCad = snapshot.maxCadence ?? avgCad;
    const hrText = snapshot.avgHr ? `${snapshot.avgHr} bpm` : 'no heart rate';
    cadHrEl.textContent = `${avgCad} / ${maxCad} rpm · ${hrText}`;
  }

  const phenotypeEl = document.getElementById('finish-phenotype');
  if (phenotypeEl) {
    phenotypeEl.textContent = snapshot.phenotype || 'All-rounder';
  }

  document.getElementById('finish-ghost').textContent = snapshot.ghostText || 'Off';

  const ftpLabel = document.getElementById('summary-ftp-label');
  if (ftpLabel) {
    ftpLabel.textContent = `Based on FTP of ${Math.round(snapshot.ftpWatts || state.ftpWatts)} W`;
  }

  // 7 Stref mocy Coggana
  const zonesMeta = [
    { tag: 'Z1', name: 'Recovery', range: '<55%', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.15)' },
    { tag: 'Z2', name: 'Endurance', range: '56–75%', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' },
    { tag: 'Z3', name: 'Tempo', range: '76–90%', color: '#22C55E', bg: 'rgba(34, 197, 94, 0.15)' },
    { tag: 'Z4', name: 'FTP threshold', range: '91–105%', color: '#EAB308', bg: 'rgba(234, 179, 8, 0.15)' },
    { tag: 'Z5', name: 'VO2max', range: '106–120%', color: '#F97316', bg: 'rgba(249, 115, 22, 0.15)' },
    { tag: 'Z6', name: 'Anaerobic', range: '121–150%', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' },
    { tag: 'Z7', name: 'Neuromuscular', range: '>150%', color: '#A855F7', bg: 'rgba(168, 85, 247, 0.15)' },
  ];
  const zArr = snapshot.zoneSeconds || [0, 0, 0, 0, 0, 0, 0];
  const totalZoneSec = Math.max(1, zArr.reduce((a, b) => a + b, 0));
  const zonesListEl = document.getElementById('finish-zones-list');
  if (zonesListEl) {
    zonesListEl.innerHTML = zonesMeta
      .map((zm, idx) => {
        const sec = zArr[idx] || 0;
        const pct = Math.round((sec / totalZoneSec) * 100);
        return `<div class="zone-bar-row">
          <div class="zone-bar-meta">
            <div class="zone-bar-left">
              <span class="zone-tag" style="background: ${zm.bg}; color: ${zm.color};">${zm.tag}</span>
              <span class="zone-bar-name">${zm.name}</span>
              <span class="zone-bar-range">(${zm.range})</span>
            </div>
            <div class="zone-bar-right">
              <strong class="zone-bar-time">${formatTimeMMSS(sec)}</strong>
              <span class="zone-bar-pct">(${pct}%)</span>
            </div>
          </div>
          <div class="zone-bar-track">
            <div class="zone-bar-fill" style="width: ${pct}%; background: ${zm.color};"></div>
          </div>
        </div>`;
      })
      .join('');
  }

  const weight = Math.max(30, snapshot.weightKg || state.weightKg);
  const peakMap = [
    { id: 'peak-max', wkgId: 'peak-max-wkg', val: snapshot.peaks?.max ?? snapshot.peaks?.s5 ?? 0 },
    { id: 'peak-5s', wkgId: 'peak-5s-wkg', val: snapshot.peaks?.s5 ?? 0 },
    { id: 'peak-15s', wkgId: 'peak-15s-wkg', val: snapshot.peaks?.s15 ?? (snapshot.peaks?.s5 ? snapshot.peaks.s5 * 0.92 : 0) },
    { id: 'peak-1m', wkgId: 'peak-1m-wkg', val: snapshot.peaks?.m1 ?? 0 },
    { id: 'peak-5m', wkgId: 'peak-5m-wkg', val: snapshot.peaks?.m5 ?? 0 },
    { id: 'peak-20m', wkgId: 'peak-20m-wkg', val: snapshot.peaks?.m20 ?? 0 },
  ];
  for (const pk of peakMap) {
    const bestW = Math.round(pk.val);
    const bestWkg = (bestW / weight).toFixed(1);
    const valEl = document.getElementById(pk.id);
    const wkgEl = document.getElementById(pk.wkgId);
    if (valEl) valEl.textContent = `${bestW} W`;
    if (wkgEl) wkgEl.textContent = `${bestWkg} W/kg`;
  }

  // Panel metaboliczny i dietetyczny
  const nut = snapshot.nutrition || {
    carbsGrams: Math.round((snapshot.kcal || 100) * 0.7 / 4.1),
    carbsKcal: Math.round((snapshot.kcal || 100) * 0.7),
    fatGrams: Math.round((snapshot.kcal || 100) * 0.3 / 9.0),
    fatKcal: Math.round((snapshot.kcal || 100) * 0.3),
    sweatLiters: Number((((snapshot.elapsedSeconds || 60) / 3600) * 0.75).toFixed(1)),
    tipText: 'Replenish fluids and carbohydrates after your workout.',
    carbsPct: 70,
    fatPct: 30,
  };
  const totalEnergyEl = document.getElementById('nutrition-total-energy');
  if (totalEnergyEl) {
    totalEnergyEl.textContent = `${snapshot.kcal || 0} kcal / ${Math.round(snapshot.energyKj || (snapshot.kcal ? snapshot.kcal * 0.92 : 0))} kJ`;
  }
  const carbsEl = document.getElementById('nutrition-carbs');
  if (carbsEl) carbsEl.textContent = `${nut.carbsGrams} g`;
  const carbsKcalEl = document.getElementById('nutrition-carbs-kcal');
  if (carbsKcalEl) carbsKcalEl.textContent = `${nut.carbsKcal} kcal (~${nut.carbsPct}%)`;
  const fatEl = document.getElementById('nutrition-fat');
  if (fatEl) fatEl.textContent = `${nut.fatGrams} g`;
  const fatKcalEl = document.getElementById('nutrition-fat-kcal');
  if (fatKcalEl) fatKcalEl.textContent = `${nut.fatKcal} kcal (~${nut.fatPct}%)`;
  const sweatEl = document.getElementById('nutrition-sweat');
  if (sweatEl) sweatEl.textContent = `${nut.sweatLiters} L`;
  const tipEl = document.getElementById('nutrition-tip-text');
  if (tipEl) tipEl.textContent = nut.tipText;

  currentSummarySnapshot = snapshot;
  drawFinishMmpCurve(snapshot.peaks, snapshot.ftpWatts || state.ftpWatts, snapshot.weightKg || state.weightKg);
  drawFinishTelemetryChart(snapshot.points || recordedPoints, snapshot.distanceM || state.distanceM);
}

/**
 * Rysuje krzywa mocy MMP (5s, 15s, 1m, 5m, 20m) z linia odniesienia FTP
 * Zoptymalizowana pod ostrosc HiDPI / Retina oraz pelna czytelnosc bez kolizji etykiet.
 */
function drawFinishMmpCurve(peaks = {}, ftpWatts = 250, weightKg = 75) {
  const canvas = document.getElementById('finish-mmp-canvas');
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.round(rect.width || canvas.clientWidth || 390);
  const cssH = 110;

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext('2d');
  ctx.resetTransform?.();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const w = cssW;
  const h = cssH;

  const padLeft = 32;
  const padRight = 32;
  const padTop = 22;
  const padBot = 22;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBot;

  const ftp = Math.max(80, ftpWatts || 250);

  const durLabels = ['Pmax', '5s', '15s', '1m', '5m', '20m'];
  const values = [
    Math.round(peaks.max || peaks.s5 || 0),
    Math.round(peaks.s5 || 0),
    Math.round(peaks.s15 || (peaks.s5 ? peaks.s5 * 0.92 : 0)),
    Math.round(peaks.m1 || 0),
    Math.round(peaks.m5 || 0),
    Math.round(peaks.m20 || 0),
  ];

  const maxVal = Math.max(ftp * 1.25, ...values, 220);
  const ceiling = Math.ceil(maxVal / 50) * 50;

  const toX = (idx) => padLeft + (idx / (values.length - 1)) * plotW;
  const toY = (val) => h - padBot - (THREE.MathUtils.clamp(val, 0, ceiling) / ceiling) * plotH;

  // 1. Linia odniesienia FTP (przerywana, lesna zielen)
  const ftpY = toY(ftp);
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#38634E';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(padLeft, ftpY);
  ctx.lineTo(w - padRight, ftpY);
  ctx.stroke();

  // Etykieta FTP po LEWEJ stronie - calkowity brak kolizji z punktem 20m po prawej!
  ctx.setLineDash([]);
  const ftpText = `FTP ${ftp} W`;
  ctx.font = '700 11px "Segoe UI", sans-serif';
  const textMetrics = ctx.measureText(ftpText);
  const badgeW = textMetrics.width + 10;
  const badgeH = 16;
  const badgeX = padLeft + 6;
  const badgeY = ftpY > padTop + badgeH + 4 ? ftpY - badgeH - 3 : ftpY + 4;

  ctx.fillStyle = 'rgba(35, 76, 59, 0.12)';
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
    ctx.fill();
  } else {
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
  }

  ctx.fillStyle = '#172B23';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(ftpText, badgeX + 5, badgeY + badgeH / 2);
  ctx.restore();

  // 2. Gradient i linia krzywej MMP
  if (values.some((v) => v > 0)) {
    const grad = ctx.createLinearGradient(0, padTop, 0, h - padBot);
    grad.addColorStop(0, 'rgba(217, 119, 6, 0.30)');
    grad.addColorStop(1, 'rgba(217, 119, 6, 0.02)');

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < values.length; i++) {
      ctx.lineTo(toX(i), toY(values[i]));
    }
    ctx.lineTo(toX(values.length - 1), h - padBot);
    ctx.lineTo(toX(0), h - padBot);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Glowna linia wykresu (nasycony bursztyn kolarski o wyrazistym kontrascie)
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < values.length; i++) {
      ctx.lineTo(toX(i), toY(values[i]));
    }
    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Punkty pomiarowe z wyrazistymi etykietami watow
    for (let i = 0; i < values.length; i++) {
      const px = toX(i);
      const py = toY(values[i]);

      // Zewnetrzny pierscien punktu
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#D97706';
      ctx.stroke();

      // Wewnetrzny rdzen
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#234C3B';
      ctx.fill();

      // Etykieta watow nad punktem (duza, ostra czcionka 11px)
      ctx.fillStyle = '#172B23';
      ctx.font = '700 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const textY = py < padTop + 14 ? py + 16 : py - 6;
      ctx.fillText(`${values[i]} W`, px, textY);
    }
  }

  // 3. Etykiety osi czasu (Pmax, 5s, 15s, 1m, 5m, 20m)
  ctx.fillStyle = '#4B5A51';
  ctx.font = '600 11px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let i = 0; i < durLabels.length; i++) {
    ctx.fillText(durLabels[i], toX(i), h - 3);
  }
}
if (typeof window !== 'undefined') {
  window.drawFinishMmpCurve = drawFinishMmpCurve;
}

/**
 * Rysuje wykres telemetryczny mocy (W), tetna (BPM), predkosci (km/h) i profilu trasy (+m) w oknie mety
 */
function drawFinishTelemetryChart(points, totalDistM) {
  const canvas = document.getElementById('finish-telemetry-canvas');
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.round(rect.width || canvas.clientWidth || 810);
  const cssH = 150;

  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext('2d');
  ctx.resetTransform?.();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const w = cssW;
  const h = cssH;
  ctx.clearRect(0, 0, w, h);

  if (!points || points.length < 2) {
    ctx.fillStyle = brandColors.lightMuted;
    ctx.font = '500 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Ride for a few seconds to see the chart.', w / 2, h / 2);
    return;
  }

  const padLeft = 46;
  const padRight = 46;
  const padTop = 18;
  const padBot = 24;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBot;

  let maxW = 200;
  let minEle = Infinity;
  let maxEle = -Infinity;
  const maxDist = Math.max(10, totalDistM || points[points.length - 1].dist || 1000);

  for (const p of points) {
    if (p.watts > maxW) maxW = p.watts;
    if (p.ele < minEle) minEle = p.ele;
    if (p.ele > maxEle) maxEle = p.ele;
  }
  maxW = Math.ceil((maxW * 1.1) / 50) * 50;
  const eleSpan = Math.max(25, maxEle - minEle);

  const toX = (dist) => padLeft + (dist / maxDist) * plotW;
  const toYWatts = (watts) => h - padBot - (THREE.MathUtils.clamp(watts, 0, maxW) / maxW) * plotH;
  const toYEle = (ele) => h - padBot - ((ele - minEle) / eleSpan) * (plotH * 0.75);
  const toYHr = (hr) => h - padBot - (THREE.MathUtils.clamp(hr - 60, 0, 140) / 140) * plotH;

  // 1. Tlo siatki i osi mocy (W)
  ctx.strokeStyle = 'rgba(32, 55, 44, 0.08)';
  ctx.lineWidth = 1;
  const stepWatts = maxW > 600 ? 200 : 100;
  for (let gridW = stepWatts; gridW <= maxW; gridW += stepWatts) {
    const gy = toYWatts(gridW);
    ctx.beginPath();
    ctx.moveTo(padLeft, gy);
    ctx.lineTo(w - padRight, gy);
    ctx.stroke();

    ctx.fillStyle = brandColors.lightMuted;
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${gridW}W`, padLeft - 6, gy + 3.5);
  }

  // 2. Sylwetka profilu wysokosci w tle (Forest green)
  ctx.beginPath();
  ctx.moveTo(padLeft, h - padBot);
  for (let i = 0; i < points.length; i++) {
    const px = toX(points[i].dist);
    const py = toYEle(points[i].ele);
    ctx.lineTo(px, py);
  }
  ctx.lineTo(w - padRight, h - padBot);
  ctx.closePath();
  ctx.fillStyle = 'rgba(85, 115, 71, 0.16)';
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const px = toX(points[i].dist);
    const py = toYEle(points[i].ele);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = 'rgba(85, 115, 71, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 3. Linia mocy (Yellow)
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const px = toX(points[i].dist);
    const py = toYWatts(points[i].watts);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = brandColors.yellow;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 4. Linia tetna (Red - jesli tetno wystepuje)
  const hasHr = points.some((p) => p.hr && p.hr > 40);
  if (hasHr) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < points.length; i++) {
      if (points[i].hr && points[i].hr > 30) {
        const px = toX(points[i].dist);
        const py = toYHr(points[i].hr);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
    }
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // 5. Linia predkosci (Cyan)
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const px = toX(points[i].dist);
    const kmh = (points[i].speedMps || 0) * 3.6;
    const py = h - padBot - (THREE.MathUtils.clamp(kmh, 0, 80) / 80) * plotH;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // 6. Etykiety osi X (kilometry)
  ctx.fillStyle = brandColors.lightMuted;
  ctx.font = '10px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  const totalKm = maxDist / 1000;
  const stepKm = totalKm > 20 ? 5 : totalKm > 8 ? 2 : 1;
  for (let k = 0; k <= totalKm; k += stepKm) {
    const kx = toX(k * 1000);
    ctx.fillText(`${k} km`, kx, h - 6);
  }

  // 7. Interaktywny kursor hover na wykresie mety
  if (finishChartHoverRatio !== null && finishChartHoverRatio >= 0 && finishChartHoverRatio <= 1) {
    const hoverDist = finishChartHoverRatio * maxDist;
    let closestPt = points[0];
    let minD = Infinity;
    for (const p of points) {
      const d = Math.abs(p.dist - hoverDist);
      if (d < minD) {
        minD = d;
        closestPt = p;
      }
    }

    const hx = toX(closestPt.dist);
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = brandColors.forest;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx, padTop);
    ctx.lineTo(hx, h - padBot);
    ctx.stroke();
    ctx.restore();

    const tag = `${formatNumber(closestPt.dist / 1000)} km · ${Math.round(closestPt.watts)} W${closestPt.hr ? ` · ${closestPt.hr} bpm` : ''} · ${formatNumber((closestPt.speedMps || 0) * 3.6)} km/h`;
    ctx.font = '600 11px "Segoe UI", sans-serif';
    const tagW = ctx.measureText(tag).width;
    const boxX = THREE.MathUtils.clamp(hx - tagW / 2 - 8, padLeft, w - padRight - tagW - 16);
    const boxY = padTop - 12;

    ctx.fillStyle = brandColors.forest;
    ctx.fillRect(boxX, boxY, tagW + 16, 20);
    ctx.strokeStyle = brandColors.yellow;
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, tagW + 16, 20);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, boxX + 8, boxY + 10);
  }
}

/**
 * Pokazuje modal podsumowania treningu (po ukonczeniu trasy lub na zadanie z Menu)
 */
function showFinishModal(autoSaveOnFinish = false, finishSession = true) {
  // Zatrzymanie kolarza i fizyki jazdy po zakończeniu treningu
  if (finishSession) {
    setSessionStatus(state,'finished');
    trainerController.neutralizeResistance();
    state.speedMps = 0;
    state.cadence = 0;
    if (usesKeyboardPower()) setSimulationPower(0);
    if (state.isWorkoutRunning) stopWorkout();
    diagnostics.session('finished');
  }

  const currentSnapshot = finishedRideSnapshot || buildCurrentRideSnapshot();
  if (finishSession) finishedRideSnapshot = currentSnapshot;
  openSummaryDialog(currentSnapshot, false);
  if (autoSaveOnFinish) void saveCurrentRideToHistory(currentSnapshot);
  updateHUD();
}

function openSummaryDialog(snapshot, historical) {
  summaryReturnView = historical ? 'journal' : 'home';
  const modal = document.getElementById('finish-modal');
  const dialog = modal.querySelector('[role="dialog"]');
  modal.classList.remove('hidden');
  dialog.scrollTop = 0;
  renderSummaryView(snapshot, historical);
  dialog.tabIndex = -1;
  dialog.focus();
}

// ============================================================================
// 7. GLOWNA PETLA SYMULACJI 3D
// ============================================================================
const clock = new THREE.Clock();
const upVec = new THREE.Vector3(0, 1, 0);
const frameVectors = Object.fromEntries(['rider','before','after','tangent','right','lane','look','ghost','ghostTangent','ghostRight','ghostLane','bot','botTangent','botRight','botLane','camOffset','camPosition','camLook','pov'].map(key=>[key,new THREE.Vector3()]));

let lastGamepadDown = false;
let lastGamepadUp = false;

function checkGamepadShifters() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
  const gamepads = navigator.getGamepads();
  if (!gamepads) return;
  for (let i = 0; i < gamepads.length; i++) {
    const gp = gamepads[i];
    if (!gp) continue;
    // Bumper L1 (btn 4) or D-Pad Down (btn 13) or Left (btn 14) -> Bieg w dół
    const down = Boolean(gp.buttons[4]?.pressed || gp.buttons[13]?.pressed || gp.buttons[14]?.pressed);
    // Bumper R1 (btn 5) or D-Pad Up (btn 12) or Right (btn 15) -> Bieg w górę
    const up = Boolean(gp.buttons[5]?.pressed || gp.buttons[12]?.pressed || gp.buttons[15]?.pressed);

    if (down && !lastGamepadDown) {
      changeVirtualGear(-1);
    }
    if (up && !lastGamepadUp) {
      changeVirtualGear(1);
    }
    lastGamepadDown = down;
    lastGamepadUp = up;
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (state.trainerWasRequired && !state.bleConnected && !state.requiresTrainerReconnect) refreshTrainerIndicator();
  const frameDelta = clock.getDelta();
  diagnostics.frame(frameDelta);
  adaptiveGraphics?.frame(frameDelta,isRideRunning(state)&&!document.hidden&&settingsModal.classList.contains('hidden'));
  const dt = Math.min(frameDelta, 0.1);

  // Sprawdz kontrolery gier / bezprzewodowe przyciski HID
  checkGamepadShifters();

  // Pomiar FPS
  frameCount++;
  fpsAccumTime += frameDelta;
  if (fpsAccumTime >= 0.5) {
    currentFps = Math.round(frameCount / fpsAccumTime);
    frameCount = 0;
    fpsAccumTime = 0;
  }

  if (routeCurve) {
    // Wygładzanie mocy z wyborem okna (1s chwilowa / 3s zalecana / 5s stabilna)
    const smoothSec = Number(state.powerSmoothingSec || 3);
    const lerpAlpha = smoothSec === 1
      ? Math.min(1, dt * 7.5)
      : smoothSec === 5
      ? Math.min(1, dt * 0.9)
      : Math.min(1, dt * 1.8);
    state.smoothedWatts = THREE.MathUtils.lerp(state.smoothedWatts, state.watts, lerpAlpha);

    // 1. Sprawdz czy gracz jedzie w tunelu aerodynamicznym (0.8m - 12m za Pacerem)
    let maxDraftDiscount = 0;
    let closestLeadPacer = null;
    for (const bot of aiPacers) {
      const gap = bot.distanceM - state.distanceM;
      if (gap > 0.8 && gap < 12.0 && state.speedMps > 3.0) {
        // Płynna krzywa aerodynamiczna: od 35% tuż za kołem do 0% przy 12m
        const discount = 0.35 * Math.max(0, 1.0 - (gap - 0.8) / 11.2);
        if (discount > maxDraftDiscount) {
          maxDraftDiscount = discount;
          closestLeadPacer = bot;
        }
      }
    }
    state.isDrafting = maxDraftDiscount > 0.05;
    state.draftDiscountPct = Math.round(maxDraftDiscount * 100);
    const draftFactor = 1.0 - maxDraftDiscount;

    updateDraftingRibbon(closestLeadPacer, dt);

    // 2. Fizyka gracza (zatrzymana, jeśli trening został zakończony)
    const waitingForSimulationPower = usesKeyboardPower() && state.rideDistanceM === 0 && state.watts === 0;
    if (isRideRunning(state) && !waitingForSimulationPower) {
      const before = state.distanceM;
      let reachedFinish = false;
      stepRiderPhysics(state, routePoints, state.totalDistanceM, dt, draftFactor, () => { reachedFinish = true; });
      state.rideDistanceM += Math.max(0, state.distanceM - before);
      if (reachedFinish) showFinishModal(true);
    } else {
      state.speedMps = 0;
      if (usesKeyboardPower()) state.cadence = 0;
      if (state.isRideFinished && usesKeyboardPower()) {
        state.watts = 0;
      }
    }

    if (trainerController && trainerController.isSpindownActive) {
      trainerController.updateSpindownProgress(state.speedMps * 3.6);
    }
    // Sprawdzenie czy kolarz znajduje sie wewnatrz przelotowego tunelu skalnego 3D
    state.isInsideTunnel =
      Array.isArray(state.tunnelIntervals) &&
      state.tunnelIntervals.some(
        (t) => state.distanceM >= t.startDist && state.distanceM <= t.endDist
      );

    // Dźwięki syntetyczne jazdy wyłączone (kolarz korzysta z naturalnego dźwięku własnego roweru i trenażera)
    if (isRideRunning(state) && state.speedMps > 0.1) {
      state.elapsedSeconds += dt;
      if (state.isWorkoutRunning && state.activeWorkout) {
        state.workoutElapsedSec += dt;
      }
      state.energyJoules += state.watts * dt;

      // Akumulacja czasu w strefie mocy Coggana Z1-Z7
      const pctFtp = (state.smoothedWatts / Math.max(80, state.ftpWatts)) * 100;
      const zIdx =
        pctFtp < 55 ? 0 : pctFtp <= 75 ? 1 : pctFtp <= 90 ? 2 : pctFtp <= 105 ? 3 : pctFtp <= 120 ? 4 : pctFtp <= 150 ? 5 : 6;
      zoneSeconds[zIdx] += dt;

      recordTimer += dt;
      if (recordTimer >= 1.0) {
        recordTimer = 0;
        recordedPoints.push({
          isoTime: new Date().toISOString(),
          lat: state.lat,
          lon: state.lon,
          ele: state.currentAltitudeM,
          dist: state.distanceM,
          speedMps: state.speedMps,
          watts: Math.round(state.watts),
          cadence: state.cadence,
          hr: state.heartRate,
          rideDistanceM: state.rideDistanceM,
          rideElapsedSeconds: state.elapsedSeconds,
          powerSource: usesKeyboardPower() ? 'simulation' : state.lastPowerSource === 'virtual-power' ? 'virtual-power'
            : state.lastPowerSource === 'trainer' || state.lastPowerSource === 'power-meter' ? 'device' : undefined,
        });
      }
    }

    updateTrainerControl();
    if (isRideRunning(state)) {
      recoveryTimer += dt;
      if (recoveryTimer >= 5) { recoveryTimer = 0; persistRideRecovery(); }
    }

    // 3. Pozycja 3D gracza na szosie + aktualizacja okna widocznosci trasy (brak nakladania sie petli i serpentyn!)
    if (worldVisibleUpdater) {
      worldVisibleUpdater(state.distanceM);
    }

    const u = THREE.MathUtils.clamp(state.distanceM / state.totalDistanceM, 0, 0.9995);
    const riderPos = routeCurve.getPointAt(u,frameVectors.rider);
    const du = Math.min(0.002, 3.5 / Math.max(100, state.totalDistanceM));
    const pPrev = routeCurve.getPointAt(Math.max(0, u - du),frameVectors.before);
    const pNext = routeCurve.getPointAt(Math.min(1, u + du),frameVectors.after);
    const tangent = frameVectors.tangent.subVectors(pNext,pPrev).normalize();
    const right = frameVectors.right.crossVectors(tangent, upVec).normalize();

    const playerBankY = -(state.currentBankingPct || 0) * 1.1;
    const playerLanePos = frameVectors.lane.copy(riderPos).addScaledVector(right, 1.1);
    playerLanePos.y += playerBankY;
    playerAvatar.group.position.copy(playerLanePos);
    playerAvatar.group.lookAt(frameVectors.look.copy(playerLanePos).add(tangent));

    // Balance against the actual displayed curve, with the correct inward sign.
    applyRoadLean(playerAvatar.group, state, routeCurve, u, state.speedMps, dt);

    animateCyclistMesh(playerAvatar, state.speedMps, state.cadence, dt, {
      gradePct: state.currentGradePct,
      turnAngleDeg: state.currentTurnAngleDeg,
      watts: state.smoothedWatts,
      rawWatts: state.watts,
      ftpWatts: state.ftpWatts,
      effortActive: isRideRunning(state),
      roadLeanApplied: true,
    });
    state.isSprinting = playerAvatar.isSprinting;

    // 4. Aktualizacja Ghost Ridera (Wirtualnego Rywala)
    if (state.ghostMode === 'off') {
      ghostRider.avatar.group.visible = false;
    } else {
      ghostRider.weightKg = state.weightKg;

      if (state.ghostMode === 'gpx') {
        const prevGhostDist = ghostRider.distanceM;
        ghostRider.distanceM = sampleDistanceAtGhostTime(routePoints, state.elapsedSeconds + state.ghostTimeOffsetSec);
        ghostRider.speedMps =
          dt > 0.001 ? Math.max(0, (ghostRider.distanceM - prevGhostDist) / dt) : 0;
        const gTel = sampleRouteAtDistance(routePoints, ghostRider.distanceM);
        ghostRider.currentAltitudeM = gTel.ele;
        ghostRider.currentGradePct = gTel.grade;
        ghostRider.currentTurnAngleDeg = gTel.turnAngleDeg;
        ghostRider.watts = Math.round(state.ftpWatts * 0.9);
      } else {
        // Tryb FTP (100% FTP) lub Tempo (85% FTP)
        ghostRider.watts =
          state.ghostMode === 'tempo' ? Math.round(state.ftpWatts * 0.85) : state.ftpWatts;
        if (state.speedMps > 0.1) {
          stepRiderPhysics(ghostRider, routePoints, state.totalDistanceM, dt, 1.0);
        }
      }

      const ghostDistDiff = ghostRider.distanceM - state.distanceM;
      ghostRider.avatar.group.visible = ghostDistDiff >= -260 && ghostDistDiff <= 2600;

      const gu = THREE.MathUtils.clamp(ghostRider.distanceM / state.totalDistanceM, 0, 0.9995);
      const gPos = routeCurve.getPointAt(gu,frameVectors.ghost);
      const gTan = routeCurve.getTangentAt(gu,frameVectors.ghostTangent).normalize();
      const gRight = frameVectors.ghostRight.crossVectors(gTan, upVec).normalize();

      const ghostBankY = -(ghostRider.currentBankingPct || 0) * ghostRider.laneOffset;
      const ghostLanePos = frameVectors.ghostLane.copy(gPos).addScaledVector(gRight, ghostRider.laneOffset);
      ghostLanePos.y += ghostBankY;
      ghostRider.avatar.group.position.copy(ghostLanePos);
      ghostRider.avatar.group.lookAt(frameVectors.look.copy(ghostLanePos).add(gTan));
      applyRoadLean(ghostRider.avatar.group, ghostRider, routeCurve, gu, ghostRider.speedMps, dt);
      animateCyclistMesh(ghostRider.avatar, ghostRider.speedMps, ghostRider.cadence, dt, {
        gradePct: ghostRider.currentGradePct,
        turnAngleDeg: ghostRider.currentTurnAngleDeg,
        watts: ghostRider.watts,
        ftpWatts: state.ftpWatts,
        roadLeanApplied: true,
      });
    }

    // 4b. Aktualizacja drugiego Ducha (Własny rekord z Dziennika postępów)
    if (!isRecordGhostActive()) {
      recordGhostRider.avatar.group.visible = false;
    } else {
      const sampled = sampleRecordGhostAtTime(
        activeRecordGhost,
        state.elapsedSeconds + (state.recordGhostTimeOffsetSec || 0)
      );
      recordGhostRider.distanceM = THREE.MathUtils.clamp(sampled.distanceM, 0, state.totalDistanceM);
      recordGhostRider.speedMps = isRideRunning(state) ? sampled.speedMps : 0;
      recordGhostRider.watts = sampled.watts || activeRecordGhost.avgWatts || state.ftpWatts;
      recordGhostRider.cadence = isRideRunning(state) ? sampled.cadence : 0;
      recordGhostRider.weightKg = activeRecordGhost.weightKg || state.weightKg;

      const rgTel = sampleRouteAtDistance(routePoints, recordGhostRider.distanceM);
      recordGhostRider.currentAltitudeM = rgTel.ele;
      recordGhostRider.currentGradePct = rgTel.grade;
      recordGhostRider.currentTurnAngleDeg = rgTel.turnAngleDeg;
      recordGhostRider.currentBankingPct = rgTel.bankingPct || 0;

      const recDistDiff = recordGhostRider.distanceM - state.distanceM;
      recordGhostRider.avatar.group.visible = recDistDiff >= -260 && recDistDiff <= 2600;

      const rgu = THREE.MathUtils.clamp(recordGhostRider.distanceM / state.totalDistanceM, 0, 0.9995);
      const rgPos = routeCurve.getPointAt(rgu, frameVectors.ghost);
      const rgTan = routeCurve.getTangentAt(rgu, frameVectors.ghostTangent).normalize();
      const rgRight = frameVectors.ghostRight.crossVectors(rgTan, upVec).normalize();

      const recBankY = -(recordGhostRider.currentBankingPct || 0) * recordGhostRider.laneOffset;
      const recLanePos = frameVectors.ghostLane.copy(rgPos).addScaledVector(rgRight, recordGhostRider.laneOffset);
      recLanePos.y += recBankY;
      recordGhostRider.avatar.group.position.copy(recLanePos);
      recordGhostRider.avatar.group.lookAt(frameVectors.look.copy(recLanePos).add(rgTan));
      applyRoadLean(recordGhostRider.avatar.group, recordGhostRider, routeCurve, rgu, recordGhostRider.speedMps, dt);
      animateCyclistMesh(recordGhostRider.avatar, recordGhostRider.speedMps, recordGhostRider.cadence, dt, {
        gradePct: recordGhostRider.currentGradePct,
        turnAngleDeg: recordGhostRider.currentTurnAngleDeg,
        watts: recordGhostRider.watts,
        ftpWatts: state.ftpWatts,
        roadLeanApplied: true,
      });
    }

    // 5. Fizyka i pozycja 3D Pacerow (AI Bots) z dynamicznym zachowaniem taktycznym
    for (let pIdx = 0; pIdx < aiPacers.length; pIdx++) {
      const bot = aiPacers[pIdx];

      // Dynamiczne zachowanie Pacerów:
      if (pIdx === 3) {
        // Pacer A (Góral / Climber): atakuje na wzniesieniach (>1.5%), odpuszcza na zjazdach
        if (bot.currentGradePct > 1.5) {
          const climbBoost = Math.min(0.35, (bot.currentGradePct - 1.5) * 0.045);
          bot.watts = Math.round(285 * (1.0 + climbBoost));
        } else if (bot.currentGradePct < -2.0) {
          bot.watts = Math.round(285 * 0.75);
        } else {
          bot.watts = 285;
        }
      } else if (pIdx === 1) {
        // Pacer C (Lider grupy / Group Pacer): dostosowuje tempo, gdy gracz siedzi na kole
        const gap = bot.distanceM - state.distanceM;
        if (gap > 0.8 && gap < 12.0) {
          // Gracz jedzie w tunelu - Pacer C trzyma równe, mocne tempo pociągowe
          bot.watts = 188 + Math.round(Math.sin(state.elapsedSeconds * 0.2) * 5);
        } else if (gap >= 12.0 && gap < 35.0) {
          // Gracz nieco zostaje z tyłu - Pacer C delikatnie zwalnia (-10%), by poczekać na grupę
          bot.watts = Math.round(188 * 0.90);
        } else if (gap < -2.0) {
          // Gracz wyprzedził Pacera C - Pacer C podkręca waty, by nie odpaść
          bot.watts = Math.round(188 * 1.15);
        } else {
          bot.watts = 188;
        }
      }

      if (isRideRunning(state)) stepRiderPhysics(bot, routePoints, state.totalDistanceM, dt, 1.0);
      const botDistDiff = bot.distanceM - state.distanceM;
      bot.avatar.group.visible = botDistDiff >= -260 && botDistDiff <= 2600;

      const bu = THREE.MathUtils.clamp(bot.distanceM / state.totalDistanceM, 0, 0.9995);
      const bPos = routeCurve.getPointAt(bu,frameVectors.bot);
      const bTan = routeCurve.getTangentAt(bu,frameVectors.botTangent).normalize();
      const bRight = frameVectors.botRight.crossVectors(bTan, upVec).normalize();

      const botBankY = -(bot.currentBankingPct || 0) * bot.laneOffset;
      const botLanePos = frameVectors.botLane.copy(bPos).addScaledVector(bRight, bot.laneOffset);
      botLanePos.y += botBankY;
      bot.avatar.group.position.copy(botLanePos);
      bot.avatar.group.lookAt(frameVectors.look.copy(botLanePos).add(bTan));
      applyRoadLean(bot.avatar.group, bot, routeCurve, bu, bot.speedMps, dt);
      animateCyclistMesh(bot.avatar, bot.speedMps, bot.cadence, dt, {
        gradePct: bot.currentGradePct,
        turnAngleDeg: bot.currentTurnAngleDeg,
        watts: bot.watts,
        ftpWatts: bot.ftpWatts || 250,
        roadLeanApplied: true,
      });
    }

    // 6. Oswietlenie podazajace za graczem i dynamiczna pora dnia
    if (state.timeOfDay === 'dynamic') {
      updateDynamicTimeOfDay();
    }

    if (state.quality !== 'eco') {
      const sunHeight = state.timeOfDay === 'sunset' ? 48 : 150;
      sunLight.position.set(playerLanePos.x + 90, playerLanePos.y + sunHeight, playerLanePos.z + 70);
      sunLight.target.position.copy(playerLanePos);
      sunLight.target.updateMatrixWorld();
    }

    const nowSec = performance.now() * 0.001;
    for (const b of worldAnimated.balloons) {
      b.group.position.y = b.baseY + Math.sin(nowSec * 0.8 + b.phase) * 2.2;
      b.group.rotation.y = nowSec * 0.15 + b.phase;
    }
    animateSpectators(worldAnimated.spectators, nowSec);
    if (worldAnimated.windTurbines) {
      for (const wt of worldAnimated.windTurbines) {
        wt.rotor.rotation.z -= dt * wt.speed;
      }
    }
    if (worldAnimated.boats) {
      for (const boat of worldAnimated.boats) {
        boat.group.position.y = boat.baseY + Math.sin(nowSec * 2.1 + boat.phase) * 0.05;
        boat.group.rotation.z = Math.sin(nowSec * 1.6 + boat.phase) * 0.06;
      }
    }

    // 7. Kamera (3. Osoba Zwift / 1. Osoba POV / Dron)
    if (state.cameraMode === 0) {
      playerAvatar.group.visible = true;
      const camOffset = frameVectors.camOffset.copy(tangent).multiplyScalar(-4.8);
      camOffset.y += 2.25;
      const desiredCamPos = frameVectors.camPosition.copy(playerLanePos).add(camOffset);
      camera.position.lerp(desiredCamPos, 0.14);
      const camLook = frameVectors.camLook.copy(playerLanePos).addScaledVector(tangent,6.5);
      camLook.y += 1.1;
      camera.lookAt(camLook);
    } else if (state.cameraMode === 1) {
      playerAvatar.group.visible = false;
      const povPos = frameVectors.pov.copy(playerLanePos).addScaledVector(tangent, 0.35);
      povPos.y += 1.38;
      camera.position.copy(povPos);
      camera.lookAt(frameVectors.look.copy(povPos).addScaledVector(tangent, 16.0));
    } else {
      playerAvatar.group.visible = true;
      const angle = performance.now() * 0.00025;
      camera.position.set(
        playerLanePos.x + Math.cos(angle) * 18,
        playerLanePos.y + 11,
        playerLanePos.z + Math.sin(angle) * 18
      );
      camera.lookAt(playerLanePos.x, playerLanePos.y + 1.2, playerLanePos.z);
    }

    // Dynamiczny FOV kamery na szybkich zjazdach (>45 km/h) oraz podczas sprintu na stojąco
    const speedKmh = state.speedMps * 3.6;
    const speedFovBoost = isRideRunning(state) ? THREE.MathUtils.clamp((speedKmh - 45) * 0.22, 0, 6.5) : 0;
    const sprintFovBoost = isRideRunning(state) && state.isSprinting ? 3.5 : 0;
    const targetFov = THREE.MathUtils.clamp(baseCameraFov + speedFovBoost + sprintFovBoost, 50, 92);
    if (Math.abs(camera.fov - targetFov) > 0.02) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 4.5));
      camera.updateProjectionMatrix();
    }

    // Odswiezanie HUD co 100ms (oszczednosc CPU na laptopach)
    hudUpdateTimer += dt;
    if (hudUpdateTimer >= 0.1) {
      hudUpdateTimer = 0;
      updateHUD();
    }
  }

  skyEnvironment.update(camera, performance.now() * 0.001, state.speedMps * 3.6, Boolean(state.isSprinting));
  renderer.render(scene, camera);
  crowdAmbience.update({ distanceM: state.distanceM, centerM: crowdCenterM,
    active: isRideRunning(state) && settingsModal.classList.contains('hidden'), visible: !document.hidden });
}

// ============================================================================
// 8. OBSLUGA ZDARZEN UI, MENU GLOWNEGO, KART TRAS, PRZERZUTEK I .GPX
// ============================================================================
const presetTitles = {
  mountain: 'Alpine Pass',
  alpedhuez: "Alpe d'Huez (Tour de France)",
  switchbacks: 'Winding Switchbacks',
  rolling: 'Interval Valley',
  flat: 'Flat Time Trial',
};

function highlightActiveRouteCard(cardId) {
  document.querySelectorAll('.route-card').forEach((card) => {
    const selected = card.id === cardId;
    card.classList.toggle('active', selected);
    if (card.matches('button')) card.setAttribute('aria-pressed', String(selected));
    const label = card.querySelector('.route-selection span');
    if (label) label.textContent = selected ? 'Selected route' : 'Choose a route';
  });
}

function libraryLocked() { return state.hasRideStarted&&!state.isRideFinished||state.isDeviceTestActive||state.deviceTestNeedsNeutral; }

function updateGPXLabel(name) {
  document.getElementById('gpx-card-filename').textContent=`${name} · ${(state.totalDistanceM/1000).toFixed(1)} km`;
  document.getElementById('gpx-card-filename').style.color='var(--or-forest)';
}

async function saveCurrentLibraryRoute() {
  if(state.routeSource.type!=='gpx')throw Error('Import a GPX route first.');
  const source=state.routeSource,name=state.routeName;
  const record=await routeLibrary.save(source.text,name,{distanceM:state.totalDistanceM,ascentM:calculateCumulativeAscent(routePoints),climbs:routeClimbs.length,points:routePoints.length});
  if(state.routeSource===source){
    source.libraryId=record.id;
    if(!libraryLocked()){state.routeName=record.name;updateGPXLabel(record.name);document.getElementById('active-route-pill').textContent=`Selected: ${record.name}`;updateHUD();}
  }
  return record;
}

async function pickLibraryRoute(row) {
  if(libraryLocked())throw Error('Finish the current ride before switching routes.');
  const record=await routeLibrary.get(row.id);
  if(!record)throw Error('This route file is missing. Import the GPX file again.');
  const points=parseGPXToRoute(record.text);
  if(libraryLocked())throw Error('Finish the current ride before switching routes.');
  loadRouteIntoWorld(points,record.name,{type:'gpx',text:record.text,libraryId:record.id});
  highlightActiveRouteCard('card-route-gpx');updateGPXLabel(record.name);await routeLibrary.update(record.id,{used:true});
}

function handleGPXFile(file) {
  if (!file) return;
  if(state.hasRideStarted&&!state.isRideFinished){storageMessage('Finish the current ride before switching routes.',true);return;}
  const reader = new FileReader();
  reader.onload = async (ev) => {
    if(libraryLocked()){routeLibraryView.message('Finish the ride or resistance test, then import the GPX file again.',true);return;}
    try {
      const parsed = parseGPXToRoute(ev.target.result);
      loadRouteIntoWorld(parsed, file.name, {type:'gpx',text:ev.target.result});
      highlightActiveRouteCard('card-route-gpx');
      updateGPXLabel(file.name);
      try{await saveCurrentLibraryRoute();await routeLibraryView.refresh(false);routeLibraryView.message('Route saved to the library.');}
      catch(error){routeLibraryView.message(`Route loaded. It could not be saved to the library. ${error.message}`,true);}
    } catch (err) {
      alert(err.message);
    }
  };
  reader.onerror=()=>routeLibraryView.message('Could not read this GPX file. Choose it again.',true);
  reader.readAsText(file);
}

document.getElementById('gpx-input').addEventListener('change', (e) => {
  handleGPXFile(e.target.files[0]);
  e.target.value='';
});

document.querySelectorAll('label[for="gpx-input"]').forEach((label) => {
  label.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      document.getElementById('gpx-input').click();
    }
  });
});

// Przeciaganie pliku .GPX bezposrednio na okno gry
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleGPXFile(e.dataTransfer.files[0]);
  }
});

// Klikniecie na karty tras testowych w Menu Glownym
document.querySelectorAll('.route-card[data-preset]').forEach((card) => {
  card.addEventListener('click', () => {
    const preset = card.getAttribute('data-preset');
    highlightActiveRouteCard(card.id);
    loadRouteIntoWorld(generatePresetRoute(preset), presetTitles[preset] || preset, {type:'preset',key:preset});
  });
});

// Suwak wyboru kilometra startowego oraz klikniecie w podglad profilu w Menu Glownym
const startKmSlider = document.getElementById('start-km-slider');
const startKmLabel = document.getElementById('start-km-label');

function updateStartOffsetFromDistance(distM) {
  if(state.hasRideStarted&&!state.isRideFinished)return;
  const clampedDist = THREE.MathUtils.clamp(distM, 0, Math.max(0, state.totalDistanceM - 5));
  const km = clampedDist / 1000;
  teleportToDistance(clampedDist);
  if (startKmSlider) {
    startKmSlider.value = km.toFixed(2);
  }
  if (startKmLabel) {
    startKmLabel.textContent =
      km <= 0.05
        ? '0.0 km (route start)'
        : `${km.toFixed(1)} km (${Math.round(state.currentAltitudeM)} m above sea level, ${state.currentGradePct >= 0 ? '+' : ''}${state.currentGradePct.toFixed(1)}%)`;
  }
  drawMenuElevationProfile();
}

if (startKmSlider) {
  startKmSlider.addEventListener('input', (e) => {
    const km = parseFloat(e.target.value) || 0;
    updateStartOffsetFromDistance(km * 1000);
  });
}

if (menuElevationCanvas) {
  let isDraggingMenuProfile = false;
  const pickFromMenuCanvas = (clientX) => {
    const rect = menuElevationCanvas.getBoundingClientRect();
    const ratio = THREE.MathUtils.clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 0.995);
    updateStartOffsetFromDistance(ratio * state.totalDistanceM);
  };
  menuElevationCanvas.addEventListener('pointerdown', (e) => {
    isDraggingMenuProfile = true;
    pickFromMenuCanvas(e.clientX);
  });
  window.addEventListener('pointermove', (e) => {
    if (isDraggingMenuProfile) pickFromMenuCanvas(e.clientX);
  });
  window.addEventListener('pointerup', () => {
    isDraggingMenuProfile = false;
  });
}

// Przycisk "Zeruj licznik (Od 0.0 km)" w Menu
const restartRouteBtn = document.getElementById('btn-restart-route');
if (restartRouteBtn) {
  restartRouteBtn.addEventListener('click', () => {
    const releaseResistance = state.hasRideStarted;
    if (releaseResistance && usesKeyboardPower()) setSimulationPower(0);
    setSessionStatus(state,'ready');
    if (state.isWorkoutRunning) stopWorkout();
    if (releaseResistance) trainerController.neutralizeResistance();
    else trainerController.cancelPendingControl();
    teleportToDistance(0);
    state.elapsedSeconds = 0;
    state.energyJoules = 0;
    state.elevationGainM = 0;
    recordedPoints.length = 0;
    zoneSeconds.fill(0);
    recordTimer = 0;
    finishedRideSnapshot = null;
    clearRideRecovery();
    if (startKmSlider) startKmSlider.value = 0;
    if (startKmLabel) startKmLabel.textContent = '0.0 km (route start)';
    updateHUD();
  });
}

const openSummaryBtn = document.getElementById('btn-open-summary');
if (openSummaryBtn) {
  openSummaryBtn.addEventListener('click', () => {
    setMenuOpen(false);
    if (isRideRunning(state)) pauseRide();
    showFinishModal(false, false);
  });
}

// Klikniecie na pelny profil wysokosciowy -> Teleport na wybrany kilometr trasy!
elevationCanvas.addEventListener('click', (e) => {
  const rect = elevationCanvas.getBoundingClientRect();
  const ratio = THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0, 0.995);
  teleportToDistance(ratio * state.totalDistanceM);
});

// Interaktywny hover profilu na HUD
elevationCanvas.addEventListener('pointermove', (e) => {
  const rect = elevationCanvas.getBoundingClientRect();
  const ratio = THREE.MathUtils.clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  hudHoverDist = ratio * state.totalDistanceM;
  drawElevationProfile();
});
elevationCanvas.addEventListener('pointerleave', () => {
  hudHoverDist = null;
  drawElevationProfile();
});

// Interaktywny hover profilu w Menu Glownym
if (menuElevationCanvas) {
  menuElevationCanvas.addEventListener('pointermove', (e) => {
    const rect = menuElevationCanvas.getBoundingClientRect();
    const ratio = THREE.MathUtils.clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    menuHoverDist = ratio * state.totalDistanceM;
    drawMenuElevationProfile();
  });
  menuElevationCanvas.addEventListener('pointerleave', () => {
    menuHoverDist = null;
    drawMenuElevationProfile();
  });
}

// Interaktywny hover na wykresie mety
const finishTelemetryCanvas = document.getElementById('finish-telemetry-canvas');
if (finishTelemetryCanvas) {
  finishTelemetryCanvas.addEventListener('pointermove', (e) => {
    const rect = finishTelemetryCanvas.getBoundingClientRect();
    finishChartHoverRatio = THREE.MathUtils.clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    if (currentSummarySnapshot) {
      drawFinishTelemetryChart(currentSummarySnapshot.points || recordedPoints, currentSummarySnapshot.distanceM || state.distanceM);
    }
  });
  finishTelemetryCanvas.addEventListener('pointerleave', () => {
    finishChartHoverRatio = null;
    if (currentSummarySnapshot) {
      drawFinishTelemetryChart(currentSummarySnapshot.points || recordedPoints, currentSummarySnapshot.distanceM || state.distanceM);
    }
  });
}

// Wybor wbudowanych tras 3D (ukryty select dla kompatybilnosci)
document.getElementById('preset-select').addEventListener('change', (e) => {
  const val = e.target.value;
  loadRouteIntoWorld(generatePresetRoute(val), presetTitles[val] || val, {type:'preset',key:val});
});

// Typ roweru (Szosa Aero / Czasowka TT / Goral MTB)
const bikeTypeSelect = document.getElementById('bike-type-select');
if (bikeTypeSelect) {
  bikeTypeSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    state.bikeType = val;
    if (val === 'tt') {
      state.bikeWeightKg = 8.2;
      state.cdA = 0.255;
      state.crr = 0.0034;
    } else if (val === 'mtb') {
      state.bikeWeightKg = 10.2;
      state.cdA = 0.36;
      state.crr = 0.0055;
    } else {
      state.bikeWeightKg = 7.5;
      state.cdA = 0.30;
      state.crr = 0.0038;
    }
    updateHUD();
  });
}

// Kolor koszulki kolarza 3D
const jerseyColorSelect = document.getElementById('jersey-color-select');
if (jerseyColorSelect) {
  jerseyColorSelect.addEventListener('change', (e) => {
    if (playerAvatar.kitMat) {
      playerAvatar.kitMat.color.set(e.target.value);
    }
  });
}

// Tryb pracy trenazera (SIM vs ERG)
const trainerModeSelect = document.getElementById('trainer-mode-select');
if (trainerModeSelect) {
  trainerModeSelect.addEventListener('change', (e) => {
    state.trainerMode = e.target.value;
    if (state.trainerMode === 'erg') state.manualErgTargetWatts = state.watts;
    state.lastErgSendTime = 0;
    updateTrainerControl();
  });
}

// Kąt widzenia kamery (FOV 52° - 85°)
const fovSlider = document.getElementById('fov-slider');
const fovLabel = document.getElementById('fov-label');
let baseCameraFov = fovSlider ? parseInt(fovSlider.value, 10) || 60 : 60;
if (fovSlider) {
  fovSlider.addEventListener('input', (e) => {
    const fov = parseInt(e.target.value, 10) || 62;
    baseCameraFov = fov;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    if (fovLabel) fovLabel.textContent = `${fov}°`;
  });
}

// Tryb czystego ekranu (ukrycie paska przyciskow na dole podczas jazdy)
const cleanHudSelect = document.getElementById('clean-hud-select');
const bottomControlsBar = document.getElementById('bottom-controls-bar');
if (cleanHudSelect && bottomControlsBar) {
  cleanHudSelect.addEventListener('change', (e) => {
    bottomControlsBar.classList.toggle('hidden', e.target.value === 'minimal');
  });
}

// Syntetyczne dźwięki jazdy wyłączone (użytkownik korzysta z naturalnego dźwięku własnego roweru i trenażera)
const crowdToggle = document.getElementById('crowd-audio-toggle');
const crowdVolume = document.getElementById('crowd-audio-volume');
const crowdVolumeLabel = document.getElementById('crowd-audio-volume-label');
crowdToggle.checked = crowdAmbience.settings.crowdEnabled;
crowdVolume.value = Math.round(crowdAmbience.settings.sfxVolume * 100);
crowdVolumeLabel.textContent = `${crowdVolume.value}%`;
crowdVolume.disabled = !crowdToggle.checked;
crowdToggle.addEventListener('change', () => {
  crowdAmbience.setEnabled(crowdToggle.checked); crowdVolume.disabled = !crowdToggle.checked;
  if (crowdToggle.checked && routePoints?.routeId === 'alpedhuez') crowdAmbience.unlock();
});
crowdVolume.addEventListener('input', () => {
  crowdAmbience.setVolume(Number(crowdVolume.value) / 100); crowdVolumeLabel.textContent = `${crowdVolume.value}%`;
});
document.addEventListener('visibilitychange', () => { if (document.hidden) crowdAmbience.stop(); });
window.addEventListener('pagehide', () => crowdAmbience.dispose());
function playShiftClick() {}

// Wirtualne przerzutki (1..24)
function changeVirtualGear(delta, fromShifter = false) {
  if (state.virtualShiftingMode === 'auto' && !isVirtualShiftingActive(state)) {
    state.virtualShiftingMode = 'always';
  }
  const prevGear = state.virtualGear;
  state.virtualGear = Math.max(1, Math.min(24, state.virtualGear + delta));
  if (fromShifter && state.virtualGear === prevGear) return;
  if (state.virtualGear !== prevGear) {
    const details = { from: prevGear, to: state.virtualGear };
    if (fromShifter) details.source = 'Bluetooth controller';
    diagnostics.event('change', 'Gear changed', details);
    playShiftClick(delta > 0);
  }
  // Zmiana przelozenia delikatnie koryguje odczuwany opor na trenazerze
  if (!fromShifter && !state.bleConnected && !state.requiresTrainerReconnect && state.watts > 0) {
    state.watts = Math.max(40, Math.min(800, state.watts + delta * 6));
    simWattsSlider.value = state.watts;
    simWattsLabel.textContent = `${state.watts} W`;
  }
  if (state.bleConnected) {
    trainerController.updateSimulationGrade(state.currentGradePct, true);
  }
  updateHUD();
}

function shiftFromController(delta) {
  if (state.virtualShiftingMode === 'off' || state.isDeviceTestActive || state.deviceTestNeedsNeutral || state.requiresTrainerReconnect) return;
  changeVirtualGear(delta, true);
}

const gearDownBtn = document.getElementById('btn-gear-down');
const gearUpBtn = document.getElementById('btn-gear-up');
if (gearDownBtn) gearDownBtn.addEventListener('click', () => changeVirtualGear(-1));
if (gearUpBtn) gearUpBtn.addEventListener('click', () => changeVirtualGear(1));

// Tryb Ducha (Ghost Rider) oraz drugi Duch (Własny rekord z Dziennika postępów)
document.getElementById('ghost-mode-select').addEventListener('change', (e) => {
  state.ghostMode = e.target.value;
  updateHUD();
});

const recordGhostToggle = document.getElementById('record-ghost-toggle');
const recordGhostSelect = document.getElementById('record-ghost-select');
if (recordGhostToggle) {
  recordGhostToggle.addEventListener('change', (e) => {
    state.recordGhost = Boolean(e.target.checked);
    if (recordGhostSelect) {
      recordGhostSelect.disabled = !state.recordGhost || recordGhostSelect.options.length <= 1;
    }
    const statusEl = document.getElementById('record-ghost-status');
    if (statusEl) {
      statusEl.textContent = formatRecordGhostStatus(
        activeRecordGhost,
        state.recordGhost,
        state.recordGhostSelection === 'best'
      );
    }
    persistRiderProfile();
    updateHUD();
  });
}
if (recordGhostSelect) {
  recordGhostSelect.addEventListener('change', (e) => {
    state.recordGhostSelection = e.target.value || 'best';
    void refreshRecordGhostForCurrentRoute(state.recordGhostSelection);
  });
}

// Pora dnia / Klimat oswietlenia 3D
document.getElementById('time-select').addEventListener('change', (e) => {
  applyTimeOfDay(e.target.value);
});

const weatherSelect = document.getElementById('weather-select');
if (weatherSelect) {
  weatherSelect.addEventListener('change', (e) => {
    state.weather = e.target.value || 'clear';
    skyEnvironment.applyWeather(state.weather);
  });
}

function applyAdaptiveGraphics() {
  const level=adaptiveGraphics?.level||0;
  state.adaptiveGraphicsLevel=level;
  const ratio=state.quality==='eco'?1:Math.min(window.devicePixelRatio,state.quality==='medium'?1.5:2);
  if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
  const shadows=state.quality!=='eco'&&level===0;
  renderer.shadowMap.enabled=shadows;sunLight.castShadow=shadows;
  const targetShadowSize=state.quality==='ultra'&&level===0?2048:1024;
  if(sunLight.shadow.mapSize.width!==targetShadowSize){
    sunLight.shadow.mapSize.set(targetShadowSize,targetShadowSize);
    sunLight.shadow.map?.dispose();
    sunLight.shadow.map=null;
  }
  skyEnvironment.setQuality(state.quality,level);
  routeGroup?.userData.setSceneryDetail?.(level);
  const message=!state.adaptiveGraphics?'Automatic adjustment is off. Using the selected graphics preset.':level===0?'Automatic adjustment is on. Using full detail for the selected preset.':level===1?'Automatic adjustment: shadows off, shorter scenery range.':'Automatic adjustment: shadows off, reduced scenery range.';
  document.getElementById('adaptive-graphics-status').textContent=message;
}

adaptiveGraphics=new AdaptiveGraphics((level,reason,fps)=>{
  applyAdaptiveGraphics();
  diagnostics.event('change','Graphics adjusted',{level,reason,fps:fps?Math.round(fps):null,selectedQuality:state.quality});
});
document.getElementById('adaptive-graphics-toggle').addEventListener('change',event=>{
  state.adaptiveGraphics=event.target.checked;adaptiveGraphics.setEnabled(state.adaptiveGraphics);applyAdaptiveGraphics();persistRiderProfile();
});

// Ręczna zmiana presetu przebudowuje scenerię; automat zmienia tylko widoczność.
document.getElementById('quality-select').addEventListener('change', (e) => {
  state.quality = e.target.value;adaptiveGraphics.reset();

  // Przebuduj scenerie z nowa gestoscia
  const savedDist = state.distanceM;
  const built = buildRouteWorld(scene, routePoints, routeGroup, {
    climbs: routeClimbs,
    quality: state.quality,
  });
  routeGroup = built.routeGroup;
  routeCurve = built.routeCurve;
  skyEnvironment.setRouteGroup(routeGroup);
  applyAdaptiveGraphics();
  applyTimeOfDay(state.timeOfDay);
  state.tunnelIntervals = built.tunnelIntervals || [];
  worldAnimated = built.animatedObjects || {
    balloons: [],
    spectators: [],
    streetLights: [],
    windTurbines: [],
    boats: [],
  };
  worldVisibleUpdater = built.updateVisibleWindow || null;
  state.distanceM = savedDist;
  if (worldVisibleUpdater) {
    worldVisibleUpdater(savedDist);
  }
});

// Modal Menu Glownego i Ustawien (Ekran Startowy: Graj / Ustawienia)
const settingsModal = document.getElementById('settings-modal');
const menuDialog = settingsModal.querySelector('[role="dialog"]');
const shifterMenu = mountShifterMenuNavigation(menuDialog);
const menuSections = {
  home: document.getElementById('menu-home-section'),
  play: document.getElementById('menu-play-section'),
  workouts: document.getElementById('menu-workouts-section'),
  settings: document.getElementById('menu-settings-section'),
  journal: document.getElementById('menu-journal-section'),
  logs: document.getElementById('menu-logs-section'),
  'device-test': document.getElementById('menu-device-test-section'),
};
let menuReturnFocus = null;

function switchMenuView(viewName = 'home', routeKey) {
  if(viewName!=='device-test')deviceTest?.cancel();
  menuDialog.scrollTop=0;
  menuDialog.setAttribute('data-menu-view', viewName);
  menuDialog.setAttribute('aria-labelledby', menuSections[viewName].getAttribute('aria-labelledby'));
  for (const [name, section] of Object.entries(menuSections)) {
    section.classList.toggle('hidden', viewName !== name);
  }

  document.querySelectorAll('.menu-tab-btn[data-target-view]').forEach((btn) => {
    const isCurrent = btn.getAttribute('data-target-view') === (viewName === 'logs' ? 'settings' : viewName === 'device-test' ? 'home' : viewName);
    btn.classList.toggle('active', isCurrent);
    if (isCurrent) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  if (viewName === 'play') {
    requestAnimationFrame(() => {
      drawMenuElevationProfile();
    });
  } else if (viewName === 'workouts') {
    renderWorkoutPresets();
  } else if (viewName === 'logs') {
    rideLogsView.refresh();
  } else if (viewName === 'device-test') {
    deviceTest.refreshView();
  } else if (viewName === 'journal') {
    void rideJournalView.refresh(routeKey);
  } else if (viewName === 'settings') {
    void refreshRecordGhostForCurrentRoute();
  }
  updateSessionUI();
}

document.querySelectorAll('.menu-tab-btn[data-target-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    switchMenuView(btn.getAttribute('data-target-view') || 'home');
  });
});

rideLogsView = mountRideLogsView(diagnostics);
rideJournalView = mountRideJournal(rideHistory, routeLibrary, {
  presets: presetTitles,
  onViewRide: snapshot => {
    setMenuOpen(false);
    openSummaryDialog(snapshot, true);
  },
  onChooseRoute: () => {
    switchMenuView('play');
    document.getElementById('btn-tab-play').focus();
  },
});
routeLibraryView=mountRouteLibrary(routeLibrary,{
  current:()=>state.routeSource,isLocked:libraryLocked,onPick:pickLibraryRoute,onSaveCurrent:saveCurrentLibraryRoute,
  onPickByShifter: () => {
    if (shifterMenu.isUsingShifter() && !settingsModal.classList.contains('hidden') &&
        menuDialog.dataset.menuView === 'play' && canUseShifterMenu()) shifterMenu.focusStart();
  },
  onViewRides: record => {
    switchMenuView('journal', `gpx:${record.id}`);
    document.getElementById('journal-heading').focus();
  },
  onRename:record=>{if(record&&state.routeSource.libraryId===record.id&&!libraryLocked()){state.routeName=record.name;updateGPXLabel(record.name);document.getElementById('active-route-pill').textContent=`Selected: ${record.name}`;updateHUD();}},
  onRemove:id=>{if(state.routeSource.libraryId===id)delete state.routeSource.libraryId;},
});
routeLibraryView.refresh();
deviceTest = mountDeviceTest(state, trainerController, {
  changed() {
    document.documentElement.toggleAttribute('data-shifter-menu-locked', state.isDeviceTestActive);
    updateSessionUI();
  },
  log: (message, data) => diagnostics.event('device', message, data || null),
});
document.getElementById('btn-open-device-test').addEventListener('click',()=>{
  switchMenuView('device-test');document.getElementById('device-check-heading').focus();
});
document.getElementById('btn-device-test-back').addEventListener('click',()=>{
  switchMenuView('home');document.getElementById('btn-open-device-test').focus();
});
document.getElementById('btn-device-test-pair').addEventListener('click',()=>openPairingModal(true));
document.getElementById('btn-trainer-resume').addEventListener('click',()=>{if(beginRide())setMenuOpen(false);});
document.getElementById('btn-open-logs').addEventListener('click', () => {
  switchMenuView('logs');
  document.getElementById('ride-logs-heading').focus();
});
document.getElementById('btn-logs-back').addEventListener('click', () => {
  switchMenuView('settings');
  document.getElementById('btn-open-logs').focus();
});
document.getElementById('trainer-connection-indicator').addEventListener('click', () => openPairingModal(true));

const homePlayBtn = document.getElementById('btn-home-play');
if (homePlayBtn) {
  homePlayBtn.addEventListener('click', () => {
    switchMenuView('play');
  });
}

const homeSettingsBtn = document.getElementById('btn-home-settings');
if (homeSettingsBtn) {
  homeSettingsBtn.addEventListener('click', () => {
    switchMenuView('settings');
  });
}

function setMenuOpen(open, initialView = null, routeKey) {
  if (open) crowdAmbience.stop();
  if(!open)deviceTest?.cancel();
  updateSessionUI();
  if (open) {
    menuReturnFocus = document.activeElement;
    if (initialView) {
      switchMenuView(initialView, routeKey);
    }
    settingsModal.classList.remove('hidden');
    menuDialog.focus();
  } else {
    settingsModal.classList.add('hidden');
    const returnTarget = menuReturnFocus && !settingsModal.contains(menuReturnFocus)
      ? menuReturnFocus
      : document.getElementById('btn-top-menu');
    returnTarget?.focus();
  }
}

document.getElementById('btn-settings').addEventListener('click', () => {
  setMenuOpen(true, 'home');
});
const topMenuBtn = document.getElementById('btn-top-menu');
if (topMenuBtn) {
  topMenuBtn.addEventListener('click', () => {
    setMenuOpen(true, 'home');
  });
}
function beginRide() {
  if (state.isDeviceTestActive || state.deviceTestNeedsNeutral || !canResumeTrainerRide(state)) { updateHUD(); return false; }
  if (state.isRideFinished) restartRouteBtn.click();
  deviceTest?.cancelReadings();
  state.requiresTrainerReconnect = false;
  if (state.bleConnected) state.trainerWasRequired = true;
  const wasPaused = state.isRidePaused;
  if (!state.hasRideStarted) {
    state.rideId = newRideId();
    state.rideStartedAt = new Date().toISOString();
    state.rideStartDistanceM = state.distanceM;
  }
  setSessionStatus(state,'riding');
  if (routePoints.routeId === 'alpedhuez') crowdAmbience.unlock().then(ready => {
    if (!ready && crowdAmbience.unavailable) document.getElementById('crowd-audio-status').textContent = 'Audio is unavailable in this browser.';
  });
  if (wasPaused) state.speedMps = pausedSpeedMps;
  state.lastErgTargetSent = null;
  updateTrainerControl();
  persistRideRecovery();
  updateHUD();
  return true;
}

function pauseRide() {
  if (!isRideRunning(state)) return;
  pausedSpeedMps = state.speedMps;
  setSessionStatus(state,'paused');
  crowdAmbience.stop();
  state.speedMps = 0;
  trainerController.neutralizeResistance();
  persistRideRecovery();
  updateHUD();
}

document.getElementById('btn-session-toggle').addEventListener('click', () => {
  if (isRideRunning(state)) pauseRide();
  else if (beginRide()) setMenuOpen(false);
});

function closeSummary(view = summaryReturnView, routeKey) {
  document.getElementById('finish-modal').classList.add('hidden');
  setMenuOpen(true, view, routeKey);
}

document.getElementById('btn-settings-close').addEventListener('click', () => {
  if (menuDialog.dataset.menuView === 'workouts' && !state.hasRideStarted) {
    startWorkout(selectedWorkout);
    return;
  }
  if (beginRide()) setMenuOpen(false);
});
document.getElementById('btn-settings-close-top').addEventListener('click', () => {
  setMenuOpen(false);
});

// Przyciski BLE (Trenazer + Czujnik HR + Manetki Zwift + Miernik Mocy + Kadencja)
bleBtn.addEventListener('click', () => connectTrainerWithIndicator(false));
const universalBleBtn = document.getElementById('btn-ble-universal');
if (universalBleBtn) {
  universalBleBtn.addEventListener('click', () => connectTrainerWithIndicator(true));
}
document
  .getElementById('btn-hrm-connect')
  .addEventListener('click', () => trainerController.connectHeartRateMonitor());
// Dedykowane przyciski BLE Matrix dla Miernika mocy i Czujnika kadencji
const powerBtn = document.getElementById('btn-power-connect');
const cadenceBtn = document.getElementById('btn-cadence-connect');

if (powerBtn) {
  powerBtn.addEventListener('click', async () => {
    await trainerController.connectPowerMeter();
    if (state.powerMeterConnected) {
      powerBtn.classList.add('connected');
    }
  });
}

if (cadenceBtn) {
  cadenceBtn.addEventListener('click', async () => {
    await trainerController.connectCadenceSensor();
    if (state.cadenceSensorConnected) {
      cadenceBtn.classList.add('connected');
    }
  });
}

// ============================================================================
// PANEL SPAROWANYCH URZĄDZEŃ W STYLU ZWIFT I KALIBRACJA SPINDOWN
// ============================================================================
const pairingModal = document.getElementById('pairing-modal');
const spindownModal = document.getElementById('spindown-modal');
const shifterPicker = document.getElementById('shifter-picker');
const rideSummaryModal = document.getElementById('finish-modal');
let pairingReturnFocus;

function canUseShifterMenu() {
  return !shifterPicker.open && pairingModal.classList.contains('hidden') && spindownModal.classList.contains('hidden') &&
    rideSummaryModal.classList.contains('hidden');
}

const zwiftController = new ZwiftController({
  requestDevice: options => shifterView.requestDevice(options),
  onPress: (profile, buttons) => shifterView.handlePress(profile, buttons),
  onButtonsChange: (id, profile, held, pressed) => shifterView.handleButtonsChange(id, profile, held, pressed),
  onStatusChange(snapshot) {
    shifterView.renderConnection(snapshot);
    shifterRideAlerts.updateDevices(snapshot.devices);
    const connected = snapshot.devices.filter(device => device.phase === 'connected');
    state.zwiftBatteryPct = connected.find(device => device.battery !== null)?.battery ?? null;
    const active = connected.length > 0;
    if (state.zwiftControllerConnected === active) return;
    state.zwiftControllerConnected = active;
    zwiftBtn?.classList.toggle('connected', active);
    diagnostics.event('device', active ? 'Bluetooth controller connected' : 'Bluetooth controllers disconnected');
    updateHUD();
  },
});

shifterView = mountZwiftShifterView({
  onConnect: model => zwiftController.connectController(model),
  onDisconnect: () => zwiftController.disconnectAll(),
  onInput: shifterMenu.useShifter,
  onMenuPress: (profile, button) => !settingsModal.classList.contains('hidden') && canUseShifterMenu() && shifterMenu.press(profile, button),
  onMenuShortcuts: shifterMenu.updateShortcuts,
  onAction(action) {
    if (action === 'gear-up' || action === 'gear-down') {
      shiftFromController(action === 'gear-up' ? 1 : -1);
      return;
    }
    if (action === 'menu' && !shifterPicker.open && spindownModal.classList.contains('hidden') && !pairingModal.classList.contains('hidden')) {
      openPairingModal(false);
      return;
    }
    if (!canUseShifterMenu() || state.isDeviceTestActive) return;
    if (action === 'camera') changeCamera();
    else if (action === 'menu') {
      const open = settingsModal.classList.contains('hidden');
      setMenuOpen(open);
      if (open) shifterMenu.focusTab();
    }
    else if (action === 'pause' && settingsModal.classList.contains('hidden')) {
      if (isRideRunning(state)) pauseRide();
      else if (state.isRidePaused && !state.requiresTrainerReconnect && beginRide()) setMenuOpen(false);
    }
  },
});
window.addEventListener('pagehide', () => zwiftController.disconnectAll());

function openPairingModal(open = true, focusId = 'pairing-heading') {
  if (!pairingModal) return;
  if (open) {
    if (pairingModal.classList.contains('hidden')) pairingReturnFocus = document.activeElement;
    deviceTest?.cancel();
    updateRealismUI();
    pairingModal.classList.remove('hidden');
    document.getElementById(focusId)?.focus();
  } else {
    shifterView.stopTest();
    pairingModal.classList.add('hidden');
    pairingReturnFocus?.focus();
  }
}

function openSpindownModal(open = true) {
  if (!spindownModal) return;
  if (open) {
    document.getElementById('spindown-step-prep')?.classList.remove('hidden');
    document.getElementById('spindown-step-active')?.classList.add('hidden');
    document.getElementById('spindown-step-success')?.classList.add('hidden');
    spindownModal.classList.remove('hidden');
  } else {
    trainerController.cancelSpindown();
    spindownModal.classList.add('hidden');
  }
}

// Otwieranie / zamykanie okna parowania Zwift
zwiftBtn?.addEventListener('click', () => openPairingModal(true, 'shifter-heading'));
document.getElementById('btn-open-pairing')?.addEventListener('click', () => openPairingModal(true));
document.getElementById('btn-home-devices')?.addEventListener('click', () => openPairingModal(true));
document.getElementById('hud-realism-badge')?.addEventListener('click', () => openPairingModal(true));
document.getElementById('btn-pairing-close')?.addEventListener('click', () => openPairingModal(false));
document.getElementById('btn-pairing-close-top')?.addEventListener('click', () => openPairingModal(false));

// Przyciski parowania w oknie parowania Zwift
document.getElementById('btn-pair-trainer')?.addEventListener('click', async () => {
  await connectTrainerWithIndicator(false);
  updateRealismUI();
});
document.getElementById('btn-pair-power')?.addEventListener('click', async () => {
  await trainerController.connectPowerMeter();
  updateRealismUI();
});
document.getElementById('btn-pair-speed')?.addEventListener('click', async () => {
  await trainerController.connectCadenceSensor();
  updateRealismUI();
});
document.getElementById('btn-pair-heart')?.addEventListener('click', async () => {
  await trainerController.connectHeartRateMonitor();
  updateRealismUI();
});
document.getElementById('btn-pairing-universal')?.addEventListener('click', async () => {
  await connectTrainerWithIndicator(true);
  updateRealismUI();
});

// Zmiana profilu zPower w oknie parowania
const pairingZpowerSelect = document.getElementById('pairing-zpower-select');
if (pairingZpowerSelect) {
  pairingZpowerSelect.value = state.virtualPowerCurve || 'fluid';
  pairingZpowerSelect.addEventListener('change', (e) => {
    state.virtualPowerCurve = e.target.value;
    const legacySelect = document.getElementById('virtual-power-curve-select');
    if (legacySelect) legacySelect.value = e.target.value;
    updateRealismUI();
  });
}

// Kalibracja Spindown
document.getElementById('btn-spindown-open')?.addEventListener('click', () => openSpindownModal(true));
document.getElementById('btn-spindown-close-top')?.addEventListener('click', () => openSpindownModal(false));
document.getElementById('btn-spindown-cancel')?.addEventListener('click', () => openSpindownModal(false));
document.getElementById('btn-spindown-finish')?.addEventListener('click', () => {
  openSpindownModal(false);
  updateRealismUI();
});

const spindownSpeedEl = document.getElementById('spindown-current-speed');
const spindownBarFill = document.getElementById('spindown-bar-fill');
const spindownPrompt = document.getElementById('spindown-prompt');
const spindownPhaseTitle = document.getElementById('spindown-phase-title');
const spindownMeasuredTime = document.getElementById('spindown-measured-time');

document.getElementById('btn-spindown-start')?.addEventListener('click', () => {
  document.getElementById('spindown-step-prep')?.classList.add('hidden');
  document.getElementById('spindown-step-active')?.classList.remove('hidden');

  trainerController.startSpindown((info) => {
    if (info.phase === 'spinup') {
      if (spindownPhaseTitle) spindownPhaseTitle.textContent = 'Accelerate to 37 km/h';
      if (spindownSpeedEl) spindownSpeedEl.textContent = formatNumber(info.speedKmh);
      if (spindownBarFill) spindownBarFill.style.width = `${info.progressPct}%`;
      if (spindownPrompt) {
        spindownPrompt.textContent = info.message;
        spindownPrompt.classList.remove('pulse');
      }
    } else if (info.phase === 'coasting') {
      if (spindownPhaseTitle) spindownPhaseTitle.textContent = 'Stop pedaling. Let the flywheel coast…';
      if (spindownSpeedEl) spindownSpeedEl.textContent = formatNumber(info.speedKmh);
      if (spindownBarFill) spindownBarFill.style.width = `${info.progressPct}%`;
      if (spindownPrompt) {
        spindownPrompt.textContent = info.message;
        spindownPrompt.classList.add('pulse');
      }
    } else if (info.phase === 'success') {
      document.getElementById('spindown-step-active')?.classList.add('hidden');
      document.getElementById('spindown-step-success')?.classList.remove('hidden');
      if (spindownMeasuredTime) spindownMeasuredTime.textContent = `${info.coastTimeSec} s`;
    }
  });
});

// Inicjalna aktualizacja UI realizmu
updateRealismUI();

// ============================================================================
// SYSTEM TRENINGÓW USTRUKTURYZOWANYCH (.ZWO / .MRC / ERG)
// ============================================================================
const workoutPresetsContainer = document.getElementById('workout-presets-container');
const workoutActiveTitle = document.getElementById('workout-active-title');
const workoutActiveMeta = document.getElementById('workout-active-meta');
const workoutErgToggle = document.getElementById('workout-erg-toggle');
const btnWorkoutToggle = document.getElementById('btn-workout-toggle');
const workoutFileInput = document.getElementById('workout-file-input');

let selectedWorkout = WORKOUT_PRESETS[0];

function renderWorkoutPresets() {
  if (!workoutPresetsContainer) return;
  workoutPresetsContainer.innerHTML = '';

  for (const preset of WORKOUT_PRESETS) {
    const card = document.createElement('button');
    card.type = 'button';
    const isAct = selectedWorkout && selectedWorkout.id === preset.id;
    card.className = `workout-preset-card ${isAct ? 'active' : ''}`;
    card.setAttribute('data-workout-id', preset.id);
    card.setAttribute('aria-pressed', isAct ? 'true' : 'false');

    const duration = formatWorkoutDuration(preset.totalDurationSec);
    card.innerHTML = `
      <div class="workout-preset-top">
        <span class="workout-preset-category">${preset.category || 'Workout'}</span>
        <span class="workout-preset-duration">${duration}</span>
      </div>
      <div class="workout-preset-name">${preset.name}</div>
      <div class="workout-preset-desc">${preset.description}</div>
    `;

    card.addEventListener('click', () => {
      selectWorkout(preset);
    });

    workoutPresetsContainer.appendChild(card);
  }
}

function selectWorkout(workout) {
  selectedWorkout = workout;
  if (workoutActiveTitle) workoutActiveTitle.textContent = workout.name;
  if (workoutActiveMeta) {
    const duration = formatWorkoutDuration(workout.totalDurationSec);
    const blockCount = workout.blocks ? workout.blocks.length : 0;
    workoutActiveMeta.textContent = `Duration: ${duration} · Blocks: ${blockCount} · ${workout.author || 'OskiRide'}`;
  }

  document.querySelectorAll('.workout-preset-card').forEach((card) => {
    const isAct = card.getAttribute('data-workout-id') === workout.id;
    card.classList.toggle('active', isAct);
    card.setAttribute('aria-pressed', isAct ? 'true' : 'false');
  });
}

function startWorkout(workout) {
  if (!workout || state.isDeviceTestActive || state.deviceTestNeedsNeutral || !canResumeTrainerRide(state)) return;
  if (state.isRideFinished) restartRouteBtn.click();
  state.activeWorkout = workout;
  state.workoutElapsedSec = 0;
  state.isWorkoutRunning = true;
  state.lastErgTargetSent = 0;
  state.lastErgSendTime = 0;

  if (btnWorkoutToggle) {
    btnWorkoutToggle.textContent = 'End ride';
    btnWorkoutToggle.classList.remove('btn-primary');
    btnWorkoutToggle.classList.add('btn-secondary');
  }
  if (workoutBanner) {
    workoutBanner.classList.remove('hidden');
  }
  beginRide();
  diagnostics.event('change', 'Workout started', { workout: workout.name });
  setMenuOpen(false);
  updateHUD();
}

function stopWorkout() {
  if (state.isWorkoutRunning) diagnostics.event('change', 'Workout stopped', { workout: state.activeWorkout?.name || null });
  state.isWorkoutRunning = false;
  state.activeWorkout = null;
  state.workoutElapsedSec = 0;

  if (btnWorkoutToggle) {
    btnWorkoutToggle.textContent = 'Start workout';
    btnWorkoutToggle.classList.add('btn-primary');
    btnWorkoutToggle.classList.remove('btn-secondary');
  }
  if (workoutBanner) {
    workoutBanner.classList.add('hidden');
  }
  if (!state.isRidePaused && !state.isRideFinished) trainerController.setTrainerMode(state.trainerMode);
  state.lastErgSendTime = 0;
  updateHUD();
}

if (btnWorkoutToggle) {
  btnWorkoutToggle.addEventListener('click', () => {
    if (state.isWorkoutRunning) {
      stopWorkout();
    } else {
      startWorkout(selectedWorkout);
    }
  });
}

if (workoutErgToggle) {
  workoutErgToggle.addEventListener('change', (e) => {
    state.workoutErgMode = Boolean(e.target.checked);
    state.lastErgSendTime = 0;
    updateTrainerControl();
    if (workoutErgBadge) {
      workoutErgBadge.style.display = state.workoutErgMode ? 'inline-block' : 'none';
    }
  });
}

if (workoutFileInput) {
  document.getElementById('btn-import-workout').addEventListener('click', () => workoutFileInput.click());
  workoutFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        let imported = null;
        if (file.name.toLowerCase().endsWith('.zwo') || text.includes('<workout_file>')) {
          imported = parseZwoWorkout(text);
        } else if (file.name.toLowerCase().endsWith('.mrc') || text.includes('[COURSE DATA]')) {
          imported = parseMrcWorkout(text, file.name.toLowerCase().endsWith('.erg') ? 'erg' : 'auto');
        } else {
          imported = text.includes('<workout') ? parseZwoWorkout(text) : parseMrcWorkout(text, file.name.toLowerCase().endsWith('.erg') ? 'erg' : 'auto');
        }
        if (imported) {
          selectWorkout(imported);
          showWorkoutImportStatus(`Loaded “${imported.name}”. Select “Start workout” to begin.`);
        }
      } catch (err) {
        showWorkoutImportStatus(`Could not load workout: ${err.message}`, true);
      }
      workoutFileInput.value = '';
    };
    reader.onerror = () => showWorkoutImportStatus('Could not read this file. Choose it again.', true);
    reader.readAsText(file);
  });
}

function showWorkoutImportStatus(message, isError = false) {
  const status = document.getElementById('workout-import-status');
  if (!status) return;
  status.hidden = false;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

// Wysyłanie poleceń trenażera jest niezależne od odświeżania HUD.
function updateTrainerControl() {
  syncTrainerControl(state, trainerController, stopWorkout);
}

// Inicjalizacja domyślnego wyboru treningu
selectWorkout(WORKOUT_PRESETS[0]);
renderWorkoutPresets();

// Wybór krzywej wirtualnej mocy (zPower)
const virtualPowerCurveSelect = document.getElementById('virtual-power-curve-select');
if (virtualPowerCurveSelect) {
  virtualPowerCurveSelect.addEventListener('change', (e) => {
    state.virtualPowerCurve = e.target.value;
  });
}

// Przelacznik trybu wirtualnych biegow
const virtualShiftingSelect = document.getElementById('virtual-shifting-select');
if (virtualShiftingSelect) {
  virtualShiftingSelect.addEventListener('change', (e) => {
    state.virtualShiftingMode = e.target.value;
    updateHUD();
    if (state.bleConnected) {
      trainerController.updateSimulationGrade(state.currentGradePct, true);
    }
  });
}

// Kamera
const camBtn = document.getElementById('btn-camera');
const camNames = ['Camera: Chase', 'Kamera: z kierownicy', 'Camera: Overhead'];
function changeCamera() {
  state.cameraMode = (state.cameraMode + 1) % 3;
  camBtn.textContent = camNames[state.cameraMode];
}
camBtn.addEventListener('click', changeCamera);

// Eksport treningu .TCX i .FIT (Strava / Garmin Connect / Wahoo) oraz obsługa Historii treningów
document.getElementById('btn-export-tcx').addEventListener('click', () => {
  exportRideToTCX(recordedPoints, state.distanceM, state.elapsedSeconds, state.routeName);
});
const exportFitBtn = document.getElementById('btn-export-fit');
if (exportFitBtn) {
  exportFitBtn.addEventListener('click', () => {
    const meta = {
      ftpWatts: state.ftpWatts,
      weightKg: state.weightKg,
      calories: Math.round((state.energyJoules || 0) * 0.000259),
      trainingMetrics: computeTrainingMetrics(recordedPoints, state.ftpWatts),
    };
    exportRideToFIT(recordedPoints, state.distanceM, state.elapsedSeconds, state.routeName, meta);
  });
}
function summaryExport() {
  const ride = currentSummarySnapshot;
  if (!ride?.points?.length) return null;
  if (ride.legacy || !Number.isFinite(ride.distanceTravelledM)) return ride;
  const start = ride.rideStartDistanceM ?? 0;
  const points = ride.points.map(point => ({ ...point, dist: point.rideDistanceM ?? Math.max(0, point.dist - start) }));
  return { ...ride, distanceM: ride.distanceTravelledM, points };
}

document.getElementById('btn-finish-tcx').addEventListener('click', () => {
  const ride = summaryExport();
  if (ride) exportRideToTCX(ride.points, ride.distanceM, ride.elapsedSeconds, ride.routeName);
});
document.getElementById('btn-finish-fit').addEventListener('click', () => {
  const ride = summaryExport();
  if (!ride) return;
  const meta = {
    ftpWatts: ride.ftpWatts || state.ftpWatts,
    weightKg: ride.weightKg || state.weightKg,
    calories: ride.nutrition?.kcal ?? ride.kcal,
    trainingMetrics: { np: ride.np, tss: ride.tss, ifVal: ride.ifVal },
  };
  exportRideToFIT(ride.points, ride.distanceM, ride.elapsedSeconds, ride.routeName, meta);
});

const endRideBtn = document.getElementById('btn-end-ride');
if (endRideBtn) {
  endRideBtn.addEventListener('click', () => {
    showFinishModal(true);
  });
}

const finishStravaBtn = document.getElementById('btn-finish-strava');
if (finishStravaBtn) {
  finishStravaBtn.addEventListener('click', () => {
    window.open('https://www.strava.com/upload/select', '_blank');
  });
}

document.getElementById('btn-save-ride-history').addEventListener('click', () => {
  if (!currentSummaryIsHistorical) void saveCurrentRideToHistory(currentSummarySnapshot);
});

document.getElementById('btn-open-journal').addEventListener('click', () => {
  closeSummary('journal', currentSummaryIsHistorical ? undefined : '');
});

document.getElementById('btn-remove-journal-ride').addEventListener('click', async event => {
  const snapshot = currentSummarySnapshot;
  if (!currentSummaryIsHistorical || !snapshot) return;
  if (!window.confirm(`Delete ride “${snapshot.routeName}” from the journal?`)) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await rideHistory.remove(snapshot.id);
    void refreshRecordGhostForCurrentRoute();
    if (currentSummarySnapshot === snapshot && !document.getElementById('finish-modal').classList.contains('hidden')) {
      closeSummary('journal');
    }
  } catch {
    if (currentSummarySnapshot === snapshot) historyStatus('Could not delete the ride. Try again.', true);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('btn-finish-close').addEventListener('click', () => {
  closeSummary();
});
const finishCloseTopBtn = document.getElementById('btn-finish-close-top');
if (finishCloseTopBtn) {
  finishCloseTopBtn.addEventListener('click', () => {
    closeSummary();
  });
}

// Suwak mocy symulacji + Klawiatura (Gora/Dol = Moc, Q/E = Przerzutki, C = Kamera, ESC = Menu)
const simWattsSlider = document.getElementById('sim-watts');
const simWattsLabel = document.getElementById('sim-watts-label');
simWattsSlider.addEventListener('input', (e) => {
  if (usesKeyboardPower()) {
    state.watts = parseInt(e.target.value, 10);
    simWattsLabel.textContent = `${state.watts} W`;
  }
});

window.addEventListener('keydown', (e) => {
  if (document.getElementById('shifter-picker').open) return;
  if (e.key === 'Escape') {
    if (!pairingModal.classList.contains('hidden') && spindownModal.classList.contains('hidden')) {
      openPairingModal(false);
      return;
    }
    const finishModalEl = document.getElementById('finish-modal');
    if (finishModalEl && !finishModalEl.classList.contains('hidden')) {
      closeSummary();
      return;
    }
    setMenuOpen(settingsModal.classList.contains('hidden'));
    return;
  }
  if (!settingsModal.classList.contains('hidden')) {
    if (e.key === 'Tab') {
      const controls = [...menuDialog.querySelectorAll('button, input, select, [tabindex="0"]')]
        .filter((element) => !element.disabled && element.offsetParent !== null);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === menuDialog)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === menuDialog)) {
        e.preventDefault();
        first?.focus();
      }
    }
    return;
  }
  const rideArrow = isRideRunning(state) && canUseShifterMenu() &&
    (e.key === 'ArrowUp' || e.key === 'ArrowDown');
  if (e.target.closest('input, select, textarea, [contenteditable="true"]') ||
      (!rideArrow && e.target.closest('button, [role="button"]'))) {
    return;
  }
  if (e.key === 'c' || e.key === 'C') {
    changeCamera();
    return;
  }
  if (e.key === 'q' || e.key === 'Q' || e.key === '[' || e.key === '-' || e.key === '_') {
    changeVirtualGear(-1);
    return;
  }
  if (e.key === 'e' || e.key === 'E' || e.key === ']' || e.key === '+' || e.key === '=') {
    changeVirtualGear(1);
    return;
  }
  if (!usesKeyboardPower()) {
    if (e.key === 'ArrowUp') {
      changeVirtualGear(1);
      return;
    }
    if (e.key === 'ArrowDown') {
      changeVirtualGear(-1);
      return;
    }
    return;
  }
  if (e.key === 'ArrowUp') {
    setSimulationPower(Math.min(800, state.watts + 15));
  } else if (e.key === 'ArrowDown') {
    setSimulationPower(Math.max(0, state.watts - 15));
  }
});

// Suwak Trainer Difficulty (0% - 100%)
const trainerDiffSlider = document.getElementById('trainer-diff');
const trainerDiffLabel = document.getElementById('trainer-diff-label');
trainerDiffSlider.addEventListener('input', (e) => {
  state.trainerDifficultyPct = parseInt(e.target.value, 10);
  trainerDiffLabel.textContent = `${state.trainerDifficultyPct}%`;
});

// FTP kolarza
document.getElementById('rider-ftp').addEventListener('change', (e) => {
  state.ftpWatts = Math.max(80, Math.min(550, parseFloat(e.target.value) || 250));
  updateHUD();
});

// Waga kolarza
document.getElementById('rider-weight').addEventListener('change', (e) => {
  state.weightKg = Math.max(35, Math.min(180, parseFloat(e.target.value) || 75));
  updateHUD();
});

// Ustawienia trenażera i fizyki jazdy (Pakiet 1-7)
const TRAINER_SETTINGS_KEY = 'oskiride_trainer_settings_v2';

function saveTrainerSettings() {
  try {
    const data = {
      powerSmoothingSec: state.powerSmoothingSec,
      trainerResponsiveness: state.trainerResponsiveness,
      gearingProfile: state.gearingProfile,
      downhillClampGrade: state.downhillClampGrade,
      ergSoftStartSec: state.ergSoftStartSec,
    };
    localStorage.setItem(TRAINER_SETTINGS_KEY, JSON.stringify(data));
  } catch {}
}

function loadTrainerSettings() {
  try {
    const raw = localStorage.getItem(TRAINER_SETTINGS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.powerSmoothingSec !== undefined) state.powerSmoothingSec = Number(data.powerSmoothingSec);
    if (data.trainerResponsiveness) state.trainerResponsiveness = data.trainerResponsiveness;
    if (data.gearingProfile) state.gearingProfile = data.gearingProfile;
    if (data.downhillClampGrade !== undefined) state.downhillClampGrade = Number(data.downhillClampGrade);
    if (data.ergSoftStartSec !== undefined) state.ergSoftStartSec = Number(data.ergSoftStartSec);

    const smoothEl = document.getElementById('power-smoothing-select');
    if (smoothEl) smoothEl.value = String(state.powerSmoothingSec);
    const respEl = document.getElementById('trainer-responsiveness-select');
    if (respEl) respEl.value = state.trainerResponsiveness;
    const gearEl = document.getElementById('gearing-profile-select');
    if (gearEl) gearEl.value = state.gearingProfile;
    const downEl = document.getElementById('downhill-clamp-select');
    if (downEl) downEl.value = String(state.downhillClampGrade);
    const ergEl = document.getElementById('erg-softstart-select');
    if (ergEl) ergEl.value = String(state.ergSoftStartSec);
  } catch {}
}

const powerSmoothingSelect = document.getElementById('power-smoothing-select');
if (powerSmoothingSelect) {
  powerSmoothingSelect.addEventListener('change', (e) => {
    state.powerSmoothingSec = parseInt(e.target.value, 10) || 3;
    saveTrainerSettings();
  });
}

const trainerRespSelect = document.getElementById('trainer-responsiveness-select');
if (trainerRespSelect) {
  trainerRespSelect.addEventListener('change', (e) => {
    state.trainerResponsiveness = e.target.value;
    saveTrainerSettings();
  });
}

const gearingProfileSelect = document.getElementById('gearing-profile-select');
if (gearingProfileSelect) {
  gearingProfileSelect.addEventListener('change', (e) => {
    state.gearingProfile = e.target.value;
    updateHUD();
    saveTrainerSettings();
    if (state.bleConnected) {
      trainerController.updateSimulationGrade(state.currentGradePct, true);
    }
  });
}

const downhillClampSelect = document.getElementById('downhill-clamp-select');
if (downhillClampSelect) {
  downhillClampSelect.addEventListener('change', (e) => {
    state.downhillClampGrade = parseFloat(e.target.value);
    saveTrainerSettings();
    if (state.bleConnected) {
      trainerController.updateSimulationGrade(state.currentGradePct, true);
    }
  });
}

const ergSoftstartSelect = document.getElementById('erg-softstart-select');
if (ergSoftstartSelect) {
  ergSoftstartSelect.addEventListener('change', (e) => {
    state.ergSoftStartSec = parseInt(e.target.value, 10);
    saveTrainerSettings();
  });
}

loadTrainerSettings();

function updateSessionUI() {
  routeLibraryView?.sync();
  renderSessionView(state, trainerController, typeof selectedWorkout === 'undefined' ? null : selectedWorkout);
  document.getElementById('btn-restore-ride').disabled=!pendingRecovery||(state.hasRideStarted&&!state.isRideFinished);
  document.getElementById('btn-discard-ride').disabled=state.hasRideStarted&&!state.isRideFinished;
  for(const id of ['btn-export-fit','btn-export-tcx'])document.getElementById(id).disabled=recordedPoints.length===0;
}

function currentProfile() {
  return normalizeProfile({name:state.riderName,ftpWatts:state.ftpWatts,weightKg:state.weightKg,bikeType:state.bikeType,
    preferences:{quality:state.quality,adaptiveGraphics:state.adaptiveGraphics,timeOfDay:state.timeOfDay,ghostMode:state.ghostMode,recordGhost:state.recordGhost}});
}

function applyRiderProfile(profile) {
  const p=normalizeProfile(profile);
  state.riderName=p.name;state.name=`You (${p.name})`;state.ftpWatts=p.ftpWatts;state.weightKg=p.weightKg;
  document.getElementById('rider-name').value=p.name;
  document.getElementById('rider-ftp').value=p.ftpWatts;
  document.getElementById('rider-weight').value=p.weightKg;
  bikeTypeSelect.value=p.bikeType;
  bikeTypeSelect.dispatchEvent(new Event('change'));
  if(state.adaptiveGraphics!==p.preferences.adaptiveGraphics){const toggle=document.getElementById('adaptive-graphics-toggle');toggle.checked=p.preferences.adaptiveGraphics;toggle.dispatchEvent(new Event('change'));}
  if(state.recordGhost!==p.preferences.recordGhost){const toggle=document.getElementById('record-ghost-toggle');if(toggle){toggle.checked=p.preferences.recordGhost;toggle.dispatchEvent(new Event('change'));}else{state.recordGhost=p.preferences.recordGhost;}}
  for(const [id,key] of [['quality-select','quality'],['time-select','timeOfDay'],['ghost-mode-select','ghostMode']]) {
    const node=document.getElementById(id);
    if(state[key]!==p.preferences[key]){node.value=p.preferences[key];node.dispatchEvent(new Event('change'));}
  }
}

function persistRiderProfile() {
  if(profileLoading)return;
  try {
    saveProfile(localStorage,currentProfile());
    state.profileStorageMessage='Profile saved on this device.';
    document.getElementById('profile-save-status').classList.remove('is-error');
  } catch {
    state.profileStorageMessage='Could not save the profile. Check browser storage.';
    document.getElementById('profile-save-status').classList.add('is-error');
  }
  updateSessionUI();
}

document.getElementById('rider-name').addEventListener('change',e=>{
  state.riderName=normalizeProfile({name:e.target.value}).name;
  e.target.value=state.riderName;state.name=`You (${state.riderName})`;
});
for(const id of ['rider-name','rider-ftp','rider-weight','bike-type-select','quality-select','time-select','ghost-mode-select']) {
  document.getElementById(id).addEventListener('change',()=>{
    document.getElementById('rider-ftp').value=state.ftpWatts;
    document.getElementById('rider-weight').value=state.weightKg;
    persistRiderProfile();
  });
}

function storageMessage(text,isError=false) {
  const node=document.getElementById('ride-storage-status');node.hidden=!text;node.textContent=text;
  node.classList.toggle('is-error',isError);
  const hud=document.getElementById('hud-storage-status');hud.hidden=!isError;hud.textContent=isError?text:'';
  hud.classList.toggle('is-error',isError);
}

function persistRideRecovery() {
  if(!state.hasRideStarted||state.isRideFinished)return;
  try {
    const ride={};
    for(const key of ['distanceM','elapsedSeconds','energyJoules','elevationGainM','workoutElapsedSec','ghostTimeOffsetSec','recordGhostTimeOffsetSec','virtualGear','trainerMode','manualErgTargetWatts','workoutErgMode','trainerDifficultyPct','virtualShiftingMode','gearingProfile','downhillClampGrade','ergSoftStartSec','trainerResponsiveness','powerSmoothingSec'])ride[key]=state[key];
    for (const field of ['rideId', 'rideStartedAt', 'rideStartDistanceM', 'rideDistanceM', 'restoredLegacy']) ride[field] = state[field];
    ride.speedMps=state.isRidePaused?pausedSpeedMps:state.speedMps;
    ride.simulationWatts=usesKeyboardPower()?state.watts:null;
    ride.requiresTrainerReconnect=Boolean(state.requiresTrainerReconnect||state.trainerWasRequired);
    saveRecovery(localStorage,{version:1,savedAt:new Date().toISOString(),routeName:state.routeName,route:state.routeSource,
      profile:currentProfile(),ride,points:recordedPoints,zoneSeconds,workout:state.isWorkoutRunning?state.activeWorkout:null});
    lastRecoverySavedAt=Date.now();pendingRecovery=null;
    document.getElementById('ride-recovery-panel').hidden=true;
    storageMessage('Progress saved on this device.');
  } catch {storageMessage('Could not save ride progress. You can continue riding and export FIT or TCX.',true);}
}

function clearRideRecovery() {
  try {localStorage.removeItem(RIDE_RECOVERY_KEY);pendingRecovery=null;lastRecoverySavedAt=0;
    document.getElementById('ride-recovery-panel').hidden=true;storageMessage('');
  }catch {storageMessage('Could not delete the interrupted ride.',true);}
}

function clearFinishedRecovery(rideId) {
  try {
    if (readRecovery(localStorage).snapshot?.ride.rideId === rideId) clearRideRecovery();
  } catch {
    storageMessage('Could not read saved progress.', true);
  }
}

function initializeSavedData() {
  profileLoading=true;
  try {
    const result=readProfile(localStorage);applyRiderProfile(result.profile);
    state.profileStorageMessage=result.status==='loaded'?'Profile restored from this device.':result.status==='error'?'Could not read the profile. Default settings loaded.':'Profile changes are saved automatically.';
    document.getElementById('profile-save-status').classList.toggle('is-error',result.status==='error');
    const recovery=readRecovery(localStorage);pendingRecovery=recovery.snapshot;
    if(recovery.status!=='empty'){
      const panel=document.getElementById('ride-recovery-panel');panel.hidden=false;
      document.getElementById('btn-restore-ride').disabled=!pendingRecovery;
      document.getElementById('ride-recovery-description').textContent=pendingRecovery
        ? `${pendingRecovery.routeName} · ${formatTimeMMSS(pendingRecovery.ride.elapsedSeconds)}. The ride will open paused. Starting a new ride replaces this saved session.`
        : 'Could not read the interrupted ride. You can discard the damaged record.';
    }
  }catch{state.profileStorageMessage='Browser storage is unavailable. Profile and ride progress cannot be saved.';}
  finally{profileLoading=false;}
}

document.getElementById('btn-discard-ride').addEventListener('click',clearRideRecovery);
document.getElementById('btn-restore-ride').addEventListener('click',()=>{
  const saved=pendingRecovery;if(!saved)return;
  try {
    const points=saved.route.type==='preset'?generatePresetRoute(saved.route.key):parseGPXToRoute(saved.route.text);
    loadRouteIntoWorld(points,saved.routeName,saved.route);
    profileLoading=true;applyRiderProfile(saved.profile);profileLoading=false;
    const values=saved.ride;
    for(const key of ['elapsedSeconds','energyJoules','elevationGainM','workoutElapsedSec','ghostTimeOffsetSec','virtualGear','manualErgTargetWatts']){
      if(Number.isFinite(values[key]))state[key]=values[key];
    }
    state.trainerMode=values.trainerMode==='erg'?'erg':'sim';state.workoutErgMode=values.workoutErgMode!==false;
    if(Number.isFinite(values.trainerDifficultyPct))state.trainerDifficultyPct=Math.max(0,Math.min(100,values.trainerDifficultyPct));
    for(const [key,allowed] of Object.entries({virtualShiftingMode:['auto','always','off'],gearingProfile:['allaround','climbing','flat'],trainerResponsiveness:['smooth','standard','dynamic'],powerSmoothingSec:[1,3,5],downhillClampGrade:[-1.5,0,-15],ergSoftStartSec:[0,1,3,5]})) {
      if(allowed.includes(values[key]))state[key]=values[key];
    }
    for(const [id,key] of [['virtual-shifting-select','virtualShiftingMode'],['gearing-profile-select','gearingProfile'],['trainer-responsiveness-select','trainerResponsiveness'],['power-smoothing-select','powerSmoothingSec'],['downhill-clamp-select','downhillClampGrade'],['erg-softstart-select','ergSoftStartSec']]){
      const input=document.getElementById(id);if(input){const match=[...input.options].find(o=>o.value===String(state[key])||Number(o.value)===state[key]);if(match)input.value=match.value;}
    }
    document.getElementById('trainer-diff').value=state.trainerDifficultyPct;
    document.getElementById('trainer-diff-label').textContent=`${state.trainerDifficultyPct}%`;
    teleportToDistance(Math.min(values.distanceM,state.totalDistanceM-5));
    state.rideId = typeof values.rideId === 'string' && values.rideId ? values.rideId : newRideId();
    state.rideStartedAt = Number.isFinite(Date.parse(values.rideStartedAt)) ? values.rideStartedAt : saved.savedAt;
    state.rideStartDistanceM = values.rideStartDistanceM ?? Math.min(state.distanceM, saved.points[0]?.dist ?? state.distanceM);
    state.rideDistanceM = values.rideDistanceM ?? Math.max(0, state.distanceM - state.rideStartDistanceM);
    state.restoredLegacy = values.restoredLegacy === true || !Number.isFinite(values.rideDistanceM);
    state.ghostTimeOffsetSec=Number.isFinite(values.ghostTimeOffsetSec)?values.ghostTimeOffsetSec:0;
    state.recordGhostTimeOffsetSec=Number.isFinite(values.recordGhostTimeOffsetSec)?values.recordGhostTimeOffsetSec:0;
    recordedPoints.splice(0,recordedPoints.length,...saved.points);
    zoneSeconds.splice(0,7,...saved.zoneSeconds);
    state.activeWorkout=saved.workout;state.isWorkoutRunning=Boolean(saved.workout);
    if(saved.workout)selectWorkout(saved.workout);
    pausedSpeedMps=values.speedMps;state.speedMps=0;state.cadence=0;state.heartRate=0;
    if(Number.isFinite(values.simulationWatts)&&values.simulationWatts>=0&&values.simulationWatts<=800){state.watts=values.simulationWatts;state.smoothedWatts=values.simulationWatts;}
    state.requiresTrainerReconnect=values.requiresTrainerReconnect===true;
    state.trainerWasRequired=state.requiresTrainerReconnect;
    setSessionStatus(state,'paused');
    document.getElementById('workout-erg-toggle').checked=state.workoutErgMode;
    trainerModeSelect.value=state.trainerMode;
    highlightActiveRouteCard(saved.route.type==='preset'?`card-route-${saved.route.key}`:'card-route-gpx');
    persistRiderProfile();persistRideRecovery();storageMessage('Ride restored in pause. Connect devices and select “Resume ride.”');
    saveTrainerSettings();updateHUD();setMenuOpen(true,'home');
  }catch {profileLoading=false;storageMessage('Could not restore the ride. Your saved session is available to try again.',true);}
});

window.addEventListener('pagehide',persistRideRecovery);
document.addEventListener('visibilitychange',()=>{if(document.hidden)persistRideRecovery();});

window.addEventListener('resize', () => {
  adaptiveGraphics?.reset(false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Inicjalizacja domyslnej trasy gorskiej
loadRouteIntoWorld(generatePresetRoute('mountain'), 'Alpine Pass');
initializeSavedData();
updateHUD();
menuDialog.focus();
animate();
