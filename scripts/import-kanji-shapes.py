"""Build small, per-character stroke guides from a pinned KanjiVG source archive.

Only SVG geometry and component names are read; no downloaded code is executed.
Derived drawings retain KanjiVG's CC BY-SA 3.0 attribution and license.
"""
import io
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

REVISION = "422b5538595676da918c288a4230cb5e22a1ee7e"
ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "public/learning/kanji/shapes"
SVG = "{http://www.w3.org/2000/svg}"
KVG = "{http://kanjivg.tagaini.net}"


def build_shape(xml, character):
    document = ET.fromstring(xml)
    stroke_root = next(g for g in document.iter(SVG + "g") if "StrokePaths_" in g.get("id", ""))
    root = next(iter(stroke_root))
    assert root.get(KVG + "element") == character
    paths = list(root.iter(SVG + "path"))
    indices = {id(p): i for i, p in enumerate(paths)}
    children = list(root)
    # Skip wrappers that do not themselves divide the character.
    while len(children) == 1 and children[0].tag == SVG + "g":
        children = list(children[0])
    parts = []
    split_parts = {}
    loose = []
    for child in children:
        if child.tag == SVG + "path":
            loose.append(indices[id(child)])
            continue
        strokes = [indices[id(p)] for p in child.iter(SVG + "path")]
        if not strokes:
            continue
        label = child.get(KVG + "element", "")
        part = {"label": label, "original": child.get(KVG + "original", label), "strokes": strokes}
        # Rejoin interrupted groups (e.g. the top and bottom strokes of an enclosure).
        key = (label, child.get(KVG + "number", ""))
        if child.get(KVG + "part") and key in split_parts:
            split_parts[key]["strokes"].extend(strokes)
        else:
            parts.append(part)
            if child.get(KVG + "part"):
                split_parts[key] = part
    if loose:
        parts.append({"label": "", "original": "", "strokes": loose})
    if len(parts) == 1:
        parts[0]["label"] = character
        parts[0]["original"] = character
    parts.sort(key=lambda part: min(part["strokes"]))
    for part in parts:
        part["strokes"].sort()
    assert sorted(i for part in parts for i in part["strokes"]) == list(range(len(paths)))
    return {"character": character, "paths": [p.attrib["d"] for p in paths], "parts": parts}


def main():
    request = urllib.request.Request(
        f"https://codeload.github.com/KanjiVG/kanjivg/zip/{REVISION}",
        headers={"User-Agent": "KanjiLearningHubImporter"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))
    prefix = f"kanjivg-{REVISION}/"
    library = json.loads((ROOT / "data/kanji-lessons.json").read_text())
    characters = [entry["character"] for lesson in library["lessons"] for entry in lesson["entries"]]
    DEST.mkdir(parents=True, exist_ok=True)
    for character in characters:
        code = f"{ord(character):05x}"
        shape = build_shape(archive.read(f"{prefix}kanji/{code}.svg"), character)
        (DEST / f"{code}.json").write_text(json.dumps(shape, ensure_ascii=False, separators=(",", ":")) + "\n")
    (DEST / "COPYING.txt").write_bytes(archive.read(prefix + "COPYING").rstrip() + b"\n")
    (DEST / "NOTICE.txt").write_text(
        "Kanji stroke drawings and component groupings derived from KanjiVG.\n"
        "Copyright (C) Ulrich Apel and KanjiVG contributors.\n"
        "Source: https://kanjivg.tagaini.net/\n"
        f"Revision: https://github.com/KanjiVG/kanjivg/tree/{REVISION}\n"
        "License: Creative Commons Attribution-ShareAlike 3.0 Unported\n"
        "https://creativecommons.org/licenses/by-sa/3.0/\n"
        "Changes: extracted ordered stroke paths and top-level visual groups into JSON;\n"
        "rejoined interrupted groups; added interactive highlighting in the viewer.\n"
        "These derived drawings are distributed under the same CC BY-SA 3.0 license.\n"
        "The original mnemonic stories are separate from this drawing dataset.\n"
    )
    print(f"Imported {len(characters)} complete stroke guides from KanjiVG {REVISION[:7]}.")


if __name__ == "__main__":
    main()
