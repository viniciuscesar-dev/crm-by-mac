
-- Creator / platform control plane + sandbox
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('creator','platform_staff','admin','consultant'));

ALTER TABLE companies ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan_code TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS user_limit INTEGER NOT NULL DEFAULT 30;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS platform_plans (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 code TEXT UNIQUE NOT NULL,
 name TEXT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 monthly_price NUMERIC(14,2) NOT NULL DEFAULT 0,
 user_limit INTEGER NOT NULL DEFAULT 30,
 features JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO platform_plans(code,name,user_limit,features) VALUES
 ('custom','Personalizado',30,'{"document_ai":true,"advanced_reports":true,"automations":true}'::jsonb)
ON CONFLICT(code) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_settings (
 key TEXT PRIMARY KEY,
 value JSONB NOT NULL DEFAULT '{}'::jsonb,
 updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_impersonations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 ended_at TIMESTAMPTZ,
 reason TEXT
);

CREATE TABLE IF NOT EXISTS platform_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
 type TEXT NOT NULL,
 title TEXT NOT NULL,
 details JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_events_created ON platform_events(created_at DESC);

CREATE TABLE IF NOT EXISTS integration_usage (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
 user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 integration TEXT NOT NULL,
 operation TEXT NOT NULL,
 status TEXT NOT NULL,
 units INTEGER NOT NULL DEFAULT 1,
 estimated_cost NUMERIC(14,6),
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_integration_usage_company_created ON integration_usage(company_id,created_at DESC);

CREATE TABLE IF NOT EXISTS support_cases (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
 opened_by UUID REFERENCES users(id) ON DELETE SET NULL,
 title TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'Aberto',
 priority TEXT NOT NULL DEFAULT 'Normal',
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sandbox_runs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 creator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 action TEXT NOT NULL,
 details JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
