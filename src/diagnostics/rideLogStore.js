// Separate stores keep the ride index small while retaining every ride's entries.
export class RideLogStore {
  constructor(indexedDB) {
    try { this.indexedDB = arguments.length ? indexedDB : globalThis.indexedDB; }
    catch { this.indexedDB = null; }
    this.error = '';
    this.rides = new Map();
    this.entries = new Map();
    this.dirtyRides = new Map();
    this.dirtyEntries = new Map();
    this.queue = Promise.resolve();
  }

  open() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (!this.indexedDB) return reject(new Error('Log storage is unavailable.'));
      const request = this.indexedDB.open('oskiride-diagnostics', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('rides', { keyPath: 'id' });
        db.createObjectStore('entries', { keyPath: ['rideId', 'seq'] }).createIndex('rideId', 'rideId');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close the other OskiRide tab and try again.'));
    }).catch(error => {
      this.dbPromise = null;
      this.error = error?.message || 'Could not open log storage.';
      throw error;
    });
    return this.dbPromise;
  }

  write(ride, entries) {
    const copy = structuredClone(ride);
    this.rides.set(copy.id, copy);
    this.dirtyRides.set(copy.id, copy);
    if (!this.entries.has(copy.id)) this.entries.set(copy.id, new Map());
    for (const entry of entries) {
      const value = structuredClone(entry);
      this.entries.get(copy.id).set(value.seq, value);
      this.dirtyEntries.set(`${copy.id}:${value.seq}`, value);
    }
    const job = this.queue.then(async () => {
      const db = await this.open();
      const rides = [...this.dirtyRides.entries()], rows = [...this.dirtyEntries.entries()];
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['rides', 'entries'], 'readwrite');
        for (const [, value] of rides) tx.objectStore('rides').put(value);
        for (const [, value] of rows) tx.objectStore('entries').put(value);
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error || new Error('Log write interrupted.'));
        tx.onerror = () => {}; // onabort reports the transaction failure.
      });
      for (const [key, value] of rides) if (this.dirtyRides.get(key) === value) this.dirtyRides.delete(key);
      for (const [key, value] of rows) {
        if (this.dirtyEntries.get(key) === value) this.dirtyEntries.delete(key);
        const cached = this.entries.get(value.rideId);
        if (cached?.get(value.seq) === value) cached.delete(value.seq);
        if (cached?.size === 0) this.entries.delete(value.rideId);
      }
      this.error = '';
      return true;
    });
    this.queue = job.catch(error => { this.error = error?.message || 'Could not save logs.'; return false; });
    return this.queue;
  }

  async read(storeName, indexName, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = indexName ? store.index(indexName).getAll(key) : store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async list() {
    await this.queue;
    let saved = [];
    try { saved = await this.read('rides'); } catch (error) { this.error = error.message; }
    const rides = new Map(saved.map(ride => [ride.id, ride]));
    for (const [id, ride] of this.rides) rides.set(id, ride);
    return [...rides.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async get(id) {
    const rides = await this.list(), ride = rides.find(value => value.id === id);
    if (!ride) return null;
    let saved = [];
    try { saved = await this.read('entries', 'rideId', id); } catch (error) { this.error = error.message; }
    const rows = new Map(saved.map(entry => [entry.seq, entry]));
    for (const [seq, entry] of this.entries.get(id) || []) rows.set(seq, entry);
    return { ...ride, entries: [...rows.values()].sort((a, b) => a.seq - b.seq) };
  }
}
