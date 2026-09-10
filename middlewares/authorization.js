'use strict';

const { forbidden, unauthorized } = require('../helpers/errors.js');

/**
 * Batasi akses ke role tertentu. Dipakai setelah `authentication`.
 *
 * Catatan: hak akses per menu (`role_menu_access`) hidup di db_rbac dan tidak
 * bisa dibaca dari sini — databasenya terpisah. Selama Gateway belum ada,
 * service ini menjaga dengan role saja.
 *
 * Role saja **tidak cukup** untuk permohonan: seorang APPLICANT yang sah tetap
 * tidak boleh membuka permohonan milik orang lain. Kepemilikannya diperiksa
 * lagi di service (lihat `pastikanBolehLihat`).
 */
const authorize = (...kodeRole) => (req, res, next) => {
  try {
    if (!req.user) {
      throw unauthorized('Belum terautentikasi', 'TOKEN_MISSING');
    }

    const punyaAkses = (req.user.roles || []).some((r) => kodeRole.includes(r));
    if (!punyaAkses) {
      throw forbidden('Anda tidak punya akses ke resource ini', 'ROLE_NOT_ALLOWED');
    }

    next();
  } catch (error) {
    next(error);
  }
};

const isAdmin = authorize('ADMIN');
const isVerifikator = authorize('VERIFIKATOR', 'ADMIN');
const isLembagaSeleksi = authorize('LEMBAGA_SELEKSI', 'ADMIN');
const isApplicant = authorize('APPLICANT');
/** Semua pengguna internal — dipakai untuk membaca daftar permohonan. */
const isInternal = authorize('ADMIN', 'VERIFIKATOR', 'LEMBAGA_SELEKSI');

module.exports = {
  authorize,
  isAdmin,
  isVerifikator,
  isLembagaSeleksi,
  isApplicant,
  isInternal
};
