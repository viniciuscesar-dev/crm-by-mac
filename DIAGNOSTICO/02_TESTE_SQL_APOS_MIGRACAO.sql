-- Execute SOMENTE depois de aplicar migrações corretamente. Somente leitura.
SELECT 'users' AS tabela, COUNT(*) AS registros FROM users
UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL SELECT 'login_attempts', COUNT(*) FROM login_attempts;
SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' ORDER BY ordinal_position;
