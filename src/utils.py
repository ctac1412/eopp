"""EOPP Captcha Solver - Shared state."""

import threading

result_counter = 0
counter_lock = threading.Lock()
source_files = {}
