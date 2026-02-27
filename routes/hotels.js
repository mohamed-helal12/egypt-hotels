const express = require('express');
const router = express.Router();
const amadeusService = require('../services/amadeus');
const { validateDates, mergeResults, getMockData } = require('../utils/helpers');

let rapidApiService, serpApiService;

try {
    rapidApiService = require('../services/rapidapi');
} catch (e) {
    console.log('⚠️ RapidAPI service not available');
}

try {
    serpApiService = require('../services/serpapi');
} catch (e) {
    console.log('⚠️ SerpAPI service not available');
}

// ===== GET /api/hotels/cities - المدن المتاحة =====
router.get('/cities', (req, res) => {
    try {
        const cities = amadeusService.getCities();
        res.json({
            success: true,
            data: cities
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== GET /api/hotels/search - البحث عن فنادق =====
router.get('/search', async (req, res) => {
    try {
        const {
            city = 'cairo',
            checkIn,
            checkOut,
            adults = 1,
            stars,
            minPrice,
            maxPrice,
            sort = 'best'
        } = req.query;

        // تحقق من التواريخ
        if (checkIn && checkOut) {
            const dateValidation = validateDates(checkIn, checkOut);
            if (!dateValidation.valid) {
                return res.status(400).json({
                    success: false,
                    error: dateValidation.error
                });
            }
        }

        // تحديد تواريخ افتراضية لو مش موجودة
        const today = new Date();
        const defaultCheckIn = checkIn || new Date(today.setDate(today.getDate() + 1)).toISOString().split('T')[0];
        const defaultCheckOut = checkOut || new Date(today.setDate(today.getDate() + 6)).toISOString().split('T')[0];

        console.log(`\n🔍 بحث: ${city} | ${defaultCheckIn} → ${defaultCheckOut}`);

        // ===== جمع البيانات من كل المصادر =====
        const results = { amadeus: null, booking: null, google: null };
        const errors = [];

        // 1. Amadeus
        try {
            results.amadeus = await amadeusService.searchHotels(
                city, defaultCheckIn, defaultCheckOut, adults
            );
            console.log(`✅ Amadeus: ${results.amadeus?.length || 0} نتيجة`);
        } catch (e) {
            errors.push({ source: 'Amadeus', error: e.message });
            console.log(`⚠️ Amadeus فشل: ${e.message}`);
        }

        // 2. RapidAPI (Booking.com)
        if (rapidApiService && process.env.RAPIDAPI_KEY) {
            try {
                results.booking = await rapidApiService.searchHotels(
                    city, defaultCheckIn, defaultCheckOut, adults
                );
                console.log(`✅ Booking: ${results.booking?.length || 0} نتيجة`);
            } catch (e) {
                errors.push({ source: 'Booking.com', error: e.message });
                console.log(`⚠️ Booking فشل: ${e.message}`);
            }
        }

        // 3. Google Hotels (SerpAPI)
        if (serpApiService && process.env.SERPAPI_KEY) {
            try {
                const cityNames = { cairo: 'Cairo', hurghada: 'Hurghada', sharm: 'Sharm El Sheikh', alex: 'Alexandria', luxor: 'Luxor', aswan: 'Aswan' };
                results.google = await serpApiService.searchGoogleHotels(
                    cityNames[city] || 'Cairo',
                    defaultCheckIn,
                    defaultCheckOut
                );
                console.log(`✅ Google: ${results.google?.length || 0} نتيجة`);
            } catch (e) {
                errors.push({ source: 'Google Hotels', error: e.message });
            }
        }

        // ===== دمج النتائج أو استخدام بيانات تجريبية =====
        let hotels;
        const hasRealData = results.amadeus || results.booking || results.google;

        if (hasRealData) {
            hotels = mergeResults(results.amadeus, results.booking, results.google);
        } else {
            console.log('📦 استخدام بيانات تجريبية');
            hotels = getMockData(city);
        }

        // ===== فلاتر =====
        if (stars && stars !== 'all') {
            hotels = hotels.filter(h => h.stars === parseInt(stars));
        }

        if (minPrice) {
            hotels = hotels.filter(h => h.bestPrice >= parseFloat(minPrice));
        }

        if (maxPrice) {
            hotels = hotels.filter(h => h.bestPrice <= parseFloat(maxPrice));
        }

        // ===== ترتيب =====
        switch (sort) {
            case 'price-low':
                hotels.sort((a, b) => a.bestPrice - b.bestPrice);
                break;
            case 'price-high':
                hotels.sort((a, b) => b.bestPrice - a.bestPrice);
                break;
            case 'rating':
                hotels.sort((a, b) => b.rating - a.rating);
                break;
            case 'stars':
                hotels.sort((a, b) => b.stars - a.stars);
                break;
            default:
                hotels.sort((a, b) => (b.rating * 10 + (b.discount || 0)) - (a.rating * 10 + (a.discount || 0)));
        }

        // ===== Response =====
        res.json({
            success: true,
            data: {
                hotels,
                meta: {
                    total: hotels.length,
                    city,
                    checkIn: defaultCheckIn,
                    checkOut: defaultCheckOut,
                    sources: {
                        amadeus: !!results.amadeus,
                        booking: !!results.booking,
                        google: !!results.google,
                        mock: !hasRealData
                    },
                    errors: errors.length > 0 ? errors : undefined
                }
            }
        });

    } catch (error) {
        console.error('❌ Search Error:', error);
        res.status(500).json({
            success: false,
            error: 'حصل مشكلة في البحث',
            fallback: getMockData(req.query.city || 'cairo')
        });
    }
});

// ===== GET /api/hotels/:id - تفاصيل فندق =====
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { checkIn, checkOut } = req.query;

        let details = null;

        // محاولة Amadeus
        try {
            details = await amadeusService.getHotelDetails(id, checkIn, checkOut);
        } catch (e) {
            console.log('Amadeus details failed, trying RapidAPI...');
        }

        // محاولة RapidAPI
        if (!details && rapidApiService) {
            try {
                details = await rapidApiService.getHotelDetails(id);
            } catch (e) {
                console.log('RapidAPI details also failed');
            }
        }

        if (!details) {
            return res.status(404).json({
                success: false,
                error: 'الفندق مش موجود'
            });
        }

        res.json({ success: true, data: details });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== GET /api/hotels/:id/reviews - مراجعات =====
router.get('/:id/reviews', async (req, res) => {
    try {
        if (!rapidApiService) {
            return res.json({ success: true, data: [] });
        }

        const reviews = await rapidApiService.getHotelReviews(req.params.id);
        res.json({ success: true, data: reviews });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;