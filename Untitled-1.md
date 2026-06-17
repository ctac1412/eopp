Вот промпт для нового чата:

```text
Работаем в D:\Projects\eopp.

Нужно внедрить оптимизацию синхронного расчета top3 для captcha hot path.

Контекст:
- Top3 считать нужно обязательно.
- В локальных и продовых нагрузочных тестах top3 считался синхронно:
  PEAK_FAST_MODE=False
  CAPTCHA_SYNC_SOLVER_METADATA_ENABLED=True
- Если solver_top3 уже есть в captcha payload, top3 почти бесплатный: ~0ms.
- Если solver_top3 нет, backend вызывает get_top3_from_solver -> solve_captcha до new_captcha.
- Локальный изоляционный бенч на server/data/captcha_examples/all/0c4ed839503f2776.json показал:
  cached top3: ~0ms
  cold compute: ~1430ms
  warm compute: ~170-220ms на 1 капчу
  15 compute через ThreadPool N: ~3594ms wall
  15 compute через ThreadPool 4: ~2909ms wall
  15 compute через cold ProcessPool 4: ~3259ms wall
  15 compute через persistent warmed ProcessPool 4: ~998ms wall
- Значит to_thread/ThreadPool почти не решает CPU-bound solver, а persistent ProcessPoolExecutor(max_workers=4) использует 4 ядра и дает примерно 3.5x на локальной машине.
- Важно: process pool нельзя создавать на каждый запрос. Нужен долгоживущий пул, стартующий при app startup, с warmup.

Требование:
1. Внедрить долгоживущий process pool для CPU-bound top3/solver.
2. Использовать его только когда top3 надо реально считать, то есть когда solver_top3/solver_results нет в payload.
3. Если solver_top3 уже есть, оставить быстрый синхронный путь без process pool.
4. Не ломать Protected Core:
   - server/src/core/* не должен импортировать FastAPI, DB repos, billing, CRM, routes и т.п.
   - зависимости прокидывать через contracts/dependencies.
5. Не убирать обязательный top3.
6. Не делать временный “metadata disabled” обход.
7. Добавить/обновить тесты на поведение:
   - cached solver_top3 не уходит в process pool;
   - missing solver_top3 вызывает async/process-backed compute;
   - new_captcha получает top3;
   - fallback при ошибке solver не валит captcha flow.

Где смотреть:
- server/src/core/captcha_runtime/runtime.py
  Сейчас там _top3(data, captcha_id) вызывает dependencies.get_top3(data).
- server/src/routes/captcha.py
  Там собираются CaptchaRuntimeDependencies.
- server/src/captcha_assembly.py
  get_top3_from_solver(data) сначала читает solver_top3/solver_results, иначе вызывает solve_captcha(data).
- server/captcha_solver.py
  solve_captcha(data) verbose wrapper; для process worker лучше использовать внутренние функции без лишнего stdout:
    build_captcha_context
    classify_captcha
    solve_prepared_captcha(..., verbose=False)
    top_variants
- server/src/captcha_solver_engine/*
  actual CPU-bound solver.

Ожидаемый дизайн:
- Создать небольшой backend service, например server/src/services/top3_service.py или похожее место вне core.
- В нем:
  - cheap_get_top3_from_metadata(data) для готового solver_top3/solver_results;
  - compute_top3_cpu(data) top-level function, pickle-safe for ProcessPoolExecutor;
  - Top3ProcessPool class/service with startup(), shutdown(), compute(data).
- ProcessPoolExecutor должен быть persistent, max_workers по env:
  EOPP_TOP3_PROCESS_WORKERS, default 4 или min(4, os.cpu_count()).
- На startup приложения прогреть пул несколькими lightweight задачами/import warmup.
- На shutdown корректно закрывать пул.
- В route dependencies передать async/sync callable так, чтобы runtime мог await если нужно.
  В runtime уже есть async flow, можно сделать _top3 async или отдельный dependency returning awaitable.
- Не блокировать event loop CPU расчетом.
- Если process pool недоступен/упал, fallback должен быть понятным:
  либо синхронный расчет с логом warning,
  либо empty top3 только при exception, но captcha flow не падает.

Локальная проверка:
1. Запустить unit/focused tests:
   uv run pytest tests/test_core_captcha_runtime.py tests/test_captcha_display_payload.py server/tests/test_api_routes.py -q
   uv run lint-imports
2. Запустить локальный prod-run:
   make run-prod-restart
   Проверить /api/version на http://127.0.0.1:8766/api/version.
3. Провести локальную лесенку 1..15.
   Важно:
   - Не мерить inline solve внутри SSE reader. SSE reader должен только ждать new_captcha.
   - Для каждого N открыть SSE соединение заранее.
   - Потом параллельно отправить N POST /api/solve-captcha или /api/trigger-test так же, как предыдущие тесты.
   - Мерить:
     wall_ms от старта POST до получения всех new_captcha;
     per-captcha display_ms если есть в logs/metrics;
     min, p50, p95, max времени получения new_captcha;
     post_avg;
     payload: images=0, tiles=9, variants=15.
   - Отдельно проверить, что top3 в new_captcha непустой.
   - Сравнивать с baseline:
     local до оптимизации примерно:
       N=1 wall ~30ms если top3 cached, но для compute payload ~180-220ms
       N=8 full flow было около ~564ms на смешанном тесте
       isolated top3 N=15 ThreadPool/processless ~3.6s
       isolated top3 N=15 persistent process pool ~1.0s
   - Для честного CPU теста нужен payload без solver_top3/solver_results, иначе будет 0ms и оптимизация не видна.
     Использовать server/data/captcha_examples/all/0c4ed839503f2776.json, удалить из копии:
       solver_top3
       solver_results
       solver_valid_rank
     и гонять именно его.
4. Желательно добавить отдельный скрипт/команду для лестницы, чтобы одинаково запускать локально и на проде.

Продовая проверка:
1. Сначала задеплоить релиз штатно по repo runbook.
2. Проверить релиз:
   make deploy-verify
   или scripts/deploy/verify-release.ps1 с текущим release id.
3. Проверить фактический режим в контейнере:
   docker compose exec -T eopp-prod python -c "from src.constants import PEAK_FAST_MODE, CAPTCHA_SYNC_SOLVER_METADATA_ENABLED; print(PEAK_FAST_MODE, CAPTCHA_SYNC_SOLVER_METADATA_ENABLED)"
   Нужно понимать, включен ли sync top3.
4. Запустить продовую лесенку внутри prod host/container loopback, а не с удаленной машины через интернет:
   - клиентский скрипт должен выполняться рядом с контейнером или внутри docker compose network/host;
   - endpoint локальный для prod host: http://127.0.0.1:8765 или внутренний service;
   - так исключаем сеть и браузер.
5. Методика продовой лесенки:
   - N от 1 до 15;
   - перед стартом N открыть SSE подписки;
   - параллельно отправить N captcha requests;
   - SSE reader только принимает new_captcha, НЕ вызывает /solve внутри чтения;
   - фиксировать:
     N
     wall_ms
     display_avg
     min
     p50
     p95
     max
     post_avg
     top3_present_count
     payload_kb
     images_count
     tiles_count
     variants_count
   - Повторить минимум 2-3 раза для N=8 и N=15, потому что есть cold/warm эффекты.
6. Сравнить с baseline prod до оптимизации:
   Продовая лесенка до:
     N | wall_ms | display_avg | p95 | max | post_avg
     1 | 47.9 | 46.7 | 46.7 | 46.7 | 78.2
     2 | 67.4 | 65.2 | 64.9 | 65.4 | 109.0
     3 | 472.9 | 469.6 | 469.6 | 472.2 | 527.1
     4 | 834.2 | 829.3 | 830.4 | 830.6 | 909.0
     5 | 864.3 | 856.7 | 859.3 | 860.1 | 956.8
     6 | 876.4 | 867.8 | 870.7 | 872.8 | 973.6
     7 | 897.7 | 883.4 | 887.2 | 892.4 | 1005.1
     8 | 928.5 | 917.1 | 922.2 | 924.8 | 1051.7
     9 | 1335.8 | 1323.2 | 1329.0 | 1330.8 | 1476.4
     10 | 1326.0 | 1309.6 | 1317.0 | 1320.3 | 1503.5
     11 | 1827.7 | 1770.4 | 1815.3 | 1820.9 | 2013.9
     12 | 2002.5 | 1976.5 | 1985.8 | 1991.8 | 2239.0
     13 | 2367.6 | 2338.1 | 2348.3 | 2352.8 | 2598.1
     14 | 3265.1 | 3123.5 | 3250.2 | 3252.7 | 3496.8
     15 | 2746.7 | 2714.8 | 2732.5 | 2734.3 | 2996.4
   Но важно: эту старую таблицу читать осторожно, потому что там per-captcha times выглядели как batch/barrier. Для новой проверки обязательно выводить min/p50/p95/max и не делать inline solve из SSE reader.
7. Убедиться, что top3 реально есть в SSE payload на проде после оптимизации.
8. Отдельно проверить cold start:
   - сразу после deploy первая капча может быть дороже из-за прогрева/import;
   - после warmup повтор N=8/N=15 должен быть быстрее.
   Если cold плохо, добавить startup warmup.

Финальный отчет нужен в формате:
- Что изменено.
- Какие tests прошли.
- Локальная матрица 1..15 до/после или baseline/current.
- Продовая матрица 1..15.
- Подтверждение, что top3 присутствует.
- Вывод: сколько сэкономили на N=8 и N=15.
```