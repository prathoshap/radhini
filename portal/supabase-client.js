import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const configured =
  SUPABASE_URL.startsWith('http') && !SUPABASE_ANON_KEY.startsWith('PASTE_');

if (!configured) {
  console.warn('[portal] config.js still has placeholder values.');
}

export const isConfigured = configured;

export const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** Redirect to the login page unless somebody is signed in. */
export async function requireSession() {
  if (!sb) {
    document.body.innerHTML =
      '<p style="padding:40px;font-family:system-ui">Portal not configured yet — ' +
      'fill in <code>portal/config.js</code>.</p>';
    throw new Error('not configured');
  }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.replace('index.html');
    throw new Error('no session');
  }
  return session;
}
