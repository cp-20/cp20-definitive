import { For } from 'solid-js';
import type { JSX } from '@solidjs/web';
import Icon, { type IconName } from '../components/Icon.tsx';
import Brand from '../components/Brand.tsx';
import Credits from '../components/Credits.tsx';
import QrCode from '../components/QrCode.tsx';
import { openModal } from '../components/Modal.tsx';
import profile from '../data/profile.json';
import { TAB_PATHS, sectionName, tabIndex } from './pages.ts';
// The index tabs, in TAB_PATHS order.
const tabs: Record<(typeof TAB_PATHS)[number], { label: string; icon: IconName }> = {
  '/': { label: 'ホーム', icon: 'Grid2x2' },
  '/works': { label: '作品', icon: 'Folder' },
  '/articles': { label: '記事', icon: 'FileText' },
  '/about': { label: 'プロフィール', icon: 'UserRound' },
};
// Every page ends with the same accounts as the profile, and the feed.
const footerLinks = [...profile.links, { name: 'RSS', url: '/feed.xml' }];
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
            <For each={footerLinks}>
              {(l) => (
                <a href={l.url}>
                  <Brand url={l.url} />
                  {l.name}
                </a>
              )}
            </For>
          </div>
          <div class="footer-bottom">
            <span>© 2026 cp20</span>
            <button
              type="button"
              class="footer-button"
              aria-haspopup="dialog"
              data-opens="qr"
              onClick={() => openModal('qr')}
            >
              <Icon name="QrCode" size={16} />
              QR コード
            </button>
            <button
              type="button"
              class="footer-button credits-open"
              aria-haspopup="dialog"
              onClick={() => openModal('credits')}
            >
              クレジット・ライセンス
            </button>
          </div>
        </footer>
        <Credits />
        <QrCode />
      </div>
    </>
  );
}
