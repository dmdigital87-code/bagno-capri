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

---

## Campo cliente per sessione tavolo (dal 2026-06-15)

### Cos'è
Ogni ordine può avere un nome cliente associato (es. "Rossi"). È una proprietà di sessione tavolo: vive negli order, sparisce quando la sessione chiude. Visibile nel carrello, in vista cucina, e stampato sullo scontrino.

### Implementazione
- Variabile globale `cliente` (string, default '') in index.html riga ~2210
- Campo input `#cart-cliente` dentro `#cart-cliente-row` nel cart-panel (riga ~1565), placeholder "es. Rossi"
- Handler `updateCliente(v)` trimma e salva nella variabile globale
- Salvato in `order.cliente` dentro `sendOrder()` (riga ~2609)

### Autofill da ultimo ordine sessione
In `selectTable()` (riga ~2421-2431):
- Filtra ordini pending del tavolo
- Ordina per `time` decrescente
- Prende il latest e copia `cliente` e `coperti` nei rispettivi state/UI
- Se il tavolo è vuoto, resetta a '' e 0

### Reset
- `closeCart()`: azzera cliente e l'input
- Selezione di altro tavolo: vedi selectTable

### Vista cucina
Nelle card di `renderKitchen()` il nome compare inline accanto al tavolo: "Spiaggia 1 — Rossi" (con escape HTML inline su o.cliente per sicurezza, perché non esiste funzione escapeHtml nel codice).

### Stampa
In `bagno-print.js` funzione `buildTicket`, dopo la riga Coperti: "Cliente: Rossi" in grassetto, stampata SOLO se `order.cliente` non è vuoto/whitespace.

### Commit di riferimento (15 giugno 2026)
- `79f581e`: campo cliente in app + autofill coperti
- `cbb1cd3`: fix leggibilità dark mode input Cliente
- `d34e230`: fix leggibilità dark mode nomi piatti in "Già in cucina"
- `281ab24`: nome cliente sullo scontrino

### Lezione raccolta
Lo stile inline `background:white` hardcoded è un anti-pattern in app multi-tema: in dark mode il testo eredita un colore chiaro dal body e diventa bianco-su-bianco. Sempre usare `var(--white)` + `color:var(--text)` per elementi con sfondo chiaro fisso. Punti correnti dell'app da auditare se servono altri fix: ogni elemento con stile inline e fondo chiaro fisso.

### Stato test
Testato su Mac (Chrome + Safari). Stampa sull'Android NON ancora testata (in attesa disponibilità proprietario). I tre scontrini devono includere "Cliente: <nome>" sotto Coperti se il campo è valorizzato.

---

## Gestione dinamica categorie menu (dal 2026-06-15)

### Modello dati
- Nuova variabile globale `categories` (array di stringhe in ordine), salvata in localStorage chiave `mmt_categories` e sincronizzata via Firebase al path `bagno_capri/categories` accanto a menu/orders/settings.
- Default in caso di assenza: `['Panini','Primi','Insalatone','Piatti Freddi','Piatti Caldi','Contorni','Bevande']`.
- I piatti continuano ad avere `item.cat` come stringa (NO modifiche al modello piatto). `categories` è solo l'array di ordine + presenza.

### Retro-compatibilità
`getCats()` usa `categories` se presente, altrimenti fa fallback al vecchio comportamento derivato (unique su `menu.map(i => i.cat)`). Quindi anche dati Firebase vecchi senza categories continuano a funzionare.

### UI gestione (modal #categories-modal)
- Aperto da bottone "🏷️ Categorie" nel tab Menu (accanto a "+ Aggiungi Piatto")
- Mostra lista categorie con: conteggio piatti, frecce ↑↓ per riordinare, ✏️ per rinominare (con prompt), 🗑️ per eliminare
- Input + bottone "Aggiungi" in cima per creare nuova categoria
- Frecce disabilitate ai bordi (Panini non può salire, Bevande non può scendere)
- Rinomina aggiorna anche `item.cat` di tutti i piatti che usano quella categoria (evita piatti orfani)
- Elimina ha due varianti di conferma: solo categoria se vuota, "categoria + N piatti IRREVERSIBILE" se ha piatti — i piatti vengono cancellati insieme alla categoria

### Funzioni nuove
`openCategoriesModal`, `closeCategoriesModal`, `renderCategoriesList`, `addCategory`, `moveCategory(idx, delta)`, `renameCategory(idx)`, `deleteCategory(idx)`

