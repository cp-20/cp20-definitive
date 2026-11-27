// The Content-Security-Policy in public/_headers must let Cloudflare Web Analytics run: Cloudflare
// injects its beacon script into every page and the beacon reports to cloudflareinsights.com.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const csp = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1] ?? '';
const directive = (name: string) =>
  csp
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find(([n]) => n === name)
    ?.slice(1) ?? [];

describe('Content-Security-Policy', () => {
  it('loads the Web Analytics beacon', () => {
    expect(directive('script-src')).toContain('https://static.cloudflareinsights.com');
  });
  it('lets the beacon report', () => {
    expect(directive('connect-src')).toContain('https://cloudflareinsights.com');
  });
});
