'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize, dokumen, dokumen_akses_log, presigned_token } = require('../models');

const { badRequest, conflict, forbidden, notFound } = require('../helpers/errors.js');
const { kenaliBerkas, MIME_DIKENALI } = require('../helpers/magicBytes.js');
const { pindai, bolehDiakses, CLAMAV_AKTIF } = require('../helpers/pemindai.js');
const simpan = require('../helpers/penyimpanan.js');
const { permohonanSaya, syaratProgram } = require('../helpers/layananLain.js');

const ROLE_INTERNAL = ['ADMIN', 'VERIFIKATOR', 'LEMBAGA_SELEKSI'];
const punyaRoleInternal = (user) => (user?.roles || []).some((r) => ROLE_INTERNAL.includes(r));

/** Status permohonan yang masih boleh disunting pemiliknya. */
const STATUS_BISA_DIUBAH = ['DRAFT', 'REVISI'];

function idPelaku(user) {
  if (!user?.id) {
    throw forbidden(
      'Token tidak memuat identitas pengguna (klaim uid). Silakan login ulang.',
      'IDENTITAS_TIDAK_LENGKAP'
    );
  }
  return user.id;
}

/**
 * Otorisasi berkas: pemiliknya, atau pengguna internal yang memang bertugas
 * memeriksa berkas (verifikator, lembaga seleksi, admin).
 *
 * Milik orang lain dibalas **404, bukan 403** — membedakan keduanya memberi
 * tahu penebak UUID bahwa berkas itu ada.
 */
function pastikanBolehAkses(baris, user) {
  if (punyaRoleInternal(user)) return;
  if (Number(baris.owner_user_id) !== Number(idPelaku(user))) {
    throw notFound('Dokumen tidak ditemukan', 'DOKUMEN_NOT_FOUND');
  }
}

async function ambilDokumen(id) {
  const baris = await dokumen.findByPk(id);
  if (!baris) throw notFound('Dokumen tidak ditemukan', 'DOKUMEN_NOT_FOUND');
  return baris;
}

/** Peran yang dicatat di log — yang pertama cocok sudah cukup untuk audit. */
const peranPelaku = (user) => (user?.roles || [])[0] || null;

async function catatAkses(dokumenId, user, aksi, req, transaction) {
  await dokumen_akses_log.create(
    {
      dokumen_id: dokumenId,
      user_id: idPelaku(user),
      user_role: peranPelaku(user),
      aksi,
      // `req.ip` sudah menghormati `trust proxy`. Kolomnya bertipe INET, jadi
      // nilai yang bukan alamat IP ditolak database.
      ip_address: req?.ip || null,
      user_agent: req?.headers?.['user-agent']?.slice(0, 1000) || null
    },
    { transaction }
  );
}

function bentuk(baris) {
  return {
    id: baris.id,
    kode_permohonan: baris.kode_permohonan,
    persyaratan_id: Number(baris.persyaratan_id),
    nama_file_asli: baris.nama_file_asli,
    mime_type: baris.mime_type,
    ukuran_byte: Number(baris.ukuran_byte),
    checksum_sha256: baris.checksum_sha256,
    magic_verified: baris.magic_verified,
    scan_status: baris.scan_status,
    scan_engine: baris.scan_engine,
    scanned_at: baris.scanned_at,
    uploaded_at: baris.uploaded_at,
    // `storage_path` sengaja TIDAK ikut: letak berkas di server bukan urusan
    // client, dan membocorkannya memudahkan percobaan path traversal.
    bisa_diakses: bolehDiakses(baris.scan_status)
  };
}

