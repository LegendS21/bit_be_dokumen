'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('dokumen', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        // gen_random_uuid() bawaan PostgreSQL 13+, tidak perlu ekstensi.
        defaultValue: Sequelize.literal('gen_random_uuid()')
      },
      // Logical reference ke db_transaksi.permohonan.kode_permohonan.
      kode_permohonan: {
        allowNull: false,
        type: Sequelize.STRING(30)
      },
      // Logical reference ke db_rbac.users.id.
      owner_user_id: {
        allowNull: false,
        type: Sequelize.BIGINT
      },
      // Logical reference ke db_master.persyaratan.id.
      persyaratan_id: {
        allowNull: false,
        type: Sequelize.BIGINT
      },
      nama_file_asli: {
        allowNull: false,
        type: Sequelize.STRING(255)
      },
      // Sudah di-rename jadi UUID — nama dari user tidak pernah dipakai di disk.
      nama_file_simpan: {
        allowNull: false,
        type: Sequelize.STRING(255)
      },
      storage_path: {
        allowNull: false,
        type: Sequelize.TEXT
      },
      // Hasil deteksi magic bytes, BUKAN dari client.
      mime_type: {
        allowNull: false,
        type: Sequelize.STRING(100)
      },
      // Untuk audit kalau ada usaha pemalsuan.
      mime_klaim_client: {
        allowNull: true,
        type: Sequelize.STRING(100)
      },
      ukuran_byte: {
        allowNull: false,
        type: Sequelize.BIGINT
      },
      checksum_sha256: {
        allowNull: false,
        type: Sequelize.CHAR(64)
      },
      magic_verified: {
        allowNull: false,
        defaultValue: false,
        type: Sequelize.BOOLEAN
      },
      scan_status: {
        allowNull: false,
        defaultValue: 'PENDING',
        type: Sequelize.ENUM('PENDING', 'CLEAN', 'INFECTED', 'ERROR')
      },
      scan_engine: {
        allowNull: true,
        type: Sequelize.STRING(50)
      },
      scanned_at: {
        allowNull: true,
        type: Sequelize.DATE
      },
      uploaded_at: {
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
        type: Sequelize.DATE
      },
      deleted_at: {
        allowNull: true,
        type: Sequelize.DATE
      }
    });

    // Partial index: baris yang sudah dihapus tidak ikut membebani pencarian.
    await queryInterface.addIndex('dokumen', ['kode_permohonan'], {
      name: 'idx_dok_permohonan',
      where: { deleted_at: null }
    });

    await queryInterface.addIndex('dokumen', ['owner_user_id'], {
      name: 'idx_dok_owner'
    });

    // Cegah berkas identik diunggah berulang untuk satu permohonan. Dibuat
    // partial supaya pengguna tetap bisa mengunggah ulang berkas yang sama
    // setelah yang lama dihapus.
    await queryInterface.addIndex('dokumen', ['kode_permohonan', 'checksum_sha256'], {
      name: 'uq_dok_checksum',
      unique: true,
      where: { deleted_at: null }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('dokumen');
    // Tipe enum tidak ikut terhapus bersama tabelnya.
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_dokumen_scan_status";');
  }
};
