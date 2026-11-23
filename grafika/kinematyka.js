import * as THREE from 'three';

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const _dirVec = new THREE.Vector3();

/**
 * Ustawia srodek i orientacje 3D segmentu (walca/kapsuly) dokladnie pomiedzy punktem A i punktem B
 */
function alignSegmentBetween(mesh, ptA, ptB) {
  mesh.position.lerpVectors(ptA, ptB, 0.5);
  _dirVec.subVectors(ptB, ptA);
  const len = _dirVec.length();
  if (len > 0.0001) {
    _dirVec.divideScalar(len);
    mesh.quaternion.setFromUnitVectors(UP_AXIS, _dirVec);
  }
}

/**
 * Tworzy rozbudowany model 3D kolarza (z dokladna kinematyka 2-kostna nog i rak oraz naturalnym pochyleniem tulowia)
 * oraz roweru szosowego Aero
 */
export function createCyclistMesh({
  frameColor = 0xf97316,
  jerseyColor = 0x0284c7,
  helmetColor = 0xf8fafc,
  label = null,
  isGhost = false,
  showPowerRing = false,
  hasHeadlight = false,
} = {}) {
  const group = new THREE.Group();
  const bikeGroup = new THREE.Group();
  group.add(bikeGroup);

  const matProps = isGhost
    ? { transparent: true, opacity: 0.52, emissive: jerseyColor, emissiveIntensity: 0.35 }
    : {};

  const frameMat = new THREE.MeshStandardMaterial({
    color: frameColor,
    roughness: 0.18,
    metalness: 0.65,
    envMapIntensity: 1.55,
    ...matProps,
  });
  const carbonMat = new THREE.MeshStandardMaterial({
    color: isGhost ? 0x1e293b : 0x111827,
    roughness: 0.26,
    metalness: 0.45,
    envMapIntensity: 1.4,
    ...matProps,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: isGhost ? 0x38bdf8 : 0x18181b,
    roughness: 0.85,
    ...matProps,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.18,
    metalness: 0.88,
    envMapIntensity: 1.65,
    ...matProps,
  });
  const kitMat = new THREE.MeshStandardMaterial({
    color: jerseyColor,
    roughness: 0.45,
    ...matProps,
  });
  const shortsMat = new THREE.MeshStandardMaterial({
    color: isGhost ? jerseyColor : 0x0f172a,
    roughness: 0.6,
    ...matProps,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: isGhost ? 0xbae6fd : 0xf5b076,
    roughness: 0.55,
    ...matProps,
  });
  const sockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5,
    ...matProps,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: isGhost ? 0xe0f2fe : 0xf8fafc,
    roughness: 0.25,
    metalness: 0.2,
    envMapIntensity: 0.9,
    ...matProps,
  });
  const helmetMat = new THREE.MeshStandardMaterial({
    color: helmetColor,
    roughness: 0.2,
    metalness: 0.18,
    envMapIntensity: 1.3,
    ...matProps,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.08,
    metalness: 0.9,
    envMapIntensity: 1.85,
    emissive: 0x0284c7,
    emissiveIntensity: 0.25,
    ...matProps,
  });

  // Poswiata strefy mocy pod rowerem (w stylu Zwift)
  let powerRingMat = null;
  if (showPowerRing || isGhost) {
    const ringGeo = new THREE.RingGeometry(0.44, 0.72, 32);
    powerRingMat = new THREE.MeshBasicMaterial({
      color: isGhost ? 0xa855f7 : 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: isGhost ? 0.45 : 0.6,
    });
    const ringMesh = new THREE.Mesh(ringGeo, powerRingMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.025;
    group.add(ringMesh);
  }

  // ==========================================================================
  // 1. KOLA KARBONOWE AERO (DEEP SECTION + TARCZE HAMULCOWE)
  // ==========================================================================
  function createAeroWheel() {
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.028, 12, 28), tireMat);
    tire.rotation.y = Math.PI / 2;

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.032, 8, 28), carbonMat);
    rim.rotation.y = Math.PI / 2;
    rim.scale.z = 0.35;

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.11, 10), metalMat);
    hub.rotation.z = Math.PI / 2;

    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.006, 16), metalMat);
    rotor.rotation.z = Math.PI / 2;
    rotor.position.x = -0.04;

    const spokeGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.58, 6);
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(spokeGeo, metalMat);
      sp.rotation.x = (i * Math.PI) / 4;
      wheel.add(sp);
    }

    wheel.add(tire, rim, hub, rotor);
    if (!isGhost) tire.castShadow = true;
    return wheel;
  }

  const rearWheel = createAeroWheel();
  rearWheel.position.set(0, 0.34, -0.52);

  const frontWheel = createAeroWheel();
  frontWheel.position.set(0, 0.34, 0.52);

  bikeGroup.add(rearWheel, frontWheel);

  // ==========================================================================
  // 2. RAMA AERO (PRECYZYJNIE POLACZONE WEZLY RAMY)
  // ==========================================================================
  const pBB = new THREE.Vector3(0, 0.35, -0.08);
  const pSeatPost = new THREE.Vector3(0, 0.86, -0.25);
  const pHeadTop = new THREE.Vector3(0, 0.83, 0.33);
  const pHeadBot = new THREE.Vector3(0, 0.68, 0.37);

  function makeTube(pt1, pt2, r = 0.022, mat = frameMat) {
    const len = pt1.distanceTo(pt2);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    alignSegmentBetween(mesh, pt1, pt2);
    if (!isGhost) mesh.castShadow = true;
    return mesh;
  }

  const topTube = makeTube(new THREE.Vector3(0, 0.8, -0.23), pHeadTop, 0.022);
  const seatTube = makeTube(pBB, pSeatPost, 0.023);
  const downTube = makeTube(pBB, pHeadBot, 0.026);
  const headTube = makeTube(pHeadBot, pHeadTop, 0.026);

  for (const side of [-1, 1]) {
    const pRearHub = new THREE.Vector3(side * 0.045, 0.34, -0.52);
    const pFrontHub = new THREE.Vector3(side * 0.045, 0.34, 0.52);
    const pForkCrown = new THREE.Vector3(side * 0.025, 0.68, 0.37);
    const pSeatStayTop = new THREE.Vector3(side * 0.02, 0.74, -0.21);

    bikeGroup.add(
      makeTube(pRearHub, pSeatStayTop, 0.011),
      makeTube(pRearHub, new THREE.Vector3(side * 0.03, 0.35, -0.08), 0.013),
      makeTube(pFrontHub, pForkCrown, 0.014)
    );
  }

  // Korba i tarcza (Chainring)
  const crankGroup = new THREE.Group();
  crankGroup.position.copy(pBB);
  const chainring = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20), carbonMat);
  chainring.rotation.z = Math.PI / 2;
  chainring.position.x = 0.055;
  const leftCrankArm = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.17, 0.028), carbonMat);
  leftCrankArm.position.set(-0.065, 0.08, 0);
  const rightCrankArm = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.17, 0.028), carbonMat);
  rightCrankArm.position.set(0.065, -0.08, 0);
  crankGroup.add(chainring, leftCrankArm, rightCrankArm);

  // Siodelko
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.032, 0.25), carbonMat);
  saddle.position.set(0, 0.89, -0.26);

  // Bidon w koszyku
  const bottle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.18, 10),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, ...matProps })
  );
  alignSegmentBetween(
    bottle,
    new THREE.Vector3(0, 0.46, 0.04),
    new THREE.Vector3(0, 0.6, 0.15)
  );

  // Kierownica szosowa (Baranek + Klamkomanetki + Licznik GPS)
  const cockpitGroup = new THREE.Group();
  cockpitGroup.position.set(0, 0.86, 0.34);

  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.03, 0.11), carbonMat);
  stem.position.set(0, 0, 0.04);

  const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.4, 10), carbonMat);
  topBar.rotation.z = Math.PI / 2;
  topBar.position.set(0, 0, 0.09);

  const dropGeo = new THREE.TorusGeometry(0.07, 0.014, 8, 16, Math.PI * 1.15);
  for (const side of [-1, 1]) {
    const drop = new THREE.Mesh(dropGeo, carbonMat);
    drop.rotation.y = Math.PI / 2;
    drop.rotation.z = -0.3;
    drop.position.set(side * 0.19, -0.055, 0.11);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.07, 0.06), carbonMat);
    hood.rotation.x = 0.25;
    hood.position.set(side * 0.19, 0.03, 0.15);
    cockpitGroup.add(drop, hood);
  }

  const gpsScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.052, 0.012, 0.075),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  gpsScreen.rotation.x = -0.2;
  gpsScreen.position.set(0, 0.022, 0.14);
  cockpitGroup.add(stem, topBar, gpsScreen);

  const tailLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.024, 0.045, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xff1133 })
  );
  tailLight.position.set(0, 0.81, -0.26);

  let headlightMesh = null;
  if (hasHeadlight) {
    const coneGeo = new THREE.ConeGeometry(1.8, 9.5, 20, 1, true);
    coneGeo.rotateX(Math.PI / 2);
    coneGeo.translate(0, -0.15, 5.1);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    headlightMesh = new THREE.Mesh(coneGeo, coneMat);
    cockpitGroup.add(headlightMesh);
  }

  bikeGroup.add(
    topTube,
    seatTube,
    downTube,
    headTube,
    crankGroup,
    saddle,
    bottle,
    cockpitGroup,
    tailLight
  );

  // ==========================================================================
  // 3. KOLARZ 3D: TULOW, GLOWA, DWUSEGMENTOWE RECE I DWUSEGMENTOWE NOGI (IK)
  // ==========================================================================
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 12), shortsMat);
  hips.scale.set(1.05, 0.88, 1.05);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.36, 10, 14), kitMat);
  if (!isGhost) torso.castShadow = true;

  const headGroup = new THREE.Group();
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.1, 8), skinMat);
  neck.position.set(0, -0.06, -0.02);
  neck.rotation.x = 0.35;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.112, 14, 14), skinMat);

  const visor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.116, 0.116, 0.052, 16, 1, true, -Math.PI * 0.38, Math.PI * 0.76),
    visorMat
  );
  visor.rotation.y = Math.PI;
  visor.position.set(0, 0.005, 0.01);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.134, 14, 14), helmetMat);
  helmet.scale.set(0.96, 0.82, 1.3);
  helmet.position.set(0, 0.048, -0.015);
  if (!isGhost) helmet.castShadow = true;

  const helmetStripe = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.085, 0.32), frameMat);
  helmetStripe.position.set(0, 0.115, -0.015);

  headGroup.add(neck, head, visor, helmet, helmetStripe);

  // Dwusegmentowe rece (Ramie + Lokiec + Przedramie + Rekawiczka na klamkomanetce)
  function createArticulatedArm(side) {
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.2, 6, 8), kitMat);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), skinMat);
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.21, 6, 8), skinMat);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), shortsMat);
    glove.position.set(side * 0.19, 0.9, 0.48);

    bikeGroup.add(upperArm, elbow, forearm, glove);
    return { upperArm, elbow, forearm, glove, side };
  }

  const leftArm = createArticulatedArm(-1);
  const rightArm = createArticulatedArm(1);

  // Dwusegmentowe nogi (Udo + Kolano + Lydka + Skarpetka + But zatrzaskowy)
  function createArticulatedLeg(side) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.24, 8, 10), shortsMat);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.056, 8, 8), skinMat);
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.24, 8, 10), skinMat);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.04, 0.11, 8), sockMat);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.05, 0.17), shoeMat);

    if (!isGhost) {
      thigh.castShadow = true;
      calf.castShadow = true;
    }

    bikeGroup.add(thigh, knee, calf, sock, shoe);
    return { thigh, knee, calf, sock, shoe, side };
  }

  const leftLeg = createArticulatedLeg(-1);
  const rightLeg = createArticulatedLeg(1);

  bikeGroup.add(hips, torso, headGroup);

  // Opcjonalna tabliczka nad glowa bota / Ducha
  if (label) {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = isGhost ? 'rgba(88, 28, 135, 0.88)' : 'rgba(15, 23, 42, 0.85)';
    ctx.roundRect(4, 4, 272, 56, 14);
    ctx.fill();
    ctx.strokeStyle = isGhost ? '#c084fc' : '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 140, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.65, 0.38, 1);
    sprite.position.set(0, 1.94, 0);
    group.add(sprite);
  }

  return {
    group,
    bikeGroup,
    rearWheel,
    frontWheel,
    crankGroup,
    torso,
    hips,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    powerRingMat,
    headlightMesh,
    kitMat,
    frameMat,
    wheelAngle: 0,
    crankAngle: 0,
    currentLeanRad: 0,
    standBlend: 0,
    tuckBlend: 0,
    sprintBlend: 0,
    isSprinting: false,
    sprintEffort: null,
  };
}

