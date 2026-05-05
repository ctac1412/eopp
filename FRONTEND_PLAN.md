### Уточнённый план

#### 1. Таблица ключей (AdminPage.jsx)
- [ ] Колонка "Comment" — просто текст
- [ ] Колонка "Тариф" с подколонками "Запись" и "Бронь" — цены или "—"

#### 2. Модалка редактирования ключа
- [ ] editForm: добавить comment
- [ ] Секция "Тариф": inputs для price_create (Запись), price_reschedule (Бронь)
- [ ] При открытии → GET `/admin/tariffs/{api_key_id}`
- [ ] При сохранении → PUT `/admin/tariffs/{api_key_id}` (создаст или обновит)

#### 3. Usage History (UsageHistory.jsx)
- [ ] Колонки "Цена", "Оплачен"
- [ ] Клик по строке → модалка редактирования
- [ ] PATCH `/admin/usage-log/{id}` — price/paid
- [ ] Чекбоксы для выбора → генерация счёта

#### 4. Модалка "Withdrawals"
- [ ] Кнопка в header → открыть модалку
- [ ] Таблица получателей
- [ ] CRU: GET/POST/PUT `/admin/withdrawals`

#### 5. Генерация счёта
- [ ] Выбрать логи → "Счёт"
- [ ] Выбрать получателя (dropdown)
- [ ] POST `/admin/generate-invoice` → скачать PDF