import type { JSX } from '@solidjs/web';
import { HydrationScript } from '@solidjs/web';
import { pageInfo } from './route';
export default function Document(props: { children: JSX.Element }) {
  const info = pageInfo();
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{info.title}</title>
        <meta name="description" content={info.description} />
        <meta name="theme-color" content="#e8e9e3" />
        <link rel="canonical" href={`https://cp20.dev${info.path}`} />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="alternate" type="application/rss+xml" title="cp20.dev — Articles" href="/feed.xml" />
        <meta property="og:title" content={info.title} />
        <meta property="og:description" content={info.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://cp20.dev${info.path}`} />
        <script
          innerHTML={`try{const t=localStorage.getItem('cp20-theme');document.documentElement.dataset.theme=t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light'}catch{}`}
        />
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
