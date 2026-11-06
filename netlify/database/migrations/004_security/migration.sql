CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_analyses_company_created ON analyses(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_company_created ON proposals(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_company_sold ON sales(company_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_company_due ON tasks(company_id, due_at);
CREATE INDEX IF NOT EXISTS idx_privacy_user_consented ON privacy_consents(user_id, consented_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_logs(user_id, created_at DESC);
