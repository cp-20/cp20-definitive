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
