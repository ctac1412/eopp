import json
import os

os.chdir(r"D:\Projects\eopp\server\data\captcha_examples\valid")
files = ["4e903cf78973e3a3.json", "399affe7090b9887.json", "2d9a408be4c3d6a9.json"]

all_tile_ids = {}
for f in files:
    with open(f) as fh:
        data = json.load(fh)
    puzzle = data.get("puzzle", data)
    tiles = puzzle.get("tiles", [])
    tile_ids = set(t["tileId"] for t in tiles)
    all_tile_ids[f] = tile_ids
    print(f"{f}: {len(tile_ids)} tiles")

# Compare pairwise
keys = list(all_tile_ids.keys())
for i in range(len(keys)):
    for j in range(i + 1, len(keys)):
        a, b = keys[i], keys[j]
        common = all_tile_ids[a] & all_tile_ids[b]
        only_a = all_tile_ids[a] - all_tile_ids[b]
        only_b = all_tile_ids[b] - all_tile_ids[a]
        print(f"\n{os.path.basename(a)} vs {os.path.basename(b)}:")
        print(f"  Common: {len(common)}")
        print(f"  Only in {os.path.basename(a)}: {len(only_a)}")
        print(f"  Only in {os.path.basename(b)}: {len(only_b)}")
        if only_a:
            print(f"    Unique to A: {sorted(only_a)}")
        if only_b:
            print(f"    Unique to B: {sorted(only_b)}")
