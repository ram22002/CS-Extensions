
const crypto = require('crypto');
const b = (a) => Buffer.from(a);
const NATIVE = [b([99,122,49,52,82,83,116,107,78,48,49,80,86,69,53,119]), b([87,84,108,69,118,99,107,100,50,85,82,52,49,115,100,107])];
const PRIMARY = [b([98,47,49,106,109,108,53,110,107,52,120,53,107,55,112,78]), b([49,52,110,77,107,56,109,78,53,75,108,53,75,76,55,108])];
const FALLBACK = [b([109,53,75,108,53,110,107,52,120,75,49,107,78,55,112,78]), b([107,53,75,52,110,77,56,109,75,108,78,76,55,108,49,53])];
const FROM = 'aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ';
const TO = 'fFgGjJkKaApPbBmMoOzZeEnNcCdDrRqQtTvVuUxXhHiIwWyYlLsS';

const aes = (text, [k, iv]) => { const c = crypto.createCipheriv('aes-128-cbc', k, iv); return Buffer.concat([c.update(text, 'utf8'), c.final()]); };
const encNative = (t) => { const s = b(aes(t, NATIVE).toString('base64')); for (let i = 0; i + 1 < s.length; i += 2) { const x = s[i]; s[i] = s[i + 1]; s[i + 1] = x; } return s.reverse().toString('base64'); };
const encPrimary = (t) => Buffer.from(aes(t, PRIMARY).toString('base64')).toString('base64').split('').map((ch) => { const i = FROM.indexOf(ch); return i < 0 ? ch : TO[i]; }).join('');
const encFallback = (t) => aes(t, FALLBACK).toString('base64');

const d = (n) => { const x = new Date(Date.now() + n * 3600e3); return [`${x.getUTCDate()}/${x.getUTCMonth() + 1}/${x.getUTCFullYear()}`, `${x.getUTCHours()}:${x.getUTCMinutes()}:00`]; };
const [sd, st] = d(-1), [ed, et] = d(2);
const events = [
  { category: 'Cricket', eventName: 'Test Series', teamAName: 'India', teamBName: 'Australia', links: 'ind-aus.txt', date: sd, time: st, end_date: ed, end_time: et, link_names: ['A', 'B'] },
  { event: JSON.stringify({ category: 'Football', eventName: 'League', teamAName: 'Arsenal', teamBName: 'Chelsea', links: 'ars-che.txt', date: ed, time: et, end_date: ed, end_time: et }) },
  { category: 'Hidden', eventName: 'x', links: 'x.txt', visible: false },
];
const streams = [
  { name: 'Main HD', link: 'https://livevideos.cricbuzz.com/a/master.m3u8|User-Agent=TestUA&Referer=https%3A%2F%2Fref.example%2F', api: '' },
  { name: 'DRM', link: 'https://cdn.example/live/manifest.mpd', api: '0123456789abcdef0123456789abcdef:fedcba9876543210fedcba9876543210' },
  { name: 'WV', link: 'https://cdn.example/wv/manifest.mpd', api: 'https://lic.example/widevine' },
  { name: 'Tok', link: '', tokenApi: JSON.stringify({ type: 'json', api: 'https://tok.example/get', link_key: 'playback_url' }) },
];
const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720\n720/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\n360/index.m3u8\n';
const enc = [encNative, encPrimary, encFallback];
let n = 0;
exports.searchQuery = 'india';
exports.route = (url) => {
  if (url.includes('firebaseremoteconfig')) return { status: 200, body: { entries: {} } };
  if (/\/events\.txt$/.test(url)) return { status: 200, body: enc[n++ % 3](JSON.stringify(events)) };
  if (/\/ind-aus\.txt$/.test(url)) return { status: 200, body: enc[n++ % 3](JSON.stringify(streams)) };
  if (url.includes('/a/master.m3u8')) return { status: 200, body: master };
  if (url.includes('tok.example')) return { status: 200, body: { playback_url: 'https://tok.example/live.m3u8|Cookie=abc' } };
  return { status: 404, body: '' };
};
