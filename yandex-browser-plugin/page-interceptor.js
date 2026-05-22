(() => {
  const SOURCE = "eopp-helper-page-interceptor";
  const INSTALLED_KEY = "__EOPP_HELPER_INTERCEPTOR_INSTALLED__";

  if (window[INSTALLED_KEY]) {
    return;
  }
  window[INSTALLED_KEY] = true;

  function parseTrackedUrl(rawUrl) {
    let url;
    try {
      url = new URL(String(rawUrl), window.location.origin);
    } catch {
      return null;
    }

    const reservationMatch = url.pathname.match(
      /^\/reservations-api\/v1\/([a-f0-9-]{36})$/i,
    );
    if (reservationMatch) {
      return { kind: "reservationRaw", id: reservationMatch[1] };
    }

    const facilityMatch = url.pathname.match(
      /^\/facility\/Facility\/get-facility\/([a-f0-9-]{36})$/i,
    );
    if (facilityMatch) {
      return { kind: "facilityRaw", id: facilityMatch[1] };
    }

    return null;
  }

  function publish(tracked, payload) {
    window.postMessage(
      {
        source: SOURCE,
        kind: tracked.kind,
        id: tracked.id,
        payload,
      },
      window.location.origin,
    );
  }

  function captureResponse(rawUrl, response) {
    const tracked = parseTrackedUrl(rawUrl);
    if (!tracked || !response || !response.ok) return;

    response
      .clone()
      .json()
      .then((payload) => publish(tracked, payload))
      .catch((error) => {
        console.warn("[EOPP Interceptor] failed to parse fetch response", {
          url: String(rawUrl),
          error,
        });
      });
  }

  const originalFetch = window.fetch;
  window.fetch = async function eoppHelperFetch(input, init) {
    const response = await originalFetch.apply(this, arguments);
    const rawUrl =
      typeof input === "string" || input instanceof URL ? input : input?.url;
    captureResponse(rawUrl, response);
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function eoppHelperOpen(method, url) {
    this.__eoppHelperUrl = url;
    this.__eoppHelperMethod = method;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function eoppHelperSend() {
    this.addEventListener("loadend", () => {
      const tracked = parseTrackedUrl(this.__eoppHelperUrl);
      if (!tracked || this.status < 200 || this.status >= 300) return;
      if (this.responseType && this.responseType !== "text") return;

      try {
        publish(tracked, JSON.parse(this.responseText));
      } catch (error) {
        console.warn("[EOPP Interceptor] failed to parse xhr response", {
          url: String(this.__eoppHelperUrl),
          error,
        });
      }
    });

    return originalSend.apply(this, arguments);
  };
})();
