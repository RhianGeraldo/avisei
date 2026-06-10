# Documentação do Sistema - Avisei (Belle Software Messaging)

O **Avisei** é uma plataforma SaaS multi-tenant robusta e escalável, projetada para automatizar, gerenciar e monitorar o envio de mensagens do WhatsApp baseadas em eventos e dados integrados do **Belle Software**. A plataforma permite que clínicas e estabelecimentos configurem fluxos de mensagens automáticos (remetentes, lembretes de agendamento, cobranças, etc.) ou disparem campanhas manuais em massa utilizando conexões seguras com a API do **EvoGo**.

---

## 1. Visão Geral da Arquitetura

O sistema é construído sobre uma arquitetura moderna, focada em alto desempenho, segurança de dados e concorrência garantida no banco de dados.

*   **Frontend & Backend (SaaS)**: Desenvolvido em **Next.js** (App Router) com React 19, utilizando **TailwindCSS v4** para uma interface de usuário premium e responsiva no tema escuro, e **shadcn/ui** para componentes altamente estilizados.
*   **Banco de Dados & Autenticação**: **Supabase** (Postgres + Row Level Security - RLS). Toda a segurança de dados e separação multi-tenant é garantida a nível de banco de dados por meio de políticas RLS.
*   **Integração WhatsApp**: Integração direta com a API do **EvoGo** para gerenciar instâncias, gerar QR Codes de conexão, capturar status de sincronização e enviar mensagens de diversos formatos (texto, mídia, enquetes).
*   **Integração Belle Software**: Integração com a API REST do Belle Software para puxar agendamentos e contas a receber (cobranças) em lote, unificar dados de serviços e enviá-los de forma inteligente.
*   **Motor do Worker (Fila de Envio)**: Um sistema robusto com **travamento de concorrência atômico (Postgres `FOR UPDATE SKIP LOCKED`)** para garantir que mensagens agendadas e automações sejam disparadas exatamente uma vez, mesmo sob alta carga concorrente ou múltiplas chamadas ao gatilho.

---

## 2. Modelo de Dados (Schema Supabase)

O banco de dados é composto por 12 tabelas principais que suportam o ecossistema multi-tenant da plataforma:

```
                  [companies] (Tenancy)
                       │
         ┌─────────────┴─────────────┐
    [profiles]                  [units] (Unidades)
 (Usuários 1:1 Auth)                 │
         │             ┌─────────────┼─────────────┐
    [user_roles]  [instances]   [messages]    [cron_jobs]
                  (WhatsApp)    (Templates)  (Automações)
                       │             │             │
                       └─────────────┼─────────────┘
                                     │
                              [send_queue] (Fila)
                                     │
                          [message_send_logs] (Logs)
```

### 2.1. Descrição Detalhada das Tabelas

1.  **`companies` (Empresas)**
    *   `id` (UUID, PK): Identificador único da empresa contratante.
    *   `name` (TEXT): Nome da empresa.
    *   `document` (TEXT): CNPJ ou CPF.
    *   `active` (BOOLEAN): Status da conta da empresa.
    *   `api_token` (TEXT): Token de autorização exclusivo para integrações de APIs externas.
    *   `created_at`/`updated_at` (TIMESTAMPTZ).
2.  **`profiles` (Perfis de Usuários)**
    *   `id` (UUID, PK, FK `auth.users`): Vinculado 1:1 com a tabela de autenticação do Supabase.
    *   `company_id` (UUID, FK `companies`): Identifica a qual tenant (empresa) este usuário pertence.
    *   `full_name` (TEXT): Nome completo do usuário.
    *   `email` (TEXT): E-mail do usuário.
3.  **`user_roles` (Permissões)**
    *   `user_id` (UUID, PK, FK `profiles`): ID do perfil.
    *   `role` (app_role - ENUM): Nível de acesso:
        *   `super_admin`: Acesso total e irrestrito a todas as empresas do sistema.
        *   `company_admin`: Administrador de sua própria empresa (gerencia unidades, instâncias, mensagens, etc.).
        *   `operator`: Usuário operador de sua própria empresa (dispara campanhas, visualiza relatórios).
