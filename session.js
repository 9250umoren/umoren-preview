(() => {
  if(!('serviceWorker'in navigator))return;
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.data?.type==='need-key'){
      const raw=sessionStorage.getItem('tamachan-instagram-preview-key');
      if(raw)event.source.postMessage({type:'restore',raw});
    }
  });
})();
