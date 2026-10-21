(function () {
  'use strict';

  var g = globalThis;
  var N = g.EclipsiaNative;

  g.global = g;
  g.self = g;

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    console[level] = function () {};
  });

  g.SCRAPER_ID = N.getScraperId();
  g.SCRAPER_SETTINGS = JSON.parse(N.getSettings() || '{}');
  if (typeof g.TMDB_API_KEY === 'undefined') g.TMDB_API_KEY = N.getTmdbKey();

  var pending = {};
  var nextId = 1;

  g.__eclipsia_onFetch = function (id, json) {
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
    for (var i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
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
    if (ArrayBuffer.isView(body)) {
      return bytesToB64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
    }
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
        var t;
        try { t = new TextDecoder(r.charset || 'utf-8').decode(getBytes()); }
        catch (e) { t = new TextDecoder('utf-8').decode(getBytes()); }
        text = r.truncated ? t + '\n...[truncated]' : t;
      }
      return text;
    }
    return {
      ok: r.status >= 200 && r.status < 300,
      truncated: !!r.truncated,
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
        try {
          var t = getText();
          return Promise.resolve(t ? JSON.parse(t) : null);
        } catch (e) {
          return Promise.resolve(null);
        }
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

  var BLOCK = /^(address|article|aside|blockquote|body|br|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|html|li|main|nav|ol|option|p|pre|section|table|tbody|td|tfoot|th|thead|title|tr|ul)$/;

  function jText(node) {
    var out = [];
    (function walk(n) {
      if (n.nodeType === 3) { out.push(n.nodeValue); return; }
      if (n.nodeType !== 1 && n.nodeType !== 9 && n.nodeType !== 11) return;
      var tag = n.nodeType === 1 ? n.tagName.toLowerCase() : '';
      if (tag === 'script' || tag === 'style') return;
      var block = tag && BLOCK.test(tag);
      if (block) out.push(' ');
      for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
      if (block) out.push(' ');
    })(node);
    return out.join('').replace(/\s+/g, ' ').trim();
  }

  function ownText(el) {
    var s = '';
    for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) s += c.nodeValue;
    return s;
  }

  function siblingIndex(el) {
    var i = 0;
    for (var s = el.previousElementSibling; s; s = s.previousElementSibling) i++;
    return i;
  }

  function qsa(sel, scopes) {
    var s = String(sel);
    var marks = [];
    var idx = 0;
    s = s.replace(/:(contains|containsOwn)\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/g,
      function (_, kind, a, b, c) {
        var needle = String(a !== undefined ? a : b !== undefined ? b : (c || '')).toLowerCase();
        var attr = 'data-nvc' + (idx++);
        marks.push({
          attr: attr,
          test: function (el) {
            return (kind === 'containsOwn' ? ownText(el) : el.textContent).toLowerCase().indexOf(needle) !== -1;
          }
        });
        return '[' + attr + ']';
      });
    s = s.replace(/:(eq|lt|gt)\(\s*(\d+)\s*\)/g, function (_, kind, n) {
      n = parseInt(n, 10);
      var attr = 'data-nvc' + (idx++);
      marks.push({
        attr: attr,
        test: function (el) {
          var i = siblingIndex(el);
          return kind === 'eq' ? i === n : kind === 'lt' ? i < n : i > n;
        }
      });
      return '[' + attr + ']';
    });

    var docs = [];
    if (marks.length) {
      scopes.forEach(function (sc) {
        var d = sc.nodeType === 9 ? sc : sc.ownerDocument;
        if (d && docs.indexOf(d) === -1) docs.push(d);
      });
      docs.forEach(function (d) {
        var all = d.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
          for (var m = 0; m < marks.length; m++) {
            if (marks[m].test(all[i])) all[i].setAttribute(marks[m].attr, '');
          }
        }
      });
    }

    var results = [];
    var seen = new Set();
    try {
      scopes.forEach(function (sc) {
        var list = sc.querySelectorAll(s);
        for (var i = 0; i < list.length; i++) {
          if (!seen.has(list[i])) { seen.add(list[i]); results.push(list[i]); }
        }
      });
    } catch (e) {
    } finally {
      docs.forEach(function (d) {
        marks.forEach(function (m) {
          var hit = d.querySelectorAll('[' + m.attr + ']');
          for (var i = 0; i < hit.length; i++) hit[i].removeAttribute(m.attr);
        });
      });
    }
    return results;
  }

  function Cheerio(items) {
    this._items = items;
    this.length = items.length;
    for (var i = 0; i < items.length; i++) this[i] = items[i];
  }
  var P = Cheerio.prototype;

  P.find = function (sel) { return new Cheerio(qsa(sel, this._items.filter(function (e) { return e && e.querySelectorAll; }))); };
  P.children = function (sel) { return this.find(sel || '*'); };
  P.each = function (cb) {
    for (var i = 0; i < this._items.length; i++) {
      if (cb.call(this._items[i], i, this._items[i]) === false) break;
    }
    return this;
  };
  P.text = function () { return this._items.map(jText).join(' '); };
  P.html = function () {
    var el = this._items[0];
    return el && el.innerHTML !== undefined ? el.innerHTML : '';
  };
  P.attr = function (name, value) {
    if (value !== undefined) {
      this._items.forEach(function (e) { if (e.setAttribute) e.setAttribute(name, String(value)); });
      return this;
    }
    var el = this._items[0];
    if (!el || !el.getAttribute || !el.hasAttribute(name)) return undefined;
    return el.getAttribute(name);
  };
  P.first = function () { return new Cheerio(this._items.slice(0, 1)); };
  P.last = function () { return new Cheerio(this._items.slice(-1)); };
  P.eq = function (i) { i = i < 0 ? this._items.length + i : i; return new Cheerio(this._items[i] ? [this._items[i]] : []); };
  P.slice = function (a, b) { return new Cheerio(this._items.slice(a, b)); };
  P.get = function (i) { return i === undefined ? this._items.slice() : this._items[i < 0 ? this._items.length + i : i]; };
  P.toArray = function () { return this._items.slice(); };
  P.size = function () { return this.length; };
  P.map = function (cb) {
    var out = [];
    for (var i = 0; i < this._items.length; i++) {
      var r = cb.call(this._items[i], i, this._items[i]);
      if (r === null || r === undefined) continue;
      if (Array.isArray(r)) out.push.apply(out, r); else out.push(r);
    }
    return new Cheerio(out);
  };
  P.filter = function (arg) {
    if (typeof arg === 'function') {
      return new Cheerio(this._items.filter(function (e, i) { return arg.call(e, i, e); }));
    }
    if (typeof arg === 'string') {
      var set = new Set(qsa(arg, this._items.map(function (e) { return e.ownerDocument || e; })));
      return new Cheerio(this._items.filter(function (e) { return set.has(e); }));
    }
    return this;
  };
  P.not = function (arg) {
    var keep = this.filter(arg)._items;
    return new Cheerio(this._items.filter(function (e) { return keep.indexOf(e) === -1; }));
  };
  P.is = function (arg) { return this.filter(arg).length > 0; };
  P.hasClass = function (c) { return this._items.some(function (e) { return e.classList && e.classList.contains(c); }); };
  P.next = function () {
    return new Cheerio(this._items.map(function (e) { return e.nextElementSibling; }).filter(Boolean));
  };
  P.prev = function () {
    return new Cheerio(this._items.map(function (e) { return e.previousElementSibling; }).filter(Boolean));
  };
  P.parent = function () {
    var out = [];
    this._items.forEach(function (e) { if (e.parentElement && out.indexOf(e.parentElement) === -1) out.push(e.parentElement); });
    return new Cheerio(out);
  };
  P.closest = function (sel) {
    var out = [];
    this._items.forEach(function (e) { var c = e.closest && e.closest(sel); if (c && out.indexOf(c) === -1) out.push(c); });
    return new Cheerio(out);
  };
  P.siblings = function () {
    var out = [];
    this._items.forEach(function (e) {
      if (!e.parentElement) return;
      for (var c = e.parentElement.firstElementChild; c; c = c.nextElementSibling) if (c !== e && out.indexOf(c) === -1) out.push(c);
    });
    return new Cheerio(out);
  };
  P.val = function () { var e = this._items[0]; return e ? e.value : undefined; };
  P.data = function (k) { return this.attr('data-' + k); };

  function toItems(x, doc) {
    if (x instanceof Cheerio) return x._items;
    if (x && x.nodeType) return [x];
    if (typeof x === 'string') return qsa(x, [doc]);
    return [];
  }

  function makeDollar(doc) {
    function $(sel, ctx) {
      if (sel === undefined || sel === null) return new Cheerio([]);
      if (sel instanceof Cheerio) return sel;
      if (typeof sel === 'string') {
        var scopes = ctx !== undefined ? toItems(ctx, doc).filter(function (e) { return e.querySelectorAll; }) : [doc];
        return new Cheerio(qsa(sel, scopes));
      }
      if (sel.nodeType) return new Cheerio([sel]);
      if (Array.isArray(sel)) return new Cheerio(sel.filter(function (e) { return e && e.nodeType; }));
      return new Cheerio([]);
    }
    $.html = function (x) {
      var el = x === undefined ? doc.documentElement : toItems(x, doc)[0];
      return el ? (el.outerHTML !== undefined ? el.outerHTML : '') : '';
    };
    $.text = function (x) { return x === undefined ? jText(doc) : new Cheerio(toItems(x, doc)).text(); };
    $.root = function () { return new Cheerio([doc.documentElement]); };
    return $;
  }

  var cheerioLib = {
    load: function (html) {
      var doc = new DOMParser().parseFromString(String(html === undefined || html === null ? '' : html), 'text/html');
      return makeDollar(doc);
    }
  };
  cheerioLib.default = cheerioLib;

  (function patchSubtle() {
    var c = g.crypto;
    var s = c && c.subtle;
    var CJ = g.CryptoJS;
    if (!s || !CJ) return;

    function toU8(d) {
      if (d instanceof ArrayBuffer) return new Uint8Array(d);
      if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
      throw new TypeError('Expected ArrayBuffer or typed array');
    }
    function toWA(u8) {
      var words = [];
      for (var i = 0; i < u8.length; i++) words[i >>> 2] |= u8[i] << (24 - (i % 4) * 8);
      return CJ.lib.WordArray.create(words, u8.length);
    }
    function fromWA(wa) {
      var n = wa.sigBytes, out = new Uint8Array(n);
      for (var i = 0; i < n; i++) out[i] = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
      return out;
    }
    function algName(a) { return String(typeof a === 'string' ? a : (a && a.name) || '').toUpperCase(); }

    var digest = s.digest.bind(s);
    var importKey = s.importKey.bind(s);
    var exportKey = s.exportKey.bind(s);
    var encrypt = s.encrypt.bind(s);
    var decrypt = s.decrypt.bind(s);
    var ecbKeys = new WeakMap();

    s.digest = function (alg, data) {
      if (algName(alg) !== 'MD5') return digest(alg, data);
      try { return Promise.resolve(fromWA(CJ.MD5(toWA(toU8(data)))).buffer); }
      catch (e) { return Promise.reject(e); }
    };
    s.importKey = function (format, keyData, alg, extractable, usages) {
      if (algName(alg) !== 'AES-ECB') return importKey.apply(s, arguments);
      try {
        if (format !== 'raw') throw new Error('AES-ECB only supports raw keys');
        var raw = new Uint8Array(toU8(keyData));
        var key = { type: 'secret', extractable: !!extractable, algorithm: { name: 'AES-ECB', length: raw.length * 8 }, usages: usages || [] };
        ecbKeys.set(key, raw);
        return Promise.resolve(key);
      } catch (e) { return Promise.reject(e); }
    };
    s.exportKey = function (format, key) {
      if (!ecbKeys.has(key)) return exportKey.apply(s, arguments);
      if (format !== 'raw') return Promise.reject(new Error('AES-ECB only supports raw keys'));
      return Promise.resolve(new Uint8Array(ecbKeys.get(key)).buffer);
    };
    function ecb(op) {
      return function (alg, key, data) {
        if (algName(alg) !== 'AES-ECB' || !ecbKeys.has(key)) return (op === 'e' ? encrypt : decrypt).apply(s, arguments);
        try {
          var k = toWA(ecbKeys.get(key));
          var cfg = { mode: CJ.mode.ECB, padding: CJ.pad.Pkcs7 };
          var out = op === 'e'
            ? CJ.AES.encrypt(toWA(toU8(data)), k, cfg).ciphertext
            : CJ.AES.decrypt({ ciphertext: toWA(toU8(data)) }, k, cfg);
          return Promise.resolve(fromWA(out).buffer);
        } catch (e) { return Promise.reject(e); }
      };
    }
    s.encrypt = ecb('e');
    s.decrypt = ecb('d');
  })();

  g.require = function (name) {
    switch (name) {
      case 'cheerio':
      case 'cheerio-without-node-native':
      case 'react-native-cheerio':
        return cheerioLib;
      case 'crypto-js':
        return g.CryptoJS;
      default:
        throw new Error("Module '" + name + "' is not available");
    }
  };

  g.__eclipsia_load = function () {
    var code = N.getPluginCode();
    try {
      (0, eval)('var module = { exports: {} };\nvar exports = module.exports;\n(function() {\n' + code + '\n})();');
      return true;
    } catch (e) {
      return false;
    }
  };

  g.__eclipsia_run = async function () {
    try {
      var getStreams = (g.module && g.module.exports && g.module.exports.getStreams) || g.getStreams;
      if (!getStreams) {
        N.capture('[]');
        return;
      }
      var args = JSON.parse(N.getCallArgs());
      var season = args.season == null ? undefined : args.season;
      var episode = args.episode == null ? undefined : args.episode;
      var result = await getStreams(args.tmdbId, args.mediaType, season, episode);
      N.capture(JSON.stringify(result || []));
    } catch (e) {
      N.capture('[]');
    }
  };

  g.__eclipsia_settings = async function () {
    try {
      var onSettings = (g.module && g.module.exports && g.module.exports.onSettings) || g.onSettings;
      if (typeof onSettings === 'function') {
        var layout = await onSettings();
        N.capture(JSON.stringify(layout || []));
      } else {
        N.capture('[]');
      }
    } catch (e) {
      N.capture('[]');
    }
  };

  g.__eclipsia_start = function (mode) {
    if (!g.__eclipsia_load()) { N.capture('[]'); return; }
    if (mode === 'settings') g.__eclipsia_settings(); else g.__eclipsia_run();
  };
})();
