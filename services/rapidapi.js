const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({
    stdTTL: parseInt(process.env.CACHE_DURATION) || 3600
});

const RAPIDAPI_HOST = 'booking-com.p.rapidapi.com';

// ===== أكواد مدن مصر في Booking =====
const BOOKING_CITY_IDS = {
    'cairo': { dest_id: '-290692', dest_type: 'city' },
    'hurghada': { dest_id: '-290263', dest_type: 'city' },
    'sharm': { dest_id: '-302053', dest_type: 'city' },
    'alex': { dest_id: '-290263', dest_type: 'city' },
    'luxor': { dest_id: '-290982', dest_type: 'city' },
    'aswan': { dest_id: '-286247', dest_type: 'city' },
};

// ===== طلب API =====
async function makeRequest(endpoint, params = {}) {
    if (!process.env.RAPIDAPI_KEY) {
        throw new Error('مفتاح RapidAPI مش موجود');
    }

    try {
        const response = await axios.get(
            `https://${RAPIDAPI_HOST}${endpoint}`,
            {
                params,
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                    'X-RapidAPI-Host': RAPIDAPI_HOST
                },
                timeout: 15000
            }
        );
        return response.data;
    } catch (error) {
        console.error(`❌ RapidAPI Error [${endpoint}]:`, error.message);
        throw error;
    }
}

// ===== البحث عن فنادق =====
async function searchHotels(cityKey, checkIn, checkOut, adults = 1) {
    const cacheKey = `rapid_${cityKey}_${checkIn}_${checkOut}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const cityInfo = BOOKING_CITY_IDS[cityKey];
    if (!cityInfo) throw new Error('المدينة مش متاحة');

    try {
        const data = await makeRequest('/v1/hotels/search', {
            dest_id: cityInfo.dest_id,
            dest_type: cityInfo.dest_type,
            checkin_date: checkIn,
            checkout_date: checkOut,
            adults_number: adults,
            room_number: 1,
            units: 'metric',
            order_by: 'popularity',
            filter_by_currency: 'EGP',
            locale: 'ar',
            page_number: 0,
            include_adjacency: true
        });

        const hotels = (data.result || []).map(hotel => ({
            id: hotel.hotel_id,
            name: hotel.hotel_name,
            nameAr: hotel.hotel_name_trans || hotel.hotel_name,
            city: cityKey,
            stars: hotel.class || 0,
            rating: hotel.review_score || 0,
            ratingText: hotel.review_score_word || '',
            reviewCount: hotel.review_nr || 0,
            image: hotel.max_photo_url || hotel.main_photo_url || '',
            address: hotel.address || '',
            distance: hotel.distance_to_cc || '',
            price: hotel.min_total_price || hotel.composite_price_breakdown?.gross_amount?.value || 0,
            originalPrice: hotel.composite_price_breakdown?.strikethrough_amount?.value || null,
            currency: hotel.currency_code || 'EGP',
            source: 'Booking.com',
            url: hotel.url || '',
            freeCancellation: hotel.is_free_cancellable || false,
            breakfastIncluded: hotel.hotel_include_breakfast || false,
            latitude: hotel.latitude,
            longitude: hotel.longitude
        }));

        cache.set(cacheKey, hotels);
        return hotels;

    } catch (error) {
        throw error;
    }
}

// ===== تفاصيل فندق =====
async function getHotelDetails(hotelId) {
    const cacheKey = `rapid_detail_${hotelId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const data = await makeRequest('/v1/hotels/data', {
            hotel_id: hotelId,
            locale: 'ar'
        });

        cache.set(cacheKey, data);
        return data;

    } catch (error) {
        throw error;
    }
}

// ===== صور الفندق =====
async function getHotelPhotos(hotelId) {
    const cacheKey = `rapid_photos_${hotelId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const data = await makeRequest('/v1/hotels/photos', {
            hotel_id: hotelId,
            locale: 'ar'
        });

        cache.set(cacheKey, data);
        return data;
    } catch (error) {
        throw error;
    }
}

// ===== مراجعات الفندق =====
async function getHotelReviews(hotelId) {
    try {
        const data = await makeRequest('/v1/hotels/reviews', {
            hotel_id: hotelId,
            locale: 'ar',
            sort_type: 'SORT_MOST_RELEVANT',
            language_filter: 'ar,en'
        });
        return data;
    } catch (error) {
        throw error;
    }
}

module.exports = {
    searchHotels,
    getHotelDetails,
    getHotelPhotos,
    getHotelReviews
};