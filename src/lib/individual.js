'use strict';

const { round, sum } = require('./util');

const EPS = 1e-9;

/**
 * Klasifikasi individu: satu check-in (satu bulan) menjadi GREEN / YELLOW / RED.
 *
 * Skor risiko individu = rata-rata enam indikator dalam arah risiko (I4 dibalik).
 * Perbandingan memakai JUMLAH bilangan bulat (jumlah / 6) agar bebas masalah pembulatan.
 * Pemicu tren (kenaikan 0,5 / 1,0 poin) sengaja tidak dipakai di tingkat individu: lihat README.
 */
class IndividualClassifier {
  constructor(config) {
    this.config = config;
  }

  /** Skor risiko per indikator (I1..I6) dari jawaban mentah i1..i6. */
  indicators(row) {
    const out = {};
    for (const [id, meta] of Object.entries(this.config.indicators)) {
      const raw = Number(row[`i${parseInt(id.slice(1), 10)}`]);
      out[id] = meta.protective ? 4 - raw : raw;
    }
    return out;
  }

  sum(row) {
    return sum(Object.values(this.indicators(row)));
  }

  score(total) {
    return round(total / 6, this.config.precision);
  }

  /** Batas jumlah untuk GREEN dan YELLOW. Default: [6, 12]. */
  sumBounds() {
    return [Math.floor(this.config.greenMax * 6 + EPS), Math.floor(this.config.yellowMax * 6 + EPS)];
  }

  classify(total) {
    const [greenMax, yellowMax] = this.sumBounds();
    if (total <= greenMax) return 'GREEN';
    return total <= yellowMax ? 'YELLOW' : 'RED';
  }

  /** Tren dibanding bulan sebelumnya berdasarkan selisih skor risiko. */
  trend(total, previousSum) {
    if (previousSum === null || previousSum === undefined) return 'UNAVAILABLE';

    const delta = (total - previousSum) / 6;
    if (delta >= this.config.individualTrendDelta - EPS) return 'WORSENING';
    if (delta <= -this.config.individualTrendDelta + EPS) return 'IMPROVING';
    return 'STABLE';
  }
}

module.exports = { IndividualClassifier };
