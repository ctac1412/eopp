# Ant Design System Integration Prompt

```text
Поставь цель: спроектировать и внедрить Ant Design дизайн-систему для фронтенда EOPP.

Работай в D:/Projects/eopp.

Контекст:
В проекте есть React frontend в D:/Projects/eopp/frontend и browser extension в D:/Projects/eopp/extension.
Мне нужна единая, стабильная, операционная UI-система:
- общая сетка страниц;
- стабильные layout templates;
- читаемые таблицы;
- общий дизайн графиков;
- единый стиль кнопок, фильтров, форм, статусов;
- responsive операторская страница под мобильные устройства;
- меньше скачущих layout-ов;
- чтобы LLM и разработчики больше не верстали каждую страницу с нуля.

Главная боль:
layout-ы постоянно скачут, нет схем для разметки страниц, таблицы/панели/кнопки выглядят разрозненно.

Используй Ant Design как основную UI-библиотеку.
Рассмотри Ant Design Pro Components, если они полезны для layout/table/admin patterns.
Не внедряй всё вслепую: сначала проведи discovery и предложи варианты.

Обязательный порядок работы:

1. Оценка состояния
- Проверь git status.
- Изучи текущую структуру frontend:
  - package.json
  - src/App.*
  - страницы
  - компоненты
  - текущие CSS/стили
  - админку
  - captcha UI
  - operator UI, если есть
- Определи, какие UI-паттерны уже существуют.
- Найди места, где layout нестабилен или сделан ad-hoc.

2. Интерактивное уточнение
Перед внедрением задай мне вопросы блоками, не все сразу.

Блок 1: продуктовые поверхности
Спроси:
- какие страницы самые важные: админка, операторы, капчи, финансы, аудит, плагины?
- какие страницы должны хорошо работать на мобильном?
- где нужна высокая плотность данных, а где можно больше воздуха?

Блок 2: стиль и плотность
Спроси:
- интерфейс должен быть плотный как CRM/админка или более свободный?
- нужен ли dark mode?
- какие цвета/статусы критичны?
- что важнее: максимум данных на экран или спокойная читаемость?

Блок 3: layout patterns
Спроси, какие шаблоны нужны:
- ListPage: фильтры + таблица + actions;
- DetailPage: summary + tabs + side actions;
- DashboardPage: KPI + графики + таблицы;
- WorkbenchPage: операторский рабочий экран;
- SettingsPage: секции формы;
- SplitPage: список слева, детали справа.

Блок 4: operator mobile
Спроси:
- что оператор должен делать на телефоне?
- какие действия должны быть доступны одним пальцем?
- какие панели можно скрывать/сворачивать?
- какие данные должны быть видны всегда?

3. Предложи дизайн-решение
После вопросов предложи 2-3 подхода:

Подход A: Ant Design only
- antd Layout, Grid, Table, Form, Button, Tag, Card, Drawer, Modal, Tabs, Statistic.

Подход B: Ant Design + Pro Components
- ProLayout/PageContainer/ProTable для админки и CRUD.

Подход C: Ant Design base + custom EOPP layouts
- свой слой Page templates поверх antd, без сильной зависимости от Pro Components.

Для каждого подхода дай:
- плюсы;
- минусы;
- риски;
- как это решает скачущие layout-ы;
- как это повлияет на скорость разработки.

Дай рекомендацию.

4. Сначала создай дизайн-правила
До массового рефактора создай документ:

D:/Projects/eopp/docs/frontend-design-system.md

В нём должны быть:
- цели дизайн-системы;
- базовые layout templates;
- responsive правила;
- правила таблиц;
- правила форм;
- правила кнопок;
- правила статусов;
- правила графиков;
- правила spacing;
- правила карточек/панелей;
- правила мобильной операторской страницы;
- anti-patterns: что больше нельзя делать;
- примеры Mermaid/ASCII схем layout-ов.

5. Создай UI foundation
После утверждения правил внедри базовый слой:

frontend/src/ui/
  layouts/
    AppShell.jsx
    Page.jsx
    ListPage.jsx
    DetailPage.jsx
    DashboardPage.jsx
    WorkbenchPage.jsx
    SettingsPage.jsx
    SplitPage.jsx
  components/
    PageHeader.jsx
    Toolbar.jsx
    FilterBar.jsx
    DataTable.jsx
    StatusTag.jsx
    MetricCard.jsx
    ActionBar.jsx
    EmptyState.jsx
    ConfirmAction.jsx
  charts/
    ChartCard.jsx
    chartTheme.js
  theme/
    antdTheme.js
    tokens.js
  styles/
    layout.css

Правило:
Ни одна новая страница не верстает layout с нуля. Она выбирает один из Page templates.

6. Внедри Ant Design аккуратно
- Установи antd и нужные зависимости.
- Подключи ConfigProvider.
- Создай theme tokens.
- Не смешивай старые стили хаотично.
- Сначала мигрируй 1-2 ключевые страницы как пилот:
  - AdminPage или главная админка;
  - operator/workbench страница или ближайший аналог.
- Не переписывай весь фронт сразу без проверки.

7. Таблицы
Сделай единый DataTable pattern:
- sticky header, если уместно;
- понятные empty/loading/error states;
- density modes: compact/standard;
- колонкам задать minWidth/ellipsis;
- actions в правой колонке;
- фильтры сверху в FilterBar;
- bulk actions, если нужны;
- pagination в одном стиле.

8. Графики
Сделай общий chart style:
- единые цвета;
- единые подписи;
- единые empty/loading states;
- не использовать случайные палитры;
- график всегда в ChartCard;
- легенды и tooltip читаемые.

Если в проекте нет chart library, предложи вариант:
- Ant Design Charts;
- Recharts;
- ECharts.

Сначала спроси, какой выбрать, если выбор влияет на зависимости.

9. Responsive operator page
Сделай отдельный WorkbenchPage pattern:
Desktop:
- left/main/right или main/right layout;
- постоянный статус подключения;
- очередь/операторы/чат/капча без скачков.

Mobile:
- single-column;
- нижняя панель действий;
- важный статус sticky сверху;
- второстепенные панели через Drawer/Tabs;
- кнопки достаточно крупные для пальца;
- no horizontal overflow.

Проверь через Playwright/browser screenshots desktop + mobile.

10. Проверка
После внедрения:
- запусти frontend build;
- если есть тесты, запусти;
- открой локально в браузере;
- проверь desktop и mobile viewport;
- проверь, что тексты не вылезают;
- проверь, что layout не скачет при loading/error/empty states.

11. Коммиты
Сделай отдельные commits:
- design-system docs;
- Ant Design foundation;
- first migrated page;
- operator responsive page;
- cleanup old styles.

Не делай один огромный коммит, если работа большая.

Ограничения:
- Не ломай backend.
- Не меняй browser extension, если задача касается только frontend, но оцени, нужна ли туда отдельная дизайн-система позже.
- Не создавай landing page.
- Не делай декоративный маркетинговый UI.
- Интерфейс должен быть рабочий, плотный, спокойный, понятный для повторного ежедневного использования.
- Карточки не вкладывать в карточки.
- Не использовать случайные градиенты/орбы/декоративные фоны.
- Не масштабировать font-size от viewport width.
- Использовать стабильные размеры и constraints, чтобы элементы не прыгали.

Финальный результат:
- документ docs/frontend-design-system.md;
- Ant Design подключён;
- есть общий AppShell и Page templates;
- минимум 1-2 страницы мигрированы;
- операторская страница или WorkbenchPage responsive pattern готов;
- build проходит;
- есть summary, screenshots/проверка и список следующих страниц для миграции.
```

## Short Launcher

```text
Используй промпт из файла:
D:/Projects/eopp/docs/prompts/ant-design-system-integration.md

Начни с discovery и вопросов, не внедряй Ant Design до утверждения подхода.
```
