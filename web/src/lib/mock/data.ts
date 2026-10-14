/* Realistic static demo catalogue for Mumbai (mirrors backend seeders, SPEC §10). */
import type {
  Id,
  Banner,
  Blog,
  BlogCategory,
  Brand,
  Category,
  CmsPage,
  Country,
  Coupon,
  Faq,
  Product,
  ProductDetail,
  Review,
  Store,
  Zone,
} from '../types';

export const img = (text: string, w = 600, h = 600, bg = 'E6F4E9', fg = '0E9623') =>
  `https://placehold.co/${w}x${h}/${bg}/${fg}/png?text=${encodeURIComponent(text).replace(/%20/g, '+')}`;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/* ---------------- Geography ---------------- */

export const countries: Country[] = [
  { id: 1, name: 'India', iso2: 'IN', dial_code: '+91', currency_code: 'INR', currency_symbol: '₹', timezone: 'Asia/Kolkata', flag: '🇮🇳', is_default: true },
  { id: 2, name: 'Australia', iso2: 'AU', dial_code: '+61', currency_code: 'AUD', currency_symbol: 'A$', timezone: 'Australia/Sydney', flag: '🇦🇺' },
  { id: 3, name: 'Canada', iso2: 'CA', dial_code: '+1', currency_code: 'CAD', currency_symbol: 'C$', timezone: 'America/Toronto', flag: '🇨🇦' },
  { id: 4, name: 'United Arab Emirates', iso2: 'AE', dial_code: '+971', currency_code: 'AED', currency_symbol: 'AED', timezone: 'Asia/Dubai', flag: '🇦🇪' },
  { id: 5, name: 'United Kingdom', iso2: 'GB', dial_code: '+44', currency_code: 'GBP', currency_symbol: '£', timezone: 'Europe/London', flag: '🇬🇧' },
  { id: 6, name: 'United States', iso2: 'US', dial_code: '+1', currency_code: 'USD', currency_symbol: '$', timezone: 'America/New_York', flag: '🇺🇸' },
];

const box = (lat: number, lng: number, d = 0.25) => [
  { lat: lat + d, lng: lng - d },
  { lat: lat + d, lng: lng + d },
  { lat: lat - d, lng: lng + d },
  { lat: lat - d, lng: lng - d },
];

export const zones: (Zone & { center: { lat: number; lng: number } })[] = [
  { id: 1, country_id: 1, name: 'Mumbai', slug: 'mumbai', city: 'Mumbai', fulfillment_type: 'both', free_delivery_above: 199, min_order: 0, delivery_time_minutes: 8, center: { lat: 19.076, lng: 72.8777 }, polygon: box(19.076, 72.8777) },
  { id: 2, country_id: 3, name: 'Toronto', slug: 'toronto', city: 'Toronto', fulfillment_type: 'both', free_delivery_above: 35, min_order: 0, delivery_time_minutes: 15, center: { lat: 43.6532, lng: -79.3832 }, polygon: box(43.6532, -79.3832) },
  { id: 3, country_id: 2, name: 'Sydney', slug: 'sydney', city: 'Sydney', fulfillment_type: 'both', free_delivery_above: 40, min_order: 0, delivery_time_minutes: 15, center: { lat: -33.8688, lng: 151.2093 }, polygon: box(-33.8688, 151.2093) },
  { id: 4, country_id: 4, name: 'Dubai', slug: 'dubai', city: 'Dubai', fulfillment_type: 'both', free_delivery_above: 60, min_order: 0, delivery_time_minutes: 12, center: { lat: 25.2048, lng: 55.2708 }, polygon: box(25.2048, 55.2708) },
  { id: 5, country_id: 5, name: 'London', slug: 'london', city: 'London', fulfillment_type: 'both', free_delivery_above: 25, min_order: 0, delivery_time_minutes: 15, center: { lat: 51.5072, lng: -0.1276 }, polygon: box(51.5072, -0.1276) },
  { id: 6, country_id: 6, name: 'New York', slug: 'new-york', city: 'New York', fulfillment_type: 'both', free_delivery_above: 35, min_order: 0, delivery_time_minutes: 15, center: { lat: 40.7128, lng: -74.006 }, polygon: box(40.7128, -74.006) },
];

export const stores: (Store & { zone_id: number })[] = [
  { id: 1, zone_id: 1, name: 'Mumbai Store', slug: 'mumbai-store', address: 'Andheri East, Mumbai, Maharashtra 400069', city: 'Mumbai', lat: 19.1136, lng: 72.8697, is_open: true },
  { id: 2, zone_id: 2, name: 'Toronto Store', slug: 'toronto-store', city: 'Toronto', lat: 43.6532, lng: -79.3832, is_open: true },
  { id: 3, zone_id: 3, name: 'Sydney Store', slug: 'sydney-store', city: 'Sydney', lat: -33.8688, lng: 151.2093, is_open: true },
  { id: 4, zone_id: 4, name: 'Dubai Store', slug: 'dubai-store', city: 'Dubai', lat: 25.2048, lng: 55.2708, is_open: true },
  { id: 5, zone_id: 5, name: 'London Store', slug: 'london-store', city: 'London', lat: 51.5072, lng: -0.1276, is_open: true },
  { id: 6, zone_id: 6, name: 'New York Store', slug: 'new-york-store', city: 'New York', lat: 40.7128, lng: -74.006, is_open: true },
];

/* ---------------- Categories ---------------- */

