-- =========================================================================
-- Demo / pilot request capture
--
-- Captures inbound leads from the public /pricing page demo form.
-- Public INSERT via service role only (API route does the write); no
-- anonymous direct writes. Admin read-only via admin role.
-- =========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.demo_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Contact
  name text NOT NULL,
  email text NOT NULL,
  org text NOT NULL,
  sport text NULL,
  message text NULL,

  -- Context at submission time
  plan text NULL CHECK (plan IN ('free','pro','pro_indoor','elite') OR plan IS NULL),
  sport_env text NULL CHECK (sport_env IN ('outdoor','indoor') OR sport_env IS NULL),
  lang text NULL CHECK (lang IN ('IS','EN') OR lang IS NULL),
  source text NULL,         -- 'pricing_page', 'home', 'coach_invite', etc.
  user_agent text NULL,
  referrer text NULL,

  -- Lifecycle
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','meeting_scheduled','pilot','won','lost','spam')),
  notes text NULL,
  assigned_to uuid NULL        -- staff user
);

CREATE INDEX IF NOT EXISTS idx_demo_requests_created_at
  ON public.demo_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_requests_status
  ON public.demo_requests(status) WHERE status <> 'spam';
CREATE INDEX IF NOT EXISTS idx_demo_requests_email
  ON public.demo_requests(lower(email));

COMMENT ON TABLE public.demo_requests IS
  'Inbound demo/pilot leads captured from public marketing pages.';

-- -------------------------------------------------------------------------
-- updated_at trigger
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demo_requests_updated_at ON public.demo_requests;
CREATE TRIGGER trg_demo_requests_updated_at
  BEFORE UPDATE ON public.demo_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------------------------
ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS entirely (writes from /api/public/demo-request).
-- No SELECT/INSERT/UPDATE policies for anon or authenticated: the public
-- cannot read this table, and only the server-side API writes to it.

-- Admin staff can read via a dedicated policy keyed on profiles.role = 'admin'.
-- (profiles table assumed to exist from earlier migrations.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY demo_requests_admin_read
        ON public.demo_requests
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
          )
        )
    $policy$;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

COMMIT;
