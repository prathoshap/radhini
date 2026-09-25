import { sb, isConfigured, authTokensInUrl, waitForSession } from './supabase-client.js';

const form   = document.getElementById('loginForm');
const email  = document.getElementById('email');
const button = document.getElementById('submitBtn');
const msg    = document.getElementById('msg');

function say(text, kind) {
  msg.textContent = text;
  msg.className = 'msg is-on ' + kind;
}

// Surface whatever went wrong on the way back from a sign-in link.
const carried = sessionStorage.getItem('portal:authError');
if (carried) {
  sessionStorage.removeItem('portal:authError');
  say(carried, 'err');
}

// A sign-in link can land here rather than on app.html, depending on how
// Site URL is configured. Finish the exchange and move the person along,
// rather than showing them the form they just came from.
if (isConfigured) {
  if (authTokensInUrl()) {
    say('Signing you in…', 'ok');
    const session = await waitForSession();
    if (session) {
      window.location.replace('app.html');
    } else {
      say('That sign-in link did not work. It may have expired, or already '
        + 'been used. Request a new one below.', 'err');
      history.replaceState({}, '', window.location.pathname);
    }
  } else {
    const { data: { session } } = await sb.auth.getSession();
    if (session) window.location.replace('app.html');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isConfigured) {
    say('The portal is not connected to its database yet.', 'err');
    return;
  }

  const address = email.value.trim();
  if (!address) { say('Please enter your email address.', 'err'); return; }

  button.disabled = true;
  button.textContent = 'Sending…';

  const redirectTo = new URL('app.html', window.location.href).href;
  const { error } = await sb.auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });

  button.disabled = false;
  button.textContent = 'Send sign-in link';

  if (error) {
    // shouldCreateUser:false means unknown addresses land here. Say something
    // useful without confirming whether the address is enrolled.
    console.error(error);
    say('If that address is enrolled, a sign-in link is on its way. '
      + 'Check your inbox, and your spam folder.', 'ok');
    return;
  }

  say('Sign-in link sent. Check your inbox — and your spam folder, just in case.', 'ok');
  form.reset();
});
