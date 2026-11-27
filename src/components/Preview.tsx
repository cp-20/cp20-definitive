import { createSignal, isHydrating, onSettled, Show } from 'solid-js';
import { isServer, type JSX } from '@solidjs/web';
import { pages } from 'virtual:cp20-media';
import { avifSrcset } from '../content/media.ts';
// Upper bounds of the laid-out image widths (measured at 320-1920px wide viewports, and checked
// by scripts/qa/browser-check.ts; see the --thumb, grid, .bookshelf, .music-list and .home-favorites rules).
export const sizes = {
  articleRow: '(max-width: 600px) 128px, (max-width: 1199px) 148px, 160px',
  // WorkCard.tsx and a work's page (src/styles/works.css): a featured card (three across, then a
  // row), a list card's stamp, the page's picture and the phone screen on it.
  workCard: '(max-width: 760px) 96px, (max-width: 1000px) 224px, 300px',
  workThumb: '(max-width: 760px) 92px, 140px',
  workHero: '(max-width: 760px) calc(100vw - 74px), (max-width: 1000px) 560px, 440px',
  workPhone: '136px',
  // The open book on the /about shelf (spines show a corner of the same image).
  bookCover: '(max-width: 760px) 176px, 222px',
  homeCover: '92px',
  // On a phone the song's stamp takes the note's width beside the cover (the cover's column at
  // least 84px, and the note no wider than 420px).
  homeTrack: '(max-width: 480px) calc(100vw - 214px), (max-width: 760px) 266px, 134px',
  track: '(max-width: 760px) calc(50vw - 52px), (max-width: 1100px) calc(50vw - 160px), 292px',
};
export function previewFor(url: string) {
  return pages[url];
}
/**
 * `src`, `srcset` and `sizes` for an <img> (srcset and sizes both or neither). The server-rendered
 * HTML carries them, so the first load picks a small variant; on the client they are applied by
 * `ref` once the page has settled, not while Solid is still building it. In Chromium an image
 * given its srcset during that build stayed registered for viewport changes after its page was
 * swapped out, so every page visited stayed in memory (the leak check in
 * scripts/qa/browser-check.ts catches this). The src waits with them: given at once, an eager
 * picture (a featured work's) fetched its full-size original before its srcset arrived.
 */
export function responsive(src: string | undefined, srcset: string | undefined, sizes: string | undefined) {
  const set = srcset && sizes ? { srcset, sizes } : undefined;
  // Hydration keeps the server's elements with their attributes, and also builds elements it then
  // drops: a detached image still loads, so while hydrating nothing is given at first, and only an
  // element that is on the page once settled and lacks them gets them.
  const hydrating = !isServer && isHydrating();
  // Only a picture with a srcset waits for the page to settle (onSettled during hydration takes an
  // owner the server does not: the hydration keys after it would no longer match).
  if (!set) return { src, srcset: undefined, sizes: undefined, ref: undefined };
  return {
    src: isServer ? src : undefined,
    srcset: isServer ? set.srcset : undefined,
    sizes: isServer ? set.sizes : undefined,
    ref: (img: HTMLImageElement | HTMLSourceElement) =>
      onSettled(() => {
        if (hydrating && (!img.isConnected || img.hasAttribute('srcset'))) return;
        img.sizes = set.sizes;
        img.srcset = set.srcset;
        if (src && img instanceof HTMLImageElement) img.src = src;
      }),
  };
}
/**
 * Offers the AVIF copies of a picture (about 60% of the WebP's bytes) in a <picture> around its
 * <img>: `srcset` is the <img>'s WebP srcset, as AVIF copies by the same `sizes` (applied like
 * `responsive`), or `avif` the AVIF copy of a picture shown without a srcset. A browser that cannot
 * read AVIF keeps the <img>'s own.
 * Only on the page as served (and hydrated): a page built later by in-app navigation shows the
 * <img> alone, with its WebP copies (fetched ahead by src/site/warm.ts). Chromium kept every page
 * swapped out that had a client-built <picture>, with or without sources or srcsets, as it did
 * for client-built srcsets before (scripts/qa/browser-check.ts checks the memory).
 */
export function Avif(props: { srcset?: string; sizes?: string; avif?: string; children: JSX.Element }) {
  if (!isServer && !isHydrating()) return props.children;
  if (props.avif)
    return (
      <picture>
        <source type="image/avif" srcset={props.avif} />
        {props.children}
      </picture>
    );
  const set = responsive(undefined, avifSrcset(props.srcset), props.sizes);
  return (
    <picture>
      <source type="image/avif" srcset={set.srcset} sizes={set.sizes} ref={set.ref} />
      {props.children}
    </picture>
  );
}
/** The site's own icon, when it has one. */
export function OriginalIcon(props: { url: string; inset?: boolean }) {
  const [failed, setFailed] = createSignal(false);
  return (
    <Show when={previewFor(props.url)?.icon}>
      <img
        class="original-icon"
        data-inset={props.inset || undefined}
        style={{ visibility: failed() ? 'hidden' : 'inherit' }}
        src={previewFor(props.url)?.icon}
        alt=""
        aria-hidden="true"
        width="32"
        height="32"
        loading="lazy"
        referrerpolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </Show>
  );
}
/**
 * `sizes` is the CSS width the image is shown at, so the browser can pick a small WebP variant
 * instead of the full-size original; without it only the original is offered.
 * `priority` loads it eagerly with high priority (the largest image in the first view);
 * `eager` only skips lazy loading (other images in the first view).
 */
export function OGImage(props: {
  url: string;
  alt: string;
  priority?: boolean;
  eager?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = createSignal(false);
  const image = responsive(
    previewFor(props.url)?.image,
    props.sizes && previewFor(props.url)?.srcset,
    props.sizes,
  );
  return (
    <div
      class={['og-image', { unavailable: !previewFor(props.url)?.image || failed() }]}
      style={{
        '--image-ratio': `${previewFor(props.url)?.width || 1200} / ${previewFor(props.url)?.height || 630}`,
      }}
    >
      <Show
        when={previewFor(props.url)?.image && !failed()}
        fallback={<span class="og-unavailable">{new URL(props.url).hostname}</span>}
      >
        <Avif srcset={props.sizes && previewFor(props.url)?.srcset} sizes={props.sizes}>
          <img
            loading={props.priority || props.eager ? 'eager' : 'lazy'}
            src={image.src}
            ref={image.ref}
            srcset={image.srcset}
            sizes={image.sizes}
            alt={props.alt}
            width={previewFor(props.url)?.width || 1200}
            height={previewFor(props.url)?.height || 630}
            fetchpriority={props.priority ? 'high' : 'auto'}
            referrerpolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        </Avif>
      </Show>
    </div>
  );
}
export const articleAnchor = (url: string) => {
  let hash = 2166136261;
  for (const c of url) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `article-${(hash >>> 0).toString(36)}`;
};
