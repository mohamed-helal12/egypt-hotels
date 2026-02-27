// ===== تحقق من التواريخ =====
function validateDates(checkIn, checkOut) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);

    if (isNaN(inDate.getTime()) || isNaN(outDate.getTime())) {
        return { valid: false, error: 'التاريخ مش صحيح' };
    }

    if (inDate < today) {
        return { valid: false, error: 'تاريخ الدخول لازم يكون من بكرة' };
    }

    if (outDate <= inDate) {
        return { valid: false, error: 'تاريخ الخروج لازم يكون بعد الدخول' };
    }

    const diffDays = Math.ceil((outDate - inDate) / (1000 * 60 * 60 * 24));
    if (diffDays > 30) {
        return { valid: false, error: 'أقصى مدة حجز 30 يوم' };
    }

    return { valid: true, nights: diffDays };
}

// ===== تنسيق السعر =====
function formatPrice(price, currency = 'EGP') {
    return new Intl.NumberFormat('ar-EG', {
        style: 'currency',
        currency: currency,
        maximumFractionDigits: 0
    }).format(price);
}

// ===== دمج النتائج من مصادر متعددة =====
function mergeResults(amadeusResults, bookingResults, googleResults) {
    const merged = new Map();

    // دالة لتنظيف اسم الفندق للمقارنة
    const normalize = (name) => {
        return name.toLowerCase()
            .replace(/hotel|resort|&|the|le|la/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // إضافة نتائج Amadeus
    (amadeusResults || []).forEach(hotel => {
        const key = normalize(hotel.name);
        if (!merged.has(key)) {
            merged.set(key, {
                name: hotel.name,
                city: hotel.city,
                cityName: hotel.cityName,
                stars: hotel.stars,
                rating: hotel.rating,
                prices: [],
                features: [],
                images: []
            });
        }
        const entry = merged.get(key);
        if (hotel.bestPrice) {
            entry.prices.push({
                source: 'Amadeus',
                price: hotel.bestPrice,
                currency: 'EGP'
            });
        }
    });

    // إضافة نتائج Booking
    (bookingResults || []).forEach(hotel => {
        const key = normalize(hotel.name || hotel.nameAr);
        if (!merged.has(key)) {
            merged.set(key, {
                name: hotel.nameAr || hotel.name,
                city: hotel.city,
                stars: hotel.stars,
                rating: hotel.rating,
                prices: [],
                features: [],
                images: [hotel.image]
            });
        }
        const entry = merged.get(key);
        if (hotel.price) {
            entry.prices.push({
                source: 'Booking.com',
                price: hotel.price,
                originalPrice: hotel.originalPrice,
                currency: hotel.currency,
                url: hotel.url
            });
        }
        if (hotel.image) entry.images.push(hotel.image);
        entry.rating = Math.max(entry.rating || 0, hotel.rating || 0);
    });

    // إضافة نتائج Google
    (googleResults || []).forEach(hotel => {
        const key = normalize(hotel.name);
        if (!merged.has(key)) {
            merged.set(key, {
                name: hotel.name,
                city: hotel.city,
                stars: hotel.stars,
                rating: hotel.rating,
                prices: [],
                features: hotel.amenities || [],
                images: hotel.images || []
            });
        }
        const entry = merged.get(key);

        // أسعار من مصادر متعددة
        (hotel.prices || []).forEach(p => {
            if (p.price > 0) {
                entry.prices.push({
                    source: p.source,
                    price: p.price,
                    currency: 'EGP',
                    url: p.link
                });
            }
        });

        if (hotel.amenities) entry.features = [...new Set([...entry.features, ...hotel.amenities])];
    });

    // تحويل لمصفوفة وحساب أفضل سعر
    return Array.from(merged.values()).map((hotel, index) => ({
        id: index + 1,
        ...hotel,
        bestPrice: hotel.prices.length > 0
            ? Math.min(...hotel.prices.map(p => p.price))
            : null,
        bestSource: hotel.prices.length > 0
            ? hotel.prices.reduce((a, b) => a.price < b.price ? a : b)
            : null,
        priceCount: hotel.prices.length,
        image: hotel.images[0] || null
    })).filter(h => h.bestPrice && h.bestPrice > 0)
       .sort((a, b) => a.bestPrice - b.bestPrice);
}

// ===== بيانات تجريبية (لو APIs مش شغالة) =====
function getMockData(cityKey) {
    const cities = {
        cairo: 'القاهرة',
        hurghada: 'الغردقة',
        sharm: 'شرم الشيخ',
        alex: 'الإسكندرية',
        luxor: 'الأقصر',
        aswan: 'أسوان'
    };

    const cityName = cities[cityKey] || 'القاهرة';

    const mockHotels = [
        {
            names: { cairo: 'ماريوت القاهرة', hurghada: 'شتيجنبرجر الغردقة', sharm: 'هيلتون شرم الشيخ', alex: 'فور سيزونز الإسكندرية', luxor: 'سوفيتيل الأقصر', aswan: 'كتاراكت أسوان' },
            stars: 5, rating: 9.2,
            priceBase: { cairo: 4200, hurghada: 2500, sharm: 2900, alex: 5200, luxor: 3600, aswan: 4700 }
        },
        {
            names: { cairo: 'كمبنسكي النيل', hurghada: 'صني دايز الغردقة', sharm: 'ريكسوس شرم', alex: 'هيلتون الإسكندرية', luxor: 'هيلتون الأقصر', aswan: 'موفنبيك أسوان' },
            stars: 5, rating: 8.8,
            priceBase: { cairo: 5900, hurghada: 1800, sharm: 3500, alex: 3800, luxor: 2800, aswan: 3200 }
        },
        {
            names: { cairo: 'سميراميس إنتركونتيننتال', hurghada: 'جاز أكوامارين', sharm: 'نعمة بلو', alex: 'شيراتون المنتزه', luxor: 'جولي فيل الأقصر', aswan: 'بسمة أسوان' },
            stars: 4, rating: 8.4,
            priceBase: { cairo: 3200, hurghada: 1500, sharm: 1900, alex: 2800, luxor: 2200, aswan: 1800 }
        },
        {
            names: { cairo: 'فيرمونت نايل سيتي', hurghada: 'ديزرت روز', sharm: 'بارون ريزورت', alex: 'تولب الإسكندرية', luxor: 'بافيليون وينتر', aswan: 'إيزيس أسوان' },
            stars: 5, rating: 9.0,
            priceBase: { cairo: 6500, hurghada: 2200, sharm: 2600, alex: 2400, luxor: 4000, aswan: 2500 }
        },
        {
            names: { cairo: 'رمسيس هيلتون', hurghada: 'بيلا فيستا', sharm: 'كورال سي', alex: 'رومانس الإسكندرية', luxor: 'شتيجنبرجر الأقصر', aswan: 'هيلتون أسوان' },
            stars: 4, rating: 7.9,
            priceBase: { cairo: 1600, hurghada: 1200, sharm: 1400, alex: 1500, luxor: 1800, aswan: 1600 }
        }
    ];

    return mockHotels.map((hotel, i) => {
        const basePrice = hotel.priceBase[cityKey] || 2000;
        return {
            id: i + 1,
            name: hotel.names[cityKey] || `فندق ${cityName} ${i + 1}`,
            city: cityKey,
            cityName: cityName,
            stars: hotel.stars,
            rating: hotel.rating,
            image: `https://picsum.photos/seed/hotel${cityKey}${i}/600/400`,
            prices: [
                { source: 'Booking.com', price: basePrice, originalPrice: Math.round(basePrice * 1.3), color: '#003580' },
                { source: 'Expedia', price: Math.round(basePrice * 1.08), originalPrice: Math.round(basePrice * 1.35), color: '#00355f' },
                { source: 'Hotels.com', price: Math.round(basePrice * 0.95), originalPrice: Math.round(basePrice * 1.25), color: '#d32f2f' },
                { source: 'Agoda', price: Math.round(basePrice * 1.03), originalPrice: Math.round(basePrice * 1.28), color: '#5392f9' }
            ],
            bestPrice: Math.round(basePrice * 0.95),
            bestSource: { source: 'Hotels.com', price: Math.round(basePrice * 0.95) },
            features: ['واي فاي', 'مسبح', 'مطعم', 'سبا'],
            discount: Math.floor(Math.random() * 30 + 10)
        };
    });
}

module.exports = {
    validateDates,
    formatPrice,
    mergeResults,
    getMockData
};