type CatSeed = [name: string, icon: string, header: string, quick: boolean, ecom: boolean, subs: string[]];

const catSeeds: CatSeed[] = [
  ['Grocery', '🛒', '#EBEC8D', true, true, ['Dal', 'Atta & Rice', 'Edible Oils', 'Dry Fruits', 'Masala & Spices']],
  ['Fresh Fruits & Vegetables', '🥦', '#D6F2C9', true, false, ['Fresh Fruits', 'Fresh Vegetables', 'Herbs & Leafy']],
  ['Dairy & Bakery', '🥛', '#FFF1C9', true, false, ['Dairy & Eggs', 'Bakery & Biscuits', 'Paneer & Cheese']],
  ['Snacks', '🍿', '#FFE1C2', true, true, ['Chips', 'Namkeen', 'Wafers', 'Chocolates']],
  ['Beverages', '🧃', '#FBE1D3', true, true, ['Soft Drinks', 'Tea & Coffee', 'Juices']],
  ['Beauty', '💄', '#FBD3E0', true, true, ['Skincare', 'Makeup', 'Hair Care']],
  ['Pharmacy', '💊', '#CDEFEA', true, true, ['Cough & Cold', 'Acidity & Indigestion', 'Vitamins', 'Health Drinks & Nutrition']],
  ['Kids', '🧸', '#FDE7B0', true, true, ['Toys', 'Diapers', 'Baby Food']],
  ['Summer', '☀️', '#BFE6F7', true, true, ['Ice Creams', 'Sunscreen', 'Cooling Drinks']],
  ['Electronics', '🎧', '#D8DEFB', false, true, ['Headphones', 'Smart Watches', 'Accessories']],
  ['Mobiles', '📱', '#DCD6FA', false, true, ['Smartphones', 'Chargers & Cables']],
  ['Fashion', '👕', '#E9DAFB', false, true, ['Men T-Shirts', 'Women Kurtas', 'Footwear']],
  ['Home & Kitchen', '🍳', '#F5E3D3', true, true, ['Cookware', 'Cleaning', 'Storage']],
  ['Pet Care', '🐾', '#F9D9D9', true, true, ['Dog Food', 'Cat Food']],
];

export const categories: (Category & { show_in_quick: boolean; show_in_ecommerce: boolean })[] = [];
let catId = 1;
const subTint = ['FFF4DA', 'E6F4E9', 'FDE2D6', 'E8EEFF', 'F3E8FF', 'E0F7F4'];
catSeeds.forEach(([name, icon, header, q, e, subs], i) => {
  const parentId = catId++;
  categories.push({
    id: parentId,
    parent_id: null,
    name,
    slug: slugify(name),
    icon,
    image: img(name, 300, 300, subTint[i % subTint.length], '25396F'),
    banner: img(name + ' Deals', 1600, 400, header.replace('#', ''), '111827'),
    header_color: header,
    show_in_quick: q,
    show_in_ecommerce: e,
  });
  subs.forEach((s, j) => {
    categories.push({
      id: catId++,
      parent_id: parentId,
      name: s,
      slug: slugify(s),
      image: img(s, 300, 300, subTint[(i + j) % subTint.length], '25396F'),
      header_color: header,
      show_in_quick: q,
      show_in_ecommerce: e,
    });
  });
});

export const catBySlug = (slug: string) => categories.find((c) => c.slug === slug);
export const catById = (id: Id) => categories.find((c) => c.id === Number(id));
export const subcatByName = (name: string) => categories.find((c) => c.parent_id !== null && c.name === name)!;

/* ---------------- Brands ---------------- */

const brandNames = [
  'Amul', 'Tata Sampann', 'Aashirvaad', 'Fortune', 'Haldiram\'s', 'Lay\'s', 'McCain', 'Britannia', 'Cadbury', 'Nestle',
  'Saffola', 'Daawat', 'Mother Dairy', 'Coca-Cola', 'Paper Boat', 'Lakme', 'Mamaearth', 'Himalaya', 'Dabur', 'Pampers',
  'boAt', 'Noise', 'Apple', 'Samsung', 'OnePlus', 'Levi\'s', 'Allen Solly', 'Prestige', 'Pedigree', 'Whiskas', 'Kwality Walls', 'Fresho',
];
export const brands: Brand[] = brandNames.map((name, i) => ({
  id: i + 1,
  name,
  slug: slugify(name),
  logo: img(name, 240, 120, 'FFFFFF', '111827'),
}));
const brandId = (name: string) => brands.find((b) => b.name === name)!.id;

/* ---------------- Products ---------------- */

type V = [name: string, mrp: number, sale: number | null, attrs?: Record<string, string>];
type PSeed = [name: string, sub: string, brand: string, variants: V[], opts?: { veg?: boolean; ff?: 'quick' | 'ecommerce' | 'both'; rating?: number; reviews?: number; color?: string }];

