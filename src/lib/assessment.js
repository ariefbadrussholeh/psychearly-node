'use strict';

const config = require('../config');
const data = require('../data');
const periodsLib = require('./periods');
const { RiskClassifier } = require('./classifier');
const { round } = require('./util');

/**
 * Mengagregasi check-in menjadi skor indikator komunitas, menjalankan klasifikasi,
 * dan menyimpan hasilnya. Dipanggil otomatis (check-in masuk, dashboard dibuka, impor),
 * tidak ada tombol "hitung" untuk pengguna.
 *
 * Bulan yang sudah lewat tidak menerima check-in lagi, jadi hasil terakhirnya otomatis final.
 */
class AssessmentService {
  constructor(cfg = config) {
    this.config = cfg;
    this.classifier = new RiskClassifier(cfg);
  }

  /** Hitung semua komunitas aktif untuk satu periode. */
  async runForPeriod(periodId) {
    const list = await data.communities.active();
    for (const c of list) await this.run(periodId, c.id);
    return list.length;
  }

  /** Hitung dan simpan penilaian satu komunitas pada satu periode. */
  async run(periodId, communityId) {
    const period = await data.periods.find(periodId);
    const community = await data.communities.find(communityId);
    if (!period || !community) throw new Error('Periode atau komunitas tidak ditemukan.');

    const agg = await this.aggregate(periodId, communityId, community.invited_count);

    // Simpan agregat per indikator (hanya data agregat yang dipakai dashboard).
    for (const id of Object.keys(this.config.indicators)) {
      const row = agg.indicators[id];
      await data.stats.upsert({
        period_id: periodId,
        community_id: communityId,
        indicator_id: id,
        response_count: row.count,
        participation_rate: agg.participation,
        // Skor tidak disimpan bila data belum memadai (melindungi kelompok kecil).
        community_score: agg.sufficient ? row.score : null,
      });
    }

    // Perbandingan hanya dengan bulan kalender sebelumnya, dan hanya bila datanya memadai.
    let previous = null;
    const prevPeriod = await data.periods.previousOf(period.code);
    if (prevPeriod) {
      const prevAssessment = await data.assessments.forPeriodCommunity(prevPeriod.id, communityId);
      if (prevAssessment && prevAssessment.risk_status !== 'INSUFFICIENT_DATA') {
        const prevStats = await data.stats.forAssessment(prevPeriod.id, communityId);
        if (Object.keys(prevStats).length === 6) {
          previous = Object.fromEntries(Object.entries(prevStats).map(([id, r]) => [id, Number(r.community_score)]));
        }
      }
    }

    const current = agg.sufficient
      ? Object.fromEntries(Object.entries(agg.indicators).map(([id, r]) => [id, r.score]))
      : null;
    const result = this.classifier.classify(current, previous, agg.sufficient);

    return data.assessments.upsert({
      period_id: periodId,
      community_id: communityId,
      response_count: agg.respondents,
      participation_rate: agg.participation,
      risk_score: result.risk_score,
      risk_status: result.status,
      trend_status: result.trend_status,
      worsening05: result.worsening05,
      worsening10: result.worsening10,
      reasons: result.reasons,
    });
  }

  /**
   * Gambaran seluruh komunitas aktif untuk satu periode. Tidak disimpan: dihitung langsung
   * dari check-in setiap kali diminta, dengan aturan yang sama seperti per komunitas.
   */
  async overall(period) {
    const list = await data.communities.active();
    const invited = list.reduce((a, c) => a + c.invited_count, 0);
    const current = await this.aggregate(period.id, null, invited);

    let previous = null;
    let prevScores = null;
    const prevPeriod = await data.periods.previousOf(period.code);
    if (prevPeriod) {
      const prev = await this.aggregate(prevPeriod.id, null, invited);
      if (prev.sufficient) {
        prevScores = Object.fromEntries(Object.entries(prev.indicators).map(([id, r]) => [id, r.score]));
        previous = prevScores;
      }
    }

    const scores = current.sufficient
      ? Object.fromEntries(Object.entries(current.indicators).map(([id, r]) => [id, r.score]))
      : null;
    const result = this.classifier.classify(scores, previous, current.sufficient);

    const indicators = {};
    for (const [id, row] of Object.entries(current.indicators)) {
      const score = current.sufficient ? row.score : null;
      const delta =
        score !== null && prevScores && prevScores[id] !== null && prevScores[id] !== undefined
          ? round(score - prevScores[id], this.config.precision)
          : null;
      indicators[id] = { score, delta, count: row.count };
    }

    return {
      period_code: period.code,
      calendar_context: period.calendar_context ?? null,
      response_count: current.respondents,
      participation_rate: current.participation,
      risk_score: result.risk_score,
      risk_status: result.status,
      trend_status: result.trend_status,
      worsening05: result.worsening05,
      worsening10: result.worsening10,
      reasons: result.reasons,
      indicators,
    };
  }

  /** Riwayat gambaran keseluruhan, lama ke baru, untuk tiap bulan yang punya check-in. */
  async overallHistory() {
    const out = [];
    for (const period of await data.periods.listAsc()) {
      const snap = await this.overall(period);
      if (snap.response_count > 0) out.push(snap);
    }
    return out;
  }

  /**
   * Rata-rata per indikator dalam arah risiko (I4 dibalik: 4 - rata-rata jawaban).
   * Seluruh jawaban wajib diisi, jadi setiap responden dihitung pada keenam indikator.
   * communityId null = seluruh komunitas aktif.
   */
  async aggregate(periodId, communityId, invited) {
    const c = this.config;
    const row = (await data.checkins.aggregateRow(periodId, communityId)) || {};

    const respondents = row.respondents || 0;
    const participation = invited > 0 ? round(Math.min(respondents / invited, 1), 4) : null;

    const indicators = {};
    let sufficient = respondents > 0;
    for (const [id, meta] of Object.entries(c.indicators)) {
      const n = parseInt(id.slice(1), 10);
      const count = row[`ci${n}`] || 0;
      const avg = row[`ai${n}`];
      let score = null;

      if (avg !== null && avg !== undefined && count > 0) {
        score = Number(avg);
        if (meta.protective) score = 4 - score;
        score = round(score, c.precision);
      }
      if (count < c.minResponsesPerIndicator) sufficient = false;
      indicators[id] = { count, score };
    }

    if (participation !== null && participation < c.minParticipationRate) sufficient = false;

    return { respondents, participation, sufficient, indicators };
  }
}

module.exports = { AssessmentService, periodsLib };
