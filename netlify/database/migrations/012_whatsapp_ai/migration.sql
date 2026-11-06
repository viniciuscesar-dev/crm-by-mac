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