const productSeeds: PSeed[] = [
  // Grocery
  ['Tata Sampann Unpolished Toor Dal', 'Dal', 'Tata Sampann', [['1 kg', 210, 178], ['500 g', 112, 96]], { veg: true, ff: 'both' }],
  ['Tata Sampann Moong Dal', 'Dal', 'Tata Sampann', [['1 kg', 199, 165]], { veg: true, ff: 'both' }],
  ['Aashirvaad Superior MP Atta', 'Atta & Rice', 'Aashirvaad', [['5 kg', 320, 265], ['10 kg', 610, 512]], { veg: true, ff: 'both', rating: 4.6, reviews: 412 }],
  ['Daawat Traditional Basmati Rice', 'Atta & Rice', 'Daawat', [['1 kg', 199, 149], ['5 kg', 899, 699]], { veg: true, ff: 'both' }],
  ['Fortune Sunlite Refined Sunflower Oil', 'Edible Oils', 'Fortune', [['1 L', 180, 155], ['5 L', 865, 749]], { veg: true, ff: 'both' }],
  ['Saffola Gold Refined Cooking Oil', 'Edible Oils', 'Saffola', [['1 L', 230, 189]], { veg: true, ff: 'both' }],
  ['Premium California Almonds', 'Dry Fruits', 'Fresho', [['250 g', 349, 259], ['500 g', 680, 499]], { veg: true, ff: 'both', rating: 4.4 }],
  ['Whole Cashew Nuts W320', 'Dry Fruits', 'Fresho', [['250 g', 399, 289]], { veg: true, ff: 'both' }],
  ['Tata Salt Vacuum Evaporated Iodised', 'Masala & Spices', 'Tata Sampann', [['1 kg', 28, 27]], { veg: true, ff: 'both', rating: 4.8, reviews: 1290 }],
  ['Tata Sampann Turmeric Powder', 'Masala & Spices', 'Tata Sampann', [['200 g', 82, 70]], { veg: true, ff: 'both' }],
  // Fresh
  ['Local Tomato', 'Fresh Vegetables', 'Fresho', [['1 kg', 40, 20], ['500 g', 22, 11]], { veg: true, ff: 'quick', rating: 4.2 }],
  ['Onion', 'Fresh Vegetables', 'Fresho', [['1 kg', 55, 35]], { veg: true, ff: 'quick' }],
  ['Potato', 'Fresh Vegetables', 'Fresho', [['1 kg', 45, 32]], { veg: true, ff: 'quick' }],
  ['Lady Finger (Bhindi)', 'Fresh Vegetables', 'Fresho', [['250 g', 30, 22]], { veg: true, ff: 'quick', rating: 5, reviews: 2 }],
  ['Curry Leaves', 'Herbs & Leafy', 'Fresho', [['50 g', 12, 8]], { veg: true, ff: 'quick' }],
  ['Coriander Leaves', 'Herbs & Leafy', 'Fresho', [['100 g', 20, 14]], { veg: true, ff: 'quick' }],
  ['Robusta Banana', 'Fresh Fruits', 'Fresho', [['6 pcs', 60, 45]], { veg: true, ff: 'quick' }],
  ['Shimla Apple', 'Fresh Fruits', 'Fresho', [['4 pcs', 180, 139]], { veg: true, ff: 'quick', rating: 4.3 }],
  ['Alphonso Mango (Hapus)', 'Fresh Fruits', 'Fresho', [['6 pcs', 899, 649]], { veg: true, ff: 'quick', rating: 4.9, reviews: 233 }],
  // Dairy & bakery
  ['Amul Taaza Toned Fresh Milk', 'Dairy & Eggs', 'Amul', [['500 ml', 28, 27], ['1 L', 56, 54]], { veg: true, ff: 'quick', rating: 4.7, reviews: 980 }],
  ['Amul Butter Pasteurised', 'Dairy & Eggs', 'Amul', [['100 g', 62, 58], ['500 g', 285, 275]], { veg: true, ff: 'quick' }],
  ['Eggoz Brown Eggs', 'Dairy & Eggs', 'Fresho', [['10 pcs', 140, 92], ['6 pcs', 90, 62]], { veg: false, ff: 'quick' }],
  ['Amul Malai Fresh Paneer', 'Paneer & Cheese', 'Amul', [['200 g', 95, 90]], { veg: true, ff: 'quick' }],
  ['Mother Dairy Classic Curd', 'Dairy & Eggs', 'Mother Dairy', [['400 g', 50, 45]], { veg: true, ff: 'quick' }],
  ['Britannia Good Day Cashew Cookies', 'Bakery & Biscuits', 'Britannia', [['200 g', 50, 40]], { veg: true, ff: 'both' }],
  ['Britannia 100% Whole Wheat Bread', 'Bakery & Biscuits', 'Britannia', [['400 g', 55, 50]], { veg: true, ff: 'quick' }],
  // Snacks
  ['McCain Samosa Cheese Corn', 'Chips', 'McCain', [['240 g', 215, 140]], { veg: true, ff: 'quick', rating: 4.1 }],
  ['McCain French Fries', 'Chips', 'McCain', [['420 g', 140, 105]], { veg: true, ff: 'quick' }],
  ['McCain Chilli Garlic Potato Bites', 'Chips', 'McCain', [['420 g', 190, 140]], { veg: true, ff: 'quick' }],
  ['Lay\'s India\'s Magic Masala Chips', 'Wafers', 'Lay\'s', [['52 g', 20, 20], ['115 g', 50, 45]], { veg: true, ff: 'both' }],
  ['Lay\'s Classic Salted Chips', 'Wafers', 'Lay\'s', [['52 g', 20, 20]], { veg: true, ff: 'both' }],
  ['Haldiram\'s Aloo Bhujia', 'Namkeen', 'Haldiram\'s', [['400 g', 115, 99], ['1 kg', 260, 228]], { veg: true, ff: 'both', rating: 4.6 }],
  ['Haldiram\'s Moong Dal', 'Namkeen', 'Haldiram\'s', [['200 g', 60, 52]], { veg: true, ff: 'both' }],
  ['Cadbury Dairy Milk Silk', 'Chocolates', 'Cadbury', [['60 g', 90, 85], ['150 g', 200, 180]], { veg: true, ff: 'both', rating: 4.8 }],
  // Beverages
  ['Coca-Cola Original Soft Drink', 'Soft Drinks', 'Coca-Cola', [['750 ml', 45, 40], ['2.25 L', 110, 99]], { veg: true, ff: 'quick' }],
  ['Paper Boat Aamras Juice', 'Juices', 'Paper Boat', [['600 ml', 99, 80]], { veg: true, ff: 'both' }],
  ['Nescafe Classic Instant Coffee', 'Tea & Coffee', 'Nestle', [['100 g', 360, 315]], { veg: true, ff: 'both', rating: 4.7 }],
  ['Tata Tea Premium', 'Tea & Coffee', 'Tata Sampann', [['500 g', 290, 245]], { veg: true, ff: 'both' }],
  // Beauty
  ['Lakme 9 to 5 Primer + Matte Lipstick', 'Makeup', 'Lakme', [['Red Coat', 650, 520, { Color: 'Red' }], ['Pink Wink', 650, 520, { Color: 'Pink' }], ['Nude Touch', 650, 499, { Color: 'Beige' }]], { ff: 'both', rating: 4.3 }],
  ['Mamaearth Vitamin C Face Wash', 'Skincare', 'Mamaearth', [['100 ml', 299, 254]], { ff: 'both' }],
  ['Mamaearth Onion Hair Oil', 'Hair Care', 'Mamaearth', [['150 ml', 449, 349]], { ff: 'both', rating: 4.2 }],
  ['Himalaya Purifying Neem Face Wash', 'Skincare', 'Himalaya', [['150 ml', 210, 179]], { ff: 'both' }],
  // Pharmacy
  ['Dabur Honitus Cough Syrup', 'Cough & Cold', 'Dabur', [['100 ml', 115, 104]], { ff: 'both' }],
  ['Vicks VapoRub', 'Cough & Cold', 'Dabur', [['50 ml', 160, 150]], { ff: 'both' }],
  ['Himalaya Liv.52 Tablets', 'Acidity & Indigestion', 'Himalaya', [['100 tabs', 195, 175]], { ff: 'both' }],
  ['Pinkin Nabhi Oil for Digestion & Detox', 'Acidity & Indigestion', 'Himalaya', [['30 ml', 589, 420]], { ff: 'both', rating: 4.5 }],
  ['Protinex Original Health Drink', 'Health Drinks & Nutrition', 'Nestle', [['400 g', 699, 599]], { ff: 'both' }],
  // Kids
  ['Pampers Premium Care Pants', 'Diapers', 'Pampers', [['M - 54 pcs', 1499, 1049, { Size: 'M' }], ['L - 44 pcs', 1499, 1049, { Size: 'L' }], ['XL - 36 pcs', 1499, 1049, { Size: 'XL' }]], { ff: 'both', rating: 4.6 }],
  ['Nestle Cerelac Wheat Apple', 'Baby Food', 'Nestle', [['300 g', 285, 270]], { ff: 'both' }],
  // Summer
  ['Kwality Walls Cornetto Double Chocolate', 'Ice Creams', 'Kwality Walls', [['105 ml', 50, 45]], { veg: true, ff: 'quick' }],
  ['Amul Vanilla Magic Ice Cream Tub', 'Ice Creams', 'Amul', [['1 L', 220, 199]], { veg: true, ff: 'quick' }],
  // Electronics / Mobiles
  ['boAt Rockerz 450 Bluetooth Headphones', 'Headphones', 'boAt', [['Luscious Black', 3990, 1499, { Color: 'Black' }], ['Aqua Blue', 3990, 1499, { Color: 'Blue' }], ['Hazel Beige', 3990, 1599, { Color: 'Beige' }]], { ff: 'ecommerce', rating: 4.2, reviews: 812 }],
  ['boAt Airdopes 141 TWS Earbuds', 'Headphones', 'boAt', [['Bold Black', 4490, 1099, { Color: 'Black' }], ['Pure White', 4490, 1099, { Color: 'White' }]], { ff: 'ecommerce', rating: 4.0 }],
  ['Noise ColorFit Pro 5 Smart Watch', 'Smart Watches', 'Noise', [['Jet Black', 6999, 3499, { Color: 'Black' }], ['Rose Pink', 6999, 3499, { Color: 'Pink' }]], { ff: 'ecommerce', rating: 4.1 }],
  ['Apple iPhone 17 Pro Max', 'Smartphones', 'Apple', [['256 GB · Cosmic Orange', 149900, 144900, { Color: 'Orange', Storage: '256 GB' }], ['512 GB · Deep Blue', 169900, 164900, { Color: 'Blue', Storage: '512 GB' }]], { ff: 'ecommerce', rating: 4.8, reviews: 96 }],
  ['Samsung Galaxy S25 Ultra 5G', 'Smartphones', 'Samsung', [['256 GB · Titanium Gray', 129999, 109999, { Color: 'Gray', Storage: '256 GB' }]], { ff: 'ecommerce', rating: 4.6 }],
  ['OnePlus 13R 5G', 'Smartphones', 'OnePlus', [['256 GB · Astral Trail', 44999, 39999, { Color: 'Black', Storage: '256 GB' }]], { ff: 'ecommerce', rating: 4.4 }],
  ['Samsung 25W Type-C Fast Charger', 'Chargers & Cables', 'Samsung', [['1 pc', 1999, 1299]], { ff: 'both' }],
  // Fashion
  ['Levi\'s Men Slim Fit Crew T-Shirt', 'Men T-Shirts', 'Levi\'s', [['S / White', 1299, 649, { Size: 'S', Color: 'White' }], ['M / White', 1299, 649, { Size: 'M', Color: 'White' }], ['L / Black', 1299, 649, { Size: 'L', Color: 'Black' }], ['XL / Black', 1299, 699, { Size: 'XL', Color: 'Black' }]], { ff: 'ecommerce', rating: 4.3 }],
  ['Allen Solly Men Polo T-Shirt', 'Men T-Shirts', 'Allen Solly', [['M / Navy', 1499, 899, { Size: 'M', Color: 'Blue' }], ['L / Navy', 1499, 899, { Size: 'L', Color: 'Blue' }]], { ff: 'ecommerce' }],
  // Home & Kitchen
  ['Prestige Omega Deluxe Non-Stick Kadai', 'Cookware', 'Prestige', [['24 cm', 2195, 1299]], { ff: 'both', rating: 4.3 }],
  ['Prestige Svachh Pressure Cooker', 'Cookware', 'Prestige', [['3 L', 2650, 1849], ['5 L', 3150, 2299]], { ff: 'both' }],
  // Pet care
  ['Pedigree Adult Dry Dog Food Chicken & Veg', 'Dog Food', 'Pedigree', [['1.2 kg', 380, 342], ['3 kg', 880, 790]], { ff: 'both', rating: 4.5 }],
  ['Whiskas Adult Wet Cat Food Tuna', 'Cat Food', 'Whiskas', [['85 g', 50, 45]], { ff: 'both' }],
];

