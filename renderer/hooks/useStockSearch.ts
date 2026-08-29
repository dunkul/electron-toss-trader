import { useEffect, useState } from 'react';
import { api } from '../lib/ipc';
import type { StockRow } from '../lib/ipc';

// 입력할 때마다 검색 요청을 보내지 않고 타이핑이 잠시 멈춘 뒤에만 보낸다.
const SEARCH_DEBOUNCE_MS = 250;

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
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, limit]);

  return { query, setQuery, options } as const;
}
