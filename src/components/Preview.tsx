import { createSignal, onSettled, Show } from 'solid-js';
import { isServer } from '@solidjs/web';
import { pages } from 'virtual:cp20-media';
// Upper bounds of the laid-out image widths (measured at 320-1920px wide viewports, and checked
// by scripts/qa/browser-check.ts; see the --thumb, grid, .bookshelf, .music-list and .home-favorites rules).
export const sizes = {
  articleRow: '(max-width: 380px) 124px, (max-width: 760px) 136px, 232px',
  workGrid: '(max-width: 760px) calc(100vw - 100px), (max-width: 1100px) calc(50vw - 170px), 290px',
  featured:
    '(max-width: 760px) calc(100vw - 104px), (max-width: 900px) calc(100vw - 300px), (max-width: 1100px) calc(55vw - 200px), 470px',
  workHero: '(max-width: 760px) calc(100vw - 120px), (max-width: 1100px) calc(100vw - 300px), 930px',
  // The open book on the /about shelf (spines show a strip of the same image).
  bookCover: '(max-width: 460px) 230px, (max-width: 760px) calc(100vw - 230px), 216px',
  homeCover: '92px',
  homeTrack: '134px',
  track: '(max-width: 760px) calc(100vw - 88px), (max-width: 1100px) calc(50vw - 160px), 292px',
};
// Works in the first row of the works grid (three columns on wide screens) skip lazy loading.
export const firstRowWorks = 3;
export function previewFor(url: string) {
  return pages[url];
}
/**
 * `srcset` and `sizes` for an <img> (both or neither). The server-rendered HTML carries them, so
 * the first load picks a small variant; on the client they are applied by `ref` once the page
 * has settled, not while Solid is still building it. In Chromium an image given its srcset
 * during that build stayed registered for viewport changes after its page was swapped out, so
 * every page visited stayed in memory (the leak check in scripts/qa/browser-check.ts catches this).
 */
export function responsive(srcset: string | undefined, sizes: string | undefined) {
  const set = srcset && sizes ? { srcset, sizes } : undefined;
  return {
    srcset: isServer ? set?.srcset : undefined,
    sizes: isServer ? set?.sizes : undefined,
    ref: (img: HTMLImageElement) => {
      if (set)
        onSettled(() => {
          img.sizes = set.sizes;
          img.srcset = set.srcset;
        });
    },
  };
}
/**
 * The site's own icon. With `placeholder`, a work without one gets a badge with its initial
 * in the same space, so titles in a list start at the same position.
 */
export function OriginalIcon(props: { url: string; name: string; placeholder?: boolean }) {
  const [failed, setFailed] = createSignal(false);
  return (
    <Show
      when={previewFor(props.url)?.icon}
      fallback={
        props.placeholder && (
          <span class="original-icon icon-placeholder" aria-hidden="true">
            {props.name.trim().charAt(0).toUpperCase()}
          </span>
        )
      }
    >
      <img
        class="original-icon"
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
  /** The image is an app icon (works.json `imageKind: "icon"`), not an OG card. */
  icon?: boolean;
  priority?: boolean;
  eager?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = createSignal(false);
  const icon = () => Boolean(props.icon);
  const image = responsive(props.sizes && previewFor(props.url)?.srcset, props.sizes);
  return (
    <div
      class={['og-image', { unavailable: !previewFor(props.url)?.image || failed(), icon: icon() }]}
      style={
        icon()
          ? { '--icon-size': `${previewFor(props.url)?.width}px` }
          : {
              '--image-ratio': `${previewFor(props.url)?.width || 1200} / ${previewFor(props.url)?.height || 630}`,
            }
      }
    >
      <Show
        when={previewFor(props.url)?.image && !failed()}
        fallback={<span class="og-unavailable">{new URL(props.url).hostname}</span>}
      >
        <img
          src={previewFor(props.url)?.image}
          ref={image.ref}
          srcset={image.srcset}
          sizes={image.sizes}
          alt={props.alt}
          width={previewFor(props.url)?.width || 1200}
          height={previewFor(props.url)?.height || 630}
          loading={props.priority || props.eager ? 'eager' : 'lazy'}
          fetchpriority={props.priority ? 'high' : 'auto'}
          referrerpolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </Show>
    </div>
  );
}
export const articleAnchor = (url: string) => {
  let hash = 2166136261;
  for (const c of url) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `article-${(hash >>> 0).toString(36)}`;
};
// "2023/09/25 ～ 2023/10/13" → "2023.09.25", ISO dates → "2026.07.20".
export const postmarkDate = (value: string) => {
  const m = value.match(/(\d{4})[/-](\d{2})(?:[/-](\d{2}))?/);
  return m ? [m[1], m[2], m[3]].filter(Boolean).join('.') : '';
};
// A cancellation mark stamped across a postage-stamp image.
export function Postmark(props: { date: string; top: string; bottom: string }) {
  return (
    <span class="postmark" aria-hidden="true">
      <span class="postmark-top">{props.top}</span>
      <span class="postmark-date">{props.date}</span>
      <span class="postmark-bottom">{props.bottom}</span>
    </span>
  );
}
