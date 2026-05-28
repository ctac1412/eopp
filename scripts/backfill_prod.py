"""Call classification backfill on prod."""
import http.client, json, ssl

HOST = "45.12.75.110"
PORT = 8765
ADMIN_TOKEN = "13243546"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def request(method, path, body=None):
    conn = http.client.HTTPSConnection(HOST, PORT, context=ctx, timeout=30)
    headers = {"X-Admin-Token": ADMIN_TOKEN}
    if body:
        headers["Content-Type"] = "application/json"
        body = json.dumps(body)
    conn.request(method, path, body=body, headers=headers)
    resp = conn.getresponse()
    data = resp.read().decode()
    conn.close()
    return resp.status, json.loads(data) if data else {}

# 1. Backfill analysis metadata
print("1. backfill-analysis-metadata...")
s, d = request("POST", "/admin/captcha-files/backfill-analysis-metadata")
print(f"   {s}: {d}")

# 2. Run Chain classifier via AI endpoint, save results
print("2. Classifying all captchas...")
s, d = request("POST", "/admin/ai/classify", {"classifier": "chain"})
print(f"   {s}: total={d.get('total')} digit={d.get('digit_count')} figures={d.get('figure_count',0)} puzzle={d.get('puzzle_count')}")
if d.get('stats'):
    print(f"   TP={d['stats']['tp']} FP={d['stats']['fp']} FN={d['stats']['fn']} acc={d['stats']['accuracy']}")

print("\nDone.")
