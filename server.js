require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const hotelRoutes = require('./routes/hotels');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Middleware =====
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== Rate Limiting (بسيط) =====
const requestCounts = new Map();
app.use((req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const windowMs = 60 * 1000; // دقيقة
    const maxRequests = 30;

    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
    }

    const requests = requestCounts.get(ip).filter(time => now - time < windowMs);
    requests.push(now);
    requestCounts.set(ip, requests);

    if (requests.length > maxRequests) {
        return res.status(429).json({
            error: 'طلبات كثيرة! استنى شوية وجرب تاني'
        });
    }

    next();
});

// ===== Routes =====
app.use('/api/hotels', hotelRoutes);

// ===== الصفحة الرئيسية =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== Error Handler =====
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(err.status || 500).json({
        error: 'حصل مشكلة في السيرفر',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ===== Start Server =====
app.listen(PORT, () => {
    console.log(`
    🏨 ========================================
    🚀 السيرفر شغال على http://localhost:${PORT}
    📡 API متاح على http://localhost:${PORT}/api/hotels
    🌍 البيئة: ${process.env.NODE_ENV}
    ========================================
    `);
});