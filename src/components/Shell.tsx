import { For } from 'solid-js';
import type { JSX } from '@solidjs/web';
import Icon, { type IconName } from './Icon';
const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'ホーム', icon: 'Grid2x2' },
  { href: '/works', label: '作品', icon: 'Folder' },
  { href: '/articles', label: '記事', icon: 'FileText' },
  { href: '/about', label: 'プロフィール', icon: 'UserRound' },
];
export default function Shell(props: { path: string; children: JSX.Element }) {
  const section = () =>
    props.path === '/' ? 'home' : props.path.startsWith('/works') ? 'works' : props.path.slice(1) || 'home';
  return (
    <>
      <a class="skip-link" href="#main">
        本文へスキップ
      </a>
      <div class="site-body" data-stamp-anchor="page" data-section={section()}>
        <aside class="rail">
          <nav aria-label="メインナビゲーション">
            <For each={navigation}>
              {(n) => {
                const tab = n.href === '/' ? 'home' : n.href.slice(1);
                return (
                  <a
                    href={n.href}
                    data-tab={tab}
                    aria-current={
                      (n.href === '/' ? props.path === '/' : props.path.startsWith(n.href))
                        ? 'page'
                        : undefined
                    }
                  >
                    <Icon name={n.icon} size={18} />
                    <span>{n.label}</span>
                  </a>
                );
              }}
            </For>
          </nav>
        </aside>
        <header class="site-header wrap" data-stamp-anchor="header">
          <a class="brand" href="/">
            <img src="/stamps/clover.svg" alt="" width="22" height="22" />
            cp20.dev<span class="edition-label">definitive</span>
          </a>
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
            <a href="/about#credits">クレジット・出典</a>
          </div>
        </footer>
      </div>
    </>
  );
}
