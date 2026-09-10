'use strict';

const { z } = require('zod');

/** Kode permohonan sekaligus jadi nama folder, jadi bentuknya dikunci ketat. */
const kodePermohonan = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
  z.string().regex(/^PRM-\d{4}-\d{6}$/, 'Kode permohonan harus berformat PRM-YYYY-NNNNNN')
);

const idAngka = z.coerce.number().int().positive();

const uuidParam = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'ID dokumen harus berformat UUID'
  );

// Datang dari multipart, jadi semua nilainya string — karena itu `coerce`.
const unggahSchema = z.object({
  kode_permohonan: kodePermohonan,
  persyaratan_id: idAngka
});

const daftarQuerySchema = z.object({
  kode_permohonan: kodePermohonan
});

const presignedSchema = z.object({
  // Masa berlaku pendek; 5 menit sesuai petunjuk, maksimal 1 jam.
  berlaku_detik: z.coerce
    .number()
    .int()
    .min(30, 'Minimal 30 detik')
    .max(3600, 'Maksimal 1 jam')
    .optional()
    .default(300)
});

const tokenParam = z.string().regex(/^[A-Za-z0-9_-]{20,200}$/, 'Token tidak valid');

module.exports = {
  unggahSchema,
  daftarQuerySchema,
  presignedSchema,
  uuidParam,
  tokenParam
};
