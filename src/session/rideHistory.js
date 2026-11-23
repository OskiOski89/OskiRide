const LEGACY_KEY = 'oskiride_ride_history_v1';
const DATABASE = 'oskiride-ride-journal';
const RIDE_STORES = ['rides', 'telemetry'];

function readLegacyRides() {
  try {
    const rows = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter(ride => typeof ride?.id === 'string' && ride.id) : [];
  } catch {
    return null;
  }
}

function writeRide(tx, snapshot) {
  const { points, ...ride } = snapshot;
  tx.objectStore('rides').put(ride);
  tx.objectStore('telemetry').put({ id: ride.id, points: Array.isArray(points) ? points : [] });
}

function transaction(db, stores, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let readResult;
    const abort = error => { reject(error); tx.abort(); };
    tx.oncomplete = () => resolve(readResult?.());
    tx.onabort = () => reject(tx.error || new Error('Journal access interrupted.'));
    try {
      readResult = run(tx, abort);
    } catch (error) {
      abort(error);
    }
  });
}

function migrateHistory(db) {
  return transaction(db, [...RIDE_STORES, 'meta'], 'readwrite', (tx, abort) => {
    const meta = tx.objectStore('meta');
    const migrated = meta.get('legacy-history');
    migrated.onsuccess = () => {
      if (migrated.result) return;
      const legacyRides = readLegacyRides();
      if (!legacyRides) return;
      try {
        const seen = new Set();
        for (const ride of legacyRides) {
          if (seen.has(ride.id)) continue;
          seen.add(ride.id);
          const firstDistance = ride.points?.[0]?.dist;
          const distanceTravelledM = Number.isFinite(ride.distanceM) && Number.isFinite(firstDistance)
            ? Math.max(0, ride.distanceM - Math.max(0, firstDistance)) : ride.distanceM;
          writeRide(tx, { ...ride, distanceTravelledM, legacy: true });
        }
        meta.put({ id: 'legacy-history' });
      } catch (error) {
        abort(error);
      }
    };
  });
}

export class RideHistory {
  open() {
    if (!this.ready) {
      this.ready = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => {
          for (const name of [...RIDE_STORES, 'meta']) request.result.createObjectStore(name, { keyPath: 'id' });
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Close the other OskiRide window and refresh the journal.'));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.ready = null;
          };
          resolve(db);
        };
      }).then(async db => {
        try {
          await migrateHistory(db);
          return db;
        } catch (error) {
          db.close();
          throw error;
        }
      }).catch(error => {
        this.ready = null;
        throw error;
      });
    }
    return this.ready;
  }

  async list() {
    return transaction(await this.open(), ['rides'], 'readonly', tx => {
      const request = tx.objectStore('rides').getAll();
      return () => request.result;
    });
  }

  async get(id) {
    return transaction(await this.open(), RIDE_STORES, 'readonly', tx => {
      const ride = tx.objectStore('rides').get(id);
      const data = tx.objectStore('telemetry').get(id);
      return () => ride.result ? { ...ride.result, points: data.result?.points || [] } : null;
    });
  }

  async save(snapshot) {
    return transaction(await this.open(), RIDE_STORES, 'readwrite', (tx, abort) => {
      const previous = tx.objectStore('rides').get(snapshot.id);
      previous.onsuccess = () => {
        const saved = previous.result;
        if (saved && (saved.elapsedSeconds > snapshot.elapsedSeconds || saved.finished && !snapshot.finished)) return;
        try { writeRide(tx, snapshot); } catch (error) { abort(error); }
      };
    });
  }

  async remove(id) {
    return transaction(await this.open(), RIDE_STORES, 'readwrite', tx => {
      for (const name of RIDE_STORES) tx.objectStore(name).delete(id);
    });
  }
}
