-- Supabase may apply default function grants directly to authenticated.
-- Only the anon gateway role needs RPC access; the RPC separately validates the gn-scoped CI token.
revoke execute on function public.gn_import_catalog(jsonb,text) from authenticated;
