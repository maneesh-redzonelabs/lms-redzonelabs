import { useQuery } from '@tanstack/react-query';
import { getRefList, REF_FALLBACKS, RefKey, RefRow } from '../api/reference';

export function useReferenceData(key: RefKey) {
  return useQuery({
    queryKey: ['ref', key],
    queryFn: async (): Promise<RefRow[]> => {
      try {
        const list = await getRefList(key);
        if (Array.isArray(list) && list.length) return list;
        return REF_FALLBACKS[key];
      } catch {
        // Endpoint not implemented yet or failed — fall back to static defaults
        // so forms remain usable while the backend catches up.
        return REF_FALLBACKS[key];
      }
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
