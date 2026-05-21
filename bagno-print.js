/* ============================================================
   Bagno Capri — Stampa comande RawBT (ESC/POS)  v3
   Stampa AL MOMENTO DELL'INVIO ordine (dentro il tocco "invia"),
   non alla ricezione Firebase. Cosi' Chrome permette rawbt: perche'
   c'e' il gesto utente. Gli ordini si prendono sull'Android al banco.
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
  var CUT=[GS,0x56,65,0];                      // GS V 65 0 (funzione B, testato)
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

  // Invio diretto a RawBT. Va chiamato DENTRO un gesto utente (tocco "invia"),
  // dove Chrome permette lo schema rawbt:. Metodo testato e funzionante.
  function sendNow(bytes){ if(bytes&&bytes.length) window.location.href='rawbt:base64,'+toB64(bytes); }

  // API pubblica
  window.RBPrint = {
    // Da chiamare in sendOrder(), subito dopo orders.push(order).
    // Stampa i 2 scontrini SOLO se siamo sull'Android (il device al banco).
    printOrder: function(order){
      if(!isAndroid()) return;          // iPhone/iPad: non stampano, nessun errore
      try { sendNow(buildOrder(order)); } catch(e) {}
    },
    // Ristampa manuale (va comunque chiamata da un click/tocco).
    reprint: function(order){ if(isAndroid()) sendNow(buildOrder(order)); },
    // Prova rapida.
    test: function(){ sendNow(buildOrder({
      table:'O5',orderNum:1,coperti:2,time:Date.now(),note:'senza glutine',
      items:[{qty:2,name:'Cheeseburger',cat:'Panini',removed:['Ketchup'],extra:['Bacon']},
             {qty:1,name:'Caffè',cat:'Bevande',extra:['Sambuca']}]})); }
  };
})();
