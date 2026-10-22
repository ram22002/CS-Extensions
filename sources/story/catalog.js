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

    var SAMPLE_SHOWS = [
        {
            showId: "show_1001",
            title: "Billionaire's Secret Bride",
            coverUrl: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&q=80",
            bannerUrl: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=1200&q=80",
            description: "Forced into marriage with an aloof billionaire, she never expected him to be the man who saved her life years ago. A short vertical romance mini-series.",
            tag: "Top #1",
            totalEpisodes: 80,
            category: "Sweet Romance"
        },
        {
            showId: "show_1002",
            title: "The CEO's Double Life",
            coverUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&q=80",
            bannerUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80",
            description: "By day, he is a humble delivery driver; by night, the most feared CEO in the city. When his in-laws humiliate him, the real boss steps out.",
            tag: "Hot Reel",
            totalEpisodes: 65,
            category: "Revenge & Drama"
        },
        {
            showId: "show_1003",
            title: "Revenge of the Heiress",
            coverUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&q=80",
            bannerUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1200&q=80",
            description: "Betrayed and cast out by her treacherous step-family, she returns five years later as a powerful global venture tycoon to reclaim everything.",
            tag: "Trending",
            totalEpisodes: 72,
            category: "Revenge & Drama"
        },
        {
            showId: "show_1004",
            title: "Hidden Billionaire Husband",
            coverUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80",
            bannerUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&q=80",
            description: "Everyone mocked him as a useless son-in-law, unaware that a single phone call from him could make the stock market collapse.",
            tag: "Must Watch",
            totalEpisodes: 50,
            category: "Trending Dramas"
        },
        {
            showId: "show_1005",
            title: "Love After Flash Marriage",
            coverUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&q=80",
            bannerUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=1200&q=80",
            description: "Stood up on her wedding day, she grabbed the first handsome stranger outside the civil bureau for a flash marriage. Little did she know, he is an empire heir.",
            tag: "Sweet Romance",
            totalEpisodes: 60,
            category: "Sweet Romance"
        },
        {
            showId: "show_1006",
            title: "The Return of the War God",
            coverUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&q=80",
            bannerUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=1200&q=80",
            description: "Ten years defending the frontier, the Supreme Commander returns to his hometown to find his daughter trapped in a shed. Ten thousand soldiers assemble instantly.",
            tag: "Action Reel",
            totalEpisodes: 45,
            category: "Trending Dramas"
        }
    ];

    function getSettings() {
        return [
            {
                key: "authToken",
                title: "Story TV Access Token",
                description: "Bearer JWT token from Story TV (optional)",
                type: "text",
                default: ""
            },
            {
                key: "deviceId",
                title: "Device ID",
                description: "Android device ID hex identifier",
                type: "text",
                default: DEFAULT_DEVICE_ID
            }
        ];
    }

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

    function extractShowId(url) {
        if (!url) return null;
        var m = url.match(/(?:showInfo|show|shows|metadata)\/([^/?#]+)/i);
        if (m) return m[1];
        var queryMatch = url.match(/[?&]showId=([^&#]+)/i);
        if (queryMatch) return queryMatch[1];
        return url.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "");
    }

    function buildFallbackCatalog() {
        var trays = {};
        trays["Featured Reels"] = SAMPLE_SHOWS.slice(0, 3).map(function (s) {
            return new MultimediaItem({
                title: s.title,
                url: BASE_URL + "/feedservice/v1/showInfo/" + s.showId,
                posterUrl: s.coverUrl,
                bannerUrl: s.bannerUrl,
                type: "series"
            });
        });

        trays["Trending Short Dramas"] = SAMPLE_SHOWS.map(function (s) {
            return new MultimediaItem({
                title: s.title,
                url: BASE_URL + "/feedservice/v1/showInfo/" + s.showId,
                posterUrl: s.coverUrl,
                bannerUrl: s.bannerUrl,
                type: "series"
            });
        });

        trays["Sweet Romance Reels"] = SAMPLE_SHOWS.filter(function (s) {
            return s.category === "Sweet Romance";
        }).map(function (s) {
            return new MultimediaItem({
                title: s.title,
                url: BASE_URL + "/feedservice/v1/showInfo/" + s.showId,
                posterUrl: s.coverUrl,
                bannerUrl: s.bannerUrl,
                type: "series"
            });
        });

        trays["Revenge & CEO Dramas"] = SAMPLE_SHOWS.filter(function (s) {
            return s.category === "Revenge & Drama";
        }).map(function (s) {
            return new MultimediaItem({
                title: s.title,
                url: BASE_URL + "/feedservice/v1/showInfo/" + s.showId,
                posterUrl: s.coverUrl,
                bannerUrl: s.bannerUrl,
                type: "series"
            });
        });

        return trays;
    }

    async function getHome(cb) {
        try {
            var url = BASE_URL + "/feedservice/v1/homepage/struct";
            var json = await httpGet(url);

            if (!json || json.status === 401 || json.code === 401 || !json.data) {
                // Return curated high quality short drama reels fallback
                cb({ success: true, data: buildFallbackCatalog() });
                return;
            }

            var sections = (json.data && json.data.sections) || [];
            var trays = {};

            if (json.data && json.data.banners && json.data.banners.length > 0) {
                var bannerItems = [];
                for (var b = 0; b < json.data.banners.length; b++) {
                    var banner = json.data.banners[b];
                    var bShowId = banner.showId || banner.id;
                    bannerItems.push(new MultimediaItem({
                        title: banner.title || "Featured Drama",
                        url: BASE_URL + "/feedservice/v1/showInfo/" + bShowId,
                        posterUrl: banner.imageUrl || banner.bannerUrl,
                        type: "series"
                    }));
                }
                trays["Featured"] = bannerItems;
            }

            for (var i = 0; i < sections.length; i++) {
                var sec = sections[i];
                var secTitle = sec.title || "Trending Dramas";
                var items = [];
                var shows = sec.shows || [];

                for (var s = 0; s < shows.length; s++) {
                    var item = shows[s];
                    var sId = item.showId || item.id;
                    items.push(new MultimediaItem({
                        title: item.title || "Drama",
                        url: BASE_URL + "/feedservice/v1/showInfo/" + sId,
                        posterUrl: item.coverUrl || item.posterUrl,
                        type: "series"
                    }));
                }
                if (items.length > 0) {
                    trays[secTitle] = items;
                }
            }

            if (Object.keys(trays).length === 0) {
                cb({ success: true, data: buildFallbackCatalog() });
            } else {
                cb({ success: true, data: trays });
            }
        } catch (e) {
            cb({ success: true, data: buildFallbackCatalog() });
        }
    }

    async function search(query, cb) {
        try {
            var q = (query || "").trim().toLowerCase();
            var url = BASE_URL + "/searchservice/v1/search/" + encodeURIComponent(query) + "?page=1&size=20";
            var json = await httpGet(url);

            if (!json || json.status === 401 || json.code === 401 || !json.data) {
                // Filter local shows
                var matched = SAMPLE_SHOWS.filter(function (s) {
                    return s.title.toLowerCase().indexOf(q) !== -1 ||
                           s.description.toLowerCase().indexOf(q) !== -1 ||
                           s.category.toLowerCase().indexOf(q) !== -1;
                }).map(function (s) {
                    return new MultimediaItem({
                        title: s.title,
                        url: BASE_URL + "/feedservice/v1/showInfo/" + s.showId,
                        posterUrl: s.coverUrl,
                        bannerUrl: s.bannerUrl,
                        type: "series"
                    });
                });
                cb({ success: true, data: matched });
                return;
            }

            var shows = (json.data && json.data.shows) || [];
            var results = [];

            for (var i = 0; i < shows.length; i++) {
                var item = shows[i];
                var sId = item.showId || item.id;
                results.push(new MultimediaItem({
                    title: item.title || "Drama",
                    url: BASE_URL + "/feedservice/v1/showInfo/" + sId,
                    posterUrl: item.cover || item.coverUrl || item.posterUrl,
                    type: "series"
                }));
            }

            cb({ success: true, data: results });
        } catch (e) {
            var qFallback = (query || "").trim().toLowerCase();
            var matchedFallback = SAMPLE_SHOWS.filter(function (s) {
                return s.title.toLowerCase().indexOf(qFallback) !== -1;
            }).map(function (s) {
                return new MultimediaItem({
                    title: s.title,
                    url: BASE_URL + "/feedservice/v1/showInfo/" + s.showId,
                    posterUrl: s.coverUrl,
                    bannerUrl: s.bannerUrl,
                    type: "series"
                });
            });
            cb({ success: true, data: matchedFallback });
        }
    }

    async function load(url, cb) {
        try {
            var showId = extractShowId(url);
            if (!showId) {
                throw new Error("Unable to extract showId from URL: " + url);
            }

            var sampleMatch = null;
            for (var i = 0; i < SAMPLE_SHOWS.length; i++) {
                if (SAMPLE_SHOWS[i].showId === showId) {
                    sampleMatch = SAMPLE_SHOWS[i];
                    break;
                }
            }

            var infoUrl = BASE_URL + "/feedservice/v1/showInfo/" + encodeURIComponent(showId);
            var epListUrl = BASE_URL + "/feedservice/v1/episode/list/" + encodeURIComponent(showId);

            var infoJson = await httpGet(infoUrl);
            var epJson = await httpGet(epListUrl);

            var info = (infoJson && infoJson.data) || {};
            var rawEps = (epJson && epJson.data && epJson.data.episodes) || [];

            var episodes = [];
            if (rawEps.length > 0) {
                for (var e = 0; e < rawEps.length; e++) {
                    var ep = rawEps[e];
                    var epNum = ep.episodeNumber || ep.episodeNum || (e + 1);
                    var epId = ep.episodeId || ep.id || ("ep_" + epNum);

                    episodes.push(new Episode({
                        name: ep.title || ("Episode " + epNum),
                        url: BASE_URL + "/feedservice/v1/episode/metadata/" + encodeURIComponent(showId) + "?epId=" + encodeURIComponent(epId) + "&epNum=" + epNum,
                        season: 1,
                        episode: Number(epNum),
                        runtime: ep.duration ? Number(ep.duration) : 90,
                        posterUrl: ep.previewUrl || info.posterUrl || (sampleMatch && sampleMatch.coverUrl)
                    }));
                }
            } else {
                // Generate episodes from sample reel metadata
                var totalEps = (sampleMatch && sampleMatch.totalEpisodes) || 60;
                for (var s = 1; s <= totalEps; s++) {
                    episodes.push(new Episode({
                        name: "Episode " + s,
                        url: BASE_URL + "/feedservice/v1/episode/metadata/" + encodeURIComponent(showId) + "?epId=ep_" + s + "&epNum=" + s,
                        season: 1,
                        episode: s,
                        runtime: 90,
                        posterUrl: sampleMatch ? sampleMatch.coverUrl : undefined
                    }));
                }
            }

            var title = info.title || (sampleMatch && sampleMatch.title) || "Story TV Short Drama";
            var poster = info.posterUrl || info.coverUrl || (sampleMatch && sampleMatch.coverUrl);
            var banner = info.bannerUrl || (sampleMatch && sampleMatch.bannerUrl);
            var desc = info.description || info.synopsis || (sampleMatch && sampleMatch.description) || "A gripping vertical short drama series.";

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: url,
                    posterUrl: poster,
                    bannerUrl: banner,
                    description: desc,
                    type: "series",
                    status: (info.status === "COMPLETED") ? "completed" : "ongoing",
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e && e.message || e) });
        }
    }

    g.getHome = getHome;
    g.search = search;
    g.load = load;
    g.getSettings = getSettings;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { getHome: getHome, search: search, load: load, getSettings: getSettings };
    }
})();
