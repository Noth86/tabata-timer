# Tabata Timer — Definizione del prodotto

## Obiettivo
Un timer per allenamento da usare su iPad (e Mac) appoggiato a distanza, leggibile da lontano,
**senza pubblicità** e **senza che lo schermo vada in standby** mentre è aperto.
Uso personale. Nessun account, nessun server, nessun dato che esce dal dispositivo.

## Scelta tecnica: Web App installabile (PWA)
Senza account sviluppatore Apple non si può installare un'app nativa stabile sull'iPad
(con un Apple ID gratuito Xcode firma app che scadono dopo 7 giorni). Una PWA invece:

- si apre in Safari e si aggiunge alla Home ("Condividi → Aggiungi a Home"): icona propria, si apre a tutto schermo, senza barre del browser;
- funziona **offline** dopo il primo caricamento;
- tiene lo schermo acceso con la **Screen Wake Lock API** (Safari/iPadOS 16.4+, anche da Home da iPadOS 18.4);
- è lo stesso codice che domani si impacchetta per App Store / Play Store con **Capacitor**.

## Funzioni (versione 1)

### Comuni
- Schermo sempre acceso finché l'app è visibile, con indicatore 💡 dello stato.
- Pulsante schermo intero (Mac / Safari).
- Numeri enormi, alto contrasto, tema scuro; si adatta a verticale e orizzontale.
- Tutto funziona con tocchi grandi; su Mac anche da tastiera (Spazio = avvia/pausa).
- Impostazioni salvate sul dispositivo.

### Cronometro
- Avvia / Pausa / Azzera, formato `mm:ss.cc` (ore se serve).
- Giri (lap) con tempo del giro e totale.
- Preciso anche se l'app resta in pausa nel background (basato sull'orologio, non sui tick).

### Tabata
- Parametri: preparazione, lavoro, riposo, numero di round, numero di serie, recupero tra le serie.
- Default: 10 s preparazione · 20 s lavoro · 10 s riposo · 8 round · 1 serie · 60 s recupero.
- Schermo colorato per fase: **giallo** preparazione, **verde** lavoro, **rosso** riposo, **blu** recupero.
- Mostra: fase, secondi rimanenti, round X/Y, serie X/Y, tempo totale rimanente, barra di avanzamento.
- Segnali sonori: bip negli ultimi 3 secondi, bip lungo a cambio fase; voce opzionale ("Via", "Riposo"…).
- Comandi: Avvia/Pausa, Salta fase, Ricomincia.
- Preset salvabili (es. "Tabata classico", "EMOM leggero").

## Fuori scope (per ora)
Account, sincronizzazione, statistiche, musica, Apple Watch, notifiche a schermo spento.

## Roadmap a fasi
1. **Ora** — PWA in locale sul Mac per provarla.
2. **Pubblicazione gratuita** — hosting HTTPS gratuito (GitHub Pages o Netlify) → apri l'indirizzo sull'iPad e "Aggiungi a Home".
   (L'HTTPS è necessario: senza, iPad non concede il blocco dello standby né il funzionamento offline.)
3. **Android** — la PWA si installa già da Chrome. Per il Play Store: Capacitor (o TWA), account Google Play 25 $ una tantum.
4. **iOS App Store** — Capacitor + Xcode, account Apple Developer 99 $/anno. Nell'app nativa lo standby si blocca con `isIdleTimerDisabled`.

## Struttura del progetto
```
app/            ← la web app (sarà la "webDir" di Capacitor)
  index.html
  style.css
  app.js
  manifest.webmanifest
  sw.js         ← service worker per l'offline
  icons/
serve.sh        ← avvia un server locale per provarla sul Mac
```
