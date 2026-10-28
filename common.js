// Shared by index.html (customers, read-only) and staff.html (the stall's own phone).
// All queue state lives in one Firestore document: shops/yumijia.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getFirestore, connectFirestoreEmulator, doc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBCcaV-LdhrH_gGxiyX2wEhCiFqrX3mS4Q',
  authDomain: 'yumijia-28c59.firebaseapp.com',
  projectId: 'yumijia-28c59',
  storageBucket: 'yumijia-28c59.firebasestorage.app',
  messagingSenderId: '695550465201',
  appId: '1:695550465201:web:11795c8faed1769f083e90'
};

// ?emu on localhost talks to the local Firebase emulators instead of the real project (tests only).
export const EMU = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('emu');
export const app = initializeApp(EMU ? { ...firebaseConfig, projectId: 'demo-yumijia', apiKey: 'fake' } : firebaseConfig);
export const db = getFirestore(app);
if (EMU) connectFirestoreEmulator(db, '127.0.0.1', 8080);
export const shopRef = doc(db, 'shops', 'yumijia');

export const MAP = 'https://maps.app.goo.gl/Hf1Q8FgP2j67hbAw6';
export const DEFAULTS = {
  shop: '玉米家', area: '南機場夜市',
  addr: '臺北市中正區中華路二段315巷5弄', phone: '0931 504 865', hours: '23:30',
  line: '', base: 15, per: 4,
  issued: 0, ready: [], done: [], cancel: [], day: '', undo: null
};

// Fill in anything missing so pages never trip over an older or partial document.
export function normalize(data) {
  const S = { ...DEFAULTS, ...(data || {}) };
  ['ready', 'done', 'cancel'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });
  S.issued = Math.max(0, Number(S.issued) || 0);
  return S;
}

export function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  } catch (e) { return null; }
}
export function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// The business day rolls over at 06:00 Taipei time, so a night that runs past midnight stays one day.
export function today() {
  const d = new Date(Date.now() - 6 * 3600e3);
  try { return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }); } catch (e) { return new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10); }
}
export function hhmm(ts) {
  if (!ts) return '尚未開始';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  try { return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' }); } catch (e) { return d.toTimeString().slice(0, 5); }
}

export function waiting(S) {
  const out = [];
  for (let i = 1; i <= S.issued; i++) {
    if (!S.ready.includes(i) && !S.done.includes(i) && !S.cancel.includes(i)) out.push(i);
  }
  return out;
}
export function est(S, ahead) { return Number(S.base) + ahead * Number(S.per); }
export function status(S, n) {
  if (!n) return null;
  if (n > S.issued) return { k: 'notyet' };
  if (S.ready.includes(n)) return { k: 'ready' };
  if (S.done.includes(n)) return { k: 'done' };
  if (S.cancel.includes(n)) return { k: 'cancel' };
  const w = waiting(S);
  return { k: 'wait', ahead: w.filter(x => x < n).length, total: w.length, list: w };
}

const LOGO = '<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><path d="M20 58c-6-10-6-26 2-40 3 14 6 26 10 40z" fill="#5E8C33"/><path d="M44 58c6-10 6-26-2-40-3 14-6 26-10 40z" fill="#4A7629"/><ellipse cx="32" cy="30" rx="11" ry="25" fill="#F5B50A"/><g fill="#FFD95A">' +
  (() => { let s = ''; for (let r = 0; r < 9; r++) for (let c = 0; c < 3; c++) s += '<ellipse cx="' + (25.5 + c * 6.5) + '" cy="' + (11 + r * 4.6).toFixed(1) + '" rx="2.4" ry="1.9"/>'; return s; })() +
  '</g><path d="M32 58c-4-8-12-12-16-26 8 8 12 14 16 26zm0 0c4-8 12-12 16-26-8 8-12 14-16 26z" fill="#6E9E3C"/></svg>';

export function headerHtml(S, extraBadge) {
  return '<header class="sign"><div class="lanterns"></div><div class="wrap"><div class="sign-in">' + LOGO +
    '<div class="sign-txt"><p class="eyebrow">' + esc(S.area) + ' · CORN HOUSE</p><h1 class="shop">' + esc(S.shop) + '</h1></div></div>' +
    '<div class="badges"><span class="badge"><span class="dot"></span>傍晚營業・至 ' + esc(S.hours) + '</span>' +
    '<span class="badge hot">2019–2020 米其林餐盤推薦</span>' + (extraBadge || '') + '</div></div></header>';
}

let toastT = null;
export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
}
