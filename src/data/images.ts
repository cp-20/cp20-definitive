import { images } from 'virtual:cp20-media';
export const localImage = (source: string | null | undefined) => (source ? images[source] : undefined);