const productTint = ['E6F4E9', 'FFF4DA', 'FDE2D6', 'E8EEFF', 'F3E8FF', 'E0F7F4', 'FFE4EC'];

const descriptionFor = (name: string, cat: string) =>
  `<p><strong>${name}</strong> is handpicked and quality-checked at our Mumbai dark store so you get it fresh, at the best price, delivered to your door in minutes.</p>
<h3>Key features</h3>
<ul><li>100% genuine product sourced directly from brand/authorised distributors</li><li>Hygienically packed and stored at the right temperature</li><li>Easy returns within the return window if you are not satisfied</li></ul>
<h3>Storage &amp; usage</h3>
<p>Store in a cool and dry place away from direct sunlight. Refer to the pack for detailed usage instructions. Category: ${cat}.</p>`;

let variantId = 1;
export const products: (ProductDetail & { created_order: number; popularity: number })[] = productSeeds.map(
  ([name, sub, brand, vs, o = {}], idx) => {
    const id = idx + 1;
    const subcat = subcatByName(sub);
    const parent = catById(subcat.parent_id!)!;
    const tint = productTint[idx % productTint.length];
    const short = name.length > 22 ? name.split(' ').slice(0, 3).join(' ') : name;
    const thumb = img(short, 600, 600, tint, '0E9623');
    const variants = vs.map(([vn, mrp, sale, attrs]) => ({
      id: variantId++,
      product_id: id,
      name: vn,
      sku: `SB-${id}-${vn.replace(/\W+/g, '').toUpperCase().slice(0, 8)}`,
      price: mrp,
      sale_price: sale,
      stock: (idx * 7 + 13) % 40 === 0 ? 0 : 20 + ((idx * 13) % 60),
      image: thumb,
      attributes: attrs
        ? Object.entries(attrs).map(([attribute, value], k) => ({
            id: id * 100 + k,
            attribute,
            value,
            color_hex: attribute === 'Color' ? colorHex(value) : null,
          }))
        : [{ id: id * 100, attribute: 'Pack Size', value: vn, color_hex: null }],
    }));
    const rating = o.rating ?? Math.round((3.8 + ((idx * 37) % 12) / 10) * 10) / 10;
    const rc = o.reviews ?? 3 + ((idx * 29) % 140);
    return {
      id,
      name,
      slug: slugify(name),
      thumbnail: thumb,
      images: [thumb, img(short + ' Pack', 600, 600, 'FFFFFF', '344054'), img(short + ' Info', 600, 600, 'F6F8FA', '7C8DB5')],
      category_id: subcat.id,
      category: { id: subcat.id, name: subcat.name, slug: subcat.slug },
      brand: brands.find((b) => b.id === brandId(brand)) || null,
      short_description: `${name} — ${vs[0][0]}. Fresh stock, best price guaranteed.`,
      description: descriptionFor(name, parent.name),
      is_veg: o.veg ?? null,
      rating_avg: Math.min(5, rating),
      rating_count: rc,
      fulfillment_type: o.ff ?? 'both',
      delivery_minutes: o.ff === 'ecommerce' ? 2 * 24 * 60 : 8,
      max_qty_per_order: 10,
      variants,
      tags: [parent.name, sub],
      return_allowed: parent.slug !== 'fresh-fruits-and-vegetables',
      return_days: o.ff === 'ecommerce' ? 7 : 2,
      cancelable: true,
      cod_allowed: true,
      seo_title: `Buy ${name} Online | QwikMart`,
      seo_description: `Order ${name} online at the best price. Delivered in minutes in Mumbai.`,
      rating_breakdown: breakdown(rating, rc),
      reviews: [],
      similar: [],
      cross_sell: [],
      up_sell: [],
      store: null,
      manufacturer: brand,
      created_order: (idx * 17) % productSeeds.length,
      popularity: rc,
    };
  },
);

