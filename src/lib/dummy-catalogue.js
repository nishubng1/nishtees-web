/**
 * Built-in demo catalogue. Used when no Supabase is configured, so the
 * site builds and runs as a self-contained dummy with three products and
 * a working cart — no database, no keys, no external setup.
 *
 * Shape matches exactly what getProducts() returns from Supabase, so the
 * pages don't know or care which source they got.
 */
export const DUMMY_PRODUCTS = [
  {
    id: 'demo-1',
    slug: 'static-noise-black',
    name: 'Static Noise Oversized Tee — Black',
    description:
      '240 GSM heavyweight cotton, drop-shoulder cut, bio-washed and pre-shrunk. The everyday black that holds its shape.',
    price_paise: 99900,
    gsm: 240,
    variants: [
      { id: 'demo-1-s', sku: 'NT-SN-BLK-S', size: 'S', stock: 8 },
      { id: 'demo-1-m', sku: 'NT-SN-BLK-M', size: 'M', stock: 12 },
      { id: 'demo-1-l', sku: 'NT-SN-BLK-L', size: 'L', stock: 12 },
      { id: 'demo-1-xl', sku: 'NT-SN-BLK-XL', size: 'XL', stock: 8 },
    ],
  },
  {
    id: 'demo-2',
    slug: 'concrete-wash-bone',
    name: 'Concrete Wash Oversized Tee — Bone',
    description:
      '240 GSM oversized tee in a washed off-white. Boxy drop-shoulder fit, garment-dyed for a soft, lived-in hand.',
    price_paise: 109900,
    gsm: 240,
    variants: [
      { id: 'demo-2-s', sku: 'NT-CW-BNE-S', size: 'S', stock: 6 },
      { id: 'demo-2-m', sku: 'NT-CW-BNE-M', size: 'M', stock: 10 },
      { id: 'demo-2-l', sku: 'NT-CW-BNE-L', size: 'L', stock: 9 },
      { id: 'demo-2-xl', sku: 'NT-CW-BNE-XL', size: 'XL', stock: 5 },
    ],
  },
  {
    id: 'demo-3',
    slug: 'signal-lost-olive',
    name: 'Signal Lost Oversized Tee — Olive',
    description:
      '240 GSM heavyweight olive tee with a structured drop-shoulder cut that keeps its drape wash after wash.',
    price_paise: 99900,
    gsm: 240,
    variants: [
      { id: 'demo-3-s', sku: 'NT-SL-OLV-S', size: 'S', stock: 7 },
      { id: 'demo-3-m', sku: 'NT-SL-OLV-M', size: 'M', stock: 11 },
      { id: 'demo-3-l', sku: 'NT-SL-OLV-L', size: 'L', stock: 10 },
      { id: 'demo-3-xl', sku: 'NT-SL-OLV-XL', size: 'XL', stock: 4 },
    ],
  },
];
