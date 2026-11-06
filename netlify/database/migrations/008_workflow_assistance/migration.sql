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
CREATE INDEX IF NOT EXISTS idx_audit_company_created ON audit_log(company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource,resource_id);
