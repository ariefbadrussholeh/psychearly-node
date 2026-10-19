'use strict';

const { round, sum } = require('./util');

const EPS = 1e-9;
const f2 = (n) => Number(n).toFixed(2);
const f1 = (n) => Number(n).toFixed(1);

/**
 * Klasifikasi komunitas GREEN / YELLOW / RED / INSUFFICIENT_DATA berbasis aturan.
 * Murni logika (tanpa database) agar mudah diuji. Ambang dari config dan bersifat sementara.
 */
class RiskClassifier {
  constructor(config) {
    this.config = config;
  }

  /**
   * @param {Object<string, number>|null} current  Skor risiko per indikator bulan ini (I1..I6, arah risiko).
   * @param {Object<string, number>|null} previous Skor risiko bulan lalu, atau null bila tidak tersedia.
   * @param {boolean} dataSufficient
   */
  classify(current, previous, dataSufficient) {
    const c = this.config;
    const p = c.precision;

    if (!dataSufficient || !current || Object.keys(current).length !== 6) {
      return {
        status: 'INSUFFICIENT_DATA',
        trend_status: 'UNAVAILABLE',
        risk_score: null,
        worsening05: 0,
        worsening10: 0,
        changes: {},
        reasons: ['Jumlah atau cakupan respons belum memenuhi syarat kecukupan data.'],
      };
    }

    const cur = {};
    for (const [id, v] of Object.entries(current)) cur[id] = round(v, p);
    const ids = Object.keys(cur);
    const risk = round(sum(Object.values(cur)) / ids.length, p);

    const changes = {};
    let worsening05 = 0;
    let worsening10 = 0;
    let prevRisk = null;

    if (previous && Object.keys(previous).length === ids.length) {
      const prev = {};
      for (const [id, v] of Object.entries(previous)) prev[id] = round(v, p);
      prevRisk = round(sum(Object.values(prev)) / Object.keys(prev).length, p);

      for (const id of ids) {
        if (prev[id] === undefined) continue;
        const delta = round(cur[id] - prev[id], p);
        changes[id] = delta;
        if (delta >= c.worsenMinor - EPS) worsening05++;
        if (delta >= c.worsenMajor - EPS) worsening10++;
      }
    }

    const reasons = [];
    let status = 'GREEN';

    const redByScore = risk > c.yellowMax + EPS;
    const redByTrend = worsening10 >= c.majorCountForRed && risk >= c.redTrendMinScore - EPS;

    if (redByScore || redByTrend) {
      status = 'RED';
      if (redByScore) reasons.push(`Rata-rata risiko ${f2(risk)} berada di atas ${f2(c.yellowMax)}.`);
      if (redByTrend) {
        reasons.push(
          `${worsening10} indikator naik minimal ${f1(c.worsenMajor)} poin dan rata-rata risiko ${f2(risk)} sudah mencapai ${f1(c.redTrendMinScore)}.`
        );
      }
    } else if (risk > c.greenMax + EPS || worsening05 >= c.minorCountForYellow) {
      status = 'YELLOW';
      if (risk > c.greenMax + EPS) {
        reasons.push(`Rata-rata risiko ${f2(risk)} berada di atas ${f2(c.greenMax)} hingga ${f2(c.yellowMax)}.`);
      }
      if (worsening05 >= c.minorCountForYellow) {
        reasons.push(`${worsening05} indikator naik minimal ${f1(c.worsenMinor)} poin dari bulan sebelumnya.`);
      }
    } else {
      reasons.push(`Rata-rata risiko ${f2(risk)} tidak melebihi ${f2(c.greenMax)} dan tidak ada pola perburukan yang kuat.`);
    }

    return {
      status,
      trend_status: this.trend(risk, prevRisk, worsening05),
      risk_score: risk,
      worsening05,
      worsening10,
      changes,
      reasons,
    };
  }

  trend(risk, prevRisk, worsening05) {
    const c = this.config;
    if (prevRisk === null) return 'UNAVAILABLE';

    const delta = round(risk - prevRisk, c.precision);
    if (worsening05 >= c.minorCountForYellow || delta >= c.trendDelta - EPS) return 'WORSENING';
    if (delta <= -c.trendDelta + EPS) return 'IMPROVING';
    return 'STABLE';
  }
}

module.exports = { RiskClassifier };
