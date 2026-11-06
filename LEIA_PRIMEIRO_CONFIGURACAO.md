# CRM by Mac — instruções de configuração

## Estado real
Este pacote contém o CRM e o módulo inicial de WhatsApp Cloud API. **Não há IA generativa nem campanhas em massa implementadas e testadas.** Não foi possível conectar à sua conta Meta, Neon ou Cloudflare daqui. Não declare o sistema pronto para produção sem testes.

## 1 — Banco Neon
- Faça backup antes de alterar um banco com dados.
- Abra o Neon > SQL Editor e execute `NEON_SCHEMA_COMPLETO_001_A_012.sql` **em banco vazio**; se já tiver tabelas, avalie as migrações pendentes individualmente. Não execute cegamente em produção.
- Verifique a existência das tabelas `users`, `login_attempts`, `wa_numbers`, `wa_contacts`, `wa_messages`, `wa_ai_settings`.
- O arquivo SQL consolida as migrações existentes, mas não substitui teste de migração em banco real.

## 2 — Cloudflare
- Abra a pasta no VS Code. Execute `npm.cmd install` e `npx.cmd wrangler deploy` no PowerShell.
- No painel Cloudflare Workers > crm-by-mac > Settings > Variables and Secrets, confirme os secrets `DATABASE_URL`, `PASSWORD_PEPPER`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`.
- **Nunca envie valores desses secrets por print ou chat.**
- Ativado suporte Node.js e exposição de secrets em `process.env` no `wrangler.jsonc`, necessários para o backend existente.

## 3 — Meta WhatsApp Cloud API
- Termine o cadastro de desenvolvedor e configure WhatsApp no app Meta.
- Use o número de teste primeiro; depois cadastre um número comercial elegível.
- Registre no CRM o Phone Number ID da Meta, não o telefone digitado como ID.
- Configure o webhook `https://crm-by-mac.mayarakelrim03.workers.dev/.netlify/functions/whatsapp?action=webhook`, com o mesmo token configurado no secret `WHATSAPP_VERIFY_TOKEN`; assine eventos `messages`.
- Cadastre e obtenha aprovação dos templates e registre consentimento dos contatos antes de mensagens iniciadas pela empresa.
- Faça testes com número próprio autorizado: template, resposta, status, opt-out e permissões.

## 4 — Pendências de desenvolvimento
- IA generativa, campanhas por tabulação, filas, limites de taxa, gestão de custos, e operação multiempresa de alto volume ainda precisam ser implementados e auditados.
- O backend usa um token de acesso global para números da API. Para empresas distintas com credenciais próprias, será necessário um armazenamento de credenciais seguro por empresa e autorização granular.
