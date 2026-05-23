"""Test captcha sending utilities."""

import glob
import http.client
import json
import os
import random
import ssl
import threading
import time

from src.captcha_assembly import captcha_hash
from src.constants import ADMIN_TOKEN, NO_VALID_DIR, VALID_DIR
from src.utils import counter_lock, result_counter, source_files

pending = {}


def next_result_id():
    global result_counter
    with counter_lock:
        result_counter += 1
        return result_counter


def _http_post(path, body, extra_headers=None):
    headers = {"Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)

    from src import constants

    if constants.use_ssl:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        conn = http.client.HTTPSConnection("127.0.0.1", constants.PORT, context=ctx, timeout=5)
    else:
        conn = http.client.HTTPConnection("127.0.0.1", constants.PORT, timeout=5)

    conn.request("POST", path, body=body, headers=headers)
    resp = conn.getresponse()
    resp.read()
    conn.close()
    return resp


def send_test_cases():
    pattern = os.path.join(VALID_DIR, "*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"No test files found in {VALID_DIR}")
        return

    time.sleep(2)

    for filepath in files:
        with open(filepath) as f:
            body = f.read()
        print(f"Sending test: {os.path.basename(filepath)}")
        t = threading.Thread(target=_send_captcha, args=(body, ADMIN_TOKEN), daemon=True)
        t.start()
        time.sleep(1)


def send_write_cases():
    pattern = os.path.join(NO_VALID_DIR, "*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"No unlabelled test files found in {NO_VALID_DIR}")
        return

    time.sleep(2)

    for filepath in files:
        with open(filepath) as f:
            body = f.read()
        data = json.loads(body)
        cid = captcha_hash(data)
        source_files[cid] = filepath
        print(f"Sending for labeling: {os.path.basename(filepath)} [{cid}]")
        t = threading.Thread(
            target=_send_captcha_with_id,
            args=(cid, body, ADMIN_TOKEN),
            daemon=True,
        )
        t.start()
        time.sleep(1)


def _send_captcha(body, admin_token, api_key=None):
    try:
        if api_key is None:
            from src.constants import get_test_api_key

            api_key = get_test_api_key()

        data = json.loads(body)
        data["api_key"] = api_key
        wrapped_body = json.dumps(data)
        _http_post(
            path="/solve-captcha",
            body=wrapped_body,
            extra_headers={"X-Admin-Token": admin_token},
        )
    except Exception as e:
        print(f"Error sending test captcha: {e}")


def _send_captcha_with_id(captcha_id, body, admin_token, api_key=None):
    try:
        if api_key is None:
            from src.constants import get_test_api_key

            api_key = get_test_api_key()

        wrapper = {
            "captcha_id": captcha_id,
            "data": json.loads(body),
            "api_key": api_key,
        }
        _http_post(
            "/solve-captcha",
            json.dumps(wrapper),
            extra_headers={"X-Admin-Token": admin_token},
        )
    except Exception as e:
        print(f"Error sending test captcha: {e}")


def send_test_cases_with_key(api_key=None):
    pattern = os.path.join(VALID_DIR, "*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"No test files found in {VALID_DIR}")
        return

    time.sleep(2)

    for filepath in files:
        with open(filepath) as f:
            body = f.read()
        print(f"Sending test: {os.path.basename(filepath)}")
        t = threading.Thread(target=_send_captcha, args=(body, ADMIN_TOKEN, api_key), daemon=True)
        t.start()
        time.sleep(1)


def send_one_test_captcha(api_key=None, reservation_id=None, captcha_id=None):
    pattern = os.path.join(VALID_DIR, "*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        print(f"No test files found in {VALID_DIR}")
        return

    time.sleep(1)
    if captcha_id:
        filepath = os.path.join(VALID_DIR, f"{captcha_id}.json")
        if not os.path.exists(filepath):
            print(f"Test file not found: {filepath}")
            return
    else:
        filepath = random.choice(files)
    with open(filepath) as f:
        body = f.read()
    print(f"Sending single test: {os.path.basename(filepath)}")
    _send_captcha_with_reservation(body, ADMIN_TOKEN, api_key, reservation_id)


def _send_captcha_with_reservation(body, admin_token, api_key=None, reservation_id=None):
    try:
        if api_key is None:
            from src.constants import get_test_api_key

            api_key = get_test_api_key()

        data = json.loads(body)
        data["api_key"] = api_key
        data["reservation_id"] = reservation_id or "unknown"
        wrapped_body = json.dumps(data)
        _http_post(
            path="/solve-captcha",
            body=wrapped_body,
            extra_headers={"X-Admin-Token": admin_token},
        )
    except Exception as e:
        print(f"Error sending test captcha: {e}")


def get_test_stats() -> dict:
    labeled = (
        len([f for f in os.listdir(VALID_DIR) if f.endswith(".json")])
        if os.path.isdir(VALID_DIR)
        else 0
    )
    unlabeled = (
        len([f for f in os.listdir(NO_VALID_DIR) if f.endswith(".json")])
        if os.path.isdir(NO_VALID_DIR)
        else 0
    )
    return {"labeled_count": labeled, "unlabeled_count": unlabeled}
