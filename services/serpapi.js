const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 3600 });

// ===== البحث في Google Hotels =====
async function searchGoogleHotels(query, checkIn, checkOut) {
    const cacheKey = `serp_${query}_${checkIn}_${checkOut}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    if (!process.env.SERPAPI_KEY) {
        throw new Error('مفتاح SerpAPI مش موجود');
    }

    try {
        const response = await axios.get('https://serpapi.com/search.json', {
            params: {
                engine: 'google_hotels',
                q: `hotels in ${query} egypt`,
                check_in_date: checkIn,
                check_out_date: checkOut,
                currency: 'EGP',
                gl: 'eg',
                hl: 'ar',
                adults: 1,
                api_key: process.env.SERPAPI_KEY
            },
            timeout: 20000
        });

        const properties = response.data.properties || [];

        const hotels = properties.map((hotel, index) => ({
            id: `google_${index}`,
            name: hotel.name,
            city: query,
            stars: hotel.hotel_class || 0,
            rating: hotel.overall_rating || 0,
            reviewCount: hotel.reviews || 0,
            image: hotel.images?.[0]?.thumbnail || '',
            images: hotel.images?.map(img => img.original_image) || [],
            price: hotel.rate_per_night?.extracted_lowest || 0,
            originalPrice: hotel.rate_per_night?.extracted_before_taxes_fees || null,
            currency: 'EGP',
            source: 'Google Hotels',
            amenities: hotel.amenities || [],
            nearby: hotel.nearby_places || [],
            checkIn: hotel.check_in_time || '',
            checkOut: hotel.check_out_time || '',
            description: hotel.description || '',
            link: hotel.link || '',
            prices: (hotel.prices || []).map(p => ({
                source: p.source,
                price: p.rate_per_night?.extracted_lowest || 0,
                link: p.link || ''
            }))
        }));

        cache.set(cacheKey, hotels);
        return hotels;

    } catch (error) {
        console.error('❌ SerpAPI Error:', error.message);
        throw error;
    }
}

module.exports = { searchGoogleHotels };