(function () {
    "use strict";

    var g = globalThis;
    var DEFAULT_BASE_URL = "https://net52.cc";
    var runtimeManifest = (typeof manifest !== "undefined" && manifest) ? manifest : { baseUrl: DEFAULT_BASE_URL };
    var BASE_URL = runtimeManifest.baseUrl || DEFAULT_BASE_URL;

    var VERIFY_ORIGIN = "https://net22.cc";
    var VERIFY_REFERER = "https://net22.cc/verify2";
    var IMG_BASE = "https://imgcdn.kim";
    var COOKIE_TTL = 54000000;

    var MOBILE_UA = "Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Safari/537.36 /OS.Gatu v3.0";

    var PROVIDERS = {
        netflix: {
            id: "netflix", name: "Netflix", ott: "nf", prefix: "", search: true,
            poster: function (id) { return IMG_BASE + "/poster/v/" + id + ".jpg"; },
            background: function (id) { return IMG_BASE + "/poster/h/" + id + ".jpg"; },
            episodePoster: function (id) { return IMG_BASE + "/epimg/150/" + id + ".jpg"; }
        },
        prime: {
            id: "prime", name: "Prime Video", ott: "pv", prefix: "/pv", search: true,
            poster: function (id) { return IMG_BASE + "/pv/v/" + id + ".jpg"; },
            background: function (id) { return IMG_BASE + "/pv/h/" + id + ".jpg"; },
            episodePoster: function (id) { return IMG_BASE + "/pvepimg/" + id + ".jpg"; }
        },
        hotstar: {
            id: "hotstar", name: "Hotstar", ott: "hs", prefix: "/hs", search: true,
            poster: function (id) { return IMG_BASE + "/hs/v/" + id + ".jpg"; },
            background: function (id) { return IMG_BASE + "/hs/h/" + id + ".jpg"; },
            episodePoster: function (id) { return IMG_BASE + "/hsepimg/" + id + ".jpg"; }
        }
    };

    function studioConfig(id, name, studio) {
        var base = Object.assign({}, PROVIDERS.hotstar);
        base.id = id;
        base.name = name;
        base.ott = "dp";
        base.search = false;
        base.studio = studio;
        return base;
    }

    PROVIDERS.disney = studioConfig("disney", "Disney", "disney");
    PROVIDERS.marvel = studioConfig("marvel", "Marvel", "marvel");
    PROVIDERS.starwars = studioConfig("starwars", "Star Wars", "starwars");
    PROVIDERS.pixar = studioConfig("pixar", "Pixar", "pixar");

    function selectedProvider() {
        var id = (typeof manifest !== "undefined" && manifest && manifest.providerId)
            ? String(manifest.providerId).toLowerCase().trim()
            : "netflix";
        return PROVIDERS[id] || PROVIDERS.netflix;
    }

    function generateUuid() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            var r = (Math.random() * 16) | 0;
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
    }

    function parseDurationMinutes(runtimeStr) {
        if (!runtimeStr) return undefined;
        var str = String(runtimeStr).toLowerCase();
        var total = 0;
        var hMatch = str.match(/(\d+)\s*h/);
        var mMatch = str.match(/(\d+)\s*m/);
        if (hMatch) total += parseInt(hMatch[1], 10) * 60;
        if (mMatch) total += parseInt(mMatch[1], 10);
        return total > 0 ? total : undefined;
    }

    function parseScore(matchStr) {
        if (!matchStr) return undefined;
        var pctMatch = String(matchStr).match(/(\d+)%/);
        if (pctMatch) return parseFloat((parseInt(pctMatch[1], 10) / 10).toFixed(1));
        var numMatch = String(matchStr).match(/([\d.]+)/);
        if (numMatch) return parseFloat(numMatch[1]);
        return undefined;
    }

    function normalizeHeaders(headers) {
        var out = {};
        if (!headers) return out;
        if (typeof headers.forEach === "function") {
            headers.forEach(function (v, k) { out[String(k).toLowerCase()] = v; });
            return out;
        }
        var keys = Object.keys(headers);
        for (var i = 0; i < keys.length; i++) out[String(keys[i]).toLowerCase()] = headers[keys[i]];
        return out;
    }

    function extractCookie(headers, cookieName) {
        if (!headers) return "";
        var raw = headers["set-cookie"] || "";
        if (Array.isArray(raw)) raw = raw.join("\n");
        var re = new RegExp(cookieName + "=([^;\\n\\s,]+)", "i");
        var match = String(raw || "").match(re);
        return match ? match[1] : "";
    }

    function cacheGet(key, ttl) {
        try { return g.cache ? g.cache.get(key, ttl) : null; } catch (_) { return null; }
    }

    function cacheSet(key, value) {
        try { if (g.cache) g.cache.set(key, value); } catch (_) {}
    }

    async function httpRequest(url, options) {
        options = options || {};
        var res = await fetch(url, {
            method: (options.method || "GET").toUpperCase(),
            headers: options.headers || {},
            body: options.body,
            redirect: options.redirect || "follow"
        });
        var text = await res.text();
        return {
            status: res.status,
            headers: normalizeHeaders(res.headers && res.headers.raw ? res.headers.raw() : null),
            rawHeaders: res.headers,
            body: text,
            json: function () {
                try { return JSON.parse(text); } catch (_) { return null; }
            }
        };
    }

    async function bypassCookie(force) {
        if (!force) {
            var cached = cacheGet("t_hash_t", COOKIE_TTL);
            if (cached) return cached;
        }

        var headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "max-age=0",
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": VERIFY_ORIGIN,
            "Referer": VERIFY_REFERER,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
        };

        var res = await httpRequest(BASE_URL + "/verify.php", {
            method: "POST",
            headers: headers,
            body: "g-recaptcha-response=" + encodeURIComponent(generateUuid()),
            redirect: "manual"
        });

        var sc = res.rawHeaders && res.rawHeaders.get ? res.rawHeaders.get("set-cookie") : "";
        var hdr = { "set-cookie": sc || "" };
        var cookieVal = extractCookie(hdr, "t_hash_t");
        if (!cookieVal) {
            var m = String(sc || "").match(/([^;\s\n,]*t_hash[a-z0-9_]*)=([^;,\n\s]+)/i);
            if (m) cookieVal = m[2].trim();
        }

        if (cookieVal) {
            cacheSet("t_hash_t", cookieVal);
            return cookieVal;
        }
        throw new Error("Failed to acquire t_hash_t session cookie from verify.php");
    }

    function createCookieHeader(cookie, config) {
        var parts = [];
        if (cookie) parts.push("t_hash_t=" + cookie);
        parts.push("ott=" + config.ott);
        parts.push("hd=on");
        if (config.studio) parts.push("studio=" + config.studio);
        return parts.join("; ");
    }

    function postUrlFor(config, id) {
        return BASE_URL + config.prefix + "/post?id=" + id + "&ott=" + config.ott + (config.studio ? "&studio=" + config.studio : "");
    }

    function watchUrlFor(config, id) {
        return BASE_URL + "/watch?id=" + id + "&ott=" + config.ott + (config.studio ? "&studio=" + config.studio : "");
    }

    function fail(cb, code, e) {
        cb({ success: false, errorCode: code, message: String(e && (e.stack || e.message) || e) });
    }

    async function getHome(cb) {
        try {
            var config = selectedProvider();
            var cookie = await bypassCookie(false);
            var homeUrl = BASE_URL + "/mobile/home?app=1";
            var res = await httpRequest(homeUrl, {
                headers: {
                    "Cookie": createCookieHeader(cookie, config),
                    "Referer": homeUrl,
                    "User-Agent": MOBILE_UA,
                    "X-Requested-With": "XMLHttpRequest"
                }
            });
            var html = res.body || "";

            var sections = html.split(/(?=<div[^>]*class=["'][^"']*tray-wrapper|<div[^>]*id=["']top10["']|<div[^>]*class=["']top10["'])/i);
            var trays = {};

            for (var t = 0; t < sections.length; t++) {
                var sec = sections[t];
                var titleMatch = sec.match(/<h2[^>]*class=["']tray-title["'][^>]*>([\s\S]*?)<\/h2>/i) ||
                                 sec.match(/<a[^>]*class=["']tray-link["'][^>]*>([\s\S]*?)<\/a>/i) ||
                                 sec.match(/<span>(Top 10[^<]*)<\/span>/i);
                var trayName = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
                if (!trayName) continue;

                var postRegex = /data-post=["'](\d+)["']/g;
                var postMatch;
                var items = [];
                var seenIds = {};

                while ((postMatch = postRegex.exec(sec)) !== null) {
                    var id = postMatch[1];
                    if (seenIds[id]) continue;
                    seenIds[id] = true;
                    items.push(new MultimediaItem({
                        title: "",
                        url: postUrlFor(config, id),
                        posterUrl: config.poster(id),
                        bannerUrl: config.background(id),
                        type: "movie",
                        headers: { "Referer": BASE_URL + "/home" }
                    }));
                }

                if (items.length > 0) trays[trayName] = items;
            }

            if (!trays["Trending"]) {
                var firstKey = Object.keys(trays)[0];
                if (firstKey) trays["Trending"] = trays[firstKey];
            }

            cb({ success: true, data: trays });
        } catch (e) {
            fail(cb, "PARSE_ERROR", e);
        }
    }

    async function search(query, cb) {
        try {
            var config = selectedProvider();
            if (config.search === false) return cb({ success: true, data: [] });

            var cookie = await bypassCookie(false);
            var searchUrl = BASE_URL + "/mobile" + config.prefix + "/search.php?s=" + encodeURIComponent(query) + "&t=" + Date.now();
            var res = await httpRequest(searchUrl, {
                headers: {
                    "Cookie": createCookieHeader(cookie, config),
                    "Referer": BASE_URL + "/home",
                    "User-Agent": MOBILE_UA
                }
            });
            var json = res.json();
            var items = [];

            if (json && Array.isArray(json.searchResult)) {
                items = json.searchResult.map(function (item) {
                    var id = String(item.id);
                    return new MultimediaItem({
                        title: String(item.t || "Untitled"),
                        url: postUrlFor(config, id),
                        posterUrl: config.poster(id),
                        bannerUrl: config.background(id),
                        type: "movie",
                        headers: { "Referer": BASE_URL + "/home" }
                    });
                });
            }

            cb({ success: true, data: items });
        } catch (e) {
            fail(cb, "PARSE_ERROR", e);
        }
    }

    function parseMediaUrl(url) {
        var defaultProv = selectedProvider();
        var str = String(url || "").trim();
        if (!str) return { id: "", provider: defaultProv };

        if (str.charAt(0) === "{") {
            try {
                var obj = JSON.parse(str);
                if (obj && obj.id) {
                    return { id: String(obj.id), provider: PROVIDERS[String(obj.providerId || obj.studio || "").toLowerCase()] || defaultProv };
                }
            } catch (_) {}
        }

        var idMatch = str.match(/[?&]id=([^&#]+)/i) || str.match(/\/(?:post|watch|title|play|movies|series|episodes)\/([^/?#]+)/i);
        var ottMatch = str.match(/[?&]ott=([^&#]+)/i);
        var studioMatch = str.match(/[?&]studio=([^&#]+)/i);
        var id = idMatch ? idMatch[1] : str.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "");

        var prov = defaultProv;
        if (studioMatch && PROVIDERS[studioMatch[1].toLowerCase()]) {
            prov = PROVIDERS[studioMatch[1].toLowerCase()];
        } else if (ottMatch) {
            var keys = Object.keys(PROVIDERS);
            for (var i = 0; i < keys.length; i++) {
                if (PROVIDERS[keys[i]].ott === ottMatch[1] && !PROVIDERS[keys[i]].studio) { prov = PROVIDERS[keys[i]]; break; }
            }
        } else if (str.indexOf("/pv") !== -1) {
            prov = PROVIDERS.prime;
        } else if (str.indexOf("/hs") !== -1) {
            prov = PROVIDERS.hotstar;
        }
        return { id: id, provider: prov };
    }

    function buildEpisode(config, raw, idx, fallbackSeason) {
        var epId = String(raw.id || "");
        var epNum = raw.ep ? parseInt(String(raw.ep).replace(/E/i, ""), 10) : (idx + 1);
        var sNum = raw.s ? parseInt(String(raw.s).replace(/S/i, ""), 10) : (fallbackSeason || 1);
        var epRuntime = parseDurationMinutes(raw.time);
        return new Episode({
            name: raw.t ? String(raw.t).trim() : ("Episode " + epNum),
            url: watchUrlFor(config, epId),
            season: Number(sNum) || 1,
            episode: Number(epNum) || (idx + 1),
            runtime: epRuntime ? Number(epRuntime) : undefined,
            description: raw.desc ? String(raw.desc).trim() : (raw.d ? String(raw.d).trim() : undefined),
            posterUrl: config.episodePoster(epId),
            headers: { "Referer": BASE_URL + "/home" }
        });
    }

    function cleanTitle(str) {
        return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function extractSimklDetails(html) {
        var linksMatch = html.match(/Links:[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
        var raw = linksMatch ? linksMatch[1] : html;

        var anilist = raw.match(/anilist\.co\/anime\/(\d+)/i);
        var mal = raw.match(/myanimelist\.net\/anime\/(\d+)/i);
        var kitsu = raw.match(/kitsu\.(?:app|io)\/anime\/(\d+)/i);
        var anidb = raw.match(/anidb\.net\/(?:anime\/|perl-bin\/animedb\.pl\?show=anime&aid=)(\d+)/i);
        var animeplanet = raw.match(/anime-planet\.com\/anime\/([^"'/]+)/i);
        var livechart = raw.match(/livechart\.me\/anime\/(\d+)/i);
        var ann = raw.match(/animenewsnetwork\.com\/encyclopedia\/anime\.php\?id=(\d+)/i);
        var crunchyroll = raw.match(/crunchyroll\.com\/series\/([^"'/?#]+)/i);

        var imdb = raw.match(/imdb\.com\/title\/(tt\d+)/i);
        var tmdb = raw.match(/themoviedb\.org\/(?:tv|movie)\/(\d+)/i);
        var tvdb = raw.match(/thetvdb\.com\/(?:series|movies)\/([^"'/?#]+)/i);
        var netflix = raw.match(/netflix\.com\/title\/(\d+)/i);
        var prime = raw.match(/primevideo\.com\/detail\/([^"'/?#]+)/i);
        var asin = raw.match(/(?:amazon\.com\/dp\/|pageTypeId=)([A-Z0-9]{10})/i);
        var disney = raw.match(/disneyplus\.com\/(?:series|movies)\/[^"'/]+\/([^"'/?#]+)/i);

        return {
            anilistId: anilist ? anilist[1] : null,
            malId: mal ? mal[1] : null,
            kitsuId: kitsu ? kitsu[1] : null,
            anidbId: anidb ? anidb[1] : null,
            animePlanet: animeplanet ? animeplanet[1] : null,
            liveChartId: livechart ? livechart[1] : null,
            annId: ann ? ann[1] : null,
            crunchyrollId: crunchyroll ? crunchyroll[1] : null,

            imdbId: imdb ? imdb[1] : null,
            tmdbId: tmdb ? tmdb[1] : null,
            tvdbSlug: tvdb ? tvdb[1] : null,
            netflixId: netflix ? netflix[1] : null,
            primeVideoId: prime ? prime[1] : null,
            amazonAsin: asin ? asin[1] : null,
            disneyId: disney ? disney[1] : null
        };
    }

    async function resolveSimklTrackers(config, mediaId, title, year, isSeries, castList) {
        var targetId = String(mediaId || "").trim();
        var targetTitle = cleanTitle(title);
        var targetYear = parseInt(year, 10) || 0;
        var pageUrl = null;

        var pageHtml = "";

        try {
            // 1. Exact Netflix redirect (follows 301 to Simkl title page automatically)
            if (config.ott === "nf" && targetId) {
                try {
                    var redRes = await httpRequest("https://api.simkl.com/redirect?to=simkl&netflix=" + targetId, {
                        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
                    });
                    if (redRes && redRes.body && redRes.body.length > 500) {
                        pageHtml = redRes.body;
                    }
                } catch (_) {}
            }

            // 2. Search fallback for Prime, Hotstar, Disney+, or if redirect failed
            if (!pageHtml && title) {
                try {
                    var searchBody = "s=" + encodeURIComponent(title) + "&type=all";
                    var searchRes = await httpRequest("https://simkl.com/ajax/full/search.php", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                            "X-Requested-With": "XMLHttpRequest",
                            "Referer": "https://simkl.com/search/?q=" + encodeURIComponent(title),
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                        },
                        body: searchBody
                    });
                    var candidates = searchRes.json();
                    if (candidates && typeof candidates === "object") {
                        for (var key in candidates) {
                            var c = candidates[key];
                            if (!c || !c.url) continue;

                            var cTitle = cleanTitle(c.titles && c.titles.m ? c.titles.m : c.title);
                            if (cTitle !== targetTitle && cTitle.indexOf(targetTitle) === -1 && targetTitle.indexOf(cTitle) === -1) {
                                continue;
                            }

                            var cYear = parseInt(String(c.year || "").match(/\d{4}/), 10);
                            if (targetYear && cYear && Math.abs(targetYear - cYear) > 1) {
                                continue;
                            }

                            var pageRes = await httpRequest("https://simkl.com" + c.url, {
                                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
                            });
                            if (pageRes && pageRes.body) {
                                pageHtml = pageRes.body;
                                break;
                            }
                        }
                    }
                } catch (_) {}
            }

            // 3. Extract all IDs from HTML
            if (pageHtml) {
                var ids = extractSimklDetails(pageHtml);
                var isAnime = (pageHtml.indexOf("/anime/") !== -1) ||
                              (ids.anilistId != null || ids.malId != null || ids.kitsuId != null);

                // 4. Fallback for anime via ani.zip
                if (isAnime && (!ids.anilistId || !ids.malId || !ids.kitsuId) && (ids.imdbId || ids.tmdbId)) {
                    var aniQuery = ids.imdbId ? ("imdb_id=" + ids.imdbId) : ("themoviedb_id=" + ids.tmdbId);
                    try {
                        var aniRes = await httpRequest("https://api.ani.zip/mappings?" + aniQuery, {
                            headers: { "User-Agent": "Mozilla/5.0" }
                        });
                        var aniData = aniRes.json();
                        if (aniData && aniData.mappings) {
                            var am = aniData.mappings;
                            if (!ids.anilistId && am.anilist_id) ids.anilistId = String(am.anilist_id);
                            if (!ids.malId && am.mal_id) ids.malId = String(am.mal_id);
                            if (!ids.kitsuId && am.kitsu_id) ids.kitsuId = String(am.kitsu_id);
                            if (!ids.anidbId && am.anidb_id) ids.anidbId = String(am.anidb_id);
                            if (!ids.animePlanet && am.animeplanet_id) ids.animePlanet = String(am.animeplanet_id);
                            if (!ids.liveChartId && am.livechart_id) ids.liveChartId = String(am.livechart_id);
                            isAnime = true;
                        }
                    } catch (_) {}
                }

                return {
                    imdbId: ids.imdbId,
                    tmdbId: ids.tmdbId,
                    tvdbSlug: ids.tvdbSlug,
                    isAnime: isAnime,
                    animeTrackers: isAnime ? {
                        anilistId: ids.anilistId,
                        malId: ids.malId,
                        kitsuId: ids.kitsuId,
                        anidbId: ids.anidbId,
                        animePlanet: ids.animePlanet,
                        liveChartId: ids.liveChartId,
                        crunchyrollId: ids.crunchyrollId
                    } : null
                };
            }
        } catch (_) {}

        return { imdbId: null, tmdbId: null, tvdbSlug: null, isAnime: false, animeTrackers: null };
    }

    async function load(url, cb) {
        try {
            var media = parseMediaUrl(url);
            var id = media.id;
            var config = media.provider || selectedProvider();

            if (!id) {
                return cb({ success: false, errorCode: "LOAD_ERROR", message: "Invalid or missing media id: " + String(url) });
            }

            var cookie = await bypassCookie(false);
            var now = Date.now();
            var headers = {
                "Cookie": createCookieHeader(cookie, config),
                "Referer": BASE_URL + "/home",
                "User-Agent": MOBILE_UA,
                "X-Requested-With": "XMLHttpRequest"
            };

            var res = await httpRequest(BASE_URL + "/mobile" + config.prefix + "/post.php?id=" + id + "&t=" + now, { headers: headers });
            var data = res.json();
            if (!data) throw new Error("Invalid or empty response from post.php");

            var title = String(data.title || "Untitled");
            var synopsis = String(data.desc || "");
            var year = parseInt(String(data.year), 10) || undefined;
            var rating = parseScore(data.match);
            var duration = parseDurationMinutes(data.runtime);
            var validEpisodes = Array.isArray(data.episodes) ? data.episodes.filter(function (ep) { return ep && ep.id; }) : [];
            var isSeries = validEpisodes.length > 0 || (Array.isArray(data.season) && data.season.length > 0);

            var cast = [];
            var rawCast = data.cast || data.cast_data || data.actors;
            if (rawCast) {
                if (Array.isArray(rawCast)) {
                    cast = rawCast.map(function (c) {
                        if (c && typeof c === "object") {
                            return new Actor({
                                name: c.name || c.n || "",
                                role: c.role || c.character || c.r || undefined,
                                image: c.image || c.img || c.profile || c.poster || undefined
                            });
                        }
                        return new Actor({ name: String(c || "").trim() });
                    }).filter(function (a) { return !!a.name; });
                } else {
                    cast = String(rawCast).split(",").map(function (s) { return s.trim(); }).filter(Boolean)
                        .map(function (name) { return new Actor({ name: name }); });
                }
            }

            var episodes = [];
            if (isSeries) {
                for (var e = 0; e < validEpisodes.length; e++) episodes.push(buildEpisode(config, validEpisodes[e], e, 1));

                var seasons = Array.isArray(data.season) ? data.season : [];
                if (seasons.length > 1) {
                    var remaining = seasons.slice(0, seasons.length - 1);
                    var results = await Promise.all(remaining.map(async function (s) {
                        if (!s || !s.id) return [];
                        try {
                            var sRes = await httpRequest(
                                BASE_URL + "/mobile" + config.prefix + "/episodes.php?s=" + s.id + "&series=" + id + "&t=" + now + "&page=1",
                                { headers: headers }
                            );
                            var sJson = sRes.json();
                            if (sJson && Array.isArray(sJson.episodes)) {
                                return sJson.episodes.map(function (sep, idx) {
                                    return sep ? buildEpisode(config, sep, idx, parseInt(s.s, 10) || 1) : null;
                                }).filter(Boolean);
                            }
                        } catch (_) {}
                        return [];
                    }));
                    for (var r = 0; r < results.length; r++) episodes = episodes.concat(results[r]);
                }
            } else {
                episodes.push(new Episode({
                    name: title,
                    url: watchUrlFor(config, id),
                    season: 0,
                    episode: 0,
                    runtime: duration ? Number(duration) : undefined,
                    description: synopsis || undefined,
                    posterUrl: config.poster(id),
                    headers: { "Referer": BASE_URL + "/home" }
                }));
            }

            var recommendations = [];
            if (Array.isArray(data.suggest)) {
                for (var sg = 0; sg < data.suggest.length; sg++) {
                    var sug = data.suggest[sg];
                    if (sug && sug.id) {
                        var sugId = String(sug.id);
                        recommendations.push(new MultimediaItem({
                            title: sug.t ? String(sug.t).trim() : "",
                            url: postUrlFor(config, sugId),
                            posterUrl: config.poster(sugId),
                            type: isSeries ? "series" : "movie"
                        }));
                    }
                }
            }

            var trackers = await resolveSimklTrackers(config, id, title, year, isSeries, cast);
            var isAnimeMedia = trackers.isAnime || (data.genre && String(data.genre).toLowerCase().indexOf("anime") !== -1);
            var finalType = isAnimeMedia ? (isSeries ? "anime" : "animemovie") : (isSeries ? "series" : "movie");

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: url,
                    posterUrl: config.poster(id),
                    bannerUrl: config.background(id),
                    description: synopsis || undefined,
                    type: finalType,
                    year: year ? Number(year) : undefined,
                    score: rating ? Number(rating) : undefined,
                    duration: duration ? Number(duration) : undefined,
                    status: isSeries ? "ongoing" : "completed",
                    contentRating: data.ua ? String(data.ua).trim() : undefined,
                    cast: cast.length > 0 ? cast : undefined,
                    recommendations: recommendations.length > 0 ? recommendations : undefined,
                    episodes: episodes,
                    imdbId: trackers.imdbId || undefined,
                    tmdbId: trackers.tmdbId || undefined,
                    animeTrackers: trackers.animeTrackers || undefined
                })
            });
        } catch (e) {
            fail(cb, "LOAD_ERROR", e);
        }
    }

    g.getHome = getHome;
    g.search = search;
    g.load = load;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { getHome: getHome, search: search, load: load };
    }
})();
