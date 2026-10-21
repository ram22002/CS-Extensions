const MOVIE_BASE = "https://new.katmoviehd.top";
const TVSHW_BASE = "https://new.katdrama.my";
const ANIME_BASE = "https://new.pikahd.co";
const TMDB_API = "https://api.themoviedb.org/3";
const LNK_BASE = "https://links.kmhd.me";
const HBC_BASE = "hubcloud.ist";
const GDF_BASE = ["new5.gdflix.io", "new4.gdflix.io"];
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

function decodeEntities(s) {
  return String(s == null ? "" : s)
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#8211;|&ndash;/g, "-").replace(/&#8212;|&mdash;/g, "-")
    .replace(/&#8217;|&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
}

function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function normWords(s) {
  return String(s || "").toLowerCase().replace(/&amp;/g, "&").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function getText(url, extraHeaders) {
  const headers = Object.assign({
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/json,*/*;q=0.8",
    "Referer": (String(url).match(/^https?:\/\/[^\/]+/) || [""])[0] + "/",
    "Accept-Language": "en-US,en;q=0.9",
  }, extraHeaders || {});
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

function qualityFromText(t) {
  const m = String(t || "").match(/\b(2160p|1440p|1080p|720p|480p|360p)\b/i) || String(t || "").match(/\b4k\b/i);
  if (!m) return "";
  const q = (m[1] || m[0]).toLowerCase();
  return q === "4k" ? "2160p" : q;
}

function qualityRank(q) {
  const n = parseInt(q, 10);
  if (n >= 2160) return 4;
  if (n >= 1080) return 3;
  if (n >= 720) return 2;
  if (n >= 480) return 1;
  return 0;
}

function getSortTag(rank, maxRank) {
  let bin = Math.max(0, maxRank - rank).toString(2);
  while (bin.length < 20) bin = "0" + bin;
  return bin.split("").map((b) => (b === "1" ? "\uFEFF" : "\u200B")).join("");
}

function parseTitle(raw) {
  const t = decodeEntities(raw).replace(/\s+/g, " ").trim();
  const y = t.match(/\b(19\d{2}|20\d{2})\b/);
  const year = y ? parseInt(y[1], 10) : null;
  const sm = t.match(/^(.*?\(Season\s*\d+\))/i);
  const base = sm ? sm[1] : t;
  let cut = base.split(/\s+(?=\(?(?:Hindi|English|Dual|Dubbed|ORG|Clean|Full|All\s+Episodes|Complete|TCRip|HDRip|WEB|BluRay|AMZN|Netflix|JioHotstar|Prime|1080p|720p|480p|2160p|4K|10bit|x265|x264|DD\b|5\.1))/i)[0];
  cut = cut.replace(/\s*[-–|:]+\s*$/, "").replace(/\s*\|.*$/, "").trim();
  if ((cut.match(/\(/g) || []).length > (cut.match(/\)/g) || []).length) cut = cut.replace(/\s*\([^()]*$/, "").trim();
  if (!cut || cut.length < 2) cut = t.split(/\s+(?:Hindi|English|Dual|Dubbed)/i)[0].trim();
  return { name: cut || t.slice(0, 80), year };
}

function seasonOf(title, slug) {
  const m = String(title || "").match(/Season\s*(\d+)/i) || String(title || "").match(/\bS(\d{1,2})\b/i) || String(slug || "").match(/-s(?:eason-)?(\d{1,2})(?:-|$)/i);
  return m ? parseInt(m[1], 10) : 1;
}

function devalueResolve(arr) {
  const resolved = new Array(arr.length);
  const done = new Array(arr.length).fill(false);
  const busy = new Set();
  function walk(v) {
    if (typeof v === "number") return get(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = {};
      for (const k in v) o[k] = walk(v[k]);
      return o;
    }
    return v;
  }
  function get(i) {
    if (i < 0 || i >= arr.length) return i;
    if (done[i]) return resolved[i];
    if (busy.has(i)) return null;
    busy.add(i);
    const val = arr[i];
    resolved[i] = typeof val === "number" ? val : walk(val);
    busy.delete(i);
    done[i] = true;
    return resolved[i];
  }
  for (let i = 0; i < arr.length; i++) get(i);
  return resolved;
}

function resolveAllChunks(text) {
  const out = [];
  const lines = String(text || "").split("\n");
  for (const line of lines) {
    const s = line.trim();
    if (!s) continue;
    try {
      const obj = JSON.parse(s);
      if (obj && obj.type === "chunk" && Array.isArray(obj.data)) {
        out.push(devalueResolve(obj.data));
      } else if (obj && obj.type === "data" && Array.isArray(obj.nodes)) {
        for (const n of obj.nodes) {
          if (n && Array.isArray(n.data)) out.push(devalueResolve(n.data));
        }
      }
    } catch { }
  }
  return out;
}

function findIn(list, pred) {
  for (const res of list) {
    for (const v of res) {
      if (v && typeof v === "object" && pred(v)) return v;
    }
  }
  return null;
}

async function fetchItems(url) {
  const txt = await withTimeout(getText(url), 12000);
  const list = resolveAllChunks(txt);
  const hit = findIn(list, (v) => Array.isArray(v.items) || (v.data && Array.isArray(v.data.items)));
  if (!hit) return [];
  return Array.isArray(hit.items) ? hit.items : hit.data.items;
}

async function fetchPostContent(site, slug) {
  const txt = await withTimeout(getText(site + "/" + slug + "/__data.json?x-sveltekit-invalidated=01"), 12000);
  const hit = findIn(resolveAllChunks(txt), (v) => typeof v.post_content === "string" || (v.data && typeof v.data.post_content === "string"));
  if (hit) return typeof hit.post_content === "string" ? hit.post_content : hit.data.post_content;
  try {
    const html = await withTimeout(getText(site + "/" + slug), 12000);
    const m = html.match(/"post_content":"([\s\S]*?)"\},"error"/);
    if (m) {
      return m[1].replace(/\\u003C/g, "<").replace(/\\u003E/g, ">").replace(/\\u002F/g, "/")
        .replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n").replace(/\\r/g, "\r");
    }
    return html;
  } catch {
    return "";
  }
}

async function fetchKmhdData(kind, id) {
  const path = kind === "pack"
    ? "/pack/" + encodeURIComponent(id) + "/__data.json?x-sveltekit-invalidated=01"
    : "/play/__data.json?x-sveltekit-invalidated=01&id=" + encodeURIComponent(id);
  const txt = await withTimeout(getText(LNK_BASE + path, { "Referer": LNK_BASE + "/", "Origin": LNK_BASE }), 12000);
  const hit = findIn(resolveAllChunks(txt), (v) => v._id && v.info);
  if (hit || kind !== "play") return hit;
  try {
    const html = await withTimeout(getText(LNK_BASE + "/play?id=" + id, { "Referer": LNK_BASE + "/" }), 12000);
    const info = {};
    const re = /(\w+):\{name:"([^"]+)"((?:,[a-z_]+:"[^"]*")*)\}/g;
    let mm;
    while ((mm = re.exec(html)) !== null) {
      if (!/(?:\.|\s)(mkv|mp4|avi)\b/i.test(mm[2])) continue;
      const st = (mm[3].match(/streamtape_res:"([^"]*)"/) || [])[1];
      const sw = (mm[3].match(/streamwish_res:"([^"]*)"/) || [])[1];
      info[mm[1]] = { name: mm[2], streamtape_res: st === "None" ? null : st, streamwish_res: sw === "None" ? null : sw };
    }
    if (Object.keys(info).length) return { _id: id, name: "Play " + id, info };
  } catch { }
  return null;
}

function parseKmhdLinks(html) {
  const out = [];
  let m;
  const re = /<a[^>]+href=["'](?:https?:\/\/links\.kmhd\.(?:me|eu))?\/(play|pack)\/?(?:\?id=|=)?([A-Za-z0-9_-]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = re.exec(html)) !== null) out.push({ kind: m[1], id: m[2], label: stripTags(m[3]) });
  const re2 = /<a[^>]+href=["'](https?:\/\/(?:gdflix\.dev|gdlink\.dev|gd\.kmhd\.(?:eu|me)|new\d*\.gdflix\.io)\/file\/[A-Za-z0-9]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = re2.exec(html)) !== null) out.push({ kind: "gdflix", id: m[1], label: stripTags(m[2]), url: m[1] });
  return out;
}

function fileLinks(html) {
  const out = [];
  const re = /<a[^>]+href=["'](?:https?:\/\/links\.kmhd\.(?:me|eu))?\/file\/([A-Za-z0-9_-]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let label = stripTags(m[2]);
    if (!qualityFromText(label)) {
      const found = html.slice(0, m.index).match(/\b(?:2160p|1440p|1080p|720p|480p|360p)\b|\b4k\b/gi);
      const ctx = found ? qualityFromText(found[found.length - 1]) : "";
      if (ctx) label = ctx + " " + label;
    }
    out.push({ id: m[1], label, at: m.index, end: m.index + m[0].length });
  }
  return out;
}

function playEpisodes(playData) {
  const out = [];
  const info = playData.info || {};
  for (const k of Object.keys(info)) {
    const v = info[k];
    if (!v || !v.name || !/(?:\.|\s)(mkv|mp4|avi)\b/i.test(v.name)) continue;
    const sem = v.name.match(/S(\d{1,2})\s?E(\d{1,3})/i);
    out.push({
      key: k,
      name: v.name,
      hasSeason: !!sem,
      season: sem ? parseInt(sem[1], 10) : null,
      episode: sem ? parseInt(sem[2], 10) : out.length + 1,
      streamtape: v.streamtape_res && v.streamtape_res !== "None" ? v.streamtape_res : null,
    });
  }
  return out;
}

function addFiles(list, extra) {
  for (const f of extra || []) {
    if (!list.some((g) => g[0] === f[0])) list.push(f);
  }
  return list;
}

async function postEpisodes(content, slug, title) {
  const season = seasonOf(title, slug);
  const links = parseKmhdLinks(content);
  const play = links.find((l) => l.kind === "play");
  const files = fileLinks(content);

  const marks = [];
  const mre = /(?:\bEpisode|\bEp\.?|\bE)\s*0*(\d{1,3})\b(?![^<]{0,6}Added)/gi;
  const dlAt = content.search(/DOWNLOAD LINKS|Single Episodes? Link/i);
  let mm;
  while ((mm = mre.exec(content))) {
    if (mm.index > dlAt) marks.push({ ep: parseInt(mm[1], 10), at: mm.index });
  }
  const byEp = {};
  if (marks.length && files.length) {
    for (const f of files) {
      let cur = null;
      for (const mk of marks) if (mk.at < f.end) cur = mk.ep;
      if (cur != null) (byEp[cur] = byEp[cur] || []).push([f.id, f.label]);
    }
  }

  const packEps = {};
  const packKeys = [];
  const packs = links.filter((l) => l.kind === "pack").slice(0, 4);
  const packData = await Promise.all(packs.map((pk) =>
    fetchKmhdData("pack", pk.id).then((d) => ({ pk, d }), () => ({ pk, d: null }))));
  for (const x of packData) {
    if (!x.d || !x.d.info) continue;
    const lab = String(x.pk.label || "").replace(/\s*Links?\b/i, "").replace(/\s+/g, " ").trim();
    for (const k of Object.keys(x.d.info)) {
      const v = x.d.info[k];
      if (!v || !v.name || !/\.(mkv|mp4|avi)\b/i.test(v.name)) continue;
      const sem = v.name.match(/S(\d{1,2})\s?E(\d{1,3})/i);
      const em = sem ? null : v.name.match(/(?:\bE|\bEP|Episode)[ ._-]?(\d{1,3})\b/i);
      if (!sem && !em) continue;
      const s = sem ? parseInt(sem[1], 10) : season;
      const e = parseInt(sem ? sem[2] : em[1], 10);
      const key = s + ":" + e;
      if (!packEps[key]) {
        packEps[key] = { season: s, episode: e, f: [] };
        packKeys.push(key);
      }
      packEps[key].f.push([k, lab || qualityFromText(v.name) || "Auto"]);
    }
  }

  const eps = [];
  const pushPackOnly = (key) => {
    const pe = packEps[key];
    eps.push({ season: pe.season, episode: pe.episode, ref: { f: addFiles(pe.f.slice(), byEp[pe.episode]) } });
  };

  if (play) {
    let pd = null;
    try { pd = await fetchKmhdData("play", play.id); } catch { }
    const list = pd ? playEpisodes(pd) : [];
    for (const e of list) {
      eps.push({
        season: e.hasSeason ? e.season : season,
        episode: e.episode,
        ref: { p: play.id, k: e.key, st: e.streamtape, f: byEp[e.episode] || [] },
      });
    }
    if (eps.length === 1 && !Object.keys(byEp).length && !packKeys.length) {
      eps[0].ref.f = files.map((f) => [f.id, f.label]);
    }
    if (packKeys.length) {
      const have = {};
      for (const e of eps) {
        have[e.season + ":" + e.episode] = 1;
        if (packEps[e.season + ":" + e.episode]) addFiles(e.ref.f, packEps[e.season + ":" + e.episode].f);
      }
      for (const key of packKeys) if (!have[key]) pushPackOnly(key);
    }
  }
  if (!eps.length && packKeys.length) packKeys.forEach(pushPackOnly);
  if (!eps.length && Object.keys(byEp).length) {
    Object.keys(byEp).map(Number).sort((a, b) => a - b).forEach((n) => {
      eps.push({ season, episode: n, ref: { f: byEp[n] } });
    });
  }
  if (!eps.length && files.length) {
    eps.push({ season, episode: 1, ref: { f: files.map((f) => [f.id, f.label]) } });
  }
  if (!eps.length) {
    const gd = links.filter((l) => l.kind === "gdflix" && !/\bpack\b|\bzip\b/i.test(l.label));
    if (gd.length) eps.push({ season, episode: 1, ref: { g: gd.slice(0, 4).map((l) => [l.url, l.label]) } });
  }
  return eps;
}

async function touchMe(fileId, code) {
  try {
    const res = await withTimeout(fetch(LNK_BASE + "/api/touchme/" + encodeURIComponent(fileId) + "?c=" + encodeURIComponent(code), {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": LNK_BASE + "/play?id=xxx",
        "Origin": LNK_BASE,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "",
    }), 10000);
    const j = await res.json();
    return j && j.status === "Done" && j.linkId && j.linkId !== "None" ? j.linkId : null;
  } catch {
    return null;
  }
}

async function extractStreamTape(embedUrl) {
  let html;
  try {
    html = await withTimeout(getText(embedUrl, { "Referer": "https://streamtape.com/" }), 12000);
  } catch {
    return null;
  }
  const s = html.match(/robotlink'\)\.innerHTML\s*=\s*'([^']*)'\s*\+\s*\('([^']+)'\)\.substring\(2\)\.substring\(1\)/);
  if (s) {
    const built = s[1] + s[2].substring(2).substring(1);
    return built.indexOf("//") === 0 ? "https:" + built : built;
  }
  const m = html.match(/id="robotlink"[^>]*>([^<]+)</);
  if (m) {
    const u = m[1].trim().replace(/^\/(?=[^\/])/, "//");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("http") === 0) return u;
  }
  return null;
}

async function resolveHubcloud(pageUrl) {
  const out = [];
  try {
    const html = await withTimeout(getText(pageUrl, { "Referer": "https://" + HBC_BASE + "/" }), 15000);
    let dl = (html.match(/id=["']download["'][^>]*href=["']([^"']+)["']/) ||
      html.match(/href=["']([^"']*hubcloud\.php[^"']+)["']/) || [])[1];
    if (!dl) return out;
    dl = dl.replace(/&amp;/g, "&");
    if (/hubcloud\.php|gamerxyt/.test(dl)) {
      const d2 = await withTimeout(getText(dl, { "Referer": pageUrl }), 15000);
      const r2 = (d2.match(/https:\/\/[^"'\s<>]*r2\.cloudflarestorage\.com[^"'\s<>]+/) || [])[0];
      if (r2) out.push(r2.replace(/&amp;/g, "&"));
      const px = (d2.match(/https:\/\/pixel\.hubcloud\.cx\/\?id=[^"'\s<>]+/) || [])[0];
      if (px) out.push(px);
      if (!out.length) {
        const pd = (d2.match(/https:\/\/pixeldrain\.(?:com|dev)\/u\/([A-Za-z0-9]+)/) || [])[1];
        if (pd) out.push("https://pixeldrain.com/api/file/" + pd + "?download");
      }
    } else if (/r2\.cloudflarestorage\.com|pixel\.hubcloud|pixeldrain/.test(dl)) {
      out.push(dl);
    }
  } catch { }
  return out;
}

async function unwrapInstant(u) {
  try {
    const r = await withTimeout(fetch(u, { headers: { "User-Agent": USER_AGENT, "Range": "bytes=0-0" } }), 12000);
    const fu = String(r.url || "");
    const m = fu.match(/[?&]url=([^&#]+)/);
    if (m) {
      const inner = decodeURIComponent(m[1]);
      if (/^https?:\/\//i.test(inner)) return inner;
    }
    if (/\.pages\.dev\//i.test(fu)) return null;
    if (fu && fu !== u && /^https?:/i.test(fu)) return fu;
  } catch { }
  return u;
}

async function resolveGdflix(pageUrl) {
  const instant = [];
  const direct = [];
  try {
    const fid = (String(pageUrl).match(/\/file\/([A-Za-z0-9]+)/) || [])[1];
    if (!fid) return { instant, direct };
    const given = (String(pageUrl).match(/^https?:\/\/([^\/]+)/) || [])[1];
    const hosts = [given && /gdflix\./i.test(given) ? given : null].concat(GDF_BASE).filter((h, i, a) => h && a.indexOf(h) === i);
    const pages = hosts.map((h) => [h, "https://" + h + "/file/" + fid]).concat([[hosts[0], "https://gdflix.dev/file/" + fid]]);
    let gdHost = hosts[0];
    let html = "";
    for (const [h, p] of pages) {
      if (/busycdn\.xyz|r2\.dev/.test(html)) break;
      try {
        html = await withTimeout(getText(p, { "Referer": "https://" + h + "/" }), 12000);
        gdHost = h;
      } catch {
        html = "";
      }
    }
    for (const u of html.match(/https:\/\/pub-[^\s"']+\.r2\.dev\/[^\s"']+\?token=[^\s"']+/g) || []) {
      const c = u.replace(/&amp;/g, "&");
      if (!direct.includes(c)) direct.push(c);
    }
    for (const u of html.match(/https:\/\/[^"']*busycdn\.xyz\/[^"']+/g) || []) {
      const c = u.replace(/&amp;/g, "&");
      if (!instant.includes(c)) instant.push(c);
    }
    if (!direct.length && !instant.length) {
      const post = (action, base) => withTimeout(fetch("https://" + gdHost + "/" + base + "/" + fid, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": "https://" + gdHost + "/file/" + fid,
          "x-token": gdHost,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "action=" + action + "&key=acbe2066696a1d44345698deb3d9ebf9ae9bbdfd&action_token=",
      }), 15000).then((r) => r.json()).then((j) => j || {}, () => ({}));
      const res = await Promise.all([post("instant", "mfile"), post("direct", "file")]);
      const iu = String(res[0].url || "").replace(/&amp;/g, "&");
      if (!res[0].error && iu.indexOf("http") === 0) instant.push(iu);
      const du = String(res[1].url || "").replace(/&amp;/g, "&");
      if (!res[1].error && du.indexOf("http") === 0) {
        const gid = (du.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || [])[1];
        if (/drive\.google\.com/.test(du)) {
          if (gid) {
            try {
              const chtml = await withTimeout(getText("https://drive.usercontent.google.com/download?id=" + gid + "&export=download", { "Referer": "https://drive.google.com/" }), 10000);
              const action = (chtml.match(/action="([^"]+)"/) || [])[1] || "";
              const fields = [];
              const fr = /name="([^"]+)"\s+value="([^"]*)"/g;
              let fm;
              while ((fm = fr.exec(chtml))) fields.push(fm[1] + "=" + encodeURIComponent(fm[2]));
              if (action && fields.length) direct.push(action + "?" + fields.join("&"));
            } catch { }
          }
        } else {
          direct.push(du);
        }
      }
    }
  } catch { }
  const unwrapped = await Promise.all(instant.slice(0, 3).map(unwrapInstant));
  return { instant: unwrapped.filter((x, i) => x && unwrapped.indexOf(x) === i), direct };
}

function gdStreams(g, q) {
  const out = [];
  for (const u of g.instant) out.push({ url: u, host: "GDFlix Instant", quality: q, headers: {}, rank: 2 });
  for (const u of g.direct) {
    if (/drive\.google\.com\/open/.test(u)) continue;
    out.push({ url: u, host: "GDFlix", quality: q, headers: { "User-Agent": USER_AGENT }, rank: 3 });
  }
  return out;
}

async function streamsForFile(fileId, label, codes) {
  const out = [];
  const res = await Promise.all(codes.map((c) => touchMe(fileId, c).then((l) => [c, l])));
  const mirrors = {};
  for (const r of res) if (r[1]) mirrors[r[0]] = r[1];
  const q = qualityFromText(label) || "";
  const jobs = [];
  if (mirrors.streamtape_res) {
    const m = mirrors.streamtape_res;
    jobs.push(extractStreamTape(m.indexOf("http") === 0 ? m : "https://streamtape.com/e/" + m).then((d) => {
      if (d) out.push({ url: d, host: "StreamTape", quality: q, headers: { "User-Agent": USER_AGENT, "Referer": "https://streamtape.com/" }, rank: 1 });
    }));
  }
  if (mirrors.hubdrive_res) {
    jobs.push(resolveHubcloud(mirrors.hubdrive_res).then((links) => {
      links.forEach((u) => out.push({ url: u, host: "HubCloud", quality: q, headers: { "User-Agent": USER_AGENT }, rank: 0 }));
    }));
  }
  if (mirrors.gdflix_res) {
    jobs.push(resolveGdflix(mirrors.gdflix_res).then((g) => { out.push(...gdStreams(g, q)); }));
  }
  await Promise.allSettled(jobs);
  return out;
}

async function streamsFromRef(ref) {
  const jobs = [];
  if (ref.p && ref.k) {
    jobs.push((async () => {
      let q = "";
      try {
        const pd = await fetchKmhdData("play", ref.p);
        const e = pd && pd.info && pd.info[ref.k];
        q = e ? qualityFromText(e.name) : "";
      } catch { }
      const tasks = [streamsForFile(ref.k, q, ["hubdrive_res", "gdflix_res"])];
      if (ref.st) {
        tasks.push(extractStreamTape("https://streamtape.com/e/" + ref.st).then((d) =>
          d ? [{ url: d, host: "StreamTape", quality: q, headers: { "User-Agent": USER_AGENT, "Referer": "https://streamtape.com/" }, rank: 1 }] : [], () => []));
      }
      return [].concat(...(await Promise.all(tasks)));
    })());
  }
  for (const g of (ref.g || []).slice(0, 4)) {
    jobs.push(resolveGdflix(g[0]).then((r) => gdStreams(r, qualityFromText(g[1]))));
  }
  for (const f of (ref.f || []).slice(0, 6)) {
    jobs.push(streamsForFile(f[0], f[1], ["hubdrive_res", "gdflix_res", "streamtape_res"]));
  }
  const settled = await Promise.allSettled(jobs);
  return [].concat(...settled.filter((s) => s.status === "fulfilled").map((s) => s.value));
}

async function probe(s) {
  try {
    const r = await withTimeout(fetch(s.url, { headers: Object.assign({}, s.headers, { "Range": "bytes=0-2047" }) }), 9000);
    const st = r.status;
    if (st === 0) return /host lookup|ENOTFOUND|getaddrinfo|No address/i.test(String(r.statusText || "")) ? "dead" : "unknown";
    if (st === 200 || st === 206) {
      const body = String(await r.text()).replace(/^\uFEFF/, "").replace(/^\s+/, "").slice(0, 600);
      if (/^<(!doctype|html|head|body)/i.test(body)) return "dead";
      if (/^PK\u0003\u0004|^Rar!/.test(body)) return "dead";
      return "ok";
    }
    if (st === 401 || st === 403 || st === 429) return "unknown";
    return "dead";
  } catch {
    return "unknown";
  }
}

async function verifyStreams(list) {
  const verdicts = await Promise.all(list.map(probe));
  const ok = [];
  const unknown = [];
  list.forEach((s, i) => {
    if (verdicts[i] === "ok") ok.push(s);
    else if (verdicts[i] === "unknown") unknown.push(s);
  });
  const keep = unknown.slice(0, Math.max(0, 3 - Math.min(ok.length, 2)));
  keep.forEach((s) => { s.host += " (may not play)"; });
  return ok.concat(keep);
}

async function getTmdbNames(tmdbId, mediaType) {
  const key = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "";
  if (!key) return null;
  try {
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const res = await fetch(TMDB_API + "/" + endpoint + "/" + tmdbId + "?api_key=" + key + "&append_to_response=alternative_titles");
    if (!res.ok) return null;
    const d = await res.json();
    if (!d) return null;
    const alts = (d.alternative_titles && (d.alternative_titles.results || d.alternative_titles.titles)) || [];
    const altNames = alts.filter((a) => a.iso_3166_1 === "JP").concat(alts).map((a) => a.title);
    const names = [mediaType === "tv" ? d.name : d.title, mediaType === "tv" ? d.original_name : d.original_title]
      .concat(altNames)
      .filter((n, i, a) => n && a.indexOf(n) === i && normWords(n).length)
      .slice(0, 6);
    const year = parseInt(String(d.release_date || d.first_air_date || "").slice(0, 4), 10) || null;
    const animation = (d.genres || []).some((g) => g.id === 16);
    const japan = d.original_language === "ja"
      || (d.origin_country || []).includes("JP")
      || (d.production_countries || []).some((c) => c.iso_3166_1 === "JP");
    return names.length ? { names, year, animation, anime: animation && japan } : null;
  } catch {
    return null;
  }
}

async function findPosts(names, year, mediaType, season, sites) {
  const seen = {};
  const found = [];
  const queries = [];
  for (const n of names) {
    const words = normWords(n);
    const longest = words.slice().sort((a, b) => b.length - a.length)[0] || n;
    for (const v of names.indexOf(n) < 2 ? [n, words.join("-"), longest] : [n]) {
      if (v && !queries.includes(v)) queries.push(v);
    }
  }
  const jobs = [];
  for (const site of sites) {
    for (const v of queries.slice(0, 10)) {
      jobs.push(fetchItems(site + "/__data.json?x-sveltekit-invalidated=01&q=" + encodeURIComponent(v) + "&page=1")
        .then((list) => list.map((it) => Object.assign({}, it, { site })), () => []));
    }
  }
  for (const list of await Promise.all(jobs)) {
    for (const it of list) {
      const k = it && it.slug ? it.site + "/" + it.slug : null;
      if (k && !seen[k]) {
        seen[k] = 1;
        found.push(it);
      }
    }
  }
  const wanted = names.map((n) => normWords(n));
  const scored = [];
  for (const it of found) {
    const title = String(it.post_title || it.slug);
    if (/\bzip\b/i.test(title)) continue;
    const isSeason = /\bSeason\s*\d+|\bS\d{1,2}\b/i.test(title) || /-s\d{1,2}(?:-|$)/i.test(it.slug);
    if (mediaType === "tv") {
      if (seasonOf(title, it.slug) !== season) continue;
    } else {
      if (isSeason) continue;
      const py = parseTitle(title).year;
      if (year && py && Math.abs(py - year) > 1) continue;
    }
    const bare = normWords(parseTitle(title).name.replace(/\(Season\s*\d+\)|\bSeason\s*\d+\b|\bS\d{1,2}\b|\((?:19|20)\d{2}(?:[-–]\d{2,4})?\)/gi, " "));
    const bareJoined = bare.join(" ");
    const tw = " " + normWords(title).join(" ") + " ";
    const twj = tw.replace(/ /g, "");
    let best = -1;
    for (const w of wanted) {
      if (!w.length) continue;
      if (w.join(" ") === bareJoined) { best = 0; break; }
      if (w.every((x) => tw.indexOf(" " + x) >= 0 || twj.indexOf(x) >= 0)) best = 1;
    }
    if (best >= 0) scored.push({ it, score: best });
  }
  scored.sort((a, b) => a.score - b.score);
  const perSite = {};
  return scored.filter((s) => {
    perSite[s.it.site] = (perSite[s.it.site] || 0) + 1;
    return perSite[s.it.site] <= 3;
  }).map((s) => s.it);
}

async function streamsFromSites(meta, sites, mediaType, season, episode) {
  try {
    const posts = await findPosts(meta.names, meta.year, mediaType, season, sites);
    if (!posts.length) return [];

    const refs = await Promise.all(posts.map(async (it) => {
      try {
        const content = await fetchPostContent(it.site, it.slug);
        if (!content) return null;
        const eps = await postEpisodes(content, it.slug, String(it.post_title || "") + " " + it.slug);
        const hit = mediaType === "tv" ? eps.find((e) => e.season === season && e.episode === episode) : eps[0];
        return hit ? { ref: hit.ref, site: it.site } : null;
      } catch {
        return null;
      }
    }));

    const results = await Promise.all(refs.filter(Boolean).map((r) =>
      streamsFromRef(r.ref).then((list) => list.map((s) => Object.assign(s, { site: r.site })), () => [])));
    const all = [].concat(...results);

    const seenUrl = {};
    const unique = [];
    all.sort((a, b) => (qualityRank(b.quality) - qualityRank(a.quality)) || (a.rank - b.rank)).forEach((s) => {
      const k = String(s.url).split("?")[0];
      if (seenUrl[k]) return;
      seenUrl[k] = 1;
      unique.push(s);
    });
    const hd = unique.filter((s) => s.quality === "1080p" || s.quality === "2160p");
    if (!hd.length) return [];

    const verified = await verifyStreams(hd);
    const taken = {};
    const picked = verified.filter((s) => {
      const k = s.host.replace(/ \(may not play\)$/, "") + "|" + s.quality;
      if (taken[k]) return false;
      taken[k] = 1;
      return true;
    });
    return picked.map((s) => {
      const label = (s.site === TVSHW_BASE ? "KatDrama" : s.site === MOVIE_BASE ? "KatMovie" : "PikaHD") + " • " + s.host + (s.quality ? " • " + s.quality : "");
      const tag = getSortTag(qualityRank(s.quality), 4);
      return {
        name: tag + label,
        title: tag + label,
        url: s.url,
        quality: s.quality || "Unknown",
        headers: s.headers,
      };
    });
  } catch (e) {
    return [];
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType === "tv" && (season == null || episode == null)) return [];
    const meta = await getTmdbNames(tmdbId, mediaType);
    if (!meta) return [];
    let sites;
    if (meta.anime) sites = [ANIME_BASE];
    else {
      sites = mediaType === "tv" ? [TVSHW_BASE] : [TVSHW_BASE, MOVIE_BASE];
      if (meta.animation) sites.push(ANIME_BASE);
    }
    return await streamsFromSites(meta, sites, mediaType, season, episode);
  } catch (e) {
    return [];
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  globalThis.getStreams = getStreams;
}