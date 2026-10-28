// Creates staff@yumijia.app / test-only-123456 in the Auth EMULATOR only. Idempotent.
// Run: node seed-staff.mjs   (emulators must be running)
const BASE = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const EMAIL = 'staff@yumijia.app';
const PASSWORD = 'test-only-123456';

async function call(path, body) {
  const res = await fetch(`${BASE}/${path}?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: await res.json() };
}

const up = await call('accounts:signUp', { email: EMAIL, password: PASSWORD, returnSecureToken: true });
if (up.ok) {
  console.log(`created ${EMAIL} (uid ${up.json.localId})`);
} else if (up.json?.error?.message === 'EMAIL_EXISTS') {
  const signIn = await call('accounts:signInWithPassword', { email: EMAIL, password: PASSWORD, returnSecureToken: true });
  if (!signIn.ok) throw new Error(`user exists but sign-in failed: ${JSON.stringify(signIn.json)}`);
  console.log(`already exists: ${EMAIL} (uid ${signIn.json.localId})`);
} else {
  throw new Error(`signUp failed: ${JSON.stringify(up.json)}`);
}
