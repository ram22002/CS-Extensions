(function () {
    "use strict";

    var g = globalThis;
    var runtimeManifest = (typeof manifest !== "undefined" && manifest) ? manifest : {};
    var BASE_URL = runtimeManifest.baseUrl || "https://net52.cc";

    var NEWTV_DOMAIN_SEEDS_B64 = [
        "aHR0cHM6Ly9tb2JpbGVkZXRlY3RzLmNvbQ==",
        "aHR0cHM6Ly9tb2JpbGVkZXRlY3QuYXBw",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LmFydA==",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNj",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNsaWNr",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0Lmluaw==",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LmxpdmU=",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LnBybw==",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNob3A=",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNpdGU=",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNwYWNl",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LnN0b3Jl",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0LnZpcA==",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0Lndpa2k=",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0Lnh5eg==",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5hcnQ=",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5jYw==",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbmZv",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbms=",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5saXZl",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5wcm8=",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5zdG9yZQ==",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy50b3A=",
        "aHR0cHM6Ly9tb2JpZGV0ZWN0cy54eXo="
    ];

    var API_TTL = 86400000;
    var TOKEN_TTL = 3600000;
    var NEWTV_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0";
    var PLAY_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

    var OTT_BY_PROVIDER = {
        netflix: "nf", prime: "pv", hotstar: "hs",
        disney: "dp", marvel: "dp", starwars: "dp", pixar: "dp"
    };

    function base64Decode(str) {
        if (typeof atob === "function") return atob(str);
        throw new Error("atob is not available");
    }

    function cacheGet(key, ttl) {
        try { return g.cache ? g.cache.get(key, ttl) : null; } catch (_) { return null; }
    }

    function cacheSet(key, value) {
        try { if (g.cache) g.cache.set(key, value); } catch (_) {}
    }

    async function getJson(url, headers) {
        var res = await fetch(url, { method: "GET", headers: headers || {} });
        var text = await res.text();
        try { return JSON.parse(text); } catch (_) { return null; }
    }

    async function resolveApiUrl(force) {
        if (!force) {
            var cached = cacheGet("newtv_api", API_TTL);
            if (cached) return cached;
        }

        var headers = {
            "X-Requested-With": "NetmirrorNewTV v1.0",
            "User-Agent": NEWTV_UA,
            "Accept": "application/json, text/plain, */*"
        };

        for (var i = 0; i < NEWTV_DOMAIN_SEEDS_B64.length; i++) {
            try {
                var domain = base64Decode(NEWTV_DOMAIN_SEEDS_B64[i]).replace(/\/+$/, "");
                var json = await getJson(domain + "/checknewtv.php", headers);
                if (json && json.token_hash && String(json.token_hash).trim()) {
                    var resolved = base64Decode(json.token_hash).replace(/\/+$/, "");
                    cacheSet("newtv_api", resolved);
                    return resolved;
                }
            } catch (_) {
                continue;
            }
        }
        throw new Error("Failed to resolve NewTV API base URL from all seed domains");
    }

    async function getNewTvUserToken(ott, force) {
        var backendOtt = (ott === "dp" || ott === "hs") ? "hs" : ott;
        var key = "newtv_token_" + backendOtt;

        if (!force) {
            var cached = cacheGet(key, TOKEN_TTL);
            if (cached) return cached;
        }

        var apiBase = await resolveApiUrl(false);
        var json = await getJson(apiBase + "/newtv/otp.php", {
            "accept": "application/json, text/plain, */*",
            "otp": "111111",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.Gatu v1.0"
        });
        if (json && json.usertoken) {
            cacheSet(key, json.usertoken);
            return json.usertoken;
        }
        throw new Error("Failed to obtain playback usertoken from OTP gateway");
    }

    function parseMediaUrl(url) {
        var str = String(url || "").trim();
        var defaultOtt = OTT_BY_PROVIDER[String(runtimeManifest.providerId || "netflix").toLowerCase()] || "nf";

        if (str.charAt(0) === "{") {
            try {
                var obj = JSON.parse(str);
                if (obj && obj.id) return { id: String(obj.id), ott: obj.ott || defaultOtt };
            } catch (_) {}
        }

        var idMatch = str.match(/[?&]id=([^&#]+)/i) || str.match(/\/(?:post|watch|title|play|movies|series|episodes)\/([^/?#]+)/i);
        var ottMatch = str.match(/[?&]ott=([^&#]+)/i);
        var id = idMatch ? idMatch[1] : str.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "");
        return { id: id, ott: ottMatch ? ottMatch[1] : defaultOtt };
    }

    async function loadStreams(url, cb) {
        try {
            var media = parseMediaUrl(url);
            if (!media.id) throw new Error("Invalid or missing media id: " + String(url));

            var playerOtt = (media.ott === "dp" || media.ott === "hs") ? "hs" : media.ott;
            var apiBase = await resolveApiUrl(false);
            var playerUrl = apiBase + "/newtv/player.php?id=" + encodeURIComponent(media.id);

            async function fetchPlayer(forceToken) {
                var token = await getNewTvUserToken(playerOtt, forceToken);
                return getJson(playerUrl, {
                    "Ott": playerOtt,
                    "Usertoken": token,
                    "X-Requested-With": "NetmirrorNewTV v1.0",
                    "User-Agent": NEWTV_UA
                });
            }

            var json = await fetchPlayer(false);
            if (!json || !json.video_link) json = await fetchPlayer(true);

            if (json && json.video_link) {
                cb({
                    success: true,
                    data: [{
                        url: json.video_link,
                        quality: "Auto",
                        name: "NetMirror",
                        type: "hls",
                        headers: {
                            "Referer": json.referer || BASE_URL,
                            "User-Agent": PLAY_UA
                        }
                    }]
                });
            } else {
                throw new Error("Invalid or empty response from player API: " + JSON.stringify(json));
            }
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e && (e.stack || e.message) || e) });
        }
    }

    g.loadStreams = loadStreams;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { loadStreams: loadStreams };
    }
})();
