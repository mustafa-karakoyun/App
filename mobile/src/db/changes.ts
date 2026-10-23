import { useEffect, useState } from 'react';

// Tüm yazmalar veri katmanından geçtiği için ekranları yenilemenin en basit yolu:
// her yazmada ilgili tabloyu duyur, o tabloyu okuyan sorgular yeniden çalışsın.
export type TableName = 'books' | 'user_books' | 'locations' | 'loans' | 'pending_scans' | 'kv';

type Listener = (tables: Set<TableName>) => void;
const listeners = new Set<Listener>();

export function notifyChange(...tables: TableName[]) {
  const set = new Set(tables);
  for (const l of listeners) l(set);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Yerel veri tabanı sorgusu. `tables` içindeki tablolardan biri değişince yeniden çalışır.
 * Sorgular senkron (expo-sqlite sync API) olduğu için ilk render'da veri hazırdır.
 */
export function useDbQuery<T>(query: () => T, deps: unknown[], tables: TableName[]): T {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ value: T; key: string }>(() => ({ value: query(), key: JSON.stringify(deps) + ':0' }));
  const key = JSON.stringify(deps) + ':' + version;

  useEffect(() => {
    return subscribe((changed) => {
      if (tables.some((t) => changed.has(t))) setVersion((v) => v + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(',')]);

  if (result.key !== key) {
    const value = query();
    // Render sırasında state güncellemek React'te izinli bir kalıp (türetilmiş state).
    setResult({ value, key });
    return value;
  }
  return result.value;
}
