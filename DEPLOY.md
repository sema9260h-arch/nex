# Деплой Nexus на бесплатный домен Render

## Бесплатный адрес

После деплоя Render выдаст бесплатный адрес вида:

```text
https://nexus-b2b.onrender.com
```

Это не покупной домен, а бесплатный поддомен Render. Собственный домен вроде `nexus.kz` подключается отдельно после покупки домена.

## Настройки Render

Тип сервиса: `Web Service`.

Важно: не используйте `Static Site` для этой версии. Сайт использует `server.js` для API авторизации, партнёрских цен, остатков, заявок и Ncoin. Если загрузить проект как Static Site и включить SPA fallback, Render может отдавать HTML вместо `/app.js`, из-за чего появится ошибка `SyntaxError: Unexpected token '<'`.

Build Command:

```text
npm install
```

Start Command:

```text
node server.js
```

Environment Variables:

```text
NODE_ENV=production
ADMIN_PASSWORD=<ваш пароль админа>
PARTNER_PASSWORD=<пароль демо-партнёра>
```

## Проверка после деплоя

```bash
curl -I https://nex-qdqs.onrender.com/app.js
curl -I https://nex-qdqs.onrender.com/data/products.js
curl -I https://nex-qdqs.onrender.com/not-found.js
```

Ожидаемо:

- `/app.js` — `200` и `content-type: application/javascript`
- `/data/products.js` — `200`
- отсутствующий файл — `404`, а не HTML-страница
- в DevTools Console нет `Unexpected token '<'`

## Тестовые аккаунты после деплоя

Админ:

```text
admin@nexus.kz
ADMIN_PASSWORD из Render
```

Партнёр:

```text
partner@nexus.kz
PARTNER_PASSWORD из Render
```

## Важно

На бесплатном Render файловая система временная. Заявки, новые партнёры и операции Ncoin, записанные в JSON, могут сбрасываться после перезапуска или редеплоя. Для боевого запуска нужна база данных, например PostgreSQL.
