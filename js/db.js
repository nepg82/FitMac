// db.js — IndexedDB wrapper + data access helpers
const DB_NAME = 'fitness-tracker';
const DB_VERSION = 2;
const DATA_STORES = ['foodItems', 'mealEntries', 'weightEntries', 'workoutSessions'];

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'username' });
      }
      if (!db.objectStoreNames.contains('foodItems')) {
        const s = db.createObjectStore('foodItems', { keyPath: 'id' });
        s.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('mealEntries')) {
        const s = db.createObjectStore('mealEntries', { keyPath: 'id' });
        s.createIndex('date', 'date', { unique: false });
        s.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('weightEntries')) {
        const s = db.createObjectStore('weightEntries', { keyPath: 'id' });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('workoutSessions')) {
        const s = db.createObjectStore('workoutSessions', { keyPath: 'id' });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function markDirty() {
  return tx('settings', 'readwrite').then(s => new Promise((res) => {
    const getReq = s.get('main');
    getReq.onsuccess = () => {
      const current = getReq.result || { id: 'main' };
      if (current.dataDirty) { res(); return; }
      const putReq = s.put({ ...current, dataDirty: true });
      putReq.onsuccess = () => res();
      putReq.onerror = () => res();
    };
    getReq.onerror = () => res();
  }));
}

const DB = {
  uuid, todayISO,

  put(store, obj) {
  return tx(store, 'readwrite').then(s => new Promise((res, rej) => {
    const r = s.put(obj);
    r.onsuccess = () => {
      if (DATA_STORES.includes(store)) {
        markDirty().then(() => res(obj));
      } else {
        res(obj);
      }
    };
    r.onerror = (e) => rej(e.target.error);
  }));
},

  get(store, id) {
    return tx(store).then(s => new Promise((res, rej) => {
      const r = s.get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = (e) => rej(e.target.error);
    }));
  },

delete(store, id) {
  return tx(store, 'readwrite').then(s => new Promise((res, rej) => {
    const r = s.delete(id);
    r.onsuccess = () => {
      if (DATA_STORES.includes(store)) {
        markDirty().then(() => res());
      } else {
        res();
      }
    };
    r.onerror = (e) => rej(e.target.error);
  }));
},

  getAll(store) {
    return tx(store).then(s => new Promise((res, rej) => {
      const r = s.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = (e) => rej(e.target.error);
    }));
  },

  // --- Food items (reusable library) ---
  async upsertFoodItem({ name, protein, carbs, fat }) {
    const all = await DB.getAll('foodItems');
    const existing = all.find(f => f.name.trim().toLowerCase() === name.trim().toLowerCase());
    const item = existing
      ? { ...existing, protein, carbs, fat }
      : { id: uuid(), name: name.trim(), protein, carbs, fat, createdAt: Date.now() };
    await DB.put('foodItems', item);
    return item;
  },

  async searchFoodItems(query) {
    const all = await DB.getAll('foodItems');
    const q = query.trim().toLowerCase();
    const filtered = q ? all.filter(f => f.name.toLowerCase().includes(q)) : all;
    return filtered.sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  },

  // --- Meals ---
  async saveMealEntry(meal) {
    // meal: { id?, date, name, items: [{name, protein, carbs, fat}] }
    const id = meal.id || uuid();
    const totals = meal.items.reduce((acc, it) => {
      acc.protein += Number(it.protein) || 0;
      acc.carbs += Number(it.carbs) || 0;
      acc.fat += Number(it.fat) || 0;
      return acc;
    }, { protein: 0, carbs: 0, fat: 0 });
    const entry = { id, date: meal.date, name: meal.name, items: meal.items, totals, createdAt: meal.createdAt || Date.now() };
    await DB.put('mealEntries', entry);
    // upsert each item into the food library for reuse
    for (const it of meal.items) {
      if (it.name && it.name.trim()) {
        await DB.upsertFoodItem({ name: it.name, protein: it.protein, carbs: it.carbs, fat: it.fat });
      }
    }
    return entry;
  },

  async getMealEntries() {
    const all = await DB.getAll('mealEntries');
    return all.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt) || b.createdAt - a.createdAt);
  },

  async getMealEntriesForDate(date) {
    const all = await DB.getAll('mealEntries');
    return all.filter(m => m.date === date);
  },

  async getUniqueMealNames() {
    const all = await DB.getAll('mealEntries');
    const map = new Map();
    for (const m of all.sort((a, b) => b.createdAt - a.createdAt)) {
      const key = m.name.trim().toLowerCase();
      if (!map.has(key)) map.set(key, m);
    }
    return Array.from(map.values());
  },

  // --- Weight ---
  async saveWeightEntry({ id, date, weight }) {
    const entry = { id: id || uuid(), date, weight: Number(weight), createdAt: Date.now() };
    await DB.put('weightEntries', entry);
    return entry;
  },

  async getWeightEntries() {
    const all = await DB.getAll('weightEntries');
    return all.sort((a, b) => a.date.localeCompare(b.date));
  },

  // --- Workouts ---
  async saveWorkoutSession(session) {
    // session: { id?, name, date, exercises: [{exercise, sets, reps, weight, notes}] }
    const id = session.id || uuid();
    const entry = { id, name: session.name, date: session.date, exercises: session.exercises, createdAt: session.createdAt || Date.now() };
    await DB.put('workoutSessions', entry);
    return entry;
  },

  async getWorkoutSessions() {
    const all = await DB.getAll('workoutSessions');
    return all.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt) || b.createdAt - a.createdAt);
  },

  async getUniqueExerciseNames() {
    const all = await DB.getAll('workoutSessions');
    const set = new Set();
    for (const s of all) for (const ex of s.exercises) if (ex.exercise) set.add(ex.exercise);
    return Array.from(set).sort();
  },

  // --- Settings ---
  async getSettings() {
    const s = await DB.get('settings', 'main');
    return s || { id: 'main', targetWeight: null, calorieGoal: null, proteinGoal: null, carbsGoal: null, fatGoal: null };
  },

  async saveSettings(patch) {
    const current = await DB.getSettings();
    const updated = { ...current, ...patch, id: 'main' };
    await DB.put('settings', updated);
    return updated;
  },

  // --- Wipe + replace (used for "switch user" restores) ---
  async wipeAppData() {
    const stores = ['foodItems', 'mealEntries', 'weightEntries', 'workoutSessions'];
    for (const store of stores) {
      const s = await tx(store, 'readwrite');
      await new Promise((res, rej) => {
        const r = s.clear();
        r.onsuccess = () => res();
        r.onerror = (e) => rej(e.target.error);
      });
    }
  },

  async replaceAll(data) {
    await DB.wipeAppData();
    await DB.importAll(data);
  },

  // --- Export (also basis for future GitHub sync) ---
  async exportAll() {
    const [foodItems, mealEntries, weightEntries, workoutSessions, settingsRaw] = await Promise.all([
      DB.getAll('foodItems'), DB.getAll('mealEntries'), DB.getAll('weightEntries'),
      DB.getAll('workoutSessions'), DB.getSettings()
    ]);
	const { githubToken, githubOwner, githubRepo, githubBranch, lastSyncedAt, activeUsername, dataDirty, loadedAt, ...settings } = settingsRaw;
    return { version: 1, exportedAt: new Date().toISOString(), foodItems, mealEntries, weightEntries, workoutSessions, settings };
  },

  async importAll(data) {
    const stores = ['foodItems', 'mealEntries', 'weightEntries', 'workoutSessions'];
    for (const store of stores) {
      for (const item of (data[store] || [])) await DB.put(store, item);
  	}
	if (data.settings) {
	  const current = await DB.getSettings();
	  const { githubToken, githubOwner, githubRepo, githubBranch, username, activeUsername, lastSyncedAt, dataDirty, loadedAt, ...rest } = data.settings;
	  await DB.put('settings', { ...current, ...rest, id: 'main', activeUsername: username || null, dataDirty: false, loadedAt: Date.now() });
	}
  }
};
