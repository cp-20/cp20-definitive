import { images, covers } from 'virtual:cp20-media';
export const localImage = (source: string | null | undefined) => (source ? images[source] : undefined);
/** A committed cover (`/images/covers/…`) with the srcset of its WebP copies. */
export const coverImage = (file: string) => ({ src: file, srcset: covers[file] as string | undefined });
