import {readFile,writeFile,rename} from 'node:fs/promises';
const allowedImages=new Set(['cdn-img.comic-action.com','public.ynjn.jp','eh96lnrmau.user-space.cdn.idcfcloud.net','deliver.cdn.nicomanga.jp','cdn.comic-walker.com']);
const publishers={'comic-action.com':'双葉社 / webアクション','ynjn.jp':'集英社 / ヤンジャン！','yanmaga.jp':'講談社 / ヤンマガWeb','manga.nicovideo.jp':'ニコニコ漫画','comic-walker.com':'KADOKAWA / カドコミ'};
export function ogImage(html){
 for(const meta of html.match(/<meta\s[^>]*>/gi)||[]){
  const attributes=Object.fromEntries([...meta.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),m[2]]));
  if(attributes.property==='og:image'&&attributes.content){const u=new URL(attributes.content.replace(/&amp;/g,'&'));if(u.protocol==='https:'&&allowedImages.has(u.hostname))return u.href;}
 }
 throw Error('No supported publisher thumbnail');
}
async function saveIfChanged(file,previous,next){if(JSON.stringify(previous)===JSON.stringify(next))return false;const tmp=new URL(file.href+'.tmp');await writeFile(tmp,JSON.stringify(next,null,2)+'\n');await rename(tmp,file);return true;}
export async function syncMedia(request){
 const trackPath=new URL('../src/data/tracks.json',import.meta.url),seriesPath=new URL('../src/data/series.json',import.meta.url);
 const [tracks,series]=await Promise.all([readFile(trackPath,'utf8').then(JSON.parse),readFile(seriesPath,'utf8').then(JSON.parse)]);
 let nextTracks=tracks,nextSeries=structuredClone(series);
 try{
  const raw=await request('https://2026.cp20.dev/featured-tracks?raw=true');
  if(!Array.isArray(raw)||!raw.length)throw Error();
  nextTracks=raw.map(t=>{const u=new URL(t.link);const id=u.pathname.slice(1);if(u.hostname!=='youtu.be'||!/^[-_a-zA-Z0-9]{11}$/.test(id)||typeof t.title!=='string'||typeof t.composer!=='string')throw Error();return{title:t.title,composer:t.composer,link:u.href,thumbnail:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`};});
 }catch{console.warn('::warning::Music source unavailable; keeping previous selection');}
 try{
  const raw=await request('https://2026.cp20.dev/featured-series?raw=true');
  if(!Array.isArray(raw)||!raw.length)throw Error();
  nextSeries=raw.map(s=>{const u=new URL(s.link);if(u.protocol!=='https:'||!publishers[u.hostname]||typeof s.title!=='string'||typeof s.author!=='string')throw Error();const old=series.find(p=>p.link===s.link);return{title:s.title,author:s.author,link:s.link,thumbnail:old?.thumbnail||'',credit:publishers[u.hostname]};});
 }catch{console.warn('::warning::Manga selection unavailable; keeping previous selection');}
 const results=await Promise.allSettled(nextSeries.map(async s=>({...s,thumbnail:ogImage(await request(s.link,'html'))})));
 nextSeries=results.map((r,i)=>r.status==='fulfilled'?r.value:nextSeries[i]);
 // An inaccessible new entry must not replace the previously working shelf.
 if(nextSeries.some(s=>!s.thumbnail))nextSeries=series;
 const a=await saveIfChanged(trackPath,tracks,nextTracks);const b=await saveIfChanged(seriesPath,series,nextSeries);
 return a||b;
}
