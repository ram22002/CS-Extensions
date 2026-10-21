const BASE_URL = "https://cinejoy.pk";
const API_BASE = ["https://api.wing.st", "https://api.shegu.st"];
const TMDB_API = "https://api.themoviedb.org/3";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36" };

async function fetchTmdbMediaDetails(tmdbId, mediaType) {
  if (!TMDB_API_KEY) return null;
  try {
    const normalizedType = mediaType === "tv" ? "tv" : "movie";
    const response = await fetch(
      `${TMDB_API}/${normalizedType}/${tmdbId}?api_key=${encodeURIComponent(TMDB_API_KEY)}&append_to_response=external_ids`,
      { headers: { "Accept": "application/json", "User-Agent": HEADERS["User-Agent"] } }
    );
    if (!response.ok) return null;
    const payload = await response.json();
    const title = normalizedType === "tv"
      ? payload?.name || payload?.original_name
      : payload?.title || payload?.original_title;
    const releaseDate = normalizedType === "tv" ? payload?.first_air_date : payload?.release_date;
    return {
      title: title || "",
      year: releaseDate ? String(releaseDate).slice(0, 4) : "",
      imdbId: payload?.external_ids?.imdb_id || ""
    };
  } catch {
    return null;
  }
}

function decodeBase64ToBytes(encodedValue) {
  let normalized = String(encodedValue || "").replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";
  const binaryString = atob(normalized);
  const byteArray = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) byteArray[i] = binaryString.charCodeAt(i);
  return byteArray;
}

function convertBytesToBigInt(byteArray) {
  let accumulator = 0n;
  for (const byte of byteArray) accumulator = (accumulator << 8n) | BigInt(byte);
  return accumulator;
}

function convertBigIntToBytes(bigIntValue) {
  const byteArray = new Uint8Array(16);
  for (let i = 15; i >= 0; i--) {
    byteArray[i] = Number(bigIntValue & 255n);
    bigIntValue >>= 8n;
  }
  return byteArray;
}

const AES_SBOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
]);

function rotateWord(word) { return [word[1], word[2], word[3], word[0]]; }
function substituteWord(word) { return word.map(byte => AES_SBOX[byte]); }

function expandAesKeySchedule(rawKey) {
  const keyWords = rawKey.length / 4;
  const numRounds = keyWords + 6;
  const roundWords = new Array(4 * (numRounds + 1));
  for (let i = 0; i < keyWords; i++) {
    roundWords[i] = [rawKey[i * 4], rawKey[i * 4 + 1], rawKey[i * 4 + 2], rawKey[i * 4 + 3]];
  }
  let rconValue = 1;
  for (let i = keyWords; i < roundWords.length; i++) {
    let temp = roundWords[i - 1].slice();
    if (i % keyWords === 0) {
      temp = substituteWord(rotateWord(temp));
      temp[0] ^= rconValue;
      rconValue = ((rconValue << 1) ^ (rconValue & 0x80 ? 0x11b : 0)) & 0xff;
    } else if (keyWords > 6 && i % keyWords === 4) {
      temp = substituteWord(temp);
    }
    const prevWord = roundWords[i - keyWords];
    roundWords[i] = [prevWord[0] ^ temp[0], prevWord[1] ^ temp[1], prevWord[2] ^ temp[2], prevWord[3] ^ temp[3]];
  }
  return { roundWords, numRounds };
}

function xorRoundKey(state, roundWords, roundIndex) {
  for (let col = 0; col < 4; col++) {
    const word = roundWords[roundIndex * 4 + col];
    const offset = col * 4;
    state[offset] ^= word[0];
    state[offset + 1] ^= word[1];
    state[offset + 2] ^= word[2];
    state[offset + 3] ^= word[3];
  }
}

function mixSingleColumn(state, offset) {
  const b0 = state[offset], b1 = state[offset + 1], b2 = state[offset + 2], b3 = state[offset + 3];
  const xtime = x => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;
  state[offset] = xtime(b0) ^ (xtime(b1) ^ b1) ^ b2 ^ b3;
  state[offset + 1] = b0 ^ xtime(b1) ^ (xtime(b2) ^ b2) ^ b3;
  state[offset + 2] = b0 ^ b1 ^ xtime(b2) ^ (xtime(b3) ^ b3);
  state[offset + 3] = (xtime(b0) ^ b0) ^ b1 ^ b2 ^ xtime(b3);
}

