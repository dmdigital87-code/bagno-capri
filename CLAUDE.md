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
- **Software**: Chrome aperto sul gestionale + app **RawBT** in background
- **Configurazione stampante in RawBT**: nome `lan_printer`, IP `192.168.1.160:9100`, driver `ESC/POS general`, larghezza **576 dot** (NON 384)
- Gli iPhone/iPad dei camerieri prendono solo gli ordini, **non stampano**

### Soluzione DEFINITIVA (v3, commit `577239c`) — stampa all'invio ordine

La stampa parte dentro `sendOrder()` in `index.html`, riga ~2526, subito dopo `orders.push(order)`:

```js
orders.push(order);
if(window.RBPrint) RBPrint.printOrder(order);   // ← aggancio v3
history.push(Object.assign({},order,{status:'in-corso'}));
```

`printOrder()` stampa solo se `navigator.userAgent` contiene Android; su iOS non fa nulla (nessun errore). Chrome permette `rawbt:` perché la chiamata avviene dentro il gesto del tocco "invia".

L'aggancio `RBPrint.onOrders` nel listener Firebase (riga ~1415) è stato **rimosso** per evitare doppie comande.

### Perché iOS non può stampare (vincolo permanente)

- Safari iOS non può aprire socket TCP/9100 (sandbox Apple)
- RawBT non esiste per iOS
- Tutti i browser iOS (Chrome, Firefox…) usano il motore WebKit di Safari: cambiare browser non aiuta
- Vincolo permanente, non aggirabile lato browser

### Perché le versioni precedenti sono superate — non riproporle

| Versione | Approccio | Perché non va |
|---|---|---|
| v1 | iframe + coda automatica da listener Firebase | Chrome blocca `rawbt:` senza gesto utente e dentro iframe |
| v2 (commit `fbf7754`) | pulsante arancione tap-to-print in cucina | funzionava, ma il banco è incustodito → nessuno preme il pulsante |
| **v3 (commit `577239c`)** | **stampa dentro `sendOrder()`, gesto "invia"** | **soluzione definitiva** |

### Integrazione nel codice
- **File modulo**: `bagno-print.js`, caricato in fondo a `index.html`:
  ```html
  <script src="bagno-print.js"></script>
  ```
- **Aggancio**: dentro `sendOrder()` (riga ~2526), dopo `orders.push(order)`
- **Listener Firebase**: riga ~1415 ripristinata senza chiamate RBPrint

### Logica scontrini
- **3 scontrini per ordine**: 2× CUCINA + 1× BAR (commit `4189bfd`)
- **Divisione per categoria**: solo `"Bevande"` va al BAR, tutto il resto va in CUCINA
- La costante `BAR_CATS` in cima a `bagno-print.js` controlla l'assegnazione
- Gli scontrini vuoti vengono saltati

### Regole ESC/POS critiche
- **Taglio**: `GS V 65 0` (funzione B) — la forma corta `GS V 0` NON taglia su questa Ditron
- **Encoding testo**: Windows-1252, non UTF-8
- **Larghezza riga**: 48 caratteri (Font A)

### API pubblica di `bagno-print.js`
| Funzione | Descrizione |
|---|---|
| `RBPrint.printOrder(order)` | Stampa immediata di un ordine (usato da `sendOrder`) |
| `RBPrint.reprint(order)` | Ristampa manuale di un ordine specifico |
| `RBPrint.test()` | Stampa di prova |

### Stato e test da fare

**Codice committato e online — NON ancora testato sul campo.**

Test da fare all'apertura (domani), sull'Android al banco:
1. Ricaricare la pagina
2. Prendere un ordine misto → premere Invia → devono uscire 2 scontrini (CUCINA + BAR) subito
3. Solo bevande → solo BAR
4. Da iPhone → non stampa, nessun errore

### Decisione operativa aperta
Confermare col proprietario che battere gli ordini sull'**Android al banco** (non sull'iPad al tavolo) va bene per il loro flusso. Se serve mobilità, alternativa = un Android in mano al cameriere con la stessa logica.

### Possibile sviluppo futuro (NON ancora fatto)
Stampa 100% automatica via RawBT come **servizio di stampa di sistema Android** (fuori dal browser). Eliminerebbe il vincolo del gesto utente. Da valutare — richiede verifica documentazione RawBT.

---

## Pannello impostazioni (dal 2026-06-15)

### Accesso
- Pulsante **⚙️** nell'header, prima di "🔑 PIN" ed "⏻ Esci"
- Apre il modal `#settings-modal` — accesso libero, nessun PIN richiesto

### Toggle "Mostra note cucina"
- **Default OFF** — il campo "Allergie, cotture... (* = surgelato)" è nascosto di default
- Salva in `localStorage` chiave `'bc_settings'` (oggetto JSON con `showKitchenNotes: bool`)
- Sincronizza su Firebase al path `bagno_capri/settings` (cross-device)
- Il blocco da mostrare/nascondere ha `id="cart-kitchen-notes"` e contiene header + textarea

### Funzioni JS aggiunte
| Funzione | Descrizione |
|---|---|
| `openSettings()` | Apre il modal e sincronizza lo stato del toggle con localStorage |
| `closeSettings()` | Chiude il modal |
| `getSettings()` | Legge `bc_settings` da localStorage, default `{ showKitchenNotes: false }` |
| `saveSettings(s)` | Salva in localStorage + scrive su Firebase `bagno_capri/settings` |
| `toggleKitchenNotes(on)` | Handler del toggle: aggiorna settings e applica visibilità |
| `applyKitchenNotesVisibility()` | Mostra/nasconde `#cart-kitchen-notes` in base a `getSettings()` |

### Punti di chiamata di `applyKitchenNotesVisibility()`
- **Boot**: dentro `unlockApp()` — si applica subito dopo il login con PIN
- **Firebase sync**: nel listener `fbListen`, quando arriva `data.settings` — aggiorna localStorage e ri-applica

### Commit e deploy
- Commit locale: `0c171ff` — "Aggiunge pannello impostazioni + toggle 'Mostra note cucina' (default off)"
- Pushato in produzione il 15 giugno 2026; sync cross-device confermato funzionante
- Nota storica: il commit `4189bfd` ("2 copie cucina + 1 bar per ordine", 23 maggio) era rimasto solo locale ed è stato pushato in produzione la stessa sera del 15 giugno
