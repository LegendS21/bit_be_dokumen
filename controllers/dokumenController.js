'use strict';

const fs = require('fs');
const DokumenService = require('../services/dokumenService.js');
const {
  unggahSchema,
  daftarQuerySchema,
  presignedSchema,
  uuidParam,
  tokenParam
} = require('../validators/dokumenValidator.js');

const tokenDari = (req) => req.headers.authorization;

/**
 * Kirim isi berkas ke client.
 *
 * `Content-Disposition: attachment` dan `X-Content-Type-Options: nosniff`
 * dipasang bersama supaya berkas tidak pernah dirender di origin ini — HTML
 * atau SVG yang menyelinap lolos pun tidak bisa jadi XSS.
 */
function kirimBerkas(res, berkas, sebagaiLampiran = true) {
  const namaAman = berkas.namaAsli.replace(/["\\\r\n]/g, '_');

  res.setHeader('Content-Type', berkas.mime);
  res.setHeader('Content-Length', berkas.ukuran);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader(
    'Content-Disposition',
    `${sebagaiLampiran ? 'attachment' : 'inline'}; filename="${namaAman}"`
  );

  const aliran = fs.createReadStream(berkas.jalur);
  aliran.on('error', (error) => {
    console.error('Gagal membaca berkas:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Gagal membaca berkas', code: 'BERKAS_GAGAL_DIBACA' });
    } else {
      res.destroy(error);
    }
  });
  aliran.pipe(res);
}

class DokumenController {
  /** POST /dokumen/upload */
  static async unggah(req, res, next) {
    try {
      const data = unggahSchema.parse(req.body ?? {});
      const hasil = await DokumenService.unggah({
        data,
        berkas: req.file,
        user: req.user,
        tokenHeader: tokenDari(req),
        req
      });
      res.status(201).json({ message: 'Berkas berhasil diunggah', data: hasil });
    } catch (error) {
      next(error);
    }
  }

  /** GET /dokumen?kode_permohonan=… */
  static async daftar(req, res, next) {
    try {
      const { kode_permohonan } = daftarQuerySchema.parse(req.query);
      res.status(200).json(
        await DokumenService.daftar(kode_permohonan, req.user, tokenDari(req))
      );
    } catch (error) {
      next(error);
    }
  }

  /** GET /dokumen/:id/meta */
  static async detail(req, res, next) {
    try {
      const id = uuidParam.parse(req.params.id);
      res.status(200).json({ data: await DokumenService.detail(id, req.user) });
    } catch (error) {
      next(error);
    }
  }

  /** GET /dokumen/:id — stream isi berkas setelah cek otorisasi. */
  static async unduh(req, res, next) {
    try {
      const id = uuidParam.parse(req.params.id);
      const berkas = await DokumenService.siapkanUnduh(id, req.user, req);
      kirimBerkas(res, berkas);
    } catch (error) {
      next(error);
    }
  }

  /** POST /dokumen/:id/presigned */
  static async presigned(req, res, next) {
    try {
      const id = uuidParam.parse(req.params.id);
      const { berlaku_detik } = presignedSchema.parse(req.body ?? {});
      const hasil = await DokumenService.buatPresigned(id, berlaku_detik, req.user, req);
      res.status(201).json({ message: 'Tautan sementara dibuat', data: hasil });
    } catch (error) {
      next(error);
    }
  }

  /** GET /dokumen/public/:token — tanpa header Authorization. */
  static async publik(req, res, next) {
    try {
      const token = tokenParam.parse(req.params.token);
      const berkas = await DokumenService.aksesPresigned(token, req);
      // Ditampilkan inline: tautan ini dipakai untuk pratinjau di layar.
      kirimBerkas(res, berkas, false);
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /dokumen/:id */
  static async hapus(req, res, next) {
    try {
      const id = uuidParam.parse(req.params.id);
      const hasil = await DokumenService.hapus(id, req.user, tokenDari(req), req);
      res.status(200).json({ message: 'Berkas berhasil dihapus', data: hasil });
    } catch (error) {
      next(error);
    }
  }

  /** GET /dokumen/:id/log */
  static async log(req, res, next) {
    try {
      const id = uuidParam.parse(req.params.id);
      res.status(200).json(await DokumenService.log(id));
    } catch (error) {
      next(error);
    }
  }
}

module.exports = DokumenController;
