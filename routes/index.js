'use strict';

const express = require('express');
const dokumenRouter = require('./dokumenRouter.js');
const { CLAMAV_AKTIF } = require('../helpers/pemindai.js');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'bit_be_dokumen',
    // Ditampilkan supaya ketahuan kalau service berjalan tanpa pindai virus.
    pindai_virus: CLAMAV_AKTIF ? 'aktif' : 'nonaktif',
    waktu: new Date().toISOString()
  });
});

router.use('/dokumen', dokumenRouter);

router.use((req, res) => {
  res.status(404).json({
    message: `Route ${req.method} ${req.originalUrl} tidak ditemukan`,
    code: 'NOT_FOUND'
  });
});

module.exports = router;
