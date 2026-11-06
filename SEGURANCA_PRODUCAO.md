# Segurança e LGPD — CRM by mac

## O que esta versão implementa
- Autenticação por sessão HTTP-only, Secure e SameSite=Lax.
- Senhas com `scrypt` e segredo `PASSWORD_PEPPER` obrigatório e forte.
- Bloqueio temporário após 10 falhas de login em 15 minutos por chave anonimizada.
- Isolamento por `company_id` e, para consultores, por `consultant_id` no servidor.
- Administrador não pode atribuir registros a consultor de outra empresa.
- Propostas públicas usam token aleatório de 256 bits e não carregam dados do cliente na URL.
- Propostas expiradas não podem ser aceitas no servidor.
- Registro de visualização e aceitação; IP é armazenado somente como hash com pepper.
- Logs de auditoria para eventos administrativos, login e ações LGPD.
- Endpoints de acesso, exportação e revogação de direitos do usuário autenticado.
- Cabeçalhos HTTP de segurança e política CSP.
- Cache desabilitado para respostas de dados e APIs.
- Dados financeiros com limites básicos e validação de servidor.

## LGPD: o que ainda depende da operação da empresa
A existência de controles técnicos não significa, por si só, conformidade jurídica integral com a LGPD. Antes de dados reais, a empresa deve definir e publicar sua política de privacidade, bases legais por finalidade, prazos de retenção, canal do encarregado/DPO quando aplicável, contratos com operadores, procedimento de atendimento aos titulares e regras de descarte/backup.

## Variáveis obrigatórias
- `PASSWORD_PEPPER`: segredo aleatório com pelo menos 32 caracteres. Deve ser cadastrado como variável secreta no provedor. Nunca coloque no código ou no Git.
- `ADMIN_EMAIL` e `ADMIN_PASSWORD`: opcionais para bootstrap automático; prefira o fluxo de bootstrap e remova valores temporários depois.

## Antes de produção
1. Aplicar todas as migrations.
2. Configurar `PASSWORD_PEPPER` como secret.
3. Testar separação entre dois consultores.
4. Testar separação entre duas empresas.
5. Testar proposta expirada.
6. Testar exportação/revogação/exclusão conforme política da empresa.
7. Validar política de privacidade e bases legais com profissional responsável pela LGPD.
8. Configurar backups, recuperação e monitoramento do banco.
