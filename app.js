'use strict';
(() => {
 const $ = id => document.getElementById(id);
 const KEY = 'mi-iptv-v1-state'; // Clave conservada para preservar listas, favoritos y selecciones.
 const PAGE = 50;
 const state = {playlists:[], channels:[], trash:[], recent:[]};
 let explorePage=1,savedPage=1,decisionFilter='all', savedFilter='keep', activeList=[],playerIndex=0,playerChannelId=null,toastTimer=0,saveTimer=0,db=null,showHidden=false,currentCategory='',categoryPage=0,playerPoolKey='';
 const EPG_CACHE_KEY='mi-iptv-epg-cache-v2-compact';
 const EPG_LEGACY_KEY='mi-iptv-epg-cache-v1';
 // No restaurar el XMLTV original en el inicio: puede congelar Chrome en iPhone.

 const EPG_PRESETS={mx:'https://iptv-epg.org/files/epg-mx.xml',es:'https://iptv-epg.org/files/epg-es.xml',ar:'https://iptv-epg.org/files/epg-ar.xml',cl:'https://iptv-epg.org/files/epg-cl.xml',co:'https://iptv-epg.org/files/epg-co.xml'};
 let epgIds=new Map(),epgNames=new Map(),epgLoaded=false,epgSource='',epgRefreshTimer=null;

 const countryNames={MX:'México',ES:'España',AR:'Argentina',CL:'Chile',CO:'Colombia',PE:'Perú',EC:'Ecuador',CR:'Costa Rica',UY:'Uruguay',US:'Estados Unidos',PY:'Paraguay',BO:'Bolivia',VE:'Venezuela',DO:'República Dominicana',GT:'Guatemala',SV:'El Salvador',HN:'Honduras',NI:'Nicaragua',PA:'Panamá',CU:'Cuba',PR:'Puerto Rico',BR:'Brasil',DE:'Alemania',FR:'Francia',CA:'Canadá',GB:'Reino Unido',PT:'Portugal',IT:'Italia',JP:'Japón',NL:'Países Bajos'};
 const countryAlias={};Object.entries(countryNames).forEach(([code,name])=>{countryAlias[name.toLowerCase()]=name;countryAlias[code.toLowerCase()]=name});
 const nativeCategories={general:'Televisión general',news:'Noticias',sports:'Deportes',movies:'Películas',series:'Series',documentary:'Documentales',culture:'Cultura',education:'Educación',kids:'Infantiles',music:'Música',entertainment:'Entretenimiento',animation:'Animación',business:'Negocios',cooking:'Cocina',family:'Familia',legislative:'Legislativo',lifestyle:'Estilo de vida',outdoor:'Aire libre',relax:'Relajación',religious:'Religión',science:'Ciencia',shop:'Compras',travel:'Viajes',weather:'Clima',auto:'Automovilismo',classic:'Clásicos',comedy:'Comedia',gaming:'Videojuegos',history:'Historia',hobby:'Aficiones'};
 const icons={'Televisión general':'📺','Noticias':'📰','Deportes':'⚽','Películas':'🎬','Series':'🎞','Documentales':'🌿','Cultura':'🏛','Educación':'🎓','Infantiles':'🧸','Música':'🎵','Entretenimiento':'🎭','Sin categoría':'📡'};
 const esc = s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const norm = s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const safeUrl = s=>{try{const u=new URL(String(s).trim());return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
 const streamUrl = s=>{try{const u=new URL(String(s).trim());return ['http:','https:','rtsp:','rtmp:','udp:'].includes(u.protocol)?u.href:''}catch{return ''}};
 // Dos mecanismos de apertura de VLC para iOS. No se puede verificar la reproducción desde el navegador.
 const vlcLink = s => {const url=streamUrl(s);return url?'vlc-x-callback://x-callback-url/stream?url='+encodeURIComponent(url):''};
 // Alternativa histórica documentada por VLC para iOS. Requiere comprobación en el dispositivo.
 const vlcLegacyLink = s => {const url=streamUrl(s);return url?'vlc:///stream?url='+encodeURIComponent(url):''};
 // Los esquemas de VLC para iOS no están registrados automáticamente en Windows o macOS.
 const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
 const desktopVlcControls = c=>`<button type="button" class="smallbtn vlc-link" data-download-vlc="${esc(c.id)}">↓ Archivo para VLC</button><button type="button" class="smallbtn" data-copy-url="${esc(c.id)}">Copiar URL</button>`;
 const deviceVlcControls = c=>isIOS?`<a class="smallbtn vlc-link" href="${esc(vlcLink(c.url)||'#')}" data-external-vlc="${esc(c.id)}" aria-label="Abrir ${esc(c.name)} en VLC">▶ Abrir en VLC</a><button type="button" class="smallbtn vlc-link" data-share-vlc="${esc(c.id)}">↥ Compartir M3U</button><button type="button" class="smallbtn" data-copy-url="${esc(c.id)}">Copiar URL</button>`:desktopVlcControls(c);
 async function copyStreamAddress(c){if(!c||!streamUrl(c.url)){toast('Dirección de transmisión no válida.');return;}try{await navigator.clipboard.writeText(c.url);toast('Dirección copiada. Pégala en VLC → Abrir ubicación de red.')}catch{prompt('Copia esta dirección y pégala en VLC:',c.url)}}

 const initialCategories={'CanalOnce.mx':'Cultura','Lasestrellas.tv':'Entretenimiento','ADNNoticias.mx':'Noticias','TeleFormula.mx':'Noticias','Canal6Multimedios.mx':'Televisión general','QuieroTV.mx':'Televisión general','MexicoTravelTV.mx':'Viajes','EstrellaTV.mx':'Entretenimiento','Tele10Nayarit.mx':'Televisión general','noticiasnrt.com':'Televisión general','La1.es':'Televisión general','La2.es':'Cultura','24h.es':'Noticias','tdp.es':'Deportes','clan.es':'Infantiles','Telemadrid.es':'Televisión general','LaOtra.es':'Televisión general','CanalSurAndalucia.es':'Televisión general','Divinity.es':'Series','Energy.es':'Series','BeMad.es':'Entretenimiento','Aunar.ar':'Cultura','CineAr.ar':'Películas','TECTV.ar':'Educación','DeporTV.ar':'Deportes','Canal26.ar':'Noticias','MasPerfil.ar':'Noticias','Telemax.ar':'Televisión general','NETTV.ar':'Televisión general','TVUniversidad.ar':'Educación','ElTrece.ar':'Televisión general','AmericaTV.ar':'Televisión general','UCVTV.cl':'Televisión general','24Horas.cl':'Noticias','Canal13.cl':'Televisión general','UChileTV.cl':'Cultura','T13.cl':'Noticias','13C.cl':'Cultura','13Kids.cl':'Infantiles','13E.cl':'Entretenimiento','TVN3.cl':'Televisión general','mega.cl':'Televisión general','biobiochile.cl':'Noticias'};
 const textCountry = value => {const x=String(value||'').trim();if(!x)return ''; const first=x.split(/[;,]/)[0].trim();return countryAlias[first.toLowerCase()]||countryNames[first.toUpperCase()]||(/^[A-Z]{2}$/.test(first)?first:first)};
 const catName = raw => {let r=String(raw||'').trim();return nativeCategories[r.toLowerCase()]||(/^undefined$|^sin categor[ií]a$|^other$|^uncategorized$/i.test(r)?'Sin categoría':(r||'Sin categoría'))};
 const displayCategory = raw => catName(raw);
 const playable = c => !!c && !c.hidden;
 const hash = s => {let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)};
 const a = s => {const result={};for(const m of String(s).matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g))result[m[1].toLowerCase()]=m[2]??m[3]??m[4]??'';return result};
 function parseM3U(text,playlistId){
   const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/), channels=[];
   let meta=null;
   for(const untrimmed of lines){const line=untrimmed.trim();if(!line)continue;
     if(/^#EXTINF\s*:/i.test(line)){
       const comma=line.indexOf(',');const attrs=a(comma>=0?line.slice(0,comma):line);
       const name=(comma>=0?line.slice(comma+1).trim():'')||attrs['tvg-name']||'Canal sin nombre';
       const group=attrs['group-title']||'';
       let country=textCountry(attrs['tvg-country']||'');
       const possibleCountry=textCountry(group);
       let category=group;
       if(!country && possibleCountry && (countryAlias[group.toLowerCase()]||countryNames[group.toUpperCase()])){country=possibleCountry;category='';}
       if(!country && attrs['tvg-id']){const t=String(attrs['tvg-id']).match(/\.([a-z]{2})(?:@[^.]*)?$/i);if(t)country=textCountry(t[1])}
       meta={name, country:country||'Sin país', category:catName(category),logo:safeUrl(attrs['tvg-logo']),tvgId:attrs['tvg-id']||'',language:attrs['tvg-language']||'',group,rawExtinf:line};
       continue;
     }
     if(meta && /^#EXTVLCOPT:/i.test(line)){
       const opt=line.slice('#EXTVLCOPT:'.length);
       // No ejecutar ni aceptar opciones arbitrarias importadas por el usuario.
       if(/^(?:http-user-agent|http-referrer)=/i.test(opt) && !/[\r\n]/.test(opt)){
         (meta.vlcOptions??=[]).push(opt);
       }
       continue;
     }
     if(line.startsWith('#'))continue;
     const url=streamUrl(line);
     if(meta && url){channels.push({...meta,url,playlistId,id:playlistId+'-'+channels.length.toString(36),decision:'pending',favorite:false});meta=null;}
   }
   return channels;
 }
 async function getDB(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window)){resolve(null);return;}const req=indexedDB.open('mi-iptv-persist',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('kv'))req.result.createObjectStore('kv')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
 async function readPersist(){try{db=await getDB();if(db){return await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readonly');const req=tx.objectStore('kv').get(KEY);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}}catch(e){console.warn('Almacenamiento IndexedDB no disponible',e)}try{return JSON.parse(localStorage.getItem(KEY))}catch{return null}}
 async function writePersist(snapshot){if(db){try{await new Promise((resolve,reject)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(snapshot,KEY);t.oncomplete=resolve;t.onerror=()=>reject(t.error)});return}catch(e){console.warn('No se pudo escribir en IndexedDB',e)}}try{localStorage.setItem(KEY,JSON.stringify(snapshot))}catch(e){if(location.protocol!=='about:'&&location.protocol!=='file:')toast('Sin espacio para guardar los datos. Descarga una copia de seguridad.')}}

 // EPG XMLTV: almacena la guía en una clave independiente (nunca dentro de los favoritos/listas).
 function epgStatus(message,isError=false){$('epgStatus').textContent=message;$('epgStatus').className='epg-info '+(isError?'error':epgLoaded?'success':'');}
 function epgTime(n){return new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(n));}
 function epgLocalDate(n){return new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short'}).format(new Date(n));}
 function xmlDate(value){const m=String(value||'').trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])(\d{2})(\d{2})/);if(!m)return NaN;const t=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));const diff=(+m[8]*60+ +m[9])*60000;return t+(m[7]==='+'?-diff:diff);}
 function cleanEpgName(s){return norm(s).replace(/\([^)]*\)/g,'').replace(/\b(?:tv|hd|sd|uhd|4k|en vivo|latinoamerica|mexico)\b/g,'').replace(/[^a-z0-9]/g,'').trim()}
 function parseXmltv(xml){
   if(xml.length>38*1024*1024)throw Error('El archivo XMLTV supera 38 MB. Prueba una guía por país.');
   const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('El archivo no contiene XMLTV válido.');
   const root=doc.documentElement;if(root.localName!=='tv')throw Error('Se esperaba un archivo XMLTV con la etiqueta <tv>.');
   const ids=new Map(),names=new Map();let programs=0;
   for(const ch of root.getElementsByTagName('channel')){
     const id=ch.getAttribute('id')?.trim();if(!id)continue;
     ids.set(id,[]);
     for(const entry of ch.getElementsByTagName('display-name')){
       const key=cleanEpgName(entry.textContent||'');if(key.length<3)continue;
       if(!names.has(key))names.set(key,new Set());names.get(key).add(id);
     }
   }
   for(const entry of root.getElementsByTagName('programme')){
     const channel=entry.getAttribute('channel')?.trim();if(!channel)continue;
     const start=xmlDate(entry.getAttribute('start')),stop=xmlDate(entry.getAttribute('stop'));
     if(!Number.isFinite(start)||!Number.isFinite(stop)||stop<=start)continue;
     // No conservar programas de hace días para reducir memoria.
     if(stop<Date.now()-12*3600000||start>Date.now()+8*86400000)continue;
     const title=entry.getElementsByTagName('title')[0]?.textContent?.trim()||'Programa sin título';
     const description=entry.getElementsByTagName('desc')[0]?.textContent?.trim()||'';
     if(!ids.has(channel))ids.set(channel,[]);
     ids.get(channel).push({start,stop,title,description});programs++;
   }
   if(!ids.size||!programs)throw Error('La guía no contiene programas actuales o futuros con fechas válidas.');
   for(const list of ids.values())list.sort((a,b)=>a.start-b.start);
   return {ids,names,programs};
 }
 function matchEpg(c){if(!c||!epgLoaded)return null;const id=String(c.tvgId||'').trim();if(id&&epgIds.has(id)&&epgIds.get(id).length)return epgIds.get(id);const key=cleanEpgName(c.name);const candidates=epgNames.get(key);if(candidates?.size===1){const match=epgIds.get([...candidates][0]);if(match?.length)return match;}return null;}
 function epgCoverage(){let found=0;for(const c of state.channels)if(matchEpg(c))found++;$('epgCoverage').textContent=epgLoaded?`${found.toLocaleString('es-MX')} de ${state.channels.length.toLocaleString('es-MX')} canales tienen coincidencia de programación en la guía cargada. No implica que puedan reproducirse.`:'No se han asociado canales.';}
 function renderEpgForPlayer(){
   const status=$('epgPlayerStatus'),box=$('epgPrograms');box.classList.add('hidden');
   if(!epgLoaded){status.textContent='Carga una guía desde Ajustes para consultar los horarios de los canales compatibles.';return;}
   const c=state.channels.find(x=>x.id===playerChannelId);if(!c){status.textContent='Selecciona un canal.';return;}
   const list=matchEpg(c);if(!list){status.textContent='Programación no disponible para este canal en la fuente seleccionada.';return;}
   const now=Date.now();const current=list.find(x=>x.start<=now&&x.stop>now);const upcoming=list.filter(x=>x.start>now).slice(0,10);const next=upcoming[0];
   if(!current&&!next){status.textContent='No hay programación vigente o próxima para este canal.';return;}
   status.textContent=`Datos EPG disponibles · Horarios de Ciudad de México · Fuente: ${epgSource}`;
   $('epgNowTitle').textContent=current?.title||'Sin información actual';
   $('epgNowTime').textContent=current?`${epgTime(current.start)} – ${epgTime(current.stop)} · ${epgLocalDate(current.start)}`:'—';
   $('epgProgressFill').style.width=current?Math.min(100,Math.max(0,(now-current.start)/(current.stop-current.start)*100)).toFixed(1)+'%':'0%';
   $('epgNextTitle').textContent=next?.title||'Sin información próxima';
   $('epgNextTime').textContent=next?`${epgTime(next.start)} – ${epgTime(next.stop)} · ${epgLocalDate(next.start)}`:'—';
   $('epgAgendaList').innerHTML=upcoming.length?upcoming.map(x=>`<div class="epg-agenda-row"><time datetime="${new Date(x.start).toISOString()}">${esc(epgTime(x.start))}</time><strong>${esc(x.title)}</strong></div>`).join(''):'<p class="epg-note">No hay más programas publicados.</p>';
   box.classList.remove('hidden');
 }
 // EPG optimizada: guardar solo programación necesaria, no XML completo.
 // Esto evita analizar un archivo XML de muchos megabytes cada vez que se abre la aplicación.
 function compactEpg(){
   const now=Date.now(),until=now+48*3600000;
   const ids=[]; const valid=new Set();
   for(const [id,programs] of epgIds){
     const upcoming=programs.filter(x=>x.stop>now-3600000&&x.start<until).map(x=>[x.start,x.stop,x.title]);
     if(upcoming.length){ids.push([id,upcoming]);valid.add(id);}
   }
   const names=[];
   for(const [name,set] of epgNames){const matched=[...set].filter(id=>valid.has(id));if(matched.length)names.push([name,matched]);}
   return {version:2,savedAt:now,source:epgSource,ids,names};
 }
 async function epgCacheWrite(){
   if(!db)return;
   const snapshot=compactEpg();
   try{
     await new Promise((resolve,reject)=>{
       const tx=db.transaction('kv','readwrite'),store=tx.objectStore('kv');
       store.put(snapshot,EPG_CACHE_KEY);
       // Retirar solo la guía XML antigua para recuperar almacenamiento, nunca los canales.
       store.delete(EPG_LEGACY_KEY);
       tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
     });
   }catch(e){console.warn('No se pudo guardar la guía compacta:',e);}
 }
 async function epgCacheRead(){
   if(!db)return null;
   try{return await new Promise((resolve,reject)=>{
     const tx=db.transaction('kv','readonly'),req=tx.objectStore('kv').get(EPG_CACHE_KEY);
     req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });}catch{return null;}
 }
 async function epgCacheClear(){
   if(!db)return;
   try{await new Promise((resolve,reject)=>{
     const tx=db.transaction('kv','readwrite'),store=tx.objectStore('kv');
     store.delete(EPG_CACHE_KEY);store.delete(EPG_LEGACY_KEY);
     tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });}catch{}
 }
 function restoreCompactEpg(cache){
   if(!cache||cache.version!==2||!Array.isArray(cache.ids)||cache.savedAt<Date.now()-24*3600000)return false;
   const now=Date.now();
   epgIds=new Map(cache.ids.map(([id,programs])=>[id,programs.filter(x=>x[1]>now).map(x=>({start:x[0],stop:x[1],title:x[2],description:''}))]).filter(([,programs])=>programs.length));
   epgNames=new Map((cache.names||[]).map(([name,ids])=>[name,new Set(ids.filter(id=>epgIds.has(id)))]));
   epgLoaded=epgIds.size>0;epgSource=String(cache.source||'Guía guardada')+' (copia local)';
   if(epgLoaded){epgCoverage();renderEpgForPlayer();epgStatus(`Guía recuperada rápidamente: ${epgIds.size.toLocaleString('es-MX')} canales. Fuente: ${epgSource}`);}
   return epgLoaded;
 }
 function applyEpg(xml,source){const result=parseXmltv(xml);epgIds=result.ids;epgNames=result.names;epgLoaded=true;epgSource=source;epgCoverage();renderEpgForPlayer();epgStatus(`Guía cargada: ${[...result.ids.values()].filter(x=>x.length).length.toLocaleString('es-MX')} canales con programación y ${result.programs.toLocaleString('es-MX')} programas vigentes o próximos. Fuente: ${source}`);}
 async function loadEpg(){const btn=$('epgLoad'),url=$('epgUrl').value.trim();if(!safeUrl(url)||!url.startsWith('https://')){epgStatus('Utiliza una URL HTTPS de una guía XMLTV.',true);return}btn.disabled=true;btn.textContent='Descargando guía…';epgStatus('Solicitando la guía…');
   const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),30000);
   try{const res=await fetch(url,{cache:'no-store',signal:ctl.signal});if(!res.ok)throw Error(`HTTP ${res.status}`);let bytes=await res.arrayBuffer();if(bytes.byteLength>38*1024*1024)throw Error('La respuesta supera 38 MB.');let xml;
     if(bytes.byteLength>2&&new Uint8Array(bytes)[0]===0x1f&&new Uint8Array(bytes)[1]===0x8b){if(!('DecompressionStream' in window))throw Error('El navegador no puede descomprimir .gz. Usa un .xml sin comprimir.');const decompressed=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));xml=await new Response(decompressed).text();}else xml=new TextDecoder('utf-8').decode(bytes);
     await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));applyEpg(xml,url);await epgCacheWrite();
   }catch(err){epgStatus(`No se pudo cargar la guía: ${err.message}. Si Chrome bloquea la conexión (CORS), descarga el XMLTV en Archivos y utiliza «Importar XMLTV». Tus listas no se han modificado.`,true)}finally{clearTimeout(timer);btn.disabled=false;btn.textContent='Actualizar guía';}}
 async function readEpgFile(file){let bytes=await file.arrayBuffer();if(bytes.byteLength>38*1024*1024)throw Error('El archivo supera 38 MB. Usa una guía por país.');let xml;if(bytes.byteLength>2&&new Uint8Array(bytes)[0]===0x1f&&new Uint8Array(bytes)[1]===0x8b){if(!('DecompressionStream' in window))throw Error('Tu navegador no puede descomprimir .gz: descomprímelo antes.');xml=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()}else xml=new TextDecoder('utf-8').decode(bytes);await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));applyEpg(xml,file.name);await epgCacheWrite()}

 function snapshot(){return {version:2,playlists:state.playlists,channels:state.channels,trash:state.trash,recent:state.recent}}
 function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>writePersist(snapshot()),350)}
 function toast(message){const el=$('toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),4200)}
 function counts(){return {total:state.channels.length,keep:state.channels.filter(c=>c.decision==='keep').length,remove:state.channels.filter(c=>c.decision==='remove').length,pending:state.channels.filter(c=>c.decision==='pending').length,favorite:state.channels.filter(c=>c.favorite).length}}
 function statsHtml(entries){return entries.map(([n,label])=>`<div class="stat"><strong>${n.toLocaleString('es-MX')}</strong><span>${esc(label)}</span></div>`).join('')}
 function countryOptions(){return [...new Set(state.channels.map(c=>c.country))].sort((x,y)=>x.localeCompare(y,'es'))}
 function categoryOptions(){return [...new Set(state.channels.map(c=>displayCategory(c.category)))].sort((x,y)=>x.localeCompare(y,'es'))}
 function optOptions(el,items,first){const selected=el.value;el.innerHTML=`<option value="">${esc(first)}</option>`+items.map(item=>`<option value="${esc(item.id??item)}">${esc(item.name??item)}</option>`).join('');if([...el.options].some(o=>o.value===selected))el.value=selected}
 function channelTile(c,pool='category'){
   const logo=c.logo?`<img loading="lazy" src="${esc(c.logo)}" alt="" onerror="this.remove()">`:`<span class="tile-monogram">${esc((c.name||'TV').slice(0,2).toUpperCase())}</span>`;
   return `<button type="button" class="stream-tile" data-play="${esc(c.id)}" data-pool="${esc(pool)}" aria-label="Ver ${esc(c.name)}"><span class="tile-image">${logo}<span class="tile-play">▶</span></span><span class="tile-title">${esc(c.name)}</span><span class="tile-meta">${esc(c.country||'Canal')} · ${esc(displayCategory(c.category))}</span></button>`;
 }
 function railMarkup(title,subtitle,items,pool,category=''){
   if(!items.length)return '';
   const action=category?`<button type="button" class="linkbtn" data-category="${esc(category)}">Ver todos →</button>`:'';
   return `<section class="stream-rail-section"><div class="rail-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div>${action}</div><div class="channel-rail">${items.slice(0,15).map(c=>channelTile(c,pool)).join('')}</div></section>`;
 }
 function renderHome(){
   const co=counts();$('home-stats').innerHTML=statsHtml([[co.total,'Canales registrados'],[co.keep,'Conservados'],[co.favorite,'Favoritos']]);
   const visible=state.channels.filter(c=>playable(c));
   const recents=state.recent.map(id=>state.channels.find(c=>c.id===id)).filter(c=>playable(c));
   const fav=visible.filter(c=>c.favorite),kept=visible.filter(c=>c.decision==='keep');
   const highlight=recents[0]||fav[0]||kept[0]||visible[0];
   $('spotlightName').textContent=highlight?.name||'Tus canales, a tu manera';
   $('spotlightMeta').textContent=highlight?`${highlight.country} · ${displayCategory(highlight.category)} · ${highlight.favorite?'Favorito':'Disponible en tu biblioteca'}`:'Importa una lista para empezar a ver televisión';
   $('spotlightKicker').textContent=recents[0]?'CONTINÚA VIENDO':fav[0]?'DE TUS FAVORITOS':'TU CATÁLOGO';
   $('spotlightPlay').disabled=!highlight;
   if(highlight)$('spotlightPlay').dataset.play=highlight.id;else delete $('spotlightPlay').dataset.play;
   const icon=$('spotlightLogo');icon.innerHTML=highlight?.logo?`<img loading="lazy" src="${esc(highlight.logo)}" alt="" onerror="this.replaceWith(document.createTextNode('TV'))">`:'TV';
   $('home-recent').innerHTML=recents.length?recents.slice(0,14).map(c=>channelTile(c,'category')).join(''):'<p class="empty-rail">Los canales que abras aparecerán aquí.</p>';
   $('home-favorites').innerHTML=fav.length?fav.slice(0,15).map(c=>channelTile(c,'favorites')).join(''):'<p class="empty-rail">Marca el corazón de tus canales favoritos para verlos aquí.</p>';
   $('home-kept').innerHTML=kept.length?kept.slice(0,15).map(c=>channelTile(c,'kept')).join(''):'<p class="empty-rail">Los canales que marques «Conservar» aparecerán aquí.</p>';
   const groups=new Map();for(const c of visible){let category=displayCategory(c.category);if(!groups.has(category))groups.set(category,[]);groups.get(category).push(c)}
   const preferred=['Películas','Series','Infantiles','Noticias','Deportes','Música','Documentales','Cultura','Entretenimiento','Televisión general'];
   const ordered=[...preferred.filter(g=>groups.has(g)),...groups.keys()].filter((g,i,a)=>a.indexOf(g)===i);
   $('home-streaming-rails').innerHTML=ordered.filter(g=>g!=='Sin categoría').slice(0,12).map(g=>railMarkup(g,groups.get(g).length.toLocaleString('es-MX')+' canales',groups.get(g),'category',g)).join('');
   $('homeCategoryChips').innerHTML=ordered.slice(0,15).map(g=>`<button type="button" data-category="${esc(g)}">${icons[g]||'📺'} ${esc(g)}</button>`).join('');
   $('home-categories').innerHTML=ordered.map(g=>`<button class="category-tile" data-category="${esc(g)}"><span class="glyph">${icons[g]||'📺'}</span><span><b>${esc(g)}</b><small>${groups.get(g).length.toLocaleString('es-MX')} canales</small></span></button>`).join('')||'<div class="empty">Sin categorías todavía.</div>';
   $('home-playlists').innerHTML=state.playlists.map(p=>`<div class="playlist-row"><div><h4>${esc(p.name)}</h4><p>${Number(p.count||0).toLocaleString('es-MX')} canales</p></div><button class="smallbtn" data-openlist="${esc(p.id)}">Ver →</button></div>`).join('')||'<div class="empty">Importa una lista para empezar.</div>';
 }
 function categoryResults(){return state.channels.filter(c=>playable(c)&&displayCategory(c.category)===currentCategory)}
 function openCategory(cat){currentCategory=displayCategory(cat);categoryPage=0;go('category');renderCategory()}
 function renderCategory(){const data=categoryResults();$('categoryBrowseTitle').textContent=currentCategory;$('categoryBrowseCount').textContent=data.length.toLocaleString('es-MX')+' canales · Pulsa para ver o cambiar de canal.';
   const limit=(categoryPage+1)*40;$('categoryBrowseGrid').innerHTML=data.slice(0,limit).map(c=>channelTile(c,'category')).join('')||'<div class="empty">No hay canales disponibles en esta categoría.</div>';
   $('categoryMore').classList.toggle('hidden',data.length<=limit);
 }
 function matchesExplore(){const search=norm($('searchInput').value.trim()),list=$('listFilter').value,country=$('countryFilter').value,cat=$('categoryFilter').value;
   return state.channels.filter(c=>(showHidden||!c.hidden)&&(!list||c.playlistId===list)&&(!country||c.country===country)&&(!cat||displayCategory(c.category)===cat)&&(!search||norm(c.name+' '+c.country+' '+c.category).includes(search))&&(decisionFilter==='all'||(decisionFilter==='favorite'?c.favorite:c.decision===decisionFilter)));
 }
 function cardHtml(c){const p=state.playlists.find(p=>p.id===c.playlistId);let img=c.logo?`<img class="channel-logo" loading="lazy" alt="" src="${esc(c.logo)}" onerror="this.outerHTML='<span class=&quot;channel-logo fake&quot;>TV</span>'">`:'<span class="channel-logo fake">TV</span>';
   return `<article class="channel-card ${c.hidden?'channel-hidden':''}" data-cid="${esc(c.id)}"><div class="channel-first">${img}<div style="min-width:0;flex:1"><div class="channel-name">${esc(c.name)}${c.hidden?' <small>(Oculto)</small>':''}</div><div class="channel-info">${esc(c.country)} · ${esc(displayCategory(c.category))}${c.categoryOrigin?' (sugerida)':''}${p?' · '+esc(p.name):''}</div></div><button class="playbtn" data-play="${esc(c.id)}" aria-label="Reproducir ${esc(c.name)}">▶</button></div><div class="channel-actions"><button data-decision="keep" class="choicebtn keep ${c.decision==='keep'?'active':''}" aria-pressed="${c.decision==='keep'}">✓ Conservar</button><button data-decision="remove" class="choicebtn remove ${c.decision==='remove'?'active':''}" aria-pressed="${c.decision==='remove'}">× Quitar</button><button data-favorite class="choicebtn favorite ${c.favorite?'active':''}" aria-pressed="${c.favorite}" aria-label="Favorito">${c.favorite?'♥':'♡'}</button></div><div class="manage-actions"><button data-hide aria-pressed="${!!c.hidden}" class="smallbtn">${c.hidden?'◉ Mostrar':'◌ Ocultar'}</button><button data-trash class="smallbtn red" aria-label="Enviar ${esc(c.name)} a la papelera">Eliminar…</button>${deviceVlcControls(c)}</div></article>`;
 }
 function pager(root,total,page,kind){const pageCount=Math.max(1,Math.ceil(total/PAGE));root.innerHTML=total>PAGE?`<button data-page="${kind}" data-value="${page-1}" ${page<=1?'disabled':''}>← Anterior</button><span>Página ${page.toLocaleString('es-MX')} de ${pageCount.toLocaleString('es-MX')}</span><button data-page="${kind}" data-value="${page+1}" ${page>=pageCount?'disabled':''}>Siguiente →</button>`:''}
 function renderExplore(){optOptions($('listFilter'),state.playlists,'Todas las listas');optOptions($('countryFilter'),countryOptions(),'Todos los países');optOptions($('categoryFilter'),categoryOptions(),'Todas las categorías');
   const filtered=matchesExplore();explorePage=Math.min(explorePage,Math.max(1,Math.ceil(filtered.length/PAGE)));$('resultCount').textContent=`${filtered.length.toLocaleString('es-MX')} de ${state.channels.length.toLocaleString('es-MX')} canales · ${PAGE} por página`; $('showHidden').checked=showHidden;
   $('channelsList').innerHTML=filtered.slice((explorePage-1)*PAGE,explorePage*PAGE).map(cardHtml).join('')||'<div class="empty"><strong>No hay canales con estos filtros</strong>Puedes cambiar los filtros o agregar una lista M3U.</div>';pager($('pagination'),filtered.length,explorePage,'explore');
   document.querySelectorAll('[data-choice]').forEach(b=>b.classList.toggle('selected',b.dataset.choice===decisionFilter));
 }
 function savedResults(){return state.channels.filter(c=>savedFilter==='favorite'?c.favorite:c.decision===savedFilter)}
 function renderSaved(){const co=counts();$('saved-stats').innerHTML=statsHtml([[co.keep,'Conservar'],[co.remove,'Quitar'],[co.pending,'Pendientes']]);document.querySelectorAll('[data-saved]').forEach(b=>b.classList.toggle('selected',b.dataset.saved===savedFilter));const results=savedResults();savedPage=Math.min(savedPage,Math.max(1,Math.ceil(results.length/PAGE)));$('savedDescription').textContent=`${results.length.toLocaleString('es-MX')} canales en «${savedFilter==='keep'?'Conservar':savedFilter==='remove'?'Quitar':savedFilter==='favorite'?'Favoritos':'Pendientes'}».`;$('savedChannels').innerHTML=results.slice((savedPage-1)*PAGE,savedPage*PAGE).map(cardHtml).join('')||'<div class="empty">Todavía no hay canales en esta selección.</div>';pager($('savedPagination'),results.length,savedPage,'saved')}
 function renderPlaylists(){$('playlistCount').textContent=state.playlists.length+' listas';$('savedPlaylists').innerHTML=state.playlists.map(p=>`<div class="playlist-row"><div><h4>${esc(p.name)}</h4><p>${p.count.toLocaleString('es-MX')} canales · ${esc(p.source==='builtin'?'Incluida de ejemplo':p.source==='file'?'Archivo local':'URL')}</p></div><div class="playlist-row-actions"><button class="smallbtn" data-openlist="${esc(p.id)}" aria-label="Explorar ${esc(p.name)}">Ver</button><button class="smallbtn red" data-deletelist="${esc(p.id)}" aria-label="Eliminar ${esc(p.name)}">×</button></div></div>`).join('')||'<div class="empty">No hay listas importadas.</div>'}
 function renderTrash(){const el=$('trashCount');if(el)el.textContent=state.trash.length.toLocaleString('es-MX')+' canales en papelera';const list=$('trashList');if(!list)return;list.innerHTML=state.trash.map(c=>`<div class="playlist-row"><div><h4>${esc(c.name)}</h4><p>${esc(c.country)} · ${esc(c.category)} · Selección anterior: ${esc(c.decision==='keep'?'Conservar':c.decision==='remove'?'Quitar':'Pendiente')}${c.favorite?' · Favorito':''}</p></div><button class="smallbtn" data-restore-channel="${esc(c.id)}">Restaurar</button></div>`).join('')||'<p class="muted">La papelera está vacía.</p>';}
 function renderAll(){
   const active=document.querySelector('.screen.active')?.id||'screen-home';
   if(active==='screen-home')renderHome();
   else if(active==='screen-explore')renderExplore();
   else if(active==='screen-playlists')renderPlaylists();
   else if(active==='screen-saved')renderSaved();
   else if(active==='screen-settings')renderTrash();
   else if(active==='screen-category')renderCategory();
 }
 function go(screen){if(!document.getElementById('screen-'+screen))return;document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id==='screen-'+screen));document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===screen));if(screen==='explore')renderExplore();if(screen==='saved')renderSaved();if(screen==='playlists')renderPlaylists();if(screen==='home')renderHome();if(screen==='settings')renderTrash();if(screen==='category')renderCategory();window.scrollTo({top:0,behavior:'instant'})}
 function updateChannel(id,fn){const c=state.channels.find(x=>x.id===id);if(!c)return;fn(c);save();renderAll();updatePlayerButtons();if(playerChannelId)renderPlayerGuide()}
 function refreshPlaylistCounts(){for(const p of state.playlists)p.count=state.channels.filter(c=>c.playlistId===p.id).length;}
 function moveToTrash(id){const i=state.channels.findIndex(c=>c.id===id);if(i<0)return;const c=state.channels[i];if(!confirm(`¿Mover «${c.name}» a la papelera? Se conservarán tus decisiones y podrás restaurarlo desde Ajustes.`))return;state.channels.splice(i,1);state.trash.push(c);refreshPlaylistCounts();save();renderAll();toast('Canal en papelera. Puedes restaurarlo desde Ajustes.')}
 function restoreFromTrash(id){const i=state.trash.findIndex(c=>c.id===id);if(i<0)return;const c=state.trash.splice(i,1)[0];const duplicate=state.channels.some(x=>x.id===c.id);if(duplicate){state.trash.push(c);toast('El canal ya existe en la lista.');return;}if(!state.playlists.some(p=>p.id===c.playlistId)){const previous=c.deletedFromPlaylist||{id:c.playlistId,name:'Lista recuperada',source:'restored',url:'',createdAt:new Date().toISOString()};state.playlists.push({...previous,count:0})}delete c.deletedFromPlaylist;state.channels.push(c);refreshPlaylistCounts();save();renderAll();toast('Canal restaurado con sus selecciones.')}
 function addManualChannel(){const name=$('manualName').value.trim(),url=streamUrl($('manualUrl').value);if(!name||!url){toast('Escribe el nombre y una dirección de transmisión válida.');return;}const country=$('manualCountry').value.trim()||'Sin país';const category=$('manualCategory').value.trim()||'Sin categoría';if(state.channels.some(c=>c.url===url)&&!confirm('Ya existe una transmisión con esta URL. ¿Deseas añadirla de todos modos?'))return;const id='p-manual';if(!state.playlists.some(p=>p.id===id))state.playlists.push({id,name:'Canales agregados manualmente',count:0,source:'manual',url:'',createdAt:new Date().toISOString()});const channel={id:'manual-'+hash(name+'|'+url+'|'+Date.now()+'|'+Math.random()),name,country,category:catName(category),logo:'',tvgId:'',language:'',group:category,rawExtinf:'',url,playlistId:id,decision:'pending',favorite:false,hidden:false};state.channels.push(channel);refreshPlaylistCounts();save();renderAll();$('formManual').reset();go('explore');$('searchInput').value=name;explorePage=1;renderExplore();toast('Canal agregado sin modificar tus selecciones.')}
 
 function addList(name,text,source,remote){const parsedName=String(name||'Lista importada').trim().slice(0,100);const id='p-'+hash(parsedName+'|'+text.slice(0,300)+'|'+text.length), channels=parseM3U(text,id);
   if(source==='builtin')for(const c of channels){if(initialCategories[c.tvgId]){c.category=initialCategories[c.tvgId];c.categoryOrigin='clasificación sugerida';}}
   if(!channels.length)throw new Error('No se encontraron canales. Selecciona un archivo M3U que contenga líneas #EXTINF seguidas de direcciones HTTP(S).');
   if(state.playlists.some(p=>p.id===id))throw new Error('Esta lista ya está importada. Puedes verla en Mis listas.');
   state.playlists.push({id,name:parsedName,count:channels.length,source,url:remote||'',createdAt:new Date().toISOString()});state.channels.push(...channels);save();renderAll();toast(`${channels.length.toLocaleString('es-MX')} canales importados`);return channels.length;
 }
 function updatePlayerButtons(){const c=state.channels.find(x=>x.id===playerChannelId);if(!c)return;$('playerFavorite').textContent=c.favorite?'♥ Favorito':'♡ Favorito';$('playerKeep').textContent=c.decision==='keep'?'✓ Conservado':'✓ Conservar';$('playerRemove').textContent=c.decision==='remove'?'× Quitado':'× Quitar';}
 function playerPool(){const visible=state.channels.filter(c=>playable(c));if(playerPoolKey==='favorites')return visible.filter(c=>c.favorite);if(playerPoolKey==='kept')return visible.filter(c=>c.decision==='keep');if(playerPoolKey==='all')return visible;return visible.filter(c=>displayCategory(c.category)===playerPoolKey.slice(4));}
 function populatePlayerGroup(){const group=$('playerChannelGroup'),current=playerPoolKey;group.innerHTML='<option value="favorites">♥ Favoritos</option><option value="kept">✓ Conservados</option><option value="all">Todos los canales</option>'+categoryOptions().map(cat=>`<option value="cat:${esc(cat)}">${esc(cat)}</option>`).join('');group.value=current;if(group.selectedIndex<0)group.value='all';}
 function renderPlayerGuide(){
   activeList=playerPool().map(c=>c.id);playerIndex=activeList.indexOf(playerChannelId);
   $('remoteChannelNumber').textContent=playerIndex>=0?`${(playerIndex+1).toLocaleString('es-MX')} / ${activeList.length.toLocaleString('es-MX')}`:`${activeList.length.toLocaleString('es-MX')} canales`;
   $('previousChannel').disabled=!activeList.length;$('nextChannel').disabled=!activeList.length;
   const q=norm($('playerChannelSearch').value.trim());const list=playerPool().filter(c=>!q||norm(c.name+' '+c.country).includes(q));$('playerChannelCount').textContent=`${list.length.toLocaleString('es-MX')} canales${list.length>100?' · mostrando los primeros 100':''}`;
   $('playerChannelItems').innerHTML=list.slice(0,100).map(c=>`<button type="button" class="guide-channel ${c.id===playerChannelId?'is-playing':''}" data-guide-channel="${esc(c.id)}" aria-label="Cambiar a ${esc(c.name)}"><span class="guide-logo">${c.logo?`<img loading="lazy" src="${esc(c.logo)}" alt="" onerror="this.replaceWith(document.createTextNode('TV'))">`:'TV'}</span><span class="guide-copy"><strong>${esc(c.name)}</strong><small>${esc(c.country||'Canal')}</small></span><span class="guide-play">${c.id===playerChannelId?'●':'▶'}</span></button>`).join('')||'<p class="empty-rail">No hay canales con esta búsqueda.</p>';
 }
 function showPlayer(id,pool, preserveSearch=false){const c=state.channels.find(x=>x.id===id);if(!c)return;
   if(!pool){pool=playerPoolKey&&playerChannelId?playerPoolKey:'cat:'+displayCategory(c.category)}
   playerPoolKey=pool;if(!preserveSearch)$('playerChannelSearch').value='';
   playerChannelId=id;populatePlayerGroup();
   $('playerTitle').textContent=c.name;$('playerSubtitle').textContent=c.country+' · '+displayCategory(c.category);
   $('playerBackdrop').classList.remove('hidden');$('playerModal').classList.remove('hidden');$('playStatus').classList.add('hidden');
   $('openVLC').href=vlcLink(c.url)||'#';$('openVLCLegacy').href=vlcLegacyLink(c.url)||'#';$('openVLC').classList.toggle('hidden',!isIOS);$('openVLCLegacy').classList.toggle('hidden',!isIOS);$('shareVLCCurrent').classList.toggle('hidden',!isIOS);$('downloadVLCPc').classList.toggle('hidden',isIOS);
   $('vlcHelp').textContent=isIOS?'Si VLC se abre sin video, prueba «Otra apertura» o «Compartir M3U».':'Descarga el M3U del canal para abrirlo en VLC, o copia la URL y pégala en VLC → Abrir ubicación de red.';
   updatePlayerButtons();renderPlayerGuide();renderEpgForPlayer();
   state.recent=[id,...state.recent.filter(x=>x!==id)].slice(0,18);save(); // La portada se actualiza al volver a Inicio.
   const v=$('video');v.pause();v.removeAttribute('src');v.load();
   if(!safeUrl(c.url)){$('playStatus').textContent='Este formato no es compatible con el navegador. Prueba la alternativa de VLC.';$('playStatus').classList.remove('hidden');return;}
   if(location.protocol==='https:'&&c.url.startsWith('http:')){$('playStatus').textContent='Esta transmisión HTTP puede estar bloqueada desde HTTPS; prueba VLC.';$('playStatus').classList.remove('hidden');}
   v.src=c.url;v.load();const p=v.play();if(p?.catch)p.catch(()=>{$('playStatus').textContent='Pulsa ▶ para iniciar o utiliza VLC si el canal no se reproduce en Chrome.';$('playStatus').classList.remove('hidden')});
 }
 function closePlayer(){const v=$('video');v.pause();v.removeAttribute('src');v.load();$('playerBackdrop').classList.add('hidden');$('playerModal').classList.add('hidden');playerChannelId=null;}
 function jumpPlayer(dir){const pool=playerPool();if(!pool.length){toast('No hay canales en esta categoría.');return;}let current=pool.findIndex(c=>c.id===playerChannelId);const n=(current+dir+pool.length)%pool.length;showPlayer(pool[n].id,playerPoolKey,true);}
 function changePlayerGroup(group){playerPoolKey=group;$('playerChannelSearch').value='';const list=playerPool();if(!list.length){renderPlayerGuide();toast('No hay canales en esta selección.');return;}showPlayer(list[0].id,group,true);}
 function download(name,content,type){const blob=new Blob([content],{type:type||'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
 function channelM3UForVLC(c){
   const u=streamUrl(c?.url);if(!u)return null;
   const name=String(c.name||'Canal').replace(/[\r\n]/g,' ').trim()||'Canal';
   const filename='Mi_IPTV_'+name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,60)+'.m3u';
   const info='#EXTINF:-1 tvg-id="'+String(c.tvgId||'').replace(/["\r\n]/g,'')+'" group-title="'+String(c.group||c.category||'').replace(/["\r\n]/g,'')+'",'+name;
   const options=(Array.isArray(c.vlcOptions)?c.vlcOptions:[]).filter(x=>/^(?:http-user-agent|http-referrer)=/i.test(x) && !/[\r\n]/.test(x)).map(x=>'#EXTVLCOPT:'+x);
   return {filename,content:['#EXTM3U',info,...options,u,''].join('\n')};
 }
 function downloadChannelForVLC(c){
   const playlist=channelM3UForVLC(c);if(!playlist){toast('Este canal no tiene una dirección válida.');return;}
   download(playlist.filename,playlist.content,'application/x-mpegURL;charset=utf-8');
   toast('Archivo M3U descargado. Ábrelo desde Archivos con VLC.');
 }
 function shareChannelForVLC(c){
   const playlist=channelM3UForVLC(c);if(!playlist){toast('Este canal no tiene una dirección válida.');return;}
   const file=new File([playlist.content],playlist.filename,{type:'application/x-mpegURL'});
   // navigator.share debe invocarse directamente durante el clic del usuario.
   if(typeof navigator.share==='function' && typeof navigator.canShare==='function' && navigator.canShare({files:[file]})){
     navigator.share({files:[file],title:'Abrir canal en VLC'}).catch(err=>{
       if(err?.name==='AbortError')return;
       downloadChannelForVLC(c);
       toast('No se pudo compartir. Se descargó el archivo M3U.');
     });
   }else{
     downloadChannelForVLC(c);
   }
 }
 function exportM3U(which){const items=state.channels.filter(c=>which==='favorite'?c.favorite:c.decision==='keep');if(!items.length){toast('No hay canales seleccionados para exportar.');return}
   const rows=['#EXTM3U','# Exportado desde Mi IPTV. La reproducción de las señales no está garantizada.'];for(const c of items){let metadata=`tvg-id="${String(c.tvgId).replace(/"/g,'')}" tvg-logo="${c.logo.replace(/"/g,'')}" group-title="${c.group.replace(/"/g,'')}"`;rows.push(`#EXTINF:-1 ${metadata},${c.name.replace(/[\r\n]/g,' ')}`,c.url)}download(`Mi_IPTV_${which==='favorite'?'Favoritos':'Conservados'}_${new Date().toISOString().slice(0,10)}.m3u`,rows.join('\n')+'\n','application/x-mpegURL;charset=utf-8');toast(`${items.length.toLocaleString('es-MX')} canales exportados`)}
 function setupEvents(){document.body.addEventListener('click',event=>{
   const external=event.target.closest('a[data-external-vlc]');
   if(external){if(external.getAttribute('href')==='#'){event.preventDefault();toast('Este canal no tiene una dirección de transmisión válida.');return;}if(playerChannelId){$('video').pause();}return;}
   const b=event.target.closest('button');if(!b)return;
   if(b.dataset.shareVlc){const id=b.dataset.shareVlc==='current'?playerChannelId:b.dataset.shareVlc;const c=state.channels.find(x=>x.id===id);if(c){if(playerChannelId)$('video').pause();shareChannelForVLC(c)}return}
   if(b.dataset.downloadVlc){const id=b.dataset.downloadVlc==='current'?playerChannelId:b.dataset.downloadVlc;const c=state.channels.find(x=>x.id===id);if(c){if(playerChannelId)$('video').pause();downloadChannelForVLC(c)}return}
   if(b.dataset.copyUrl){const id=b.dataset.copyUrl==='current'?playerChannelId:b.dataset.copyUrl;copyStreamAddress(state.channels.find(x=>x.id===id));return}
   if(b.dataset.homeShortcut){savedFilter=b.dataset.homeShortcut;savedPage=1;go('saved');return}
   if(b.dataset.nav){go(b.dataset.nav);return}if(b.dataset.go){go(b.dataset.go);return}if(b.id==='settingsTop'){go('settings');return}
   if(b.dataset.category){openCategory(b.dataset.category);return}
   if(b.dataset.openlist){go('explore');$('listFilter').value=b.dataset.openlist;explorePage=1;renderExplore();return}
   if(b.dataset.choice){decisionFilter=b.dataset.choice;explorePage=1;renderExplore();return}
   if(b.dataset.saved){savedFilter=b.dataset.saved;savedPage=1;renderSaved();return}
   if(b.dataset.page){if(b.dataset.page==='saved'){savedPage=Number(b.dataset.value);renderSaved()}else{explorePage=Number(b.dataset.value);renderExplore()}window.scrollTo({top:120,behavior:'smooth'});return}
   if(b.dataset.guideChannel){showPlayer(b.dataset.guideChannel,playerPoolKey,true);return}
   if(b.dataset.play){const c=state.channels.find(x=>x.id===b.dataset.play);showPlayer(b.dataset.play,b.dataset.pool==='favorites'?'favorites':b.dataset.pool==='kept'?'kept':'cat:'+displayCategory(c?.category));return}
   const card=b.closest('[data-cid]');if(card && b.dataset.decision){const type=b.dataset.decision;updateChannel(card.dataset.cid,c=>{c.decision=c.decision===type?'pending':type});return}
   if(card && b.hasAttribute('data-favorite')){updateChannel(card.dataset.cid,c=>{c.favorite=!c.favorite});return}
   if(card && b.hasAttribute('data-hide')){updateChannel(card.dataset.cid,c=>{c.hidden=!c.hidden});return}
   if(card && b.hasAttribute('data-trash')){moveToTrash(card.dataset.cid);return}
   if(b.dataset.restoreChannel){restoreFromTrash(b.dataset.restoreChannel);return}
   if(b.dataset.deletelist){const p=state.playlists.find(x=>x.id===b.dataset.deletelist);if(p&&confirm(`¿Enviar todos los canales de «${p.name}» a la papelera? Sus selecciones y favoritos se conservarán para poder restaurarlos.`)){const removed=state.channels.filter(x=>x.playlistId===p.id);removed.forEach(c=>{c.deletedFromPlaylist={...p}});state.trash.push(...removed);state.playlists=state.playlists.filter(x=>x.id!==p.id);state.channels=state.channels.filter(x=>x.playlistId!==p.id);save();renderAll();toast(removed.length+' canales enviados a la papelera')}return}
 });
 const searchHome=()=>{const term=$('homeSearch').value.trim();$('searchInput').value=term;decisionFilter='all';explorePage=1;go('explore')};
 $('homeSearchGo').addEventListener('click',searchHome);$('homeSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchHome()}});
 ['searchInput','listFilter','countryFilter','categoryFilter'].forEach(id=>$(id).addEventListener(id==='searchInput'?'input':'change',()=>{explorePage=1;renderExplore()}));
 $('clearSearch').onclick=()=>{$('searchInput').value='';explorePage=1;renderExplore()};$('resetExploreFilters').onclick=()=>{$('searchInput').value='';$('listFilter').value='';$('countryFilter').value='';$('categoryFilter').value='';decisionFilter='all';showHidden=false;explorePage=1;renderExplore()};
 $('showHidden').addEventListener('change',e=>{showHidden=e.target.checked;explorePage=1;renderExplore()});
 $('formManual').addEventListener('submit',e=>{e.preventDefault();addManualChannel()});
 $('playlistFile').addEventListener('change',e=>{$('chosenFile').textContent=e.target.files?.[0]?.name||'Aún no has elegido un archivo.'});
 document.querySelectorAll('.addtab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.addtab').forEach(x=>x.classList.toggle('selected',x===b));$('formFile').classList.toggle('hidden',b.dataset.type!=='file');$('formUrl').classList.toggle('hidden',b.dataset.type!=='url')}));
 $('formFile').addEventListener('submit',async e=>{e.preventDefault();const file=$('playlistFile').files?.[0];if(!file){toast('Primero selecciona el archivo M3U.');return}try{let data=await file.text();addList($('fileName').value||file.name,data,'file');$('formFile').reset();$('chosenFile').textContent='Aún no has elegido un archivo.';go('explore')}catch(err){toast(err.message)}});
 async function fetchM3U(url){const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),25000);try{const response=await fetch(url,{signal:ctl.signal,cache:'no-store'});if(!response.ok)throw new Error(`El servidor respondió ${response.status}.`);const text=await response.text();if(!/^\s*#EXTM3U/m.test(text)||!/#EXTINF\s*:/i.test(text))throw new Error('La fuente no devolvió una lista M3U válida.');return text}finally{clearTimeout(timer)}}
 const IPTV_ORG_FEEDS=[
   {name:'IPTV-org español', label:'Español', sources:[
     'https://iptv-org.github.io/iptv/languages/spa.m3u',
     'https://raw.githubusercontent.com/iptv-org/iptv/gh-pages/languages/spa.m3u',
     'https://cdn.jsdelivr.net/gh/iptv-org/iptv@gh-pages/languages/spa.m3u'
   ]},
   {name:'IPTV-org Latinoamérica', label:'Latinoamérica', sources:[
     'https://iptv-org.github.io/iptv/regions/latam.m3u',
     'https://raw.githubusercontent.com/iptv-org/iptv/gh-pages/regions/latam.m3u',
     'https://cdn.jsdelivr.net/gh/iptv-org/iptv@gh-pages/regions/latam.m3u'
   ]}
 ];
 // La lista de idioma español se conserva tal como la clasifica IPTV-org.
 // La lista LATAM es un criterio regional adicional: puede incluir señales
 // sin etiqueta de idioma, por decisión expresa del usuario.
 // No sustituimos listas existentes ni alteramos sus favoritos o decisiones.
 function addUniqueCatalog(feed, text, remote){
   if(state.playlists.some(p=>p.name===feed.name))return {status:'existing',added:0,skipped:0};
   const id='p-'+hash(feed.name+'|'+text.slice(0,300)+'|'+text.length);
   const candidates=parseM3U(text,id);
   if(!candidates.length)throw new Error('La fuente no contiene canales reproducibles en formato M3U.');
   const seen=new Set(state.channels.map(c=>c.url.trim()));
   const channels=[];
   for(const c of candidates){
     const key=c.url.trim();
     if(seen.has(key))continue;
     seen.add(key);
     c.sourceScope=feed.label;
     channels.push(c);
   }
   const skipped=candidates.length-channels.length;
   state.playlists.push({id,name:feed.name,count:channels.length,source:'url',url:remote,createdAt:new Date().toISOString()});
   state.channels.push(...channels);
   save();renderAll();
   return {status:'added',added:channels.length,skipped};
 }
 async function importSpanishAndLatam(button){
   button.disabled=true;
   const previous=button.textContent;
   const reports=[],errors=[];
   try{
     for(const feed of IPTV_ORG_FEEDS){
       if(state.playlists.some(p=>p.name===feed.name)){
         reports.push(feed.label+': ya estaba importada');
         continue;
       }
       let imported=false,lastError='';
       for(let i=0;i<feed.sources.length;i++){
         button.textContent=`Descargando ${feed.label} (${i+1}/${feed.sources.length})…`;
         try{
           const text=await fetchM3U(feed.sources[i]);
           const r=addUniqueCatalog(feed,text,feed.sources[i]);
           reports.push(`${feed.label}: ${r.added.toLocaleString('es-MX')} nuevos; ${r.skipped.toLocaleString('es-MX')} duplicados omitidos`);
           imported=true;
           break;
         }catch(err){lastError=err.message||String(err)}
       }
       if(!imported)errors.push(`${feed.label}: ${lastError}`);
     }
     if(reports.length){
       go('explore');
       // Mostrar todas las listas, para poder explorar y filtrar libremente.
       $('listFilter').value='';
       explorePage=1;
       renderExplore();
       toast('Catálogos procesados. Revisa los canales en Explorar.');
     }
     if(errors.length){
       alert('Una o más fuentes no pudieron cargarse. Tus listas, favoritos y selecciones anteriores siguen intactos.\n\n'+errors.join('\n')+'\n\nSi el navegador bloquea la conexión, puedes descargar spa.m3u y latam.m3u desde GitHub e importarlos desde «Mis listas → Desde Archivos».');
     }else if(reports.length){
       alert('Actualización terminada.\n\n'+reports.join('\n')+'\n\nPuedes revisar individualmente los canales en Explorar. La reproducción no está verificada.');
     }
   }finally{
     button.disabled=false;
     button.textContent=previous;
   }
 }
 async function importFromUrl(name,url,button){button.disabled=true;const prev=button.textContent;button.textContent='Descargando lista…';try{const txt=await fetchM3U(url);addList(name,txt,'url',url);go('explore');return true}catch(err){alert('No fue posible descargar la lista: '+err.message+'\n\nEs posible que el navegador bloquee la conexión por restricciones de origen (CORS), que el servidor no responda o que no haya Internet. Como alternativa, descarga el archivo M3U y utiliza «Desde Archivos».');return false}finally{button.disabled=false;button.textContent=prev}}
 $('formUrl').addEventListener('submit',async e=>{e.preventDefault();const url=safeUrl($('playlistUrl').value);if(!url){toast('Introduce una dirección HTTP(S) válida.');return}const ok=await importFromUrl($('urlName').value||url.split('/').pop(),url,$('formUrl').querySelector('[type=submit]'));if(ok)$('formUrl').reset()});
 $('quickSpanish').onclick=()=>importSpanishAndLatam($('quickSpanish'));
 $('categoryMore').onclick=()=>{categoryPage++;renderCategory()};$('categoryAllExplore').onclick=()=>{go('explore');$('categoryFilter').value=currentCategory;renderExplore()};
 $('playerChannelGroup').addEventListener('change',e=>changePlayerGroup(e.target.value));
 $('playerChannelSearch').addEventListener('input',renderPlayerGuide);
 $('epgGoSettings').onclick=()=>{closePlayer();go('settings');$('epgSettings').scrollIntoView({block:'start',behavior:'smooth'})};
 $('epgPreset').addEventListener('change',e=>{const v=EPG_PRESETS[e.target.value];$('epgUrl').value=v||'';$('epgUrl').disabled=!!v;});
 $('epgPreset').dispatchEvent(new Event('change'));
 $('epgLoad').onclick=loadEpg;
 $('epgFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;epgStatus('Leyendo XMLTV desde Archivos…');try{await readEpgFile(file)}catch(err){epgStatus('No se pudo importar la guía: '+err.message,true)}finally{e.target.value=''}});
 $('epgClear').onclick=async()=>{if(!epgLoaded)return;if(!confirm('¿Quitar solamente la guía de programación? No se borrará ningún canal ni favorito.'))return;epgIds=new Map();epgNames=new Map();epgLoaded=false;epgSource='';await epgCacheClear();epgCoverage();renderEpgForPlayer();epgStatus('La guía se ha quitado. Tus canales y favoritos no cambiaron.')};
 $('playerFullscreen').onclick=()=>{const v=$('video');if(v.requestFullscreen)v.requestFullscreen().catch(()=>toast('La pantalla completa no está disponible aquí.'));else if(v.webkitEnterFullscreen)v.webkitEnterFullscreen()};
 $('playerBackdrop').onclick=closePlayer;$('closePlayer').onclick=closePlayer;$('previousChannel').onclick=()=>jumpPlayer(-1);$('nextChannel').onclick=()=>jumpPlayer(1);
 $('video').addEventListener('error',()=>{$('playStatus').textContent=isIOS?'La señal no se puede reproducir aquí. Prueba «Abrir en VLC».':'La señal no se puede reproducir aquí. Pulsa «Descargar para VLC» y abre el archivo en el reproductor.';$('playStatus').classList.remove('hidden')});$('video').addEventListener('playing',()=>$('playStatus').classList.add('hidden'));
 $('playerFavorite').onclick=()=>{if(playerChannelId)updateChannel(playerChannelId,c=>{c.favorite=!c.favorite})};$('playerKeep').onclick=()=>{if(playerChannelId)updateChannel(playerChannelId,c=>{c.decision='keep'})};$('playerRemove').onclick=()=>{if(playerChannelId)updateChannel(playerChannelId,c=>{c.decision='remove'})};
 $('copyStream').onclick=()=>copyStreamAddress(state.channels.find(x=>x.id===playerChannelId));
 $('exportKept').onclick=()=>exportM3U('keep');$('exportFavorites').onclick=()=>exportM3U('favorite');
 $('backupBtn').onclick=()=>download('Mi_IPTV_respaldo_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(snapshot(),null,2),'application/json');
 $('restoreFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const v=JSON.parse(await file.text());if(!Array.isArray(v.playlists)||!Array.isArray(v.channels))throw new Error('Copia no válida');if(!confirm('¿Reemplazar tus listas y decisiones actuales con esta copia?'))return;state.playlists=v.playlists;state.channels=v.channels;state.trash=Array.isArray(v.trash)?v.trash:[];state.recent=Array.isArray(v.recent)?v.recent:[];save();renderAll();toast('Copia restaurada')}catch(err){toast('No se pudo restaurar: '+err.message)}finally{e.target.value=''}});
 $('emptyTrash').onclick=()=>{if(!state.trash.length){toast('La papelera está vacía.');return}if(confirm(`¿Eliminar definitivamente ${state.trash.length} canales de la papelera? Primero guarda una copia de seguridad si deseas poder recuperarlos.`)){state.trash=[];save();renderTrash();toast('Papelera vaciada')}};
 $('deleteAll').onclick=()=>{if(confirm('¿Eliminar todas las listas, selecciones y favoritos? Guarda primero un respaldo JSON. Esta acción no se puede deshacer.')){state.playlists=[];state.channels=[];state.trash=[];state.recent=[];save();renderAll();toast('Datos eliminados')}};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&playerChannelId)closePlayer();else if(playerChannelId&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&!e.ctrlKey&&!e.metaKey){if(e.key==='ArrowUp'||e.key==='ArrowRight'){e.preventDefault();jumpPlayer(1)}else if(e.key==='ArrowDown'||e.key==='ArrowLeft'){e.preventDefault();jumpPlayer(-1)}}});
 }
 async function boot(){setupEvents();const loaded=await readPersist();if(loaded&&Array.isArray(loaded.playlists)&&Array.isArray(loaded.channels)){state.playlists=loaded.playlists;state.channels=loaded.channels;state.trash=Array.isArray(loaded.trash)?loaded.trash:[];state.recent=Array.isArray(loaded.recent)?loaded.recent:[];}else{try{addList('43 canales originales',window.IPTV_DEMO_M3U,'builtin')}catch(e){console.warn('No se pudo preparar la lista inicial:',e)}}go('home');const epgOld=await epgCacheRead();if(epgOld){try{restoreCompactEpg(epgOld)}catch(e){epgStatus('No se pudo restaurar la guía compacta: '+e.message,true)}}else{epgStatus('La guía se carga solo cuando la solicitas. Si tenías una guía de V1.7, actualízala una vez para utilizar el nuevo formato rápido.')}$('installStatus').textContent=location.protocol==='https:'?'Puedes abrir Mi IPTV desde Chrome o añadirla a la pantalla de inicio.':'Para instalar como app, publica la carpeta en un servicio HTTPS. Abrir el HTML desde Archivos o iZip puede limitar sus funciones.';if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('./sw.js').catch(e=>console.warn(e));}
 boot();
})();
