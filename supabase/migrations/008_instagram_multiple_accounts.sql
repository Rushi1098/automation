-- Drop the unique constraint to allow multiple credentials per platform (e.g. multiple Instagram accounts)
ALTER TABLE public.platform_credentials DROP CONSTRAINT IF EXISTS platform_credentials_user_id_platform_key;

-- Link posts to a specific platform credential
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS platform_credential_id UUID REFERENCES public.platform_credentials(id) ON DELETE SET NULL;