function subBytesShiftRows(state) {
  for (let i = 0; i < 16; i++) state[i] = AES_SBOX[state[i]];
  state.set(Uint8Array.from([
    state[0], state[5], state[10], state[15],
    state[4], state[9], state[14], state[3],
    state[8], state[13], state[2], state[7],
    state[12], state[1], state[6], state[11]
  ]));
}

function aesEncryptBlock(plainBlock, keySchedule) {
  const state = Uint8Array.from(plainBlock);
  const { roundWords, numRounds } = keySchedule;
  xorRoundKey(state, roundWords, 0);
  for (let round = 1; round < numRounds; round++) {
    subBytesShiftRows(state);
    for (let i = 0; i < 16; i += 4) mixSingleColumn(state, i);
    xorRoundKey(state, roundWords, round);
  }
  subBytesShiftRows(state);
  xorRoundKey(state, roundWords, numRounds);
  return state;
}

function ghashFieldMultiply(x, y) {
  let product = 0n;
  let shifted = x;
  for (let bit = 127; bit >= 0; bit--) {
    if ((y >> BigInt(bit)) & 1n) product ^= shifted;
    shifted = (shifted & 1n) ? (shifted >> 1n) ^ 0xe1000000000000000000000000000000n : shifted >> 1n;
  }
  return product;
}

function ghashProcessBlocks(accumulatedHash, hashSubkey, dataBlock) {
  const blockBuffer = new Uint8Array(16);
  for (let i = 0; i < dataBlock.length; i += 16) {
    blockBuffer.fill(0);
    blockBuffer.set(dataBlock.subarray(i, i + 16));
    accumulatedHash = ghashFieldMultiply(accumulatedHash ^ convertBytesToBigInt(blockBuffer), hashSubkey);
  }
  return accumulatedHash;
}

function incrementCounter(counterBlock) {
  const incremented = Uint8Array.from(counterBlock);
  for (let i = 15; i >= 12; i--) {
    incremented[i] = (incremented[i] + 1) & 0xff;
    if (incremented[i]) break;
  }
  return incremented;
}

function timingSafeByteEqual(bufferA, bufferB) {
  let mismatch = 0;
  for (let i = 0; i < bufferA.length; i++) mismatch |= bufferA[i] ^ bufferB[i];
  return mismatch === 0;
}

function aesGcmDecrypt(ciphertext, encryptionKey, initVector, additionalAuthData) {
  if (initVector.length !== 12 || ciphertext.length < 16) throw new Error("Invalid AES-GCM input");
  const keySchedule = expandAesKeySchedule(encryptionKey);
  const hashSubkey = convertBytesToBigInt(aesEncryptBlock(new Uint8Array(16), keySchedule));
  const counterJ0 = new Uint8Array(16);
  counterJ0.set(initVector);
  counterJ0[15] = 1;
  const ciphertextBody = ciphertext.subarray(0, -16);
  const authTag = ciphertext.subarray(-16);
  let ghashAccumulator = 0n;
  ghashAccumulator = ghashProcessBlocks(ghashAccumulator, hashSubkey, additionalAuthData);
  ghashAccumulator = ghashProcessBlocks(ghashAccumulator, hashSubkey, ciphertextBody);
  const lengthBlock = new Uint8Array(16);
  const aadBitLength = BigInt(additionalAuthData.length) * 8n;
  const dataBitLength = BigInt(ciphertextBody.length) * 8n;
  lengthBlock.set(convertBigIntToBytes((aadBitLength << 64n) | dataBitLength));
  ghashAccumulator = ghashFieldMultiply(ghashAccumulator ^ convertBytesToBigInt(lengthBlock), hashSubkey);
  const ghashResult = convertBigIntToBytes(ghashAccumulator);
  const encryptedCounter = aesEncryptBlock(counterJ0, keySchedule);
  const expectedAuthTag = new Uint8Array(16);
  for (let i = 0; i < 16; i++) expectedAuthTag[i] = encryptedCounter[i] ^ ghashResult[i];
  if (!timingSafeByteEqual(authTag, expectedAuthTag)) throw new Error("aes-gcm: invalid tag");
  const plaintextOut = new Uint8Array(ciphertextBody.length);
  let counter = incrementCounter(counterJ0);
  for (let offset = 0; offset < ciphertextBody.length; offset += 16) {
    const keystream = aesEncryptBlock(counter, keySchedule);
    const chunkLength = Math.min(16, ciphertextBody.length - offset);
    for (let i = 0; i < chunkLength; i++) plaintextOut[offset + i] = ciphertextBody[offset + i] ^ keystream[i];
    counter = incrementCounter(counter);
  }
  return plaintextOut;
}