/**
 * Detect an intentional effort from short-filtered power versus a slower baseline.
 * The detector belongs to each avatar, so all four designs use the same motion.
 * It does not change power, speed or trainer resistance.
 */
export function updateSprintEffort(avatar, powerWatts, ftpWatts, cadenceRpm, speedMps, dt, enabled = true) {
  if (!Number.isFinite(dt) || dt <= 0) return avatar.isSprinting || false;
  const step = Math.min(dt, 0.1);
  const power = Number.isFinite(powerWatts) ? Math.max(0, powerWatts) : 0;
  const ftp = Number.isFinite(ftpWatts) && ftpWatts > 0 ? ftpWatts : 250;
  const effort = avatar.sprintEffort ??= {
    fastWatts: power, baselineWatts: power, age: 0, burstTime: 0,
    hardTime: 0, activeTime: 0, releaseTime: 0, cooldown: 0, peakWatts: power,
  };
  const pedalling = enabled && cadenceRpm > 35 && speedMps > 0.8;
  if (!pedalling) {
    effort.fastWatts = effort.baselineWatts = power;
    effort.age = effort.burstTime = effort.hardTime = 0;
    effort.activeTime = effort.releaseTime = effort.cooldown = 0;
    avatar.isSprinting = false;
    return false;
  }

  effort.age += step;
  effort.fastWatts += (power - effort.fastWatts) * (1 - Math.exp(-step / 0.16));
  const rise = effort.fastWatts - effort.baselineWatts;
  const burst = power >= Math.max(220, ftp * 1.05) &&
    effort.fastWatts >= Math.max(220, ftp * 1.05) &&
    rise >= Math.max(75, ftp * 0.3, effort.baselineWatts * 0.35);
  const hardEffort = power >= Math.max(360, ftp * 1.5) &&
    effort.fastWatts >= Math.max(360, ftp * 1.5);
  effort.baselineWatts += (power - effort.baselineWatts) * (1 - Math.exp(-step / 3.5));
  effort.cooldown = Math.max(0, effort.cooldown - step);

  if (avatar.isSprinting) {
    effort.activeTime += step;
    effort.peakWatts = Math.max(effort.peakWatts, effort.fastWatts);
    const releaseBelow = Math.max(340, ftp * 1.4, effort.peakWatts * 0.65);
    effort.releaseTime = effort.fastWatts < releaseBelow ? effort.releaseTime + step : 0;
    if (effort.activeTime >= 2 && effort.releaseTime >= 0.6) {
      avatar.isSprinting = false;
      effort.cooldown = 0.8;
      effort.burstTime = effort.hardTime = 0;
    }
  } else if (effort.age >= 0.4 && effort.cooldown === 0) {
    effort.burstTime = burst ? effort.burstTime + step : 0;
    effort.hardTime = hardEffort ? effort.hardTime + step : 0;
    if (effort.burstTime >= 0.16 || effort.hardTime >= 0.35) {
      avatar.isSprinting = true;
      effort.activeTime = effort.releaseTime = 0;
      effort.peakWatts = effort.fastWatts;
    }
  }
  return avatar.isSprinting;
}