4.  **`units` (Unidades)**
    *   `id` (UUID, PK): Identificador da unidade de negócio (ex: clínica filial).
    *   `company_id` (UUID, FK `companies`): Empresa dona da unidade.
    *   `name` (TEXT): Nome da unidade.
    *   `belle_token` (TEXT): Token específico de autenticação no Belle Software.
    *   `belle_cod_estab` (TEXT): Código do estabelecimento no Belle Software.
    *   `active` (BOOLEAN): Se a unidade está operacional.
5.  **`instances` (Instâncias WhatsApp EvoGo)**
    *   `id` (UUID, PK): Identificador único.
    *   `unit_id` (UUID, FK `units`, opcional): Unidade dona da instância.
    *   `company_id` (UUID, FK `companies`): Empresa dona da instância.
    *   `name` (TEXT): Nome amigável da instância (ex: "WhatsApp Recepção").
    *   `instance_name` (TEXT): Nome técnico formatado enviado para o EvoGo (slugified).
    *   `evogo_instance_id` (TEXT): ID de retorno gerado pelo EvoGo.
    *   `evogo_api_key` (TEXT): Chave/Token individual da instância gerado no EvoGo.
    *   `status` (TEXT): Estado de conexão (`connected` | `disconnected`).
    *   `webhook_url` (TEXT): URL cadastrada para receber eventos do WhatsApp.
6.  **`messages` (Templates de Mensagens)**
    *   `id` (UUID, PK): Identificador do template.
    *   `company_id` (UUID, FK `companies`): Empresa dona do template.
    *   `name` (TEXT): Nome do template.
    *   `template` (TEXT): Corpo de texto da mensagem com marcações dinâmicas (ex: `Olá {{cliente_nome}}`).
    *   `message_type` (TEXT): Tipo da mensagem (`text` | `media` | `poll`).
    *   `content_data` (JSONB): Configurações adicionais de mídia (URL da imagem/documento, caption, filename) ou enquete (opções, selectableCount).
    *   `trigger_source` (TEXT): Identificador de origem de gatilho padrão (`manual` | `appointment` | `billing`).
7.  **`cron_jobs` (Automações Programadas)**
    *   `id` (UUID, PK): Identificador único da automação.
    *   `company_id` (UUID, FK `companies`): Empresa dona.
    *   `unit_ids` (UUID[]): Array com IDs das unidades associadas a esta automação.
    *   `message_id` (UUID, FK `messages`): Template de mensagem que será disparado.
    *   `name` (TEXT): Nome amigável da automação (ex: "Lembrete D-1 Confirmação").
    *   `schedule_time` (TEXT): Horário fixo diário de disparo (Formato HH:MM, ex: `09:30`).
    *   `days_of_week` (INT[]): Dias da semana em que roda (0 = Domingo, 1 = Segunda... 6 = Sábado).
    *   `days_offset` (INTEGER): Deslocamento de dias em relação à data atual (ex: `0` para agendamentos do dia, `-1` para um dia antes, `1` para um dia depois).
    *   `trigger_source` (TEXT): Origem do gatilho (`appointment` para agendamentos ou `billing` para contas a receber).
    *   `status_filter` (TEXT): Filtro opcional do status do agendamento (ex: "Agendado", "Pendente").
    *   `tipo_filter` (TEXT): Filtro de tipo do agendamento.
    *   `instance_mapping` (JSONB): Objeto mapeando `unit_id` para a `instance_id` correspondente que deve fazer o disparo (ex: `{"id_unidade_1": "id_instancia_A"}`).
    *   `active` (BOOLEAN): Status de ativação da automação.
    *   `last_run_at`/`last_run_status`/`last_run_error`/`last_run_count` (Metadados de auditoria do último tick).