function colorHex(c: string) {
  const map: Record<string, string> = {
    Red: '#DC2626', Pink: '#EC4899', Beige: '#D6C3A5', Black: '#111827', Blue: '#2563EB', White: '#F9FAFB', Gray: '#6B7280', Orange: '#F97316',
  };
  return map[c] || '#9CA3AF';
}

function breakdown(avg: number, count: number): ProductDetail['rating_breakdown'] {
  const five = Math.round(count * Math.max(0.1, (avg - 3) / 2) * 0.8);
  const four = Math.round((count - five) * 0.55);
  const three = Math.round((count - five - four) * 0.6);
  const two = Math.round((count - five - four - three) * 0.6);
  const one = Math.max(0, count - five - four - three - two);
  return { '5': five, '4': four, '3': three, '2': two, '1': one };
}

const reviewers = ['Dikshita Khetani', 'Aayush Thacker', 'Priya Nair', 'Rohan Mehta', 'Sneha Kulkarni', 'Imran Shaikh', 'Kavya Iyer'];
const comments = [
  'Fresh and well packed. Delivered within 10 minutes!',
  'Good quality, exactly as shown. Will order again.',
  'Value for money. The price was lower than my local store.',
  'Packaging could be better but product is genuine.',
  'Super fast delivery and the delivery partner was polite.',
  'Excellent! My family loved it.',
];

