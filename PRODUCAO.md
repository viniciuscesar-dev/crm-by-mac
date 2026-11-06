# CRM by mac

## LGPD e segurança
- Política de privacidade operacional versionada (1.0).
- Registro de base legal/finalidade e consentimento quando aplicável.
- Sessões com cookie HttpOnly, Secure e SameSite=Lax.
- Senhas com scrypt e pepper configurável por variável de ambiente.
- Separação por empresa e perfil (admin/consultor).
- Logs de auditoria para login/logout, consentimento e solicitações de privacidade.
- Exportação de dados pelo endpoint de privacidade.
- Revogação de consentimento quando consentimento for a base legal.
- Exclusão administrativa em massa para encerramento/limpeza, sujeita às obrigações de retenção.
- Propostas públicas usam token aleatório, expiração e cabeçalhos sem cache.

## Importante
A conformidade LGPD não é apenas código. Antes de produção, a empresa deve preencher identidade do controlador, canal do titular, encarregado/DPO quando aplicável, bases legais por fluxo, prazos de retenção, contratos com operadores e procedimento de incidentes.


## Novos recursos V5
- Parcelas restantes calculadas automaticamente por `prazo total - parcelas pagas`.
- Validação para impedir parcelas pagas maiores que o prazo total.
- Assistente de conferência da análise antes da conclusão.
- Taxa de juros e comparativo de amortização opcionais.
- Importação de documento para preenchimento assistido.
- Duplicação e comparação de análises.
- Modo apresentação.
- Versões de proposta (V1, V2, V3...).
- Motivo de recusa.
- Follow-up automático 24h após uma proposta.
- Central de oportunidades.
- Auditoria das criações/alterações críticas.

### Leitura automática de documentos
A interface e o endpoint `/.netlify/functions/document-extract` estão prontos.
Para ativar a extração automática em produção configure os segredos:
- `DOCUMENT_EXTRACT_URL`
- `DOCUMENT_EXTRACT_TOKEN` (se o provedor exigir)

O provedor deve receber imagem/PDF e retornar JSON com os campos previstos no endpoint.
Sem um provedor de leitura documental configurado, o CRM mantém o preenchimento manual e informa que a leitura automática ainda não está ativa.
Por privacidade, esta versão usa o arquivo para extração e não persiste automaticamente a imagem/PDF no banco.


## V6 — Parcelas, juros e validação documental
- Os três campos de parcelas (total, pagas e restantes) são editáveis.
- Ao preencher quaisquer dois, o terceiro é calculado automaticamente.
- Se o consultor passar a editar o campo antes automático, o CRM recalcula o terceiro com base nos dois últimos campos informados.
- A taxa do contrato pode vir automaticamente do documento quando estiver legível e validada.
- A taxa efetiva identificada pelo sistema é sugerida somente quando houver dados suficientes para um cálculo matemático compatível. Nesta versão, o cálculo automático é habilitado para operações identificadas como Price com valor financiado, parcela e prazo.
- A taxa que será apresentada ao cliente continua editável pelo consultor.
- Documento ilegível não preenche campos. Documento parcialmente legível preenche apenas campos com confiança suficiente e sinaliza os demais para conferência.
- O provedor documental deve retornar `readable`, `legibility`, `legibility_score` e, idealmente, `field_confidence`.


## V7 — Correções finais de análise, propostas e leitura documental
- Parcelas total/pagas/restantes: quaisquer dois campos calculam o terceiro; o campo automático fica identificado e pode ser substituído digitando nele.
- Juros: nomenclatura corrigida para "taxa efetiva estimada" quando calculada pelo sistema. O CRM não afirma taxa real sem dados suficientes.
- Origem da taxa: documento, sistema ou consultor.
- Taxa contratual importada somente quando o documento estiver legível e com confiança suficiente.
- Propostas versionadas agora mesclam o payload da versão anterior com as alterações da nova versão.
- Proposta pública usa o visual aprovado: ANÁLISE APROVADA, hero de economia, dados do contrato, amortização opcional, parcela, impacto, pontos identificados, atraso opcional, base legal e somente o botão ACEITAR PROPOSTA.
- Layout público é white-label: usa proposal_logo_url/logo_url ou nome da empresa.
- Nova proposta possui campos internos para alimentar parcela revisada, economia mensal, redução, estorno e dados específicos de quitação/veículo.
- Leitura documental pode ser ativada diretamente com `OPENAI_API_KEY`; opcionalmente continua aceitando um provedor próprio via `DOCUMENT_EXTRACT_URL`.
- Modelo de leitura configurável por `DOCUMENT_EXTRACT_MODEL` (padrão: `gpt-5.6-luna`).
- A chave da API deve ser salva como variável secreta no Netlify, nunca no navegador ou dentro do HTML.


