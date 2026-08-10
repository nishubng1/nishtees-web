import { useEffect, useState } from 'react';
import { getCart, subscribe } from './cart.js';

/**
 * React view of the cart store. Starts empty to match the server-rendered
 * island HTML (localStorage isn't readable during the build), then hydrates
 * on mount and re-renders on every change — avoiding a hydration mismatch.
 */
export function useCart() {
  const [cart, setCart] = useState([]);
  useEffect(() => {
    setCart(getCart());
    return subscribe(setCart);
  }, []);
  return cart;
}
