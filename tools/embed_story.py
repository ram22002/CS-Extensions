import base64, json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
kt_dir = root / "NextGenStory/src/main/kotlin/com/nextgenstory/runtime"
kt_dir.mkdir(parents=True, exist_ok=True)

CHUNK = 20000
TYPES = {"movie", "series", "anime", "live"}
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
story_dir = root / "sources" / "story"
if not story_dir.exists():
    sys.exit("ERROR: sources/story not found")

mf = story_dir / "source.json"
if not mf.exists():
    sys.exit("ERROR: sources/story/source.json not found")

m = json.loads(mf.read_text(encoding="utf-8"))
sid = m.get("id")
if not isinstance(sid, str) or not ID_RE.match(sid):
    errors.append(f"sources/story: id must match {ID_RE.pattern}")

for k in ("name", "version", "baseUrl"):
    if not isinstance(m.get(k), str) or not m[k]:
        errors.append(f"sources/story/source.json: '{k}' is required")

for fname, fns in REQUIRED.items():
    f = story_dir / fname
    if not f.exists():
        errors.append(f"sources/story: missing {fname}")
        continue
    text = f.read_text(encoding="utf-8")
    for fn in fns:
        if not exports(text, fn):
            errors.append(f"sources/story/{fname}: does not export {fn}()")

has_settings = m.get("hasSettings", False)
if has_settings and (story_dir / "catalog.js").exists() and not exports((story_dir / "catalog.js").read_text(encoding="utf-8"), "getSettings"):
    errors.append("sources/story/catalog.js: hasSettings is true but getSettings() is not exported")

variants = m.get("variants") or [{"id": "default", "name": m.get("name"), "config": {}}]
sources.append((m, variants, story_dir))

if errors:
    sys.exit("ERROR:\n  " + "\n  ".join(errors))

boot = b64_parts((root / "js/soryn-bootstrap.js").read_bytes())
(kt_dir / "JsAssets.kt").write_text(f'''package com.nextgenstory

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
''', encoding="utf-8")

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

(kt_dir / "JsSources.kt").write_text(f'''package com.nextgenstory

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
''', encoding="utf-8")

print(f"Generated NextGen Story JS assets and sources in {kt_dir}")
