import { For } from 'solid-js';
import Modal from './Modal.tsx';
import { mangaCovers } from '../data/editorial.ts';
import series from '../data/series.json';
// All image and material sources, in a dialog opened from the footer.
export default function Credits() {
  return (
    <Modal id="credits" title="クレジット・ライセンス">
      <dl class="credits">
        <dt>アイコン</dt>
        <dd>
          <a href="https://twitter.com/sora_douhu">空どうふ（@sora_douhu）</a>
        </dd>
        <dt>音楽</dt>
        <dd>
          <a href="https://2026.cp20.dev/featured-tracks">2026版のおすすめ曲</a>
          から。サムネイルは YouTube（各動画の投稿者）
        </dd>
        <dt>漫画の表紙</dt>
        <dd class="credits-list">
          <For each={series}>
            {(s) => (
              <span>
                {s.title}：
                <a href={mangaCovers[s.title]?.url ?? s.link}>{mangaCovers[s.title]?.source ?? s.credit}</a>
              </span>
            )}
          </For>
        </dd>
        <dt>作品・記事の画像</dt>
        <dd>各作品・記事の公開ページの OG 画像</dd>
        <dt>素材</dt>
        <dd>
          <a href="https://lucide.dev">Lucide</a>（ISC、一部は Feather 由来で MIT）、サービスのロゴは{' '}
          <a href="https://simpleicons.org">Simple Icons</a>（CC0）と各サービスのファビコン、シールの絵柄は{' '}
          <a href="https://github.com/jdecked/twemoji">Twemoji</a>（© Twitter, Inc and other contributors、
          <a href="/stamps/LICENSE-GRAPHICS.txt">CC BY 4.0</a>
          ）、文字のシールは Mochiy Pop One の字形、フォントは Yusei Magic / Zen Maru Gothic / IBM Plex
          Mono（どれも SIL OFL 1.1。IBM Plex Mono は Reserved Font Name のため「cp20
          Mono」と名前を変えて使用）
        </dd>
        <dt>ライブラリ</dt>
        <dd>
          SolidJS（MIT）、Firebase（Apache-2.0）ほか。
          <a href="/third-party-licenses.txt">ライセンス全文</a>
        </dd>
      </dl>
      <p class="meta">画像・楽曲・ロゴの権利は各権利者に帰属します。</p>
    </Modal>
  );
}