const _pHip = new THREE.Vector3();
const _pKnee = new THREE.Vector3();
const _pAnkle = new THREE.Vector3();
const _pShoulder = new THREE.Vector3();
const _pElbow = new THREE.Vector3();
const _pHand = new THREE.Vector3();

/**
 * Dokladna kinematyka odwrotna 2D/3D (Twierdzenie Cosinusow) dla nogi kolarza: Biodro -> Kolano -> Kostka -> Pedal
 */
function updateLegIK(leg, hipCenter, pedalAngle, standBlend) {
  const x = leg.side * 0.115;
  const bbY = 0.35;
  const bbZ = -0.08;
  const crankR = 0.165;

  const pedalY = bbY + Math.sin(pedalAngle) * crankR;
  const pedalZ = bbZ + Math.cos(pedalAngle) * crankR;

  const ankleY = pedalY + 0.045;
  const ankleZ = pedalZ - 0.025;

  const hipY = hipCenter.y - 0.02;
  const hipZ = hipCenter.z + 0.01;

  const dy = ankleY - hipY;
  const dz = ankleZ - hipZ;
  const L1 = 0.36; // Dlugosc uda
  const L2 = 0.36; // Dlugosc lydki
  const dist = Math.min(Math.hypot(dy, dz), L1 + L2 - 0.005);

  // Kat od biodra do kostki w plaszczyznie (Z, Y)
  const baseAngle = Math.atan2(dy, dz);
  const cosAlpha = THREE.MathUtils.clamp(
    (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * Math.max(0.05, dist)),
    -1,
    1
  );
  const alpha = Math.acos(cosAlpha);

  // Kolano zgina sie w przod i w gore (+kat wzgledem osi biodro-kostka)
  const kneeAngle = baseAngle + alpha;
  const kneeZ = hipZ + Math.cos(kneeAngle) * L1;
  const kneeY = hipY + Math.sin(kneeAngle) * L1;

  _pHip.set(x, hipY, hipZ);
  _pKnee.set(x, kneeY, kneeZ);
  _pAnkle.set(x, ankleY, ankleZ);

  leg.knee.position.copy(_pKnee);
  alignSegmentBetween(leg.thigh, _pHip, _pKnee);
  alignSegmentBetween(leg.calf, _pKnee, _pAnkle);

  // Skarpetka (dolna czesc lydki)
  leg.sock.position.lerpVectors(_pAnkle, _pKnee, 0.22);
  leg.sock.quaternion.copy(leg.calf.quaternion);

  // But zatrzaskowy na pedale
  leg.shoe.position.set(x, pedalY + 0.022, pedalZ + 0.035);
  leg.shoe.rotation.x = THREE.MathUtils.lerp(Math.cos(pedalAngle) * 0.16, 0.12, standBlend);
}

