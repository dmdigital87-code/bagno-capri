/* ============================================================
   Bagno Capri — Stampa comande RawBT (ESC/POS)
   Genera 2 scontrini per ordine: CUCINA + BAR (salta i vuoti).
   Stampa SOLO sul dispositivo Android al banco (gli iOS dei
   camerieri non stampano). Anti-doppione + niente arretrato.
   ============================================================ */
(function () {
  'use strict';

  // --- Quali categorie vanno al BAR. Tutto il resto -> CUCINA. ---
  var BAR_CATS = ['Bevande'];

  // --- Solo l'Android al banco stampa ---
  function isAndroid() { return /Android/i.test(navigator.userAgent); }

  // --- Windows-1252: la stampante vuole byte singoli, non UTF-8 ---
  function cp1252(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c === 0x20AC) out.push(0x80);        // €
      else if (c <= 0xFF) out.push(c);          // ASCII + accenti à è ì ò ù é
      else out.push(0x3F);                      // '?'
    }
    return out;
  }

  // --- Comandi ESC/POS ---
  var ESC = 0x1B, GS = 0x1D;
  var INIT     = [ESC, 0x40];          // ESC @  reset
  var CENTER   = [ESC, 0x61, 1];       // ESC a 1
  var LEFT     = [ESC, 0x61, 0];       // ESC a 0
  var BIG      = [GS, 0x21, 0x11];     // GS ! 0x11  doppia altezza+larghezza
  var NORMAL   = [GS, 0x21, 0x00];     // GS ! 0x00  normale
  var BOLD_ON  = [ESC, 0x45, 1];       // ESC E 1
  var BOLD_OFF = [ESC, 0x45, 0];       // ESC E 0
  var CUT      = [GS, 0x56, 65, 0];    // GS V 65 0  taglio pieno (funzione B)
  var LINE     = '------------------------------------------------'; // 48 col (Font A, 80mm)

  function txt(s) { return cp1252(s); }
  function nl(n) { var a = []; n = n || 1; while (n--) a.push(0x0A); return a; }

  function spotLabel(t) {
    if (!t) return '';
    var c = String(t).charAt(0).toUpperCase(), n = String(t).slice(1);
    if (c === 'T') return 'Tavolo ' + n;
    if (c === 'O') return 'Ombrellone ' + n;
    return String(t);
  }
  function hhmm(ms) {
    var d = new Date(ms || Date.now());
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // Costruisce i byte di UNO scontrino (CUCINA o BAR) per un ordine
  function buildTicket(order, label, items) {
    var b = [];
    function push(a) { b = b.concat(a); }

    push(INIT);
    push(CENTER); push(BIG);
    push(txt(label)); push(nl()); push(NORMAL);
    push(txt('Bagno Capri')); push(nl());
    push(LEFT);
    push(txt(LINE)); push(nl());

    push(BIG);
    var head = spotLabel(order.table);
    if (order.orderNum) head += '  #' + order.orderNum;
    push(txt(head)); push(nl()); push(NORMAL);
    push(txt('Coperti: ' + (order.coperti || '-') + '   ' + hhmm(order.time))); push(nl());
    push(txt(LINE)); push(nl());

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      push(BOLD_ON);
      push(txt((it.qty || 1) + 'x ' + (it.name || ''))); push(nl());
      push(BOLD_OFF);
      var r, e;
      if (it.removed && it.removed.length)
        for (r = 0; r < it.removed.length; r++) { push(txt('   - ' + it.removed[r])); push(nl()); }
      if (it.extra && it.extra.length)
        for (e = 0; e < it.extra.length; e++) { push(txt('   + ' + it.extra[e])); push(nl()); }
    }

    push(txt(LINE)); push(nl());
    if (order.note && String(order.note).trim()) {
      push(BOLD_ON); push(txt('NOTE: ' + order.note)); push(nl()); push(BOLD_OFF);
      push(txt(LINE)); push(nl());
    }
    push(nl(4));
    push(CUT);
    return b;
  }

  // Tutti gli scontrini (cucina + bar) di un ordine, saltando i vuoti
  function buildOrder(order) {
    var items = order.items || [], bar = [], cuc = [];
    for (var i = 0; i < items.length; i++)
      (BAR_CATS.indexOf(items[i].cat) >= 0 ? bar : cuc).push(items[i]);
    var out = [];
    if (cuc.length) out = out.concat(buildTicket(order, 'CUCINA', cuc));
    if (bar.length) out = out.concat(buildTicket(order, 'BAR', bar));
    return out;
  }

  function toB64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  // Invio a RawBT con CODA: uno scontrino alla volta, ~1.4s di distanza,
  // tramite iframe nascosto (non fa "navigare" la pagina). Così due ordini
  // ravvicinati escono entrambi in fila invece di sovrascriversi.
  var SEND_GAP_MS = 1400;
  var queue = [], sending = false;

  function sendOne(bytes) {
    var uri = 'rawbt:base64,' + toB64(bytes);
    var ifr = document.createElement('iframe');
    ifr.style.display = 'none';
    ifr.src = uri;
    document.body.appendChild(ifr);
    setTimeout(function () {
      try { document.body.removeChild(ifr); } catch (e) {}
    }, 1000);
  }

  function pump() {
    if (!queue.length) { sending = false; return; }
    sending = true;
    sendOne(queue.shift());
    setTimeout(pump, SEND_GAP_MS);
  }

  // Accoda UN ordine completo come singolo job (cucina+bar restano insieme,
  // già separati dai rispettivi tagli al loro interno).
  function fireRawBT(bytes) {
    if (!bytes || !bytes.length) return;
    queue.push(bytes);
    if (!sending) pump();
  }

  // --- Anti-doppione persistente + seed (niente arretrato al load) ---
  var KEY = 'rbPrintedOrderIds', printed = {}, seeded = false;
  try {
    (JSON.parse(localStorage.getItem(KEY) || '[]') || [])
      .forEach(function (id) { printed[id] = 1; });
  } catch (e) {}

  function persist() {
    try {
      var ids = Object.keys(printed);
      if (ids.length > 800) ids = ids.slice(ids.length - 800);
      printed = {}; ids.forEach(function (id) { printed[id] = 1; });
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch (e) {}
  }

  function listOf(d) {
    if (!d) return [];
    if (Array.isArray(d)) return d.filter(Boolean);
    return Object.keys(d).map(function (k) { return d[k]; }).filter(Boolean);
  }

  // Da chiamare a ogni aggiornamento ordini ricevuto da Firebase
  function onOrders(ordersData) {
    if (!isAndroid()) return;                 // solo l'Android al banco
    var list = listOf(ordersData);
    if (!seeded) {                            // 1° giro dopo il load: marca l'esistente, NON stampa
      list.forEach(function (o) { if (o && o.id != null) printed[String(o.id)] = 1; });
      persist(); seeded = true; return;
    }
    var any = false;
    list.forEach(function (o) {
      if (!o || o.id == null) return;
      var id = String(o.id);
      if (o.status === 'pending' && !printed[id]) {
        printed[id] = 1;
        fireRawBT(buildOrder(o));   // un job per ordine -> la coda li spazia
        any = true;
      }
    });
    if (any) persist();
  }

  // API pubblica
  window.RBPrint = {
    onOrders: onOrders,
    reprint: function (order) { fireRawBT(buildOrder(order)); },   // ristampa manuale di un ordine
    test: function () {                                            // stampa di prova (anche da desktop)
      fireRawBT(buildOrder({
        table: 'O5', orderNum: 1, coperti: 2, time: Date.now(), note: 'senza glutine',
        items: [
          { qty: 2, name: 'Cheeseburger', cat: 'Panini', removed: ['Ketchup'], extra: ['Bacon'] },
          { qty: 1, name: 'Caffè', cat: 'Bevande', extra: ['Sambuca'] }
        ]
      }));
    }
  };
})();
