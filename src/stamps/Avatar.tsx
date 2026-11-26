// A visitor's icon: their uploaded picture if they have one, else their pattern. The pattern is
// also the picture's background, so it shows while the picture loads and stays if there is none.
import { createSignal } from 'solid-js';
import { avatarUrl, patternIcon } from './avatar.ts';
// Accounts (at a picture version) found to have no picture: not asked for again on this visit.
const missing = new Set<string>();
/**
 * How to draw your own icon: `override` is a picture just chosen (an object URL), or null right
 * after going back to the pattern; `version` makes a changed picture load afresh.
 */
export type OwnAvatar = { version: number; override?: string | null };
export function Avatar(props: {
  uid: string;
  own?: OwnAvatar;
  class?: string;
  size: number;
  alt?: string;
  // Told whether a picture (true) or the pattern (false) is shown.
  onShown?: (picture: boolean) => void;
}) {
  const key = () => `${props.uid}:${props.own?.version ?? 0}`;
  const [failed, setFailed] = createSignal('');
  const pattern = () => patternIcon(props.uid);
  const src = () =>
    props.own?.override === null
      ? pattern()
      : (props.own?.override ??
        (missing.has(key()) || failed() === key() ? pattern() : avatarUrl(props.uid, props.own?.version)));
  return (
    <img
      class={props.class}
      src={src()}
      alt={props.alt ?? ''}
      width={props.size}
      height={props.size}
      draggable={false}
      style={{ 'background-image': `url("${pattern()}")` }}
      onLoad={() => props.onShown?.(!src().startsWith('data:'))}
      onError={() => {
        missing.add(key());
        setFailed(key());
      }}
    />
  );
}
