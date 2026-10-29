const CACHE='mi-iptv-app-v1-7-1-rapida-20261028';
const ASSETS=['./','./index.html','./styles.css','./app.js','./demo.js','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
// Inicio rápido: los recursos de esta versión se guardan al instalar el service worker.
// Los archivos nuevos se incorporan automáticamente al publicar una versión distinta.
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const saved=await cache.match(request,{ignoreSearch:true});
    if(saved)return saved;
    try{
      const response=await fetch(request);
      if(response.ok)cache.put(request,response.clone()).catch(()=>{});
      return response;
    }catch(err){return new Response('No se pudo cargar Mi IPTV. Verifica tu conexión.',{status:503});}
  }));
});
