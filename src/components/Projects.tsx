import { createSignal, For } from 'solid-js';
import Icon from './Icon';
import { OGImage, OriginalIcon } from './Preview';
import { works } from '../data/content';
import { featuredIds } from '../data/editorial';
export const projects = featuredIds.map((id) => works.find((w) => w.id === id)!);
export default function Projects() {
  const [selected, setSelected] = createSignal(0);
  const [direction, setDirection] = createSignal<'next' | 'prev'>('next');
  let tabs!: HTMLDivElement;
  function choose(i: number, focus = false) {
    const next = (i + 3) % 3;
    if (next === selected()) return focus && (tabs.children[next] as HTMLButtonElement).focus();
    setDirection(i > selected() ? 'next' : 'prev');
    setSelected(next);
    if (focus) (tabs.children[next] as HTMLButtonElement).focus();
  }
  const keyboard = (e: KeyboardEvent) => {
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      choose(
        e.key === 'Home' ? 0 : e.key === 'End' ? 2 : selected() + (e.key === 'ArrowRight' ? 1 : -1),
        true,
      );
    }
  };
  // Horizontal swipe on touch screens; vertical scrolling stays native (touch-action: pan-y).
  let swipe = { x: 0, y: 0, id: -1 };
  const swipeStart = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.isPrimary) swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const swipeEnd = (e: PointerEvent) => {
    if (e.pointerId !== swipe.id) return;
    swipe.id = -1;
    const dx = e.clientX - swipe.x,
      dy = e.clientY - swipe.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) choose(selected() + (dx < 0 ? 1 : -1));
  };
  return (
    <section
      class="featured featured-editorial"
      aria-labelledby="featured-title"
      data-stamp-anchor="featured"
    >
      <div class="section-heading">
        <div>
          <p class="eyebrow">SELECTED WORKS · 3 / {works.length}</p>
          <h2 id="featured-title">主な3作品</h2>
        </div>
        <a href="/works" class="under-link">
          すべての作品<span class="meta">{works.length}</span>
          <Icon name="ArrowRight" size={16} />
        </a>
      </div>
      <div
        class="featured-selector"
        ref={tabs}
        role="tablist"
        aria-label="主な3作品"
        onKeyDown={keyboard}
        style={{ '--selected': selected() }}
      >
        <For each={projects}>
          {(p, i) => (
            <button
              id={`project-tab-${i()}`}
              class="featured-tab"
              role="tab"
              aria-selected={selected() === i() ? 'true' : 'false'}
              aria-controls={`project-${i()}`}
              tabindex={selected() === i() ? 0 : -1}
              onClick={() => choose(i())}
              data-project-tab={i()}
            >
              <span class="project-spot">
                <OriginalIcon url={p.url} name={p.title} />
                <span class="project-order">0{i() + 1}</span>
              </span>
              <span class="project-name">{p.title}</span>
              {p.id === 'minna-no-monosashi' && <small>NEW</small>}
            </button>
          )}
        </For>
      </div>
      <div
        class="project-deck"
        data-direction={direction()}
        onPointerDown={swipeStart}
        onPointerUp={swipeEnd}
        onPointerCancel={() => (swipe.id = -1)}
      >
        <For each={projects}>
          {(p, i) => (
            <article
              id={`project-${i()}`}
              class={['featured-project', { active: selected() === i() }]}
              data-stamp-anchor={`work-${p.id}`}
              role="tabpanel"
              aria-labelledby={`project-tab-${i()}`}
              aria-hidden={selected() === i() ? 'false' : 'true'}
              inert={selected() !== i()}
            >
              <a class="featured-image" href={p.url} aria-label={`${p.title}を開く`}>
                <OGImage url={p.url} alt={`${p.title}のOG画像`} priority={i() === 0} />
                <span class="image-open">
                  <Icon name="ArrowUpRight" size={21} />
                </span>
              </a>
              <div class="featured-copy">
                <p class="project-kind">{p.tags.join(' / ')}</p>
                <h3>
                  <OriginalIcon url={p.url} name={p.title} />
                  {p.title}
                </h3>
                <p class="project-description">{p.description}</p>
                <p class="project-stack">
                  {p.techStack
                    .filter((t) => ['language', 'framework', 'main'].includes(t.type))
                    .slice(0, 3)
                    .map((t) => t.label)
                    .join(' / ')}
                </p>
                <div class="project-links">
                  <a class="primary-button" href={p.url}>
                    作品を開く
                    <Icon name="ArrowUpRight" size={17} />
                  </a>
                  <a class="under-link" href={`/works/${p.id}`}>
                    制作について
                    <Icon name="ArrowRight" size={15} />
                  </a>
                </div>
              </div>
            </article>
          )}
        </For>
      </div>
      <div class="featured-bottom">
        <span class="project-page">
          0{selected() + 1} <span>/ 03</span>
        </span>
        <div class="deck-arrows">
          <button class="icon-button" aria-label="前の作品" onClick={() => choose(selected() - 1)}>
            <Icon name="ChevronLeft" size={18} />
          </button>
          <button class="icon-button" aria-label="次の作品" onClick={() => choose(selected() + 1)}>
            <Icon name="ChevronRight" size={18} />
          </button>
        </div>
      </div>
      <noscript
        innerHTML={`<p class="nojs-links">${projects.map((p) => `<a href="/works/${p.id}">${p.title}</a>`).join('')}</p>`}
      />
    </section>
  );
}
