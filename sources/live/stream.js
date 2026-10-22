(function () {
    "use strict";

    var g = globalThis;
    var runtimeManifest = (typeof manifest !== "undefined" && manifest) ? manifest : {};

    var FIREBASE_CONFIG = {
        packageName: "com.playz.tv",
        apiKey: ["AIzaSy", "DKRqLlbaZBIpHzLBiQ", "TUrJqr3gN-nDWWc"].join(""),
        appId: "1:516859456626:android:12a75869902c4f8a6826eb",
        projectNumber: "516859456626",
        sdkVersion: "22.1.0",
        appVersion: "2.1",
        appBuild: "4"
    };
    var DEFAULT_BASE_URLS = [
        "https://tourniquest.site",
        "https://adsflw.xyz"
    ];
    var REQUEST_TIMEOUT_MS = 15000;
    var BASE_URL_TTL = 3600000;

    var PLAYZ_NATIVE_KEY = new Uint8Array([99, 122, 49, 52, 82, 83, 116, 107, 78, 48, 49, 80, 86, 69, 53, 119]);
    var PLAYZ_NATIVE_IV = new Uint8Array([87, 84, 108, 69, 118, 99, 107, 100, 50, 85, 82, 52, 49, 115, 100, 107]);
    var PLAYZ_PRIMARY_KEY = new Uint8Array([98, 47, 49, 106, 109, 108, 53, 110, 107, 52, 120, 53, 107, 55, 112, 78]);
    var PLAYZ_PRIMARY_IV = new Uint8Array([49, 52, 110, 77, 107, 56, 109, 78, 53, 75, 108, 53, 75, 76, 55, 108]);
    var PLAYZ_FALLBACK_KEY = new Uint8Array([109, 53, 75, 108, 53, 110, 107, 52, 120, 75, 49, 107, 78, 55, 112, 78]);
    var PLAYZ_FALLBACK_IV = new Uint8Array([107, 53, 75, 52, 110, 77, 56, 109, 75, 108, 78, 76, 55, 108, 49, 53]);

    var PLAYZ_SUBSTITUTION_FROM = "aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ";
    var PLAYZ_SUBSTITUTION_TO = "fFgGjJkKaApPbBmMoOzZeEnNcCdDrRqQtTvVuUxXhHiIwWyYlLsS";
    var PLAYZ_SUBSTITUTION_REVERSE = {};
    for (var si = 0; si < PLAYZ_SUBSTITUTION_TO.length; si++) {
        PLAYZ_SUBSTITUTION_REVERSE[PLAYZ_SUBSTITUTION_TO[si]] = PLAYZ_SUBSTITUTION_FROM[si];
    }

    var AES = (function() {
        const S = [
            99, 124, 119, 123, 242, 107, 111, 197, 48, 1, 103, 43, 254, 215, 171, 118,
            202, 130, 201, 125, 250, 89, 71, 240, 173, 212, 162, 175, 156, 164, 114, 192,
            183, 253, 147, 38, 54, 63, 247, 204, 52, 165, 229, 241, 113, 216, 49, 21,
            4, 199, 35, 195, 24, 150, 5, 154, 7, 18, 128, 226, 235, 39, 178, 117,
            9, 131, 44, 26, 27, 110, 90, 160, 82, 59, 214, 179, 41, 227, 47, 132,
            83, 209, 0, 237, 32, 252, 177, 91, 106, 203, 190, 57, 74, 76, 88, 207,
            208, 239, 170, 251, 67, 77, 51, 133, 69, 249, 2, 127, 80, 60, 159, 168,
            81, 163, 64, 143, 146, 157, 56, 245, 188, 182, 218, 33, 16, 255, 243, 210,
            205, 12, 19, 236, 95, 151, 68, 23, 196, 167, 126, 61, 100, 93, 25, 115,
            96, 129, 79, 220, 34, 42, 144, 136, 70, 238, 184, 20, 222, 94, 11, 219,
            224, 50, 58, 10, 73, 6, 36, 92, 194, 211, 172, 98, 145, 149, 228, 121,
            231, 200, 55, 109, 141, 213, 78, 169, 108, 86, 244, 234, 101, 122, 174, 8,
            186, 120, 37, 46, 28, 166, 180, 198, 232, 221, 116, 31, 75, 189, 139, 138,
            112, 62, 181, 102, 72, 3, 246, 14, 97, 53, 87, 185, 134, 193, 29, 158,
            225, 248, 152, 17, 105, 217, 142, 148, 155, 30, 135, 233, 206, 85, 40, 223,
            140, 161, 137, 13, 191, 230, 66, 104, 65, 153, 45, 15, 176, 84, 187, 22
        ];
        const Si = new Array(256);
        for (let i = 0; i < 256; i++) Si[S[i]] = i;
        const Rcon = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B, 0x36];
        const Td0 = new Uint32Array(256), Td1 = new Uint32Array(256), Td2 = new Uint32Array(256), Td3 = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            const s = Si[i];
            let s2 = (s << 1) ^ ((s & 0x80) ? 0x11b : 0);
            let s4 = (s2 << 1) ^ ((s2 & 0x80) ? 0x11b : 0);
            let s8 = (s4 << 1) ^ ((s4 & 0x80) ? 0x11b : 0);
            let e = s8 ^ s4 ^ s2;
            let b = s8 ^ s2 ^ s;
            let d = s8 ^ s4 ^ s;
            let nine = s8 ^ s;
            Td0[i] = ((e << 24) | (nine << 16) | (d << 8) | b) >>> 0;
            Td1[i] = ((b << 24) | (e << 16) | (nine << 8) | d) >>> 0;
            Td2[i] = ((d << 24) | (b << 16) | (e << 8) | nine) >>> 0;
            Td3[i] = ((nine << 24) | (d << 16) | (b << 8) | e) >>> 0;
        }
        function keyExpansion(key) {
            const keyLen = key.length;
            const Nk = Math.floor(keyLen / 4);
            const Nr = Nk + 6;
            const w = new Uint32Array(4 * (Nr + 1));
            for (let i = 0; i < Nk; i++) {
                w[i] = ((key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3]) >>> 0;
            }
            for (let i = Nk; i < 4 * (Nr + 1); i++) {
                let temp = w[i - 1];
                if (i % Nk === 0) {
                    temp = (temp << 8) | (temp >>> 24);
                    temp = ((S[(temp >>> 24) & 0xff] << 24) |
                            (S[(temp >>> 16) & 0xff] << 16) |
                            (S[(temp >>> 8) & 0xff] << 8) |
                            S[temp & 0xff]) ^ (Rcon[Math.floor(i / Nk)] << 24);
                } else if (Nk > 6 && i % Nk === 4) {
                    temp = (S[(temp >>> 24) & 0xff] << 24) |
                           (S[(temp >>> 16) & 0xff] << 16) |
                           (S[(temp >>> 8) & 0xff] << 8) |
                           S[temp & 0xff];
                }
                w[i] = (w[i - Nk] ^ temp) >>> 0;
            }
            const dw = new Uint32Array(w.length);
            for (let r = 0; r <= Nr; r++) {
                for (let c = 0; c < 4; c++) {
                    const idx = r * 4 + c;
                    if (r === 0 || r === Nr) {
                        dw[idx] = w[idx];
                    } else {
                        const val = w[idx];
                        const v0 = (val >>> 24) & 0xff;
                        const v1 = (val >>> 16) & 0xff;
                        const v2 = (val >>> 8) & 0xff;
                        const v3 = val & 0xff;
                        dw[idx] = (Td0[S[v0]] ^ Td1[S[v1]] ^ Td2[S[v2]] ^ Td3[S[v3]]) >>> 0;
                    }
                }
            }
            return { dw, Nr };
        }
        function decryptBlock(inBytes, inOffset, outBytes, outOffset, dw, Nr) {
            let s0 = ((inBytes[inOffset] << 24) | (inBytes[inOffset + 1] << 16) | (inBytes[inOffset + 2] << 8) | inBytes[inOffset + 3]) ^ dw[Nr * 4];
            let s1 = ((inBytes[inOffset + 4] << 24) | (inBytes[inOffset + 5] << 16) | (inBytes[inOffset + 6] << 8) | inBytes[inOffset + 7]) ^ dw[Nr * 4 + 1];
            let s2 = ((inBytes[inOffset + 8] << 24) | (inBytes[inOffset + 9] << 16) | (inBytes[inOffset + 10] << 8) | inBytes[inOffset + 11]) ^ dw[Nr * 4 + 2];
            let s3 = ((inBytes[inOffset + 12] << 24) | (inBytes[inOffset + 13] << 16) | (inBytes[inOffset + 14] << 8) | inBytes[inOffset + 15]) ^ dw[Nr * 4 + 3];
            s0 >>>= 0; s1 >>>= 0; s2 >>>= 0; s3 >>>= 0;
            let t0, t1, t2, t3;
            for (let r = Nr - 1; r > 0; r--) {
                const kOffset = r * 4;
                t0 = (Td0[(s0 >>> 24) & 0xff] ^ Td1[(s3 >>> 16) & 0xff] ^ Td2[(s2 >>> 8) & 0xff] ^ Td3[s1 & 0xff] ^ dw[kOffset]) >>> 0;
                t1 = (Td0[(s1 >>> 24) & 0xff] ^ Td1[(s0 >>> 16) & 0xff] ^ Td2[(s3 >>> 8) & 0xff] ^ Td3[s2 & 0xff] ^ dw[kOffset + 1]) >>> 0;
                t2 = (Td0[(s2 >>> 24) & 0xff] ^ Td1[(s1 >>> 16) & 0xff] ^ Td2[(s0 >>> 8) & 0xff] ^ Td3[s3 & 0xff] ^ dw[kOffset + 2]) >>> 0;
                t3 = (Td0[(s3 >>> 24) & 0xff] ^ Td1[(s2 >>> 16) & 0xff] ^ Td2[(s1 >>> 8) & 0xff] ^ Td3[s0 & 0xff] ^ dw[kOffset + 3]) >>> 0;
                s0 = t0; s1 = t1; s2 = t2; s3 = t3;
            }
            const k0 = dw[0], k1 = dw[1], k2 = dw[2], k3 = dw[3];
            outBytes[outOffset]      = ((Si[(s0 >>> 24) & 0xff] << 24) ^ k0) >>> 24;
            outBytes[outOffset + 1]  = ((Si[(s3 >>> 16) & 0xff] << 16) ^ k0) >>> 16;
            outBytes[outOffset + 2]  = ((Si[(s2 >>> 8) & 0xff] << 8) ^ k0) >>> 8;
            outBytes[outOffset + 3]  = (Si[s1 & 0xff] ^ k0) & 0xff;
            outBytes[outOffset + 4]  = ((Si[(s1 >>> 24) & 0xff] << 24) ^ k1) >>> 24;
            outBytes[outOffset + 5]  = ((Si[(s0 >>> 16) & 0xff] << 16) ^ k1) >>> 16;
            outBytes[outOffset + 6]  = ((Si[(s3 >>> 8) & 0xff] << 8) ^ k1) >>> 8;
            outBytes[outOffset + 7]  = (Si[s2 & 0xff] ^ k1) & 0xff;
            outBytes[outOffset + 8]  = ((Si[(s2 >>> 24) & 0xff] << 24) ^ k2) >>> 24;
            outBytes[outOffset + 9]  = ((Si[(s1 >>> 16) & 0xff] << 16) ^ k2) >>> 16;
            outBytes[outOffset + 10] = ((Si[(s0 >>> 8) & 0xff] << 8) ^ k2) >>> 8;
            outBytes[outOffset + 11] = (Si[s3 & 0xff] ^ k2) & 0xff;
            outBytes[outOffset + 12] = ((Si[(s3 >>> 24) & 0xff] << 24) ^ k3) >>> 24;
            outBytes[outOffset + 13] = ((Si[(s2 >>> 16) & 0xff] << 16) ^ k3) >>> 16;
            outBytes[outOffset + 14] = ((Si[(s1 >>> 8) & 0xff] << 8) ^ k3) >>> 8;
            outBytes[outOffset + 15] = (Si[s0 & 0xff] ^ k3) & 0xff;
        }
        return {
            decryptCbc: function(ciphertext, key, iv) {
                if (!ciphertext || !ciphertext.length) return new Uint8Array(0);
                const { dw, Nr } = keyExpansion(key);
                const plain = new Uint8Array(ciphertext.length);
                const blockOut = new Uint8Array(16);
                let prev = iv;
                for (let i = 0; i + 16 <= ciphertext.length; i += 16) {
                    decryptBlock(ciphertext, i, blockOut, 0, dw, Nr);
                    for (let j = 0; j < 16; j++) {
                        plain[i + j] = blockOut[j] ^ prev[j];
                    }
                    prev = ciphertext.subarray(i, i + 16);
                }
                const pad = plain[plain.length - 1];
                if (pad > 0 && pad <= 16 && pad <= plain.length) {
                    for (let k = plain.length - pad; k < plain.length; k++) {
                        if (plain[k] !== pad) return plain;
                    }
                    return plain.subarray(0, plain.length - pad);
                }
                return plain;
            }
        };
    })();

    var activeBaseUrl = null;
    var remoteBaseUrlsPromise = null;

    function cacheGet(key, ttl) {
        try { return g.cache ? g.cache.get(key, ttl) : null; } catch (_) { return null; }
    }

    function cacheSet(key, value) {
        try { if (g.cache) g.cache.set(key, value); } catch (_) {}
    }

    function errText(error) {
        return error && error.message ? error.message : String(error);
    }

    function trimToString(value) {
        if (value === null || value === undefined) return "";
        return typeof value === "string" ? value.trim() : String(value).trim();
    }

    function normalizeBaseUrl(value) {
        var normalized = trimToString(value).replace(/\/+$/, "");
        if (!normalized || /example\.com/i.test(normalized)) return null;
        if (!/^https?:\/\//i.test(normalized)) return null;
        return normalized;
    }

    function extractResponseBody(response) {
        if (!response) return "";
        if (typeof response === "string") return response;
        if (response && typeof response.body === "string") return response.body;
        return "";
    }

    function extractResponseStatus(response) {
        if (!response) return 200;
        return response && typeof response.status !== "undefined" ? response.status : 200;
    }

    function createAppInstanceId() {
        var value = "";
        while (value.length < 32) {
            value += Math.random().toString(16).slice(2);
        }
        return value.slice(0, 32);
    }

    function safeJsonParse(text) {
        if (!text) return null;
        try {
            return JSON.parse(String(text));
        } catch (_) {
            return null;
        }
    }

    function base64ToBytes(value) {
        var normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
        while (normalized.length % 4) normalized += "=";
        try {
            if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(normalized, "base64"));
        } catch (_) {}
        var decoded = typeof atob === "function" ? atob(normalized) : "";
        var bytes = new Uint8Array(decoded.length);
        for (var index = 0; index < decoded.length; index++) {
            bytes[index] = decoded.charCodeAt(index) & 255;
        }
        return bytes;
    }

    function bytesToAscii(bytes) {
        var out = "";
        for (var index = 0; index < bytes.length; index++) {
            out += String.fromCharCode(bytes[index]);
        }
        return out;
    }

    function bytesToUtf8(bytes) {
        if (!bytes || !bytes.length) return "";
        if (typeof TextDecoder !== "undefined") {
            try {
                return new TextDecoder().decode(bytes);
            } catch (_) {}
        }
        var out = "";
        for (var index = 0; index < bytes.length; index++) {
            out += String.fromCharCode(bytes[index]);
        }
        try {
            return decodeURIComponent(escape(out));
        } catch (_) {
            return out;
        }
    }

    function swapAdjacentPairs(bytes) {
        var out = new Uint8Array(bytes);
        for (var i = 0; i + 1 < out.length; i += 2) {
            var tmp = out[i];
            out[i] = out[i + 1];
            out[i + 1] = tmp;
        }
        return out;
    }

    function withTimeout(promise, ms, fallback) {
        return new Promise(function (resolve) {
            var done = false;
            var timer = setTimeout(function () {
                if (!done) { done = true; resolve(fallback); }
            }, ms);
            Promise.resolve(promise).then(function (value) {
                if (!done) { done = true; clearTimeout(timer); resolve(value); }
            }, function (error) {
                if (!done) { done = true; clearTimeout(timer); resolve(fallback); }
            });
        });
    }

    async function postJson(url, payload, headers) {
        if (!url || typeof url !== "string") throw new Error("Invalid URL for postJson");
        var body = JSON.stringify(payload);
        var request = typeof http_post === "function"
            ? http_post(url, headers || {}, body)
            : fetch(url, { method: "POST", headers: headers || {}, body: body }).then(async function (response) {
                return { status: response.status, body: await response.text() };
            });
        return withTimeout(request, REQUEST_TIMEOUT_MS, { status: 0, body: "" });
    }

    async function fetchText(url, headers) {
        if (!url || typeof url !== "string") throw new Error("Invalid URL for fetchText");
        var request = typeof http_get === "function"
            ? http_get(url, headers || {})
            : fetch(url, { headers: headers || {} }).then(async function (response) {
                return { status: response.status, body: await response.text() };
            });
        return withTimeout(request, REQUEST_TIMEOUT_MS, { status: 0, body: "" });
    }

    async function fetchRemoteBaseUrls() {
        var cached = cacheGet("remote_base_urls", BASE_URL_TTL);
        if (Array.isArray(cached) && cached.length) return cached;
        if (remoteBaseUrlsPromise) return remoteBaseUrlsPromise;

        remoteBaseUrlsPromise = (async function () {
            var endpoint = "https://firebaseremoteconfig.googleapis.com/v1/projects/" + FIREBASE_CONFIG.projectNumber + "/namespaces/firebase:fetch";
            var payload = {
                appInstanceId: createAppInstanceId(),
                appInstanceIdToken: "",
                appId: FIREBASE_CONFIG.appId,
                countryCode: "US",
                languageCode: "en-US",
                platformVersion: "30",
                timeZone: "UTC",
                appVersion: FIREBASE_CONFIG.appVersion,
                appBuild: FIREBASE_CONFIG.appBuild,
                packageName: FIREBASE_CONFIG.packageName,
                sdkVersion: FIREBASE_CONFIG.sdkVersion,
                analyticsUserProperties: {}
            };
            var headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Android-Package": FIREBASE_CONFIG.packageName,
                "X-Goog-Api-Key": FIREBASE_CONFIG.apiKey,
                "X-Google-GFE-Can-Retry": "yes",
                "User-Agent": "okhttp/4.12.0"
            };

            try {
                var response = await postJson(endpoint, payload, headers);
                if (extractResponseStatus(response) >= 400 || extractResponseStatus(response) === 0) return [];

                var data = safeJsonParse(extractResponseBody(response));
                var entries = data && data.entries ? data.entries : {};
                var urls = [];
                var normalized = normalizeBaseUrl(entries.api_url);
                if (normalized) urls.push(normalized);
                if (urls.length) cacheSet("remote_base_urls", urls);
                return urls;
            } catch (error) {
                return [];
            }
        })();

        return remoteBaseUrlsPromise;
    }

    async function getBaseUrls() {
        var urls = [];
        function addUrl(value) {
            var normalized = normalizeBaseUrl(value);
            if (normalized && urls.indexOf(normalized) === -1) urls.push(normalized);
        }

        addUrl(activeBaseUrl);
        try {
            (await fetchRemoteBaseUrls()).forEach(addUrl);
        } catch (error) {
        }
        addUrl(runtimeManifest && runtimeManifest.baseUrl);
        DEFAULT_BASE_URLS.forEach(addUrl);
        return urls;
    }

    function buildPlayzHeaders() {
        return {
            "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 10; SM-A505F)"
        };
    }

    async function decryptPlayzPayload(body) {
        var raw = trimToString(body);
        if (!raw) return "";
        if (raw.charAt(0) === "{" || raw.charAt(0) === "[" || raw.charAt(0) === "<") return raw;
        var stripped = raw.replace(/\s+/g, "");

        try {
            var b1 = base64ToBytes(stripped);
            var b1Rev = new Uint8Array(b1).reverse();
            var b2 = swapAdjacentPairs(b1Rev);
            var b2Str = bytesToAscii(b2).replace(/\s+/g, "");
            var b3 = base64ToBytes(b2Str);
            var text1 = bytesToUtf8(AES.decryptCbc(b3, PLAYZ_NATIVE_KEY, PLAYZ_NATIVE_IV)).trim();
            if (text1.charAt(0) === "{" || text1.charAt(0) === "[") return text1;
        } catch (_) {}

        try {
            var restored = "";
            for (var i = 0; i < stripped.length; i++) {
                var ch = stripped.charAt(i);
                restored += PLAYZ_SUBSTITUTION_REVERSE[ch] || ch;
            }
            var inner = bytesToAscii(base64ToBytes(restored));
            var text2 = bytesToUtf8(AES.decryptCbc(base64ToBytes(inner), PLAYZ_PRIMARY_KEY, PLAYZ_PRIMARY_IV)).trim();
            if (text2.charAt(0) === "{" || text2.charAt(0) === "[") return text2;
        } catch (_) {}

        try {
            var text3 = bytesToUtf8(AES.decryptCbc(base64ToBytes(stripped), PLAYZ_FALLBACK_KEY, PLAYZ_FALLBACK_IV)).trim();
            if (text3.charAt(0) === "{" || text3.charAt(0) === "[") return text3;
        } catch (_) {}

        return "";
    }

    async function fetchPlayzPayload(url) {
        if (!url || typeof url !== "string") return "";
        try {
            var response = await fetchText(url, buildPlayzHeaders());
            var status = extractResponseStatus(response);
            if (status < 200 || status >= 300) return "";
            return await decryptPlayzPayload(extractResponseBody(response));
        } catch (error) {
            return "";
        }
    }

    async function fetchPlayzJson(path) {
        if (!path || typeof path !== "string") return null;

        async function attempt(baseUrl) {
            var finalUrl = /^https?:\/\//i.test(path) ? path : baseUrl + "/" + String(path).replace(/^\/+/, "");
            var data = safeJsonParse(await fetchPlayzPayload(finalUrl));
            if (data) {
                activeBaseUrl = normalizeBaseUrl(baseUrl);
                cacheSet("active_base_url", activeBaseUrl);
                return data;
            }
            return null;
        }

        var tried = {};
        var cachedActive = activeBaseUrl || normalizeBaseUrl(cacheGet("active_base_url", BASE_URL_TTL));
        if (cachedActive) {
            tried[cachedActive] = true;
            var fast = await attempt(cachedActive);
            if (fast) return fast;
        }

        var baseUrls = await getBaseUrls();
        for (var k = 0; k < baseUrls.length; k++) {
            if (tried[baseUrls[k]]) continue;
            try {
                var data = await attempt(baseUrls[k]);
                if (data) return data;
            } catch (error) {
            }
        }
        return null;
    }

    var PLAYZ_TRUSTED_HOSTS = [
        "a201aivottlinear-a.akamaihd.net",
        "otte.live.cf.ww.aiv-cdn.net",
        "in-mc-flive.fancode.com",
        "livevideos.cricbuzz.com",
        "livetv.hotstar.com",
        "jiotvpllive.cdn.jio.com",
        "dice-live-oc.akamaized.net"
    ];
    var PLAYZ_WEAK_HOSTS = [
        "winner-api.icu",
        "mainstreams.pro",
        "smarthard.click",
        "chatgpt.hereisman.net",
        "windows-devs.top",
        "firebase-api.com",
        "195.178.110.2"
    ];
    var CONCURRENCY = 6;
    var CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
    var MOBILE_UA = "Mozilla/5.0 (Linux; Android 10; Pixel 3 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";

    async function mapWithConcurrency(items, limit, worker) {
        var results = new Array(items.length);
        var nextIndex = 0;
        async function runWorker() {
            while (nextIndex < items.length) {
                var currentIndex = nextIndex++;
                try {
                    results[currentIndex] = await worker(items[currentIndex], currentIndex);
                } catch (error) {
                    results[currentIndex] = [];
                }
            }
        }
        var workers = [];
        for (var i = 0; i < Math.max(1, Math.min(limit, items.length)); i++) workers.push(runWorker());
        await Promise.all(workers);
        return results;
    }

    async function fetchWithMethod(url, requestType, headers, body, bodyType) {
        if (trimToString(requestType).toLowerCase() !== "post") return fetchText(url, headers);

        var postHeaders = Object.assign({}, headers || {});
        var type = trimToString(bodyType).toLowerCase();
        if (!postHeaders["Content-Type"]) {
            postHeaders["Content-Type"] = type === "json" ? "application/json"
                : type === "text" ? "text/plain; charset=utf-8"
                : "application/x-www-form-urlencoded; charset=utf-8";
        }
        var request = typeof http_post === "function"
            ? http_post(url, postHeaders, body || "")
            : fetch(url, { method: "POST", headers: postHeaders, body: body || "" }).then(async function (response) {
                return { status: response.status, body: await response.text() };
            });
        return withTimeout(request, REQUEST_TIMEOUT_MS, { status: 0, body: "" });
    }

    function normalizeHeaderName(key) {
        if (!key) return "";
        var lowered = trimToString(key).toLowerCase();
        if (lowered === "user-agent") return "User-Agent";
        if (lowered === "referer" || lowered === "referrer") return "Referer";
        if (lowered === "origin") return "Origin";
        if (lowered === "cookie") return "Cookie";
        return trimToString(key);
    }

    function normalizeDrmScheme(value) {
        var normalized = trimToString(value).toLowerCase();
        if (!normalized) return "";
        if (normalized.indexOf("widevine") !== -1) return "widevine";
        if (normalized.indexOf("clearkey") !== -1 || normalized.indexOf("clear") !== -1) return "clearkey";
        return normalized;
    }

    function normalizeDrmToken(value) {
        var normalized = trimToString(value);
        if (!normalized) return "";
        if (/^[0-9a-f-]{32,}$/i.test(normalized)) return normalized.replace(/-/g, "").toLowerCase();
        return normalized;
    }

    function splitUrlAndHeaders(rawUrl) {
        var value = trimToString(rawUrl);
        var result = { url: value, headers: {}, userAgent: "", cookie: "", drmScheme: "", licenseUrl: "", key: "", keyid: "" };
        if (!value || value.indexOf("|") === -1) return result;

        var parts = value.split("|", 2);
        result.url = trimToString(parts[0]);
        trimToString(parts[1] || "").split("&").forEach(function (pair) {
            var equalsIndex = pair.indexOf("=");
            if (equalsIndex === -1) return;

            var rawKey = trimToString(pair.slice(0, equalsIndex));
            if (!rawKey) return;

            var rawValue = trimToString(pair.slice(equalsIndex + 1));
            try { rawValue = decodeURIComponent(rawValue); } catch (_) {}

            var lowered = rawKey.toLowerCase();
            if (lowered === "drmlicense" || lowered === "licenseurl") { result.licenseUrl = rawValue; return; }
            if (lowered === "drmscheme") { result.drmScheme = normalizeDrmScheme(rawValue); return; }
            if (lowered === "key") { result.key = rawValue; return; }
            if (lowered === "keyid") { result.keyid = rawValue; return; }

            var key = normalizeHeaderName(rawKey);
            if (!key) return;
            result.headers[key] = rawValue;
            if (key === "User-Agent") result.userAgent = rawValue;
            if (key === "Cookie") result.cookie = rawValue;
        });
        return result;
    }

    function mergeHeaders() {
        var out = {};
        for (var i = 0; i < arguments.length; i++) {
            var h = arguments[i];
            if (h && typeof h === "object") Object.assign(out, h);
        }
        return out;
    }

    function decodeEscapedText(text) {
        if (!text) return "";
        return String(text).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    }

    function tryDecodeReversedTokenPayload(text, key) {
        if (!text || typeof text !== "string") return "";
        try {
            var reversed = String(text).split("").reverse().join("");
            var decoded = atob(reversed);
            var parts = decoded.split("|", 2);
            if (parts.length !== 2) return "";
            var shift = parseInt(parts[0], 10);
            if (!isFinite(shift)) return "";

            var decodedJson = "";
            for (var n = 0; n < parts[1].length; n++) {
                var char = parts[1].charAt(n);
                var code = char.charCodeAt(0);
                if (code >= 65 && code <= 90) {
                    decodedJson += String.fromCharCode(((code - 65 - shift + 26) % 26) + 65);
                } else if (code >= 97 && code <= 122) {
                    decodedJson += String.fromCharCode(((code - 97 - shift + 26) % 26) + 97);
                } else {
                    decodedJson += char;
                }
            }
            var data = safeJsonParse(decodedJson);
            return trimToString(data && data[key]);
        } catch (_) {
            return "";
        }
    }

    function extractJsonPlaybackUrl(text, key) {
        if (!text) return "";
        var normalizedKey = trimToString(key) || "playback_url";
        var data = safeJsonParse(text);
        if (data && typeof data === "object") {
            var direct = trimToString(data[normalizedKey]);
            if (direct) return decodeEscapedText(direct);
        }

        var reversed = tryDecodeReversedTokenPayload(text, normalizedKey);
        if (reversed) return decodeEscapedText(reversed);

        var escapedKey = normalizedKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var match = new RegExp('"' + escapedKey + '"\\s*:\\s*"([^"]+)"', "i").exec(String(text));
        if (match && match[1]) return decodeEscapedText(match[1]);
        return "";
    }

    function extractDirectMediaUrl(text) {
        if (!text) return "";
        var patterns = [
            /https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mpd)(?:[^"'\\\s<>]*)/ig,
            /https?:\\\/\\\/[^"'\\\s<>]+?\.(?:m3u8|mpd)(?:[^"'\\\s<>]*)/ig,
            /"hlsManifestUrl"\s*:\s*"([^"]+)"/ig,
            /"playback_url"\s*:\s*"([^"]+)"/ig
        ];
        for (var p = 0; p < patterns.length; p++) {
            var matches = String(text).match(patterns[p]);
            if (!matches || !matches.length) continue;
            for (var m = 0; m < matches.length; m++) {
                var normalized = decodeEscapedText(matches[m])
                    .replace(/^"hlsManifestUrl"\s*:\s*"/i, "")
                    .replace(/^"playback_url"\s*:\s*"/i, "")
                    .replace(/"$/, "");
                if (normalized && (/\.m3u8/i.test(normalized) || /\.mpd/i.test(normalized))) return normalized;
            }
        }
        return "";
    }

    async function resolveEmbedToken(tokenConfig) {
        var request = splitUrlAndHeaders(tokenConfig.api || "");
        if (!request.url || request.url.indexOf("%s") !== -1) return { url: "", headers: {} };

        try {
            var response = await fetchText(request.url, mergeHeaders({ "User-Agent": CHROME_UA }, request.headers));
            var status = extractResponseStatus(response);
            if (status < 200 || status >= 300) return { url: "", headers: {} };

            var html = extractResponseBody(response);
            var resolved = extractJsonPlaybackUrl(html, tokenConfig.link_key || "playback_url") || extractDirectMediaUrl(html);
            var parsed = splitUrlAndHeaders(resolved);
            return { url: parsed.url, headers: mergeHeaders(request.headers, parsed.headers) };
        } catch (error) {
            return { url: "", headers: {} };
        }
    }

    async function resolveStructuredToken(tokenConfig) {
        var request = splitUrlAndHeaders(tokenConfig.api || "");
        if (!request.url || request.url.indexOf("%s") !== -1) return { url: "", headers: {} };

        try {
            var response = await fetchWithMethod(
                request.url,
                tokenConfig.request_type || "get",
                request.headers,
                tokenConfig.request_body || "",
                tokenConfig.request_body_type || "normal"
            );
            var status = extractResponseStatus(response);
            if (status < 200 || status >= 300) return { url: "", headers: {} };

            var resolved = extractJsonPlaybackUrl(extractResponseBody(response), tokenConfig.link_key || "playback_url");
            if (!resolved) return { url: "", headers: {} };

            var parsed = splitUrlAndHeaders(resolved);
            return { url: parsed.url, headers: mergeHeaders(request.headers, parsed.headers) };
        } catch (error) {
            return { url: "", headers: {} };
        }
    }

    async function resolveTokenizedStream(entry) {
        if (!entry || typeof entry.tokenApi !== "string" || !entry.tokenApi) return null;
        var tokenConfig = safeJsonParse(entry.tokenApi);
        if (!tokenConfig || typeof tokenConfig !== "object") return null;

        var tokenType = trimToString(tokenConfig.type || "token").toLowerCase();
        try {
            var resolved = null;
            if (tokenType === "sp" || tokenType === "json") {
                resolved = await resolveStructuredToken(tokenConfig);
            } else if (tokenType === "embed" || tokenType === "html" || tokenType === "yt") {
                resolved = await resolveEmbedToken(tokenConfig);
            }
            if (resolved && resolved.url) return resolved;
        } catch (error) {
        }
        return null;
    }

    function getStreamHost(url) {
        try { return new URL(String(url)).hostname.toLowerCase(); } catch (_) { return ""; }
    }

    function matchesHost(host, entries) {
        if (!host) return false;
        return entries.some(function (entry) { return host === entry || host.slice(-(entry.length + 1)) === "." + entry; });
    }

    function isHlsUrl(url) { return /\.m3u8(?:$|[?#])/i.test(url) || /\/hls\//i.test(url); }
    function isDashUrl(url) { return /\.mpd(?:$|[?#])/i.test(url); }

    function parseHlsAttributes(line) {
        var attributes = {};
        var regex = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
        var match;
        while ((match = regex.exec(String(line || ""))) !== null) {
            var key = trimToString(match[1]).toUpperCase();
            var value = trimToString(match[2]).replace(/^"|"$/g, "");
            if (key) attributes[key] = value;
        }
        return attributes;
    }

    function resolveVariantUrl(baseUrl, variantPath) {
        var target = trimToString(variantPath);
        if (!target) return "";
        try {
            var resolved = new URL(target, baseUrl);
            var base = new URL(baseUrl);
            if (!resolved.search && target.indexOf("?") === -1 && base.search) resolved.search = base.search;
            return resolved.toString();
        } catch (_) {
            return target;
        }
    }

    function parseVariantQuality(attributes) {
        if (!attributes) return 0;
        var resolutionMatch = /(\d+)\s*x\s*(\d+)/i.exec(trimToString(attributes.RESOLUTION));
        if (resolutionMatch) return parseInt(resolutionMatch[2], 10) || 0;

        var bandwidth = parseInt(attributes["AVERAGE-BANDWIDTH"] || attributes.BANDWIDTH || "0", 10);
        if (!bandwidth || bandwidth < 1) return 0;
        if (bandwidth >= 20000000) return 8160;
        if (bandwidth >= 10000000) return 4320;
        if (bandwidth >= 6000000) return 1080;
        if (bandwidth >= 3000000) return 720;
        if (bandwidth >= 1500000) return 480;
        if (bandwidth >= 800000) return 360;
        if (bandwidth >= 400000) return 240;
        if (bandwidth >= 200000) return 144;
        return 0;
    }

    function buildVariantSource(baseSource, attributes, fallbackIndex) {
        var quality = parseVariantQuality(attributes);
        if (quality > 0) return { quality: quality, source: baseSource + " " + quality + "p" };
        var bandwidth = parseInt((attributes && (attributes["AVERAGE-BANDWIDTH"] || attributes.BANDWIDTH)) || "0", 10);
        if (bandwidth > 0) return { quality: 0, source: baseSource + " " + Math.max(1, Math.round(bandwidth / 1000)) + "kbps" };
        return { quality: 0, source: baseSource + " Variant " + (fallbackIndex + 1) };
    }

    function parseHlsMasterPlaylist(manifestText, manifestUrl) {
        var variants = [];
        var pending = null;
        String(manifestText || "").split(/\r?\n/).forEach(function (rawLine) {
            var line = trimToString(rawLine);
            if (!line) return;
            if (line.indexOf("#EXT-X-STREAM-INF:") === 0) {
                pending = parseHlsAttributes(line.slice("#EXT-X-STREAM-INF:".length));
                return;
            }
            if (line.charAt(0) === "#") return;
            if (pending) {
                var resolved = resolveVariantUrl(manifestUrl, line);
                if (resolved) variants.push({ url: resolved, attributes: pending });
                pending = null;
            }
        });
        return variants;
    }

    async function expandHlsStreams(sourceLabel, parsed, drmInfo) {
        if (!parsed || !parsed.url || !isHlsUrl(parsed.url)) return [];
        try {
            var headers = drmInfo && drmInfo.headers ? drmInfo.headers : (parsed.headers || {});
            var response = await fetchText(parsed.url, headers);
            var status = extractResponseStatus(response);
            if (status < 200 || status >= 300) return [];

            var manifestText = trimToString(extractResponseBody(response));
            if (manifestText.indexOf("#EXTM3U") !== 0 || manifestText.indexOf("#EXT-X-STREAM-INF") === -1) return [];

            var seen = {};
            var streams = [];
            parseHlsMasterPlaylist(manifestText, parsed.url).forEach(function (variant, index) {
                var playbackUrl = trimToString(variant.url);
                if (!playbackUrl || seen[playbackUrl]) return;
                seen[playbackUrl] = true;
                var info = buildVariantSource(sourceLabel, variant.attributes || {}, index);
                streams.push({ source: info.source, url: playbackUrl, headers: headers, quality: info.quality });
            });
            return streams;
        } catch (_) {
            return [];
        }
    }

    function createStreamResult(source, parsed, drmInfo, quality) {
        var headers = mergeHeaders(drmInfo && drmInfo.headers ? drmInfo.headers : (parsed.headers || {}));
        var label = source || "Auto";
        var stream = new StreamResult({
            name: label,
            source: label,
            url: parsed.url,
            headers: headers,
            type: isDashUrl(parsed.url) ? "dash" : (isHlsUrl(parsed.url) ? "hls" : undefined),
            quality: typeof quality === "number" && quality > 0 ? quality : undefined
        });
        if (drmInfo && drmInfo.drmKey && drmInfo.drmKid) {
            stream.drmKey = drmInfo.drmKey;
            stream.drmKid = drmInfo.drmKid;
            stream.drmType = normalizeDrmScheme(drmInfo.drmType) || "clearkey";
        } else if (drmInfo && drmInfo.licenseUrl) {
            stream.licenseUrl = drmInfo.licenseUrl;
            stream.drmLicenseUrl = drmInfo.licenseUrl;
            stream.drmType = normalizeDrmScheme(drmInfo.drmType) || "widevine";
        }
        return stream;
    }

    function scoreStream(sourceLabel, parsed, hasDrm, quality, isVariant) {
        var url = trimToString(parsed && parsed.url);
        var headers = parsed && parsed.headers && typeof parsed.headers === "object" ? parsed.headers : {};
        var source = trimToString(sourceLabel).toLowerCase();
        var host = getStreamHost(url);

        var score = 0;
        if (/^https?:\/\//i.test(url)) score += 10;
        if (isDashUrl(url)) score += 25;
        if (isHlsUrl(url)) score += 15;
        if (hasDrm) score += 45;
        if (Object.keys(headers).length) score += 4;
        if (headers.Cookie) score += 8;
        if (headers.Referer) score += 6;
        if (headers["User-Agent"]) score += 2;
        if (typeof quality === "number" && quality > 0) score += Math.min(Math.round(quality / 180), 6);

        if (matchesHost(host, PLAYZ_TRUSTED_HOSTS)) score += 20;
        if (matchesHost(host, PLAYZ_WEAK_HOSTS)) score -= 30;

        if (source.indexOf("low") !== -1) score -= 12;
        if (source.indexOf("sd") !== -1) score -= 5;
        if (source.indexOf("backup") !== -1) score -= 3;
        if (isVariant) score -= 1;
        return score;
    }

    function createRankedStream(source, parsed, drmInfo, quality, order, isVariant) {
        var headers = drmInfo && drmInfo.headers ? drmInfo.headers : (parsed.headers || {});
        var hasDrm = !!(drmInfo && ((drmInfo.drmKey && drmInfo.drmKid) || drmInfo.licenseUrl));
        return {
            score: scoreStream(source, { url: parsed.url, headers: headers }, hasDrm, quality, isVariant),
            order: order,
            stream: createStreamResult(source, parsed, drmInfo, quality)
        };
    }

    async function buildResolvedStream(entry) {
        var tokenResolved = await resolveTokenizedStream(entry);
        if (tokenResolved && tokenResolved.url) {
            var parsedToken = splitUrlAndHeaders(tokenResolved.url);
            return {
                url: parsedToken.url,
                headers: mergeHeaders(tokenResolved.headers, parsedToken.headers),
                drmScheme: parsedToken.drmScheme,
                licenseUrl: parsedToken.licenseUrl,
                key: parsedToken.key,
                keyid: parsedToken.keyid
            };
        }
        var parsed = splitUrlAndHeaders(entry && entry.link);
        return parsed.url ? parsed : null;
    }

    function resolveStreamDrm(rawApi, parsed, baseHeaders) {
        var headers = mergeHeaders(baseHeaders, parsed.headers);
        var drmScheme = normalizeDrmScheme(parsed.drmScheme);
        var drmKey = normalizeDrmToken(parsed.key);
        var drmKid = normalizeDrmToken(parsed.keyid);
        var licenseUrl = trimToString(parsed.licenseUrl);

        var rawValue = trimToString(rawApi);
        if (rawValue) {
            if (/^https?:\/\//i.test(rawValue)) {
                licenseUrl = rawValue;
                drmScheme = "widevine";
            } else if (rawValue.indexOf(":") !== -1) {
                var parts = rawValue.split(":");
                if (parts.length === 2) {
                    drmKid = normalizeDrmToken(parts[0]);
                    drmKey = normalizeDrmToken(parts[1]);
                    drmScheme = "clearkey";
                }
            }
        }

        return {
            headers: headers,
            drmType: drmKey && drmKid ? "clearkey" : (drmScheme || (licenseUrl ? "widevine" : "")),
            drmKey: drmKey,
            drmKid: drmKid,
            licenseUrl: licenseUrl
        };
    }

    async function processStreamEntry(entry, index) {
        if (!entry || typeof entry !== "object") return [];
        var resolved = await buildResolvedStream(entry);
        if (!resolved || !resolved.url) return [];

        var rawApi = trimToString(entry.api);
        var sourceLabel = trimToString(entry.name) || "Server " + (index + 1);

        if (/\.m3u(?:8)?(?:$|[?#])/i.test(resolved.url) && (!resolved.headers || !resolved.headers["User-Agent"])) {
            resolved.headers = mergeHeaders(resolved.headers, { "User-Agent": MOBILE_UA });
        }

        var drmInfo = resolveStreamDrm(rawApi, resolved, resolved.headers);
        var ranked = [createRankedStream(sourceLabel, resolved, drmInfo, 0, index * 100, false)];

        var variants = await expandHlsStreams(sourceLabel, resolved, drmInfo);
        variants.forEach(function (variant, variantIndex) {
            ranked.push(createRankedStream(
                variant.source,
                { url: variant.url, headers: variant.headers },
                drmInfo,
                variant.quality,
                index * 100 + variantIndex + 1,
                true
            ));
        });
        return ranked;
    }

    async function loadStreams(urlStr, cb) {
        if (!urlStr || typeof urlStr !== "string") {
            return cb({ success: false, errorCode: "INVALID_INPUT", message: "Invalid URL string" });
        }

        try {
            var data = JSON.parse(urlStr);
            if (!data || typeof data !== "object") throw new Error("Invalid event data format");

            var slug = trimToString(data.slug);
            var targetPath = slug ? slug + ".txt" : trimToString(data.linksPath);
            if (!targetPath) {
                return cb({ success: false, errorCode: "PARSE_ERROR", message: "Missing PlayZTV links path" });
            }

            var response = await fetchPlayzJson(targetPath);
            if (!Array.isArray(response) || !response.length) {
                return cb({ success: false, errorCode: "EMPTY_RESULT", message: "No streams found for this event" });
            }

            var ranked = (await mapWithConcurrency(response, CONCURRENCY, processStreamEntry))
                .reduce(function (all, entryStreams) { return all.concat(entryStreams || []); }, []);

            if (!ranked.length) {
                return cb({ success: false, errorCode: "EMPTY_RESULT", message: "No playable streams resolved for this event" });
            }

            ranked.sort(function (left, right) {
                return right.score !== left.score ? right.score - left.score : left.order - right.order;
            });

            cb({ success: true, data: ranked.map(function (entry) { return entry.stream; }) });
        } catch (error) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: "Failed to load streams: " + errText(error) });
        }
    }

    globalThis.loadStreams = loadStreams;
})();
