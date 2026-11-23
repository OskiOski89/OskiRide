import * as THREE from 'three';

// Route-scoped resources: shared by all gates, released with the route world.
const INK = '#234c3b', GOLD = '#f2c94c', PAPER = '#fbf5ea';

function roundedPanel(width, height, depth, radius = 0.08) {
  const x = -width / 2, y = -height / 2, r = radius;
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y); shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r); shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height); shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function drawSymbol(ctx, type, x, y, size) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 6;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  if (type === 'kom') {
    ctx.moveTo(-36, -20); ctx.lineTo(-25, 25); ctx.lineTo(25, 25);
    ctx.lineTo(36, -20); ctx.lineTo(14, -5); ctx.lineTo(0, -34);
    ctx.lineTo(-14, -5); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-24, 37); ctx.lineTo(24, 37); ctx.stroke();
  } else if (type === 'finish') {
    ctx.moveTo(-30, 38); ctx.lineTo(-30, -36); ctx.stroke();
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      if ((row + col) % 2 === 0) ctx.fillRect(-27 + col * 16, -34 + row * 16, 16, 16);
    }
    ctx.strokeRect(-27, -34, 64, 48);
  } else if (type === 'feed') {
    ctx.moveTo(-25, -22); ctx.lineTo(-18, 34); ctx.lineTo(22, 34); ctx.lineTo(29, -22); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-33, -22); ctx.lineTo(36, -22);
    ctx.moveTo(5, -22); ctx.lineTo(15, -43); ctx.lineTo(32, -43); ctx.stroke();
  } else if (type === 'climb' || type === 'waypoint') {
    ctx.moveTo(-40, 28); ctx.lineTo(-8, -30); ctx.lineTo(14, 4); ctx.lineTo(24, -12); ctx.lineTo(43, 28); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-20, -8); ctx.lineTo(-8, 0); ctx.lineTo(1, -15); ctx.stroke();
  } else {
    ctx.moveTo(-29, 0); ctx.lineTo(28, 0); ctx.moveTo(6, -24); ctx.lineTo(30, 0); ctx.lineTo(6, 24); ctx.stroke();
  }
  ctx.restore();
}

function canvasMaterial(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide, toneMapped: false });
}

function signMaterial({ title, subtitle, type }) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, 2048, 256);
  ctx.fillStyle = GOLD; ctx.fillRect(0, 0, 224, 256);
  drawSymbol(ctx, type, 112, 128, 128);
  ctx.fillStyle = INK; ctx.textBaseline = 'middle';
  const text = String(title).replace(/\s+/g, ' ').trim();
  // Fit names by measured width; long GPX names get two lines without clipping.
  let fontSize = 144, lines = [text];
  const textWidth = 1450;
  const font = size => { ctx.font = `700 ${size}px "Segoe UI", Arial, sans-serif`; };
  font(fontSize);
  while (fontSize > 76 && ctx.measureText(text).width > textWidth) font(fontSize -= 2);
  if (ctx.measureText(text).width > textWidth) {
    fontSize = 76;
    do {
      font(fontSize); lines = [''];
      // Splitting by characters also handles long names without spaces.
      for (const char of text) {
        const last = lines.length - 1;
        if (ctx.measureText(lines[last] + char).width > textWidth) lines.push(char.trimStart());
        else lines[last] += char;
      }
      if (lines.length <= 2) break;
      fontSize -= 2;
    } while (fontSize > 8);
  }
  font(fontSize);
  const mainY = subtitle ? 100 : 128;
  ctx.textAlign = 'center';
  lines.forEach((line, i) => ctx.fillText(line.trim(), 989, mainY + (i - (lines.length - 1) / 2) * fontSize * 1.02, textWidth));
  if (subtitle) {
    ctx.font = '500 43px "Segoe UI", Arial, sans-serif';
    ctx.fillText(subtitle, 989, 211, textWidth);
  }
  ctx.fillStyle = '#d4d7c2'; ctx.fillRect(1760, 44, 2, 168);
  ctx.save(); ctx.translate(1914, 128); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = INK; ctx.font = '700 39px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('OskiRide', 0, 0); ctx.restore();
  return canvasMaterial(canvas);
}

function pillarMaterial() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 768;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, 128, 768);
  ctx.fillStyle = GOLD; ctx.fillRect(0, 0, 128, 28);
  ctx.save(); ctx.translate(64, 310); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.font = '700 58px "Segoe UI", Arial, sans-serif';
  ctx.fillText('OskiRide', 0, 19); ctx.restore();
  ctx.fillStyle = INK; ctx.fillRect(0, 598, 128, 170);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 24;
  for (let y = 620; y < 800; y += 64) { ctx.beginPath(); ctx.moveTo(-20, y); ctx.lineTo(148, y - 64); ctx.stroke(); }
  return canvasMaterial(canvas);
}

