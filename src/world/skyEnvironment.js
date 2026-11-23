import * as THREE from 'three';

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vWorldDir;

  uniform vec3 uZenithColor;
  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform vec3 uCloudLitColor;
  uniform vec3 uCloudShadowColor;
  uniform float uCloudOpacity;
  uniform float uStarIntensity;
  uniform float uSunDiscIntensity;
  uniform float uTime;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbmClouds(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += amp * noise2D(p);
      p = rot * p * 2.03 + vec2(17.1, 31.7);
      amp *= 0.5;
    }
    return v;
  }

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    vec3 sunDir = normalize(uSunDirection);
    float y = dir.y;

    // 1. Atmosferyczny gradient nieba (Rayleigh + pas horyzontu Mie)
    float h = clamp(y, 0.0, 1.0);
    vec3 skyGrad = mix(uHorizonColor, uSkyColor, pow(h, 0.42));
    skyGrad = mix(skyGrad, uZenithColor, pow(h, 1.28));

    // Ciepła poświata horyzontalna od strony słońca
    vec2 horizDir = normalize(dir.xz + vec2(0.0001));
    vec2 horizSun = normalize(sunDir.xz + vec2(0.0001));
    float sunAzimuth = max(dot(horizDir, horizSun), 0.0);
    float horizonBand = exp(-h * 7.2) * (0.28 + 0.72 * pow(sunAzimuth, 2.2));
    skyGrad = mix(skyGrad, mix(uHorizonColor, uSunColor, 0.55), clamp(horizonBand * 0.52, 0.0, 0.65));

    // Poniżej linii horyzontu — płynne przejście w barwę doliny (dla odbić PBR i niskich kamer)
    if (y < 0.0) {
      float groundMix = clamp(-y * 3.8, 0.0, 1.0);
      skyGrad = mix(uHorizonColor, uGroundColor, groundMix);
    }

    // 2. Gwiazdy na nocnym / zmierzchowym niebie
    if (uStarIntensity > 0.01 && y > 0.06) {
      vec3 starGrid = floor(dir * 190.0);
      float starSeed = hash31(starGrid);
      if (starSeed > 0.9935) {
        vec3 cellCenter = normalize((starGrid + 0.5) / 190.0);
        float dist = length(dir - cellCenter) * 190.0;
        float twinkle = 0.68 + 0.32 * sin(uTime * 2.4 + starSeed * 620.0);
        float starSpot = smoothstep(0.42, 0.04, dist) * twinkle;
        float starMask = smoothstep(0.06, 0.28, y) * uStarIntensity;
        vec3 starCol = mix(vec3(0.78, 0.88, 1.0), vec3(1.0, 0.96, 0.88), fract(starSeed * 73.0));
        skyGrad += starCol * starSpot * starMask * 1.35;
      }
    }

    // 3. Tarcza słoneczna / księżycowa oraz korona rozpraszania Mie
    float mu = max(dot(dir, sunDir), 0.0);
    float aboveHorizon = smoothstep(-0.04, 0.03, y);
    float mieWide = pow(mu, 6.0) * 0.34;
    float mieCore = pow(mu, 72.0) * 0.68;
    float sunDisc = smoothstep(0.9985, 0.99945, mu) * uSunDiscIntensity;
    skyGrad += uSunColor * (mieWide + mieCore + sunDisc) * aboveHorizon;

    // 4. Dwuwarstwowe chmury (Cumulus + wysokie pasma Cirrus) z podświetleniem od słońca
    if (y > 0.02 && uCloudOpacity > 0.01) {
      float domeProj = 1.0 / (y + 0.17);
      vec2 windDrift = vec2(uTime * 0.0085, uTime * 0.0035);
      vec2 cloudUV = dir.xz * domeProj * 0.62 + windDrift;

      float baseNoise = fbmClouds(cloudUV);
      float detailNoise = fbmClouds(cloudUV * 2.35 - windDrift * 1.4);
      float combined = mix(baseNoise, detailNoise, 0.34);

      float cumulus = smoothstep(0.45, 0.78, combined);

      // Pasma wysokich chmur pierzastych (Cirrus)
      vec2 cirrusUV = dir.xz * domeProj * vec2(0.38, 1.15) + windDrift * 0.45;
      float cirrus = smoothstep(0.56, 0.82, noise2D(cirrusUV * 2.2) * 0.65 + noise2D(cirrusUV * 4.8) * 0.35) * 0.38;

      float cloudDensity = clamp(cumulus + cirrus * (1.0 - cumulus), 0.0, 1.0);

      if (cloudDensity > 0.005) {
        // Próbka w stronę słońca do wyznaczenia grubości optycznej i złotej/srebrnej krawędzi (rim lighting)
        vec2 sunStepUV = cloudUV + horizSun * 0.14;
        float sunSideDensity = fbmClouds(sunStepUV);
        float lightTrans = clamp(1.0 - (sunSideDensity - combined) * 1.9, 0.18, 1.0);
        float silverLining = pow(mu, 5.0) * (1.0 - cumulus * 0.55) * 0.85;

        vec3 cloudCol = mix(uCloudShadowColor, uCloudLitColor, lightTrans);
        cloudCol += uSunColor * silverLining;

        // Płynne zanikanie chmur przy samym horyzoncie (spójne z mgłą i górami)
        float horizonFade = smoothstep(0.025, 0.21, y);
        float finalAlpha = cloudDensity * horizonFade * uCloudOpacity;
        skyGrad = mix(skyGrad, cloudCol, clamp(finalAlpha, 0.0, 0.92));
      }
    }

    gl_FragColor = vec4(skyGrad, 1.0);
  }
