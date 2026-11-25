# Прокси для AI Juju

`api.aijuju.rest` рабочий, но отвечает браузеру с заголовком

```text
Access-Control-Allow-Origin: https://aijuju.rest
```

Поэтому PWA на `https://bodyamafanya.github.io` не может обратиться к нему напрямую:
браузер блокирует ответ по CORS. Этот Worker решает проблему: PWA обращается к Worker,
Worker обращается к AI Juju с сервера.

```text
PWA -> Cloudflare Worker -> https://api.aijuju.rest/v1/...
```

В Worker лежит настоящий ключ AI Juju. В приложении хранится только отдельный токен
прокси. Если токен утечёт, его можно сменить, не меняя ключ провайдера.

---

## Что понадобится

- Бесплатный аккаунт Cloudflare.
- Ключ AI Juju, который вы получили.
- Придуманный длинный токен прокси, например 40 случайных символов. Его можно
  сгенерировать командой:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
```

---

## Развёртывание через сайт Cloudflare (проще)

1. Откройте `https://dash.cloudflare.com/` и войдите.
2. Слева выберите **Workers & Pages** → **Create** → **Worker**.
3. Назовите Worker, например `clinica-chat-proxy`.
4. Вставьте код из `worker.mjs` вместо примера.
5. Нажмите **Deploy**.
6. Откройте **Settings** → **Variables and Secrets** и добавьте два секрета:
   - `UPSTREAM_KEY` — ключ AI Juju;
   - `PROXY_TOKEN` — придуманный токен прокси.
7. Сохраните и выполните **Deploy** ещё раз.
8. Скопируйте адрес Worker, например
   `https://clinica-chat-proxy.ваш-аккаунт.workers.dev`.

---

## Развёртывание через Wrangler (для разработчика)

```bash
npm install -g wrangler
wrangler login
cd worker
wrangler deploy
wrangler secret put UPSTREAM_KEY
wrangler secret put PROXY_TOKEN
```

`wrangler secret put` попросит вставить значение. Ключ не попадёт в файлы проекта.

---

## Настройки в приложении

Откройте PWA → **Настройки**:

| Поле | Значение |
|---|---|
| Провайдер | AI Juju |
| Адрес API | подставляется автоматически (`https://clinica-chat-proxy.ваш-аккаунт.workers.dev/v1`) |
| Ключ API | `PROXY_TOKEN`, который вы придумали |
| Модель | `deepseek-v4.1-flash-1017` |
| Модель для фото | `gemini-3.8-flash` |

Нажмите **Проверить подключение**. Должен появиться список моделей AI Juju.
Затем **Сохранить**.

Если профиля «AI Juju» нет, выберите «Свой адрес» и заполните поля вручную.

Модели, которые отдаёт AI Juju на момент проверки:

```text
claude-fable-5, claude-opus-4-7, claude-opus-4-8, claude-opus-5,
claude-sonnet-5, claude-sonnet-5-5, deepseek-v4.1-flash-1017,
gemini-3.8-flash, gemini-4-argon, glm-5.3-flash, gpt-6-astra,
gpt-6-luna, gpt-6-sol, gpt-6.1-sol, grok-4.5, grok-4.6,
grok-4.7, kimi-k3, qwen3.8-flash
```

Если фото не отправляется, поставьте в «Модель для фото» `gemini-3.8-flash`.
Для текстовой модели `deepseek-v4.1-flash-1017` фото описывается отдельной
vision-моделью.

---

## Проверка через curl

```bash
curl https://clinica-chat-proxy.ваш-аккаунт.workers.dev/v1/models \
  -H "Authorization: Bearer PROXY_TOKEN"

curl https://clinica-chat-proxy.ваш-аккаунт.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-fable-5","messages":[{"role":"user","content":"ping"}],"max_tokens":20}'
```

---

## Безопасность

- Не вставляйте ключ AI Juju в PWA и не коммитьте его в GitHub. Он лежит только в
  секрете `UPSTREAM_KEY` Cloudflare.
- `PROXY_TOKEN` тоже держите в секрете. Это пароль к вашему Worker.
- Ключ, который был отправлен в чат, лучше перевыпустить у AI Juju. После перевыпуска
  замените `UPSTREAM_KEY` в Cloudflare.
- Worker разрешает браузерные запросы только с `https://bodyamafanya.github.io`,
  `http://localhost:5173` и `http://localhost:4173`. Если откроете PWA на другом
  домене, добавьте его в `ALLOWED_ORIGINS`.
- Проверьте условия AI Juju: сторонний прокси может быть запрещён правилами сервиса.
  Worker не обходит оплату и не подменяет ключ, но использует API с сервера.

---

## Ограничения

- Worker не хранит историю и не логирует запросы.
- Файлы и фото обрабатываются в браузере, в Worker уходит уже готовый JSON.
- Бесплатный тариф Cloudflare имеет дневной лимит запросов. Для личного чата его
  хватает.
