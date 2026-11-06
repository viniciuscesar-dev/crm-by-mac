# WhatsApp by Mac — integração inicial

## O que foi implementado
- Aba WhatsApp no painel de administrador e consultor.
- Cadastro de números da API (Phone Number ID), contatos com consentimento, caixa de mensagens, envio de templates aprovados e resposta livre dentro da janela de 24h.
- Webhook oficial com validação de assinatura HMAC, recebimento de mensagens e status, exclusão de contatos por pedido de PARAR/SAIR.
- Resposta automática **por regras** para saudações. **Não é IA generativa**; precisa de provedor/modelo para IA avançada.
- Escopo por empresa e restrição de acesso dos consultores.

## Passos obrigatórios antes de funcionar
1. Concluir o esquema do banco no Neon, executando migrações **001 a 012 em ordem**. A migração 012 não substitui as anteriores.
2. Criar app WhatsApp Business na Meta, cadastrar número e obter `Phone Number ID`.
3. Definir secrets no Cloudflare Worker: `WHATSAPP_ACCESS_TOKEN` (token com permissão de mensagens), `WHATSAPP_VERIFY_TOKEN` (segredo escolhido para o desafio), `META_APP_SECRET` (segredo do app Meta). **Não coloque secrets no código ou no navegador.**
4. No painel Meta, cadastrar webhook público `https://SEU_DOMINIO/.netlify/functions/whatsapp?action=webhook`, token de verificação igual a `WHATSAPP_VERIFY_TOKEN`, e assinar eventos de mensagens.
5. No painel do CRM, abrir WhatsApp e cadastrar `Phone Number ID` e telefone do número autorizado.
6. Criar e obter aprovação de modelos de mensagem no WhatsApp Manager antes de iniciar conversas; coletar consentimento dos destinatários.
7. Testar envio, recebimento, atualização de status, exclusão de contatos e permissões.

## Limitações conhecidas
- Integração **não foi testada contra a Meta ou o banco de produção**. Nenhum número está ativado automaticamente.
- Resposta automática básica; **IA generativa, campanhas em lote, agendamento, filas, rate limiting, custos e dashboard ainda não implementados**.
- O backend atual usa `process.env` para secrets; confirme que seu adaptador Cloudflare expõe os secrets dessa maneira antes de publicar.
- Para escala, migrar processamento de webhook para fila assíncrona e revisar segurança, isolamento entre empresas, qualidade e regras de consentimento.
- A API cobra mensagens elegíveis; o CRM não garante ausência de bloqueios.
