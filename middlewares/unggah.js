'use strict';

const multer = require('multer');
const { badRequest } = require('../helpers/errors.js');

/**
 * Penerimaan berkas unggahan.
 *
 * **Disimpan di memori, bukan file sementara.** Berkas harus lolos pemeriksaan
 * magic bytes dan pindai virus sebelum boleh menyentuh disk — kalau ditulis
 * lebih dulu ke folder temp, berkas terinfeksi sempat ada di filesystem.
 *
 * Batas di sini adalah pagar kasar supaya memori tidak dijebol. Batas
 * sebenarnya per jenis dokumen (`max_size_kb`) ditegakkan di service setelah
 * jenis persyaratannya diketahui.
 */

const BATAS_BYTE = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;

const unggah = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: BATAS_BYTE,
    files: 1,
    // Hanya `kode_permohonan` dan `persyaratan_id`; sisanya tidak diperlukan.
    fields: 5
  }
}).single('berkas');

/** Error multer diterjemahkan jadi pesan yang bisa dibaca pengguna. */
const terimaBerkas = (req, res, next) => {
  unggah(req, res, (error) => {
    if (!error) return next();

    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(
        badRequest(
          `Ukuran berkas melebihi batas ${process.env.MAX_UPLOAD_MB || 10} MB`,
          'BERKAS_TERLALU_BESAR'
        )
      );
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(badRequest('Kirim tepat satu berkas pada field "berkas"', 'BERKAS_TIDAK_SESUAI'));
    }

    next(error);
  });
};

module.exports = { terimaBerkas, BATAS_BYTE };