export function reviewsFor(productIdIn: Id, count = 5): Review[] {
  const productId = Number(productIdIn);
  return Array.from({ length: count }, (_, i) => {
    const k = (productId + i) % reviewers.length;
    return {
      id: productId * 100 + i,
      user: { name: reviewers[k], avatar: null },
      rating: 5 - ((productId + i * 3) % 3 === 0 ? 1 : 0) - (i === 4 ? 2 : 0),
      comment: comments[(productId + i) % comments.length],
      images: [],
      created_at: new Date(Date.now() - (i + 1) * 86400000 * (2 + (productId % 5))).toISOString(),
    };
  });
}

export const productSummary = (p: ProductDetail): Product => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  thumbnail: p.thumbnail,
  images: p.images,
  category_id: p.category_id,
  category: p.category,
  brand: p.brand,
  short_description: p.short_description,
  is_veg: p.is_veg,
  rating_avg: p.rating_avg,
  rating_count: p.rating_count,
  fulfillment_type: p.fulfillment_type,
  delivery_minutes: p.delivery_minutes,
  max_qty_per_order: p.max_qty_per_order,
  variants: p.variants,
  tags: p.tags,
});

export const parentOf = (categoryId: Id) => {
  const c = catById(categoryId);
  return c?.parent_id ? catById(c.parent_id) : c;
};

/* ---------------- Banners ---------------- */

export const quickBanners: Banner[] = [
  {
    id: 1,
    tag: 'DAILY ESSENTIALS',
    title: 'Everything|Your Home Needs',
    subtitle: 'Groceries, staples & more delivered to your doorstep',
    image: img('Groceries Basket', 900, 700, 'F3F6D8', '0E9623'),
    bg: 'linear-gradient(100deg,#F4F7DD 0%,#EEF3D2 45%,#E3EEC6 100%)',
    link_type: 'category',
    link_value: 'grocery',
  },
  {
    id: 2,
    tag: 'Stronger Today, Healthier Tomorrow',
    title: 'Fuel Your Fitness —|Protein & Nutrition',
    subtitle: 'Premium nutrition to power your workouts, build strength and help you reach your goals.',
    image: img('Protein & Nutrition', 900, 700, 'DDF2F4', '0F766E'),
    bg: 'linear-gradient(100deg,#E3F6F8 0%,#D7F0F2 50%,#C9EAEE 100%)',
    link_type: 'category',
    link_value: 'pharmacy',
  },
  {
    id: 3,
    tag: 'FARM FRESH',
    title: 'Fresh Fruits &|Vegetables in 8 mins',
    subtitle: 'Picked at dawn, at your door before breakfast. Up to 40% off.',
    image: img('Fresh Produce', 900, 700, 'FDECD9', 'C2410C'),
    bg: 'linear-gradient(100deg,#FFF3E6 0%,#FDE7D3 60%,#FBDCC2 100%)',
    link_type: 'category',
    link_value: 'fresh-fruits-and-vegetables',
  },
  {
    id: 4,
    tag: 'SUMMER SPECIAL',
    title: 'Beat the Heat|Ice Creams & Coolers',
    subtitle: 'Your favourite frozen treats delivered chilled.',
    image: img('Ice Creams', 900, 700, 'DCEFFB', '1D4ED8'),
    bg: 'linear-gradient(100deg,#E9F6FE 0%,#D9EFFC 60%,#C8E6FA 100%)',
    link_type: 'category',
    link_value: 'summer',
  },
];

