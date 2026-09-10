'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Jejak audit: siapa menyentuh berkas apa, kapan, dari mana.
    await queryInterface.createTable('dokumen_akses_log', {
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
      user_id: {
        allowNull: false,
        type: Sequelize.BIGINT
      },
      user_role: {
        allowNull: true,
        type: Sequelize.STRING(50)
      },
      // VIEW, DOWNLOAD, UPLOAD, DELETE, PRESIGN
      aksi: {
        allowNull: false,
        type: Sequelize.STRING(20)
      },
      ip_address: {
        allowNull: true,
        type: Sequelize.INET
      },
      user_agent: {
        allowNull: true,
        type: Sequelize.TEXT
      },
      created_at: {
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('dokumen_akses_log', [
      'dokumen_id',
      { name: 'created_at', order: 'DESC' }
    ], { name: 'idx_log_dok' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('dokumen_akses_log');
  }
};
