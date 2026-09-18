let key=null,manifest=null,unlockPromise=null;
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const decrypt=(k,b)=>crypto.subtle.decrypt({name:'AES-GCM',iv:b.slice(0,12)},k,b.slice(12));
const scopePath=new URL(self.registration.scope).pathname;
const publicPaths=new Set(['','index.html','unlock.js','session.js','sw.js','preview-config.json','robots.txt','404.html','README.md']);
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function unlock(raw){
  const candidate=await crypto.subtle.importKey('raw',decode(raw),'AES-GCM',false,['decrypt']);
  const response=await fetch(new URL('vault/manifest.bin',self.registration.scope),{cache:'no-store'});
  const data=JSON.parse(new TextDecoder().decode(await decrypt(candidate,await response.arrayBuffer())));
  key=candidate;manifest=data;
}
self.addEventListener('message',event=>{
  if(event.data?.type!=='unlock'&&event.data?.type!=='restore')return;
  const promise=unlock(event.data.raw).then(()=>event.ports[0]?.postMessage({ok:true})).catch(()=>event.ports[0]?.postMessage({ok:false}));
  unlockPromise=promise;event.waitUntil(promise);
});
async function restore(){
  if(key&&manifest)return;
  if(unlockPromise)await unlockPromise;
  if(key&&manifest)return;
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients)client.postMessage({type:'need-key'});
  for(let i=0;i<15&&!key;i++)await new Promise(resolve=>setTimeout(resolve,100));
  if(unlockPromise)await unlockPromise;
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(scopePath))return;
  const rel=decodeURIComponent(url.pathname.slice(scopePath.length));
  if(publicPaths.has(rel)||rel.startsWith('vault/'))return;
  event.respondWith((async()=>{
    await restore();
    if(!key||!manifest){
      if(event.request.mode==='navigate')return Response.redirect(new URL('?next='+encodeURIComponent(rel+url.search+url.hash),self.registration.scope),302);
      return new Response('Locked',{status:401});
    }
    const file=manifest[rel];
    if(!file)return new Response('Not found',{status:404});
    try{
      const response=await fetch(new URL(file.file,self.registration.scope));
      if(!response.ok)return new Response('Unavailable',{status:503});
      const content=await decrypt(key,await response.arrayBuffer());
      return new Response(content,{headers:{'Content-Type':file.type,'Content-Length':String(content.byteLength),'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'}});
    }catch{return new Response('Cannot open preview',{status:503});}
  })());
});
