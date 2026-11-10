import { createSignal } from 'solid-js';
import { shots } from 'virtual:cp20-media';
import Icon from './Icon.tsx';
import { brandIcon } from './Brand.tsx';
import { OGImage, previewFor, responsive, sizes } from './Preview.tsx';
import { SOLO_ROLE, kindLabel, longPeriod, openLink, statusTag, type Work } from '../content/works.ts';
import { plain } from '../content/phrase-marks.ts';

/**
 * A work's picture as a postage stamp on its page: the screenshot of its site for `device` when
 * there is one, else (for 'pc') its OG image. `describe` gives a screenshot its alt text; an OG
 * image, which mostly repeats the work's name beside it, stays decorative.
 */
export function WorkImage(props: {
  work: Work;
  sizes: string;
  device?: 'pc' | 'mobile';
  describe?: boolean;
  priority?: boolean;
  eager?: boolean;
}) {
  const shot = props.work.screenshots?.find((s) => s.device === (props.device ?? 'pc'));
  const file = shot && shots[shot.src];
  if (!shot || !file)
    return props.device === 'mobile' ? undefined : (
      <OGImage
        url={props.work.url}
        alt=""
        sizes={props.sizes}
        priority={props.priority}
        eager={props.eager}
      />
    );
  const image = responsive(file.srcset, props.sizes);
  return (
    <div class="og-image work-shot" style={{ '--image-ratio': `${file.width} / ${file.height}` }}>
      <img
        src={shot.src}
        ref={image.ref}
        srcset={image.srcset}
        sizes={image.sizes}
        alt={props.describe ? shot.alt : ''}
        width={file.width}
        height={file.height}
        loading={props.priority || props.eager ? 'eager' : 'lazy'}
        fetchpriority={props.priority ? 'high' : 'auto'}
      />
    </div>
  );
}

/** The site's own icon beside a work's name, only when it has one (no stand-in letter). */
function SiteIcon(props: { work: Work }) {
  const [failed, setFailed] = createSignal(false);
  const icon = previewFor(props.work.url)?.icon;
  return (
    icon && (
      <img
        class="work-icon"
        data-inset={props.work.iconInset || undefined}
        style={{ visibility: failed() ? 'hidden' : 'inherit' }}
        src={icon}
        alt=""
        width="24"
        height="24"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    )
  );
}

/**
 * Where a card's own button goes, said by the place itself: a repository by its GitHub path, a
 * site by its host name, each with that place's icon (a service's logo, or the work's own icon for
 * its own site).
 */
function destination(href: string, work: Pick<Work, 'url'>) {
  const url = new URL(href);
  const github = url.hostname === 'github.com';
  return {
    text: github ? url.pathname.slice(1).replace(/\/$/, '') : url.hostname.replace(/^www\./, ''),
    icon: brandIcon(href) ?? (href === work.url ? previewFor(work.url)?.icon : undefined),
  };
}

/** A result's mark, in the ink of an award (the same kind of drawing as the history's marks). */
export const OutcomeMark = () => (
  <span class="outcome-mark">
    <Icon name="Sparkles" size={16} stroke={2} />
  </span>
);

/**
 * A work's result, its last few words after a space (9月の月間賞, 3,912 → 9,245) kept on one line,
 * so a narrow card breaks before them instead of splitting them.
 */
function Outcome(props: { text: string }) {
  const tail = /\s(\S+)$/.exec(props.text);
  if (!tail || plain(tail[1]).length > 6) return <span>{props.text}</span>;
  return (
    <span>
      {props.text.slice(0, tail.index + 1)}
      <span class="nowrap">{tail[1]}</span>
    </span>
  );
}

/**
 * One work, linking to its page (the whole card is the link; a large card's small button opens the
 * work itself). Its sticker anchor is `work-<id>`.
 * - large: a featured work. Its picture, what it is, the result and the button that opens it (a
 *   small picture beside the text on phones).
 * - small: a work in a list. A small picture beside its name, what it is, the result, and who
 *   made it with whom or how long it took when that is not plain from the list (but not when, for
 *   a `featured` work, as on the featured cards).
 * - row: one line with the icon (or a small picture), the name and what it is.
 */
export default function WorkCard(props: {
  work: Work;
  variant?: 'large' | 'small' | 'row';
  priority?: boolean;
  eager?: boolean;
  featured?: boolean;
}) {
  const w = props.work;
  const variant = props.variant ?? 'small';
  const href = `/works/${w.id}`;
  if (variant === 'row')
    return (
      <a class="work-row" href={href} data-stamp-anchor={`work-${w.id}`}>
        <span class="work-row-picture" aria-hidden="true">
          {previewFor(w.url)?.icon ? (
            <span class="og-image work-row-icon">
              <img src={previewFor(w.url)?.icon} alt="" width="36" height="36" loading="lazy" />
            </span>
          ) : (
            <OGImage url={w.url} alt="" sizes={sizes.workRow} />
          )}
        </span>
        <span class="work-row-name">{w.title}</span>
        <span class="work-row-description">{w.description}</span>
      </a>
    );
  const open = variant === 'large' ? openLink(w) : undefined;
  const meta = [
    w.kind === 'event' ? undefined : kindLabel(w),
    w.role && w.role !== SOLO_ROLE ? w.role : undefined,
    props.featured ? undefined : longPeriod(w.productionTime),
  ].filter(Boolean);
  const tag = statusTag(w);
  return (
    <article class={['work-card', `work-card-${variant}`]} data-stamp-anchor={`work-${w.id}`}>
      <div class="work-card-picture">
        <OGImage
          url={w.url}
          alt=""
          sizes={variant === 'large' ? sizes.workCard : sizes.workThumb}
          priority={props.priority}
          eager={props.eager}
        />
      </div>
      <div class="work-card-text">
        <h3>
          <a class="work-card-link" href={href}>
            <SiteIcon work={w} />
            {w.title}
            <Icon name="ChevronRight" size={18} stroke={2.2} class="work-card-chevron" />
          </a>
          {tag && <span class="status-tag">{tag}</span>}
        </h3>
        <p class="work-card-description">{w.description}</p>
        {w.outcome && (
          <p class="work-outcome">
            <OutcomeMark />
            {/* One flex item beside the mark, so the kept words wrap with the rest. */}
            <Outcome text={w.outcome} />
          </p>
        )}
        {variant === 'small' && meta.length > 0 && (
          <p class="work-card-meta">
            {meta.map((part) => (
              <span>{part}</span>
            ))}
          </p>
        )}
        {open && (
          <div class="work-card-foot">
            {(() => {
              const to = destination(open.href, w);
              return (
                <a class="work-card-open" href={open.href} aria-label={`${open.label} ${to.text}`}>
                  {to.icon && <img src={to.icon} alt="" width="18" height="18" />}
                  <span>{to.text}</span>
                  <Icon name="ArrowUpRight" size={15} />
                </a>
              );
            })()}
          </div>
        )}
      </div>
    </article>
  );
}
