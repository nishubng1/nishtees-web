/**
 * Build-time catalogue read. Products are static between deploys — this
 * runs once per `astro build`, never per-request. Stock is display-only
 * here; the checkout API re-checks it live against the database.
 */
import { supabasePublic } from './supabase.js';

let cache;

export async function getProducts() {
  if (cache) return cache;

  const supabase = supabasePublic();
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, slug, name, description, price_paise, gsm, variants(id, sku, size, stock)'
    )
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Catalogue fetch failed: ${error.message}`);

  const sizeOrder = ['S', 'M', 'L', 'XL', 'XXL'];
  cache = data.map((product) => ({
    ...product,
    variants: [...product.variants].sort(
      (a, b) => sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size)
    ),
  }));

  return cache;
}

export async function getProductBySlug(slug) {
  const products = await getProducts();
  return products.find((p) => p.slug === slug);
}
