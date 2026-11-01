/* Unscripted live site: connects the site's forms and admin page to the Supabase database.
   The pages call window.claude.use('db' | 'user'); this file provides those on leadunscripted.com. */
(function () {
  var SB_URL = 'https://hriwasqasavyuymrrwba.supabase.co';
  var SB_KEY = 'sb_publishable_J0D1wa81r8lIDh4N624XhQ_sGzd-VB0';
  if (!window.supabase) return;
  var sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } });
  var TABLES = { registrations: 1, expenses: 1 };
  var listeners = { registrations: [], expenses: [] };

  function sortRows(rows, o) {
    if (!o) return rows;
    return rows.slice().sort(function (a, b) {
      var x = a.data[o.f] == null ? '' : a.data[o.f], y = b.data[o.f] == null ? '' : b.data[o.f];
      return (x < y ? -1 : x > y ? 1 : 0) * (o.dir === 'desc' ? -1 : 1);
    });
  }
  function snapOf(rows) {
    return { docs: rows.map(function (r) { return { id: r.id, data: function () { return Object.assign({}, r.data) } } }) };
  }
  function refresh(table) {
    return sb.from(table).select('id,data').limit(2000).then(function (res) {
      listeners[table].forEach(function (l) {
        if (res.error) { if (l.err) l.err(res.error); return }
        l.cb(snapOf(sortRows(res.data || [], l.order).slice(0, l.lim)));
      });
    });
  }
  function must(res) { if (res.error) throw res.error; return res }

  function collection(table) {
    if (!TABLES[table]) throw new Error('Unknown collection ' + table);
    var q = { order: null, lim: 1000 };
    var api = {
      add: function (rec) {
        return sb.from(table).insert({ data: rec }).then(must).then(function () { if (listeners[table].length) refresh(table); return { id: null } });
      },
      doc: function (id) {
        return {
          update: function (patch) {
            return sb.from(table).select('data').eq('id', id).single().then(must).then(function (r) {
              return sb.from(table).update({ data: Object.assign({}, r.data.data, patch) }).eq('id', id).then(must);
            }).then(function () { refresh(table) });
          },
          set: function (obj) { return sb.from(table).update({ data: obj }).eq('id', id).then(must).then(function () { refresh(table) }) },
          delete: function () { return sb.from(table).delete().eq('id', id).then(must).then(function () { refresh(table) }) }
        };
      },
      orderBy: function (f, dir) { q.order = { f: f, dir: dir }; return api },
      limit: function (n) { q.lim = n; return api },
      onSnapshot: function (cb, err) {
        var l = { cb: cb, err: err, order: q.order, lim: q.lim };
        listeners[table].push(l); refresh(table);
        var t = setInterval(function () { refresh(table) }, 60000);
        return function () { clearInterval(t); listeners[table] = listeners[table].filter(function (x) { return x !== l }) };
      }
    };
    return api;
  }

  function isAdmin() {
    return sb.auth.getSession().then(function (r) {
      if (!r.data || !r.data.session) return false;
      return sb.rpc('is_admin').then(function (x) { return !x.error && x.data === true });
    }).catch(function () { return false });
  }
  var user = { canEdit: isAdmin, isOwner: isAdmin, can: function () { return isAdmin() } };
  var db = { collection: collection };

  window.claude = { use: function (name) { return Promise.resolve(name === 'db' ? db : name === 'user' ? user : null) } };

  window.UNS = {
    signIn: function (email) {
      return sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + '/index.html?admin=1', shouldCreateUser: true } });
    },
    signOut: function () { return sb.auth.signOut().then(function () { location.href = 'index.html' }) },
    session: function () { return sb.auth.getSession().then(function (r) { return r.data && r.data.session }) }
  };

  // After the emailed sign-in link brings someone back, open the admin page.
  sb.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_IN' && /[?&]admin=1/.test(location.search)) {
      history.replaceState(null, '', location.pathname + '#admin');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  });
})();
