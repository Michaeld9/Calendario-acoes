# Setup Rápido

Este arquivo mantém uma versão curta do onboarding.  
Para detalhes completos, consulte o [README](./README.md).

## 1) Ambiente

- Node.js 18+
- Docker + Docker Compose

## 2) Configurar variáveis

```bash
cp .env.example .env
```

## 3) Subir banco MySQL

```bash
docker-compose up -d
```

## 4) Instalar dependências

```bash
npm install
```

## 5) Rodar backend e frontend

Terminal 1:

```bash
npm run dev:server
```

Terminal 2:

```bash
npm run dev:client
```

## 6) Acessar aplicação

- Frontend: `http://localhost:8080`
- API: `http://localhost:3001`
- Healthcheck: `http://localhost:3001/health`
- Adminer: `http://localhost:8081`
