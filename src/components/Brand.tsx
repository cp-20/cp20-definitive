// Service logos beside links, so a link is recognised by its icon before its label is read.
// The files live in public/images/brands (Simple Icons, CC0, plus each service's own favicon), so
// the client bundle only carries their paths.
const brands: Record<string, string> = {
  'github.com': 'github.svg',
  'twitter.com': 'x.svg',
  'x.com': 'x.svg',
  'mixi.social': 'mixi2.svg',
  'zenn.dev': 'zenn.svg',
  'qiita.com': 'qiita.svg',
  'note.com': 'note.svg',
  'trap.jp': 'trap.png',
  'sizu.me': 'sizu.png',
  'blog.cp20.dev': 'cp20-blog.svg',
  'speakerdeck.com': 'speakerdeck.svg',
  'm3tech.blog': 'm3tech.png',
  '/feed.xml': 'rss.svg',
};
/** The logo for a URL, a bare host name (an article's source) or the feed's path, if there is one. */
export function brandIcon(url: string) {
  const host = URL.canParse(url) ? new URL(url).hostname : url;
  const file = brands[host.replace(/^www\./, '')];
  return file && `/images/brands/${file}`;
}
export default function Brand(props: { url: string; size?: number }) {
  const src = brandIcon(props.url);
  return (
    src && <img class="brand-icon" src={src} alt="" width={props.size ?? 16} height={props.size ?? 16} />
  );
}
