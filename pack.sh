#!/usr/bin/env bash
# Zip extension/ with manifest.json at the zip root (required by the Chrome Web Store).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/dist/inkmark.zip"
mkdir -p "$ROOT/dist"
rm -f "$OUT"
(
  cd "$ROOT/extension"
  zip -r "$OUT" . \
    -x "*.DS_Store" \
    -x "**/.DS_Store"
)
python3 - "$OUT" <<'PY'
import json, sys, zipfile
path = sys.argv[1]
with zipfile.ZipFile(path) as z:
    names = z.namelist()
if "manifest.json" not in names:
    sys.exit("zip must have manifest.json at the root, not inside a folder")
bad = [n for n in names if n.startswith("extension/") or n.startswith("intro/") or n.startswith("tests/")]
if bad:
    sys.exit("zip contains files that should not ship: " + ", ".join(bad[:8]))
raw = zipfile.ZipFile(path).read("manifest.json")
manifest = json.loads(raw)
for key in ("manifest_version", "name", "version", "icons"):
    if key not in manifest:
        sys.exit("manifest missing " + key)
print("packed", path)
print("files", len(names))
print("id key", "yes" if "key" in manifest else "no")
PY
