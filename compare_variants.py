import json
import os

os.chdir(r"D:\Projects\eopp\prod\data\captcha_examples\valid")
files = ["4e903cf78973e3a3.json", "399affe7090b9887.json", "2d9a408be4c3d6a9.json"]

for f in files:
    with open(f) as fh:
        data = json.load(fh)
    puzzle = data.get("puzzle", data)
    variants = puzzle.get("variantsCapture", [])
    print(f"{f}: {len(variants)} variants")
    for i, v in enumerate(variants):
        print(f"  [{i}] {v}")
    print()
