# Belle Software Messaging — Plano da v1

Plataforma multi-tenant para gerenciar mensageria WhatsApp baseada em dados do Belle Software. Esta v1 entrega o **CRUD completo + UI + autenticação multi-tenant**. Cron, integração com Belle e envio via Evogo ficam para a v2 (estrutura de dados já preparada).

## Arquitetura de dados

```
auth.users (Lovable Cloud)
   │
   └── profiles (1:1) ── company_id
                              │
                          companies (clientes / empresas)
                              │
                          units (unidades da empresa)
                           ├── belle_token (token da unidade no Belle)
                           ├── instances (instâncias Evogo da unidade)
                           └── messages (templates de mensagem da unidade)
                                    └── instance_id (qual instância envia)
```

### Tabelas

- **profiles**: `id (=auth.uid)`, `company_id`, `full_name`, `email`
- **user_roles**: `user_id`, `role` (`super_admin` | `company_admin` | `operator`) — tabela separada por segurança
- **companies**: `id`, `name`, `document` (CNPJ), `active`, `created_at`
- **units**: `id`, `company_id`, `name`, `belle_token`, `belle_base_url`, `active`
- **instances**: `id`, `unit_id`, `name`, `evogo_url`, `evogo_api_key`, `instance_name` (nome no Evogo), `status`, `active`
- **messages**: `id`, `unit_id`, `instance_id`, `name`, `trigger_type` (`appointment_reminder` | `appointment_confirmation` | `installment_due` | `installment_overdue` | `custom`), `days_offset` (ex: -1 = um dia antes), `send_time`, `template` (texto com variáveis tipo `{{cliente_nome}}`), `active`

### RLS

- `super_admin` vê tudo.
- `company_admin` / `operator` veem apenas registros da sua `company_id` (via `profiles`).
- Função `has_role(user_id, role)` SECURITY DEFINER para evitar recursão.

## Rotas (TanStack Start)

- `/` — landing pública explicando o produto
- `/login`, `/signup` — auth
- `/_authenticated/dashboard` — visão geral (contagem de unidades, instâncias, mensagens)
- `/_authenticated/companies` — apenas super_admin
- `/_authenticated/units` — lista das unidades da empresa do usuário
- `/_authenticated/units/$unitId` — detalhe da unidade com abas: Geral, Instâncias, Mensagens

## Stack

- Lovable Cloud (auth + Postgres + RLS)
- TanStack Start, shadcn/ui, Tailwind v4
- Tokens/API keys das instâncias armazenados criptografados via coluna no banco (RLS protege leitura)

## Design

Tema escuro profissional (SaaS B2B), paleta Midnight Indigo, tipografia Space Grotesk + DM Sans, layout com sidebar.

## Entregáveis desta v1

1. Lovable Cloud habilitado + schema + RLS
2. Auth (email/senha) com criação automática de profile + role
3. Layout autenticado com sidebar
4. CRUD de Empresas (super_admin)
5. CRUD de Unidades (com belle_token)
6. CRUD de Instâncias por unidade (Evogo URL + API key)
7. CRUD de Mensagens por unidade (com seleção da instância e tipo de gatilho)
8. Landing page

## Fora do escopo (v2)

- Cronjob de varredura
- Integração real com API REST do Belle Software
- Envio real via Evogo
- Logs de envio e dashboard de entregas
