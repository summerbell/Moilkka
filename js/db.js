/* Storage behind one small interface the page uses (paths like 'projects/<id>/people'):
   Firestore when config.js is filled in, otherwise a copy kept in this browser ("혼자 써보기"). */

const FB_VER = '10.12.2';

export function configured() {
  const cfg = window.FIREBASE_CONFIG || {};
  return typeof cfg.apiKey === 'string' && !!cfg.apiKey.trim() && typeof cfg.projectId === 'string' && !!cfg.projectId.trim();
}
export function openDB() {
  return configured() ? firebaseAdapter(window.FIREBASE_CONFIG) : Promise.resolve(localAdapter());
}

function mapCode(c) {
  if (c === 'permission-denied' || c === 'unauthenticated') return 'not_granted';
  if (c === 'resource-exhausted') return 'quota_exceeded';
  if (c === 'unavailable' || c === 'deadline-exceeded') return 'unavailable';
  return c || 'unknown';
}

async function firebaseAdapter(cfg) {
  const base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
  /* auth is loaded on every page: admins sign in on the list and are recognised on boards to set meetings */
  const [appMod, fs, am] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-firestore.js'),
    import(base + 'firebase-auth.js')
  ]);
  const app = appMod.initializeApp(cfg);
  const auth = am.getAuth(app);
  const db = fs.getFirestore(app);
  const wrap = (p) => p.catch((e) => { throw { code: mapCode(e && e.code), message: e && e.message }; });
  const fail = (err) => (e) => err && err({ code: mapCode(e && e.code) });
  const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, data: () => d.data() }));
  const docOf = (ref) => ({
    get: () => wrap(fs.getDoc(ref)).then((s) => ({ exists: s.exists(), data: () => s.data() })),
    set: (data) => wrap(fs.setDoc(ref, data)),
    merge: (data) => wrap(fs.setDoc(ref, data, { merge: true })),
    delete: () => wrap(fs.deleteDoc(ref)),
    onSnapshot(next, err) {
      return fs.onSnapshot(ref, { includeMetadataChanges: true },
        (s) => next({ exists: s.exists(), data: () => s.data(), metadata: { fromCache: s.metadata.fromCache } }), fail(err));
    }
  });
  return {
    auth: {
      onChange: (cb) => am.onAuthStateChanged(auth, cb),
      signIn: () => am.signInWithPopup(auth, new am.GoogleAuthProvider()),
      signOut: () => am.signOut(auth)
    },
    collection(path) {
      const col = fs.collection(db, path);
      return {
        onSnapshot(next, err) {
          return fs.onSnapshot(col, { includeMetadataChanges: true },
            (snap) => next({ docs: docsOf(snap), metadata: { fromCache: snap.metadata.fromCache } }), fail(err));
        },
        get: () => wrap(fs.getDocs(col)).then((snap) => ({ docs: docsOf(snap) })),
        doc: (id) => docOf(fs.doc(db, path, id))
      };
    }
  };
}

/* Try-it-alone mode: same interface, kept in this browser only (one object keyed by document path) */
function localAdapter() {
  const KEY = 'six.local', subs = new Set();
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
  const write = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { throw { code: 'quota_exceeded' }; } subs.forEach((f) => f()); };
  window.addEventListener('storage', (e) => { if (e.key === KEY) subs.forEach((f) => f()); });
  const watch = (f) => { subs.add(f); setTimeout(f, 0); return () => subs.delete(f); };
  const isMap = (x) => x && typeof x === 'object' && !Array.isArray(x);
  /* nested maps merge like Firestore's { merge: true }; arrays and plain values are replaced */
  const deep = (a, b) => {
    const o = Object.assign({}, a);
    Object.keys(b).forEach((k) => { o[k] = isMap(b[k]) && isMap(a && a[k]) ? deep(a[k], b[k]) : b[k]; });
    return o;
  };
  const docsIn = (path) => {
    const all = read(), pre = path + '/';
    return Object.keys(all).filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map((k) => ({ id: k.slice(pre.length), data: () => all[k] }));
  };
  const docOf = (path) => ({
    get: async () => { const all = read(); return { exists: !!all[path], data: () => all[path] }; },
    set: async (data) => { const all = read(); all[path] = data; write(all); },
    merge: async (data) => { const all = read(); all[path] = deep(all[path] || {}, data); write(all); },
    delete: async () => { const all = read(); delete all[path]; write(all); },
    onSnapshot(next) { return watch(() => { const all = read(); next({ exists: !!all[path], data: () => all[path], metadata: { fromCache: false } }); }); }
  });
  return {
    local: true,
    auth: null,
    collection(path) {
      return {
        onSnapshot(next) { return watch(() => next({ docs: docsIn(path), metadata: { fromCache: false } })); },
        get: async () => ({ docs: docsIn(path) }),
        doc: (id) => docOf(path + '/' + id)
      };
    }
  };
}
