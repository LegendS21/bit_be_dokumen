'use strict';

const express = require('express');
const DokumenController = require('../controllers/dokumenController.js');
const authentication = require('../middlewares/authentication.js');
const { isAdmin, isApplicant } = require('../middlewares/authorization.js');
const { terimaBerkas } = require('../middlewares/unggah.js');

const router = express.Router();

// Jalur presigned SENGAJA di atas `authentication`: tautan sementara memang
// dipakai tanpa header Authorization (mis. langsung di `src` sebuah <img>).
// Otorisasinya ada pada tokennya sendiri — sekali pakai, berbatas waktu, dan
// terikat ke satu user.
router.get('/public/:token', DokumenController.publik);

router.use(authentication);

// Hanya pelamar yang mengunggah berkasnya sendiri.
router.post('/upload', isApplicant, terimaBerkas, DokumenController.unggah);

router.get('/', DokumenController.daftar);

// `/:id/...` didaftarkan sebelum `/:id` yang menstream berkas, supaya tidak
// tertelan sebagai bagian dari id.
router.get('/:id/meta', DokumenController.detail);
router.get('/:id/log', isAdmin, DokumenController.log);
router.post('/:id/presigned', DokumenController.presigned);

router.get('/:id', DokumenController.unduh);
router.delete('/:id', isApplicant, DokumenController.hapus);

module.exports = router;
