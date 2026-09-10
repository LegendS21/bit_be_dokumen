'use strict';
const { Model } = require('sequelize');

/** Status pindai virus. Sama persis dengan tipe enum di PostgreSQL. */
const SCAN_STATUS = ['PENDING', 'CLEAN', 'INFECTED', 'ERROR'];

module.exports = (sequelize, DataTypes) => {
  class dokumen extends Model {
    static associate(models) {
      dokumen.hasMany(models.dokumen_akses_log, {
        foreignKey: 'dokumen_id',
        as: 'akses_log'
      });
      dokumen.hasMany(models.presigned_token, {
        foreignKey: 'dokumen_id',
        as: 'token'
      });
    }
  }

  dokumen.init({
    // UUID dibuat database (gen_random_uuid), bukan aplikasi — id ini yang
    // disimpan service Transaksi sebagai `dokumen_uuid`.
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    // Logical reference ke db_transaksi.permohonan.kode_permohonan.
    kode_permohonan: {
      type: DataTypes.STRING(30),
      allowNull: false
    },
    // Logical reference ke db_rbac.users.id.
    owner_user_id: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    // Logical reference ke db_master.persyaratan.id.
    persyaratan_id: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    nama_file_asli: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    // Nama di disk: sudah di-rename jadi UUID, jadi nama asli dari user tidak
    // pernah menyentuh filesystem (cegah path traversal & tabrakan nama).
    nama_file_simpan: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    storage_path: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    // Hasil deteksi magic bytes, BUKAN yang diklaim client.
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    // Klaim client disimpan terpisah untuk audit kalau ada usaha pemalsuan.
    mime_klaim_client: DataTypes.STRING(100),
    ukuran_byte: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    checksum_sha256: {
      type: DataTypes.CHAR(64),
      allowNull: false
    },
    magic_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    scan_status: {
      type: DataTypes.ENUM(...SCAN_STATUS),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    scan_engine: DataTypes.STRING(50),
    scanned_at: DataTypes.DATE,
    uploaded_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'dokumen',
    tableName: 'dokumen',
    underscored: true,
    // Tabel ini tidak punya created_at/updated_at — waktunya `uploaded_at`.
    timestamps: true,
    createdAt: false,
    updatedAt: false,
    // Soft delete: berkas yang dilepas peserta tetap bisa ditelusuri saat audit.
    paranoid: true,
    deletedAt: 'deleted_at'
  });

  dokumen.SCAN_STATUS = SCAN_STATUS;
  return dokumen;
};