8.  **`campaigns` (Campanhas em Massa)**
    *   `id` (UUID, PK): Identificador único.
    *   `company_id` (UUID, FK `companies`): Empresa dona.
    *   `unit_id` (UUID, FK `units`, opcional): Unidade associada.
    *   `message_id` (UUID, FK `messages`): Template de mensagem usado.
    *   `instance_id` (UUID, FK `instances`): Instância de envio.
    *   `name` (TEXT): Nome da campanha.
    *   `status` (campaign_status - ENUM): Estado da campanha (`draft` | `scheduled` | `running` | `paused` | `completed` | `canceled`).
    *   `interval_seconds` (INTEGER): Delay estrito em segundos entre o envio de cada mensagem (padrão `30`).
    *   `total_contacts`/`sent_count`/`failed_count` (Estatísticas rápidas em cache).
    *   `scheduled_at`/`last_processed_at` (Datas de controle).
9.  **`campaign_contacts` (Contatos da Campanha)**
    *   `id` (UUID, PK): Identificador.
    *   `campaign_id` (UUID, FK `campaigns`): Campanha à qual pertence.
    *   `number` (TEXT): Telefone de destino.
    *   `name` (TEXT): Nome do contato.
    *   `variables` (JSONB): Variáveis customizadas importadas via CSV para este contato (ex: `{"cargo": "Gerente", "cidade": "Vitória"}`).
    *   `status` (send_queue_status - ENUM): Status de envio do contato (`pending` | `sent` | `failed`).
    *   `sent_at`/`error` (Controle de disparo).
10. **`send_queue` (Fila Global de Envios)**
    *   `id` (UUID, PK): Identificador da mensagem na fila.
    *   `company_id` (UUID, FK `companies`): Empresa.
    *   `unit_id` (UUID, FK `units`): Unidade.
    *   `instance_id` (UUID, FK `instances`): Instância que disparará.
    *   `message_id` (UUID, FK `messages`, opcional): Template de origem.
    *   `campaign_id` (UUID, FK `campaigns`, opcional): Vinculado se fizer parte de uma campanha.
    *   `contact_id` (UUID, FK `campaign_contacts`, opcional): Vinculado se for contato de campanha.
    *   `number` (TEXT): Número formatado do celular.
    *   `text` (TEXT): Texto final já com as variáveis substituídas.
    *   `message_type` (TEXT): Tipo da mensagem (`text` | `media` | `poll`).
    *   `content_data` (JSONB): Dados específicos de mídia/enquete resolvidos.
    *   `status` (send_queue_status - ENUM): Estado da fila (`pending` | `processing` | `sent` | `failed` | `cancelled` | `paused`).
    *   `scheduled_at` (TIMESTAMPTZ): Data exata agendada para envio.
    *   `last_error` (TEXT): Erro capturado no envio.
    *   `trigger_source` (TEXT): Origem do gatilho (`manual` | `campaign` | `automation` | `api_externa`).
11. **`message_send_logs` (Histórico / Logs de Disparo)**
    *   Histórico imutável de todas as tentativas de envio, contendo status final, número, mensagem enviada, tipo da mensagem, metadados de erro e trigger_source, permitindo auditoria detalhada.
12. **`app_settings` (Configurações do Sistema - Singleton)**
    *   Tabela com uma única linha (`id = true`) que armazena as configurações globais de infraestrutura: `evogo_url`, `evogo_admin_token`, `evogo_proxy`, e `belle_base_url`.

### 2.2. Segurança e Multi-Tenancy (RLS)

A separação de dados é garantida por **Row Level Security (RLS)** a nível do Postgres. O sistema implementa duas funções `SECURITY DEFINER` essenciais para aplicar as políticas com performance:

*   `public.has_role(user_id, role)`: Valida se o usuário logado possui a permissão requerida sem causar recursão infinita na tabela `user_roles`.
*   `public.current_company_id()`: Retorna o `company_id` do perfil do usuário autenticado atual (`auth.uid()`).

Todas as tabelas de dados possuem políticas RLS ativas:
*   `super_admin` possui acesso irrestrito para todas as operações (`FOR ALL USING (has_role(auth.uid(), 'super_admin'))`).
*   Usuários normais (`company_admin`, `operator`) só podem acessar ou alterar registros onde a coluna `company_id` seja igual a `current_company_id()`.

---

## 3. Endpoints da API do Sistema (API Routes Next.js)

