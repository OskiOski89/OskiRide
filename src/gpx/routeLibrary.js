const cleanName = value => typeof value === 'string' && value.trim() ? value.trim().slice(0,80) : 'My GPX route';

export async function getGpxContentId(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class RouteLibrary {
  constructor(factory) {
    try { this.factory=arguments.length?factory:globalThis.indexedDB; } catch { this.factory=null; }
    this.queue=Promise.resolve();
  }

  open() {
    if(this.dbPromise)return this.dbPromise;
    this.dbPromise=new Promise((resolve,reject)=>{
      if(!this.factory)return reject(Error('Route library storage is unavailable.'));
      const request=this.factory.open('oskiride-route-library',1);
      request.onupgradeneeded=()=>{request.result.createObjectStore('routes',{keyPath:'id'});request.result.createObjectStore('gpx',{keyPath:'id'});};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.dbPromise=null;};resolve(db);};
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(Error('Close the other OskiRide window and try again.'));
    }).catch(error=>{this.dbPromise=null;throw error;});
    return this.dbPromise;
  }

  async read(storeName,id) {
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const request=db.transaction(storeName,'readonly').objectStore(storeName)[id===undefined?'getAll':'get'](id);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
  }

  mutate(work) {
    const job=this.queue.then(async()=>{
      const db=await this.open();return new Promise((resolve,reject)=>{
        const tx=db.transaction(['routes','gpx'],'readwrite');let result;
        try{result=work(tx);}catch(error){tx.abort();reject(error);return;}
        tx.oncomplete=()=>resolve(typeof result==='function'?result():result);
        tx.onabort=()=>reject(tx.error||Error('Could not save the route library.'));tx.onerror=()=>{};
      });
    });
    this.queue=job.catch(()=>{});return job;
  }

  async save(text,name,stats) {
    if(typeof text!=='string'||!text.trim())throw Error('Missing GPX data.');
    const id=await getGpxContentId(text);
    return this.mutate(tx=>{
      let result;const store=tx.objectStore('routes'),request=store.get(id);
      request.onsuccess=()=>{
        const old=request.result,at=new Date().toISOString();
        result=old?{...old,lastUsedAt:at}:{id,name:cleanName(name),favorite:false,savedAt:at,lastUsedAt:at,...stats};
        store.put(result);tx.objectStore('gpx').put({id,text});
      };
      return ()=>result;
    });
  }

  async list() { await this.queue;const rows=await this.read('routes');return rows.sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.lastUsedAt.localeCompare(a.lastUsedAt)); }
  async get(id) { await this.queue;const [metadata,payload]=await Promise.all([this.read('routes',id),this.read('gpx',id)]);return metadata&&payload?{...metadata,text:payload.text}:null; }

  update(id,patch) {
    return this.mutate(tx=>{
      let result;const store=tx.objectStore('routes'),request=store.get(id);
      request.onsuccess=()=>{
        if(!request.result)return;
        result={...request.result};
        if(typeof patch.name==='string')result.name=cleanName(patch.name);
        if(typeof patch.favorite==='boolean')result.favorite=patch.favorite;
        if(patch.used)result.lastUsedAt=new Date().toISOString();
        store.put(result);
      };
      return ()=>result;
    });
  }

  remove(id) { return this.mutate(tx=>{tx.objectStore('routes').delete(id);tx.objectStore('gpx').delete(id);}); }
}
