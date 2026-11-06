# Melhorias CRM — versão preservando o layout aprovado

Esta versão mantém o `index.html` e, em especial, a visualização pública da análise/proposta sem redesign. As melhorias abaixo foram adicionadas na camada de dados, regras e APIs para não alterar o visual já aprovado.

## Implementado
- Cadastro unificado de clientes (`clients`) e vínculo com leads, análises, propostas, vendas e tarefas.
- Linha do tempo única do cliente (`activities`) com eventos comerciais.
- Hub de comunicações (`communications`) pronto para registrar WhatsApp/e-mail/telefone e receber integração oficial futuramente.
- Metas financeiras, de vendas, propostas e análises (`goals`).
- Regras de automação por mudança de etapa do lead (`automation_rules`), com criação automática de tarefas e notificações.
- Central de notificações (`notifications`).
- Rastreamento de proposta (`proposal_events`) com envio, abertura, expiração e aceite.
- Central de oportunidades/insights baseada em comportamento: lead parado, proposta próxima de expirar e proposta com múltiplas visualizações.
- Painel avançado via endpoint `advanced?action=overview` com conversão, receita e pendências.
- Escopo de dados por empresa e por consultor preservado.
- White-label ampliado com logo específico de proposta, dados de contato, site, privacidade e retenção.
- Atualização controlada de etapas do funil e tarefas via `PATCH` na função `data`.
- Proteção de login aprimorada por IP e por e-mail, sem depender do conteúdo da requisição.

## Endpoints novos
- `GET /.netlify/functions/advanced?action=overview`
- `GET /.netlify/functions/advanced?action=clients`
- `GET /.netlify/functions/advanced?action=timeline&client_id=...`
- `GET /.netlify/functions/advanced?action=goals`
- `GET /.netlify/functions/advanced?action=notifications`
- `GET /.netlify/functions/advanced?action=insights`
- `POST /.netlify/functions/advanced` para `communication`, `goal`, `notification-read` e `automation`.
- `PATCH /.netlify/functions/data` para mudança segura de lead, tarefa e proposta.

## Integrações externas
WhatsApp/Instagram não são simulados como ativos. O modelo de comunicação está pronto, mas a conexão real exige credenciais/API oficial do provedor escolhido. Da mesma forma, um assistente de IA generativa externo exigirá chave/serviço próprio; os insights internos desta versão funcionam sem chave externa.

## Antes de produção
Aplicar todas as migrations até `006_crm_intelligence`, definir `PASSWORD_PEPPER`, validar isolamento de empresas/consultores, política de backup/retenção e executar testes de segurança e fluxo completo.

## 07 — Inteligência de engajamento em propostas
- A lista de Propostas agora destaca o nome do cliente como acesso à ficha de comportamento.
- A ficha mostra quantidade de acessos, sessões, primeira e última abertura, tempo ativo total, rolagem máxima, chegada ao final e aceite.
- O tempo de leitura é contabilizado apenas enquanto a página está visível/ativa, reduzindo distorções quando o cliente deixa a aba aberta em segundo plano.
- Sessões de proposta são registradas individualmente em `proposal_sessions`.
- Classificação comercial automática: Não abriu, Visualizou, Muito interessado, Aceitou ou Recusou.
- Histórico de eventos do link por proposta.
- Nova migration: `007_proposal_engagement`.

## Ajuste 08 — parcelas em atraso e parcela balão

- Imóvel: campo “possui parcelas em atraso?”, quantidade, valor aproximado e observação específica.
- A observação padrão informa que poderá ser solicitada a inclusão das parcelas em atraso dentro do acordo, sujeita à análise e aceite da instituição financeira.
- Veículo: mesmos campos de parcelas em atraso.
- Veículo: módulo opcional de parcela balão com valor original, percentual de desconto, valor calculado com desconto, limite de parcelamento e quantidade escolhida pelo cliente.
- O sistema calcula a parcela estimada conforme desconto e quantidade escolhida.
- Esses dados ficam no payload da análise e são herdados quando a proposta é criada a partir da análise.
- Na proposta pública, as informações só aparecem quando aplicáveis, sem alterar a estrutura principal da proposta.


## V5
- Parcelas restantes automáticas
- Assistente de conferência
- Importação documental assistida
- Versões de proposta
- Duplicar/comparar análises
- Modo apresentação
- Recusa estruturada
- Follow-up automático
- Central de oportunidades
- Auditoria