## V8 — Painel do Criador / Plataforma
Novo nível `creator`, separado de Admin e Consultor.

### Criador
- Visão geral global.
- Empresas reais e Sandbox.
- Todos os administradores e consultores.
- Criação/suspensão/reativação de empresas.
- Criação/bloqueio de administradores e usuários.
- Planos, limites e feature flags preparados.
- Integrações e consumo de leitura documental.
- Saúde do sistema.
- Auditoria global.
- Central de suporte.
- Configurações globais.
- Ambiente de testes isolado dos indicadores reais.
- Geração e limpeza de dados fictícios.
- Teste da leitura documental.

### Segurança
- Admin e Consultor não têm rota/autorização para o painel do Criador.
- O bootstrap inicial agora cria `creator`, não `admin`.
- O Criador não pertence a uma empresa (`company_id = NULL`).
- Empresas suspensas deixam de autenticar seus usuários.
- Antes de abertura comercial, implementar 2FA real para Criador e reautenticação para ações críticas.

### Migration
Executar `009_creator_platform/migration.sql` antes de usar o painel Criador.


## V9 — Segurança do Criador
- 2FA TOTP para o usuário Criador (compatível com apps autenticadores).
- Segredo TOTP criptografado no banco com AES-256-GCM derivado de `PASSWORD_PEPPER`.
- 8 códigos de recuperação de uso único, armazenados somente como hash.
- Login do Criador passa a exigir senha + código quando 2FA estiver ativo.
- Ações críticas exigem reautenticação (senha + 2FA) e liberam janela elevada de 10 minutos.
- Ações protegidas: suspender/reativar empresa, criar administrador, bloquear/ativar usuário, limpar Sandbox e alterar configuração global.
- Migration obrigatória: `010_creator_2fa/migration.sql`.
- Configure `PASSWORD_PEPPER` com segredo aleatório forte antes de ativar 2FA. Não altere esse segredo depois sem procedimento de migração, pois ele protege o segredo TOTP criptografado.


## V10 — Campanhas promocionais + Central Inteligente de Oportunidades

### Campanhas
- Nova aba `Campanhas` para Admin e Consultor.
- Sugestão diária ligada a revisão contratual, com modelos diferentes por dia da semana.
- Campanha semanal rotativa.
- Datas especiais têm prioridade sobre a mensagem comum do dia.
- Admin pode cadastrar datas especiais próprias (dia, mês, nome, chamada e texto).
- Condição comercial separada em:
  - valor normal da contratação;
  - valor à vista via PIX;
  - valor total no cartão;
  - quantidade de parcelas;
  - valor de cada parcela;
  - validade.
- O cliente NÃO recebe código técnico de cupom. O link público mostra somente a condição liberada e o botão de aceite.
- Desconto acima do limite sem aprovação entra em `Aguardando aprovação` e precisa do Admin.
- Arte do dia é montada automaticamente no navegador usando identidade da empresa, logo e foto oficial do garoto-propaganda quando configuradas.
- Histórico registra acessos, aceite e reacessos após expiração.

### Reengajamento
- Propostas de análise continuam registrando acessos mesmo expiradas.
- Quando um cliente volta a uma proposta expirada, o consultor recebe notificação (com janela anti-spam de 6h).
- Cupons promocionais também registram tentativa após expiração e notificam o consultor.
- Link expirado continua indisponível para aceite; o reacesso serve somente como sinal comercial.

### Central Inteligente de Oportunidades
- Nova aba `Oportunidades` para Admin e Consultor.
- Prioriza automaticamente:
  - proposta expirada reacessada;
  - cupom expirado reacessado;
  - proposta com alto interesse;
  - análise sem avanço;
  - proposta sem decisão;
  - lead nunca ativado;
  - lead ativado apenas uma vez;
  - nova ativação pendente;
  - lead elegível para campanha;
  - lead frio.
- Ações rápidas: WhatsApp, registrar ativação e gerar cupom.
- Dashboard passa a exibir alertas e oportunidades prioritárias.
- Admin define prazos e limites em `Campanhas > Regras comerciais`.

### White-label de campanha
- Configurações da empresa agora aceitam:
  - foto oficial do garoto-propaganda por URL;
  - desconto PIX sugerido;
  - desconto cartão sugerido.

### Banco
Executar também:
`netlify/database/migrations/011_campaigns_opportunities/migration.sql`

### Validação
- JavaScript do frontend e todas as Netlify Functions passaram por `node --check`.
- Ainda é necessário validar a migration 011 em PostgreSQL real e fazer teste end-to-end no site publicado antes de uso comercial.