`;

export const SKY_PRESETS = Object.freeze({
  day: {
    zenith: new THREE.Color(0x1e5ca8),
    sky: new THREE.Color(0x5296d6),
    horizon: new THREE.Color(0x7fb2e5),
    ground: new THREE.Color(0x2d4c22),
    sun: new THREE.Color(0xfffbeb),
    cloudLit: new THREE.Color(0xffffff),
    cloudShadow: new THREE.Color(0x9ec1e6),
    sunDir: new THREE.Vector3(0.48, 0.74, 0.47).normalize(),
    cloudOpacity: 0.78,
    starIntensity: 0.0,
    sunDiscIntensity: 2.1,
    cloudMeshColor: new THREE.Color(0xffffff),
    cloudMeshEmissive: new THREE.Color(0xdbeafe),
    cloudMeshEmissiveInt: 0.45,
    envIntensity: 1.15,
  },
  sunset: {
    zenith: new THREE.Color(0x292556),
    sky: new THREE.Color(0xd9480f),
    horizon: new THREE.Color(0xf97316),
    ground: new THREE.Color(0x3b180c),
    sun: new THREE.Color(0xffedd5),
    cloudLit: new THREE.Color(0xfed7aa),
    cloudShadow: new THREE.Color(0x7c2d12),
    sunDir: new THREE.Vector3(0.64, 0.24, 0.73).normalize(),
    cloudOpacity: 0.86,
    starIntensity: 0.16,
    sunDiscIntensity: 2.6,
    cloudMeshColor: new THREE.Color(0xffedd5),
    cloudMeshEmissive: new THREE.Color(0xf97316),
    cloudMeshEmissiveInt: 0.52,
    envIntensity: 1.35,
  },
  night: {
    zenith: new THREE.Color(0x030712),
    sky: new THREE.Color(0x081121),
    horizon: new THREE.Color(0x0f172a),
    ground: new THREE.Color(0x020617),
    sun: new THREE.Color(0x93c5fd),
    cloudLit: new THREE.Color(0x334155),
    cloudShadow: new THREE.Color(0x090f1d),
    sunDir: new THREE.Vector3(-0.42, 0.62, 0.66).normalize(),
    cloudOpacity: 0.45,
    starIntensity: 1.0,
    sunDiscIntensity: 1.35,
    cloudMeshColor: new THREE.Color(0x334155),
    cloudMeshEmissive: new THREE.Color(0x1e293b),
    cloudMeshEmissiveInt: 0.22,
    envIntensity: 0.85,
  },
  dusk: {
    zenith: new THREE.Color(0x0b132b),
    sky: new THREE.Color(0x1e293b),
    horizon: new THREE.Color(0x334155),
    ground: new THREE.Color(0x090f1b),
    sun: new THREE.Color(0xfdba74),
    cloudLit: new THREE.Color(0x94a3b8),
    cloudShadow: new THREE.Color(0x1e293b),
    sunDir: new THREE.Vector3(0.68, 0.11, 0.72).normalize(),
    cloudOpacity: 0.64,
    starIntensity: 0.72,
    sunDiscIntensity: 1.65,
    cloudMeshColor: new THREE.Color(0x94a3b8),
    cloudMeshEmissive: new THREE.Color(0x334155),
    cloudMeshEmissiveInt: 0.28,
    envIntensity: 0.95,
  },
});

function createUniformsFromPreset(preset) {
  return {
    uZenithColor: { value: preset.zenith.clone() },
    uSkyColor: { value: preset.sky.clone() },
    uHorizonColor: { value: preset.horizon.clone() },
    uGroundColor: { value: preset.ground.clone() },
    uSunColor: { value: preset.sun.clone() },
    uSunDirection: { value: preset.sunDir.clone() },
    uCloudLitColor: { value: preset.cloudLit.clone() },
    uCloudShadowColor: { value: preset.cloudShadow.clone() },
    uCloudOpacity: { value: preset.cloudOpacity },
    uStarIntensity: { value: preset.starIntensity },
    uSunDiscIntensity: { value: preset.sunDiscIntensity },
    uTime: { value: 0.0 },
  };
}

/**
 * Buduje kopułę nieba 3D (Rayleigh/Mie + słońce + chmury warstwowe + gwiazdy)
 * oraz prefiltrowane mapy środowiskowe PBR (PMREM) dla realistycznych odbić na ramie roweru,
 * kołach karbonowych, kasku, okularach i wodzie.
 */
export function createSkyEnvironment(renderer, scene) {
  const uniforms = createUniformsFromPreset(SKY_PRESETS.day);

  const skyGeo = new THREE.SphereGeometry(3300, 40, 24);
  const skyMat = new THREE.ShaderMaterial({
    name: 'OskiRide_SkyDomeShader',
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });

  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.name = 'OskiRide_SkyDome';
  skyMesh.renderOrder = -1000;
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);

  // Wygeneruj 3 prefiltrowane mapy środowiskowe PBR (PMREM) raz podczas startu (0 alokacji w pętli!)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileCubemapShader();

  const envTargets = {};
  const envScene = new THREE.Scene();
  const envSkyGeo = new THREE.SphereGeometry(80, 32, 20);
  const envUniforms = createUniformsFromPreset(SKY_PRESETS.day);
  const envSkyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    uniforms: envUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const envSkyMesh = new THREE.Mesh(envSkyGeo, envSkyMat);
  envScene.add(envSkyMesh);

  // Dodatkowe panele świetlne w scenie PMREM podostrzające refleksy na zaoblonych rurach ramy roweru i kasku
  const sunCardGeo = new THREE.SphereGeometry(7.5, 16, 12);
  const sunCardMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sunCardMesh = new THREE.Mesh(sunCardGeo, sunCardMat);
  envScene.add(sunCardMesh);

  // Cząsteczki atmosferyczne 3D (pyłki w promieniach słońca / mgiełka wieczorna) — zawijane na GPU (0 alokacji CPU)
  const motesCount = 160;
  const motesPositions = new Float32Array(motesCount * 3);
  const motesSeeds = new Float32Array(motesCount * 2);
  for (let i = 0; i < motesCount; i++) {
    motesPositions[i * 3] = ((i * 73) % 100) / 100 * 34 - 17;
    motesPositions[i * 3 + 1] = ((i * 137) % 100) / 100 * 11 - 2;
    motesPositions[i * 3 + 2] = ((i * 193) % 100) / 100 * 34 - 17;
    motesSeeds[i * 2] = (i * 0.6180339887) % 1;
    motesSeeds[i * 2 + 1] = 0.65 + ((i * 29) % 10) * 0.08;
  }
  const motesGeo = new THREE.BufferGeometry();
  motesGeo.setAttribute('position', new THREE.BufferAttribute(motesPositions, 3));
  motesGeo.setAttribute('aSeed', new THREE.BufferAttribute(motesSeeds, 2));

  const motesUniforms = {
    uCameraPos: { value: new THREE.Vector3() },
    uTime: { value: 0.0 },
    uMoteColor: { value: new THREE.Color(0xfffbeb) },
    uMoteOpacity: { value: 0.38 },
  };

  const motesMat = new THREE.ShaderMaterial({
    name: 'OskiRide_AtmosphericMotesShader',
    uniforms: motesUniforms,
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform vec3 uCameraPos;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 boxSize = vec3(34.0, 11.0, 34.0);
        vec3 halfBox = boxSize * 0.5;
        vec3 drift = vec3(
          sin(uTime * 0.45 + aSeed.x * 6.2831) * 1.4 + uTime * 0.35,
          sin(uTime * 0.7 + aSeed.x * 12.566) * 0.55,
          cos(uTime * 0.38 + aSeed.x * 6.2831) * 1.4
        );
        vec3 rel = mod(position + drift - uCameraPos + halfBox, boxSize) - halfBox;
        vec3 worldPos = uCameraPos + rel;
        worldPos.y = max(uCameraPos.y - 1.2, worldPos.y);
        vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
        float dist = length(rel);
        float edgeFade = smoothstep(17.0, 5.5, dist) * smoothstep(1.2, 3.2, dist);
        float shimmer = 0.55 + 0.45 * sin(uTime * 2.2 + aSeed.x * 31.415);
        vAlpha = edgeFade * shimmer;
        gl_PointSize = clamp((22.0 * aSeed.y) / max(1.0, -mvPosition.z), 1.5, 6.5);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uMoteColor;
      uniform float uMoteOpacity;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float r2 = dot(c, c);
        if (r2 > 0.25) discard;
        float soft = exp(-r2 * 14.0);
        gl_FragColor = vec4(uMoteColor, soft * vAlpha * uMoteOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  const motesMesh = new THREE.Points(motesGeo, motesMat);
  motesMesh.name = 'OskiRide_AtmosphericMotes';
  motesMesh.frustumCulled = false;
  scene.add(motesMesh);

  // Linie pędu 3D (Aero Speed Lines >48 km/h oraz podczas sprintu na stojąco) — 1 draw call, 0 alokacji CPU
  const streakCount = 72;
  const streakPositions = new Float32Array(streakCount * 6);
  const streakMeta = new Float32Array(streakCount * 6); // [phase, speed, endFlag(0 lub 1)] na każdy wierzchołek
  for (let i = 0; i < streakCount; i++) {
    const angle = (i / streakCount) * Math.PI * 2 + (i % 5) * 0.19;
    const radius = 1.7 + ((i * 37) % 100) / 100 * 1.95;
    const sx = Math.cos(angle) * radius * 1.35;
    const sy = Math.sin(angle) * radius * 0.85;
    const baseZ = -2.0 - ((i * 53) % 100) / 100 * 11.0;
    const phase = ((i * 71) % 100) / 100;
    const spd = 16.0 + (i % 7) * 2.4;

    // Wierzchołek przedni (głowica strugi, endFlag = 0)
    streakPositions[i * 6] = sx;
    streakPositions[i * 6 + 1] = sy;
    streakPositions[i * 6 + 2] = baseZ;
    streakMeta[i * 6] = phase;
    streakMeta[i * 6 + 1] = spd;
    streakMeta[i * 6 + 2] = 0.0;

    // Wierzchołek tylny (ogon strugi, endFlag = 1)
    streakPositions[i * 6 + 3] = sx;
    streakPositions[i * 6 + 4] = sy;
    streakPositions[i * 6 + 5] = baseZ;
    streakMeta[i * 6 + 3] = phase;
    streakMeta[i * 6 + 4] = spd;
    streakMeta[i * 6 + 5] = 1.0;
  }
  const speedLinesGeo = new THREE.BufferGeometry();
  speedLinesGeo.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
  speedLinesGeo.setAttribute('aMeta', new THREE.BufferAttribute(streakMeta, 3));

  const speedLinesUniforms = {
    uTime: { value: 0.0 },
    uIntensity: { value: 0.0 },
    uColor: { value: new THREE.Color(0xe0f2fe) },
  };

  const speedLinesMat = new THREE.ShaderMaterial({
    name: 'OskiRide_SpeedLinesShader',
    uniforms: speedLinesUniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aMeta;
      uniform float uTime;
      uniform float uIntensity;
      varying float vAlpha;
      void main() {
        float phase = aMeta.x;
        float speed = aMeta.y;
        float isTail = aMeta.z;
        float span = 11.5;
        float zTravel = mod(position.z + uTime * speed + phase * span, span) - 13.0;
        float streakLen = (0.85 + uIntensity * 1.65) * isTail;
        vec3 localPos = vec3(position.x, position.y, zTravel - streakLen);
        float zFade = smoothstep(-13.2, -9.5, zTravel) * smoothstep(-1.4, -3.5, zTravel);
        vAlpha = (1.0 - isTail * 0.85) * zFade * uIntensity * 0.55;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(localPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        if (vAlpha <= 0.005) discard;
        gl_FragColor = vec4(uColor, vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  const speedLinesMesh = new THREE.LineSegments(speedLinesGeo, speedLinesMat);
  speedLinesMesh.name = 'OskiRide_SpeedLines';
  speedLinesMesh.frustumCulled = false;
  speedLinesMesh.visible = false;
  scene.add(speedLinesMesh);

  // Opady atmosferyczne 3D (Deszcz / Śnieg alpejski) — zawijane na GPU w objętości wokół kamery (0 alokacji CPU)
  const precipCount = 720;
  const precipPositions = new Float32Array(precipCount * 3);
  const precipSeeds = new Float32Array(precipCount * 2);
  for (let i = 0; i < precipCount; i++) {
    precipPositions[i * 3] = ((i * 67) % 100) / 100 * 30 - 15;
    precipPositions[i * 3 + 1] = ((i * 131) % 100) / 100 * 16 - 3;
    precipPositions[i * 3 + 2] = ((i * 197) % 100) / 100 * 30 - 15;
    precipSeeds[i * 2] = (i * 0.6180339887) % 1;
    precipSeeds[i * 2 + 1] = 0.75 + ((i * 31) % 10) * 0.06;
  }
  const weatherGeo = new THREE.BufferGeometry();
  weatherGeo.setAttribute('position', new THREE.BufferAttribute(precipPositions, 3));
  weatherGeo.setAttribute('aSeed', new THREE.BufferAttribute(precipSeeds, 2));

  const weatherUniforms = {
    uCameraPos: { value: new THREE.Vector3() },
    uTime: { value: 0.0 },
    uWeatherType: { value: 0.0 }, // 0 = brak, 1 = deszcz, 2 = śnieg
  };

  const weatherMat = new THREE.ShaderMaterial({
    name: 'OskiRide_WeatherShader',
    uniforms: weatherUniforms,
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform vec3 uCameraPos;
      uniform float uTime;
      uniform float uWeatherType;
      varying float vAlpha;
      varying float vType;
      void main() {
        vType = uWeatherType;
        vec3 boxSize = vec3(30.0, 16.0, 30.0);
        vec3 halfBox = boxSize * 0.5;
        bool isSnow = uWeatherType > 1.5;
        float fallSpeed = isSnow ? (2.4 + aSeed.y * 0.9) : (15.5 + aSeed.y * 4.5);
        vec3 motion = isSnow
          ? vec3(
              sin(uTime * 1.1 + aSeed.x * 6.2831) * 1.6 + uTime * 0.65,
              -uTime * fallSpeed,
              cos(uTime * 0.95 + aSeed.x * 6.2831) * 1.6
            )
          : vec3(
              uTime * 1.8,
              -uTime * fallSpeed,
              uTime * 0.9
            );
        vec3 rel = mod(position + motion - uCameraPos + halfBox, boxSize) - halfBox;
        vec3 worldPos = uCameraPos + rel;
        vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
        float dist = length(rel);
        vAlpha = smoothstep(15.0, 4.0, dist) * smoothstep(0.8, 2.2, dist);
        float baseSize = isSnow ? 34.0 : 42.0;
        gl_PointSize = clamp((baseSize * aSeed.y) / max(1.0, -mvPosition.z), isSnow ? 2.5 : 3.0, isSnow ? 9.5 : 14.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying float vType;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        if (vType > 1.5) {
          // Płatek śniegu — miękka kryształowa kulka
          float r2 = dot(c, c);
          if (r2 > 0.25) discard;
          float flake = exp(-r2 * 12.0);
          gl_FragColor = vec4(0.96, 0.98, 1.0, flake * vAlpha * 0.85);
        } else {
          // Kropla deszczu — ukośna smuga wodna
          vec2 rot = vec2(c.x + c.y * 0.18, c.y);
          float streak = exp(-(rot.x * rot.x * 95.0 + rot.y * rot.y * 6.5));
          if (streak < 0.08) discard;
          gl_FragColor = vec4(0.82, 0.91, 0.99, streak * vAlpha * 0.62);
        }
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  const weatherMesh = new THREE.Points(weatherGeo, weatherMat);
  weatherMesh.name = 'OskiRide_WeatherPrecipitation';
  weatherMesh.frustumCulled = false;
  weatherMesh.visible = false;
  scene.add(weatherMesh);

  const rimBandGeo = new THREE.RingGeometry(18, 28, 32);
  const rimBandMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.45,
  });
  const rimBandMesh = new THREE.Mesh(rimBandGeo, rimBandMat);
  rimBandMesh.rotation.x = Math.PI / 2;
  rimBandMesh.position.y = 42;
  envScene.add(rimBandMesh);

  for (const mode of ['day', 'sunset', 'night']) {
    const p = SKY_PRESETS[mode];
    envUniforms.uZenithColor.value.copy(p.zenith);
    envUniforms.uSkyColor.value.copy(p.sky);
    envUniforms.uHorizonColor.value.copy(p.horizon);
    envUniforms.uGroundColor.value.copy(p.ground);
    envUniforms.uSunColor.value.copy(p.sun);
    envUniforms.uSunDirection.value.copy(p.sunDir);
    envUniforms.uCloudLitColor.value.copy(p.cloudLit);
    envUniforms.uCloudShadowColor.value.copy(p.cloudShadow);
    envUniforms.uCloudOpacity.value = p.cloudOpacity;
    envUniforms.uStarIntensity.value = p.starIntensity;
    envUniforms.uSunDiscIntensity.value = p.sunDiscIntensity * 1.4;

    sunCardMat.color.copy(p.sun).multiplyScalar(mode === 'night' ? 1.1 : 1.8);
    sunCardMesh.position.copy(p.sunDir).multiplyScalar(58);
    rimBandMat.color.copy(p.sky).lerp(p.sun, 0.5);
    rimBandMat.opacity = mode === 'night' ? 0.18 : 0.42;

    envTargets[mode] = pmremGenerator.fromScene(envScene, 0.025, 0.5, 120);
  }

  envSkyGeo.dispose();
  envSkyMat.dispose();
  sunCardGeo.dispose();
  sunCardMat.dispose();
  rimBandGeo.dispose();
  rimBandMat.dispose();
  pmremGenerator.dispose();

  let activeEnvMode = 'day';
  let activeWeather = 'clear';
  let pbrEnabled = true;
  let routeGroupRef = null;

  function syncRoadWeatherSurface() {
    const roadMat = routeGroupRef?.userData?.roadMaterial;
    if (!roadMat) return;
    if (activeWeather === 'wet' || activeWeather === 'rain') {
      roadMat.roughness = 0.16;
      roadMat.metalness = 0.38;
      roadMat.envMapIntensity = 2.15;
      roadMat.color.setHex(0x94a3b8);
    } else if (activeWeather === 'snow') {
      roadMat.roughness = 0.62;
      roadMat.metalness = 0.14;
      roadMat.envMapIntensity = 1.15;
      roadMat.color.setHex(0xe2e8f0);
    } else {
      roadMat.roughness = 0.82;
      roadMat.metalness = 0.09;
      roadMat.envMapIntensity = 0.85;
      roadMat.color.setHex(0xffffff);
    }
  }

  function applyWeather(weather = 'clear') {
    activeWeather = ['clear', 'wet', 'rain', 'snow'].includes(weather) ? weather : 'clear';
    if (activeWeather === 'rain') {
      weatherUniforms.uWeatherType.value = 1.0;
      weatherMesh.visible = true;
    } else if (activeWeather === 'snow') {
      weatherUniforms.uWeatherType.value = 2.0;
      weatherMesh.visible = true;
    } else {
      weatherUniforms.uWeatherType.value = 0.0;
      weatherMesh.visible = false;
    }
    syncRoadWeatherSurface();
  }

  function syncCloudMeshMaterial(color, emissive, emissiveIntensity, lampHaloOpacity = 0.14, windowGlowIntensity = 0.06) {
    const cloudMat = routeGroupRef?.userData?.cloudMat;
    if (cloudMat) {
      cloudMat.color.copy(color);
      cloudMat.emissive.copy(emissive);
      cloudMat.emissiveIntensity = emissiveIntensity;
    }
    const lampHaloMat = routeGroupRef?.userData?.lampHaloMat;
    if (lampHaloMat) {
      lampHaloMat.opacity = lampHaloOpacity;
    }
    const windowGlassMat = routeGroupRef?.userData?.windowGlassMat;
    if (windowGlassMat) {
      if (windowGlowIntensity > 0.35) {
        windowGlassMat.color.setHex(0xfef08a);
        windowGlassMat.emissive.setHex(0xf59e0b);
        windowGlassMat.emissiveIntensity = windowGlowIntensity;
      } else {
        windowGlassMat.color.setHex(0x4b6b78);
        windowGlassMat.emissive.setHex(0xfef08a);
        windowGlassMat.emissiveIntensity = windowGlowIntensity;
      }
    }
  }

  function setEnvironmentMode(mode) {
    activeEnvMode = envTargets[mode] ? mode : 'day';
    scene.environment = pbrEnabled ? envTargets[activeEnvMode].texture : null;
  }

  function applyMode(mode) {
    const p = SKY_PRESETS[mode] || SKY_PRESETS.day;
    uniforms.uZenithColor.value.copy(p.zenith);
    uniforms.uSkyColor.value.copy(p.sky);
    uniforms.uHorizonColor.value.copy(p.horizon);
    uniforms.uGroundColor.value.copy(p.ground);
    uniforms.uSunColor.value.copy(p.sun);
    uniforms.uSunDirection.value.copy(p.sunDir);
    uniforms.uCloudLitColor.value.copy(p.cloudLit);
    uniforms.uCloudShadowColor.value.copy(p.cloudShadow);
    uniforms.uCloudOpacity.value = p.cloudOpacity;
    uniforms.uStarIntensity.value = p.starIntensity;
    uniforms.uSunDiscIntensity.value = p.sunDiscIntensity;

    if (mode === 'sunset') {
      motesUniforms.uMoteColor.value.setHex(0xfdba74);
      motesUniforms.uMoteOpacity.value = 0.56;
    } else if (mode === 'night') {
      motesUniforms.uMoteColor.value.setHex(0xbae6fd);
      motesUniforms.uMoteOpacity.value = 0.44;
    } else {
      motesUniforms.uMoteColor.value.setHex(0xfffbeb);
      motesUniforms.uMoteOpacity.value = 0.36;
    }

    const lampHaloOpacity = mode === 'night' ? 0.65 : mode === 'sunset' ? 0.42 : 0.12;
    const windowGlow = mode === 'night' ? 1.48 : mode === 'sunset' ? 0.88 : 0.06;
    setEnvironmentMode(mode === 'sunset' ? 'sunset' : mode === 'night' ? 'night' : 'day');
    syncCloudMeshMaterial(p.cloudMeshColor, p.cloudMeshEmissive, p.cloudMeshEmissiveInt, lampHaloOpacity, windowGlow);
  }

  const _tmpCloudCol = new THREE.Color();
  const _tmpCloudEmissive = new THREE.Color();

  function applyDynamic(prog) {
    const clamped = THREE.MathUtils.clamp(prog, 0, 1);
    let a, b, t;
    if (clamped < 0.6) {
      a = SKY_PRESETS.day;
      b = SKY_PRESETS.sunset;
      t = clamped / 0.6;
      setEnvironmentMode(t < 0.45 ? 'day' : 'sunset');
    } else {
      a = SKY_PRESETS.sunset;
      b = SKY_PRESETS.dusk;
      t = (clamped - 0.6) / 0.4;
      setEnvironmentMode(t < 0.65 ? 'sunset' : 'night');
    }

    uniforms.uZenithColor.value.copy(a.zenith).lerp(b.zenith, t);
    uniforms.uSkyColor.value.copy(a.sky).lerp(b.sky, t);
    uniforms.uHorizonColor.value.copy(a.horizon).lerp(b.horizon, t);
    uniforms.uGroundColor.value.copy(a.ground).lerp(b.ground, t);
    uniforms.uSunColor.value.copy(a.sun).lerp(b.sun, t);
    uniforms.uSunDirection.value.copy(a.sunDir).lerp(b.sunDir, t).normalize();
    uniforms.uCloudLitColor.value.copy(a.cloudLit).lerp(b.cloudLit, t);
    uniforms.uCloudShadowColor.value.copy(a.cloudShadow).lerp(b.cloudShadow, t);
    uniforms.uCloudOpacity.value = THREE.MathUtils.lerp(a.cloudOpacity, b.cloudOpacity, t);
    uniforms.uStarIntensity.value = THREE.MathUtils.lerp(a.starIntensity, b.starIntensity, t);
    uniforms.uSunDiscIntensity.value = THREE.MathUtils.lerp(a.sunDiscIntensity, b.sunDiscIntensity, t);

    motesUniforms.uMoteColor.value.copy(uniforms.uSunColor.value);
    motesUniforms.uMoteOpacity.value = THREE.MathUtils.lerp(0.36, 0.54, clamped);

    _tmpCloudCol.copy(a.cloudMeshColor).lerp(b.cloudMeshColor, t);
    _tmpCloudEmissive.copy(a.cloudMeshEmissive).lerp(b.cloudMeshEmissive, t);
    const emInt = THREE.MathUtils.lerp(a.cloudMeshEmissiveInt, b.cloudMeshEmissiveInt, t);
    const lampHalo = THREE.MathUtils.lerp(0.12, 0.62, clamped);
    const windowGlow = THREE.MathUtils.lerp(0.06, 1.4, clamped);
    syncCloudMeshMaterial(_tmpCloudCol, _tmpCloudEmissive, emInt, lampHalo, windowGlow);
  }

  function setRouteGroup(group) {
    routeGroupRef = group;
    const p = SKY_PRESETS[activeEnvMode] || SKY_PRESETS.day;
    const lampHalo = activeEnvMode === 'night' ? 0.65 : activeEnvMode === 'sunset' ? 0.42 : 0.12;
    const windowGlow = activeEnvMode === 'night' ? 1.48 : activeEnvMode === 'sunset' ? 0.88 : 0.06;
    syncCloudMeshMaterial(p.cloudMeshColor, p.cloudMeshEmissive, p.cloudMeshEmissiveInt, lampHalo, windowGlow);
    syncRoadWeatherSurface();
  }

  let speedLinesAllowed = true;

  function setQuality(quality, adaptiveLevel = 0) {
    pbrEnabled = !(quality === 'eco' && adaptiveLevel >= 2);
    scene.environment = pbrEnabled ? envTargets[activeEnvMode].texture : null;
    motesMesh.visible = quality !== 'eco' && adaptiveLevel === 0;
    speedLinesAllowed = quality !== 'eco' && adaptiveLevel <= 1;
    if (!speedLinesAllowed) speedLinesMesh.visible = false;
  }

  function update(camera, elapsedSec, speedKmh = 0, isSprinting = false) {
    skyMesh.position.copy(camera.position);
    uniforms.uTime.value = elapsedSec;
    if (motesMesh.visible) {
      motesUniforms.uCameraPos.value.copy(camera.position);
      motesUniforms.uTime.value = elapsedSec;
    }
    if (weatherMesh.visible) {
      weatherUniforms.uCameraPos.value.copy(camera.position);
      weatherUniforms.uTime.value = elapsedSec;
    }
    const rippleTex = routeGroupRef?.userData?.waterRippleTex;
    if (rippleTex) {
      rippleTex.offset.set((elapsedSec * 0.055) % 1, (elapsedSec * 0.038) % 1);
    }
    const chimneySmokes = routeGroupRef?.userData?.chimneySmokes;
    if (chimneySmokes && chimneySmokes.length > 0) {
      for (let i = 0; i < chimneySmokes.length; i++) {
        const puff = chimneySmokes[i];
        const cycle = (elapsedSec * 0.45 + puff.phase) % 1;
        puff.mesh.position.x = puff.baseX + Math.sin(elapsedSec * 1.2 + puff.phase) * 0.16 + cycle * 0.28;
        puff.mesh.position.y = puff.baseY + cycle * 0.65;
        puff.mesh.position.z = puff.baseZ - cycle * 0.18;
        puff.mesh.scale.setScalar(puff.baseScale * (0.85 + cycle * 0.55));
      }
    }
    if (speedLinesAllowed) {
      const descentIntensity = THREE.MathUtils.clamp((speedKmh - 48) / 24, 0, 1);
      const sprintIntensity = isSprinting && speedKmh >= 22 ? 0.62 : 0;
      const targetIntensity = Math.max(descentIntensity, sprintIntensity);
      speedLinesUniforms.uIntensity.value = THREE.MathUtils.lerp(
        speedLinesUniforms.uIntensity.value,
        targetIntensity,
        0.16
      );
      if (speedLinesUniforms.uIntensity.value > 0.015) {
        speedLinesMesh.visible = true;
        speedLinesMesh.position.copy(camera.position);
        speedLinesMesh.quaternion.copy(camera.quaternion);
        speedLinesUniforms.uTime.value = elapsedSec;
        speedLinesUniforms.uColor.value.setHex(isSprinting ? 0xfef08a : 0xe0f2fe);
      } else {
        speedLinesMesh.visible = false;
      }
    }
  }

  function dispose() {
    skyGeo.dispose();
    skyMat.dispose();
    motesGeo.dispose();
    motesMat.dispose();
    speedLinesGeo.dispose();
    speedLinesMat.dispose();
    weatherGeo.dispose();
    weatherMat.dispose();
    for (const target of Object.values(envTargets)) {
      target.dispose();
    }
  }

  // Inicjalne ustawienie trybu dziennego i środowiska PBR
  applyMode('day');

  const controller = {
    skyMesh,
    motesMesh,
    motesUniforms,
    speedLinesMesh,
    speedLinesUniforms,
    weatherMesh,
    weatherUniforms,
    uniforms,
    envTargets,
    applyMode,
    applyDynamic,
    applyWeather,
    setRouteGroup,
    setQuality,
    update,
    dispose,
    get activeEnvMode() {
      return activeEnvMode;
    },
    get activeWeather() {
      return activeWeather;
    },
    get pbrEnabled() {
      return pbrEnabled;
    },
  };

  scene.userData.skyEnvironment = controller;
  return controller;
}
