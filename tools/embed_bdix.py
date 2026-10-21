import base64, json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
out = root / "NextGenBDIX/src/main/kotlin/com/nextgenbdix/runtime/BundledProviders.kt"
cfg_out = root / "NextGenBDIX/src/main/kotlin/com/nextgenbdix/runtime/ProviderConfigData.kt"
CHUNK = 20000
all_files = sorted((root / "providers" / "providers-bdix").glob("*.js"))
manifest = {m["id"]: m for m in json.loads((root / "providers/providers-bdix/manifest.json").read_text())["scrapers"]}

dp_file = root / "providers/providers-bdix/default-providers.json"
default_ids = None
if dp_file.exists():
    raw_dp = json.loads(dp_file.read_text() or "{}")
    ids = raw_dp if isinstance(raw_dp, list) else raw_dp.get("enabled", [])
    unknown = [i for i in ids if i not in manifest]
    if unknown:
        raise SystemExit(f"ERROR: default-providers.json has unknown provider ids: {unknown}")
    default_ids = set(ids) or None

categories = json.loads((root / "providers/providers-bdix/provider-category.json").read_text())
presets = json.loads((root / "providers/providers-bdix/provider-presets.json").read_text())

problems = []
category_ids = [c.get("id") for c in categories]
if len(set(category_ids)) != len(category_ids):
    problems.append("provider-category.json has duplicate ids")
for c in categories:
    for field in ("id", "label", "bannerText"):
        if not isinstance(c.get(field), str) or not c[field].strip():
            problems.append(f"provider-category.json entry {c} is missing '{field}'")
for p in presets:
    if not isinstance(p.get("label"), str) or not p["label"].strip():
        problems.append(f"provider-presets.json entry {p} is missing 'label'")
    for pid in p.get("providerIds", []):
        if pid not in manifest:
            problems.append(f"provider-presets.json: '{p.get('label')}' lists unknown provider id '{pid}'")
category_of = {}
for c in categories:
    for pid in c.get("providerIds", []):
        if pid not in manifest:
            problems.append(f"provider-category.json: '{c.get('label')}' lists unknown provider id '{pid}'")
        elif pid in category_of:
            problems.append(f"provider '{pid}' is listed in both '{category_of[pid]}' and '{c.get('id')}'")
        else:
            category_of[pid] = c.get("id")
for k, m in manifest.items():
    if not (root / "providers" / "providers-bdix" / f"{k}.js").exists():
        problems.append(f"manifest entry '{k}' has no providers/providers-bdix/{k}.js")
files = [f for f in all_files if f.stem in manifest]
for f in all_files:
    if f.stem not in manifest:
        problems.append(f"providers/providers-bdix/{f.name} is not listed in providers/providers-bdix/manifest.json")
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
        f'{str(enabled).lower()}, {kt(category_of.get(f.stem, ""))}, listOf(\n{parts}\n    ))')

out.write_text(f'''package com.nextgenbdix

import android.util.Base64

class BundledProvider(
    val key: String, val name: String, val subtitle: String, val version: String,
    val hasSettings: Boolean, val types: Set<String>,
    val defaultEnabled: Boolean, val category: String, private val parts: List<String>,
) {{
    val code: String by lazy {{ String(Base64.decode(parts.joinToString(""), Base64.DEFAULT), Charsets.UTF_8) }}
}}

internal object BundledProviders {{
    val all: List<BundledProvider> = listOf(
{",\n".join(entries)}
    )
}}
''')

def compact(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))

categories = [{k: v for k, v in c.items() if k != "providerIds"} for c in categories]
cfg_out.write_text(f'''package com.nextgenbdix

internal object ProviderConfigData {{
    const val PRESETS = {kt(compact(presets))}
    const val CATEGORIES = {kt(compact(categories))}
}}
''')