O sistema expõe rotas de API para integrações externas e automação do worker.

### 3.1. Gatilho Periódico do Worker (Cron Trigger)

*   **URL**: `/api/cron-trigger`
*   **Método**: `GET`
*   **Query Params**: `secret` (Chave configurada em `.env` via `CRON_SECRET`)
*   **Comportamento**:
    1.  Autentica a chamada verificando se o `secret` bate com a variável de ambiente.
    2.  Processa os Cron Jobs (Automações) mapeados para a hora e minutos atuais da chamada, buscando dados no Belle, consolidando mensagens por cliente e adicionando-as à fila (`send_queue`).
    3.  Inicia a execução em background do loop do **Worker** de processamento de fila.
*   **Retorno**:
    *   `401 Unauthorized` se o secret for incorreto.
    *   `200 OK` se executado com sucesso: `{ "success": true, "count": 2, "dispatched": 0 }` (mostra novos itens enfileirados).

### 3.2. Controle de Campanhas

*   **Launch Campaign**: `/api/campaigns/launch` | `POST`
    *   Body: `{ "campaignId": "UUID" }`
    *   Comportamento: Valida a conexão da instância de envio, busca contatos com status `pending`, monta o texto de cada contato substituindo as variáveis de forma personalizada, calcula as datas de envio de cada contato baseada no `interval_seconds` da campanha (adicionando um jitter de milissegundos para evitar disparo simultâneo), insere-os na `send_queue`, atualiza a campanha para o status `running` e ativa o worker.
*   **Pause Campaign**: `/api/campaigns/pause` | `POST`
    *   Body: `{ "campaignId": "UUID" }`
    *   Comportamento: Altera o status da campanha para `paused` e altera todas as mensagens dela na `send_queue` de `pending` para `paused`.
*   **Resume Campaign**: `/api/campaigns/resume` | `POST`
    *   Body: `{ "campaignId": "UUID" }`
    *   Comportamento: Altera o status da campanha para `running`, busca as mensagens pausadas dela na `send_queue`, reorganiza suas datas de agendamento em sequência para respeitar o intervalo de atraso e altera seus status de volta para `pending`, acordando o worker em seguida.

### 3.3. API Externa de Agendamentos (Para Integrações de Terceiros)

Este endpoint público permite que outros sistemas (como o próprio Belle Software enviando webhooks em tempo real) disparem mensagens instantâneas através do Avisei.

*   **URL**: `/api/external/agendamentos`
*   **Método**: `POST`
*   **Headers**:
    *   `Authorization: Bearer <API_TOKEN_DA_EMPRESA>` (O token configurado na tabela `companies.api_token`).
*   **Payload do Body (JSON)**:
    ```json
    {
      "unidade": "Nome Exato da Unidade cadastrada",
      "instancia": "Nome Exato da Instância cadastrada",
      "template": "Nome Exato do Template cadastrado",
      "agendamentos": [
        {
          "cliente_nome": "Felipe Souza",
          "cliente_telefone": "5511999999999",
          "data": "25/05/2026",
          "hora": "14:00",
          "profissional": "Dr. Carlos",
          "servico": "Consulta Médica"
        },
        {
          "cliente_nome": "Felipe Souza",
          "cliente_telefone": "5511999999999",
          "data": "25/05/2026",
          "hora": "14:30",
          "profissional": "Dr. Carlos",
          "servico": "Exame Clínico"
        }
      ]
    }
    ```
*   **Comportamento de Consolidação Inteligente**:
    1.  Valida o Token de Autorização localizando a empresa dona dele no banco.
    2.  Busca os IDs das entidades vinculadas (`units`, `instances`, `messages`) via nomes informados.
    3.  **Agrupa os Agendamentos por Telefone do Cliente**: Se um cliente tiver múltiplos agendamentos no mesmo dia/lote (ex: múltiplos exames e consultas consecutivas), o sistema **consolida** todos os serviços do cliente em uma única mensagem usando a quebra de linha com marcadores (`- Serviço 1\n- Serviço 2`), evitando spam e custos desnecessários com múltiplos disparos de WhatsApp.
    4.  Dispara as mensagens formatadas **imediatamente** pela instância usando `sendEvogoText` sem passar pelo agendamento da fila de espera, mas insere os registros na fila com status `sent` (ou `failed`) e no histórico de envio (`message_send_logs`) para garantir auditoria total nas telas do painel.

