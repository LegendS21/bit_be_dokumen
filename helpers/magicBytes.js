'use strict';

/**
 * Deteksi jenis berkas dari **isinya**, bukan dari ekstensi atau `Content-Type`
 * yang dikirim client — keduanya sepenuhnya dikendalikan penyerang.
 *
 * Sengaja ditulis sendiri, bukan memakai library: jenis yang boleh diunggah di
 * aplikasi ini cuma empat, dan tanda tangannya pendek serta stabil. Library
 * seperti `file-type` mengenali ratusan format — itu justru memperluas
 * permukaan serangan tanpa manfaat di sini.
 */

const TANDA_TANGAN = [
  {
    mime: 'application/pdf',
    ext: '.pdf',
    // "%PDF-"
    cocok: (b) => b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-'
  },
  {
    mime: 'image/jpeg',
    ext: '.jpg',
    cocok: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  },
  {
    mime: 'image/png',
    ext: '.png',
    cocok: (b) =>
      b.length >= 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  },
  {
    mime: 'image/webp',
    ext: '.webp',
    // RIFF....WEBP — panjang berkas ada di antara keduanya, jadi tidak diperiksa.
    cocok: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP'
  }
];

/**
 * @returns {{mime: string, ext: string} | null} null kalau isinya bukan salah
 * satu jenis yang dikenali — termasuk saat berkasnya terlalu pendek.
 */
function kenaliBerkas(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  const cocok = TANDA_TANGAN.find((t) => t.cocok(buffer));
  return cocok ? { mime: cocok.mime, ext: cocok.ext } : null;
}

/** Daftar MIME yang bisa dikenali service ini, untuk pesan error. */
const MIME_DIKENALI = TANDA_TANGAN.map((t) => t.mime);

module.exports = { kenaliBerkas, MIME_DIKENALI };
