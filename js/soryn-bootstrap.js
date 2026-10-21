(function () {
  'use strict';

  var g = globalThis;
  var N = g.SorynNative;

  g.global = g;
  g.self = g;

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    console[level] = function () {};
  });

  g.manifest = JSON.parse(N.getManifest() || '{}');
  g.settings = JSON.parse(N.getSettings() || '{}');

  function model(name) {
    var C = function (o) {
      if (!(this instanceof C)) return new C(o);
      var src = o || {};
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined) this[k] = src[k];
    };
    Object.defineProperty(C, 'name', { value: name });
    return C;
  }
  g.MultimediaItem = model('MultimediaItem');
  g.Episode = model('Episode');
  g.Actor = model('Actor');
  g.StreamResult = model('StreamResult');

  g.cache = {
    get: function (key, ttlMs) {
      var raw = N.cacheGet(String(key));
      if (!raw) return null;
      try {
        var e = JSON.parse(raw);
        if (ttlMs && (Date.now() - e.ts) > ttlMs) return null;
        return e.v === undefined ? null : e.v;
      } catch (err) { return null; }
    },
    set: function (key, value) { N.cachePut(String(key), JSON.stringify({ v: value, ts: Date.now() })); }
  };

  var pending = {};
  var nextId = 1;

  g.__soryn_onFetch = function (id, json) {
    var cb = pending[id];
    if (!cb) return;
    delete pending[id];
    var r;
    try { r = JSON.parse(json); } catch (e) { r = null; }
    cb(r);
  };

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function normHeaders(h) {
    var out = {};
    if (!h) return out;
    if (Array.isArray(h)) {
      h.forEach(function (p) { out[String(p[0])] = String(p[1]); });
    } else if (typeof h.forEach === 'function') {
      h.forEach(function (v, k) { out[String(k)] = String(v); });
    } else {
      Object.keys(h).forEach(function (k) { out[k] = String(h[k]); });
    }
    return out;
  }

  function encodeBody(body) {
    if (body === undefined || body === null) return null;
    if (typeof body === 'string') return bytesToB64(new TextEncoder().encode(body));
    if (body instanceof ArrayBuffer) return bytesToB64(new Uint8Array(body));
    if (ArrayBuffer.isView(body)) return bytesToB64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
    return bytesToB64(new TextEncoder().encode(String(body)));
  }

  function makeResponse(r, reqUrl) {
    r = r || { status: 0, statusText: 'bridge error', url: reqUrl, headers: {}, b64: '', charset: 'utf-8', truncated: false };
    var bytes = null;
    var text = null;
    var hdrs = r.headers || {};
    function getBytes() {
      if (bytes === null) bytes = r.b64 ? b64ToBytes(r.b64) : new Uint8Array(0);
      return bytes;
    }
    function getText() {
      if (text === null) {
        try { text = new TextDecoder(r.charset || 'utf-8').decode(getBytes()); }
        catch (e) { text = new TextDecoder('utf-8').decode(getBytes()); }
      }
      return text;
    }
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: r.statusText || '',
      url: r.url || reqUrl,
      headers: {
        get: function (name) {
          var v = hdrs[String(name).toLowerCase()];
          return v === undefined ? null : v;
        }
      },
      text: function () { return Promise.resolve(getText()); },
      json: function () {
        try { var t = getText(); return Promise.resolve(t ? JSON.parse(t) : null); }
        catch (e) { return Promise.resolve(null); }
      },
      arrayBuffer: function () {
        var b = getBytes();
        return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      }
    };
  }

  g.fetch = function (input, opts) {
    opts = opts || {};
    var url = (input && typeof input === 'object' && input.url) ? String(input.url) : String(input);
    var method = String(opts.method || (input && input.method) || 'GET').toUpperCase();
    var headers = normHeaders(opts.headers || (input && input.headers));
    var follow = String(opts.redirect || 'follow') !== 'manual';
    var body = encodeBody(opts.body);
    return new Promise(function (resolve) {
      var id = nextId++;
      pending[id] = function (r) { resolve(makeResponse(r, url)); };
      try {
        N.fetch(id, url, method, JSON.stringify(headers), body === null ? '' : body, body !== null, follow);
      } catch (e) {
        delete pending[id];
        resolve(makeResponse({
          status: 0, statusText: String(e && e.message || e), url: url,
          headers: {}, b64: '', charset: 'utf-8', truncated: false
        }, url));
      }
    });
  };

  g.__soryn_load = function () {
    var code = N.getPluginCode();
    try {
      (0, eval)('var module = { exports: {} };\nvar exports = module.exports;\n(function() {\n' + code + '\n})();');
      return true;
    } catch (e) {
      return false;
    }
  };

  g.__soryn_run = async function () {
    try {
      var call = JSON.parse(N.getCallArgs());
      var fn = (g.module && g.module.exports && g.module.exports[call.fn]) || g[call.fn];
      if (typeof fn !== 'function') {
        N.capture(JSON.stringify({ success: false, errorCode: 'NO_FUNCTION', message: call.fn + ' not found' }));
        return;
      }
      var result = await new Promise(function (resolve) {
        var done = false;
        function cb(res) { if (!done) { done = true; resolve(res); } }
        var ret;
        try {
          ret = call.arg === null || call.arg === undefined ? fn(cb) : fn(call.arg, cb);
        } catch (e) {
          cb({ success: false, errorCode: 'EXCEPTION', message: String(e && e.message || e) });
          return;
        }
        if (ret && typeof ret.then === 'function') {
          ret.then(function () {}, function (e) { cb({ success: false, errorCode: 'EXCEPTION', message: String(e && e.message || e) }); });
        }
      });
      N.capture(JSON.stringify(result || { success: false, errorCode: 'EMPTY', message: 'no result' }));
    } catch (e) {
      N.capture(JSON.stringify({ success: false, errorCode: 'EXCEPTION', message: String(e && e.message || e) }));
    }
  };

  g.__soryn_start = function () {
    if (!g.__soryn_load()) {
      N.capture(JSON.stringify({ success: false, errorCode: 'LOAD', message: 'script failed to load' }));
      return;
    }
    g.__soryn_run();
  };
})();
