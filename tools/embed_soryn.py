import base64, json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
kt_dir = root / "Soryn/src/main/kotlin/com/soryn/runtime"
CHUNK = 20000
TYPES = {"movie", "series", "anime"}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
REQUIRED = {"catalog.js": ["getHome", "search", "load"], "stream.js": ["loadStreams"]}

def b64_parts(data: bytes):
    b64 = base64.b64encode(data).decode()
    return [b64[i:i + CHUNK] for i in range(0, len(b64), CHUNK)] or [""]

def kt(x):
    return json.dumps(x, ensure_ascii=False).replace("$", "\\$")

def kt_parts(parts):
    return "listOf(\n" + ",\n".join(f'            "{p}"' for p in parts) + "\n        )"

def exports(src: str, fn: str) -> bool:

    pats = [
        rf"module\.exports\s*=\s*\{{[^}}]*\b{fn}\b", rf"exports\.{fn}\s*=",
        rf"(?:globalThis|window|self|global|g)\.{fn}\s*=", rf"^\s*(?:async\s+)?function\s+{fn}\s*\(",
    ]
    return any(re.search(p, src, re.M | re.S) for p in pats)

errors, sources = [], []
for d in sorted(p for p in (root / "sources").iterdir() if p.is_dir() and p.name != "live" and not p.name.startswith(("_", "."))):
    tag = f"sources/{d.name}"
    mf = d / "source.json"
    if not mf.exists():
        errors.append(f"{tag}: missing source.json"); continue
    try:
        m = json.loads(mf.read_text())
    except Exception as e:
        errors.append(f"{tag}/source.json: invalid JSON ({e})"); continue
    sid = m.get("id")
    if not isinstance(sid, str) or not ID_RE.match(sid): errors.append(f"{tag}: id must match {ID_RE.pattern}")
    for k in ("name", "version", "baseUrl"):
        if not isinstance(m.get(k), str) or not m[k]: errors.append(f"{tag}/source.json: '{k}' is required")
    types = m.get("types", ["movie", "series"])
    if not types or any(t not in TYPES for t in types): errors.append(f"{tag}/source.json: types must be a non-empty subset of {sorted(TYPES)}")
    for fname, fns in REQUIRED.items():
        f = d / fname
        if not f.exists(): errors.append(f"{tag}: missing {fname}"); continue
        text = f.read_text()
        for fn in fns:
            if not exports(text, fn): errors.append(f"{tag}/{fname}: does not export {fn}()")
    has_settings = m.get("hasSettings", False)
    if not isinstance(has_settings, bool): errors.append(f"{tag}/source.json: 'hasSettings' must be true or false")
    elif has_settings and (d / "catalog.js").exists() and not exports((d / "catalog.js").read_text(), "getSettings"):
        errors.append(f"{tag}/catalog.js: hasSettings is true but getSettings() is not exported")
    variants = m.get("variants") or [{"id": "default", "name": m.get("name"), "config": {}}]
    seen = set()
    for v in variants:
        if not ID_RE.match(str(v.get("id", ""))): errors.append(f"{tag}: bad variant id {v.get('id')!r}")
        if not isinstance(v.get("home", True), bool): errors.append(f"{tag}: variant {v.get('id')!r} 'home' must be true or false")
        if v.get("shortName") is not None and not (isinstance(v["shortName"], str) and v["shortName"].strip()): errors.append(f"{tag}: variant {v.get('id')!r} 'shortName' must be a non-empty string")
        if v.get("id") in seen: errors.append(f"{tag}: duplicate variant id {v.get('id')!r}")
        seen.add(v.get("id"))
    if not errors:
        sources.append((m, variants, d))

if errors:
    sys.exit("ERROR:\n  " + "\n  ".join(errors))
if not sources:
    sys.exit("ERROR: no sources found in sources/")

boot = b64_parts((root / "js/soryn-bootstrap.js").read_bytes())
(kt_dir / "JsAssets.kt").write_text(f'''package com.soryn

import android.util.Base64

internal object JsAssets {{
    private val bootstrapParts = {kt_parts(boot)}

    val bootstrap: String by lazy {{
        String(Base64.decode(bootstrapParts.joinToString(""), Base64.DEFAULT), Charsets.UTF_8)
    }}

    fun page(): String {{
        fun safe(s: String) = s.replace("</script", "<\\\\/script")
        return "<!doctype html><html><head><meta charset=\\"utf-8\\"><script>" + safe(bootstrap) +
            "</script></head><body></body></html>"
    }}
}}
''')

entries = []
for m, variants, d in sources:
    vs = ",\n".join(
        f'            JsVariant({kt(v["id"])}, {kt(v.get("name") or m["name"])}, {kt(json.dumps(v.get("config", {})))}, {"false" if v.get("home") is False else "true"}, {kt(v["shortName"]) if v.get("shortName") else "null"})'
        for v in variants)
    entries.append(f'''        JsSourceDef(
            id = {kt(m["id"])}, name = {kt(m["name"])}, version = {kt(m["version"])},
            baseUrl = {kt(m["baseUrl"])}, lang = {kt(m.get("lang", "en"))},
            hasSettings = {"true" if m.get("hasSettings") else "false"},
            types = setOf({", ".join(kt(t) for t in m.get("types", ["movie", "series"]))}),
            configJson = {kt(json.dumps(m.get("config", {})))},
            variants = listOf(
{vs}
            ),
            catalogParts = {kt_parts(b64_parts((d / "catalog.js").read_bytes()))},
            streamParts = {kt_parts(b64_parts((d / "stream.js").read_bytes()))},
        )''')

(kt_dir / "JsSources.kt").write_text(f'''package com.soryn

import android.util.Base64

class JsVariant(val id: String, val name: String, val configJson: String, val hasHome: Boolean = true, val shortName: String? = null)

class JsSourceDef(
    val id: String,
    val name: String,
    val version: String,
    val baseUrl: String,
    val lang: String,
    val hasSettings: Boolean,
    val types: Set<String>,
    val configJson: String,
    val variants: List<JsVariant>,
    private val catalogParts: List<String>,
    private val streamParts: List<String>,
) {{
    private fun decode(parts: List<String>) =
        String(Base64.decode(parts.joinToString(""), Base64.DEFAULT), Charsets.UTF_8)

    val catalogJs: String by lazy {{ decode(catalogParts) }}
    val streamJs: String by lazy {{ decode(streamParts) }}
}}

internal object JsSources {{
    val all: List<JsSourceDef> = listOf(
{",\n".join(entries)}
    )
}}
''')
