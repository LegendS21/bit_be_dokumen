'use strict';

const axios = require('axios');
const { badRequest, forbidden, notFound } = require('./errors.js');

/**
 * Pemanggilan ke service Master dan Transaksi.
 *
 * Seperti di service Transaksi, **token pemanggil diteruskan apa adanya**.
 * Efeknya: aturan kepemilikan tetap ditegakkan service pemilik datanya, jadi
 * tidak ada aturan yang perlu ditulis ulang (dan berpotensi berbeda) di sini.
 */

const MASTER_URL = process.env.MASTER_BASE_URL || 'http://localhost:3002';
const TRANSAKSI_URL = process.env.TRANSAKSI_BASE_URL || 'http://localhost:3003';
const TIMEOUT_MS = Number(process.env.LAYANAN_TIMEOUT_MS || 5000);

async function panggil(url, token, namaLayanan) {
  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: token },
      timeout: TIMEOUT_MS
    });
    return data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 404) return null;
    if (status === 401 || status === 403) {
      throw forbidden('Tidak berhak membaca data terkait', 'LAYANAN_FORBIDDEN');
    }

    console.error(`Gagal memanggil service ${namaLayanan}:`, error.message);
    throw badRequest(
      `Service ${namaLayanan} sedang tidak bisa dihubungi. Coba lagi sebentar lagi.`,
      'LAYANAN_TIDAK_TERSEDIA'
    );
  }
}

/**
 * Cari permohonan milik pemanggil berdasarkan kodenya.
 *
 * Dipakai untuk dua hal sekaligus saat mengunggah: memastikan kode itu memang
 * miliknya (kalau tidak, berkas orang lain bisa dititipkan ke folder yang
 * salah), dan memastikan permohonannya masih boleh disunting.
 *
 * Transaksi tidak punya pencarian berdasarkan kode, jadi daftarnya diambil
 * lalu dicocokkan di sini. Satu orang tidak akan punya ratusan permohonan,
 * jadi satu halaman besar sudah cukup.
 */
async function permohonanSaya(kodePermohonan, token) {
  const hasil = await panggil(
    `${TRANSAKSI_URL}/permohonan/saya?limit=100`,
    token,
    'Transaksi'
  );

  const cocok = (hasil?.data || []).find((p) => p.kode_permohonan === kodePermohonan);
  if (!cocok) {
    // 404, bukan 403 — jangan beri tahu penebak kode bahwa permohonan itu ada.
    throw notFound('Permohonan tidak ditemukan', 'PERMOHONAN_NOT_FOUND');
  }

  return cocok;
}

/** Aturan jenis dokumen (format & ukuran) untuk satu program. */
async function syaratProgram(beasiswaId, token) {
  const hasil = await panggil(
    `${MASTER_URL}/beasiswa/${beasiswaId}/persyaratan`,
    token,
    'Master'
  );
  return hasil?.data?.persyaratan || [];
}

module.exports = { permohonanSaya, syaratProgram };
