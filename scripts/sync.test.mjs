import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeArticles, parseFeed, collect, paginated, safeUrl } from './sync.mjs';
const old = { title:'Old', url:'https://zenn.dev/cp20/articles/a', source:'zenn.dev', date:'2024-01-01T00:00:00.000Z' };
test('RSS, archive preservation, manual precedence, exclusions, unsafe input, pagination and partial outages', async () => {
 const parsed = parseFeed('<rss><channel><item><title><![CDATA[A & B]]></title><link>https://note.com/cp20/n/a</link><pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>', 'note.com');
 assert.equal(parsed[0].title, 'A & B');
 assert.throws(() => parseFeed('<not-rss/>', 'note.com'));
 assert.throws(() => safeUrl('javascript:alert(1)'));
 assert.equal(mergeArticles([old], [{...old,title:'new'}], {articles:[],exclude:[],overrides:{[old.url]:{title:'editor'}}})[0].title, 'editor');
 assert.equal(mergeArticles([old], parsed).length, 2);
 assert.equal(mergeArticles([old], [], { articles:[], exclude:[old.url], overrides:{} }).length,0);
 const previous = { articles:[old], repos:[], sources:{'zenn.dev':{status:'ok',lastSuccess:'2024-01-01'}}, updatedAt:'2024-01-01' };
 const next = await collect(previous, {'zenn.dev':async()=>{throw Error('offline')},'note.com':async()=>parsed}, '2026-09-01T00:00:00Z');
 assert.equal(next.articles.length,2); assert.equal(next.sources['zenn.dev'].status,'stale'); assert.equal(next.sources['zenn.dev'].lastSuccess,'2024-01-01');
 await assert.rejects(collect(previous, { broken:async()=>{throw Error('offline')} }));
 assert.deepEqual(await paginated(async n => n<3?[n]:[], x=>x,x=>x,(_,rows)=>rows.length>0), [1,2]);
 const same = await collect(previous, {'zenn.dev':async()=>[old]},'2026-09-01T00:00:00Z'); assert.equal(same.updatedAt,previous.updatedAt);
});
