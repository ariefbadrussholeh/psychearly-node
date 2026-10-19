# PSYCHEARLY (Node.js + Supabase)

Dashboard peringatan dini kesejahteraan mahasiswa. Mahasiswa mengisi check-in bulanan dengan NIM. Sistem menghitung, otomatis dan seketika, status **GREEN / YELLOW / RED** per mahasiswa, per komunitas (fakultas), dan untuk seluruh universitas, lalu menampilkan rekomendasi tindakan yang ditinjau manusia.

Stack: Node.js 20+ (Express 5, EJS), database **Supabase (PostgreSQL)**, Bootstrap 5.3. Tampilan, font, dan gaya sama dengan versi CodeIgniter sebelumnya (aksen soft blue + logo PSYCHEARLY).

> Prototype berbasis aturan. Bukan alat diagnosis, bukan layanan darurat, dan ambang batasnya belum divalidasi (lihat Validasi).

## Menjalankan di komputer sendiri

1. Buat project di [supabase.com](https://supabase.com). Simpan kata sandi database yang kamu isi saat membuat project.
2. Di Supabase: **Connect** (atau Project Settings > Database) > salin *connection string*. Lihat bagian "Memilih string koneksi" di bawah.
3. Di folder project:

```bash
npm install
cp .env.example .env        # isi DATABASE_URL dan SESSION_SECRET
npm run migrate             # membuat tabel (supabase/migrations/*.sql)
npm run seed:admin          # akun pengelola dari ADMIN_EMAIL / ADMIN_PASSWORD
npm run seed:demo           # opsional: data demo dari CSV contoh (MENGHAPUS data check-in)
npm run dev                 # http://localhost:3000
```

Akun awal (dari `.env`): `admin@psychearly.test` / `Psychearly#2026`. **Ganti sebelum dipakai di luar simulasi.**

Tanpa Node di komputer, skema juga bisa dibuat dengan menempel isi `supabase/migrations/20261018000001_init.sql` ke **Supabase Dashboard > SQL Editor**. Akun pengelola tetap dibuat dengan `npm run seed:admin`.

### Memilih string koneksi

Aplikasi terhubung ke database lewat koneksi Postgres dari server Node (bukan lewat API/anon key Supabase).

| Jenis | Port | Pakai bila |
|---|---|---|
| Direct connection | 5432 | Server kamu punya IPv6 (di paket gratis Supabase, direct hanya IPv6) |
| **Session pooler** | 5432 | **Server IPv4 saja dan berjalan terus-menerus** (kebanyakan hosting): pilihan paling aman |
| Transaction pooler | 6543 | Serverless/edge. Aplikasi ini tidak memakai prepared statement, jadi juga cocok |

Bentuk: `postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres`. Jika kata sandi mengandung karakter khusus (`@`, `/`, `#`), ubah menjadi %-encoding (`@` menjadi `%40`). Rujukan: [Supabase: connection strings](https://supabase.com/docs/reference/postgres/connection-strings).

### Keamanan database Supabase

Supabase membuka API publik atas semua tabel. Migrasi ini **mengaktifkan Row Level Security pada semua tabel tanpa policy**, sehingga anon key tidak bisa membaca atau menulis apa pun. Server Node memakai role `postgres` yang melewati RLS. Jangan menambahkan policy `anon` pada tabel ini, dan jangan menaruh `service_role` key di tempat umum. Data berisi NIM mahasiswa.

## Publish ke server

Aplikasi adalah proses Node biasa (bukan serverless): butuh hosting yang menjalankan `npm start` terus-menerus.

**Variabel lingkungan wajib di production**

| Variabel | Isi |
|---|---|
| `NODE_ENV` | `production` (menonaktifkan tombol data demo, error detail, dan mengaktifkan cookie aman) |
| `DATABASE_URL` | String koneksi Supabase (Session pooler untuk hosting IPv4) |
| `SESSION_SECRET` | String acak minimal 24 karakter: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `TRUST_PROXY` | `1` bila di belakang proxy hosting (Render, Railway, Koyeb, nginx). Perlu untuk cookie `secure` dan batas laju per IP |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Akun pengelola awal (dipakai `npm run seed:admin`) |
| `PORT` | Biasanya diisi otomatis oleh hosting |

**Render (paket gratis, tidur setelah tidak aktif, bangun sekitar 30-60 detik)**
1. Dorong folder ini ke GitHub, lalu di Render pilih *New > Blueprint* (memakai `render.yaml`) atau *New > Web Service*.
2. Build command `npm ci --omit=dev`, start command `npm run migrate && npm run seed:admin && npm start`.
3. Isi variabel di atas, lalu deploy.

**Railway / Koyeb / Fly.io:** sama; atau pakai `Dockerfile` yang disertakan (`docker build -t psychearly . && docker run -p 3000:3000 --env-file .env psychearly`).

**VPS sendiri:** `npm ci --omit=dev`, jalankan dengan `pm2 start src/server.js --name psychearly` (atau systemd), pasang nginx/Caddy sebagai reverse proxy dengan HTTPS, dan set `TRUST_PROXY=1`.

Catatan: paket gratis Supabase dapat menjeda project yang lama tidak aktif; cek kebijakan terbaru di dashboard Supabase. Untuk data mahasiswa sungguhan, pakai paket berbayar yang punya backup.

Pemakaian: `npm test` (tes unit logika), `npm run test:e2e` (tes alur lewat HTTP, butuh server berjalan dan database uji; `BASE_URL=http://localhost:3000`). Jangan menjalankan tes e2e pada database berisi data asli: tes ini membuat check-in dan komunitas uji serta memuat ulang data demo.

## Cara kerja sehari-hari

Tidak ada tombol "hitung", "hitung ulang", "tutup periode", atau "buka periode".

- **Periode = bulan kalender** dalam zona waktu WIB (`APP_TIMEZONE=Asia/Jakarta`). Check-in hanya diterima untuk bulan berjalan. Saat tanggal berganti, bulan baru dimulai sendiri dan bulan lalu tidak bisa diisi lagi.
- **Satu NIM, satu check-in per bulan.** Dijaga oleh `UNIQUE(period_id, student_id)` di database, bukan oleh browser. Empat pengiriman bersamaan dengan NIM sama menghasilkan tepat satu check-in.
- **Realtime.** Setiap check-in yang masuk langsung memperbarui penilaian komunitasnya. Dashboard menyegarkan bulan berjalan setiap dibuka. Status individu dan gambaran seluruh universitas dihitung langsung dari data saat halaman dibuka.
- **Bulan lalu otomatis final**, karena tidak ada check-in baru yang bisa masuk.
- **Konteks kalender akademik** (misalnya ujian) diisi per bulan di dashboard.

## Halaman

| URL | Untuk | Isi |
|---|---|---|
| `/` | Publik | Penjelasan singkat |
| `/checkin` | Mahasiswa | NIM, fakultas, enam pertanyaan, persetujuan |
| `/login` | Pengelola | Masuk (maks. 5 percobaan per menit per IP) |
| `/dashboard` | Pengelola | **Seluruh universitas** atau satu komunitas: status, indikator, tren, riwayat, sebaran individu, kartu tindakan |
| `/individuals` | Pengelola | **Menu Individu**: sebaran GREEN/YELLOW/RED, daftar per NIM dengan filter periode, fakultas, status, pencarian |
| `/individuals/{id}` | Pengelola | Detail satu mahasiswa: status, enam indikator, riwayat bulanan |
| `/assessments/{id}` | Pengelola | Dasar klasifikasi komunitas dan pencatatan peninjauan manusia (PENDING, REVIEWED, ACTION_PLANNED) |
| `/communities` | Pengelola | Kelola komunitas dan jumlah mahasiswa yang diundang |


## Dokumentasi perhitungan

Semua parameter ada di `src/config.js`. Kode: `src/lib/classifier.js` (komunitas), `src/lib/individual.js` (individu), `src/lib/assessment.js` (agregasi). Semua ambang adalah **parameter desain sementara**, bukan cut-off klinis.

### 1. Jawaban dan skor risiko

Enam pertanyaan, masing-masing dijawab 0 sampai 4 untuk 30 hari terakhir. Semakin tinggi skor risiko, semakin mengkhawatirkan.

| Kode | Indikator | Arah | Skor risiko |
|---|---|---|---|
| I1 | Tingkat stres | Tinggi = buruk | jawaban |
| I2 | Kualitas tidur | Tinggi = buruk | jawaban |
| I3 | Kelelahan | Tinggi = buruk | jawaban |
| I4 | Keterhubungan sosial | Tinggi = baik (protektif) | **4 − jawaban** |
| I5 | Tekanan akademik | Tinggi = buruk | jawaban |
| I6 | Fungsi keseharian | Tinggi = buruk | jawaban |

Jawaban disimpan mentah (0–4); pembalikan I4 dilakukan saat menghitung. Pada form, I4 menampilkan ujung skalanya: 0 = sangat tidak terhubung, 4 = sangat terhubung. Bobot keenam indikator sama.

Skor risiko keseluruhan: **R = (I1 + I2 + I3 + I4\* + I5 + I6) / 6**, dengan I4\* = I4 yang sudah dibalik. Rentang 0–4.

### 2. Status individu

Satu mahasiswa, satu check-in, satu bulan.

1. Hitung jumlah skor risiko enam indikator (0–24). Contoh jawaban `4,3,3,0,4,3` → risiko `4,3,3,4,4,3` → jumlah 21.
2. R = jumlah / 6 → 3,50.
3. Bandingkan memakai **jumlah bilangan bulat** (menghindari galat pembulatan desimal):

| Status | Syarat R | Syarat jumlah |
|---|---|---|
| GREEN | R ≤ 1,00 | jumlah ≤ 6 |
| YELLOW | 1,00 < R ≤ 2,00 | 7 ≤ jumlah ≤ 12 |
| RED | R > 2,00 | jumlah ≥ 13 |

Contoh: `2,1,1,3,2,1` → risiko `2,1,1,1,2,1` = 8 → R 1,33 → YELLOW. `1,1,0,4,1,0` → 3 → R 0,50 → GREEN. Batas tepat: R = 1,00 → GREEN, R = 2,00 → YELLOW, R = 2,17 (jumlah 13) → RED.

**Tren individu:** selisih R dibanding check-in bulan kalender sebelumnya. Naik ≥ 0,50 → `WORSENING`, turun ≥ 0,50 → `IMPROVING`, selain itu `STABLE`. Tanpa check-in bulan lalu → `UNAVAILABLE`. Ambang diatur di `individualTrendDelta`.

**Pemicu tren komunitas (naik 0,5 / 1,0 poin per indikator) sengaja tidak dipakai untuk individu.** Pada skala bilangan bulat 0–4, satu mahasiswa yang menjawab satu tingkat lebih tinggi sudah naik 1,0 poin per indikator, sehingga pemicu itu akan menaikkan status karena variasi jawaban biasa. Pada rata-rata komunitas aturan itu bermakna. Status individu hanya memakai R dan label tren di atas.

### 3. Agregat komunitas

Untuk satu komunitas dan satu bulan, dari semua check-in komunitas itu pada bulan itu:

1. Rata-rata jawaban mentah tiap indikator, dibulatkan 2 desimal setelah I4 dibalik (4 − rata-rata).
2. R komunitas = rata-rata enam skor indikator, dibulatkan 2 desimal.

Contoh: rata-rata jawaban mentah I1..I6 = `3,0 / 2,0 / 1,5 / 3,0 / 3,0 / 2,0`. I4\* = 4 − 3,0 = 1,0. Skor risiko = `3,0 / 2,0 / 1,5 / 1,0 / 3,0 / 2,0`, jumlah 12,5, **R = 2,08**.

### 4. Seluruh universitas

Gabungan semua check-in dari **komunitas aktif**, dengan rumus yang sama persis seperti satu komunitas (rata-rata dari semua respons, bukan rata-rata dari rata-rata komunitas, sehingga komunitas besar berbobot lebih besar). Tingkat partisipasi dihitung terhadap jumlah diundang seluruh komunitas aktif. Hasil tidak disimpan; dihitung saat dashboard dibuka.

### 5. Kecukupan data

Status komunitas dan universitas menjadi `INSUFFICIENT_DATA` (tidak diklasifikasikan, tidak dianggap GREEN, tidak dianggap memburuk) bila salah satu benar:

- jumlah responden < `minResponsesPerIndicator` (default 10), atau
- partisipasi < `minParticipationRate` (default 20%), dengan partisipasi = responden / jumlah diundang (`communities.invited_count`, maksimum 100%). Bila jumlah diundang 0, syarat partisipasi dilewati.

Skor indikator tidak disimpan dan tidak ditampilkan saat data belum memadai, agar kelompok kecil tidak dapat diidentifikasi.

### 6. Perbandingan bulan ke bulan

Perubahan indikator = skor risiko bulan ini − skor risiko **bulan kalender sebelumnya**. Pembanding hanya dipakai bila bulan sebelumnya ada dan datanya memadai. Bulan yang kosong tidak dilompati: Oktober dibandingkan dengan September, bukan dengan Agustus. Tanpa pembanding, tren `UNAVAILABLE` dan pemicu tren tidak berlaku.

Dua penghitung:
- `worsening05` = jumlah indikator yang naik ≥ 0,5 poin (`worsenMinor`).
- `worsening10` = jumlah indikator yang naik ≥ 1,0 poin (`worsenMajor`).

### 7. Klasifikasi komunitas dan universitas

Dievaluasi berurutan:

1. Data tidak memadai → `INSUFFICIENT_DATA`.
2. **RED** bila R > 2,00, **atau** (`worsening10` ≥ 3 **dan** R ≥ 1,5).
3. Selain itu **YELLOW** bila R > 1,00, **atau** `worsening05` ≥ 2.
4. Selain itu **GREEN**.

Label tren: `WORSENING` bila `worsening05` ≥ 2 atau R naik ≥ 0,25 (`trendDelta`); `IMPROVING` bila R turun ≥ 0,25; selain itu `STABLE`.

Contoh lengkap: bulan ini R = 2,08; bulan lalu skor risiko `2,2 / 1,6 / 1,4 / 1,0 / 2,3 / 1,8` (R = 1,72). Kenaikan: `+0,8 / +0,4 / +0,1 / 0 / +0,7 / +0,2` → `worsening05` = 2, `worsening10` = 0. R > 2,00 → **RED**, tren `WORSENING`. Alasan disimpan dalam bahasa biasa dan tampil di dashboard.

Contoh pemicu tren: stres 1,2 → 2,3, tidur 1,0 → 2,1, kelelahan 1,3 → 2,4 (masing-masing naik 1,1), rata-rata keseluruhan 1,9 → tetap **RED** karena `worsening10` = 3 dan R ≥ 1,5.

Perbandingan memakai pembulatan 2 desimal yang sama (`precision`) dan toleransi 1e-9, sehingga R tepat 1,00 atau 2,00 tidak terdorong ke status lebih tinggi oleh galat desimal.

### 8. Kapan dihitung

| Hasil | Kapan dihitung |
|---|---|
| Status individu | Setiap halaman Individu dibuka, langsung dari jawaban tersimpan |
| Penilaian komunitas | Saat check-in komunitas itu masuk; saat dashboard bulan berjalan dibuka; saat jumlah diundang diubah; saat impor CSV |
| Seluruh universitas | Setiap dashboard dibuka (tidak disimpan) |


## Impor CSV

```bash
npm run import -- data.csv 2026-10   # bulan opsional, default bulan berjalan
```

Kolom: `Name;NIM;Faculty;Perceived_Stress;Sleep_Quality;Fatigue;Social_Connectedness;Academic_Pressure;Daily_Functioning` (pemisah `;` atau `,`, jawaban 0-4). Fakultas yang belum ada dibuat sebagai komunitas dengan jumlah diundang 0 (isi di menu Komunitas). Satu NIM satu check-in per bulan berlaku: baris dengan NIM yang sudah ada pada bulan itu dilewati dan dilaporkan. Impor berjalan dalam satu transaksi.

## Data demo (`npm run seed:demo`)

- **Bulan berjalan:** diimpor dari `data/sample_checkins.csv` (CSV contoh dari klien). CSV memuat 450 baris tetapi hanya 303 NIM unik, dan 97 NIM muncul dengan fakultas berbeda. Yang dipakai adalah baris pertama tiap NIM; sisanya dilewati.
- **Empat bulan sebelumnya:** disimulasikan dari data itu (digeser sedikit lebih rendah, tidak semua mahasiswa mengisi) agar tren terlihat. Ini data ilustrasi, bukan temuan.
- Jumlah diundang per fakultas diperkirakan dari jumlah NIM unik (partisipasi sekitar 60%).

Hasil status individu atas CSV contoh dengan aturan di atas:

| | GREEN | YELLOW | RED |
|---|---|---|---|
| 450 baris | 1 | 262 | 187 |
| 303 NIM unik | 1 | 161 | 141 |

Pivot dari klien menunjukkan HIJAU 10, KUNING 234, MERAH 206. Angka itu **tidak bisa direproduksi** dengan aturan yang ada di dokumen indikator, sehingga aturan kategori individu klien perlu dikonfirmasi (lihat Catatan untuk klien).


## Privasi dan keamanan

- Check-in kini terhubung ke NIM (data teridentifikasi). Form meminta persetujuan eksplisit; teksnya ada di `consentText` di `src/config.js` dan perlu ditinjau bagian hukum/etik kampus.
- Menu Individu hanya untuk pengelola yang login. Saat ini hanya ada satu peran pengelola; untuk dipakai nyata, batasi akses ke pihak yang berwenang (misalnya konselor) dan catat audit akses.
- Dokumen indikator menyarankan tidak membandingkan skor individu pada dashboard pimpinan. Menu Individu adalah permintaan klien dan melanggar saran itu; tampilannya diberi catatan anti-stigma: status adalah hasil aturan, bukan diagnosis, dan tidak untuk sanksi akademik.
- **NIM tidak diverifikasi.** Siapa pun dapat mengetik NIM orang lain. Untuk produksi, sambungkan ke SSO kampus.
- Halaman check-in mengungkap apakah suatu NIM sudah mengisi bulan ini (pesan "sudah mengisi"). Pembatas laju longgar (60 permintaan per menit per IP) dipasang agar tidak mengganggu kampus yang berbagi satu IP, sehingga belum menghentikan penebakan NIM yang pelan.
- CSRF aktif untuk semua POST, kata sandi di-hash bcrypt, sesi di tabel `session` (cookie httpOnly, SameSite=Lax, secure di production), header keamanan Helmet dengan CSP. RLS aktif di semua tabel Supabase. Tidak ada layanan AI eksternal.
- Check-in bulanan **tidak dapat mendeteksi keadaan darurat**. Isi `crisisNotice` di `src/config.js` dengan kontak layanan krisis resmi kampus.


## Catatan perilaku

- Bulan yang sudah lewat tidak dihitung ulang otomatis. Bila ambang di `src/config.js` diubah, penilaian komunitas bulan lalu tetap memakai ambang saat dihitung, sedangkan status individu dan gambaran universitas langsung mengikuti ambang baru. Untuk mengisi ulang data demo: `npm run seed:demo` (menghapus semua data check-in dan komunitas).
- Bila jumlah diundang diubah, penilaian bulan berjalan segera diperbarui.


## Catatan untuk klien

1. **Aturan kategori individu.** Dokumen hanya mendefinisikan status komunitas. Implementasi memakai ambang rata-rata risiko yang sama (≤ 1,00 / ≤ 2,00) pada satu mahasiswa. Pivot contoh klien (10 / 234 / 206) tidak cocok dengan hasil itu (1 / 262 / 187 pada 450 baris). Mohon kolom atau rumus `Kategori` yang dipakai.
2. **NIM ganda pada CSV contoh** (147 baris, 97 NIM dengan fakultas berbeda) perlu dibersihkan; NIM nyata unik.
3. **Skala I4.** Dokumen menulis `0 = sangat terhubung → risiko 4`. Rumus pembalikan (risiko = 4 − jawaban) tetap sama; yang berbeda hanya arti label. Implementasi memakai `0 = sangat tidak terhubung, 4 = sangat terhubung`, sesuai pertanyaannya, dan label ujung skala tampil di form.


## Validasi sebelum dipakai di luar simulasi

Ambang 1,00 / 2,00 dan perubahan 0,5 / 1,0 adalah asumsi awal. Sebelum dipakai nyata: validasi isi oleh psikolog dan konselor, pilot, kalibrasi ambang, evaluasi peringatan palsu dan terlewat, serta kajian privasi dan keadilan antarkelompok. Selama belum, sebut sistem ini **rule-based early-warning prototype**.


## Pindah dari versi CodeIgniter/MySQL

Skema dan perhitungan setara dengan versi sebelumnya (hasil demo sama: 303 NIM unik, 1 GREEN / 161 YELLOW / 141 RED). Data MySQL tidak dipindahkan otomatis; untuk data nyata, ekspor `students` dan `checkins` ke CSV lalu pakai `npm run import`. Perbedaan: tabel memakai tipe Postgres (`timestamptz`, `boolean`, `jsonb`), akun pengelola dibuat ulang lewat `npm run seed:admin` (hash lama `password_hash` PHP tidak dipakai).

## Struktur

```
src/
  server.js, app.js              Express: sesi, CSRF, Helmet, layout
  config.js                      parameter, indikator, kartu tindakan, teks persetujuan
  db.js, data.js                 koneksi Postgres/Supabase dan semua query
  lib/classifier.js              klasifikasi komunitas dan tren
  lib/individual.js              klasifikasi individu
  lib/assessment.js              agregasi check-in -> penilaian komunitas dan universitas
  lib/importer.js                impor CSV
  routes/                        public, auth, dashboard, individuals, assessments, communities
  views/                         EJS (layout, halaman, skrip grafik)
supabase/migrations/             skema SQL (+ RLS)
scripts/                         migrate, seed-admin, seed-demo, import
public/assets/                   css, js, logo
test/                            classifier.test.js (unit), e2e.js (alur HTTP)
```
