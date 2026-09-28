import { createSignal, onSettled, For } from 'solid-js';
import type { JSX } from '@solidjs/web';
import Icon, { type IconName } from './Icon';
import { StampButton } from './Stamps';
const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'ホーム', icon: 'Grid2x2' },
  { href: '/works', label: '作品', icon: 'Folder' },
  { href: '/articles', label: '記事', icon: 'FileText' },
  { href: '/about', label: 'プロフィール', icon: 'UserRound' },
];
export default function Shell(props: { path: string; children: JSX.Element }) {
  const [theme, setTheme] = createSignal('light');
  onSettled(() => {
    setTheme(document.documentElement.dataset.theme || 'light');
  });
  function toggleTheme() {
    const next = theme() === 'light' ? 'dark' : 'light';
    setTheme(next);
    // Color-only update: no View Transition, root transform, reflow or font changes.
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('cp20-theme', next);
    } catch {}
  }
  return (
    <>
      <a class="skip-link" href="#main">
        本文へスキップ
      </a>
      <aside class="rail">
        <a href="/" class="rail-logo" aria-label="cp20.dev ホーム">
          <Icon name="Clover" size={28} />
        </a>
        <nav aria-label="メインナビゲーション">
          <For each={navigation}>
            {(n) => (
              <a
                href={n.href}
                aria-current={
                  (n.href === '/' ? props.path === '/' : props.path.startsWith(n.href)) ? 'page' : undefined
                }
              >
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </a>
            )}
          </For>
        </nav>
        <div class="rail-bottom">
          <button
            class="icon-button theme-toggle"
            aria-label="配色を切り替える"
            aria-pressed={theme() === 'dark' ? 'true' : 'false'}
            onClick={toggleTheme}
          >
            <Icon name="SunMoon" />
          </button>
        </div>
      </aside>
      <div class="site-body" data-stamp-anchor="page">
        <header class="site-header wrap" data-stamp-anchor="header">
          <a class="brand" href="/">
            cp20.dev<span class="edition-label">DEFINITIVE EDITION</span>
          </a>
          <StampButton />
        </header>
        <main id="main">{props.children}</main>
        <footer class="site-footer wrap" data-stamp-anchor="footer">
          <div class="footer-links">
            <a href="https://github.com/cp-20">
              GitHub
              <Icon name="ArrowUpRight" size={14} />
            </a>
            <a href="https://twitter.com/__cp20__">
              X / Twitter
              <Icon name="ArrowUpRight" size={14} />
            </a>
            <a href="https://mixi.social/@cp20">
              mixi2
              <Icon name="ArrowUpRight" size={14} />
            </a>
            <a href="/feed.xml">
              RSS
              <Icon name="ArrowUpRight" size={14} />
            </a>
          </div>
          <div class="footer-bottom">
            <span>© 2026 cp20</span>
            <span>
              icon by <a href="https://twitter.com/sora_douhu">@sora_douhu</a> ·{' '}
              <a href="https://lucide.dev">Lucide</a> ·{' '}
              <a href="https://github.com/jdecked/twemoji">Twemoji</a>
            </span>
            <a href="#main">先頭へ ↑</a>
          </div>
        </footer>
      </div>
    </>
  );
}
