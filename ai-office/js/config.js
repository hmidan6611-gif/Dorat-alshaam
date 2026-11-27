// Standalone hosting (GitHub Pages + Supabase). These values are public by design: the publishable key only
// identifies the project, and every row is protected by row-level security. Secret keys (Claude, Composio)
// live in Supabase → Edge Functions → Secrets, never here.
export const STANDALONE = {
  supabaseUrl: 'https://kurlpqljtslbuqlqymoi.supabase.co',
  publishableKey: 'sb_publishable_AAVetEqcMYc70mYZATnyzQ_HT5c_eXM',
  fn: 'https://kurlpqljtslbuqlqymoi.supabase.co/functions/v1/office-api',
};
