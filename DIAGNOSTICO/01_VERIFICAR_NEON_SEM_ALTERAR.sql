-- SOMENTE LEITURA. Execute no Neon > SQL Editor, banco CRMbymac, branch production.
SELECT current_database() AS banco, current_schema() AS esquema;
SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;
SELECT x.tabela, to_regclass('public.'||x.tabela) IS NOT NULL AS existe
FROM (VALUES ('users'),('sessions'),('login_attempts'),('companies'),('leads'),('analyses'),('proposals'),('sales'),('audit_logs')) x(tabela);
SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('users','sessions','login_attempts','companies')
ORDER BY table_name,ordinal_position;