---

## 4. Funcionamento do Motor do Worker (Fila de Envio)

O motor do worker é a engrenagem mais vital do sistema, otimizada para evitar **corrida de concorrência (race conditions)** e **duplo disparo de mensagens** (um problema comum quando múltiplos crons ou chamadas manuais são disparados ao mesmo tempo).

### 4.1. Mecanismo de Bloqueio Concorrente Atômico

Para processar a fila com segurança absoluta, o sistema utiliza a função do Postgres `claim_send_queue_items(limit_val, now_str)` invocada via RPC no worker:

```sql
WITH locked_items AS (
  SELECT q.id
  FROM public.send_queue q
  WHERE q.status = 'pending'
    AND (q.scheduled_at <= now() OR q.scheduled_at IS NULL)
  ORDER BY q.scheduled_at ASC
  LIMIT limit_val
  FOR UPDATE SKIP LOCKED -- O SEGREDO DO TRAVAMENTO ATÔMICO
), updated_items AS (
  UPDATE public.send_queue q
  SET status = 'processing',
      updated_at = now()
  FROM locked_items l
  WHERE q.id = l.id
  RETURNING q.*
)
SELECT u.*, inst.evogo_api_key
FROM updated_items u
LEFT JOIN public.instances inst ON u.instance_id = inst.id
ORDER BY u.scheduled_at ASC;
```

#### Como funciona:
1.  **`FOR UPDATE SKIP LOCKED`**: Ao buscar itens agendados e pendentes da fila, o banco de dados Postgres adquire um bloqueio de linha para gravação nesses registros específicos. Se outro processo do worker tentar rodar paralelamente (no mesmo milissegundo), ele verá que essas linhas já estão bloqueadas e irá **pular** (`SKIP LOCKED`) para os próximos registros livres.
2.  **Transição de Status**: Imediatamente, dentro da mesma query (usando a CTE `updated_items`), as mensagens travadas têm seu status alterado para `processing`.
3.  **Resultado**: O worker recebe um lote seguro e exclusivo de mensagens para enviar. Nenhum outro processo poderá encostar nelas, eliminando qualquer possibilidade de disparo duplicado de mensagens para o cliente.

### 4.2. Execução Sequencial com Delays Customizados

Durante o processamento das mensagens capturadas do lote:
*   O worker lê o intervalo de segundos configurado individualmente na campanha vinculada da mensagem (`interval_seconds`, ex: 30 segundos).
*   Se houver múltiplas mensagens de uma mesma campanha em lote, o worker executa um delay sequencial assíncrono (`await new Promise(r => setTimeout(r, intervalSec * 1000))`) antes de fazer a requisição de disparo no WhatsApp para a próxima mensagem do lote. Isso simula o comportamento de digitação/envio humano no WhatsApp, prevenindo bloqueio e banimento de chips pelo sistema de spam da Meta.

### 4.3. Tratamento de Erros de Conexão (Autopausa)

Se, durante a requisição de envio, o EvoGo retornar um erro indicando que o WhatsApp está desconectado (como `the store doesn't contain a device JID`), o worker toma uma ação de segurança imediata:
1.  Altera o status da Campanha vinculada de `running` para `paused`.
2.  Altera o status de todas as mensagens pendentes daquela campanha na `send_queue` para `paused`.
3.  Evita o desperdício de requisições falhas que poderiam poluir o log e quebrar as estatísticas de envio, permitindo que o usuário corrija a conexão e retome a campanha de onde parou.

---

## 5. Como Configurar e Rodar o Worker (VPS / Servidor de Produção)

Como o sistema é uma aplicação Next.js unificada implantada no servidor, não há necessidade de rodar um daemon ou processo Node separado complexo para a fila. O worker é "acordado" enviando uma requisição HTTP simples para o endpoint `/api/cron-trigger`.

