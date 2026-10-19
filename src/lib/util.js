'use strict';

/** Pembulatan "setengah menjauhi nol" seperti PHP round(), tahan galat biner (1.005 -> 1.01). */
function round(value, precision = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return n;
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const shifted = Math.round(Number(`${abs}e${precision}`));
  return sign * Number(`${shifted}e-${precision}`);
}

/** Format angka gaya Indonesia: koma desimal, titik ribuan. */
function numberFmt(value, decimals = 2) {
  const fixed = Number(value).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const withThousands = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec ? `${withThousands},${dec}` : withThousands;
}

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

module.exports = { round, numberFmt, sum };
