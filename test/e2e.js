'use strict';
// Tes alur menyeluruh terhadap server yang sedang berjalan. Pakai database KOSONG/uji (menjalankan seed demo).
//   BASE_URL=http://localhost:3000 npm run test:e2e
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

function client() {
  const jar = {};
  const store = (res) => {
    for (const c of res.headers.getSetCookie?.() || []) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      jar[kv.slice(0, i)] = kv.slice(i + 1);
    }
  };
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method, redirect: 'manual',
      headers: { cookie: cookie(), ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...headers },
      body: body ? new URLSearchParams(body).toString() : undefined,
    });
    store(res);
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), text };
  };
  const csrf = async (path) => {
    const r = await call('GET', path);
    const m = r.text.match(/name="_csrf" value="([0-9a-f]+)"/);
    assert.ok(m, `token CSRF tidak ada di ${path}`);
    return m[1];
  };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), csrf };
}

let n = 0;
const ok = (name) => console.log(`ok ${++n} - ${name}`);
const answers = { i1: '3', i2: '3', i3: '2', i4: '1', i5: '4', i6: '3' };

(async () => {
  const email = process.env.ADMIN_EMAIL || 'admin@psychearly.test';
  const pass = process.env.ADMIN_PASSWORD || 'Psychearly#2026';

  // --- Anonim ---
  const anon = client();
  for (const p of ['/dashboard', '/individuals', '/individuals/1', '/communities', '/assessments/1']) {
    const r = await anon.get(p);
    assert.equal(r.status, 302, p);
    assert.equal(r.location, '/login', p);
  }
  ok('halaman pengelola mengalihkan anonim ke /login');

  assert.equal((await anon.get('/')).status, 200);
  assert.equal((await anon.get('/login')).status, 200);
  assert.equal((await anon.get('/tidak-ada')).status, 404);
  ok('halaman publik 200, rute tidak dikenal 404');

  // --- CSRF ---
  const r403 = await anon.post('/checkin', { nim: 'ZZ99001', community_id: '1', consent: '1', ...answers });
  assert.equal(r403.status, 403);
  ok('POST tanpa token CSRF ditolak 403');

  // --- Check-in ---
  const form = await anon.get('/checkin');
  const optId = form.text.match(/<option value="(\d+)"/)[1];
  assert.ok(form.text.includes('Satu NIM hanya bisa mengisi satu kali per bulan'));
  const tok = await anon.csrf('/checkin');
  const nim = 'T' + String(Date.now()).slice(-8);

  let r = await anon.post('/checkin', { _csrf: tok, nim, community_id: optId, consent: '1', ...answers, i2: '9' });
  assert.equal(r.status, 302); assert.equal(r.location, '/checkin');
  assert.match((await anon.get('/checkin')).text, /Lengkapi NIM/);
  ok('jawaban di luar 0-4 ditolak');

  r = await anon.post('/checkin', { _csrf: tok, nim, community_id: optId, ...answers });
  assert.equal(r.location, '/checkin');
  assert.match((await anon.get('/checkin')).text, /Lengkapi NIM/);
  ok('tanpa persetujuan ditolak');

  r = await anon.post('/checkin', { _csrf: tok, nim: 'a b', community_id: optId, consent: '1', ...answers });
  assert.equal(r.location, '/checkin');
  ok('NIM terlalu pendek ditolak');

  r = await anon.post('/checkin', { _csrf: tok, nim: nim.toLowerCase() + ' ', community_id: optId, consent: '1', ...answers });
  assert.equal(r.status, 302); assert.equal(r.location, '/checkin/terima-kasih');
  assert.equal((await anon.get('/checkin/terima-kasih')).status, 200);
  ok('check-in valid diterima (NIM dinormalisasi huruf besar tanpa spasi)');

  const tok2 = await anon.csrf('/checkin');
  r = await anon.post('/checkin', { _csrf: tok2, nim, community_id: optId, consent: '1', ...answers });
  assert.equal(r.location, '/checkin');
  const page = (await anon.get('/checkin')).text;
  assert.match(page, new RegExp(`NIM ${nim} sudah mengisi check-in`));
  assert.match(page, /bisa diisi mulai 1 /);
  ok('NIM yang sama tidak bisa mengisi lagi pada bulan yang sama');

  // dua pengiriman bersamaan dengan NIM yang sama: hanya satu yang berhasil
  const nim2 = 'C' + String(Date.now()).slice(-8);
  const tok3 = await anon.csrf('/checkin');
  const res = await Promise.all([1, 2, 3, 4].map(() => anon.post('/checkin', { _csrf: tok3, nim: nim2, community_id: optId, consent: '1', ...answers })));
  assert.equal(res.filter((x) => x.location === '/checkin/terima-kasih').length, 1);
  ok('4 pengiriman bersamaan dengan NIM sama: tepat 1 diterima');

  // --- Login ---
  const adm = client();
  let t = await adm.csrf('/login');
  r = await adm.post('/login', { _csrf: t, email, password: 'salah' });
  assert.equal(r.location, '/login');
  assert.match((await adm.get('/login')).text, /Email atau kata sandi salah/);
  ok('login dengan kata sandi salah ditolak');

  // pengalihan setelah login ke halaman yang dituju
  r = await adm.get('/individuals?status=RED');
  assert.equal(r.location, '/login');
  t = await adm.csrf('/login');
  r = await adm.post('/login', { _csrf: t, email, password: pass });
  assert.equal(r.status, 302);
  assert.equal(r.location, '/individuals?status=RED');
  ok('login benar, kembali ke halaman yang dituju');

  // --- Dashboard ---
  const dash = await adm.get('/dashboard');
  assert.equal(dash.status, 200);
  assert.match(dash.text, /Seluruh universitas/);
  assert.match(dash.text, /Sebaran status individu/);
  assert.match(dash.text, /Semua komunitas/);
  ok('dashboard keseluruhan 200');

  const cid = dash.text.match(/dashboard\?community=(\d+)&(?:amp;)?period=/)[1];
  const dc = await adm.get(`/dashboard?community=${cid}`);
  assert.equal(dc.status, 200);
  assert.match(dc.text, /Tinjau dan catat tindakan/);
  const aid = dc.text.match(/\/assessments\/(\d+)"/)[1];
  ok('dashboard per komunitas 200');

  assert.equal((await adm.get('/dashboard?period=1999-01&community=abc')).status, 200);
  ok('parameter periode/komunitas tak valid tidak merusak halaman');

  // --- Individu ---
  const ind = await adm.get('/individuals');
  assert.equal(ind.status, 200);
  assert.match(ind.text, /Status check-in per mahasiswa/);
  const sid = ind.text.match(/\/individuals\/(\d+)"/)[1];
  assert.equal((await adm.get('/individuals?status=RED&community=' + cid + '&page=2')).status, 200);
  const found = await adm.get('/individuals?q=' + nim);
  assert.match(found.text, new RegExp(nim));
  assert.equal((await adm.get('/individuals?q=%25')).status, 200);
  const det = await adm.get('/individuals/' + sid);
  assert.equal(det.status, 200);
  assert.match(det.text, /Saran tindak lanjut/);
  assert.equal((await adm.get('/individuals/999999')).status, 404);
  assert.equal((await adm.get('/individuals/abc')).status, 404);
  ok('menu individu: daftar, filter, pencarian, detail, 404');

  // --- Peninjauan ---
  assert.equal((await adm.get('/assessments/' + aid)).status, 200);
  t = await adm.csrf('/assessments/' + aid);
  r = await adm.post(`/assessments/${aid}/review`, { _csrf: t, review_status: 'ACTION_PLANNED', responsible_unit: 'Unit Uji', review_note: 'Catatan uji' });
  assert.equal(r.status, 302);
  const after = await adm.get('/assessments/' + aid);
  assert.match(after.text, /Peninjauan disimpan/);
  assert.match(after.text, /Unit Uji/);
  r = await adm.post(`/assessments/${aid}/review`, { _csrf: t, review_status: 'BEBAS' });
  assert.equal(r.status, 302);
  assert.match((await adm.get('/assessments/' + aid)).text, /Status peninjauan tidak valid/);
  ok('peninjauan tersimpan dan divalidasi');

  // peninjauan bertahan setelah penilaian dihitung ulang (check-in baru di komunitas yang sama)
  const nim3 = 'R' + String(Date.now()).slice(-8);
  const tok4 = await anon.csrf('/checkin');
  r = await anon.post('/checkin', { _csrf: tok4, nim: nim3, community_id: cid, consent: '1', ...answers });
  assert.equal(r.location, '/checkin/terima-kasih');
  assert.match((await adm.get('/assessments/' + aid)).text, /Unit Uji/);
  ok('hasil peninjauan tidak tertimpa perhitungan ulang otomatis');

  // --- Konteks kalender ---
  const cur = dash.text.match(/name="period_id" value="(\d+)"/)[1];
  t = await adm.csrf('/dashboard');
  await adm.post('/dashboard/context', { _csrf: t, period_id: cur, calendar_context: 'Ujian uji coba' });
  assert.match((await adm.get('/dashboard')).text, /Ujian uji coba/);
  r = await adm.post('/dashboard/context', { _csrf: t, period_id: cur, calendar_context: 'x'.repeat(300) });
  assert.match((await adm.get('/dashboard')).text, /maksimal 255/);
  ok('konteks kalender disimpan dan divalidasi');

  // --- Komunitas ---
  assert.equal((await adm.get('/communities')).status, 200);
  t = await adm.csrf('/communities/new');
  const code = 'UJI' + String(Date.now()).slice(-5);
  r = await adm.post('/communities', { _csrf: t, code, name: 'Komunitas Uji', invited_count: '50', is_active: '1' });
  assert.equal(r.location, '/communities');
  assert.match((await adm.get('/communities')).text, new RegExp(code));
  r = await adm.post('/communities', { _csrf: t, code, name: 'Duplikat', invited_count: '5' });
  assert.match((await adm.get('/communities/new')).text, /Kode sudah dipakai/);
  r = await adm.post('/communities', { _csrf: t, code: 'ok1', name: 'X', invited_count: '-3' });
  assert.match((await adm.get('/communities/new')).text, /bilangan bulat/);
  const list = (await adm.get('/communities')).text;
  const newId = list.match(new RegExp(`${code}[\\s\\S]*?/communities/(\\d+)/edit`))[1];
  assert.equal((await adm.get(`/communities/${newId}/edit`)).status, 200);
  r = await adm.post(`/communities/${newId}`, { _csrf: t, code, name: 'Komunitas Uji 2', invited_count: '60' });
  assert.equal(r.location, '/communities');
  assert.match((await adm.get('/communities')).text, /Komunitas Uji 2/);
  ok('CRUD komunitas dan validasinya');

  // --- Demo (hanya non-production) ---
  if (process.env.NODE_ENV !== 'production') {
    t = await adm.csrf('/dashboard');
    r = await adm.post('/dashboard/demo', { _csrf: t });
    assert.equal(r.location, '/dashboard');
    assert.match((await adm.get('/dashboard')).text, /Data demo dimuat/);
    ok('muat ulang data demo');
  }

  // --- Logout ---
  t = await adm.csrf('/dashboard');
  r = await adm.post('/logout', { _csrf: t });
  assert.equal(r.location, '/login');
  assert.match((await adm.get('/login')).text, /Kamu sudah keluar/);
  assert.equal((await adm.get('/dashboard')).status, 302);
  ok('logout mengakhiri sesi');

  // --- Pembatas login ---
  const brute = client();
  let blocked = false;
  for (let i = 0; i < 8; i++) {
    const tk = await brute.csrf('/login');
    await brute.post('/login', { _csrf: tk, email, password: 'x' + i });
    if (/Terlalu banyak percobaan/.test((await brute.get('/login')).text)) { blocked = true; break; }
  }
  assert.ok(blocked);
  ok('login dibatasi setelah 5 percobaan per menit');

  console.log(`\n${n} skenario lulus`);
})().catch((e) => { console.error('\nGAGAL:', e.message); process.exit(1); });
