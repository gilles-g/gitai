#!/usr/bin/env python3
"""What neither py_compile nor --check sees: the assets and the embedded JS.

- the three theme blocks of primer-like.css declare the same tokens (a colour added to one
  block alone silently falls back to the light value on the other two);
- the dark block auto_dark_block re-extracts still exists under the exact selector it looks for;
- render.js and the JS string inside gitai.py parse (node --check): a syntax error there
  renders a page with no comment form and no error visible server-side;
- the two manifests are valid JSON and agree on the version, the one the plugin cache is keyed by.
"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import gitai  # noqa: E402

failures = []


def fail(msg):
    failures.append(msg)
    print(f"  ✗ {msg}")


css = (ROOT / "assets" / "primer-like.css").read_text(encoding="utf-8")
blocks = {}
for m in re.finditer(r"(:root(?:\[data-theme='(\w+)'\])?)\s*\{([^}]*)\}", css):
    blocks[m.group(2) or "light"] = set(re.findall(r"(--[\w-]+)\s*:", m.group(3)))
for theme in ("light", "dark", "dimmed"):
    if theme not in blocks:
        fail(f"primer-like.css: no :root block for theme {theme!r}")
if not failures:
    every = set().union(*blocks.values())
    for theme, tokens in blocks.items():
        for token in sorted(every - tokens):
            fail(f"primer-like.css: {token} missing from the {theme} block")
if not gitai.auto_dark_block(css):
    fail("primer-like.css: auto_dark_block found no \":root[data-theme='dark'] {\" block")

with tempfile.TemporaryDirectory() as tmp:
    embedded = Path(tmp) / "embedded.js"
    embedded.write_text(gitai.JS, encoding="utf-8")
    for label, path in (("assets/render.js", ROOT / "assets" / "render.js"),
                        ("gitai.py JS string", embedded)):
        r = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
        if r.returncode != 0:
            fail(f"{label} does not parse:\n{r.stderr.strip()}")

versions = {}
for rel in (".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"):
    try:
        data = json.loads((ROOT / rel).read_text(encoding="utf-8"))
    except ValueError as e:
        fail(f"{rel}: invalid JSON ({e})")
        continue
    versions[rel] = (data.get("version") if "plugins" not in data
                     else (data["plugins"][0].get("version") if data["plugins"] else None))
if len(set(versions.values())) > 1:
    fail(f"version mismatch between manifests: {versions}")

print("assets: OK" if not failures else f"assets: {len(failures)} failure(s)")
sys.exit(1 if failures else 0)
