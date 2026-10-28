// Rules tests against the running Firestore emulator (start with ./start-emulators.sh).
// Run: node --test rules.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, setLogLevel, updateDoc } from 'firebase/firestore';

setLogLevel('silent'); // expected PERMISSION_DENIED noise

const RULES = fileURLToPath(new URL('../firestore.rules', import.meta.url));
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-yumijia',
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync(RULES, 'utf8') },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'shops/yumijia'), { current: 1, next: 5 }));
});

const anon = () => env.unauthenticatedContext().firestore();
const staff = () => env.authenticatedContext('staff-uid', { email: 'staff@yumijia.app', email_verified: true }).firestore();
const other = () => env.authenticatedContext('other-uid', { email: 'someone@example.com', email_verified: true }).firestore();

test('unauthenticated read of shops/yumijia is allowed', async () => {
  const snap = await assertSucceeds(getDoc(doc(anon(), 'shops/yumijia')));
  if (snap.data().current !== 1) throw new Error('unexpected data');
});

test('unauthenticated write of shops/yumijia is denied', async () => {
  await assertFails(setDoc(doc(anon(), 'shops/yumijia'), { current: 2 }));
  await assertFails(updateDoc(doc(anon(), 'shops/yumijia'), { current: 2 }));
});

test('staff@yumijia.app can write shops/yumijia', async () => {
  await assertSucceeds(setDoc(doc(staff(), 'shops/yumijia'), { current: 2, next: 6 }));
  await assertSucceeds(updateDoc(doc(staff(), 'shops/yumijia'), { current: 3 }));
});

test('signed-in user with another email is denied write', async () => {
  await assertFails(setDoc(doc(other(), 'shops/yumijia'), { current: 2 }));
  await assertFails(updateDoc(doc(other(), 'shops/yumijia'), { current: 2 }));
});

test('other doc paths are denied even for staff', async () => {
  for (const p of ['shops/other', 'foo/bar', 'shops/yumijia/sub/x']) {
    await assertFails(setDoc(doc(staff(), p), { x: 1 }));
    await assertFails(getDoc(doc(anon(), p)));
  }
});
