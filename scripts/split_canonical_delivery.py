"""Lossless two-part JSON transport for one canonical catalog; no new data standard.

split preserves the original file, puts metadata in part 1 only, and partitions
recipes in source order. join restores the exact original UTF-8 serialization.
No command overwrites existing files. All operations are local files only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

FORMAT = "eatwhat-canonical-delivery-v1"
LIMIT = 20_000_000
PART_COUNT = 2


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def decode(data):
    return json.loads(data.decode("utf-8"), object_pairs_hook=unique_object,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite JSON number")))


def restore(value, profile):
    require(isinstance(profile, dict) and set(profile) == {"indent", "newline", "trailingNewline", "ensureAscii"}, "Invalid serialization profile")
    require(profile["indent"] in (None, 2) and profile["ensureAscii"] is False, "Unsupported serialization profile")
    require(profile["newline"] in ("LF", "CRLF") and type(profile["trailingNewline"]) is bool, "Invalid newline profile")
    options = {"indent": 2} if profile["indent"] == 2 else {"separators": (",", ":")}
    text = json.dumps(value, ensure_ascii=False, allow_nan=False, **options)
    if profile["trailingNewline"]:
        text += "\n"
    if profile["newline"] == "CRLF":
        text = text.replace("\n", "\r\n")
    return text.encode("utf-8")


def source_profile(value, original):
    for indent in (2, None):
        for newline in ("LF", "CRLF"):
            for trailing in (True, False):
                profile = dict(indent=indent, newline=newline, trailingNewline=trailing, ensureAscii=False)
                if restore(value, profile) == original:
                    return profile
    raise ValueError("Unsupported source serialization; exact UTF-8 compact or indent=2 round-trip is required")


def sealed(value):
    value = dict(value)
    value["partPayloadSha256"] = sha(compact(value))
    return compact(value)


def write_new(path, data):
    with path.open("xb") as stream:
        stream.write(data)


def split(source, output_dir, max_bytes=LIMIT):
    source, output_dir = Path(source).resolve(), Path(output_dir).resolve()
    require(type(max_bytes) is int and 0 < max_bytes <= LIMIT, "Byte limit must be positive and at most 20000000")
    original = source.read_bytes()
    catalog = decode(original)
    require(isinstance(catalog, dict) and isinstance(catalog.get("recipes"), list), "Catalog object with recipes array required")
    recipes = catalog["recipes"]
    require(len(recipes) >= 2, "At least two recipes are required for two nonempty parts")
    profile = source_profile(catalog, original)
    digest = sha(original)
    common = dict(format=FORMAT, partCount=PART_COUNT, sourceSha256=digest,
                  sourceBytes=len(original), recipeTotal=len(recipes))
    metadata = {key: value for key, value in catalog.items() if key != "recipes"}

    def parts_at(pivot):
        first = dict(common, partIndex=1, recipeStart=0, recipeEnd=pivot,
                     sourceSerialization=profile, rootKeyOrder=list(catalog), metadata=metadata,
                     recipes=recipes[:pivot])
        second = dict(common, partIndex=2, recipeStart=pivot, recipeEnd=len(recipes), recipes=recipes[pivot:])
        return sealed(first), sealed(second)

    # Find a source-order boundary that balances the actual encoded UTF-8 bytes.
    low, high = 1, len(recipes) - 1
    while low < high:
        pivot = (low + high) // 2
        first, second = parts_at(pivot)
        if len(first) < len(second):
            low = pivot + 1
        else:
            high = pivot
    choices = [(p, parts_at(p)) for p in sorted({low, max(1, low - 1)})]
    pivot, encoded = min(choices, key=lambda choice: max(map(len, choice[1])))
    require(all(len(part) < max_bytes for part in encoded), "Two JSON parts cannot fit strictly below this byte limit")
    names = ["runtime-catalog.part-1-of-2.json", "runtime-catalog.part-2-of-2.json"]
    manifest = dict(format=FORMAT, partCount=PART_COUNT, sourceName=source.name,
                    sourceSha256=digest, sourceBytes=len(original), recipeTotal=len(recipes),
                    byteLimitExclusive=max_bytes,
                    parts=[dict(file=name, partIndex=i + 1, bytes=len(data), sha256=sha(data),
                                recipeStart=0 if i == 0 else pivot,
                                recipeEnd=pivot if i == 0 else len(recipes))
                           for i, (name, data) in enumerate(zip(names, encoded))])
    outputs = [output_dir / name for name in names] + [output_dir / "manifest.json", output_dir / "README.txt"]
    require(all(path != source and not path.exists() for path in outputs), "Refusing to overwrite an existing file or the source")
    output_dir.mkdir(parents=True, exist_ok=True)
    for path, data in zip(outputs[:2], encoded):
        write_new(path, data)
    write_new(outputs[2], compact(manifest))
    note = ("These two JSON files are transport fragments of one unchanged canonical catalog.\n"
            "They are not independently importable catalogs. Metadata occurs only in part 1; recipes retain source order.\n"
            "Join: python scripts/split_canonical_delivery.py join --manifest <delivery>/manifest.json --output <new-file>.json\n"
            f"Original SHA256: {digest}\nOriginal bytes: {len(original)}\n"
            "Join validates completeness, order, ranges, fragment hashes and the exact original file hash.\n"
            "Existing files are never overwritten. No ZIP or other compressed archive is used.\n")
    write_new(outputs[3], note.encode("utf-8"))
    return manifest


def join(parts, output, manifest=None):
    output = Path(output).resolve()
    require(not output.exists(), "Refusing to overwrite an existing output/source")
    expected = None
    if manifest is not None:
        manifest = Path(manifest).resolve()
        expected = decode(manifest.read_bytes())
        require(expected.get("format") == FORMAT and expected.get("partCount") == PART_COUNT, "Invalid manifest")
        entries = expected.get("parts")
        require(isinstance(entries, list) and len(entries) == PART_COUNT, "Missing or extra manifest part")
        require([row.get("partIndex") for row in entries] == [1, 2], "Manifest parts are duplicated or out of order")
        names = [row.get("file") for row in entries]
        require(all(isinstance(name, str) and Path(name).name == name and name not in (".", "..") for name in names), "Invalid manifest part filename")
        require(len(set(names)) == PART_COUNT, "Duplicate manifest part")
        require(not parts, "Supply either ordered parts or a manifest")
        parts = [manifest.parent / name for name in names]
    parts = [Path(part).resolve() for part in parts]
    require(len(parts) == PART_COUNT and len(set(parts)) == PART_COUNT, "Exactly two distinct ordered parts required")
    require(output not in parts and (manifest is None or output != manifest), "Output cannot replace an input")
    decoded = []
    for index, path in enumerate(parts):
        raw = path.read_bytes()
        part = decode(raw)
        require(isinstance(part, dict), "Part must be a JSON object")
        payload_hash = part.pop("partPayloadSha256", None)
        require(payload_hash == sha(compact(part)), "Part payload hash mismatch")
        require(part.get("format") == FORMAT and part.get("partCount") == PART_COUNT and part.get("partIndex") == index + 1, "Part missing, duplicated or out of order")
        require(isinstance(part.get("recipes"), list) and part["recipes"], "Part recipes must be a nonempty array")
        require(type(part.get("recipeStart")) is int and type(part.get("recipeEnd")) is int and part["recipeEnd"] - part["recipeStart"] == len(part["recipes"]), "Invalid recipe range")
        if expected is not None:
            row = expected["parts"][index]
            require(len(raw) == row.get("bytes") and sha(raw) == row.get("sha256"), "Manifest fragment size/hash mismatch")
            require(len(raw) < expected.get("byteLimitExclusive", 0), "Manifest byte limit exceeded")
            for key in ("recipeStart", "recipeEnd"):
                require(part[key] == row.get(key), "Manifest range mismatch")
        decoded.append(part)
    first, second = decoded
    for key in ("sourceSha256", "sourceBytes", "recipeTotal"):
        require(first.get(key) == second.get(key) and (expected is None or first.get(key) == expected.get(key)), "Mismatched source identity")
    require(first["recipeStart"] == 0 and first["recipeEnd"] == second["recipeStart"] and second["recipeEnd"] == first.get("recipeTotal"), "Missing or overlapping recipe segment")
    require(not any(key in second for key in ("metadata", "rootKeyOrder", "sourceSerialization")), "Metadata must occur only in part 1")
    metadata, order = first.get("metadata"), first.get("rootKeyOrder")
    require(isinstance(metadata, dict) and "recipes" not in metadata and isinstance(order, list), "Invalid sole metadata block")
    require(all(isinstance(key, str) for key in order) and len(order) == len(set(order)) and set(order) == set(metadata) | {"recipes"}, "Invalid original root key order")
    recipes = first["recipes"] + second["recipes"]
    catalog = {key: recipes if key == "recipes" else metadata[key] for key in order}
    restored = restore(catalog, first.get("sourceSerialization"))
    require(len(restored) == first.get("sourceBytes") and sha(restored) == first.get("sourceSha256"), "Reconstructed original byte length/SHA256 mismatch")
    output.parent.mkdir(parents=True, exist_ok=True)
    write_new(output, restored)
    return dict(output=str(output), bytes=len(restored), sha256=sha(restored))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    split_parser = commands.add_parser("split")
    split_parser.add_argument("--source", type=Path, required=True)
    split_parser.add_argument("--output-dir", type=Path, required=True)
    split_parser.add_argument("--max-bytes", type=int, default=LIMIT)
    join_parser = commands.add_parser("join")
    join_parser.add_argument("parts", nargs="*", type=Path)
    join_parser.add_argument("--manifest", type=Path)
    join_parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = split(args.source, args.output_dir, args.max_bytes) if args.command == "split" else join(args.parts, args.output, args.manifest)
    except (ValueError, OSError) as error:
        parser.exit(2, f"{error}\n")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
