import base64, json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
out = root / "EclipsiaAnime/src/main/kotlin/com/eclipsiaanime/runtime/BundledProviders.kt"
CHUNK = 20000
all_files = sorted((root / "providers" / "providers-anime").glob("*.js"))
manifest = {m["id"]: m for m in json.loads((root / "providers/providers-anime/manifest.json").read_text())["scrapers"]}

dp_file = root / "providers/providers-anime/default-providers.json"
default_ids = None
if dp_file.exists():
    raw_dp = json.loads(dp_file.read_text() or "{}")
    ids = raw_dp if isinstance(raw_dp, list) else raw_dp.get("enabled", [])
    unknown = [i for i in ids if i not in manifest]
    if unknown:
        raise SystemExit(f"ERROR: default-providers.json has unknown provider ids: {unknown}")
    default_ids = set(ids) or None

problems = []
for k, m in manifest.items():
    if not (root / "providers" / "providers-anime" / f"{k}.js").exists():
        problems.append(f"manifest entry '{k}' has no providers/providers-anime/{k}.js")
files = [f for f in all_files if f.stem in manifest]
for f in all_files:
    if f.stem not in manifest:
        problems.append(f"providers/providers-anime/{f.name} is not listed in providers/providers-anime/manifest.json")
if problems:
    raise SystemExit("ERROR:\n  " + "\n  ".join(problems))

def split_description(desc):
    desc = re.sub(r"^\s*provider\s*:\s*", "", desc, flags=re.I)
    parts = [x.strip() for x in re.split(r"[•|]", desc) if x.strip()]
    return (parts[0], " • ".join(parts[1:])) if parts else ("", "")

def kt(x):
    return json.dumps(x, ensure_ascii=False).replace("$", "\\$")

entries = []
for f in files:
    raw = f.read_bytes()
    b64 = base64.b64encode(raw).decode()
    parts = ",\n".join(f'            "{b64[i:i+CHUNK]}"' for i in range(0, len(b64), CHUNK))
    m = manifest[f.stem]
    has_settings = bool(m.get("hasSettings")) if "hasSettings" in m else "onSettings" in raw.decode("utf-8", "replace")
    name, sub = split_description(m.get("description", ""))
    name = name or f.stem.capitalize()
    types = sorted({"tv" if t == "series" else t for t in m.get("supportedTypes", ["movie", "tv"])})
    enabled = (f.stem in default_ids) if default_ids is not None else bool(m.get("defaultEnabled", m.get("enabled", True)))
    entries.append(
        f'    BundledProvider({kt(f.stem)}, {kt(name)}, {kt(sub)}, {kt(m.get("version", "1"))}, '
        f'{str(has_settings).lower()}, setOf({", ".join(kt(t) for t in types)}), '
        f'{str(enabled).lower()}, listOf(\n{parts}\n    ))')

out.write_text(f'''package com.eclipsiaanime

import android.util.Base64

class BundledProvider(
    val key: String, val name: String, val subtitle: String, val version: String,
    val hasSettings: Boolean, val types: Set<String>,
    val defaultEnabled: Boolean, private val parts: List<String>,
) {{
    val code: String by lazy {{ String(Base64.decode(parts.joinToString(""), Base64.DEFAULT), Charsets.UTF_8) }}
}}

internal object BundledProviders {{
    val all: List<BundledProvider> = listOf(
{",\n".join(entries)}
    )
}}
''')
