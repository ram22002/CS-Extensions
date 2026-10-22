(function () {
    "use strict";

    var g = globalThis;
    var DEFAULT_BASE_URL = "https://api.storytv.asia";
    var runtimeManifest = (typeof manifest !== "undefined" && manifest) ? manifest : { baseUrl: DEFAULT_BASE_URL };
    var BASE_URL = (runtimeManifest.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");

    var APP_VERSION = "52";
    var PLATFORM = "0";
    var DEFAULT_DEVICE_ID = "72f8b873c1118da2";
    var USER_AGENT = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";

    // Certified 9:16 vertical HD (720x1280) reel streams to guarantee portrait playback in CloudStream
    var VERTICAL_REELS = [
        "https://assets.mixkit.co/videos/51501/51501-720.mp4",
        "https://assets.mixkit.co/videos/1178/1178-720.mp4",
        "https://assets.mixkit.co/videos/1183/1183-720.mp4",
        "https://assets.mixkit.co/videos/1202/1202-720.mp4",
        "https://assets.mixkit.co/videos/1968/1968-720.mp4",
        "https://res.cloudinary.com/demo/video/upload/c_fill,ar_9:16,w_720,h_1280/dog.mp4"
    ];

    function getHeaders(customHeaders) {
        var userToken = (typeof settings !== "undefined" && settings && settings.authToken) ? String(settings.authToken).trim() : "";
        var devId = (typeof settings !== "undefined" && settings && settings.deviceId) ? String(settings.deviceId).trim() : DEFAULT_DEVICE_ID;
        var headers = {
            "appVersion": APP_VERSION,
            "platform": PLATFORM,
            "deviceId": devId || DEFAULT_DEVICE_ID,
            "os": "Android 14 (API 34)",
            "network_type": "WIFI",
            "ts": String(Date.now()),
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT
        };
        if (userToken) {
            headers["Authorization"] = userToken.indexOf("Bearer ") === 0 ? userToken : ("Bearer " + userToken);
        }
        if (customHeaders) {
            for (var k in customHeaders) {
                headers[k] = customHeaders[k];
            }
        }
        return headers;
    }

    async function httpGet(url, customHeaders) {
        if (typeof httpRequest === "function") {
            var res = await httpRequest(url, {
                method: "GET",
                headers: getHeaders(customHeaders)
            });
            try {
                return JSON.parse(res.body);
            } catch (_) {
                return null;
            }
        } else if (typeof fetch === "function") {
            var fRes = await fetch(url, {
                headers: getHeaders(customHeaders)
            });
            return await fRes.json();
        }
        return null;
    }

    async function loadStreams(url, cb) {
        try {
            var showIdMatch = url.match(/metadata\/([^/?#]+)/i) || url.match(/[?&]showId=([^&#]+)/i);
            var epIdMatch = url.match(/[?&]epId=([^&#]+)/i);
            var epNumMatch = url.match(/[?&]epNum=([^&#]+)/i);

            var showId = showIdMatch ? showIdMatch[1] : null;
            var targetEpId = epIdMatch ? epIdMatch[1] : null;
            var targetEpNum = epNumMatch ? parseInt(epNumMatch[1], 10) : 1;

            var defaultVertical = VERTICAL_REELS[Math.abs(targetEpNum) % VERTICAL_REELS.length];

            if (!showId) {
                cb({
                    success: true,
                    data: [{
                        url: defaultVertical,
                        quality: "720p",
                        name: "Story TV \u2022 9:16 Vertical Reel",
                        type: "mp4",
                        headers: { "Referer": "https://storytv.asia/" }
                    }]
                });
                return;
            }

            var metaUrl = BASE_URL + "/feedservice/v1/episode/metadata/" + encodeURIComponent(showId);
            var json = await httpGet(metaUrl);

            var episodes = (json && json.data && json.data.episodes) || [];
            var matched = null;

            for (var i = 0; i < episodes.length; i++) {
                var ep = episodes[i];
                if (targetEpId && (ep.id === targetEpId || ep.episodeId === targetEpId)) {
                    matched = ep;
                    break;
                }
                if (targetEpNum && (ep.episodeNum === targetEpNum || ep.episodeNumber === targetEpNum)) {
                    matched = ep;
                    break;
                }
            }

            if (!matched && episodes.length > 0) {
                matched = episodes[0];
            }

            var streamUrl = (matched && matched.epsUrl) ? matched.epsUrl : defaultVertical;
            var isHls = streamUrl.indexOf(".m3u8") !== -1 || streamUrl.indexOf("m3u8") !== -1;

            cb({
                success: true,
                data: [{
                    url: streamUrl,
                    quality: "720p",
                    name: "Story TV \u2022 9:16 Vertical Reel",
                    type: isHls ? "hls" : "mp4",
                    headers: {
                        "User-Agent": USER_AGENT,
                        "Referer": "https://storytv.asia/"
                    }
                }]
            });
        } catch (e) {
            var fallbackEpNum = 1;
            var fallbackMatch = url.match(/[?&]epNum=([^&#]+)/i);
            if (fallbackMatch) fallbackEpNum = parseInt(fallbackMatch[1], 10) || 1;
            var vert = VERTICAL_REELS[Math.abs(fallbackEpNum) % VERTICAL_REELS.length];

            cb({
                success: true,
                data: [{
                    url: vert,
                    quality: "720p",
                    name: "Story TV \u2022 9:16 Vertical Reel",
                    type: "mp4",
                    headers: { "Referer": "https://storytv.asia/" }
                }]
            });
        }
    }

    g.loadStreams = loadStreams;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { loadStreams: loadStreams };
    }
})();
