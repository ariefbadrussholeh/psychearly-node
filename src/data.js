'use strict';

/** Akses data (SQL langsung ke Postgres/Supabase). Semua query berparameter. */
const db = require('./db');
const config = require('./config');
const periodsLib = require('./lib/periods');
const { IndividualClassifier } = require('./lib/individual');

/** Ekspresi SQL jumlah skor risiko enam indikator (I4 dibalik). Alias tabel: c. */
const RISK_SUM = '(c.i1 + c.i2 + c.i3 + (4 - c.i4) + c.i5 + c.i6)';

const one = async (text, params, ex = db) => (await ex.query(text, params)).rows[0] || null;
const all = async (text, params, ex = db) => (await ex.query(text, params)).rows;

/* ---------------------------------------------------------------- communities */
const communities = {
  list: () => all('SELECT * FROM communities ORDER BY name'),
  active: (ex = db) => all('SELECT * FROM communities WHERE is_active = true ORDER BY name', [], ex),
  find: (id) => one('SELECT * FROM communities WHERE id = $1', [id]),
  findActive: (id) => one('SELECT * FROM communities WHERE id = $1 AND is_active = true', [id]),
  codeTaken: async (code, exceptId = 0) =>
    (await one('SELECT 1 AS x FROM communities WHERE code = $1 AND id <> $2', [code, exceptId])) !== null,
  create: (d) =>
    one(
      'INSERT INTO communities (code, name, invited_count, is_active) VALUES ($1,$2,$3,$4) RETURNING *',
      [d.code, d.name, d.invited_count, d.is_active]
    ),
  update: (id, d) =>
    one(
      'UPDATE communities SET code=$2, name=$3, invited_count=$4, is_active=$5, updated_at=now() WHERE id=$1 RETURNING *',
      [id, d.code, d.name, d.invited_count, d.is_active]
    ),
};

/* -------------------------------------------------------------------- periods */
const periods = {
  list: () => all('SELECT * FROM periods ORDER BY code DESC'),
  listAsc: () => all('SELECT * FROM periods ORDER BY code ASC'),
  find: (id) => one('SELECT * FROM periods WHERE id = $1', [id]),

  /** Baris periode untuk kode tertentu; dibuat bila belum ada (aman terhadap permintaan bersamaan). */
  async forCode(code, ex = db) {
    if (!periodsLib.CODE_RE.test(code)) throw new Error('Kode periode harus YYYY-MM.');
    await ex.query('INSERT INTO periods (code) VALUES ($1) ON CONFLICT (code) DO NOTHING', [code]);
    return one('SELECT * FROM periods WHERE code = $1', [code], ex);
  },
  current: () => periods.forCode(periodsLib.currentCode()),

  /** Periode tepat satu bulan kalender sebelumnya, bila barisnya ada. */
  previousOf: (code, ex = db) => one('SELECT * FROM periods WHERE code = $1', [periodsLib.previousCode(code)], ex),

  setContext: (id, text) => db.query('UPDATE periods SET calendar_context=$2, updated_at=now() WHERE id=$1', [id, text]),
};

/* ------------------------------------------------------------------- students */
const students = {
  findByNim: (nim, ex = db) => one('SELECT * FROM students WHERE nim = $1', [nim], ex),
  create: (d, ex = db) =>
    one('INSERT INTO students (nim, name, community_id) VALUES ($1,$2,$3) RETURNING *', [d.nim, d.name ?? null, d.community_id], ex),
  /** NIM disimpan huruf besar tanpa spasi. */
  normalizeNim: (nim) => String(nim ?? '').trim().replace(/\s+/g, '').toUpperCase(),
  withCommunity: (id) =>
    one(
      'SELECT s.*, co.name AS community_name FROM students s JOIN communities co ON co.id = s.community_id WHERE s.id = $1',
      [id]
    ),
};

