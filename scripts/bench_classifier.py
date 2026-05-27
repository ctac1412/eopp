"""Classifier benchmark script — run on all captchas, save report.

Usage: python scripts/bench_classifier.py

Compares classifier predictions against ground truth from DB.
Saves timestamped report to data/classification_results/.
"""
import json, base64, io, os, sys, time
import numpy as np
from PIL import Image
import cv2
from datetime import datetime

os.environ['PYTHONIOENCODING'] = 'utf-8'

BASE = r'D:\Projects\eopp\prod\data\captcha_examples\all'
REPORT_DIR = r'D:\Projects\eopp\data\classification_results'
DB_PATH = r'D:\Projects\eopp\prod\data\api_keys.db'

sys.path.insert(0, r'D:\Projects\eopp\src')
from captcha_solver_engine.classifier import ChainClassifier
from captcha_solver_engine.models import CaptchaContext


def load_ground_truth():
    import sqlite3
    try:
        conn = sqlite3.connect(DB_PATH)
        rows = conn.execute(
            "SELECT captcha_id, classification FROM captcha_files WHERE classification IS NOT NULL"
        ).fetchall()
        conn.close()
        return {r[0]: r[1] for r in rows}
    except Exception:
        return {}


def run():
    clf = ChainClassifier()
    gt = load_ground_truth()
    all_files = sorted(f for f in os.listdir(BASE) if f.endswith('.json'))

    results = []
    for idx, fname in enumerate(all_files):
        cid = fname.replace('.json', '')
        path = os.path.join(BASE, fname)
        with open(path) as f:
            d = json.load(f)
        puzzle = d.get('puzzle', d)
        tiles = puzzle.get('tiles', [])
        variants = puzzle.get('variantsCapture', [])
        images_dict = {}
        for t in tiles:
            img = Image.open(io.BytesIO(base64.b64decode(t['imageData']))).convert('RGB')
            images_dict[t['tileId']] = np.array(img)
        context = CaptchaContext(data=d, puzzle=puzzle, tiles=tiles, variants=variants, images_dict=images_dict)

        t0 = time.perf_counter()
        result = clf.classify(context)
        elapsed = time.perf_counter() - t0

        results.append({
            'captcha_id': cid,
            'kind': result.kind,
            'confidence': round(result.confidence, 3),
            'time_s': round(elapsed, 3),
            'details': result.details,
            'ground_truth': gt.get(cid),
        })

    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    os.makedirs(REPORT_DIR, exist_ok=True)

    # ── Text report ──
    txt_path = os.path.join(REPORT_DIR, f'classifier_report_{ts}.txt')
    with open(txt_path, 'w', encoding='utf-8') as f:
        digit_r = [r for r in results if r['kind'] == 'digit']
        figure_r = [r for r in results if r['kind'] == 'figures']
        puzzle_r = [r for r in results if r['kind'] == 'default']
        times = [r['time_s'] for r in results]
        ocr_count = sum(1 for r in digit_r if r['details'].get('method') == 'ocr')
        rank_count = sum(1 for r in digit_r if r['details'].get('method') == 'rank')

        # Accuracy vs ground truth
        labeled = [r for r in results if r['ground_truth'] is not None]

        def _expected(gt_val):
            return gt_val if gt_val in ('digit', 'figures') else 'default'

        tp = sum(1 for r in labeled if r['kind'] == _expected(r['ground_truth']) and r['kind'] != 'default')
        fp = sum(1 for r in labeled if r['kind'] != 'default' and r['kind'] != _expected(r['ground_truth']))
        fn = sum(1 for r in labeled if r['ground_truth'] in ('digit', 'figures') and r['kind'] == 'default')
        tn = sum(1 for r in labeled if r['ground_truth'] not in ('digit', 'figures') and r['kind'] == 'default')

        f.write(f'Classifier Benchmark — {ts}\n')
        f.write(f'{"="*60}\n\n')
        f.write(f'Total captchas: {len(results)}\n')
        f.write(f'Figures: {len(figure_r)}\n')
        f.write(f'Digit:   {len(digit_r)}\n')
        f.write(f'Puzzle:  {len(puzzle_r)}\n\n')
        f.write(f'Speed (seconds):\n')
        f.write(f'  min={min(times):.3f}  max={max(times):.3f}\n')
        f.write(f'  avg={np.mean(times):.3f}  median={np.median(times):.3f}\n')
        f.write(f'  p95={np.percentile(times, 95):.3f}\n\n')

        if labeled:
            total_l = len(labeled)
            acc = (tp + tn) / total_l * 100 if total_l > 0 else 0
            prec = tp / (tp + fp) * 100 if (tp + fp) > 0 else 0
            rec = tp / (tp + fn) * 100 if (tp + fn) > 0 else 0
            f.write(f'Ground truth ({total_l} labeled):\n')
            f.write(f'  Accuracy:  {acc:.1f}%\n')
            f.write(f'  Precision: {prec:.1f}%\n')
            f.write(f'  Recall:    {rec:.1f}%\n')
            f.write(f'  TP={tp} FP={fp} FN={fn} TN={tn}\n\n')

        f.write(f'{"="*60}\n')
        f.write(f'{"kind":8s} | {"captcha_id":18s} | {"method":5s} | {"conf":5s} | {"time":7s} | {"gt":10s} | tiles | digits\n')
        f.write(f'{"-"*60}\n')
        for r in results:
            method = r['details'].get('method', '-')
            tiles = r['details'].get('tiles_with_digits', '-')
            digits = r['details'].get('detected_digits', [])
            gt_val = r['ground_truth'] or '-'
            f.write(f'{r["kind"]:8s} | {r["captcha_id"]:18s} | {method:5s} | {r["confidence"]:.2f}  | {r["time_s"]:.3f}s | {gt_val:10s} | {tiles}     | {digits}\n')

    # ── JSON report ──
    json_path = os.path.join(REPORT_DIR, f'classifier_report_{ts}.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({
            'timestamp': ts,
            'total': len(results),
            'figure_count': len(figure_r),
            'digit_count': len(digit_r),
            'puzzle_count': len(puzzle_r),
            'speed': {'min': min(times), 'max': max(times), 'avg': float(np.mean(times)), 'median': float(np.median(times))},
            'results': results,
        }, f, ensure_ascii=False, indent=2)

    return txt_path, json_path, results


