'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class presigned_token extends Model {
    static associate(models) {
      presigned_token.belongsTo(models.dokumen, {
        foreignKey: 'dokumen_id',
        as: 'dokumen'
      });
    }
  }

  presigned_token.init({
    dokumen_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    // SHA-256 dari token — token mentahnya hanya pernah ada di URL yang
    // dikirim ke pemintanya, tidak pernah tersimpan. Sama seperti perlakuan
    // refresh token di service RBAC.
    token_hash: {
      type: DataTypes.CHAR(64),
      allowNull: false,
      unique: true
    },
    // Token terikat ke satu user; URL yang bocor tetap tidak berguna
    // bagi orang lain.
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    used_at: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'presigned_token',
    tableName: 'presigned_token',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  return presigned_token;
};
