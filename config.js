/* Supabase connection. Safe to be public — the anon key is meant for the browser,
   and row-level security controls access (public can read places, add suggestions).
   Update resources in Supabase and the app picks them up with no code change. */
window.SUPABASE_URL = "https://rhrrvateyjkdvewpmhhl.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJocnJ2YXRleWprZHZld3BtaGhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5NTQ5MDAsImV4cCI6MjEwNTUzMDkwMH0.E-BRyehtn0bqsHxBbt1YLkNOaaCqS3TMBL_liWEuYC0";
