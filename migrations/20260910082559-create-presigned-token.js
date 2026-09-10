'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('presigned_token', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT
      },
      dokumen_id: {
        allowNull: false,
        type: Sequelize.UUID,
        references: { model: 'dokumen', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      // SHA-256 dari token; token mentahnya tidak pernah disimpan.
      token_hash: {
        allowNull: false,
        unique: true,
        type: Sequelize.CHAR(64)
      },
      // Token terikat ke satu user saja.
      user_id: {
        allowNull: false,
        type: Sequelize.BIGINT
      },
      expires_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      used_at: {
        allowNull: true,
        type: Sequelize.DATE
      },
      created_at: {
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
        type: Sequelize.DATE
      }
    });

    // Dipakai saat membersihkan token yang sudah lewat masanya.
    await queryInterface.addIndex('presigned_token', ['expires_at'], {
      name: 'idx_pt_expiry'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('presigned_token');
  }
};