### Select del modal Add/Edit piatto: ora dinamico
Il `<select id="new-item-cat">` non ha più `<option>` hardcoded. Le opzioni vengono popolate dinamicamente da `categories` ogni volta che il modal apre, sia in `openAddItemModal` che in `openEditItemModal`. Nel caso di edit di un piatto la cui categoria non è più nell'array (caso limite, post-eliminazione), viene aggiunta come opzione extra per non perdere l'associazione.

### Commit di riferimento (15 giugno 2026)
- `c636602`: refactor invisibile — array categories esplicito, retro-compat, app invariata
- `67dfcc3`: UI gestione categorie menu (crea/rinomina/elimina/riordina con frecce)

### Stato test
Testato sul Mac (Chrome + Safari): apertura modal, crea/rinomina/riordina/elimina (con e senza piatti), sync filtro carrello, persistenza dopo ricarica. Sync cross-device NON ancora testato (proprietario disponibile dopo).

### Richiesta cliente ancora aperta
Gestione dinamica TAVOLI (aggiungere/togliere/nominare/spostare sulla mappa). Da affrontare in sessione dedicata, fuori stagione o in giornata tranquilla. Più rischiosa delle categorie perché la mappa è hardcoded come array `MAP_SPOTS`.

---

## Riordino piatti del menu (dal 2026-06-16)

### Funzionalità
Nel tab Menu, ogni piatto ha una colonna verticale ↑↓ a sinistra dell'emoji per essere riordinato nell'array `menu`. Lo spostamento è globale (slegato dalla categoria): un piatto può essere spostato ovunque nell'array, ma la sua `cat` resta invariata.

### Effetto a cascata
L'ordine dell'array `menu` si riflette automaticamente nella vista carrello (renderMenuGrid) perché entrambe le funzioni iterano direttamente sull'array senza sort. Spostare un piatto nel tab Menu lo sposta anche nei filtri categoria del cameriere.

### Funzione nuova
`moveMenuItem(id, delta)` usa findIndex per ID (stabile anche se l'array cambia per sync Firebase tra un click e l'altro), scambia con menu[idx±1], save() + renderMenuManager + renderMenuGrid + renderCatTabs.

### Commit di riferimento
- `8d2c66f`: Aggiunge frecce ↑↓ per riordinare i piatti nel tab Menu

---

## Gestione dinamica tavoli (dal 2026-06-16) — in corso

### Stato
- Commit 1 FATTO (`2488541`): persistence MAP_SPOTS + rinomina tavoli
- Commit 2 FATTO (`8443f41`): elimina tavolo con blocco se sessione attiva
- Commit 3 DA FARE in sessione futura: crea nuovo tavolo + sposta posizione

### Persistence
- MAP_SPOTS era `const`, ora `let` con fallback localStorage chiave `mmt_spots`
- Salvato in `_writeLocal` + `fbSave` (chiave Firebase `spots`, lowercase per convention)
- Listener Firebase legge `data.spots` → aggiorna MAP_SPOTS + localStorage + renderTableGrid

### UI accesso
Bottone ⚙️ Impostazioni → sezione "Gestione tavoli" → bottone "🪑 Gestisci" apre modal `#spots-modal`.