function decryptSealedResponse(encryptedData, sealedSession) {
  const initVector = encryptedData.slice(0, 12);
  const ciphertext = encryptedData.slice(12);
  const plaintext = aesGcmDecrypt(ciphertext, sealedSession.responseKey, initVector, sealedSession.aad);
  return new TextDecoder("utf-8").decode(plaintext);
}

async function createEncryptedSession(streamRequestParams) {
  const { isTv, tmdbId, server, season, episode, title, year, imdbId } = streamRequestParams;
  let sheguApiUrl = `https://api.shegu.xyz/?type=${isTv ? "series" : "movie"}&tmdb=${tmdbId}&server=${server}`;
  if (isTv) sheguApiUrl += `&season=${season}&episode=${episode}`;
  if (title) sheguApiUrl += `&title=${encodeURIComponent(title)}`;
  if (year) sheguApiUrl += `&year=${year}`;
  if (imdbId) sheguApiUrl += `&imdb=${imdbId}`;
  const proxyUrl = `https://enc-dec.app/api/enc-cinejoy?url=${encodeURIComponent(sheguApiUrl)}`;
  const response = await fetch(proxyUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  if (!response.ok) throw new Error(`enc-dec API HTTP ${response.status}`);
  const responseJson = await response.json();
  if (responseJson.status !== 200 || !responseJson.result) {
    throw new Error(responseJson.error || "Failed to seal via enc-dec API");
  }
  return {
    body: decodeBase64ToBytes(responseJson.result.data),
    responseKey: decodeBase64ToBytes(responseJson.result.state.responseKey),
    aad: decodeBase64ToBytes(responseJson.result.state.aad)
  };
}

function extractHlsVariants(masterPlaylistText, masterPlaylistUrl) {
  const variants = [];
  const lines = masterPlaylistText.split("\n");
  let pendingStreamInfo = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
      pendingStreamInfo = { height: resolutionMatch ? Number(resolutionMatch[2]) : 0 };
    } else if (line && !line.startsWith("#") && pendingStreamInfo) {
      variants.push({
        ...pendingStreamInfo,
        url: line.startsWith("http") ? line : new URL(line, masterPlaylistUrl).toString()
      });
      pendingStreamInfo = null;
    }
  }
  return variants;
}

function normalizeQualityLabel(rawValue) {
  const normalized = String(rawValue || "").toLowerCase();
  if (normalized.includes("2160") || normalized.includes("4k")) return "4K";
  if (normalized.includes("1080") || normalized.includes("fhd")) return "1080p";
  return "Auto";
}

function isHighValueQuality(rawValue) {
  return normalizeQualityLabel(rawValue) !== "Auto";
}

function normalizeSubtitleTracks(rawTracks) {
  if (!Array.isArray(rawTracks)) return [];
  return rawTracks.map(track => ({
    url: typeof track?.url === "string" ? track.url.trim() : "",
    language: String(track?.language || track?.id || "en").toLowerCase(),
    name: String(track?.language || track?.id || "Subtitle")
  })).filter(track => track.url);
}

function deduplicateAndCleanStreams(streamList) {
  const seenUrls = new Set();
  const deduplicated = [];
  for (const stream of streamList) {
    if (seenUrls.has(stream.url)) continue;
    seenUrls.add(stream.url);
    const cleaned = { ...stream };
    if (!cleaned.subtitles.length) delete cleaned.subtitles;
    deduplicated.push(cleaned);
  }
  return deduplicated;
}

