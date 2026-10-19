'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { RiskClassifier } = require('../src/lib/classifier');
const { IndividualClassifier } = require('../src/lib/individual');
const { round } = require('../src/lib/util');
const periods = require('../src/lib/periods');

const ind = (v) => Object.fromEntries(['I1', 'I2', 'I3', 'I4', 'I5', 'I6'].map((id, i) => [id, v[i]]));
const status = (cur, prev, ok = true) => new RiskClassifier(config).classify(cur, prev, ok).status;

test('komunitas: batas GREEN/YELLOW/RED', () => {
  assert.equal(status(ind([1, 1, 1, 1, 1, 1]), null), 'GREEN');
  assert.equal(status(ind([2, 2, 2, 2, 2, 2]), null), 'YELLOW');
  assert.equal(status(ind([2.01, 2.01, 2.01, 2.01, 2.01, 2.01]), null), 'RED');
});

test('komunitas: dua indikator naik 0,5 -> YELLOW', () => {
  assert.equal(status(ind([0.5, 0.5, 0.1, 0.1, 0.1, 0.1]), ind([0, 0, 0.1, 0.1, 0.1, 0.1])), 'YELLOW');
});

test('komunitas: tiga indikator naik 1,0 -> RED walau di bawah 2', () => {
  assert.equal(status(ind([2.3, 2.1, 2.4, 1.3, 2.0, 1.1]), ind([1.2, 1.0, 1.3, 1.0, 1.4, 0.8])), 'RED');
});

test('komunitas: data kurang tidak pernah GREEN', () => {
  assert.equal(status(null, null, false), 'INSUFFICIENT_DATA');
});

test('komunitas: contoh README R=2,08 RED WORSENING, bulan lalu 1,72', () => {
  const cur = ind([3.0, 2.0, 1.5, 1.0, 3.0, 2.0]);
  const prev = ind([2.2, 1.6, 1.4, 1.0, 2.3, 1.8]);
  const r = new RiskClassifier(config).classify(cur, prev, true);
  assert.equal(r.risk_score, 2.08);
  assert.equal(r.status, 'RED');
  assert.equal(r.trend_status, 'WORSENING');
  assert.equal(r.worsening05, 2);
  assert.equal(r.worsening10, 0);
  assert.deepEqual(r.reasons, ['Rata-rata risiko 2.08 berada di atas 2.00.']);
  const p = new RiskClassifier(config).classify(prev, null, true);
  assert.equal(p.risk_score, 1.72);
  assert.equal(p.status, 'YELLOW');
});

const cls = new IndividualClassifier(config);
const row = (a) => ({ i1: a[0], i2: a[1], i3: a[2], i4: a[3], i5: a[4], i6: a[5] });

test('individu: I4 dibalik', () => {
  assert.deepEqual(cls.indicators(row([4, 3, 3, 0, 4, 3])), { I1: 4, I2: 3, I3: 3, I4: 4, I5: 4, I6: 3 });
});
test('individu: batas bilangan bulat 6/7/12/13', () => {
  assert.deepEqual(cls.sumBounds(), [6, 12]);
  assert.equal(cls.classify(6), 'GREEN');
  assert.equal(cls.classify(7), 'YELLOW');
  assert.equal(cls.classify(12), 'YELLOW');
  assert.equal(cls.classify(13), 'RED');
});
test('individu: contoh README 21 / 8 / 3', () => {
  assert.equal(cls.sum(row([4, 3, 3, 0, 4, 3])), 21);
  assert.equal(cls.score(21), 3.5);
  assert.equal(cls.classify(21), 'RED');
  assert.equal(cls.classify(cls.sum(row([2, 1, 1, 3, 2, 1]))), 'YELLOW');
  assert.equal(cls.sum(row([2, 1, 1, 3, 2, 1])), 8);
  assert.equal(cls.score(8), 1.33);
  assert.equal(cls.sum(row([1, 1, 0, 4, 1, 0])), 3);
  assert.equal(cls.classify(3), 'GREEN');
});
test('individu: tren perlu selisih 0,5', () => {
  assert.equal(cls.trend(12, null), 'UNAVAILABLE');
  assert.equal(cls.trend(15, 12), 'WORSENING');
  assert.equal(cls.trend(14, 12), 'STABLE');
  assert.equal(cls.trend(9, 12), 'IMPROVING');
});

test('round: setengah menjauhi nol seperti PHP', () => {
  assert.equal(round(1.005, 2), 1.01);
  assert.equal(round(2.675, 2), 2.68);
  assert.equal(round(-0.125, 2), -0.13);
  assert.equal(round(1.72, 2), 1.72);
});

test('periode: bulan sebelumnya/berikutnya, hari terakhir, label', () => {
  assert.equal(periods.previousCode('2026-01'), '2025-12');
  assert.equal(periods.previousCode('2026-10'), '2026-09');
  assert.equal(periods.nextCode('2026-12'), '2027-01');
  assert.equal(periods.lastDay('2026-02'), 28);
  assert.equal(periods.lastDay('2028-02'), 29);
  assert.equal(periods.label('2026-10'), 'Oktober 2026');
  // 31 Okt 2026 17:30 UTC = 1 Nov 2026 00:30 WIB -> sudah bulan November di WIB
  assert.equal(periods.currentCode(new Date('2026-10-31T17:30:00Z')), '2026-11');
  assert.equal(periods.currentCode(new Date('2026-10-31T16:30:00Z')), '2026-10');
});
