import { createSignal, Show } from 'solid-js';
import { pages } from 'virtual:cp20-media';
import { isIconImage } from '../data/icon-image.mjs';
// Upper bounds of the rendered OG image widths (measured at 390-1920px wide viewports; see the
// --thumb and grid rules in app.css).
export const sizes = {
  articleRow: '(max-width: 760px) 104px, 144px',
  workGrid: '(max-width: 760px) 72vw, 340px',
  featured: '(max-width: 900px) 72vw, 466px',
  workHero: '(max-width: 1100px) 70vw, 924px',
};
// Works in the first row of the works grid (three columns on wide screens) skip lazy loading.
export const firstRowWorks = 3;
export function previewFor(url: string) {
  return pages[url];
}
export function OriginalIcon(props: { url: string; name: string }) {
  const [failed, setFailed] = createSignal(false);
  return (
    <Show when={previewFor(props.url)?.icon}>
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
  priority?: boolean;
  eager?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = createSignal(false);
  const icon = () => isIconImage(previewFor(props.url));
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
          srcset={props.sizes && !icon() ? previewFor(props.url)?.srcset : undefined}
          sizes={props.sizes && !icon() && previewFor(props.url)?.srcset ? props.sizes : undefined}
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