### 5.1. Abordagem Básica com Crontab (A cada minuto)

Para rodar de forma confiável a verificação de automações diárias e dar vazão à fila de envios acumulada, podemos agendar o gatilho a cada minuto usando o próprio daemon cron nativo do Linux (VPS):

1.  Acesse o terminal do seu servidor VPS.
2.  Abra as configurações do crontab:
    ```bash
    crontab -e
    ```
3.  Adicione a linha de comando abaixo no final do arquivo (substituindo o domínio e o secret configurado nas suas variáveis de ambiente):
    ```bash
    * * * * * curl -s "https://seuapp.erriesse.com/api/cron-trigger?secret=COLOQUE_SEU_CRON_SECRET_AQUI" > /dev/null 2>&1
    ```
4.  Salve e feche o arquivo. O Linux executará a chamada uma vez por minuto, processando os agendamentos e iniciando o worker se houver novas mensagens.

### 5.2. Abordagem de Alta Resolução com Script de Loop + PM2 (Sub-minuto)

Como campanhas com intervalos curtos (ex: 15s) podem precisar de verificação mais frequente do que a janela de 1 minuto fornecida pelo cron do Linux, a melhor prática em produção é rodar um script contínuo que monitora a fila a cada X segundos e mantê-lo ativo 24/7 com o **PM2**.

1.  Crie um script Bash chamado `cron_worker.sh` no diretório do projeto ou na pasta `/home`:
    ```bash
    nano cron_worker.sh
    ```
2.  Insira o código do script com verificação a cada 15 segundos:
    ```bash
    #!/bin/bash
    
    URL="https://seuapp.erriesse.com/api/cron-trigger?secret=COLOQUE_SEU_CRON_SECRET_AQUI"
    
    echo "Iniciando monitoramento de fila Avisei..."
    while true; do
      echo "[$(date)] Pinguando worker..."
      curl -s "$URL" > /dev/null
      
      # Aguarda 15 segundos antes de verificar novamente
      sleep 15
    done
    ```
3.  Dê permissão de execução ao script:
    ```bash
    chmod +x cron_worker.sh
    ```
4.  Inicie o script Bash sob a supervisão do **PM2**, garantindo reinicialização automática em caso de quedas do servidor:
    ```bash
    pm2 start cron_worker.sh --name "avisei-cron-worker"
    ```
5.  Salve o estado do PM2 para inicializar junto com o sistema operacional:
    ```bash
    pm2 save
    ```

Desta forma, sua fila será limpa a cada 15 segundos e novas automações serão disparadas imediatamente, entregando a melhor experiência aos usuários do sistema.

---

## 6. Integração Belle Software

O Avisei conecta-se à API REST pública do Belle Software com base em dados de conexão e autenticação específicos cadastrados individualmente nas unidades (`belle_token` e `belle_cod_estab`).

### 6.1. Agendamentos (Reminder & Confirmation)

*   **Rota do Belle**: `/agendamentos`
*   **Campos Dinâmicos Suportados**:
    *   `{{cliente_nome}}`: Nome completo formatado em Title Case.
    *   `{{cliente_p_nome}}`: Primeiro nome do cliente em Title Case (ideal para tom de conversa natural, ex: "Olá, João!").
    *   `{{data}}`: Data do agendamento formatada (`DD/MM/YYYY`).
    *   `{{hora}}`: Horário marcado (`HH:MM`).
    *   `{{profissional}}`: Nome do profissional de saúde/estética associado.
    *   `{{servicos}}`: Lista unificada de todos os serviços agendados para aquele horário (agrupados e separados por quebra de linha com marcadores).
    *   `{{status}}`: Status de confirmação do agendamento.
    *   `{{tipo}}`: Tipo do agendamento.
    *   `{{observacao}}`: Observação cadastrada.
    *   `{{unidade}}`: Nome da unidade que realiza o atendimento.

### 6.2. Cobranças (Contas a Receber)

