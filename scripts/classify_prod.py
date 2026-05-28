"""Classify all captchas on prod and update DB."""
import http.client, json, ssl

HOST = "45.12.75.110"
PORT = 8765
TOKEN = "13243546"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def req(method, path, body=None):
    conn = http.client.HTTPSConnection(HOST, PORT, context=ctx, timeout=60)
    headers = {"X-Admin-Token": TOKEN}
    data = json.dumps(body).encode() if body else None
    if body: headers["Content-Type"] = "application/json"
    conn.request(method, path, body=data, headers=headers)
    resp = conn.getresponse()
    result = json.loads(resp.read().decode())
    conn.close()
    return result

# 1. Get all captcha files
print("Getting captcha list...")
files = req("GET", "/admin/captcha-files")
print(f"  {len(files)} captchas")

# 2. Run classifier
print("Running chain classifier...")
result = req("POST", "/admin/ai/classify", {"classifier": "chain"})
results = result.get("results", [])
print(f"  Total: {len(results)}, Figures: {result.get('figure_count',0)}, Digit: {result.get('digit_count',0)}, Puzzle: {result.get('puzzle_count',0)}")

# 3. Update classifications in DB
updated = 0
for r in results:
    cid = r["captcha_id"]
    kind = r["kind"]  # "figures", "digit", "default"
    gt = r.get("ground_truth")
    classification = kind if kind != "default" else "puzzle"
    if gt != classification:
        print(f"  Updating {cid[:8]}: {gt} -> {classification}")
        req("PUT", f"/admin/captcha-files/{cid}/classification", {"classification": classification})
        updated += 1

print(f"\nUpdated {updated} classifications")