// A spatial index shared by every roadside prop. Test complete road segments,
// including distant switchbacks, rather than a subset of route vertices.
const CELL_SIZE = 24;
const GAP = 0.12;

function insert(grid, bounds, value) {
  for (let x = Math.floor(bounds.minX / CELL_SIZE); x <= Math.floor(bounds.maxX / CELL_SIZE); x++) {
    for (let z = Math.floor(bounds.minZ / CELL_SIZE); z <= Math.floor(bounds.maxZ / CELL_SIZE); z++) {
      const key = `${x},${z}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(value);
    }
  }
}

function query(grid, bounds) {
  const found = new Set();
  for (let x = Math.floor(bounds.minX / CELL_SIZE); x <= Math.floor(bounds.maxX / CELL_SIZE); x++) {
    for (let z = Math.floor(bounds.minZ / CELL_SIZE); z <= Math.floor(bounds.maxZ / CELL_SIZE); z++) {
      for (const value of grid.get(`${x},${z}`) || []) found.add(value);
    }
  }
  return found;
}

function pointSegmentSq(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return (p.x - a.x - t * dx) ** 2 + (p.z - a.z - t * dz) ** 2;
}

const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const half = (list) => {
    const hull = [];
    for (const p of list) {
      while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
      hull.push(p);
    }
    return hull;
  };
  return [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
}

function segmentDistanceSq(a, b, c, d) {
  const ac = cross(a, b, c), ad = cross(a, b, d);
  const ca = cross(c, d, a), cb = cross(c, d, b);
  if (ac * ad < 0 && ca * cb < 0) return 0;
  return Math.min(pointSegmentSq(a, c, d), pointSegmentSq(b, c, d), pointSegmentSq(c, a, b), pointSegmentSq(d, a, b));
}

function inside(p, polygon) {
  return polygon.length >= 3 && polygon.every((a, i) => cross(a, polygon[(i + 1) % polygon.length], p) >= -1e-8);
}

function roadDistanceSq(a, b, polygon) {
  if (inside(a, polygon) || inside(b, polygon)) return 0;
  let result = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    result = Math.min(result, segmentDistanceSq(a, b, polygon[i], polygon[(i + 1) % polygon.length]));
  }
  return result;
}

function polygonsOverlap(a, b) {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const length = Math.hypot(q.x - p.x, q.z - p.z);
      if (!length) continue;
      const nx = -(q.z - p.z) / length, nz = (q.x - p.x) / length;
      const pa = a.map(v => v.x * nx + v.z * nz);
      const pb = b.map(v => v.x * nx + v.z * nz);
      if (Math.max(...pa) + GAP <= Math.min(...pb) || Math.max(...pb) + GAP <= Math.min(...pa)) return false;
    }
  }
  return true;
}

export function createSceneryPlacement(samples, roadWidth) {
  const roads = new Map(), objects = new Map();
  const halfRoad = roadWidth / 2 + 0.15;
  const stats = { placed: 0, rejectedRoad: 0, rejectedObject: 0 };
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1];
    insert(roads, { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) }, { a, b });
  }
  const expand = (b, margin) => ({ minX: b.minX - margin, maxX: b.maxX + margin, minZ: b.minZ - margin, maxZ: b.maxZ + margin });

  return {
    stats,
    isPointClear(pos, radius, height = 7) {
      const bounds = expand({ minX: pos.x, maxX: pos.x, minZ: pos.z, maxZ: pos.z }, halfRoad + radius);
      for (const { a, b } of query(roads, bounds)) {
        if (pos.y + height < Math.min(a.y, b.y) || pos.y > Math.max(a.y, b.y) + 2.5) continue;
        if (pointSegmentSq(pos, a, b) < (halfRoad + radius) ** 2) return false;
      }
      return true;
    },
    // Each part is a transformed mesh bounding box projected onto the ground.
    // Separate parts leave the opening beneath arches and overpasses usable.
    reserve(parts, kind, commit = true, routeSpan = null) {
      if (!parts.length) return true;
      const bounds = {
        minX: Math.min(...parts.map(p => p.minX)), maxX: Math.max(...parts.map(p => p.maxX)),
        minZ: Math.min(...parts.map(p => p.minZ)), maxZ: Math.max(...parts.map(p => p.maxZ)),
      };
      for (const part of parts) {
        for (const { a, b } of query(roads, expand(part, halfRoad))) {
          if (part.maxY < Math.min(a.y, b.y) - 0.1 || part.minY > Math.max(a.y, b.y) + 2.5) continue;
          const minRoadDist = ['guardrail', 'wall'].includes(kind) ? halfRoad * 0.88 : halfRoad;
          if (roadDistanceSq(a, b, part.polygon) < minRoadDist ** 2) {
            stats.rejectedRoad++;
            return false;
          }
        }
      }
      for (const other of query(objects, expand(bounds, GAP))) {
        // Consecutive sections of the same barrier intentionally share joints.
        if (['guardrail', 'wall', 'tunnel'].includes(kind) && kind === other.kind && routeSpan && other.routeSpan &&
            routeSpan[0] <= other.routeSpan[1] + 0.01 && other.routeSpan[0] <= routeSpan[1] + 0.01) continue;
        for (const a of parts) for (const b of other.parts) {
          if (a.maxY + GAP <= b.minY || b.maxY + GAP <= a.minY) continue;
          if (a.maxX + GAP <= b.minX || b.maxX + GAP <= a.minX || a.maxZ + GAP <= b.minZ || b.maxZ + GAP <= a.minZ) continue;
          if (polygonsOverlap(a.polygon, b.polygon)) {
            stats.rejectedObject++;
            return false;
          }
        }
      }
      if (commit) {
        insert(objects, bounds, { parts, kind, routeSpan });
        stats.placed++;
      }
      return true;
    },
  };
}
