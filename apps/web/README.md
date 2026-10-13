# PayFlow Web

Frontend do dashboard PayFlow, construído com React, TypeScript e Vite.

## Desenvolvimento

Na raiz do monorepo, instale as dependências e inicie a API, o worker e a infraestrutura local conforme as instruções do [README principal](../../README.md). Em outro terminal, execute:

```sh
npm run dev:web
```

O dashboard usa `http://localhost:3000` como endereço padrão da API. Para alterar esse endereço, defina `VITE_API_URL` antes de iniciar o Vite.

## Escopo atual

O MVP oferece cadastro/login, renovação automática da sessão, resumo dos pagamentos, atividade recente, busca e filtros por status. As consultas usam os endpoints autenticados da API, que limitam os resultados ao usuário atual. A criação de contas e pagamentos não faz parte desta primeira interface.

Valide o frontend com:

```sh
npm run build:web
npm -w apps/web run lint
```

Os tokens ficam em `sessionStorage` nesta versão de desenvolvimento. Antes de publicar em produção, substitua esse fluxo por cookies `HttpOnly`, `Secure` e `SameSite`, ou por um backend-for-frontend, e aplique as proteções contra XSS correspondentes.
