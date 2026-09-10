require("dotenv").config();

const express = require("express");
const cors = require("cors");

const router = require("./routes/index.js");
const handleError = require("./middlewares/err.js");
const { globalLimiter } = require("./middlewares/rateLimit.js");
const { CLAMAV_AKTIF } = require("./helpers/pemindai.js");
const { AKAR } = require("./helpers/penyimpanan.js");
const { sequelize } = require("./models");

const app = express();
const port = process.env.PORT || 3004;

// Service ini berjalan di belakang API Gateway. Nilai 1 = percaya satu hop
// proxy saja, supaya IP yang dicatat di dokumen_akses_log adalah IP asli dan
// tidak bisa dipalsukan lewat header X-Forwarded-For dari luar.
app.set("trust proxy", Number(process.env.TRUST_PROXY || 1));
app.disable("x-powered-by");

const originDiizinkan = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

const modeDev = process.env.NODE_ENV !== "production";
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(cors({
    origin(origin, callback) {
        if (!origin || originDiizinkan.includes(origin)) return callback(null, true);
        if (modeDev && LOCALHOST.test(origin)) return callback(null, true);
        callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// Berkas unggahan ditangani multer, bukan body parser ini — batasnya kecil
// karena yang lewat sini cuma JSON biasa.
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));
app.use(globalLimiter);

app.use(router);
app.use(handleError);

async function mulai() {
    try {
        await sequelize.authenticate();
        console.log("🗄️  Koneksi database OK");
    } catch (error) {
        console.error("❌ Gagal terhubung ke database:", error.message);
        process.exit(1);
    }

    if (!CLAMAV_AKTIF) {
        console.warn(
            "⚠️  ClamAV NONAKTIF (CLAMAV_ENABLED != true). Berkas tidak dipindai dan\n" +
            "    disimpan berstatus PENDING. JANGAN dipakai di produksi."
        );
    }

    app.listen(port, () => {
        console.log(`🚀 Server running at http://localhost:${port}`);
        console.log(`📋 Health check: http://localhost:${port}/health`);
        console.log(`📁 Storage     : ${AKAR}`);
    });
}

mulai();

module.exports = app;