class DokumenService {
  /**
   * POST /dokumen/upload
   *
   * Urutannya penting dan disengaja:
   *   1. permohonannya milik pemanggil dan masih boleh disunting;
   *   2. jenis dokumennya memang diminta program itu;
   *   3. **isi berkas** dikenali dari magic bytes;
   *   4. jenis & ukurannya sesuai aturan persyaratan;
   *   5. dipindai virus — masih di memori;
   *   6. baru ditulis ke disk, lalu dicatat ke database.
   *
   * Berkas yang gagal di langkah mana pun tidak pernah menyentuh filesystem.
   */
  static async unggah({ data, berkas, user, tokenHeader, req }) {
    const userId = idPelaku(user);

    if (!berkas?.buffer?.length) {
      throw badRequest('Berkas tidak ikut terkirim', 'BERKAS_KOSONG');
    }

    // 1 — kepemilikan & status permohonan (ditegakkan service Transaksi).
    const permohonan = await permohonanSaya(data.kode_permohonan, tokenHeader);
    if (!STATUS_BISA_DIUBAH.includes(permohonan.status)) {
      throw conflict(
        `Permohonan berstatus ${permohonan.status} sudah terkunci, berkas tidak bisa diubah`,
        'PERMOHONAN_TERKUNCI'
      );
    }

    // 2 — jenis dokumen harus memang diminta program ini.
    const syarat = await syaratProgram(permohonan.beasiswa_id, tokenHeader);
    const aturan = syarat.find((s) => Number(s.persyaratan_id) === Number(data.persyaratan_id));
    if (!aturan) {
      throw badRequest(
        'Jenis dokumen ini tidak diminta oleh program yang Anda daftar',
        'PERSYARATAN_TIDAK_DIMINTA'
      );
    }

    // 3 — jenis berkas dari ISINYA, bukan dari ekstensi atau Content-Type.
    const dikenali = kenaliBerkas(berkas.buffer);
    if (!dikenali) {
      throw badRequest(
        `Isi berkas tidak dikenali. Yang diterima: ${MIME_DIKENALI.join(', ')}`,
        'JENIS_BERKAS_TIDAK_DIKENALI'
      );
    }

    // 4 — cocokkan dengan aturan persyaratan.
    const diizinkan = aturan.allowed_mime || [];
    if (diizinkan.length && !diizinkan.includes(dikenali.mime)) {
      throw badRequest(
        `${aturan.nama} hanya menerima ${diizinkan.join(', ')}, berkas Anda ${dikenali.mime}`,
        'MIME_TIDAK_DIIZINKAN'
      );
    }

    const batasByte = Number(aturan.max_size_kb || 0) * 1024;
    if (batasByte > 0 && berkas.size > batasByte) {
      throw badRequest(
        `Ukuran berkas melebihi batas ${aturan.max_size_kb} KB untuk ${aturan.nama}`,
        'BERKAS_TERLALU_BESAR'
      );
    }

    // Berkas identik untuk permohonan yang sama ditolak lebih awal supaya
    // pesannya jelas; index unik parsial tetap jadi penjaga terakhir.
    const sidik = simpan.checksum(berkas.buffer);
    const kembar = await dokumen.findOne({
      where: { kode_permohonan: data.kode_permohonan, checksum_sha256: sidik }
    });
    if (kembar) {
      throw conflict(
        `Berkas dengan isi yang sama persis sudah diunggah untuk permohonan ini (${kembar.nama_file_asli})`,
        'BERKAS_DUPLIKAT'
      );
    }

    // 5 — pindai selagi masih di memori.
    const hasilPindai = await pindai(berkas.buffer);
    if (hasilPindai.status === 'INFECTED') {
      // Sengaja tidak disimpan sama sekali — tidak ada barisnya, tidak ada
      // berkasnya. Yang tertinggal cuma catatan di log server.
      console.warn(
        `Berkas terinfeksi ditolak: user=${userId} permohonan=${data.kode_permohonan} ` +
          `virus=${hasilPindai.keterangan}`
      );
      throw badRequest(
        'Berkas terdeteksi mengandung malware dan ditolak',
        'BERKAS_TERINFEKSI'
      );
    }
    if (hasilPindai.status === 'ERROR') {
      throw badRequest(
        'Berkas tidak bisa dipindai saat ini, jadi belum bisa diterima. Coba lagi sebentar lagi.',
        'PINDAI_GAGAL'
      );
    }

    // 6 — tulis ke disk, lalu catat. Id dibuat di aplikasi supaya nama berkas
    // sudah bisa dirakit sebelum barisnya tersimpan.
    const id = crypto.randomUUID();
    const namaSimpan = simpan.rakitNamaSimpan(aturan.kode, id, dikenali.ext);
    const jalur = await simpan.tulis(data.kode_permohonan, namaSimpan, berkas.buffer);

    try {
      const baru = await sequelize.transaction(async (t) => {
        const baris = await dokumen.create(
          {
            id,
            kode_permohonan: data.kode_permohonan,
            owner_user_id: userId,
            persyaratan_id: data.persyaratan_id,
            nama_file_asli: berkas.originalname?.slice(0, 255) || 'berkas',
            nama_file_simpan: namaSimpan,
            storage_path: jalur,
            mime_type: dikenali.mime,
            // Klaim client disimpan apa adanya untuk audit — kalau berbeda
            // dari hasil deteksi, itu jejak percobaan pemalsuan.
            mime_klaim_client: berkas.mimetype?.slice(0, 100) || null,
            ukuran_byte: berkas.size,
            checksum_sha256: sidik,
            magic_verified: true,
            scan_status: hasilPindai.status,
            scan_engine: hasilPindai.engine,
            scanned_at: hasilPindai.status === 'CLEAN' ? new Date() : null,
            uploaded_at: new Date()
          },
          { transaction: t }
        );

        await catatAkses(baris.id, user, 'UPLOAD', req, t);
        return baris;
      });

      return bentuk(baru);
    } catch (error) {
      // Berkasnya sudah di disk tapi barisnya gagal tersimpan — bersihkan,
      // kalau tidak akan ada berkas yatim yang tidak pernah bisa diakses.
      await simpan.hapusDiam(jalur);
      throw error;
    }
  }

