import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { useInjectorStore } from '@/store';
import type { InjectorConfig, PageInfo } from '@/types';
import { shouldInject, createDefaultConfig, getDefaultSlotDate, loadSavedConfig } from '@/constants';
import cssContent from '@/content.css?inline';

function injectButton(info: PageInfo): void {
  const btn = document.createElement('button');
  btn.textContent = 'Инжектор';
  btn.className = 'custom-plugin-btn';

  btn.addEventListener('click', async () => {
    const actualInfo = shouldInject(window.location.href);
    if (!actualInfo) {
      alert('Не та страница');
      return;
    }

    let params: { facilityId: string; vehicleId: string; transportType: 1 | 2 };

    if (actualInfo.isLocalhost) {
      params = {
        facilityId: '1dae5b1c-e2b3-44a4-848f-df8ce2ddde42',
        vehicleId: 'test-vehicle-id',
        transportType: 1,
      };
    } else {
      const apiResponse = await fetch(
        `https://eopp.epd-portal.ru/reservations-api/v1/${actualInfo.reservationId}`,
        {
          credentials: 'include',
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'ru,en;q=0.9',
            FacilityMode: 'false',
          },
          method: 'GET',
          mode: 'cors',
        }
      );
      const json = await apiResponse.json();
      params = {
        facilityId: json.facilityId,
        vehicleId: json.vehicleData[0].vehicleId,
        transportType: 1,
      };
    }

    const savedApiKey = localStorage.getItem('injector_api_key') || '';

    const mode: 'reschedule' | 'create' = actualInfo.pageType === 'edit' ? 'create' : 'reschedule';

    const defaultConfig: InjectorConfig = createDefaultConfig(
      actualInfo.reservationId,
      params.facilityId,
      params.vehicleId,
      params.transportType,
      mode
    );
    const savedConfig = loadSavedConfig(actualInfo.reservationId);
    if (savedConfig) {
      Object.assign(defaultConfig, savedConfig);
    }
    defaultConfig.mode = mode;
    defaultConfig.apiKey = savedApiKey;

    useInjectorStore.setState({ config: defaultConfig });

    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);

    const style = document.createElement('style');
    style.textContent = cssContent;
    shadow.appendChild(style);

    const container = document.createElement('div');
    shadow.appendChild(container);

    const root = createRoot(container);
    root.render(<App onClose={() => { root.unmount(); host.remove(); }} />);
  });

  if (info.isLocalhost) {
    document.body.appendChild(btn);
  } else {
    const selector =
      'body > app-root > div > div.page-wrapper.zit-scrollbar > app-reservations-list-page > div > form > div.page-controls';

    const waitForContainer = (): boolean => {
      const container = document.querySelector(selector);
      if (container) {
        container.appendChild(btn);
        return true;
      }
      return false;
    };

    if (!waitForContainer()) {
      const observer = new MutationObserver(() => {
        if (waitForContainer()) {
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
}

const info = shouldInject(window.location.href);
if (info) {
  injectButton(info);
}
