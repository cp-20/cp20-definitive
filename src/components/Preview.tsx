import { createSignal, Show } from 'solid-js';
import data from '../data/previews.json';
import { localImage } from '../data/images';
export type PreviewData = {
  image: string | null;
  icon: string | null;
  width: number;
  height: number;
  checkedAt: string;
};
export const previews = data as Record<string, PreviewData>;
export function previewFor(url: string) {
  return previews[url];
}
export function OriginalIcon(props: { url: string; name: string }) {
  const [failed, setFailed] = createSignal(false);
  return (
    <Show when={localImage(previewFor(props.url)?.icon)}>
      <img
        class="original-icon"
        style={{ visibility: failed() ? 'hidden' : 'inherit' }}
        src={localImage(previewFor(props.url)?.icon)}
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
export function OGImage(props: { url: string; alt: string; priority?: boolean }) {
  const [failed, setFailed] = createSignal(false);
  return (
    <div
      class={['og-image', { unavailable: !localImage(previewFor(props.url)?.image) || failed() }]}
      style={{
        '--image-ratio': `${previewFor(props.url)?.width || 1200} / ${previewFor(props.url)?.height || 630}`,
      }}
    >
      <Show
        when={localImage(previewFor(props.url)?.image) && !failed()}
        fallback={<span class="og-unavailable">{new URL(props.url).hostname}</span>}
      >
        <img
          src={localImage(previewFor(props.url)?.image)}
          alt={props.alt}
          width={previewFor(props.url)?.width || 1200}
          height={previewFor(props.url)?.height || 630}
          loading={props.priority ? 'eager' : 'lazy'}
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
