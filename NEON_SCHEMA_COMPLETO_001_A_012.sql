-- Versão revisada: preserva login_attempts existente (id bigint) e corrige colisão de índice.
BEGIN;
-- CRM by Mac: migrações completas 001-012 em ordem.
-- Executar UMA VEZ no SQL Editor do Neon, em banco vazio ou após backup.
-- IMPORTANTE: verificar erros antes de usar em produção.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- 001_initial

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','consultant')) DEFAULT 'consultant',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trade_name TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#111111',
  whatsapp TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  phone TEXT,
  cpf_cnpj TEXT,
  city TEXT,
  state TEXT,
  origin TEXT,
  product TEXT,
  status TEXT NOT NULL DEFAULT 'Novo lead',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES users(id),
  lead_id UUID REFERENCES leads(id),
  code TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  product TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Em andamento',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES users(id),
  analysis_id UUID REFERENCES analyses(id),
  code TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  product TEXT NOT NULL,
  value NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Rascunho',
  expires_at TIMESTAMPTZ,
  public_token TEXT UNIQUE,
  views INTEGER NOT NULL DEFAULT 0,
  accepted_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES users(id),
  proposal_id UUID REFERENCES proposals(id),
  code TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  value NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'Pendente',
  sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  priority TEXT DEFAULT 'Média',
  status TEXT DEFAULT 'Pendente',
  lead_id UUID REFERENCES leads(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_consultant ON leads(consultant_id);
CREATE INDEX IF NOT EXISTS idx_proposals_token ON proposals(public_token);


-- 002_company

ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_analyses_consultant ON analyses(consultant_id);
CREATE INDEX IF NOT EXISTS idx_sales_consultant ON sales(consultant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_consultant ON tasks(consultant_id);


-- 003_lgpd

CREATE TABLE IF NOT EXISTS privacy_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subject_name TEXT,
  subject_contact TEXT,
  purpose TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  policy_version TEXT NOT NULL DEFAULT '1.0',
  consented BOOLEAN NOT NULL DEFAULT TRUE,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT,
  resource_id TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_privacy_company ON privacy_consents(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_company_created ON audit_logs(company_id,created_at DESC);


-- 004_security

CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_analyses_company_created ON analyses(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_company_created ON proposals(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_company_sold ON sales(company_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_company_due ON tasks(company_id, due_at);
CREATE INDEX IF NOT EXISTS idx_privacy_user_consented ON privacy_consents(user_id, consented_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_logs(user_id, created_at DESC);


-- 005_security_lgpd

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS accepted_ip_hash TEXT;
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL,
  email TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key_created ON login_attempts(key_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_expiration ON proposals(expires_at);


-- 006_crm_intelligence

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  cpf_cnpj TEXT,
  city TEXT,
  state TEXT,
  origin TEXT,
  product TEXT,
  status TEXT NOT NULL DEFAULT 'Ativo',
  tags TEXT[] NOT NULL DEFAULT '{}',
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'WhatsApp',
  direction TEXT NOT NULL CHECK(direction IN ('in','out')) DEFAULT 'out',
  message TEXT NOT NULL,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'registrada',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  revenue_target NUMERIC(14,2) NOT NULL DEFAULT 0,
  sales_target INTEGER NOT NULL DEFAULT 0,
  proposals_target INTEGER NOT NULL DEFAULT 0,
  analyses_target INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, consultant_id, period_start, period_end)
);
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_value TEXT,
  action_type TEXT NOT NULL,
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  resource TEXT,
  resource_id TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS proposal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS proposal_logo_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS privacy_email TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS dpo_name TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS dpo_email TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS retention_days INTEGER NOT NULL DEFAULT 730;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_clients_company_owner ON clients(company_id, owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(company_id, phone);
CREATE INDEX IF NOT EXISTS idx_activities_client ON activities(company_id, client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_communications_client ON communications(company_id, client_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_goals_period ON goals(company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(company_id, user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_events_proposal ON proposal_events(proposal_id, created_at DESC);


-- 007_proposal_engagement

CREATE TABLE IF NOT EXISTS proposal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  session_key TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  active_seconds INTEGER NOT NULL DEFAULT 0,
  max_scroll_percent INTEGER NOT NULL DEFAULT 0,
  reached_end BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(proposal_id, session_key)
);

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS total_active_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS max_scroll_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS reached_end BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_proposal_sessions_proposal ON proposal_sessions(proposal_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_sessions_company ON proposal_sessions(company_id, opened_at DESC);


-- 008_workflow_assistance

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS parent_proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS root_proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS version_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS decline_reason TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS decline_note TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_proposals_root_version ON proposals(company_id,root_proposal_id,version_no);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resource TEXT NOT NULL,
  resource_id UUID,
  action TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_company_created ON audit_log(company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource,resource_id);


-- 009_creator_platform


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


-- 010_creator_2fa


ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_codes JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS two_factor_verified_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS elevated_until TIMESTAMPTZ;


-- 011_campaigns_opportunities


-- V10 — Campanhas promocionais + central inteligente de oportunidades

ALTER TABLE companies ADD COLUMN IF NOT EXISTS campaign_spokesperson_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS campaign_default_pix_discount NUMERIC(6,2) NOT NULL DEFAULT 30;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS campaign_default_card_discount NUMERIC(6,2) NOT NULL DEFAULT 20;

CREATE TABLE IF NOT EXISTS campaign_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  stale_lead_days INTEGER NOT NULL DEFAULT 3,
  analysis_followup_days INTEGER NOT NULL DEFAULT 3,
  proposal_followup_days INTEGER NOT NULL DEFAULT 2,
  coupon_suggestion_days INTEGER NOT NULL DEFAULT 5,
  activation_repeat_days INTEGER NOT NULL DEFAULT 2,
  max_activation_attempts INTEGER NOT NULL DEFAULT 3,
  max_discount_without_approval NUMERIC(6,2) NOT NULL DEFAULT 30,
  max_campaign_discount NUMERIC(6,2) NOT NULL DEFAULT 50,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK(scope IN ('platform','company')) DEFAULT 'company',
  name TEXT NOT NULL,
  theme TEXT,
  product TEXT,
  weekday INTEGER,
  special_month INTEGER,
  special_day INTEGER,
  headline TEXT NOT NULL,
  message_template TEXT NOT NULL,
  art_headline TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_templates_company_active
  ON campaign_templates(company_id,active,priority DESC);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  template_id UUID REFERENCES campaign_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  theme TEXT,
  headline TEXT NOT NULL,
  message_template TEXT NOT NULL,
  art_headline TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  max_discount NUMERIC(6,2) NOT NULL DEFAULT 50,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_company_period
  ON campaigns(company_id,active,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS campaign_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  consultant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  product TEXT,
  normal_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  pix_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  card_total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  card_installments INTEGER NOT NULL DEFAULT 1,
  card_installment_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(6,2),
  status TEXT NOT NULL DEFAULT 'Liberado',
  public_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  first_viewed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  views INTEGER NOT NULL DEFAULT 0,
  expired_reaccess_count INTEGER NOT NULL DEFAULT 0,
  message_used TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_vouchers_company_consultant
  ON campaign_vouchers(company_id,consultant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_vouchers_token ON campaign_vouchers(public_token);

CREATE TABLE IF NOT EXISTS campaign_voucher_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  voucher_id UUID NOT NULL REFERENCES campaign_vouchers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaign_voucher_events_voucher
  ON campaign_voucher_events(voucher_id,created_at DESC);

CREATE TABLE IF NOT EXISTS lead_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  activation_type TEXT NOT NULL DEFAULT 'followup',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_activations_lead_created
  ON lead_activations(company_id,lead_id,created_at DESC);

-- Templates padrão ligados a revisão contratual.
INSERT INTO campaign_templates(scope,name,theme,weekday,headline,message_template,art_headline,priority)
SELECT 'platform','Segunda — Comece revisando','Revisão contratual',1,
'📊 Comece a semana revisando o que você está pagando',
'📊✨ *COMECE A SEMANA REVISANDO SEU CONTRATO!*%0A%0AOi, {{cliente}}! Uma nova semana começou e essa pode ser a hora certa de entender se você está pagando além do necessário no seu contrato.%0A%0A💚 Seu atendimento possui uma condição promocional disponível:%0A💰 *{{pix}} à vista via PIX*%0A💳 ou *{{cartao_total}} parcelado em {{parcelas}}x de {{parcela}} no cartão de crédito*%0A%0A⏰ Válida até {{validade}}.%0AQuer que eu te envie o link para visualizar e aceitar sua condição?',
'REVISE SEU CONTRATO • CONDIÇÃO DE HOJE',10
WHERE NOT EXISTS (SELECT 1 FROM campaign_templates WHERE scope='platform' AND name='Segunda — Comece revisando');

INSERT INTO campaign_templates(scope,name,theme,weekday,headline,message_template,art_headline,priority)
SELECT 'platform','Terça — Olhe os números','Revisão contratual',2,
'🔎 Hoje é dia de olhar os números do seu contrato com mais atenção',
'🔎📑 *SEU CONTRATO MERECE ATENÇÃO!*%0A%0AOi, {{cliente}}! Hoje liberamos uma condição especial para clientes que já iniciaram atendimento de revisão contratual.%0A%0A💰 *{{pix}} à vista via PIX*%0A💳 ou *{{cartao_total}} em {{parcelas}}x de {{parcela}} no cartão de crédito*%0A%0A✨ Sua condição fica disponível até {{validade}}.%0APosso te encaminhar o link?',
'OLHE OS NÚMEROS DO SEU CONTRATO',10
WHERE NOT EXISTS (SELECT 1 FROM campaign_templates WHERE scope='platform' AND name='Terça — Olhe os números');

INSERT INTO campaign_templates(scope,name,theme,weekday,headline,message_template,art_headline,priority)
SELECT 'platform','Quarta — Economia contratual','Revisão contratual',3,
'💰 Meio da semana: hora de buscar economia no seu contrato',
'💰📄 *MEIO DA SEMANA COM CONDIÇÃO ESPECIAL!*%0A%0AOi, {{cliente}}! Se existe possibilidade de reduzir custos no seu contrato, vale a pena dar continuidade à análise.%0A%0A🎟️ Hoje seu atendimento recebeu uma condição promocional:%0A💚 *{{pix}} à vista via PIX*%0A💳 ou *{{cartao_total}} parcelado em {{parcelas}}x de {{parcela}} no cartão de crédito*%0A%0A⏰ Disponível até {{validade}}.',
'ECONOMIA CONTRATUAL • HOJE',10
WHERE NOT EXISTS (SELECT 1 FROM campaign_templates WHERE scope='platform' AND name='Quarta — Economia contratual');

INSERT INTO campaign_templates(scope,name,theme,weekday,headline,message_template,art_headline,priority)
SELECT 'platform','Quinta — Segunda análise','Revisão contratual',4,
'📄 Seu contrato merece uma segunda análise',
'📄✨ *UMA SEGUNDA ANÁLISE PODE FAZER DIFERENÇA!*%0A%0AOi, {{cliente}}! Nem sempre as condições do contrato continuam sendo as melhores. Hoje temos uma condição promocional para você retomar seu atendimento.%0A%0A💰 *{{pix}} à vista via PIX*%0A💳 ou *{{cartao_total}} em {{parcelas}}x de {{parcela}} no cartão de crédito*%0A%0A⏰ Válida até {{validade}}.%0AQuer que eu libere seu link?',
'RETOME SUA REVISÃO CONTRATUAL',10
WHERE NOT EXISTS (SELECT 1 FROM campaign_templates WHERE scope='platform' AND name='Quinta — Segunda análise');

INSERT INTO campaign_templates(scope,name,theme,weekday,headline,message_template,art_headline,priority)
SELECT 'platform','Sexta — Fechamento','Revisão contratual',5,
'🔥 Antes de encerrar a semana, revise o que você está pagando',
'🔥📑 *SEXTA COM CONDIÇÃO ESPECIAL PARA SUA REVISÃO!*%0A%0AOi, {{cliente}}! Antes de encerrar a semana, seu atendimento recebeu uma condição promocional para dar continuidade à revisão contratual.%0A%0A💰 *{{pix}} à vista via PIX*%0A💳 ou *{{cartao_total}} parcelado em {{parcelas}}x de {{parcela}} no cartão de crédito*%0A%0A⏰ Essa condição fica disponível até {{validade}}.',
'SEXTA DA REVISÃO • CONDIÇÃO ESPECIAL',10
WHERE NOT EXISTS (SELECT 1 FROM campaign_templates WHERE scope='platform' AND name='Sexta — Fechamento');

INSERT INTO campaign_templates(scope,name,theme,special_month,special_day,headline,message_template,art_headline,priority)
SELECT 'platform','Dia do Cliente','Data especial',9,15,
'💙 Dia do Cliente: uma condição exclusiva para o seu atendimento',
'💙✨ *DIA DO CLIENTE!*%0A%0AOi, {{cliente}}! Hoje nossa condição especial é para quem já confiou seus dados para uma análise contratual.%0A%0A🎟️ Seu atendimento recebeu um benefício promocional:%0A💰 *{{pix}} à vista via PIX*%0A💳 ou *{{cartao_total}} parcelado em {{parcelas}}x de {{parcela}} no cartão de crédito*%0A%0A⏰ Válido até {{validade}}.',
'DIA DO CLIENTE • BENEFÍCIO EXCLUSIVO',100
WHERE NOT EXISTS (SELECT 1 FROM campaign_templates WHERE scope='platform' AND name='Dia do Cliente');


-- 012_whatsapp_ai

-- Execute depois das migrações 001 a 011. Números pertencem à empresa.
CREATE TABLE IF NOT EXISTS wa_numbers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 phone_number_id TEXT NOT NULL UNIQUE, display_phone TEXT NOT NULL, label TEXT,
 consultant_id UUID REFERENCES users(id) ON DELETE SET NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS wa_contacts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 phone TEXT NOT NULL, name TEXT, consultant_id UUID REFERENCES users(id) ON DELETE SET NULL,
 opted_in BOOLEAN NOT NULL DEFAULT FALSE, opted_in_at TIMESTAMPTZ, opted_out_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_id,phone));
CREATE TABLE IF NOT EXISTS wa_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 number_id UUID NOT NULL REFERENCES wa_numbers(id) ON DELETE CASCADE,
 contact_id UUID REFERENCES wa_contacts(id) ON DELETE SET NULL,
 provider_message_id TEXT UNIQUE, direction TEXT NOT NULL CHECK(direction IN ('in','out')),
 message_type TEXT NOT NULL DEFAULT 'text', content TEXT, status TEXT NOT NULL DEFAULT 'received',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS wa_messages_thread ON wa_messages(company_id,number_id,contact_id,created_at DESC);
CREATE TABLE IF NOT EXISTS wa_ai_settings (
 company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
 enabled BOOLEAN NOT NULL DEFAULT FALSE, greeting TEXT NOT NULL DEFAULT 'Olá! Você gostaria de informações sobre revisão contratual?',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

COMMIT;
