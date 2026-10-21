import hashlib
import json
import pathlib
import shutil

root = pathlib.Path(".")
pairs = [
    (root / "NextGen/build/NextGen.cs3", root / "nextgen.cs3"),
    (root / "NextGenAnime/build/NextGenAnime.cs3", root / "nextgenanime.cs3"),
    (root / "NextGenBDIX/build/NextGenBDIX.cs3", root / "nextgenbdix.cs3"),
]

for src, dst in pairs:
    shutil.copy2(src, dst)
    print(f"Copied {src} to {dst}")

pj = root / "plugins.json"
data = json.loads(pj.read_text(encoding="utf-8"))

for item in data:
    url = item.get("url", "")
    fn = url.rsplit("/", 1)[-1]
    fp = root / fn
    if fp.exists():
        content = fp.read_bytes()
        h = hashlib.sha256(content).hexdigest()
        item["filesize"] = len(content)
        item["fileSize"] = len(content)
        item["hash"] = h
        item["sha256"] = h
        print(f"{fn}: size={len(content)}, hash={h}")

pj.write_text(json.dumps(data, indent=2), encoding="utf-8")
print("Updated plugins.json successfully")
