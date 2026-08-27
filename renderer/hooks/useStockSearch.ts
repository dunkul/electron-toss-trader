import { useEffect, useState } from 'react';
import { api } from '../lib/ipc';
import type { StockRow } from '../lib/ipc';

export function useStockSearch(limit = 15) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<StockRow[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length === 0) {
        setOptions([]);
        return;
      }
      api
        .searchStocks(query, limit)
        .then(setOptions)
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, limit]);

  return { query, setQuery, options } as const;
}
