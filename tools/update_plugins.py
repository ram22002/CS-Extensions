import hashlib
import json
import pathlib
import shutil
import zipfile

root = pathlib.Path(".")
pairs = [
    (root / "NextGen/build/NextGen.cs3", root / "nextgen.cs3"),
    (root / "NextGenAnime/build/NextGenAnime.cs3", root / "nextgenanime.cs3"),
    (root / "NextGenBDIX/build/NextGenBDIX.cs3", root / "nextgenbdix.cs3"),
    (root / "Live/build/Live.cs3", root / "live.cs3"),
    (root / "Soryn/build/NextGen OTT.cs3", root / "netmirror.cs3"),
]

for src, dst in pairs:
    if src.exists():
        shutil.copy2(src, dst)
        print(f"Copied {src} to {dst}")

for old_name in ["eclipsia.cs3", "eclipsiaanime.cs3", "eclipsiabdix.cs3"]:
    old_file = root / old_name
    if old_file.exists():
        old_file.unlink()
        print(f"Removed {old_name}")

pj = root / "plugins.json"
data = json.loads(pj.read_text(encoding="utf-8"))

for item in data:
    if "url" in item and "/main/" in item["url"]:
        item["url"] = item["url"].replace("/main/", "/builds/")
    url = item.get("url", "")
    fn = url.rsplit("/", 1)[-1]
    fp = root / fn
    if fp.exists():
        content = fp.read_bytes()
        h = hashlib.sha256(content).hexdigest()
        item["filesize"] = len(content)
        item["fileSize"] = len(content)
        item["fileHash"] = f"sha256-{h}"
        item["hash"] = h
        item["sha256"] = h

        try:
            with zipfile.ZipFile(fp) as z:
                if "manifest.json" in z.namelist():
                    mf = json.loads(z.read("manifest.json").decode("utf-8"))
                    if "version" in mf:
                        item["version"] = mf["version"]
                    if "requiresResources" in mf:
                        item["requiresResources"] = mf["requiresResources"]
        except Exception as e:
            print(f"Could not read manifest from {fn}: {e}")

        print(f"{fn}: size={len(content)}, version={item.get('version')}, fileHash={item['fileHash']}")

pj.write_text(json.dumps(data, indent=2), encoding="utf-8")
print("Updated plugins.json successfully")