  /** GET /dokumen?kode_permohonan=… — daftar berkas satu permohonan. */
  static async daftar(kodePermohonan, user, tokenHeader) {
    if (!punyaRoleInternal(user)) {
      // Memastikan kode itu memang miliknya; kalau bukan → 404.
      await permohonanSaya(kodePermohonan, tokenHeader);
    }

    const baris = await dokumen.findAll({
      where: { kode_permohonan: kodePermohonan },
      order: [['uploaded_at', 'ASC']]
    });

    return { data: baris.map(bentuk) };
  }

  /** GET /dokumen/:id/meta — metadata tanpa isi berkas. */
  static async detail(id, user) {
    const baris = await ambilDokumen(id);
    pastikanBolehAkses(baris, user);
    return bentuk(baris);
  }

  /**
   * Siapkan pengiriman isi berkas. Yang dikembalikan cuma keterangannya;
   * stream-nya dibuat controller, supaya service tidak menyentuh `res`.
   */
  static async siapkanUnduh(id, user, req, aksi = 'DOWNLOAD') {
    const baris = await ambilDokumen(id);
    pastikanBolehAkses(baris, user);
    return DokumenService.siapkanUnduhTanpaCek(baris, user, req, aksi);
  }

  /** Dipakai jalur presigned, yang otorisasinya sudah lewat token. */
  static async siapkanUnduhTanpaCek(baris, user, req, aksi = 'DOWNLOAD') {
    if (!bolehDiakses(baris.scan_status)) {
      throw forbidden(
        baris.scan_status === 'INFECTED'
          ? 'Berkas ini ditandai mengandung malware dan tidak bisa dibuka'
          : 'Berkas ini belum lolos pindai virus, jadi belum bisa dibuka',
        'BERKAS_BELUM_AMAN'
      );
    }

    if (!(await simpan.ada(baris.storage_path))) {
      console.error('Berkas hilang dari storage:', baris.storage_path);
      throw notFound('Berkas tidak ada di penyimpanan', 'BERKAS_HILANG');
    }

    await catatAkses(baris.id, user, aksi, req);

    return {
      jalur: baris.storage_path,
      mime: baris.mime_type,
      namaAsli: baris.nama_file_asli,
      ukuran: Number(baris.ukuran_byte)
    };
  }

