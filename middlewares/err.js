'use strict';

const { ZodError } = require('zod');

/**
 * Satu-satunya tempat error diubah jadi response HTTP.
 * Detail error internal tidak pernah dikirim ke client — pesan asli SQL/stack
 * bisa membocorkan struktur database.
 */
const handleError = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err.name === 'AppError') {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Data yang dikirim tidak valid',
      code: 'VALIDATION_ERROR',
      errors: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    });
  }

  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      message: 'Data yang dikirim tidak valid',
      code: 'VALIDATION_ERROR',
      errors: err.errors.map((e) => ({ field: e.path, message: e.message }))
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      message: 'Data sudah terdaftar',
      code: 'DUPLICATE',
      errors: err.errors.map((e) => ({ field: e.path, message: `${e.path} sudah digunakan` }))
    });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({ message: 'Relasi data tidak valid', code: 'FK_CONSTRAINT' });
  }

  if (err.name === 'SequelizeConnectionError' || err.name === 'SequelizeConnectionRefusedError') {
    console.error(err);
    return res.status(503).json({ message: 'Layanan sedang tidak tersedia', code: 'DB_UNAVAILABLE' });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Body request bukan JSON yang valid', code: 'INVALID_JSON' });
  }

  console.error(err);
  res.status(500).json({ message: 'Internal Server Error', code: 'INTERNAL_ERROR' });
};

module.exports = handleError;
