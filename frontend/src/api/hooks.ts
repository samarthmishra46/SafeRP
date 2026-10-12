import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { fetchHeatmap, planTrip, searchPlaces } from './client';

export function usePlaceSearch(query: string, country: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['geocode', country, q.toLowerCase()],
    queryFn: ({ signal }) => searchPlaces(q, country, signal),
    enabled: q.length >= 2,
    staleTime: 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function usePlanTrip() {
  return useMutation({ mutationKey: ['plan'], mutationFn: planTrip });
}

export function useHeatmap(bbox: number[] | undefined) {
  return useQuery({
    queryKey: ['heatmap', bbox],
    queryFn: ({ signal }) => fetchHeatmap(bbox!, signal),
    enabled: Boolean(bbox),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
