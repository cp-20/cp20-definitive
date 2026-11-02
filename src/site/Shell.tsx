import { For } from 'solid-js';
import type { JSX } from '@solidjs/web';
import Icon, { type IconName } from '../components/Icon.tsx';
import Brand from '../components/Brand.tsx';
import Credits from '../components/Credits.tsx';
import { openModal } from '../components/Modal.tsx';
import { TAB_PATHS, sectionName, tabIndex } from './pages.ts';
// The index tabs, in TAB_PATHS order.
const tabs: Record<(typeof TAB_PATHS)[number], { label: string; icon: IconName }> = {
  '/': { label: 'ホーム', icon: 'Grid2x2' },
  '/works': { label: '作品', icon: 'Folder' },
  '/articles': { label: '記事', icon: 'FileText' },
  '/about': { label: 'プロフィール', icon: 'UserRound' },
};
export default function Shell(props: { path: string; children: JSX.Element }) {
  return (
    <>
      <a class="skip-link" href="#main">
        本文へスキップ
      </a>
      <div class="site-body" data-stamp-anchor="page" data-section={sectionName(props.path)}>
        <aside class="rail">
          <nav aria-label="メインナビゲーション">
            <For each={TAB_PATHS}>
              {(href, i) => (
                <a
                  href={href}
                  data-tab={sectionName(href)}
                  aria-current={tabIndex(props.path) === i() ? 'page' : undefined}
                >
                  <Icon name={tabs[href].icon} size={18} />
                  <span>{tabs[href].label}</span>
                </a>
              )}
            </For>
          </nav>
        </aside>
        <header class="site-header wrap" data-stamp-anchor="header">
          <a class="brand" href="/">
            <img src="/stamps/clover.svg" alt="" width="22" height="22" />
            cp20.dev
          </a>
        </header>
        <main id="main">{props.children}</main>
        <footer class="site-footer wrap" data-stamp-anchor="footer">
          <div class="footer-links">
            <a href="https://github.com/cp-20">
              <Brand url="https://github.com/cp-20" />
              GitHub
            </a>
            <a href="https://twitter.com/__cp20__">
              <Brand url="https://twitter.com/__cp20__" />Twitter
            </a>
            <a href="https://mixi.social/@cp20">
              <Brand url="https://mixi.social/@cp20" />
              mixi2
            </a>
            <a href="/feed.xml">
              <Brand url="/feed.xml" />
              RSS
            </a>
          </div>
          <div class="footer-bottom">
            <span>© 2026 cp20</span>
            <button type="button" class="credits-open" onClick={() => openModal('credits')}>
              クレジット・ライセンス
            </button>
          </div>
        </footer>
        <Credits />
      </div>
    </>
  );
}