export function createRouteArchKit(roadWidth) {
  const pillarOffset = roadWidth / 2 + 1;
  const outer = pillarOffset + 0.36, inner = pillarOffset - 0.36;
  const shape = new THREE.Shape();
  // Only the upper section spans the road. Separate posts preserve the opening
  // in sceneryPlacement's mesh bounding-box collision checks.
  shape.moveTo(-outer, 4.1); shape.lineTo(-outer, 5.12);
  shape.quadraticCurveTo(-outer, 5.9, -outer + 0.78, 5.9);
  shape.lineTo(outer - 0.78, 5.9); shape.quadraticCurveTo(outer, 5.9, outer, 5.12);
  shape.lineTo(outer, 4.1); shape.lineTo(inner, 4.1); shape.lineTo(inner, 4.24);
  shape.quadraticCurveTo(inner, 4.6, inner - 0.36, 4.6);
  shape.lineTo(-inner + 0.36, 4.6); shape.quadraticCurveTo(-inner, 4.6, -inner, 4.24);
  shape.lineTo(-inner, 4.1); shape.closePath();
  const header = new THREE.ExtrudeGeometry(shape, { depth: 0.72, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2, steps: 1, curveSegments: 10 });
  header.translate(0, 0, -0.36);
  const materials = {
    shell: new THREE.MeshStandardMaterial({ color: INK, roughness: 0.42, metalness: 0.24, envMapIntensity: 1.3 }),
    gold: new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.35, metalness: 0.38, envMapIntensity: 1.45 }),
    base: new THREE.MeshStandardMaterial({ color: 0x172b23, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb9c3b9, roughness: 0.32, metalness: 0.78, envMapIntensity: 1.5 }),
    pillar: pillarMaterial(),
    ledStart: new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 1.4, roughness: 0.2 }),
    ledKom: new THREE.MeshStandardMaterial({ color: 0xfed7aa, emissive: 0xf97316, emissiveIntensity: 1.55, roughness: 0.2 }),
    ledFinish: new THREE.MeshStandardMaterial({ color: 0xdcfce7, emissive: 0x4ade80, emissiveIntensity: 1.55, roughness: 0.2 }),
    ledAccent: new THREE.MeshStandardMaterial({ color: 0xe0f2fe, emissive: 0x38bdf8, emissiveIntensity: 1.35, roughness: 0.2 }),
    glowStart: new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    glowKom: new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    glowFinish: new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    glowAccent: new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  const geometries = {
    header,
    post: roundedPanel(0.72, 4.4, 0.72, 0.09),
    // Buried plinth leaves a solid foundation visible on sloping shoulders.
    foot: roundedPanel(1.06, 0.5, 1.12, 0.13),
    collar: roundedPanel(0.8, 0.13, 0.8, 0.05),
    stripe: roundedPanel(0.76, 0.15, 0.76, 0.04),
    topTrim: roundedPanel(outer * 2 - 1.5, 0.075, 0.82, 0.035),
    ledHeaderBar: roundedPanel(outer * 2 - 1.32, 0.055, 0.78, 0.025),
    ledHeaderGlow: new THREE.PlaneGeometry(inner * 2 - 0.6, 0.32),
    ledPostBar: new THREE.BoxGeometry(0.05, 2.95, 0.04),
    sign: new THREE.PlaneGeometry(outer * 2 - 1.12, 1.04),
    side: new THREE.PlaneGeometry(0.5, 3),
    bolt: new THREE.CylinderGeometry(0.045, 0.045, 0.028, 6),
  };

  return { roadWidth, pillarOffset, create({ title, subtitle = '', type = 'start', baseY = -0.14 }) {
    const group = new THREE.Group(); group.name = `RouteArch_${type}`;
    group.userData.labelText = [title, subtitle].filter(Boolean).join(' · ');
    group.userData.archType = type;
    const ledMat = type === 'kom' ? materials.ledKom : type === 'finish' ? materials.ledFinish : type === 'start' ? materials.ledStart : materials.ledAccent;
    const glowMat = type === 'kom' ? materials.glowKom : type === 'finish' ? materials.glowFinish : type === 'start' ? materials.glowStart : materials.glowAccent;
    const mesh = (geometry, material, x, y, z = 0) => {
      const part = new THREE.Mesh(geometry, material); part.position.set(x, y, z);
      part.castShadow = material !== materials.pillar && !material.transparent; part.receiveShadow = !material.transparent;
      group.add(part); return part;
    };
    mesh(geometries.header, materials.shell, 0, 0);
    mesh(geometries.topTrim, materials.gold, 0, 5.87);
    const ledTop = mesh(geometries.ledHeaderBar, ledMat, 0, 4.66, 0);
    ledTop.name = 'ArchLedHeaderBar';
    for (const direction of [-1, 1]) {
      const glow = mesh(geometries.ledHeaderGlow, glowMat, 0, 4.56, direction * 0.42);
      glow.name = 'ArchLedHeaderGlow';
    }
    const face = signMaterial({ title, subtitle, type });
    for (const direction of [-1, 1]) {
      const board = mesh(geometries.sign, face, 0, 5.25, direction * 0.41);
      board.rotation.y = direction < 0 ? Math.PI : 0; board.castShadow = false;
    }
    for (const side of [-1, 1]) {
      const x = side * pillarOffset;
      mesh(geometries.post, materials.shell, x, 2.05);
      mesh(geometries.foot, materials.base, x, baseY + 0.03);
      mesh(geometries.collar, materials.metal, x, 0.34);
      mesh(geometries.stripe, materials.gold, x, 3.9);
      for (const direction of [-1, 1]) {
        const panel = mesh(geometries.side, materials.pillar, x, 2.08, direction * 0.368);
        panel.rotation.y = direction < 0 ? Math.PI : 0; panel.castShadow = false;
        const ledPost = mesh(geometries.ledPostBar, ledMat, x - side * 0.28, 2.08, direction * 0.372);
        ledPost.name = 'ArchLedPostBar';
        for (const dx of [-0.35, 0.35]) {
          const bolt = mesh(geometries.bolt, materials.metal, x + dx, baseY + 0.292, direction * 0.38);
          bolt.name = 'AnchorBolt';
        }
      }
    }
    return group;
  } };
}
