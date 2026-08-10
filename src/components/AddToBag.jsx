import { useState } from 'react';
import { addItem } from '../lib/cart.js';

/**
 * Size selection + add-to-bag. Adds the chosen variant to the local cart
 * store and shows a short confirmation with a link to the bag.
 *
 * Props:
 *   variants    [{ sku, size }]  (from the build-time catalogue read)
 *   slug, name  product identity, stored for cart display
 *   pricePaise  display price only — the server re-prices at checkout
 */
export default function AddToBag({ variants, slug, name, pricePaise }) {
  const [selectedSku, setSelectedSku] = useState(null);
  const [added, setAdded] = useState(false);

  function selectSize(sku) {
    setSelectedSku(sku);
    setAdded(false);
  }

  function handleAddToBag() {
    if (!selectedSku) return;
    const v = variants.find((x) => x.sku === selectedSku);
    addItem({ sku: v.sku, size: v.size, slug, name, pricePaise });
    setAdded(true);
  }

  return (
    <div>
      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wide text-ink/60">
          Size
        </legend>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
          {variants.map((v) => (
            <button
              key={v.sku}
              type="button"
              role="radio"
              aria-checked={selectedSku === v.sku}
              onClick={() => selectSize(v.sku)}
              className={`min-w-11 rounded-none border px-4 py-2 text-sm font-medium uppercase transition ${
                selectedSku === v.sku
                  ? 'border-ink bg-ink text-paper'
                  : 'border-ink/20 text-ink hover:border-ink'
              }`}
            >
              {v.size}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={handleAddToBag}
        disabled={!selectedSku}
        className="mt-6 w-full bg-accent px-6 py-4 text-sm font-semibold uppercase tracking-wide text-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add to Bag
      </button>

      {added && (
        <p role="status" className="mt-3 text-sm text-ink/80">
          Added to your bag.{' '}
          <a href="/cart" className="font-semibold underline underline-offset-2 hover:text-accent">
            View bag
          </a>
        </p>
      )}
    </div>
  );
}
