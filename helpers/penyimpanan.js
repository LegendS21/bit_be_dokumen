'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { badRequest } = require('./errors.js');

/**
 * Penulisan berkas ke persistent volume.
 *
 * Folder ini **tidak pernah** dilayani sebagai static directory — satu-satunya
 * jalan mengambil isinya adalah lewat endpoint yang memeriksa otorisasi.
 */

const AKAR = path.resolve(process.env.STORAGE_ROOT || './storage');

/** Bentuk kode permohonan dikunci; ini yang jadi nama folder. */
const POLA_KODE = /^PRM-\d{4}-\d{6}$/;

function pastikanKodeAman(kodePermohonan) {
  if (!POLA_KODE.test(kodePermohonan)) {
    throw badRequest(
      'Kode permohonan tidak berformat PRM-YYYY-NNNNNN',
      'KODE_PERMOHONAN_TIDAK_VALID'
    );
  }
  return kodePermohonan;
}

/**
 * Nama di disk dirakit sendiri: `{kode persyaratan}_{uuid}{ekstensi}`.
 * Nama asli dari user tidak pernah menyentuh filesystem — itu yang menutup
 * path traversal (`../../`), tabrakan nama, dan ekstensi ganda (`a.pdf.exe`).
 */
function rakitNamaSimpan(kodePersyaratan, id, ext) {
  const awalan = String(kodePersyaratan || 'dok')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || 'dok';

  return `${awalan}_${id}${ext}`;
}

function jalurBerkas(kodePermohonan, namaFileSimpan) {
  pastikanKodeAman(kodePermohonan);

  const lengkap = path.join(AKAR, kodePermohonan, namaFileSimpan);

  // Sabuk pengaman kedua: berapa pun isian yang lolos ke sini, hasil akhirnya
  // wajib tetap berada di dalam folder storage.
  const relatif = path.relative(AKAR, lengkap);
  if (relatif.startsWith('..') || path.isAbsolute(relatif)) {
    throw badRequest('Jalur berkas tidak sah', 'JALUR_TIDAK_SAH');
  }

  return lengkap;
}

async function tulis(kodePermohonan, namaFileSimpan, buffer) {
  const lengkap = jalurBerkas(kodePermohonan, namaFileSimpan);
  await fs.mkdir(path.dirname(lengkap), { recursive: true });
  // `wx` = gagal kalau berkasnya sudah ada, jadi tidak mungkin menimpa
  // berkas milik orang lain secara tidak sengaja.
  await fs.writeFile(lengkap, buffer, { flag: 'wx' });
  return lengkap;
}

/** Dipakai saat penyimpanan ke database gagal setelah berkas terlanjur ditulis. */
async function hapusDiam(jalur) {
  try {
    await fs.unlink(jalur);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Gagal membersihkan berkas', jalur, error.message);
    }
  }
}

async function ada(jalur) {
  try {
    await fs.access(jalur);
    return true;
  } catch {
    return false;
  }
}

const checksum = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

module.exports = {
  AKAR,
  pastikanKodeAman,
  rakitNamaSimpan,
  jalurBerkas,
  tulis,
  hapusDiam,
  ada,
  checksum
};
