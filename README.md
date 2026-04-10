# Syncro Event Desk

Plataforma de gestão de eventos com fluxo por tiers e espelhamento do Google Calendar por `calendarId`.

## O que está implementado

- Login local (JWT) e login Google reativado na tela inicial.
- Gestão de usuários na aba Admin:
  - criação de usuários locais,
  - usuários locais e Google na mesma lista,
  - alteração de tier (`admin`, `supervisor`, `coordenador`),
  - ativação/desativação de contas.
- Fluxo de escopo:
  - `coordenador`: cria evento pendente para aprovação.
  - `supervisor` e `admin`: criam/alteram/excluem diretamente com sincronização no Google Calendar.
  - aprovação de pendentes publica no Google Calendar.
- Aba de agenda espelhada:
  - lista eventos do Google Calendar configurado por ID,
  - mostra vínculo com eventos internos quando existir,
  - permite abrir no Google Calendar.

## Stack

- Frontend: React + Vite + TypeScript + shadcn/ui
- Backend: Node.js + Express + TypeScript
- Banco: MySQL 8
- Auth: JWT + Google Identity token (validado no backend)

## Requisitos

- Node.js 18+
- npm 9+
- Docker + Docker Compose

## Instalação rápida

1. Copie o ambiente:

```bash
cp .env.example .env
```

Defina no `.env` um `ADMIN_EMAIL` valido e `ADMIN_PASSWORD` forte antes de iniciar a API pela primeira vez.

2. Suba o banco:

```bash
docker-compose up -d
```

3. Instale dependências:

```bash
npm install
```

4. Rode backend:

```bash
npm run dev:server
```

5. Em outro terminal, rode frontend:

```bash
npm run dev:client
```

6. Acesse:
- Frontend: `http://localhost:8080`
- API health: `http://localhost:3001/health`

## Variáveis importantes

### Frontend

- `VITE_API_URL`
- `VITE_GOOGLE_CLIENT_ID`

### Backend

- `PORT`
- `CORS_ORIGIN`
- `JWT_SECRET`
- `AUTH_RATE_LIMIT_MAX_ATTEMPTS`
- `AUTH_RATE_LIMIT_WINDOW_MS`

### Admin inicial

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`

> Seguranca: `ADMIN_PASSWORD` agora precisa ter no minimo 12 caracteres com maiuscula, minuscula, numero e simbolo.
> O projeto nao cria mais usuario admin padrao no `init.sql`; o bootstrap do admin depende dessas variaveis no `.env`.

### Google Login

- `GOOGLE_CLIENT_ID`
- `GOOGLE_ALLOWED_EMAIL_DOMAINS` (opcional, lista separada por virgula)
- `GOOGLE_ALLOWED_EMAILS` (opcional, lista separada por virgula)

### Google Calendar (espelhamento e sincronização)

- `GOOGLE_CALENDAR_AUTH_MODE` (`service_account` ou `oauth_user`)
- `GOOGLE_CALENDAR_ACCOUNT_EMAIL`
- `GOOGLE_CALENDAR_APP_PASSWORD` (referência operacional; não é usada diretamente pela API)
- `GOOGLE_CALENDAR_USER_REFRESH_TOKEN` (necessário quando `GOOGLE_CALENDAR_AUTH_MODE=oauth_user`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_DELEGATED_USER_EMAIL`
- `GOOGLE_CALENDAR_SEND_UPDATES` (`all`, `externalOnly`, `none`)
- `GOOGLE_ALLOW_EVENT_WITHOUT_ATTENDEES_FALLBACK` (`false` recomendado)
- `GOOGLE_CALENDAR_ID` (fallback)
- `GOOGLE_CALENDAR_TIMEZONE`

> Também é possível definir/alterar o `calendarId` direto na aba Admin da aplicação (persistido no banco em `app_settings`).

### Convidados no Google Calendar

Para convidados funcionarem com conta de servico:

1. O calendario precisa estar em Google Workspace.
2. Ative Domain-wide delegation na Service Account no Google Cloud.
3. Em `admin.google.com`, autorize o Client ID da Service Account com o escopo `https://www.googleapis.com/auth/calendar`.
4. Defina `GOOGLE_DELEGATED_USER_EMAIL` com um usuario do dominio que tenha permissao de edicao no calendario.
5. Reinicie a API.

Sem isso, o Google costuma bloquear attendees com erro de permissao.

### Modo oauth_user (sem delegação de domínio)

Se você não puder configurar Domain-wide delegation agora, use:

1. `GOOGLE_CALENDAR_AUTH_MODE=oauth_user`
2. `GOOGLE_CALENDAR_ACCOUNT_EMAIL=<conta_google_que_vai_editar_o_calendario>`
3. `GOOGLE_CALENDAR_USER_REFRESH_TOKEN=<refresh_token_oauth_dessa_conta>`

Com esse modo, os eventos são publicados como essa conta Google e os convidados funcionam, desde que a conta tenha permissão de edição no calendário.

## Scripts

- `npm run dev` (frontend)
- `npm run dev:client`
- `npm run dev:server`
- `npm run build`
- `npm run lint`

## Banco de dados

O `init.sql` cria:

- `users`
- `events`
- `app_settings`

Se precisar recriar tudo:

```bash
docker-compose down -v
docker-compose up -d
```
