import type { JSX } from '@solidjs/web';
import { HydrationScript } from '@solidjs/web';
import { pageInfo } from './site/route.ts';
import { canonicalUrl } from './site/pages.ts';
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
        <link rel="alternate" type="application/rss+xml" title="cp20.dev — Articles" href="/feed.xml" />
        <meta property="og:title" content={info.title} />
        <meta property="og:description" content={info.description} />
        <meta property="og:type" content="website" />
        {info.found && <meta property="og:url" content={canonicalUrl(info.path)} />}
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
