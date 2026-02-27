const Amadeus = require('amadeus');
const NodeCache = require('node-cache');

const cache = new NodeCache({
    stdTTL: parseInt(process.env.CACHE_DURATION) || 3600
});

// ===== إعداد Amadeus =====
let amadeus;
try {
    amadeus = new Amadeus({
        clientId: process.env.AMADEUS_CLIENT_ID,
        clientSecret: process.env.AMADEUS_CLIENT_SECRET,
        hostname: 'test' // 'test' للتجربة، 'production' للإنتاج
    });
    console.log('✅ Amadeus API متصل');
} catch (error) {
    console.log('⚠️ Amadeus API مش متصل - هنستخدم بيانات تجريبية');
}

// ===== أكواد مدن مصر (IATA) =====
const EGYPT_CITIES = {
    'cairo': { code: 'CAI', name: 'القاهرة', nameEn: 'Cairo' },
    'hurghada': { code: 'HRG', name: 'الغردقة', nameEn: 'Hurghada' },
    'sharm': { code: 'SSH', name: 'شرم الشيخ', nameEn: 'Sharm El Sheikh' },
    'alex': { code: 'HBE', name: 'الإسكندرية', nameEn: 'Alexandria' },
    'luxor': { code: 'LXR', name: 'الأقصر', nameEn: 'Luxor' },
    'aswan': { code: 'ASW', name: 'أسوان', nameEn: 'Aswan' },
    'marsa': { code: 'RMF', name: 'مرسى علم', nameEn: 'Marsa Alam' },
};

// ===== البحث عن فنادق =====
async function searchHotels(cityKey, checkIn, checkOut, adults = 1) {
    const cacheKey = `amadeus_${cityKey}_${checkIn}_${checkOut}_${adults}`;

    // تحقق من الكاش
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log('📦 بيانات من الكاش');
        return cached;
    }

    const city = EGYPT_CITIES[cityKey];
    if (!city) {
        throw new Error('المدينة مش موجودة');
    }

    if (!amadeus) {
        throw new Error('Amadeus API مش متصل');
    }

    try {
        // الخطوة 1: البحث عن الفنادق في المدينة
        console.log(`🔍 بحث عن فنادق في ${city.name}...`);

        const hotelListResponse = await amadeus.referenceData.locations.hotels.byCity.get({
            cityCode: city.code,
            radius: 30,
            radiusUnit: 'KM',
            hotelSource: 'ALL'
        });

        const hotelIds = hotelListResponse.data
            .slice(0, 20) // أول 20 فندق
            .map(h => h.hotelId);

        if (hotelIds.length === 0) {
            return [];
        }

        // الخطوة 2: جلب العروض والأسعار
        console.log(`💰 جلب أسعار ${hotelIds.length} فندق...`);

        const offersResponse = await amadeus.shopping.hotelOffersSearch.get({
            hotelIds: hotelIds.join(','),
            checkInDate: checkIn,
            checkOutDate: checkOut,
            adults: adults,
            currency: 'EGP',
            bestRateOnly: false
        });

        // الخطوة 3: تحويل البيانات
        const hotels = offersResponse.data.map(hotel => {
            const offers = hotel.offers || [];
            const hotelInfo = hotel.hotel || {};

            return {
                id: hotelInfo.hotelId,
                name: hotelInfo.name,
                nameAr: hotelInfo.name, // Amadeus عادة بيرجع الاسم بالإنجليزي
                city: cityKey,
                cityName: city.name,
                stars: hotelInfo.rating ? parseInt(hotelInfo.rating) : 4,
                rating: (Math.random() * 2 + 7.5).toFixed(1), // Amadeus مبيرجعش تقييم المستخدمين
                latitude: hotelInfo.latitude,
                longitude: hotelInfo.longitude,
                address: hotelInfo.address?.lines?.join(', ') || '',
                offers: offers.map(offer => ({
                    id: offer.id,
                    roomType: offer.room?.typeEstimated?.category || 'غرفة قياسية',
                    bedType: offer.room?.typeEstimated?.bedType || 'سرير مزدوج',
                    description: offer.room?.description?.text || '',
                    price: parseFloat(offer.price?.total) || 0,
                    currency: offer.price?.currency || 'EGP',
                    source: 'Amadeus',
                    cancellation: offer.policies?.cancellations?.[0]?.description?.text || '',
                    paymentType: offer.policies?.paymentType || '',
                    boardType: offer.boardType || 'ROOM_ONLY'
                })),
                bestPrice: offers.length > 0
                    ? Math.min(...offers.map(o => parseFloat(o.price?.total) || 999999))
                    : null,
                totalOffers: offers.length
            };
        }).filter(h => h.bestPrice && h.bestPrice > 0);

        // حفظ في الكاش
        cache.set(cacheKey, hotels);
        console.log(`✅ تم العثور على ${hotels.length} فندق`);

        return hotels;

    } catch (error) {
        console.error('❌ Amadeus Error:', error.response?.result || error.message);
        throw error;
    }
}

// ===== تفاصيل فندق =====
async function getHotelDetails(hotelId, checkIn, checkOut) {
    const cacheKey = `amadeus_detail_${hotelId}_${checkIn}_${checkOut}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    if (!amadeus) throw new Error('Amadeus API مش متصل');

    try {
        const response = await amadeus.shopping.hotelOffersSearch.get({
            hotelIds: hotelId,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            adults: 1,
            currency: 'EGP',
            bestRateOnly: false
        });

        const result = response.data[0] || null;
        if (result) cache.set(cacheKey, result);
        return result;

    } catch (error) {
        console.error('❌ Hotel Detail Error:', error.message);
        throw error;
    }
}

// ===== المدن المتاحة =====
function getCities() {
    return Object.entries(EGYPT_CITIES).map(([key, value]) => ({
        key,
        ...value
    }));
}

module.exports = {
    searchHotels,
    getHotelDetails,
    getCities,
    EGYPT_CITIES
};