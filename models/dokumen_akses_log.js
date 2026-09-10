'use strict';
const { Model } = require('sequelize');

/** Setiap sentuhan terhadap berkas dicatat — syarat audit di petunjuk. */
const AKSI = ['UPLOAD', 'VIEW', 'DOWNLOAD', 'DELETE', 'PRESIGN'];

module.exports = (sequelize, DataTypes) => {
  class dokumen_akses_log extends Model {
    static associate(models) {
      dokumen_akses_log.belongsTo(models.dokumen, {
        foreignKey: 'dokumen_id',
        as: 'dokumen'
      });
    }
  }

  dokumen_akses_log.init({
    dokumen_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    user_role: DataTypes.STRING(50),
    aksi: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    // Tipe INET milik PostgreSQL: menolak nilai yang bukan alamat IP.
    ip_address: DataTypes.INET,
    user_agent: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'dokumen_akses_log',
    tableName: 'dokumen_akses_log',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    // Log tidak pernah diubah, jadi tidak perlu updated_at.
    updatedAt: false
  });

  dokumen_akses_log.AKSI = AKSI;
  return dokumen_akses_log;
};
