import { useState } from 'react';

/**
 * Size selection + add-to-bag UI. The cart itself lands next session —
 * onAddToBag is a no-op stub so this button does nothing yet beyond
 * requiring a size to be picked.
 *
 * Props:
 *   variants  [{ sku, size }]  (from build-time catalogue read)
 */
export default function AddToBag({ variants }) {
  const [selectedSku, setSelectedSku] = useState(null);

  function handleAddToBag() {
    // TODO(next session): wire to cart state.
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
              onClick={() => setSelectedSku(v.sku)}
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
    </div>
  );
}