if __name__ == '__main__':
    txt, js, results = run()

    digit_r = [r for r in results if r['kind'] == 'digit']
    figure_r = [r for r in results if r['kind'] == 'figures']
    puzzle_r = [r for r in results if r['kind'] == 'default']
    times = [r['time_s'] for r in results]

    print(f'Total:  {len(results)}')
    print(f'Figures: {len(figure_r)}')
    print(f'Digit:   {len(digit_r)}')
    print(f'Puzzle:  {len(puzzle_r)}')
    print(f'Speed:  avg={np.mean(times):.3f}s  median={np.median(times):.3f}s')

    # ── Diff vs ground truth ──
    labeled = [r for r in results if r['ground_truth'] is not None]
    def _expected_kind(gt_val):
        return gt_val if gt_val in ('digit', 'figures') else 'default'

    new_findings = [r for r in results if r['kind'] != 'default' and r['ground_truth'] != r['kind']]
    changed = [r for r in labeled if r['kind'] != _expected_kind(r['ground_truth'])]
    miss = [r for r in results if r['ground_truth'] in ('digit', 'figures') and r['kind'] == 'default']
    fp_list = [r for r in results if r['ground_truth'] not in ('digit', 'figures') and r['kind'] != 'default']

    if new_findings:
        print(f'\n  NEW candidates ({len(new_findings)}):')
        for r in new_findings:
            gt = r['ground_truth'] or 'unlabeled'
            method = r['details'].get('method', '-')
            print(f'    {r["captcha_id"]}  kind={r["kind"]}  method={method}  conf={r["confidence"]:.2f}  gt={gt}')

    if changed:
        print(f'\n  CHANGED vs ground truth ({len(changed)}):')
        for r in changed:
            method = r['details'].get('method', '-')
            print(f'    {r["captcha_id"]}  gt={r["ground_truth"]} -> pred={r["kind"]}  method={method}')

    if miss:
        print(f'\n  MISSED ({len(miss)}):')
        for r in miss:
            print(f'    {r["captcha_id"]}  gt={r["ground_truth"]}  kind={r["kind"]}')

    if fp_list:
        print(f'\n  FALSE POSITIVES ({len(fp_list)}):')
        for r in fp_list:
            print(f'    {r["captcha_id"]}  kind={r["kind"]}  method={r["details"].get("method")}')

    print(f'\nReport: {txt}')
