(function () {
    "use strict";

    var g = globalThis;
    var runtimeManifest = (typeof manifest !== "undefined" && manifest) ? manifest : {};

    var FIREBASE_CONFIG = {
        packageName: "com.playz.tv",
        apiKey: "AIzaSyDKRqLlbaZBIpHzLBiQTUrJqr3gN-nDWWc",
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

    var CATEGORY_ORDER = ["Cricket", "Football", "Basketball", "Motorsport", "Tennis", "Boxing"];

    function parsePlayzUtcDateTime(dateText, timeText) {
        var dateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimToString(dateText));
        var timeMatch = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(trimToString(timeText));
        if (!dateMatch || !timeMatch) return NaN;
        return Date.UTC(
            parseInt(dateMatch[3], 10),
            parseInt(dateMatch[2], 10) - 1,
            parseInt(dateMatch[1], 10),
            parseInt(timeMatch[1], 10),
            parseInt(timeMatch[2], 10),
            parseInt(timeMatch[3] || "0", 10)
        );
    }

    function buildEventStatus(event) {
        if (!event || typeof event !== "object") return "LIVE";
        var now = Date.now();
        var start = parsePlayzUtcDateTime(event.date, event.time);
        var end = parsePlayzUtcDateTime(event.endDate, event.endTime);

        if (isFinite(end) && now >= end) return "ENDED";
        if (isFinite(start) && now >= start) return "LIVE";
        if (isFinite(start) && now < start) return "UPCOMING";
        return "LIVE";
    }

    function buildEventStatusPrefix(event) {
        return "";
    }

    function normalizeCategoryName(name) {
        return (trimToString(name) || "Other").replace(/\s+/g, " ").trim();
    }

    function getCategoryIcon(name) {
        return "";
    }

    function getCategorySectionTitle(name) {
        return normalizeCategoryName(name);
    }

    function buildEventTitle(event) {
        if (!event || typeof event !== "object") return "Live Event";
        var teamA = trimToString(event.teamAName);
        var teamB = trimToString(event.teamBName);
        if (teamA && teamB) return teamA === teamB ? teamA : teamA + " vs " + teamB;
        return teamA || trimToString(event.eventName) || "Live Event";
    }

    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    function pad2(n) { return n < 10 ? "0" + n : String(n); }

    function formatInTimezone(utcMs, tz) {
        var opts = {
            year: "numeric",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23"
        };
        if (tz && tz !== "auto") opts.timeZone = tz;
        var fmt = new Intl.DateTimeFormat("en-US", opts);
        var parts = fmt.formatToParts(new Date(utcMs));
        var out = {};
        for (var i = 0; i < parts.length; i++) out[parts[i].type] = parts[i].value;
        var hour24 = out.hour === "24" ? 0 : +out.hour;
        var hour = (hour24 % 12 || 12) + ":" + out.minute + " " + (hour24 < 12 ? "AM" : "PM");
        var numFmt = new Intl.DateTimeFormat("en-US", Object.assign({}, opts, { month: "numeric" }));
        var np = numFmt.formatToParts(new Date(utcMs));
        var n = {};
        for (var j = 0; j < np.length; j++) n[np[j].type] = np[j].value;
        var localMs = Date.UTC(+n.year, +n.month - 1, +n.day, +(n.hour === "24" ? "0" : n.hour), +n.minute, +n.second);
        var offsetMin = Math.round((localMs - Math.floor(utcMs / 1000) * 1000) / 60000);
        var sign = offsetMin < 0 ? "-" : "+";
        var abs = Math.abs(offsetMin);
        var label = offsetMin === 0 ? "UTC" : "UTC" + sign + Math.floor(abs / 60) + (abs % 60 ? ":" + pad2(abs % 60) : "");
        return out.day + " " + out.month + ", " + hour + " \u2022 " + label;
    }

    function formatUtcFallback(utcMs) {
        var d = new Date(utcMs);
        var h = d.getUTCHours();
        return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + ", " + (h % 12 || 12) + ":" + pad2(d.getUTCMinutes()) + " " + (h < 12 ? "AM" : "PM") + " \u2022 UTC";
    }

    function formatEventTime(event) {
        var start = parsePlayzUtcDateTime(event.date, event.time);
        if (!isFinite(start)) return "";
        try {
            return formatInTimezone(start, "auto");
        } catch (e) {
            try {
                return formatInTimezone(start, "auto");
            } catch (e2) {
                return formatUtcFallback(start);
            }
        }
    }

    function buildEventPoster(event) {
        return "playz-poster:" + encodeURIComponent(JSON.stringify({
            category: normalizeCategoryName(event.category),
            eventName: trimToString(event.eventName),
            teamA: trimToString(event.teamAName),
            teamB: trimToString(event.teamBName),
            flagA: trimToString(event.teamAFlag),
            flagB: trimToString(event.teamBFlag),
            logo: trimToString(event.eventLogo),
            status: buildEventStatus(event),
            time: buildEventStatus(event) === "LIVE" ? "" : formatEventTime(event)
        }));
    }

    function parseEventEntry(rawEntry, index) {
        if (!rawEntry) return null;
        var eventObject = rawEntry;
        if (typeof rawEntry === "string") {
            eventObject = safeJsonParse(rawEntry);
        } else if (rawEntry.event) {
            eventObject = typeof rawEntry.event === "string" ? safeJsonParse(rawEntry.event) : rawEntry.event;
        }
        if (!eventObject || typeof eventObject !== "object") return null;
        if (eventObject.visible === false) return null;

        var linksPath = trimToString(eventObject.links);
        if (!linksPath) return null;

        var priority = Number.isFinite(eventObject.priority) ? eventObject.priority : parseInt(eventObject.priority || "-1", 10);
        return {
            id: index + 1,
            category: normalizeCategoryName(eventObject.category),
            eventName: trimToString(eventObject.eventName),
            eventLogo: trimToString(eventObject.eventLogo),
            teamAName: trimToString(eventObject.teamAName),
            teamBName: trimToString(eventObject.teamBName),
            teamAFlag: trimToString(eventObject.teamAFlag),
            teamBFlag: trimToString(eventObject.teamBFlag),
            linksPath: linksPath,
            slug: linksPath.replace(/\.txt$/i, ""),
            date: trimToString(eventObject.date),
            time: trimToString(eventObject.time),
            endDate: trimToString(eventObject.end_date),
            endTime: trimToString(eventObject.end_time),
            priority: priority,
            linkNames: Array.isArray(eventObject.link_names) ? eventObject.link_names : []
        };
    }

    function sortEvents(events) {
        var weight = { LIVE: 0, UPCOMING: 1, ENDED: 2 };
        return events.slice().sort(function (left, right) {
            var statusDiff = (weight[buildEventStatus(left)] || 9) - (weight[buildEventStatus(right)] || 9);
            if (statusDiff !== 0) return statusDiff;

            var leftStart = parsePlayzUtcDateTime(left.date, left.time);
            var rightStart = parsePlayzUtcDateTime(right.date, right.time);
            if (isFinite(leftStart) && isFinite(rightStart) && leftStart !== rightStart) return leftStart - rightStart;

            var leftPriority = Number.isFinite(left.priority) ? left.priority : 9999;
            var rightPriority = Number.isFinite(right.priority) ? right.priority : 9999;
            if (leftPriority !== rightPriority) return leftPriority - rightPriority;

            return buildEventTitle(left).localeCompare(buildEventTitle(right));
        });
    }

    async function fetchPlayzEvents() {
        try {
            var data = await fetchPlayzJson("events.txt");
            if (!Array.isArray(data)) return [];
            return sortEvents(data.map(function (entry, idx) { return parseEventEntry(entry, idx); }).filter(Boolean));
        } catch (error) {
            return [];
        }
    }

    function buildHomeItem(event) {
        var prefix = buildEventStatusPrefix(event);
        var displayTitle = buildEventTitle(event);
        return new MultimediaItem({
            title: " ",
            description: trimToString(event.eventName) || "Live Event",
            posterUrl: buildEventPoster(event),
            type: "livestream",
            url: JSON.stringify({
                title: displayTitle,
                category: event.category,
                eventName: event.eventName,
                eventLogo: event.eventLogo,
                teamAName: event.teamAName,
                teamBName: event.teamBName,
                teamAFlag: event.teamAFlag,
                teamBFlag: event.teamBFlag,
                linksPath: event.linksPath,
                slug: event.slug,
                date: event.date,
                time: event.time,
                endDate: event.endDate,
                endTime: event.endTime,
                linkNames: event.linkNames
            })
        });
    }

    async function getHome(cb) {
        try {
            var events = await fetchPlayzEvents();
            if (!events.length) {
                return cb({ success: false, errorCode: "SITE_OFFLINE", message: "Failed to load events from the available PlayZTV hosts" });
            }

            var categories = {};
            var liveNow = [];
            events.forEach(function (event) {
                if (buildEventStatus(event) === "LIVE") liveNow.push(buildHomeItem(event));
                var title = getCategorySectionTitle(event.category);
                (categories[title] = categories[title] || []).push(buildHomeItem(event));
            });

            function rank(title) {
                var clean = title.replace(/^[^\w\s]+\s*/, "").toLowerCase();
                for (var i = 0; i < CATEGORY_ORDER.length; i++) {
                    if (clean.indexOf(CATEGORY_ORDER[i].toLowerCase()) !== -1) return i;
                }
                return 99;
            }

            var ordered = {};
            if (liveNow.length) ordered["Live Now"] = liveNow;
            Object.keys(categories).sort(function (left, right) {
                var diff = rank(left) - rank(right);
                return diff !== 0 ? diff : left.localeCompare(right);
            }).forEach(function (key) { ordered[key] = categories[key]; });

            cb({ success: true, data: ordered });
        } catch (error) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: errText(error) });
        }
    }

    async function search(query, cb) {
        try {
            var events = await fetchPlayzEvents();
            var q = trimToString(query).toLowerCase();
            var results = events.filter(function (event) {
                return [event.category, event.eventName, event.teamAName, event.teamBName]
                    .filter(Boolean).join(" ").toLowerCase().indexOf(q) !== -1;
            }).map(buildHomeItem);
            cb({ success: true, data: results });
        } catch (_) {
            cb({ success: true, data: [] });
        }
    }

    async function load(urlStr, cb) {
        if (!urlStr || typeof urlStr !== "string") {
            return cb({ success: false, errorCode: "INVALID_INPUT", message: "Invalid URL string" });
        }

        try {
            var data = JSON.parse(urlStr);
            if (!data || typeof data !== "object") throw new Error("Invalid event data format");

            var prefix = buildEventStatusPrefix(data);
            var title = data.title || buildEventTitle(data);
            var poster = buildEventPoster(data);
            var plotParts = [
                trimToString(data.category) ? "Category: " + data.category : "",
                trimToString(data.eventName) ? "Event: " + data.eventName : "",
                formatEventTime(data) ? "Time: " + formatEventTime(data) : "",
                data.linkNames && data.linkNames.length ? "Available Servers: " + data.linkNames.length : ""
            ].filter(Boolean);

            cb({
                success: true,
                data: new MultimediaItem({
                    title: prefix ? prefix + " " + title : title,
                    url: urlStr,
                    posterUrl: poster,
                    description: plotParts.join("<br>"),
                    type: "livestream",
                    episodes: [
                        new Episode({ name: "Watch Live", season: 1, episode: 1, url: urlStr, posterUrl: poster })
                    ]
                })
            });
        } catch (error) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: "Invalid event data: " + errText(error) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
})();
