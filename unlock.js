(() => {
  'use strict';
  const form=document.querySelector('form'),input=document.querySelector('#password'),button=form.querySelector('button'),status=document.querySelector('#status');
  const storageName='tamachan-instagram-preview-key';
  const base=new URL('./',location.href);
  const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
  const decrypt=(key,bytes)=>crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},key,bytes.slice(12));
  let config;
  async function open(raw){
    const key=await crypto.subtle.importKey('raw',decode(raw),'AES-GCM',false,['decrypt']);
    const response=await fetch(new URL('vault/manifest.bin',base),{cache:'no-store'});
    if(!response.ok)throw Error('network');
    const manifest=JSON.parse(new TextDecoder().decode(await decrypt(key,await response.arrayBuffer())));
    const registration=await navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.pathname,updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('worker')),10000);
      navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timeout);resolve();},{once:true});
    });
    await new Promise((resolve,reject)=>{
      const channel=new MessageChannel(),timeout=setTimeout(()=>reject(Error('worker')),10000);
      channel.port1.onmessage=e=>{clearTimeout(timeout);channel.port1.close();e.data.ok?resolve():reject(Error('worker'));};
      navigator.serviceWorker.controller.postMessage({type:'unlock',raw,version:config.version},[channel.port2]);
    });
    sessionStorage.setItem(storageName,raw);
    const next=new URLSearchParams(location.search).get('next')||config.entry;
    const clean=decodeURIComponent(next).replace(/^\/+/, '');
    const target=manifest[clean]?new URL(clean,base):new URL(config.entry,base);
    location.replace(target.href);
  }
  async function start(){
    if(!crypto.subtle||!('serviceWorker'in navigator)){status.textContent='SafariやChromeなど、通常のブラウザーで開いてください。';return;}
    config=await (await fetch(new URL('preview-config.json',base),{cache:'no-store'})).json();
    status.textContent='';
    const saved=sessionStorage.getItem(storageName);
    if(saved){status.textContent='資料を開いています…';try{await open(saved);return;}catch{sessionStorage.removeItem(storageName);status.textContent='パスワードを入力してください。';}}
    form.addEventListener('submit',async e=>{
      e.preventDefault();button.disabled=true;status.textContent='確認しています…';
      try{
        const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(input.value),'PBKDF2',false,['deriveBits']);
        const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:decode(config.salt),iterations:config.iterations,hash:'SHA-256'},material,256);
        await open(encode(bits));
      }catch(error){status.textContent=error.name==='OperationError'?'パスワードが違うようです。もう一度ご確認ください。':'読み込めませんでした。通信環境を確認して、もう一度お試しください。';button.disabled=false;}
    });
    button.disabled=false;
  }
  start().catch(()=>{status.textContent='読み込めませんでした。ページを再読み込みしてください。';});
})();
