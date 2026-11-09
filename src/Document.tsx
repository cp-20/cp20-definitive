import type { JSX } from '@solidjs/web';
import { HydrationScript } from '@solidjs/web';
import { pageInfo } from './site/route.ts';
import { FEED, OG_IMAGE, canonicalUrl } from './site/pages.ts';
export default function Document(props: { children: JSX.Element }) {
  const info = pageInfo();
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{info.title}</title>
        <meta name="description" content={info.description} />
        <meta name="theme-color" content="#cfe7c4" />
        {info.found ? (
          <link rel="canonical" href={canonicalUrl(info.path)} />
        ) : (
          <meta name="robots" content="noindex" />
        )}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="alternate" type="application/rss+xml" title={FEED.title} href={FEED.path} />
        <meta property="og:title" content={info.title} />
        <meta property="og:description" content={info.description} />
        <meta property="og:type" content="website" />
        {info.found && <meta property="og:url" content={canonicalUrl(info.path)} />}
        <meta property="og:image" content={canonicalUrl(OG_IMAGE.path)} />
        <meta property="og:image:width" content={String(OG_IMAGE.width)} />
        <meta property="og:image:height" content={String(OG_IMAGE.height)} />
        <meta property="og:image:alt" content="しーぴー（cp20）のアイコンと名前、実績" />
        <meta name="twitter:card" content="summary_large_image" />
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
