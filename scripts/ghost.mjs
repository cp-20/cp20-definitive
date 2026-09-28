import {createHmac} from 'node:crypto';
export function ghostToken(key, now = Math.floor(Date.now()/1000)) {
  if (typeof key !== 'string' || !/^[a-f0-9]+:[a-f0-9]{64}$/i.test(key)) throw new Error('Missing or invalid TRAP_GHOST_ADMIN_KEY');
  const [id,secret]=key.split(':');
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned=`${encode({alg:'HS256',typ:'JWT',kid:id})}.${encode({iat:now,exp:now+300,aud:'/admin/'})}`;
  return `${unsigned}.${createHmac('sha256',Buffer.from(secret,'hex')).update(unsigned).digest('base64url')}`;
}
// Project only public fields; no post body, staff details, or credential reaches the snapshot.
export async function fetchGhostPosts(request, normalize, key=process.env.TRAP_GHOST_ADMIN_KEY) {
  ghostToken(key); // Fail before making a request when not configured.
  const posts=[];
  for(let page=1;page<=100;page++){
    const url=new URL('https://blog-admin.trap.jp/ghost/api/admin/posts/');
    url.search=new URLSearchParams({filter:'authors.slug:cp20+status:published+visibility:public',include:'authors',fields:'title,url,published_at,status,visibility',limit:'100',page:String(page),order:'published_at desc'}).toString();
    const data=await request(url.href,'json',fetch,{'Authorization':`Ghost ${ghostToken(key)}`,'Accept-Version':'v5.0'});
    if(!Array.isArray(data.posts)||!data.meta?.pagination||data.meta.pagination.page!==page)throw Error('Invalid Ghost pagination');
    for(const p of data.posts){
      if(p.status!=='published'||p.visibility!=='public'||!p.authors?.some(a=>a.slug==='cp20'))continue;
      posts.push(normalize(p.title,p.url,p.published_at,'trap.jp'));
    }
    const next=data.meta.pagination.next;
    if(next===null)return posts;
    if(next!==page+1)throw Error('Unexpected Ghost next page');
  }
  throw Error('Ghost pagination exceeded 100 pages');
}
