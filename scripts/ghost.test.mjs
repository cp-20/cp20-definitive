import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {ghostToken,fetchGhostPosts} from './ghost.mjs';
import {article,collect} from './sync.mjs';
const key='abcdef0123456789:'+ 'ab'.repeat(32);
test('Ghost JWT uses binary secret, admin audience, five-minute expiry, and rejects missing keys',()=>{
 const [h,p,s]=ghostToken(key,100).split('.');assert.deepEqual(JSON.parse(Buffer.from(p,'base64url')),{iat:100,exp:400,aud:'/admin/'});assert.equal(JSON.parse(Buffer.from(h,'base64url')).kid,key.split(':')[0]);assert.equal(s,createHmac('sha256',Buffer.from('ab'.repeat(32),'hex')).update(`${h}.${p}`).digest('base64url'));assert.throws(()=>ghostToken(''));assert.throws(()=>ghostToken('secret'));
});
test('Ghost traverses all pages and only projects public cp20 posts',async()=>{
 const calls=[];const sample={title:'公開',url:'https://trap.jp/post/1/',published_at:'2026-01-01',status:'published',visibility:'public',authors:[{slug:'cp20',email:'private@example.org'}],html:'never export'};
 const rows=await fetchGhostPosts(async(url,format,fetcher,headers)=>{const u=new URL(url);calls.push(u);assert.match(headers.Authorization,/^Ghost /);assert.match(u.searchParams.get('filter'),/visibility:public/);const page=Number(u.searchParams.get('page'));return{posts:page===1?[sample,{...sample,status:'draft'},{...sample,visibility:'members'},{...sample,authors:[{slug:'other'}]}]:[{...sample,url:'https://trap.jp/post/2/'}],meta:{pagination:{page,next:page===1?2:null}}}},article,key);
 assert.equal(calls.length,2);assert.equal(rows.length,2);assert.deepEqual(Object.keys(rows[0]).sort(),['date','source','title','url']);
});
test('successful complete Ghost fetch removes withdrawn posts, but failure preserves the last snapshot',async()=>{
 const p={articles:[article('past','https://trap.jp/post/1/','2025-01-01','trap.jp')],repos:[],sources:{'trap.jp':{status:'ok'}},updatedAt:'2025-01-01'};
 const n=await collect(p,{'trap.jp':async()=>[]});assert.deepEqual(n.articles,[]);assert.equal(n.sources['trap.jp'].status,'ok');
 const failed=await collect(p,{'trap.jp':async()=>{throw Error('outage')},'zenn.dev':async()=>[article('z','https://zenn.dev/cp20/articles/1','2026-01-01','zenn.dev')]});assert.equal(failed.articles.length,2);assert.equal(failed.sources['trap.jp'].status,'stale');
 await assert.rejects(fetchGhostPosts(async()=>({posts:[],meta:{pagination:{page:1,next:1}}}),article,key));
});
test('Admin authentication redirects are rejected without forwarding credentials',async()=>{
 const {request}=await import('./sync.mjs');let calls=0;
 await assert.rejects(request('https://blog-admin.trap.jp/ghost/api/admin/posts/','json',async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:307,headers:{Location:'https://q.trap.jp/login'}})},{Authorization:'Ghost test-token'}),{code:'AUTH_REDIRECT'});
 assert.equal(calls,1);
});
