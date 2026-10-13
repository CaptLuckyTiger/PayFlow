# PayFlow

PayFlow é uma API backend de simulação de pagamentos, desenvolvida com NestJS, Prisma, PostgreSQL e Redis. A solução demonstra um fluxo de pagamento idempotente, uso de outbox transacional, processamento em fila e suporte a webhooks.

## Visão geral

A aplicação foi estruturada para modelar cenários reais de processamento financeiro com foco em confiabilidade, consistência e rastreabilidade. O projeto cobre autenticação, gestão de contas, criação e consulta de pagamentos, cancelamento de transações pendentes e entrega de eventos via webhook.

## Stack tecnológica

- React 19 + TypeScript + Vite (dashboard web)
- Node.js 24.9.0 ou superior
- TypeScript com strict mode
- NestJS 12
- PostgreSQL 16
- Prisma 5
- Redis 7
- BullMQ
- JWT + Argon2
- Swagger / OpenAPI
- Jest + Supertest

## Requisitos

- Node.js 24.9.0 ou superior
- Docker e Docker Compose
- PostgreSQL e Redis em containers locais
- Acesso a uma terminal para execução de scripts e migrações

## Início rápido

1. Instale as dependências com lockfile:

   ```sh
   npm ci
   ```

2. Copie o arquivo `.env.example` para `.env` e configure valores seguros para `JWT_SECRET` e `JWT_REFRESH_SECRET`. Recomenda-se gerar chaves com pelo menos 32 caracteres, por exemplo:

   ```sh
   openssl rand -base64 48
   ```

3. Inicie os serviços de infraestrutura:

   ```sh
   docker compose up -d postgres redis
   ```

4. Gere o Prisma Client e aplique as migrações versionadas:

   ```sh
   npm run db:generate
   npm run db:deploy
   ```

5. Inicie a API e o worker em terminais separados:

   ```sh
   npm run dev:api
   npm run dev:worker
   ```

6. Inicie o dashboard em outro terminal:

   ```sh
   npm run dev:web
   ```

   Abra o endereço local exibido pelo Vite (normalmente `http://localhost:5173`). O dashboard conecta à API em `http://localhost:3000`; configure `VITE_API_URL` se a API estiver em outro endereço. Você pode criar uma conta pela tela de acesso ou usar uma conta já cadastrada. O painel mostra apenas pagamentos pertencentes ao usuário autenticado.

O dashboard atual é um MVP para ambiente de simulação: inclui cadastro/login, resumo de pagamentos, atividade recente e busca/filtros. Os tokens de autenticação ficam em `sessionStorage` e são descartados ao encerrar a sessão da aba; para produção, substitua esse mecanismo por cookies `HttpOnly`, `Secure` e `SameSite` e proteja a aplicação contra XSS.

O PostgreSQL do Compose fica disponível em `127.0.0.1:5433` para evitar conflitos com uma instância local já exposta na porta `5432`. O Redis está disponível em `127.0.0.1:6379`.

A aplicação encerra a inicialização se qualquer segredo JWT estiver ausente, tiver menos de 32 caracteres ou for idêntico ao outro.

## Validação local

Com o Docker em execução e o arquivo `.env` configurado, execute:

```sh
npm run build
npm run lint
npm run format:check
npm run test:unit
npm run test:integration
npm run test:e2e
```

A suíte de integração exige PostgreSQL. A suíte E2E também inicia a API e o worker de outbox em processo e requer PostgreSQL e Redis.

## Política de entrega de webhooks

- Endpoints de webhook devem usar HTTPS na porta padrão, sem credenciais na URL e sem fragmentos.
- `ALLOWED_WEBHOOK_HOSTS` é uma lista opcional de hosts exatos separados por vírgula. Quando configurada, apenas esses hosts podem ser registrados ou utilizados para entrega; wildcards e correspondências por sufixo não são permitidos. Quando vazia, qualquer hostname público compatível com as validações pode ser aceito.
- No momento da entrega, o worker resolve o hostname de cada conexão e rejeita o destino se qualquer endereço resolvido for não público, incluindo redes privadas, loopback, link-local, reservadas ou endereços IPv4 mapeados para redes privadas. O endereço público resolvido é fixado na conexão para prevenir rebinding de DNS entre a validação e a conexão real.
- Redirecionamentos não são seguidos. Uma resposta de redirecionamento é tratada como falha na entrega e pode ser reenviada.
- Os segredos dos endpoints são retornados na criação do registro para permitir que o proprietário configure verificação de assinatura. Eles não são expostos pelas APIs de listagem. O banco atual armazena esses segredos em texto puro; use apenas dados locais confiáveis até a implementação de criptografia em repouso e gerenciamento seguro de segredos em ambiente de produção.

## Garantias de pagamento e processamento

- Um pagamento só pode ser cancelado enquanto estiver em estado `PENDING`. O cancelamento é realizado por uma atualização condicional no banco de dados, de modo que não sobrescreve uma transição concorrente do worker.
- O cancelamento de um pagamento aprovado não é suportado, pois não existe um fluxo de reembolso ou reversão de ledger.
- A concessão de claims do outbox possui prazo de cinco minutos e mantém um heartbeat enquanto o processamento do pagamento está ativo. Uma nova verificação reativa claims abandonados após falha de worker.
- As escritas no ledger são idempotentes por pagamento e tipo de entrada.
- O provedor de pagamento é um simulador. Se um provedor real for adicionado, as requisições devem usar o ID do pagamento como chave de idempotência; a concessão do worker por si só não garante efeitos exactly-once em um provedor externo.

## Endpoints obrigatórios

- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `GET /v1/auth/me`
- `POST /v1/accounts`
- `GET /v1/accounts`
- `GET /v1/accounts/:id`
- `GET /v1/accounts/:id/ledger`
- `POST /v1/payments`
- `GET /v1/payments`
- `GET /v1/payments/:id`
- `POST /v1/payments/:id/cancel`
- `POST /v1/webhooks/endpoints`
- `GET /v1/webhooks/endpoints`
- `DELETE /v1/webhooks/endpoints/:id`
- `GET /v1/webhooks/deliveries`

## Observações importantes

- O valor monetário é armazenado em unidades menores para evitar problemas de precisão com ponto flutuante.
- A idempotência do pagamento é garantida por um índice único em `(userId, key)` e por um hash da requisição.
- O outbox persiste eventos antes da publicação e a recuperação do worker os reprocessa.
- Os payloads de webhook são assinados com HMAC-SHA256 e incluem metadados do evento.
- O PostgreSQL é exposto na porta `5433` para evitar conflitos com uma instância local em `5432`.
- O PostgreSQL impõe valores positivos para pagamentos e entradas de ledger por meio de uma migração SQL customizada; o Prisma 5 não expressa esse tipo de constraint no schema.
- O PostgreSQL garante que cada pagamento pertença à mesma conta do mesmo usuário por meio de uma chave composta.
- Os refresh tokens são persistidos e rotacionados de forma atômica; um token só pode ser usado uma vez antes de expirar.

## Licença

Este projeto foi desenvolvido como demonstração de arquitetura de pagamentos e processamento assíncrono. Consulte os arquivos do repositório para verificar as condições específicas de uso e distribuição.
