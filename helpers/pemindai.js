'use strict';

const net = require('net');

/**
 * Pindai berkas ke daemon ClamAV (`clamd`) lewat protokol INSTREAM.
 *
 * Ditulis langsung di atas soket TCP, tanpa library: protokolnya sederhana —
 * kirim `zINSTREAM\0`, lalu potongan data yang tiap potongnya diawali panjang
 * 4 byte big-endian, ditutup panjang 0. Balasannya satu baris.
 *
 * Berkas dipindai **sebelum** ditulis ke storage final; isinya masih di memori,
 * jadi berkas terinfeksi tidak pernah menyentuh disk sama sekali.
 */

const HOST = process.env.CLAMAV_HOST || '127.0.0.1';
const PORT = Number(process.env.CLAMAV_PORT || 3310);
const TIMEOUT_MS = Number(process.env.CLAMAV_TIMEOUT_MS || 30000);
const AKTIF = process.env.CLAMAV_ENABLED === 'true';

/** Potongan 64 KB — di bawah StreamMaxLength bawaan clamd. */
const UKURAN_POTONGAN = 64 * 1024;

function kirimKeClamd(buffer) {
  return new Promise((resolve, reject) => {
    const soket = net.createConnection({ host: HOST, port: PORT });
    let balasan = '';

    soket.setTimeout(TIMEOUT_MS);
    soket.on('timeout', () => {
      soket.destroy();
      reject(new Error('clamd tidak membalas sebelum batas waktu'));
    });
    soket.on('error', reject);
    soket.on('data', (d) => { balasan += d.toString('utf8'); });
    soket.on('end', () => resolve(balasan.trim().replace(/\0+$/, '')));

    soket.on('connect', () => {
      soket.write('zINSTREAM\0');

      for (let i = 0; i < buffer.length; i += UKURAN_POTONGAN) {
        const potong = buffer.subarray(i, i + UKURAN_POTONGAN);
        const panjang = Buffer.alloc(4);
        panjang.writeUInt32BE(potong.length, 0);
        soket.write(panjang);
        soket.write(potong);
      }

      // Panjang 0 = penanda akhir stream.
      soket.write(Buffer.from([0, 0, 0, 0]));
    });
  });
}

/**
 * @returns {{status: 'CLEAN'|'INFECTED'|'ERROR'|'PENDING', engine: string|null, keterangan: string|null}}
 *
 * Tidak pernah melempar: kegagalan pindai adalah keadaan yang harus tercatat
 * di database (`scan_status = ERROR`), bukan error tak terduga.
 */
async function pindai(buffer) {
  if (!AKTIF) {
    // Sengaja TIDAK dilaporkan sebagai CLEAN. Menandai berkas yang belum
    // pernah dipindai sebagai bersih berarti berbohong di catatan audit.
    return {
      status: 'PENDING',
      engine: null,
      keterangan: 'ClamAV dinonaktifkan (CLAMAV_ENABLED != true)'
    };
  }

  try {
    const balasan = await kirimKeClamd(buffer);

    if (/\bOK$/.test(balasan)) {
      return { status: 'CLEAN', engine: 'clamd/INSTREAM', keterangan: null };
    }
    if (/\bFOUND$/.test(balasan)) {
      // Contoh: "stream: Eicar-Test-Signature FOUND"
      const nama = balasan.replace(/^stream:\s*/, '').replace(/\s*FOUND$/, '');
      return { status: 'INFECTED', engine: 'clamd/INSTREAM', keterangan: nama };
    }

    return { status: 'ERROR', engine: 'clamd/INSTREAM', keterangan: balasan || 'balasan kosong' };
  } catch (error) {
    console.error('Gagal memindai berkas:', error.message);
    return { status: 'ERROR', engine: 'clamd/INSTREAM', keterangan: error.message };
  }
}

/**
 * Berkas boleh diakses kalau sudah dinyatakan bersih. Saat ClamAV sengaja
 * dimatikan (pengembangan), `PENDING` ikut diizinkan — tapi hanya karena
 * pemiliknya yang mematikan, bukan karena statusnya dianggap bersih.
 */
function bolehDiakses(scanStatus) {
  if (scanStatus === 'CLEAN') return true;
  return !AKTIF && scanStatus === 'PENDING';
}

module.exports = { pindai, bolehDiakses, CLAMAV_AKTIF: AKTIF };