*   **Rota do Belle**: `/contas_receber` (Filtra apenas contas pendentes de confirmação: `confirmado = "N"`).
*   **Campos Dinâmicos Suportados**:
    *   `{{cliente_nome}}`/`{{cliente_p_nome}}`: Dados do cliente titular.
    *   `{{valor}}`: Valor bruto a pagar formatado em moeda brasileira (`R$ 150,00`).
    *   `{{vencimento}}`: Data de vencimento da fatura (`DD/MM/YYYY`).
    *   `{{forma_pagamento}}`: Nome amigável do método de pagamento (ex: "Cartão de Crédito").
    *   `{{id_venda}}`: ID da venda gerada no sistema para referência.
    *   `{{observacao}}`: Detalhes de cobrança.

---

## 7. Integração EvoGo WhatsApp API

Toda comunicação com os dispositivos de WhatsApp dos clientes é realizada consumindo a API EvoGo. As rotas internas consumidas pelo Avisei no arquivo `src/lib/evogo.ts` incluem:

1.  **Criar Instância**: `POST /instance/create`
    *   Envia o nome desejado da instância (`instanceName`) e um token gerado (`token`).
    *   Retorna a chave e o QR Code em Base64.
2.  **Obter QR Code**: `GET /instance/qr`
    *   Chamado de forma contínua (polling) no frontend para renderizar e recarregar o QR Code de autenticação.
3.  **Checar Conexão (Status)**: `GET /instance/status`
    *   Consulta a conexão em tempo real da sessão do WhatsApp (`Connected` e `LoggedIn`) e sincroniza com o banco de dados.
4.  **Desconectar Sessão (Logout)**: `DELETE /instance/logout`
    *   Desconecta a sessão ativa do WhatsApp no aparelho do cliente sem apagar a instância.
5.  **Excluir Instância**: `DELETE /instance/delete/:instanceId`
    *   Apaga definitivamente a instância dos servidores da EvoGo usando privilégios de Admin.
6.  **Gerenciar Webhooks**: `POST /instance/connect`
    *   Cadastra a URL de webhook do sistema para receber e processar eventos das instâncias de WhatsApp de forma dinâmica.
7.  **Enviar Mensagem Geral**: `POST /send/text`, `POST /send/media`, `POST /send/poll`
    *   Garante o envio flexível dos dados pela API, definindo payloads específicos para textos puros, mídias (imagens, PDFs e arquivos com URL ou base64) ou enquetes interativas.

---

## 8. Variáveis de Ambiente Necessárias (`.env`)

Para rodar a aplicação em seu servidor de produção ou ambiente local, garanta que as seguintes variáveis de ambiente estejam preenchidas:

```env
# Conexão do Supabase (Autenticação e Operações do Servidor)
SUPABASE_URL="https://sua-url-do-supabase.supabase.co"
SUPABASE_PUBLISHABLE_KEY="eyJhbG..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbG..." # OBRIGATÓRIA (Usada para bypassar RLS em operações do worker em background)

# Variáveis expostas ao Cliente (Browser)
VITE_SUPABASE_PROJECT_ID="seu-id-de-projeto"
VITE_SUPABASE_URL="https://sua-url-do-supabase.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbG..."

# Segurança do Gatilho do Worker
CRON_SECRET="uma-chave-longa-segura-e-aleatoria-criada-por-voce"

# URL Pública da Aplicação (Para callbacks)
APP_URL="https://seuapp.erriesse.com"
```

---

## 9. Instruções de Execução do Projeto Localmente

1.  Instale os pacotes utilizando o gerenciador do projeto (Bun é a fonte de verdade devido ao arquivo de travas `bun.lock`, mas NPM também pode ser usado):
    ```bash
    bun install
    ```
2.  Inicie o servidor local em modo de desenvolvimento:
    ```bash
    bun run dev
    ```
3.  Para gerar o build otimizado de produção:
    ```bash
    bun run build
    ```
4.  Inicie a aplicação compilada:
    ```bash
    bun run start
    ```
5.  Configuração de execução em cluster com o PM2 no servidor:
    ```bash
    pm2 start ecosystem.config.cjs
    ```
    Isso abrirá a aplicação em modo de cluster de alta performance na porta `3005`, gerenciando os logs e assegurando reinicialização caso o processo caia.