/**
 * Kinematyka ramienia: Bark -> Lokiec -> Dlon na klamkomanetce
 */
function updateArmIK(arm, shoulderCenter, tuckBlend) {
  const x = arm.side * 0.175;
  _pShoulder.set(x, shoulderCenter.y - 0.02, shoulderCenter.z);
  _pHand.set(arm.side * 0.19, 0.9 - tuckBlend * 0.04, 0.48);

  // Lokiec lekko ugiety w dol i w tyl
  const midY = (_pShoulder.y + _pHand.y) * 0.5 - (0.045 + tuckBlend * 0.05);
  const midZ = (_pShoulder.z + _pHand.z) * 0.5 - 0.03;
  _pElbow.set(x * 1.06, midY, midZ);

  arm.elbow.position.copy(_pElbow);
  arm.glove.position.copy(_pHand);
  alignSegmentBetween(arm.upperArm, _pShoulder, _pElbow);
  alignSegmentBetween(arm.forearm, _pElbow, _pHand);
}

/**
 * Animuje obrot kol, korby, dokladna kinematyke IK kolan/lokci, plynna pozycje tulowia oraz naturalne pochylenie w zakretach
 */
export function animateCyclistMesh(
  avatar,
  speedMps,
  cadenceRpm,
  dt,
  { gradePct = 0, turnAngleDeg = 0, watts = 150, rawWatts = watts,
    ftpWatts = 250, effortActive = true, roadLeanApplied = false } = {}
) {
  avatar.wheelAngle += (speedMps / 0.34) * dt;
  avatar.rearWheel.rotation.x = avatar.wheelAngle;
  avatar.frontWheel.rotation.x = avatar.wheelAngle;

  // +Z is forward. With y=sin(phase), z=cos(phase), forward pedalling
  // decreases the phase: the pedal in front of the axle must move down.
  if (cadenceRpm > 0) {
    avatar.crankAngle -= (cadenceRpm / 60) * Math.PI * 2 * dt;
  } else if (speedMps > 0.8) {
    // Podczas jazdy wybiegiem (coasting) pedaly lagodnie poziomuja sie w naturalnej pozycji horyzontalnej
    const targetCoastAngle = Math.round(avatar.crankAngle / Math.PI) * Math.PI;
    avatar.crankAngle = THREE.MathUtils.lerp(avatar.crankAngle, targetCoastAngle, Math.min(1, dt * 2.8));
  }
  if (avatar.crankGroup) {
    // The fallback crank arms start along +Y rather than the GLB's +Z.
    avatar.crankGroup.rotation.x = Math.PI / 2 - avatar.crankAngle;
  }

  // Raw telemetry bypasses the selectable 1/3/5 s HUD smoothing. A short filter
  // and confirmation time still reject single-sample spikes.
  const sprinting = updateSprintEffort(avatar, rawWatts, ftpWatts, cadenceRpm, speedMps, dt, effortActive);
  avatar.sprintBlend = THREE.MathUtils.lerp(avatar.sprintBlend, sprinting ? 1 : 0,
    1 - Math.exp(-dt * (sprinting ? 7 : 4)));

  // Stay seated during steady flat riding; rise for a detected surge or climb.
  const wantStand =
    (gradePct >= 8.0 || sprinting) && cadenceRpm > 30 && speedMps > 0.8
      ? 1
      : 0;
  const wantTuck = gradePct <= -3.8 && speedMps > 13.5 && wantStand === 0 ? 1 : 0;

  avatar.standBlend = THREE.MathUtils.lerp(avatar.standBlend, wantStand, 1 - Math.exp(-dt * 4.5));
  avatar.tuckBlend = THREE.MathUtils.lerp(avatar.tuckBlend, wantTuck, 1 - Math.exp(-dt * 4.5));

  const sb = avatar.standBlend;
  const tb = avatar.tuckBlend;
  const sp = avatar.sprintBlend * sb;

  // Pozycja bioder oraz barkow (Tulow jest zawsze idealnie rozpiety miedzy biodrami a barkami!)
  const pedalBob = Math.abs(Math.sin(avatar.crankAngle)) * (0.012 + sb * 0.022);
  const hipY = 0.94 + sb * 0.09 - tb * 0.03 + pedalBob;
  const hipZ = -0.22 + sb * 0.14 + tb * 0.04 + sp * 0.025;

  const shoulderY = 1.24 + sb * 0.06 - tb * 0.12 + pedalBob * 0.8 - sp * 0.07;
  const shoulderZ = 0.14 + sb * 0.09 + tb * 0.06 + sp * 0.07;

  avatar.hips.position.set(0, hipY, hipZ);
  _pShoulder.set(0, shoulderY, shoulderZ);

  // Ustaw tulow dokladnie od bioder do barkow
  alignSegmentBetween(avatar.torso, avatar.hips.position, _pShoulder);

  // Glowa osadzona na barkach, patrzaca prosto przed siebie
  avatar.headGroup.position.set(0, shoulderY + 0.13 - tb * 0.02, shoulderZ + 0.1);

  // Pochylenie w zakretach (DO WEWNATRZ luku: turnAngleDeg > 0 to zakret w prawo -> dodatni rotation.z pochyla w prawo)
  const speedFactor = THREE.MathUtils.clamp((speedMps - 3.0) / 11.0, 0, 1);
  const targetLean = roadLeanApplied ? 0 : THREE.MathUtils.clamp(
    (turnAngleDeg / 55) * speedFactor * 0.21,
    -0.22,
    0.22
  );
  avatar.currentLeanRad = THREE.MathUtils.lerp(avatar.currentLeanRad, targetLean, 1 - Math.exp(-dt * 5));

  // Rider and bicycle share this rigid pivot: no sideways drift while seated,
  // and a stronger, crank-synchronised effort when sprinting out of the saddle.
  const standSway = Math.sin(avatar.crankAngle) * (0.03 * sb + 0.045 * sp);
  avatar.bikeGroup.rotation.z = avatar.currentLeanRad + standSway;

  // Aktualizacja rak i nog (IK)
  updateArmIK(avatar.leftArm, _pShoulder, tb);
  updateArmIK(avatar.rightArm, _pShoulder, tb);

  const leftAngle = tb > 0.6 && cadenceRpm < 25 ? 0 : avatar.crankAngle;
  const rightAngle = tb > 0.6 && cadenceRpm < 25 ? Math.PI : avatar.crankAngle + Math.PI;

  updateLegIK(avatar.leftLeg, avatar.hips.position, leftAngle, sb);
  updateLegIK(avatar.rightLeg, avatar.hips.position, rightAngle, sb);
}
