/**
 * Build-time catalogue read. Products are static between deploys — this
 * runs once per `astro build`, never per-request. Stock is display-only
 * here; the checkout API re-checks it live against the database.
 */
import { supabasePublic } from './supabase.js';
import { DUMMY_PRODUCTS } from './dummy-catalogue.js';
 
let cache;
 
const sizeOrder = ['S', 'M', 'L', 'XL', 'XXL'];
 
function withSortedVariants(products) {
  return products.map((product) => ({
    ...product,
    variants: [...product.variants].sort(
      (a, b) => sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size)
    ),
  }));
}
 
export async function getProducts() {
  if (cache) return cache;
 
  // No Supabase configured → run as a self-contained dummy with the
  // built-in demo products. Set SUPABASE_URL + SUPABASE_ANON_KEY to read a
  // real catalogue instead. (A configured-but-failing fetch still throws
  // below, so a real misconfiguration doesn't silently fall back to demo.)
  if (!import.meta.env.SUPABASE_URL || !import.meta.env.SUPABASE_ANON_KEY) {
    console.info('[catalogue] Supabase not configured — using built-in dummy products.');
    cache = withSortedVariants(DUMMY_PRODUCTS);
    return cache;
  }
 
  const supabase = supabasePublic();
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, slug, name, description, price_paise, gsm, image_url, variants(id, sku, size, stock)'
    )
    .eq('is_active', true)
    .order('created_at', { ascending: true });
 
  if (error) throw new Error(`Catalogue fetch failed: ${error.message}`);
 
  // The dummy catalogue exposes `image`; Postgres stores `image_url`.
  // Normalise here so the Astro pages never learn the difference.
  cache = withSortedVariants(data).map((p) => ({ ...p, image: p.image_url }));
  return cache;
}
 
export async function getProductBySlug(slug) {
  const products = await getProducts();
  return products.find((p) => p.slug === slug);
}
 