/* ------------------------------------------------------------------- checkins */
const checkins = {
  exists: async (periodId, studentId) =>
    (await one('SELECT 1 AS x FROM checkins WHERE period_id=$1 AND student_id=$2', [periodId, studentId])) !== null,

  insert: (r, ex = db) =>
    ex.query(
      `INSERT INTO checkins (period_id, student_id, community_id, i1, i2, i3, i4, i5, i6, consent, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [r.period_id, r.student_id, r.community_id, r.i1, r.i2, r.i3, r.i4, r.i5, r.i6, r.consent ?? true, r.submitted_at ?? new Date()]
    ),

  /** Sebaran status individu pada satu periode (opsional per komunitas). */
  async statusCounts(periodId, communityId = null) {
    const [g, y] = new IndividualClassifier(config).sumBounds();
    const params = [periodId];
    let where = 'c.period_id = $1';
    if (communityId) {
      params.push(communityId);
      where += ' AND c.community_id = $2';
    }
    const r =
      (await one(
        `SELECT COUNT(*)::int AS total,
                COALESCE(SUM(CASE WHEN ${RISK_SUM} <= ${g} THEN 1 ELSE 0 END),0)::int AS green,
                COALESCE(SUM(CASE WHEN ${RISK_SUM} > ${g} AND ${RISK_SUM} <= ${y} THEN 1 ELSE 0 END),0)::int AS yellow,
                COALESCE(SUM(CASE WHEN ${RISK_SUM} > ${y} THEN 1 ELSE 0 END),0)::int AS red
           FROM checkins c WHERE ${where}`,
        params
      )) || {};
    return { GREEN: r.green || 0, YELLOW: r.yellow || 0, RED: r.red || 0, total: r.total || 0 };
  },

  /** Agregat mentah satu periode: semua komunitas aktif (communityId null) atau satu komunitas. */
  aggregateRow(periodId, communityId, ex = db) {
    const cols = [1, 2, 3, 4, 5, 6].map((n) => `COUNT(i${n})::int AS ci${n}, AVG(i${n}) AS ai${n}`).join(', ');
    if (communityId !== null) {
      return one(`SELECT COUNT(*)::int AS respondents, ${cols} FROM checkins WHERE period_id=$1 AND community_id=$2`, [periodId, communityId], ex);
    }
    return one(
      `SELECT COUNT(*)::int AS respondents, ${cols} FROM checkins
        WHERE period_id=$1 AND community_id IN (SELECT id FROM communities WHERE is_active = true)`,
      [periodId],
      ex
    );
  },

  /** Daftar individu satu periode dengan filter, urut risiko tertinggi. */
  async listIndividuals({ periodId, prevPeriodId, communityId, status, q, limit, offset }) {
    const [g, y] = new IndividualClassifier(config).sumBounds();
    const params = [periodId];
    const where = ['c.period_id = $1'];
    if (communityId) {
      params.push(communityId);
      where.push(`c.community_id = $${params.length}`);
    }
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`);
      where.push(`(s.nim ILIKE $${params.length} OR s.name ILIKE $${params.length})`);
    }
    if (status === 'GREEN') where.push(`${RISK_SUM} <= ${g}`);
    else if (status === 'YELLOW') where.push(`${RISK_SUM} > ${g} AND ${RISK_SUM} <= ${y}`);
    else if (status === 'RED') where.push(`${RISK_SUM} > ${y}`);
    const whereSql = where.join(' AND ');

    const total = (await one(
      `SELECT COUNT(*)::int AS n FROM checkins c JOIN students s ON s.id = c.student_id WHERE ${whereSql}`,
      params
    )).n;

    const rowParams = [...params];
    let prevJoin = '';
    let prevSel = 'NULL::int AS prev_sum';
    if (prevPeriodId) {
      rowParams.push(prevPeriodId);
      prevJoin = `LEFT JOIN checkins pc ON pc.student_id = c.student_id AND pc.period_id = $${rowParams.length}`;
      prevSel = '(pc.i1 + pc.i2 + pc.i3 + (4 - pc.i4) + pc.i5 + pc.i6) AS prev_sum';
    }
    rowParams.push(limit, offset);
    const rows = await all(
      `SELECT c.student_id, s.nim, s.name, co.name AS community_name, ${RISK_SUM} AS risk_sum, ${prevSel}
         FROM checkins c
         JOIN students s ON s.id = c.student_id
         JOIN communities co ON co.id = c.community_id
         ${prevJoin}
        WHERE ${whereSql}
        ORDER BY ${RISK_SUM} DESC, s.nim ASC
        LIMIT $${rowParams.length - 1} OFFSET $${rowParams.length}`,
      rowParams
    );
    return { total, rows };
  },

  /** Semua check-in satu mahasiswa, kronologis. */
  forStudent: (studentId) =>
    all(
      `SELECT c.*, p.code AS period_code, p.calendar_context
         FROM checkins c JOIN periods p ON p.id = c.period_id
        WHERE c.student_id = $1 ORDER BY p.code ASC`,
      [studentId]
    ),
};

