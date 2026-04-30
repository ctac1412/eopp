#!/usr/bin/env python3
"""
Visualize top variants for test_2.json to debug incorrect result
"""

import json
import base64
from PIL import Image
import io
import numpy as np
import os


def load_captcha_data(filepath):
    with open(filepath, "r") as f:
        return json.load(f)


def decode_base64_image(base64_data):
    if "," in base64_data:
        base64_data = base64_data.split(",", 1)[1]
    image_data = base64.b64decode(base64_data)
    return Image.open(io.BytesIO(image_data)).convert("RGB")


def assemble_variant(variant, images_dict, output_path):
    """Assemble tiles into a single image"""
    tiles = [images_dict[tid] for tid in variant]

    w, h = tiles[0].size
    result = Image.new("RGB", (w * len(tiles), h))

    for i, tile in enumerate(tiles):
        result.paste(tile, (i * w, 0))

    result.save(output_path)
    return result


def calculate_seam_discontinuity(variant, images_dict, edge_trim=3):
    arrs = [np.array(images_dict[tid]) for tid in variant]
    total_discontinuity = 0

    for i in range(len(arrs) - 1):
        right = arrs[i][:, edge_trim:-edge_trim, :]
        left = arrs[i + 1][:, edge_trim:-edge_trim, :]

        edge_width = 8
        right_edge = right[:, -edge_width:, :]
        left_edge = left[:, :edge_width, :]

        diff = np.mean(np.abs(right_edge.astype(float) - left_edge.astype(float)))
        total_discontinuity += diff

    return total_discontinuity


def calculate_content_coherence(variant, images_dict, edge_trim=3):
    arrs = [np.array(images_dict[tid]) for tid in variant]
    coherence_score = 0

    for i in range(len(arrs) - 1):
        right = arrs[i][:, edge_trim:-edge_trim, :]
        left = arrs[i + 1][:, edge_trim:-edge_trim, :]

        edge_width = 12
        right_region = right[:, -edge_width:, :]
        left_region = left[:, :edge_width, :]

        right_grad = np.gradient(right_region.mean(axis=2), axis=1)
        left_grad = np.gradient(left_region.mean(axis=2), axis=1)

        if right_grad.size > 0 and left_grad.size > 0:
            corr = np.corrcoef(right_grad.flatten(), left_grad.flatten())[0, 1]
            if not np.isnan(corr):
                coherence_score += corr

    return coherence_score


def main():
    filepath = "/Users/sgtiulenev/Documents/projects/eopp/tests/test_cases/test_2.json"
    output_dir = (
        "/Users/sgtiulenev/Documents/projects/eopp/tests/test_cases/debug_test2"
    )

    os.makedirs(output_dir, exist_ok=True)

    data = load_captcha_data(filepath)
    tiles = data["puzzle"]["tiles"]
    variants = data["puzzle"]["variantsCapture"]

    # Load images
    images_dict = {}
    for tile in tiles:
        tile_id = tile["tileId"]
        image = decode_base64_image(tile["imageData"])
        images_dict[tile_id] = image

    print(f"Loaded {len(tiles)} tiles")
    print(f"Checking {len(variants)} variants\n")

    # Calculate scores for all variants
    results = []
    for i, variant in enumerate(variants):
        discontinuity = calculate_seam_discontinuity(variant, images_dict)
        coherence = calculate_content_coherence(variant, images_dict)
        score = discontinuity - coherence * 100
        results.append((i, score, discontinuity, coherence))

    # Sort by score
    results.sort(key=lambda x: x[1])

    print("Top 5 variants:")
    for rank, (v_num, score, disc, coh) in enumerate(results[:5], 1):
        print(
            f"  {rank}. Variant {v_num}: score={score:.2f}, disc={disc:.2f}, coh={coh:.2f}"
        )

    # Assemble top 5 variants
    print(f"\nAssembling top 5 variants to: {output_dir}")
    for rank, (v_num, score, disc, coh) in enumerate(results[:5], 1):
        variant = variants[v_num]
        output_path = os.path.join(output_dir, f"variant_{v_num}_rank_{rank}.png")
        assemble_variant(variant, images_dict, output_path)
        print(f"  Saved: variant_{v_num}_rank_{rank}.png")

    print(f"\nDone! Check images in {output_dir}")


if __name__ == "__main__":
    main()
