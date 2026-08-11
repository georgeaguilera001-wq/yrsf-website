// Simulate frontend JS state
let __pricingTiers = [
    { duration_hours: 4, price: 500, price_mon: 500 },
    { duration_hours: 8, price: 900, price_mon: 900 }
];

// Simulate user edit
const index = 0;
const field = 'price_mon';
const val = 98765;

__pricingTiers[index][field] = val;
if (field.startsWith('price_')) {
    __pricingTiers[index]['price'] = val;
}

// Simulate save mapping
const tiersToSave = (__pricingTiers || []).map((t, idx) => ({
    ...t,
    sort_order: idx
}));

// Simulate updateBoatPrices mapping
const rows = tiersToSave.map((p, i) => {
    const durationHrs = parseInt(p.duration_hours) || 4;
    let rate = parseFloat(p.price);
    if (isNaN(rate) || rate <= 0) {
        rate = parseFloat(p.price_mon || p.price_thu || p.price_fri || p.price_sat || p.price_sun) || 0;
    }
    return {
        boat_id: '123',
        duration_hours: durationHrs,
        duration_label: p.duration_label || ` Hours`,
        price: rate,
        is_popular: Boolean(p.is_popular),
        sort_order: i
    };
});

console.log(JSON.stringify(rows, null, 2));