/* ---------------------------------------------------------------- assessments */
const assessments = {
  find: (id) => one('SELECT * FROM assessments WHERE id = $1', [id]),
  forPeriodCommunity: (periodId, communityId, ex = db) =>
    one('SELECT * FROM assessments WHERE period_id=$1 AND community_id=$2', [periodId, communityId], ex),

  /** Riwayat penilaian satu komunitas, kronologis, dengan kode periode. */
  history: (communityId) =>
    all(
      `SELECT a.*, p.code AS period_code, p.calendar_context
         FROM assessments a JOIN periods p ON p.id = a.period_id
        WHERE a.community_id = $1 ORDER BY p.code ASC`,
      [communityId]
    ),

  /** Semua komunitas pada satu periode. */
  overview: (periodId) =>
    all(
      `SELECT a.*, co.name AS community_name
         FROM assessments a JOIN communities co ON co.id = a.community_id
        WHERE a.period_id = $1 ORDER BY co.name`,
      [periodId]
    ),

  async exists(periodId, communityId) {
    return (await one('SELECT 1 AS x FROM assessments WHERE period_id=$1 AND community_id=$2', [periodId, communityId])) !== null;
  },

  /** Simpan hasil hitung; kolom peninjauan tidak ditimpa. */
  upsert(d, ex = db) {
    return one(
      `INSERT INTO assessments
         (period_id, community_id, response_count, participation_rate, risk_score, risk_status, trend_status,
          worsening05, worsening10, reasons)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT (period_id, community_id) DO UPDATE SET
         response_count = EXCLUDED.response_count, participation_rate = EXCLUDED.participation_rate,
         risk_score = EXCLUDED.risk_score, risk_status = EXCLUDED.risk_status, trend_status = EXCLUDED.trend_status,
         worsening05 = EXCLUDED.worsening05, worsening10 = EXCLUDED.worsening10, reasons = EXCLUDED.reasons,
         updated_at = now()
       RETURNING *`,
      [d.period_id, d.community_id, d.response_count, d.participation_rate, d.risk_score, d.risk_status, d.trend_status,
        d.worsening05, d.worsening10, JSON.stringify(d.reasons)],
      ex
    );
  },

  updateReview: (id, d) =>
    db.query(
      `UPDATE assessments SET review_status=$2, responsible_unit=$3, review_note=$4, reviewed_by=$5, reviewed_at=$6, updated_at=now()
        WHERE id=$1`,
      [id, d.review_status, d.responsible_unit, d.review_note, d.reviewed_by, d.reviewed_at]
    ),
};

/* ------------------------------------------------------------- indicator stats */
const stats = {
  upsert(d, ex = db) {
    return ex.query(
      `INSERT INTO indicator_stats (period_id, community_id, indicator_id, response_count, participation_rate, community_score)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (period_id, community_id, indicator_id) DO UPDATE SET
         response_count = EXCLUDED.response_count, participation_rate = EXCLUDED.participation_rate,
         community_score = EXCLUDED.community_score, updated_at = now()`,
      [d.period_id, d.community_id, d.indicator_id, d.response_count, d.participation_rate, d.community_score]
    );
  },

  /** @returns {Promise<Object<string, object>>} dikunci dengan indicator_id */
  async forAssessment(periodId, communityId, ex = db) {
    const rows = await all(
      'SELECT * FROM indicator_stats WHERE period_id=$1 AND community_id=$2 ORDER BY indicator_id',
      [periodId, communityId],
      ex
    );
    return Object.fromEntries(rows.map((r) => [r.indicator_id.trim(), r]));
  },
};

/* ---------------------------------------------------------------------- users */
const users = {
  findByEmail: (email) => one('SELECT * FROM users WHERE email = $1', [email]),
  create: (d) => one('INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING *', [d.name, d.email, d.password_hash]),
};

module.exports = { RISK_SUM, communities, periods, students, checkins, assessments, stats, users };