export const ecomBanners: Banner[] = [
  {
    id: 11,
    tag: 'New Arrival',
    title: 'iPhone 17|Pro Max',
    subtitle: 'Titan Power. More Pro. 48MP Pro camera system, A19 Pro chip and all-day battery.',
    image: img('iPhone 17 Pro Max', 900, 700, 'E6E4FB', '4C1D95'),
    bg: 'linear-gradient(100deg,#F1EFFE 0%,#E6E3FB 55%,#DAD5F8 100%)',
    link_type: 'product',
    link_value: 'apple-iphone-17-pro-max',
  },
  {
    id: 12,
    tag: 'STYLE THAT SPEAKS',
    title: 'Fashion Week|Up to 60% OFF',
    subtitle: 'Fresh fits from Levi\'s, Allen Solly and more.',
    image: img('Fashion Sale', 900, 700, 'F6E7FB', '86198F'),
    bg: 'linear-gradient(100deg,#FBF1FD 0%,#F4E3FA 60%,#ECD5F7 100%)',
    link_type: 'category',
    link_value: 'fashion',
  },
  {
    id: 13,
    tag: 'AUDIO FEST',
    title: 'Sound That|Moves You',
    subtitle: 'Headphones & earbuds from ₹999. Free delivery across Mumbai.',
    image: img('Audio Fest', 900, 700, 'E1E7FD', '1E3A8A'),
    bg: 'linear-gradient(100deg,#EEF2FF 0%,#E0E7FF 60%,#D3DCFE 100%)',
    link_type: 'category',
    link_value: 'electronics',
  },
];

export const gridBanners = (mode: 'quick' | 'ecommerce'): Banner[] =>
  mode === 'quick'
    ? [
        { id: 21, image: img('Snacks Fest - Up to 50% OFF', 800, 420, 'FFE1C2', '9A3412'), link_type: 'category', link_value: 'snacks' },
        { id: 22, image: img('Beauty Bonanza - Flat 30% OFF', 800, 420, 'FBD3E0', '9D174D'), link_type: 'category', link_value: 'beauty' },
        { id: 23, image: img('Pharmacy - Health First', 800, 420, 'CDEFEA', '0F766E'), link_type: 'category', link_value: 'pharmacy' },
      ]
    : [
        { id: 24, image: img('Headphones - UP TO 70% OFF', 800, 420, 'D8DEFB', '1E3A8A'), link_type: 'category', link_value: 'electronics' },
        { id: 25, image: img('Men Fashion - 50-70% OFF', 800, 420, 'E9DAFB', '6B21A8'), link_type: 'category', link_value: 'fashion' },
        { id: 26, image: img('Smartphones - Big Savings', 800, 420, 'DCD6FA', '4C1D95'), link_type: 'category', link_value: 'mobiles' },
      ];

export const titleImage = (mode: 'quick' | 'ecommerce'): Banner =>
  mode === 'quick'
    ? { id: 31, title: 'Fresh Grocery', image: img('Fresh Grocery - Farm to Doorstep', 1600, 360, 'FDE2C4', 'C2410C'), link_type: 'category', link_value: 'fresh-fruits-and-vegetables' }
    : { id: 32, title: 'Swag Sale', image: img('SWAG SALE - Epic Deals All Day', 1600, 360, 'D6F2C9', '166534'), link_type: 'category', link_value: 'fashion' };

/* ---------------- Coupons ---------------- */

export const coupons: Coupon[] = [
  { id: 1, code: 'MUMBAI99', title: 'Flat ₹99 off', description: 'Get flat ₹99 off on orders above ₹499 in Mumbai.', discount_type: 'fixed', discount_value: 99, min_order: 499, banner_color: '#0E9623', ends_at: null },
  { id: 2, code: 'VIP500', title: '10% off up to ₹500', description: 'VIP savings on orders above ₹1999.', discount_type: 'percent', discount_value: 10, max_discount: 500, min_order: 1999, banner_color: '#8B5CF6', ends_at: null },
  { id: 3, code: 'HAPPYHOUR', title: '15% off up to ₹100', description: 'Happy hour deal on orders above ₹299.', discount_type: 'percent', discount_value: 15, max_discount: 100, min_order: 299, banner_color: '#F59E0B', ends_at: null },
  { id: 4, code: 'WALLETCASH50', title: '₹50 wallet cashback', description: 'Add ₹50 more to unlock WALLETCASH50 — cashback credited to your QwikMart wallet.', discount_type: 'fixed', discount_value: 50, min_order: 299, banner_color: '#3B82F6', ends_at: null },
  { id: 5, code: 'FREEDEL', title: 'Free delivery', description: 'Free delivery on your order, no minimum.', discount_type: 'free_delivery', discount_value: 0, min_order: 0, banner_color: '#22C55E', ends_at: null },
];

/* ---------------- Blog / FAQ / Pages ---------------- */

export const blogCategories: BlogCategory[] = [
  { id: 1, name: 'Deals & Offers', slug: 'deals-offers' },
  { id: 2, name: 'Health & Wellness', slug: 'health-wellness' },
  { id: 3, name: 'Home & Appliances', slug: 'home-appliances' },
  { id: 4, name: 'Tech & Gadgets', slug: 'tech-gadgets' },
  { id: 5, name: 'Beauty & Skincare', slug: 'beauty-skincare' },
  { id: 6, name: 'Fashion & Style', slug: 'fashion-style' },
  { id: 7, name: 'Grocery & Kitchen Tips', slug: 'grocery-kitchen-tips' },
];

