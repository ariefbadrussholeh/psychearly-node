-- PSYCHEARLY: skema awal untuk Supabase (PostgreSQL).
-- Jalankan lewat `npm run migrate`, atau tempel ke Supabase Dashboard > SQL Editor.
--
-- Keamanan: aplikasi ini mengakses database lewat koneksi Postgres dari server Node.js.
-- RLS diaktifkan pada SEMUA tabel tanpa policy, sehingga API publik Supabase (anon key)
-- tidak bisa membaca atau menulis apa pun. Role `postgres` yang dipakai server melewati RLS.

create table if not exists users (
  id            integer generated always as identity primary key,
  name          varchar(120) not null,
  email         varchar(190) not null unique,
  password_hash varchar(255) not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists communities (
  id            integer generated always as identity primary key,
  code          varchar(40)  not null unique,
  name          varchar(160) not null,
  invited_count integer      not null default 0 check (invited_count >= 0),
  is_active     boolean      not null default true,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);

-- Periode = bulan kalender (YYYY-MM). Tidak ada status buka/tutup.
create table if not exists periods (
  id               integer generated always as identity primary key,
  code             char(7) not null unique check (code ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  calendar_context varchar(255),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists students (
  id           integer generated always as identity primary key,
  nim          varchar(20) not null unique,
  name         varchar(160),
  community_id integer not null references communities(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Satu NIM, satu check-in per periode: dijaga oleh database (UNIQUE), bukan browser.
create table if not exists checkins (
  id           integer generated always as identity primary key,
  period_id    integer not null references periods(id)     on delete cascade,
  student_id   integer not null references students(id)    on delete cascade,
  community_id integer not null references communities(id) on delete cascade,
  i1 smallint not null check (i1 between 0 and 4),
  i2 smallint not null check (i2 between 0 and 4),
  i3 smallint not null check (i3 between 0 and 4),
  i4 smallint not null check (i4 between 0 and 4),
  i5 smallint not null check (i5 between 0 and 4),
  i6 smallint not null check (i6 between 0 and 4),
  consent      boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (period_id, student_id)
);
create index if not exists checkins_period_community_idx on checkins (period_id, community_id);
create index if not exists checkins_student_idx on checkins (student_id);

create table if not exists indicator_stats (
  id                 integer generated always as identity primary key,
  period_id          integer  not null references periods(id)     on delete cascade,
  community_id       integer  not null references communities(id) on delete cascade,
  indicator_id       char(2)  not null,
  response_count     integer  not null default 0,
  participation_rate numeric(5,4),
  community_score    numeric(4,2),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (period_id, community_id, indicator_id)
);

create table if not exists assessments (
  id                 integer generated always as identity primary key,
  period_id          integer not null references periods(id)     on delete cascade,
  community_id       integer not null references communities(id) on delete cascade,
  response_count     integer not null default 0,
  participation_rate numeric(5,4),
  risk_score         numeric(4,2),
  risk_status        text not null check (risk_status in ('GREEN','YELLOW','RED','INSUFFICIENT_DATA')),
  trend_status       text not null default 'UNAVAILABLE' check (trend_status in ('IMPROVING','STABLE','WORSENING','UNAVAILABLE')),
  worsening05        smallint not null default 0,
  worsening10        smallint not null default 0,
  reasons            jsonb,
  review_status      text not null default 'PENDING' check (review_status in ('PENDING','REVIEWED','ACTION_PLANNED')),
  responsible_unit   varchar(160),
  review_note        text,
  reviewed_by        integer references users(id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (period_id, community_id)
);

-- Tabel sesi login (connect-pg-simple).
create table if not exists session (
  sid    varchar not null primary key,
  sess   json    not null,
  expire timestamp(6) not null
);
create index if not exists idx_session_expire on session (expire);

alter table users           enable row level security;
alter table communities     enable row level security;
alter table periods         enable row level security;
alter table students        enable row level security;
alter table checkins        enable row level security;
alter table indicator_stats enable row level security;
alter table assessments     enable row level security;
alter table session         enable row level security;
