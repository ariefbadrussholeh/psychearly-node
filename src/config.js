'use strict';

/**
 * Parameter PSYCHEARLY.
 *
 * Semua ambang batas di sini adalah parameter desain sementara untuk prototype,
 * bukan cut-off klinis. Ubah di satu tempat ini setelah validasi pakar dan pilot.
 */
module.exports = {
  // Batas atas rata-rata risiko untuk GREEN (0,00 - 1,00).
  greenMax: 1.0,
  // Batas atas rata-rata risiko untuk YELLOW (di atas 1,00 hingga 2,00). Di atas ini RED.
  yellowMax: 2.0,
  // Kenaikan indikator yang dihitung "memburuk" (ringan / kuat).
  worsenMinor: 0.5,
  worsenMajor: 1.0,
  // Jumlah indikator naik >= worsenMinor agar minimal YELLOW.
  minorCountForYellow: 2,
  // Jumlah indikator naik >= worsenMajor agar RED untuk peninjauan.
  majorCountForRed: 3,
  // Rata-rata risiko minimal agar pemicu tren kuat berlaku.
  redTrendMinScore: 1.5,
  // Perubahan rata-rata risiko keseluruhan untuk label tren IMPROVING / WORSENING.
  trendDelta: 0.25,
  // Setiap indikator harus punya sedikitnya sekian respons valid (juga melindungi kelompok kecil).
  minResponsesPerIndicator: 10,
  // Partisipasi minimal (proporsi dari populasi yang diundang). 0 untuk menonaktifkan.
  minParticipationRate: 0.2,
  // Pembulatan konsisten untuk seluruh perbandingan ambang.
  precision: 2,
  // Perubahan skor risiko individu (rata-rata 0-4) yang dilabeli membaik / memburuk dibanding bulan lalu.
  individualTrendDelta: 0.5,

  consentText:
    'Saya memahami check-in ini bukan tes psikologis dan bukan diagnosis. ' +
    'Saya setuju jawaban saya diproses bersama NIM saya oleh pengelola layanan kemahasiswaan ' +
    'untuk memantau kesejahteraan dan menyiapkan dukungan.',

  crisisNotice:
    'Check-in bulanan bukan layanan darurat dan tidak dipantau secara real time. ' +
    'Jika kamu atau temanmu membutuhkan bantuan segera, hubungi layanan konseling kampus atau ' +
    'layanan krisis yang tersedia di institusimu.',

  // protective = true berarti skor dibalik (risiko = 4 - jawaban).
  indicators: {
    I1: {
      name: 'Tingkat stres', short: 'Stres', english: 'Perceived Stress',
      measures: 'Tekanan psikologis yang dirasakan mahasiswa.',
      question: 'Seberapa tinggi tingkat stres yang kamu rasakan selama 30 hari terakhir?',
      scale: 'level', protective: false,
    },
    I2: {
      name: 'Kualitas tidur', short: 'Tidur', english: 'Sleep Quality',
      measures: 'Gangguan tidur dan pemulihan fisik.',
      question: 'Seberapa sering kamu mengalami gangguan tidur atau merasa tidak cukup beristirahat?',
      scale: 'frequency', protective: false,
    },
    I3: {
      name: 'Kelelahan', short: 'Lelah', english: 'Fatigue',
      measures: 'Kelelahan yang mengganggu keseharian.',
      question: 'Seberapa sering kamu merasa kelelahan hingga sulit menjalankan aktivitas sehari-hari?',
      scale: 'frequency', protective: false,
    },
    I4: {
      name: 'Keterhubungan sosial', short: 'Sosial', english: 'Social Connectedness',
      measures: 'Dukungan sosial dan rasa terhubung dengan lingkungan.',
      question: 'Seberapa sering kamu merasa memiliki dukungan sosial dan terhubung dengan orang-orang di kampus?',
      scale: 'frequency', protective: true,
      low_label: 'Sangat tidak terhubung', high_label: 'Sangat terhubung',
    },
    I5: {
      name: 'Tekanan akademik', short: 'Akademik', english: 'Academic Pressure',
      measures: 'Tekanan dari tugas, ujian, tenggat waktu, dan tuntutan akademik.',
      question: 'Seberapa berat tekanan akademik yang kamu rasakan selama 30 hari terakhir?',
      scale: 'level', protective: false,
    },
    I6: {
      name: 'Fungsi keseharian', short: 'Fungsi', english: 'Daily Functioning',
      measures: 'Dampak tekanan pada kemampuan menjalankan aktivitas.',
      question: 'Seberapa sering kamu mengalami kesulitan menjalankan aktivitas sehari-hari karena tekanan yang kamu rasakan?',
      scale: 'frequency', protective: false,
    },
  },

  scales: {
    level: ['Tidak ada / sangat rendah', 'Rendah', 'Sedang', 'Tinggi', 'Sangat tinggi'],
    frequency: ['Tidak pernah', 'Jarang', 'Kadang-kadang', 'Sering', 'Sangat sering'],
  },

  statuses: {
    GREEN: { label: 'Stable', text: 'Kondisi komunitas relatif stabil.', badge: 'green' },
    YELLOW: { label: 'Community Stress', text: 'Tekanan komunitas mulai meningkat.', badge: 'yellow' },
    RED: {
      label: 'High Community Risk',
      text: 'Tekanan komunitas tinggi atau memburuk serentak. Perlu peninjauan manusia.',
      badge: 'red',
    },
    INSUFFICIENT_DATA: {
      label: 'Insufficient Data',
      text: 'Jumlah atau cakupan respons belum memenuhi syarat. Tidak ada klasifikasi.',
      badge: 'gray',
    },
  },

  actions: {
    GREEN: {
      title: 'Maintain & Promote',
      owner: 'Pengelola kemahasiswaan dan organisasi mahasiswa.',
      steps: [
        'Pertahankan program well-being dan peer support.',
        'Sediakan informasi akses konseling.',
        'Pantau perubahan pada periode check-in berikutnya.',
        'Evaluasi apakah mahasiswa mengetahui layanan yang tersedia.',
      ],
    },
    YELLOW: {
      title: 'Prevent & Investigate',
      owner: 'Pengelola program, dosen pembimbing terkait, dan konselor sesuai kebutuhan.',
      steps: [
        'Periksa indikator yang meningkat dan kemungkinan pemicu struktural.',
        'Adakan edukasi pengelolaan stres dan kegiatan dukungan sebaya.',
        'Tinjau beban tugas, jadwal ujian, atau akses dukungan akademik.',
        'Periksa kembali tren pada check-in selanjutnya.',
      ],
    },
    RED: {
      title: 'Review & Strengthen Support',
      owner: 'Pimpinan unit terkait bersama konselor, psikolog, atau tenaga profesional yang berwenang.',
      steps: [
        'Tinjau validitas data dan konteks perubahan.',
        'Koordinasikan dukungan komunitas dan perkuat kapasitas layanan konseling.',
        'Evaluasi kemungkinan masalah sistemik seperti beban akademik atau kurangnya dukungan sosial.',
        'Susun rencana respons, penanggung jawab, dan jadwal evaluasi.',
      ],
    },
    INSUFFICIENT_DATA: {
      title: 'Improve Participation',
      owner: 'Pengelola kemahasiswaan.',
      steps: [
        'Jangan menafsirkan ketiadaan respons sebagai perburukan kondisi.',
        'Periksa jadwal dan saluran pengumuman check-in.',
        'Dorong partisipasi tanpa menekan mahasiswa secara individual.',
      ],
    },
  },

  // Saran tindak lanjut status individu. Draf awal: perlu ditinjau konselor dan psikolog.
  individualActions: {
    GREEN: {
      title: 'Tidak perlu tindak lanjut khusus',
      steps: ['Pastikan informasi layanan konseling mudah diakses.', 'Pantau pada check-in bulan berikutnya.'],
    },
    YELLOW: {
      title: 'Tawarkan dukungan',
      steps: [
        'Tawarkan, bukan mewajibkan, informasi sumber dukungan dan layanan konseling.',
        'Periksa konteks akademik yang mungkin berpengaruh (ujian, tugas, tenggat).',
        'Pantau pada check-in bulan berikutnya.',
      ],
    },
    RED: {
      title: 'Minta peninjauan profesional',
      steps: [
        'Teruskan ke konselor atau tenaga profesional yang berwenang sesuai prosedur institusi.',
        'Pendekatan bersifat mendukung. Jangan dipakai untuk sanksi akademik atau penilaian.',
        'Batasi akses data hanya pada pihak yang berwenang.',
      ],
    },
  },
};