### Funzioni
- `renameSpot(id)`: prompt nuovo label, modifica spot.label, save, render
- `deleteSpot(id)`: blocca se `orders.some(o.table===id && o.status==='pending')`; altrimenti conferma + filter MAP_SPOTS + save + render
- `getSpotLabel` modificato con fallback `id || '?'` per spot eliminati (gli ordini storici di tavoli cancellati mostrano l'id grezzo)

### TASK CHIUSO: ridondanza prefisso in getSpotLabel
Risolto in commit `a514e5c` (25 giu 2026). I due `if` di prefisso rimossi da `getSpotLabel`. Label pedana aggiornati da `'P12'` a `'Pedana 12'` nel default + migrazione idempotente `migratePedanaLabels()` per il localStorage live. Vedi sezione "Fix scontrino nome tavolo" più avanti.

### TASK APERTO: ripristino tavoli eliminati in test
Durante test potrebbero essere stati eliminati tavoli (es. SP4, Bancone X). Non è ancora possibile ricrearli (Crea sarà nel Commit 3). Se serve recuperare i tavoli al loro stato originale 28-spot: cancellare `mmt_spots` da localStorage del dispositivo OPPURE cancellare il nodo `bagno_capri/spots` da Firebase Console. Il fallback al default ripristina i 28 originali.

---

## Stato richieste cliente (snapshot 2026-06-16)

| Richiesta | Stato |
|---|---|
| Gestione note cucina nascondibili | ✅ FATTA (15 giu) |
| Nome cliente sul tavolo | ✅ FATTA (15 giu) |
| Gestione categorie menu | ✅ FATTA (15 giu) |
| Riordino piatti del menu | ✅ FATTA (16 giu) |
| Gestione tavoli rinomina | ✅ FATTA (16 giu) |
| Gestione tavoli elimina | ✅ FATTA (16 giu) |
| Gestione tavoli crea+sposta | ⏳ Commit 3 in sessione futura |
| Regole sicurezza Firebase | ⚠️ Sospeso da fine maggio (non urgente) |

---

## Gestione tavoli dinamica COMPLETATA + rifiniture (dal 2026-06-18/19)

### Commit 3 completato in tutte le sue parti
- Commit 3A (sposta tavoli): inizialmente tap-to-place, poi SOSTITUITO da drag in tempo reale
- Commit 3A-bis: drag con Pointer Events (pointerdown/move/up) + setPointerCapture + touch-action:none per funzionare su touch (iPad/Android). Griglia di sfondo 30px come riferimento visivo (no snap). Variabili globali: editingMap, selectedSpotForEdit, draggingSpotId. SVG root ha id=map-svg-root. Ogni rect ha id=rect-{spotid}, ogni text id=text-{spotid}, mossi insieme durante il drag per fluidità. [`d97c169`]
- Commit 3B (crea nuovo tavolo): bottone "+ Nuovo tavolo" nella barra edit. createNewSpot() chiede nome via prompt, crea spot con id='NEW'+Date.now() (univoco, mai riusa id eliminati), type:'custom', dimensione default 50x24, posizione centrale, nasce già selezionato. type:'custom' evita il prefisso ridondante in getSpotLabel (restituisce label puro). [`1cc6ba4`]
- Commit 3C (ridimensiona): controlli ↔−/↔+/↕−/↕+ nella barra edit, visibili solo quando un tavolo è selezionato. resizeSpot(dim,delta) step 8 SVG units, limiti w:[30-120] h:[15-80], anti-sforamento dal bordo. [`0706609`]
- Commit 3D (ruota 90°): bottone ⟳ nei controlli. rotateSpot() scambia w↔h mantenendo il centro (NO transform CSS, solo swap dimensioni). Clamp ai bordi. [`4e29e82`]

### Rifiniture UX della modalità modifica mappa
- Testo verticale automatico: se spot.h > spot.w il label si scrive ruotato -90° (transform rotate sul <text>), gestito sia nel render sia durante il drag (moveSpotDrag). Regola basata sulla FORMA, non su un flag. [`5bc9958`]
- Barra controlli sticky: #map-edit-bar ha position:sticky;top:88px;z-index:50 — resta visibile in alto durante lo scroll della mappa (prima spariva e non si vedevano i controlli per i tavoli in basso). z-index:50 < header (100) così passa sotto l'header senza coprirlo. [`924a7e8`]

### Mappa pulita
- Rimosse le zone di sfondo decorative (4 etichette testo "SPIAGGIA 1-2/3-4", "INTERNO", "PEDANA/TERRAZZA" + 6 rettangoli sfondo zona) da renderTableGrid. La mappa ora mostra solo i tavoli su sfondo uniforme. Scelta coerente con la libertà di posizionamento (le zone fisse non corrispondevano più ai tavoli spostati). Il rect di sfondo generale del canvas (x=0 y=0) è stato MANTENUTO. [`fa4acf2`]

### Scontrino testo ingrandito
- bagno-print.js: nuova costante TALL=[GS,0x21,0x01] (altezza x2, larghezza normale → resta 48 car/riga, niente a capo strani).
- Tutto il corpo dello scontrino (Bagno Capri, Coperti, Cliente, nomi piatti, rimozioni, extra, NOTE) passato da NORMAL a TALL.
- Le intestazioni BIG (CUCINA/BAR, tavolo+numero) restano BIG (0x11) come prima.
- IMPORTANTE: push(NORMAL) aggiunto prima di nl(4)+CUT per resettare la dimensione (stampante stateful: senza reset il taglio e lo scontrino successivo erediterebbero TALL).
- [`1b9266c`]
- TEST STAMPA FISICA NON ANCORA FATTO: da verificare al Capri con Android+RawBT. Controllare: testo più leggibile, nomi lunghi non vanno a capo, 3 scontrini tutti grandi, taglio pulito, secondo scontrino parte a dimensione giusta.

### TASK CHIUSO
- "ripristino tavoli eliminati in test": ora possibile con "+ Nuovo tavolo" (Commit 3B). Se servono i 28 originali: cancellare mmt_spots da localStorage o nodo Firebase, il default li ripristina.

### TASK ANCORA APERTO
- Regole sicurezza Firebase (aperte da fine maggio, non urgente).

### Stato richieste cliente: TUTTE COMPLETATE (in attesa solo test stampa)
| Richiesta | Stato |
|---|---|
| Note cucina nascondibili | ✅ FATTA |
| Nome cliente sul tavolo | ✅ FATTA |
| Categorie menu | ✅ FATTA |
| Riordino piatti menu | ✅ FATTA |
| Tavoli: rinomina/elimina/sposta/crea/ridimensiona/ruota | ✅ FATTA |
| Mappa pulita | ✅ FATTA |
| Scontrino leggibile | ✅ FATTA (test stampa da fare) |

---

## Fix scontrino nome tavolo (dal 2026-06-25)

### Problema risolto
Lo scontrino stampava l'id grezzo `"NEW1781818233535"` per i tavoli creati con `createNewSpot()`, e `"Spiaggia Spiaggia 1"` per i tavoli spiaggia originali.

### Causa
`bagno-print.js` usava la propria `spotLabel()` locale (riga 35) che non conosce `MAP_SPOTS`: lavorava solo sulla prima lettera dell'id (`T` → "Tavolo", `O` → "Ombrellone", tutto il resto → id grezzo). Non chiamava mai `getSpotLabel()` di `index.html`.

### Fix (commit `a514e5c`)
Tre modifiche coordinate:

1. **`bagno-print.js`** — `buildTicket` usa ora `window.getSpotLabel(order.table)` con fallback alla `spotLabel` locale:
   ```js
   var head = (typeof window!=='undefined' && typeof window.getSpotLabel==='function')
     ? window.getSpotLabel(order.table) : spotLabel(order.table);
   ```
   `spotLabel` locale resta come safety net ma non dovrebbe mai essere necessaria.

2. **`getSpotLabel()` in `index.html`** — rimossi i due `if` di prefisso automatico (`spiaggia`/`pedana`). Ora restituisce sempre `spot.label` puro. `getSpotLabel` è global (`window.getSpotLabel`) ed è raggiungibile dall'IIFE di `bagno-print.js`.

3. **Label pedana aggiornati** — nel default `MAP_SPOTS` i 12 spot `type:'pedana'` avevano label corti (`'P12'`). Aggiornati a `'Pedana 12'` ecc. Aggiunta migrazione idempotente `migratePedanaLabels()` (IIFE subito dopo la definizione di `MAP_SPOTS`) per aggiornare il localStorage live dei dispositivi esistenti. Il regex `/^P\d+$/` garantisce idempotenza: dopo la prima esecuzione i label non matchano più.

### Risultato sullo scontrino
| Tavolo | Prima | Dopo |
|---|---|---|
| Tavolo custom "Veranda" | `NEW1781818...` | `Veranda` |
| Spiaggia 1 | `Spiaggia Spiaggia 1` | `Spiaggia 1` |
| Pedana 12 | `Pedana P12` | `Pedana 12` |

### Test da fare
Test stampa fisica sull'Android al banco (stesso test da fare già per scontrino ingrandito): verificare nome tavolo leggibile per spiaggia, pedana e tavolo custom.

---

## Sessione 25 giugno 2026 — Fix scontrino, fix merge, modifica ordine cucina

### Fix nome tavolo sullo scontrino (bug id "NEW..." grezzo)
- CAUSA: bagno-print.js usava la sua spotLabel() locale che guardava solo la prima lettera dell'id (T→Tavolo, O→Ombrellone). Per i tavoli nuovi con id "NEW..." (creati con "+ Nuovo tavolo") stampava l'id grezzo.
- FIX: bagno-print.js ora usa window.getSpotLabel(order.table) (la funzione completa di index.html che conosce MAP_SPOTS), con fallback alla spotLabel locale. [a514e5c]
- BONUS: rimossa la ridondanza prefisso in getSpotLabel (i due if type==='spiaggia'/'pedana'). Ora restituisce sempre spot.label puro.
- MIGRAZIONE pedana: i label pedana erano "P12" (codice corto) e contavano sul prefisso. Aggiornati nel default a "Pedana 12" ecc. + IIFE migratePedanaLabels() idempotente (/^P\d+$/) che aggiorna i label live nel localStorage al caricamento.
- Risultato scontrino: "Pedana 12" (non più "Pedana P12"), "Spiaggia 1" (non più "Spiaggia Spiaggia 1"), nomi custom corretti (non più "NEW...").

### Fix merge tavoli non persistito
- CAUSA: mergedTables (i tavoli uniti) viveva solo in RAM, mai salvato. Dopo refresh o su altro dispositivo il merge spariva, l'ordine restava orfano legato a un tavolo unito inesistente, impossibile aggiungere portate.
- FIX: persistenza di mergedTables come già fatto per categories/spots: caricato da localStorage (mmt_merged), salvato in _writeLocal + fbSave (chiave firebase "merged"), letto dal listener (data.merged), save() chiamato in confirmMerge() e splitTable(). [566f523]

### Completamento merge: bottone Separa tavoli (dal 2026-07-20)
- La funzione splitTable() esisteva già ma non era MAI richiamata dall'interfaccia (codice orfano): impossibile separare i tavoli uniti se non da console.
- FIX: aggiunto bottone "🔓 Separa tavoli" nella toolbar, accanto a "🔗 Unisci tavoli". Appare solo quando selectedTable è un tavolo unito (mergedTables[id]). Nascosto altrimenti e alla chiusura carrello.
- Funzione ponte splitSelectedTable(): verifica che sia un tavolo unito, BLOCCA se ci sono ordini pending (come per l'eliminazione tavoli: prima libera, poi separa — evita ordini orfani con table="A+B" inesistente), poi chiama splitTable().
- Ora la funzione "unisci tavoli" è completa in entrambe le direzioni (unisci + separa), entrambe persistenti e sincronizzate. [e17d2c0]

### Modifica ordine già inviato in cucina (feature nuova)
- Bottone "✏️ Modifica" nelle card cucina (solo ordini pending).
- Flusso: ricarica l'ordine nel carrello (items/note/coperti/cliente), rimuove il vecchio dagli attivi, il cameriere modifica liberamente, "Invia in Cucina" crea l'ordine corretto MANTENENDO sessionId e orderNum originali (è una correzione, non nuova portata), con flag modificato:true, ristampa scontrino con "*** MODIFICATO ***" in BIG.
- Variabile globale editingOrder = {original, id, sessionId, orderNum}.
- GUARDIE di sicurezza: (1) blocco se carrello già pieno; (2) closeCart durante modifica ripristina l'ordine originale (non lo perde); (3) selectTable bloccato durante modifica (no invio al tavolo sbagliato).
- bagno-print.js: dicitura "*** MODIFICATO ***" centrata BIG+BOLD dopo l'header tavolo se order.modificato.
- Funzioni nuove: editOrder(id), updateEditingBanner(). Modificati: sendOrder (riusa sessionId/orderNum se editingOrder), closeCart (ripristino), selectTable (guardia). [6034352]

### TASK APERTI aggiornati
- history[] non ripulita dopo una modifica ordine: resta un record vecchio "in-corso" oltre al nuovo. Preesistente, non è rischio operativo, sistemare con calma.
- Ridondanza prefisso getSpotLabel: CHIUSA con questa sessione.
- Regole sicurezza Firebase: ancora aperta (non urgente).

### RIFLESSIONE ARCHITETTURALE (importante per prodotto futuro)
Pattern ricorrente emerso in stagione: l'app è nata come prototipo "tutto in RAM, un dispositivo". La stagione reale (iPad camerieri + Android banco) ha fatto emergere in sequenza i pezzi di stato NON persistiti: categorie, spots, merge, e la gestione ordini. Per il prodotto vendibile futuro, l'architettura deve partire da "stato condiviso persistito e sincronizzato di DEFAULT", non rincorrere ogni stato dopo che un cliente ci sbatte contro. Da approfondire in una sessione di design fuori stagione.

### Test in attesa (responso proprietario 26 giugno)
- Stampa scontrino: nomi tavolo corretti, "MODIFICATO" visibile, testo grande leggibile.
- Merge multi-dispositivo: tavolo unito riapribile da altro dispositivo.
- Modifica ordine: flusso completo + annulla senza perdere l'ordine.
