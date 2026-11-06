# CRM by mac — Cloudflare + Neon

Esta pasta foi adaptada para publicar o CRM no Worker `crm-by-mac` sem alterar os caminhos de API usados pelo frontend.

## Segredos de produção
Configure no Worker, como Secret:
- `DATABASE_URL`
- `PASSWORD_PEPPER`

Opcionais, conforme os recursos ativados:
- `OPENAI_API_KEY`
- `DOCUMENT_EXTRACT_MODEL`
- `DOCUMENT_EXTRACT_URL`
- `DOCUMENT_EXTRACT_TOKEN`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## Publicação
1. `npm install`
2. `npm run deploy`

O `wrangler.jsonc` publica `public/index.html` + `public/assets` e encaminha `/.netlify/functions/*` ao Worker, preservando compatibilidade com a interface existente.

## Banco
O CRM continua usando PostgreSQL/Neon por `DATABASE_URL`. Antes do uso comercial, confirme que as migrations 001 a 011 foram aplicadas no banco de produção.
