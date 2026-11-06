
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