async function resolveStreamItems(rawItems, streamRequestHeaders) {
  const resolutionTasks = (Array.isArray(rawItems) ? rawItems : [])
    .filter(item => item && typeof item === "object")
    .map(async item => {
      const subtitleTracks = normalizeSubtitleTracks(item.captions);
      const resolvedStreams = [];

      if (item.type === "hls" && item.playlist) {
        try {
          const playlistResponse = await fetch(item.playlist, { headers: streamRequestHeaders });
          if (playlistResponse.ok) {
            const variants = extractHlsVariants(await playlistResponse.text(), item.playlist);
            for (const variant of variants) {
              if (variant.height !== 2160 && variant.height !== 1080) continue;
              const qualityBadge = variant.height === 2160 ? "4K" : "1080p";
              resolvedStreams.push({
                name: `Cinejoy \u2022 Nebula`,
                title: `Cinejoy \u2022 Nebula`,
                url: variant.url,
                quality: qualityBadge,
                headers: streamRequestHeaders,
                subtitles: subtitleTracks
              });
            }
          }
        } catch { }
      } else if (item.type === "file" && item.qualities && typeof item.qualities === "object") {
        for (const qualityKey of Object.keys(item.qualities)) {
          const qualityUrl = item.qualities[qualityKey]?.url;
          if (!qualityUrl || !String(qualityUrl).startsWith("http") || !isHighValueQuality(qualityKey)) continue;
          const qualityBadge = normalizeQualityLabel(qualityKey);
          resolvedStreams.push({
            name: `Cinejoy \u2022 Nebula`,
            title: `Cinejoy \u2022 Nebula`,
            url: qualityUrl,
            quality: qualityBadge,
            headers: streamRequestHeaders,
            subtitles: subtitleTracks
          });
        }
      }

      return resolvedStreams;
    });

  const settledResults = await Promise.allSettled(resolutionTasks);
  return deduplicateAndCleanStreams(
    settledResults.flatMap(result => result.status === "fulfilled" ? result.value : [])
  );
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const normalizedId = String(tmdbId || "").trim();
    const normalizedType = String(mediaType || "").toLowerCase().trim();
    if (!/^\d+$/.test(normalizedId) || (normalizedType !== "movie" && normalizedType !== "tv")) return [];
    if (normalizedType === "tv" && (season == null || episode == null)) return [];
    const seasonNumber = normalizedType === "tv" ? Number(season) : 1;
    const episodeNumber = normalizedType === "tv" ? Number(episode) : 1;
    if (normalizedType === "tv" && (
      !Number.isInteger(seasonNumber) || seasonNumber < 1 ||
      !Number.isInteger(episodeNumber) || episodeNumber < 1
    )) return [];

    const tmdbDetails = await fetchTmdbMediaDetails(normalizedId, normalizedType);
    const sealedSession = await createEncryptedSession({
      server: "Nebula",
      isTv: normalizedType === "tv",
      tmdbId: normalizedId,
      season: seasonNumber,
      episode: episodeNumber,
      title: tmdbDetails?.title || "",
      year: tmdbDetails?.year || "",
      imdbId: tmdbDetails?.imdbId || ""
    });

    const postRequestOptions = {
      method: "POST",
      body: sealedSession.body,
      headers: {
        "Content-Type": "application/octet-stream",
        "Origin": BASE_URL,
        "Referer": `${BASE_URL}/`,
        "User-Agent": HEADERS["User-Agent"]
      }
    };

    let apiResponse = null;
    for (const endpoint of API_BASE) {
      try {
        apiResponse = await fetch(`${endpoint}/g`, postRequestOptions);
        if (apiResponse.ok) break;
      } catch { }
    }
    if (!apiResponse?.ok) return [];

    const encryptedResponseBytes = new Uint8Array(await apiResponse.arrayBuffer());

    const responseJson = JSON.parse(decryptSealedResponse(encryptedResponseBytes, sealedSession));
    const streamRequestHeaders = {
      "Origin": BASE_URL,
      "Referer": `${BASE_URL}/`,
      "User-Agent": HEADERS["User-Agent"]
    };
    return resolveStreamItems(responseJson?.data?.stream || [], streamRequestHeaders);
  } catch {
    return [];
  }
}

module.exports = { getStreams };