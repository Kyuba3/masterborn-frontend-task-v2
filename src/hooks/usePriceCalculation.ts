import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  Configuration,
  Product,
  PriceBreakdown,
  PriceResponse,
} from '../components/ProductConfigurator/types';
import { calculatePrice } from '../services/api';

interface UsePriceCalculationResult {
  price: PriceBreakdown | null;
  formattedTotal: string;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface PriceRequest {
  config: Configuration | null;
  product: Product;
  revision: number;
  delay: number;
}

interface PriceResult {
  request: PriceRequest;
  response: PriceResponse | null;
  error: string | null;
}

function usePriceRequest(
  config: Configuration | null,
  product: Product,
  delay: number,
): UsePriceCalculationResult {
  const [result, setResult] = useState<PriceResult | null>(null);
  const [revision, setRevision] = useState(0);
  const latestRequestRef = useRef(0);
  const previousRevisionRef = useRef(0);
  const request = useMemo(
    () => ({ config, product, revision, delay }),
    [config, product, revision, delay],
  );

  useEffect(() => {
    const { config, product, delay } = request;
    const requestId = ++latestRequestRef.current;
    const isRefetch = request.revision !== previousRevisionRef.current;
    previousRevisionRef.current = request.revision;
    let active = true;

    const fetchPrice = async () => {
      if (!config) return;

      try {
        const response = await calculatePrice(config, product);
        if (active && requestId === latestRequestRef.current) {
          setResult({ request, response, error: null });
        }
      } catch {
        if (active && requestId === latestRequestRef.current) {
          setResult({
            request,
            response: null,
            error: 'ERR_PRICE_CALC_FAILED',
          });
        }
      }
    };

    // Explicit refetches bypass debounce and supersede any scheduled request.
    const timeout = config && delay > 0 && !isRefetch ? setTimeout(fetchPrice, delay) : null;
    if (timeout === null) void fetchPrice();

    return () => {
      // Invalidate in-flight work on input changes, unmount, and Strict Mode replay.
      active = false;
      if (timeout !== null) clearTimeout(timeout);
    };
  }, [request]);

  // Hide old results during render, before the next effect has started its request.
  const currentResult = result?.request === request ? result : null;

  const refetch = useCallback(() => setRevision((previous) => previous + 1), []);

  return {
    price: config ? (currentResult?.response?.breakdown ?? null) : null,
    formattedTotal: config ? (currentResult?.response?.formattedTotal ?? '$0.00') : '$0.00',
    isLoading: config !== null && currentResult === null,
    error: config ? (currentResult?.error ?? null) : null,
    refetch,
  };
}

/** Custom hook for managing price calculation. */
export function usePriceCalculation(
  config: Configuration | null,
  product: Product,
): UsePriceCalculationResult {
  return usePriceRequest(config, product, 0);
}

/** Debounced version of price calculation. */
export function useDebouncedPriceCalculation(
  config: Configuration | null,
  product: Product,
  delay: number = 300,
): UsePriceCalculationResult {
  return usePriceRequest(config, product, delay);
}