const blogSeeds: [string, number, string][] = [
  ['QwikMart Referral Program Explained: How to Earn While You Shop', 1, 'Invite your friends to QwikMart and earn wallet rewards on every successful first order. Here is everything you need to know.'],
  ['How to Stack Wallet Cashback, Promo Codes and Referrals for Maximum Savings', 1, 'Learn how QwikMart wallet, promo codes and referral rewards work together to save you more.'],
  ['5-Star vs 3-Star: What Energy Ratings Actually Mean for Your Electricity Bill', 3, 'Confused by star ratings on ACs and refrigerators? We break down the real-world savings.'],
  ['10 Immunity-Boosting Foods to Add to Your Monsoon Grocery List', 2, 'Stay healthy this season with these easy-to-find immunity boosters available on QwikMart.'],
  ['Best Budget Earbuds Under ₹2,000 in 2026', 4, 'We tested the most popular TWS earbuds so you do not have to. Here are our top picks.'],
  ['A Simple 4-Step Skincare Routine for Mumbai Humidity', 5, 'Humidity, pollution and long commutes — a dermatologist-approved routine that actually works.'],
  ['Wardrobe Essentials Every Man Needs This Festive Season', 6, 'Build a versatile festive wardrobe with these timeless pieces.'],
  ['Smart Pantry: How to Store Dal, Rice and Atta to Keep Them Fresh Longer', 7, 'Simple storage hacks that prevent pests and keep your staples fresh for months.'],
];

export const blogs: Blog[] = blogSeeds.map(([title, catIdx, excerpt], i) => ({
  id: i + 1,
  title,
  slug: slugify(title),
  image: img(title.split(':')[0].slice(0, 38), 800, 500, i % 2 ? 'E6F4E9' : 'FFF4DA', '0E9623'),
  excerpt,
  content: `<p>${excerpt}</p>
<h2>Why it matters</h2>
<p>At QwikMart we obsess over making everyday shopping faster, cheaper and more delightful. Whether you are ordering groceries for the week or the latest gadget, small habits add up to big savings.</p>
<h2>Our top tips</h2>
<ol><li>Check the <strong>Offers</strong> section in your cart before you check out.</li><li>Turn on <strong>Use Wallet Balance</strong> to apply cashback instantly.</li><li>Share your referral code with friends and family — both of you earn rewards.</li></ol>
<p>Have questions? Our support team is available 24×7 via in-app chat.</p>`,
  category: blogCategories.find((c) => c.id === catIdx),
  read_minutes: 2 + (i % 5),
  views: 120 + ((i * 97) % 900),
  created_at: new Date(Date.now() - (i + 2) * 86400000 * 3).toISOString(),
}));

export const faqs: Faq[] = [
  { id: 1, question: 'How fast is QwikMart Quick delivery?', answer: 'Quick orders are delivered from your nearest dark store, typically in 8–15 minutes depending on distance and demand.' },
  { id: 2, question: 'What is the difference between Quick and eCommerce?', answer: 'Quick is for instant local delivery of everyday essentials. eCommerce covers a wider catalogue (electronics, fashion, home) with scheduled delivery in 1–4 days.' },
  { id: 3, question: 'How do I track my order?', answer: 'Open My Orders and select your order. You can see live status, the delivery partner on the map, and your delivery OTP.' },
  { id: 4, question: 'Why do I need to share an OTP at delivery?', answer: 'The 6-digit delivery OTP ensures your order is handed over only to you. Share it with the delivery partner only when you receive your items.' },
  { id: 5, question: 'How do returns and refunds work?', answer: 'Eligible items can be returned from the order detail page within the return window. Refunds are credited to your QwikMart wallet or original payment method.' },
  { id: 6, question: 'How does the QwikMart wallet work?', answer: 'Add money via any supported payment gateway, receive cashback and refunds, and toggle "Use Wallet Balance" at checkout to pay.' },
  { id: 7, question: 'How do I earn referral rewards?', answer: 'Share your referral code from Refer & Earn. When your friend places their first order above the minimum value, both of you receive wallet rewards.' },
  { id: 8, question: 'Can I pay cash on delivery?', answer: 'Yes. Cash on Delivery is available for most products. You can also pay with UPI/cards via PhonePe, Razorpay, Stripe, PayPal, Cashfree and more.' },
];

export const cmsPages: CmsPage[] = [
  {
    slug: 'about',
    title: 'About QwikMart',
    content: '<p>QwikMart is a hyperlocal Quick Commerce + eCommerce platform that brings groceries, essentials and lifestyle products to your doorstep — in minutes for everyday needs, and in days for everything else.</p><h2>Our mission</h2><p>Make shopping effortless for every neighbourhood by combining dark stores, smart routing and a delightful app.</p>',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    content: '<p>We respect your privacy. This policy explains what data we collect (account, location, orders, device) and how we use it to deliver your orders and improve our services.</p><h2>Data we collect</h2><ul><li>Account details such as name, phone and email</li><li>Delivery addresses and location for zone detection</li><li>Order and payment history</li></ul><h2>Your choices</h2><p>You can update or delete your account at any time from your profile.</p>',
  },
  {
    slug: 'terms',
    title: 'Terms & Conditions',
    content: '<p>By using QwikMart you agree to these terms. Prices and availability may vary by zone. Promo codes are subject to their individual terms.</p><h2>Orders</h2><p>Orders may be cancelled before they are shipped. Quick orders that are already out for delivery cannot be cancelled.</p>',
  },
  {
    slug: 'refund',
    title: 'Refund & Return Policy',
    content: '<p>Returns are accepted for eligible products within the return window shown on the product page.</p><h2>Refunds</h2><p>Approved refunds are credited to your QwikMart wallet instantly or to the original payment method within 5–7 business days.</p>',
  },
];

export const trendingSearches = ['Milk', 'Potato', 'McCain', 'Atta', 'Chips', 'Earbuds', 'Ice cream', 'Paneer', 'iPhone', 'Face wash'];
