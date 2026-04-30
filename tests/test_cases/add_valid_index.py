#!/usr/bin/env python3
import json
import glob
import os

test_dir = "/Users/sgtiulenev/Documents/projects/eopp/tests/test_cases"
files = glob.glob(os.path.join(test_dir, "test_answ*.json"))

for filepath in sorted(files):
    with open(filepath, "r") as f:
        data = json.load(f)

    answer = data.get("answer", [])
    variants_capture = data.get("puzzle", {}).get("variantsCapture", [])

    valid_index = -1
    for i, variant in enumerate(variants_capture):
        if variant == answer:
            valid_index = i
            break

    data["valid_index"] = valid_index

    with open(filepath, "w") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    print(f"{os.path.basename(filepath)}: valid_index = {valid_index}")
