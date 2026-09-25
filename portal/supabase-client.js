import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const configured =
  SUPABASE_URL.startsWith('http') && !SUPABASE_ANON_KEY.startsWith('PASTE_');

if (!configured) console.warn('[portal] config.js still has placeholder values.');

export const isConfigured = configured;

export const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** Is the browser currently holding the tail end of a sign-in redirect? */
export function authTokensInUrl() {
  const url = new URL(window.location.href);
  return url.hash.includes('access_token') ||
         url.hash.includes('error')        ||
         url.searchParams.has('code');
}

/**
 * Wait for the client to finish turning a redirect into a session.
 * getSession() can answer null while that exchange is still in flight,
 * which sends you straight back to the login page holding a valid link.
 */
export function waitForSession(ms = 5000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (session) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(session);
    };
    const timer = setTimeout(() => finish(null), ms);
    const { data: { subscription } } =
      sb.auth.onAuthStateChange((_event, session) => { if (session) finish(session); });
    sb.auth.getSession().then(({ data: { session } }) => { if (session) finish(session); });
  });
}

export async function requireSession() {
  if (!sb) {
    document.body.innerHTML =
      '<p style="padding:40px;font-family:system-ui">Portal not configured yet — ' +
      'fill in <code>portal/config.js</code>.</p>';
    throw new Error('not configured');
  }

  // Supabase reports link failures in the hash. Say so, rather than
  // bouncing silently and looking broken.
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (hash.get('error')) {
    const detail = hash.get('error_description') || hash.get('error');
    sessionStorage.setItem('portal:authError', decodeURIComponent(detail.replace(/\+/g, ' ')));
    window.location.replace('index.html');
    throw new Error(detail);
  }

  let session = null;
  if (authTokensInUrl()) {
    session = await waitForSession();
    // Tidy the URL so a refresh does not re-run a spent link.
    if (session) history.replaceState({}, '', window.location.pathname);
  } else {
    ({ data: { session } } = await sb.auth.getSession());
  }

  if (!session) {
    window.location.replace('index.html');
    throw new Error('no session');
  }
  return session;
}
