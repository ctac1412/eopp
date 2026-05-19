# EOPP Browser Extension — AGENTS.md

## Версионирование

**Версия задаётся ТОЛЬКО в `vite.config.ts` (строка `version: "x.y.z"`).**

- `dist/manifest.json` генерируется автоматически при билде — НЕ редактируй его вручную.
- При каждом изменении кода расширения поднимай версию в `vite.config.ts`.
- После изменения версии запусти `npm run build` — manifest.json в dist обновится сам.

## Релиз плагина

Точный порядок действий для выпуска новой версии:

1. **Поднять версию** в `vite.config.ts` (строка `version: "x.y.z"`)
2. **Собрать CRX** — `make build-crx`
   - Собирает extension, упаковывает в CRX, обновляет `plugins/update.xml`
3. **Запушить в прод** — `make deploy-push-plugins`
   - Пушит `plugins/` на сервер, обновляет контейнер

## Сборка

```bash
cd yandex-browser-plugin
npm run build          # production
DEV_BUILD=true npm run build  # dev (без минификации, с sourcemap)
```

## Структура

| Файл | Назначение |
|------|-----------|
| `vite.config.ts` | Билд-конфиг + генерация manifest.json |
| `src/index.tsx` | Entry point content script |
| `src/App.tsx` | Главный компонент модалки |
| `background.js` | Service worker (MV3), прокси к серверу |
| `src/api/pipeline.ts` | 5-стадийный pipeline |
| `src/store.ts` | Zustand store |
| `src/constants.ts` | Константы, дефолтные конфиги |
| `src/types.ts` | TypeScript типы |
