/* ============================================================
   Bagno Capri — Stampa comande RawBT (ESC/POS)  v2
   Chrome Android blocca rawbt: senza gesto utente e dentro iframe.
   Quindi: ogni nuovo ordine accende un PULSANTE in cucina; l'operatore
   al banco lo tocca e parte la stampa (location.href, metodo testato).
   2 scontrini per ordine (CUCINA + BAR), salta i vuoti. Solo su Android.
   ============================================================ */
(function () {
  'use strict';

  var BAR_CATS = ['Bevande'];                 // tutto il resto -> CUCINA
  function isAndroid() { return /Android/i.test(navigator.userAgent); }

  // --- Windows-1252 (la stampante vuole byte singoli, non UTF-8) ---
  function cp1252(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c === 0x20AC) out.push(0x80);
      else if (c <= 0xFF) out.push(c);
      else out.push(0x3F);
    }
    return out;
  }

  var ESC = 0x1B, GS = 0x1D;
  var INIT = [ESC,0x40], CENTER=[ESC,0x61,1], LEFT=[ESC,0x61,0];
  var BIG=[GS,0x21,0x11], NORMAL=[GS,0x21,0x00];
  var BOLD_ON=[ESC,0x45,1], BOLD_OFF=[ESC,0x45,0];
  var CUT=[GS,0x56,65,0];                      // GS V 65 0  (funzione B, testato)
  var LINE='------------------------------------------------';

  function txt(s){return cp1252(s);}
  function nl(n){var a=[];n=n||1;while(n--)a.push(0x0A);return a;}
  function spotLabel(t){if(!t)return'';var c=String(t).charAt(0).toUpperCase(),n=String(t).slice(1);
    if(c==='T')return'Tavolo '+n; if(c==='O')return'Ombrellone '+n; return String(t);}
  function hhmm(ms){var d=new Date(ms||Date.now());function p(x){return(x<10?'0':'')+x;}
    return p(d.getHours())+':'+p(d.getMinutes());}

  function buildTicket(order,label,items){
    var b=[];function push(a){b=b.concat(a);}
    push(INIT);push(CENTER);push(BIG);push(txt(label));push(nl());push(NORMAL);
    push(txt('Bagno Capri'));push(nl());push(LEFT);push(txt(LINE));push(nl());
    push(BIG);var head=spotLabel(order.table);if(order.orderNum)head+='  #'+order.orderNum;
    push(txt(head));push(nl());push(NORMAL);
    push(txt('Coperti: '+(order.coperti||'-')+'   '+hhmm(order.time)));push(nl());
    push(txt(LINE));push(nl());
    for(var i=0;i<items.length;i++){var it=items[i];
      push(BOLD_ON);push(txt((it.qty||1)+'x '+(it.name||'')));push(nl());push(BOLD_OFF);
      if(it.removed&&it.removed.length)for(var r=0;r<it.removed.length;r++){push(txt('   - '+it.removed[r]));push(nl());}
      if(it.extra&&it.extra.length)for(var e=0;e<it.extra.length;e++){push(txt('   + '+it.extra[e]));push(nl());}
    }
    push(txt(LINE));push(nl());
    if(order.note&&String(order.note).trim()){push(BOLD_ON);push(txt('NOTE: '+order.note));push(nl());push(BOLD_OFF);push(txt(LINE));push(nl());}
    push(nl(4));push(CUT);return b;
  }
  function buildOrder(order){
    var items=order.items||[],bar=[],cuc=[];
    for(var i=0;i<items.length;i++)(BAR_CATS.indexOf(items[i].cat)>=0?bar:cuc).push(items[i]);
    var out=[];
    if(cuc.length)out=out.concat(buildTicket(order,'CUCINA',cuc));
    if(bar.length)out=out.concat(buildTicket(order,'BAR',bar));
    return out;
  }
  function toB64(bytes){var bin='';for(var i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin);}

  // Invio diretto: SOLO dentro un gesto utente (tocco del pulsante). Metodo testato.
  function sendNow(bytes){ if(bytes&&bytes.length) window.location.href='rawbt:base64,'+toB64(bytes); }

  // --- Coda di ordini in attesa di stampa (mostrati come pulsante) ---
  var pending = [];      // [{id, label, bytes}]
  var KEY='rbPrintedOrderIds', printed={}, seeded=false;
  try{(JSON.parse(localStorage.getItem(KEY)||'[]')||[]).forEach(function(id){printed[id]=1;});}catch(e){}
  function persist(){try{var ids=Object.keys(printed);if(ids.length>800)ids=ids.slice(ids.length-800);
    printed={};ids.forEach(function(id){printed[id]=1;});localStorage.setItem(KEY,JSON.stringify(ids));}catch(e){}}
  function listOf(d){if(!d)return[];if(Array.isArray(d))return d.filter(Boolean);
    return Object.keys(d).map(function(k){return d[k];}).filter(Boolean);}

  // --- UI: pulsante fisso in basso, compare quando c'e' da stampare ---
  var btn;
  function ensureBtn(){
    if(btn)return;
    btn=document.createElement('button');
    btn.id='rbPrintBtn';
    btn.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:20px;z-index:99999;'+
      'background:#ff5a00;color:#fff;border:0;border-radius:16px;padding:18px 28px;font-size:18px;'+
      'font-weight:800;box-shadow:0 6px 24px rgba(0,0,0,.4);display:none;cursor:pointer;'+
      'font-family:-apple-system,system-ui,sans-serif;animation:rbPulse 1.1s infinite';
    var st=document.createElement('style');
    st.textContent='@keyframes rbPulse{0%,100%{opacity:1}50%{opacity:.55}}';
    document.head.appendChild(st);
    btn.addEventListener('click',function(){
      var job=pending.shift();
      if(job){ sendNow(job.bytes); }   // parte nel gesto -> Chrome lo permette
      refreshBtn();
    });
    document.body.appendChild(btn);
  }
  function refreshBtn(){
    ensureBtn();
    if(pending.length){
      var next=pending[0];
      btn.textContent='🖨️ STAMPA '+next.label+(pending.length>1?'  (+'+(pending.length-1)+')':'');
      btn.style.display='block';
    }else{ btn.style.display='none'; }
  }

  function onOrders(ordersData){
    if(!isAndroid())return;                    // solo l'Android al banco mostra il pulsante
    var list=listOf(ordersData);
    if(!seeded){ list.forEach(function(o){if(o&&o.id!=null)printed[String(o.id)]=1;}); persist(); seeded=true; return; }
    var added=false;
    list.forEach(function(o){
      if(!o||o.id==null)return;
      var id=String(o.id);
      if(o.status==='pending'&&!printed[id]){
        printed[id]=1;
        var bytes=buildOrder(o);
        if(bytes.length){ pending.push({id:id,label:spotLabel(o.table),bytes:bytes}); added=true; }
      }
    });
    if(added){ persist(); refreshBtn(); }
  }

  window.RBPrint={
    onOrders:onOrders,
    reprint:function(order){ sendNow(buildOrder(order)); },      // ristampa manuale (dentro un click)
    test:function(){ sendNow(buildOrder({
      table:'O5',orderNum:1,coperti:2,time:Date.now(),note:'senza glutine',
      items:[{qty:2,name:'Cheeseburger',cat:'Panini',removed:['Ketchup'],extra:['Bacon']},
             {qty:1,name:'Caffè',cat:'Bevande',extra:['Sambuca']}]})); }
  };
})();
