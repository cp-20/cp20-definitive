import cache from './image-cache.json';
export const localImage = (source: string | null | undefined) =>
  source ? (cache as Record<string, { file: string }>)[source]?.file : undefined;
