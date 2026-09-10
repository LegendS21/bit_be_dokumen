'use strict';

const { rateLimit } = require('express-rate-limit');

/** Batas umum ~100 request/menit per IP, sesuai ketentuan di petunjuk. */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PER_MENIT || 100),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      message: 'Terlalu banyak request, coba lagi sebentar lagi',
      code: 'RATE_LIMITED'
    })
});

module.exports = { globalLimiter };
