ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_analyses_consultant ON analyses(consultant_id);
CREATE INDEX IF NOT EXISTS idx_sales_consultant ON sales(consultant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_consultant ON tasks(consultant_id);
