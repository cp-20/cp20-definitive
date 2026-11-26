// The icon beside a visitor's stickers. A visitor may upload a picture of their own: it is cut
// to a square, shrunk and stored at avatars/<uid> in Cloud Storage, where anyone can read it.
// Without one, the icon is a pattern drawn from the account's ID, so nothing derived from the
// visitor's email address or Google profile is ever shown.
import config from '../data/firebase.json' with { type: 'json' };

/** The largest an icon is shown, in CSS pixels (the icon editor's; app.css .avatar-editor-icon). */
export const AVATAR_SHOWN_MAX = 56;
/** The stored picture's side in pixels: twice the largest icon shown, sharp on a 2x screen. */
export const AVATAR_SIDE = AVATAR_SHOWN_MAX * 2;
/** The most bytes a stored picture may have (storage.rules allows a little more). */
export const AVATAR_MAX_BYTES = 48 * 1024;
/** Pictures bigger than this are not even decoded. */
export const AVATAR_MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const avatarPath = (uid: string) => `avatars/${uid}`;
const objectUrl = (uid: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${encodeURIComponent(avatarPath(uid))}`;
/** The public URL of `uid`'s picture; `version` makes a just-changed picture load afresh. */
export const avatarUrl = (uid: string, version = 0) =>
  `${objectUrl(uid)}?alt=media${version ? `&v=${version}` : ''}`;
/** The Storage API URL of `uid`'s picture, for deleting it. */
export const avatarObjectUrl = objectUrl;

/**
 * The request that stores `picture` as `uid`'s icon: a multipart upload, so the picture goes up
 * with its metadata (the browser caches a picture for five minutes, so a change spreads soon).
 * `base` is the Storage API's origin (the emulator's in tests).
 */
export function avatarUpload(
  uid: string,
  picture: Blob,
  token: string,
  base = 'https://firebasestorage.googleapis.com',
) {
  const boundary = `cp20-${crypto.randomUUID()}`;
  const metadata = { name: avatarPath(uid), contentType: picture.type, cacheControl: 'public, max-age=300' };
  return {
    url: `${base}/v0/b/${config.storageBucket}/o?name=${encodeURIComponent(metadata.name)}`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Firebase ${token}`,
        'X-Goog-Upload-Protocol': 'multipart',
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: ${picture.type}\r\n\r\n`,
        picture,
        `\r\n--${boundary}--`,
      ]),
    } satisfies RequestInit,
  };
}

// FNV-1a: a small, stable hash; the pattern only has to look different per account.
function fnv(text: string, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
// The site's inks, as on the stickers themselves.
const INKS = ['#d1402c', '#3f7fbf', '#3d9a6a', '#c47a12', '#8a56b8', '#d4567f', '#2f8f9d'];

/**
 * The pattern icon of `uid`: a 5×5 grid mirrored left to right, in one of the site's inks on
 * paper, as an SVG data URI.
 */
export function patternIcon(uid: string) {
  const bits = fnv(uid);
  const ink = INKS[fnv(uid, 0x1234567) % INKS.length];
  let cells = '';
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 3; col++)
      if ((bits >>> (row * 3 + col)) & 1)
        for (const x of new Set([col, 4 - col]))
          cells += `<rect x="${x + 1}" y="${row + 1}" width="1" height="1"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7" shape-rendering="crispEdges"><rect width="7" height="7" fill="#fffdf6"/><g fill="${ink}">${cells}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Why a picture could not be made into an icon, as said to the visitor. */
export class AvatarError extends Error {}

/**
 * The picture in `file` as an icon: the middle square, AVATAR_SIDE pixels on a side, on paper
 * (so a transparent picture never shows the pattern through), as WebP or, where the browser
 * cannot encode WebP (older Safari), JPEG. Quality steps down until it fits AVATAR_MAX_BYTES.
 */
export async function compressAvatar(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new AvatarError('画像ファイルを選んでください');
  if (file.size > AVATAR_MAX_INPUT_BYTES) throw new AvatarError('20MB 以下の画像を選んでください');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarError('この画像は読み込めませんでした');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_SIDE;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fffdf6';
  context.fillRect(0, 0, AVATAR_SIDE, AVATAR_SIDE);
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIDE,
    AVATAR_SIDE,
  );
  bitmap.close();
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  for (const quality of [0.85, 0.7, 0.5]) {
    let blob = await encode('image/webp', quality);
    if (blob?.type !== 'image/webp') blob = await encode('image/jpeg', quality);
    if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
  }
  throw new AvatarError('この画像は小さくできませんでした');
}
