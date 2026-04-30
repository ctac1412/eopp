const CAPTCHA_SERVER = 'https://china.alabai.netcraze.pro';

chrome.runtime.onConnect.addListener((port) => {
  let responded = false;

  port.onMessage.addListener(async (msg) => {
    try {
      const res = await fetch(`${CAPTCHA_SERVER}/solve-captcha`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(msg.payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        port.postMessage({ ok: false, error: { status: res.status, body: errorText } });
      } else {
        const json = await res.json();
        port.postMessage({ ok: true, data: json });
      }
    } catch (err) {
      port.postMessage({ ok: false, error: { status: 0, body: err.message } });
    }
    responded = true;
    port.disconnect();
  });

  port.onDisconnect.addListener(() => {
    if (!responded) {
      console.warn('[background] Port disconnected before response');
    }
  });
});
