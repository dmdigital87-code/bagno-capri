# Bagno Capri — Gestionale Ordini

## Stampante termica comande (FUNZIONANTE dal 2026-05-21)

### Hardware
- **Modello**: Ditron SOL801, 80mm, ESC/POS
- **Connessione**: solo Ethernet, IP fisso `192.168.1.160` porta `9100`
- **MAC**: `00-2e-32-9e-6a-6c`
- **Codepage**: WPC1252 (confermato: accenti à è ì ò ù é e € corretti)
- NON ha pagina web admin

### Bridge di stampa
- **Dispositivo**: vecchio Android fisso al banco
- **Software**: Chrome aperto sul gestionale (vista Cucina) + app **RawBT** in background
- **Configurazione stampante in RawBT**: nome `lan_printer`, IP `192.168.1.160:9100`, driver `ESC/POS general`, larghezza **576 dot** (NON 384)
- Gli iPhone/iPad dei camerieri prendono solo gli ordini, **non stampano**

### Integrazione nel codice
- **File modulo**: `bagno-print.js`, caricato in fondo a `index.html`:
  ```html
  <script src="bagno-print.js"></script>
  ```
- **Aggancio Firebase** — dentro il listener `if (data.orders) { ... }`, subito dopo `orders = data.orders;`:
  ```js
  if (window.RBPrint) RBPrint.onOrders(data.orders);
  ```

### Logica scontrini
- **2 scontrini per ordine**: CUCINA + BAR
- **Divisione per categoria**: solo la categoria `"Bevande"` va al BAR, tutto il resto va in CUCINA
- La costante `BAR_CATS` in cima a `bagno-print.js` controlla l'assegnazione
- Gli scontrini vuoti vengono saltati

### Regole ESC/POS critiche
- **Taglio**: `GS V 65 0` (funzione B) — la forma corta `GS V 0` NON taglia su questa Ditron
- **Encoding testo**: Windows-1252, non UTF-8
- **Larghezza riga**: 48 caratteri (Font A)

### Lezione fondamentale: Chrome Android blocca `rawbt:`

Chrome Android **blocca lo schema `rawbt:`** se parte senza gesto utente, e lo ignora dentro un `<iframe>` (da Chrome 25+). Quindi la stampa 100% automatica all'arrivo dell'ordine dentro il browser **NON è possibile**.

**Soluzione adottata (v2, commit `fbf7754`)**: tap-to-print
- Ogni nuovo ordine accende un pulsante arancione lampeggiante in cucina
- L'operatore lo tocca → parte la stampa via `location.href` (con gesto utente Chrome lo permette)

**La v1 con iframe + coda automatica NON funziona — non riproporla.**

### Anti-doppione e anti-arretrato
- `order.id` già stampati salvati in `localStorage` (chiave `rbPrintedOrderIds`)
- Al primo caricamento (seed) gli ordini già presenti vengono marcati come visti **senza stampare**
- Il pulsante compare solo per ordini che arrivano **dopo** il load della pagina

### API pubblica di `bagno-print.js`
| Funzione | Descrizione |
|---|---|
| `RBPrint.onOrders(data)` | Chiamata dal listener Firebase ad ogni aggiornamento |
| `RBPrint.reprint(order)` | Ristampa manuale di un ordine specifico |
| `RBPrint.test()` | Stampa di prova |

### Test superati il 2026-05-21 (condizioni reali)
- Ordine misto → 2 scontrini OK
- Solo bevande → solo BAR OK
- Ricarica pagina → nessun arretrato ristampato OK
- iPhone non stampa OK

### Possibile sviluppo futuro (NON ancora fatto)
Stampa 100% automatica via RawBT come **servizio di stampa di sistema Android** (fuori dal browser). Da valutare — richiede verifica documentazione RawBT.