  /**
   * POST /dokumen/:id/presigned — URL sementara yang terikat satu user.
   *
   * Tokennya disimpan sebagai SHA-256; nilai mentahnya cuma pernah ada di URL
   * yang dikembalikan — perlakuan yang sama dengan refresh token di RBAC.
   */
  static async buatPresigned(id, berlakuDetik, user, req) {
    const baris = await ambilDokumen(id);
    pastikanBolehAkses(baris, user);

    if (!bolehDiakses(baris.scan_status)) {
      throw forbidden('Berkas ini belum lolos pindai virus', 'BERKAS_BELUM_AMAN');
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const kedaluwarsa = new Date(Date.now() + berlakuDetik * 1000);

    await sequelize.transaction(async (t) => {
      await presigned_token.create(
        {
          dokumen_id: baris.id,
          token_hash: hash,
          user_id: idPelaku(user),
          expires_at: kedaluwarsa
        },
        { transaction: t }
      );

      await catatAkses(baris.id, user, 'PRESIGN', req, t);
    });

    return {
      url: `/dokumen/public/${token}`,
      token,
      berlaku_sampai: kedaluwarsa,
      dokumen_id: baris.id
    };
  }

  /**
   * GET /dokumen/public/:token — akses tanpa header Authorization.
   *
   * Tokennya sekali pakai: begitu dipakai, `used_at` diisi dan pemakaian
   * berikutnya ditolak. Jadi URL yang terlanjur tersimpan di riwayat browser
   * atau log proxy tidak bisa dipakai ulang.
   */
  static async aksesPresigned(token, req) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const baris = await presigned_token.findOne({
      where: { token_hash: hash },
      include: [{ association: 'dokumen' }]
    });

    // Semua kegagalan dijawab sama supaya tidak bisa dibedakan token salah,
    // token kedaluwarsa, dan token sudah terpakai.
    const tolak = () => forbidden('Tautan tidak berlaku atau sudah kedaluwarsa', 'TAUTAN_TIDAK_BERLAKU');

    if (!baris || baris.used_at) throw tolak();
    if (new Date(baris.expires_at).getTime() < Date.now()) throw tolak();
    if (!baris.dokumen || baris.dokumen.deleted_at) throw tolak();

    await baris.update({ used_at: new Date() });

    // Pelakunya adalah user yang tokennya diikat, bukan pengunjung anonim.
    const pemilikToken = { id: Number(baris.user_id), roles: ['PRESIGNED'] };
    return DokumenService.siapkanUnduhTanpaCek(baris.dokumen, pemilikToken, req, 'VIEW');
  }

  /**
   * DELETE /dokumen/:id — soft delete, hanya pemilik & permohonan masih
   * DRAFT/REVISI. Berkas fisiknya sengaja **tidak** ikut dihapus: barisnya
   * masih ada untuk audit, dan menghapus file membuat jejaknya tidak bisa
   * ditelusuri lagi. Pembersihan disk dilakukan terpisah.
   */
  static async hapus(id, user, tokenHeader, req) {
    const baris = await ambilDokumen(id);

    // Internal pun tidak boleh menghapus berkas pelamar.
    if (Number(baris.owner_user_id) !== Number(idPelaku(user))) {
      throw notFound('Dokumen tidak ditemukan', 'DOKUMEN_NOT_FOUND');
    }

    const permohonan = await permohonanSaya(baris.kode_permohonan, tokenHeader);
    if (!STATUS_BISA_DIUBAH.includes(permohonan.status)) {
      throw conflict(
        `Permohonan berstatus ${permohonan.status} sudah terkunci, berkas tidak bisa dihapus`,
        'PERMOHONAN_TERKUNCI'
      );
    }

    await sequelize.transaction(async (t) => {
      await catatAkses(baris.id, user, 'DELETE', req, t);
      await baris.destroy({ transaction: t });
      // Token yang terlanjur dibuat ikut dimatikan.
      await presigned_token.update(
        { used_at: new Date() },
        { where: { dokumen_id: baris.id, used_at: null }, transaction: t }
      );
    });

    return { id: baris.id, nama_file_asli: baris.nama_file_asli };
  }

  /** GET /dokumen/:id/log — jejak akses, khusus ADMIN. */
  static async log(id) {
    const baris = await ambilDokumen(id);

    const log = await dokumen_akses_log.findAll({
      where: { dokumen_id: baris.id },
      order: [['created_at', 'DESC']],
      limit: 200
    });

    return {
      data: log.map((l) => ({
        id: Number(l.id),
        user_id: Number(l.user_id),
        user_role: l.user_role,
        aksi: l.aksi,
        ip_address: l.ip_address,
        created_at: l.created_at
      }))
    };
  }

  /** Dipakai health check untuk menunjukkan pindai virus menyala atau tidak. */
  static get pindaiAktif() {
    return CLAMAV_AKTIF;
  }
}

// Diekspor untuk pembersihan token kedaluwarsa (belum dijadwalkan).
DokumenService.bersihkanTokenKedaluwarsa = () =>
  presigned_token.destroy({ where: { expires_at: { [Op.lt]: new Date() } } });

module.exports = DokumenService;
