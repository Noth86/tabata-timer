# Tabata Timer

Cronometro e timer per allenamenti a tutto schermo, pensato per un iPad appoggiato in palestra.
Gratis, senza pubblicità, senza account, funziona offline e tiene lo schermo acceso.

**Apri l'app:** https://noth86.github.io/tabata-timer/

## Funzioni
- **Cronometro** con giri (tempo del giro e totale).
- **Allenamento**, in cinque modalità:
  - **Tabata**: lavoro e riposo alternati, per round e serie; riscaldamento e defaticamento facoltativi.
  - **EMOM**: un intervallo ogni N secondi, per X round.
  - **AMRAP**: conto alla rovescia unico, con il pulsante "+1 Round" per contare i giri.
  - **For Time**: il tempo sale, con un limite facoltativo e il pulsante "Fatto".
  - **Circuito**: esercizi con nome e durata propria, ripetuti per più round (anche piramidi).
- **Cronometro di sessione** sempre visibile durante l'allenamento: parte con l'allenamento, oppure continua
  quello avviato prima (per esempio durante il riscaldamento).
- Schermo colorato per fase, bip negli ultimi 3 secondi, voce in italiano facoltativa.
- Preset predefiniti per ogni modalità, più i tuoi preset salvati sul dispositivo.
- Interruttore **Schermo sempre acceso**: blocca lo standby finché l'app è aperta.

Specifiche complete in [PRODOTTO.md](PRODOTTO.md).

## Installarla sull'iPad
1. Apri https://noth86.github.io/tabata-timer/ in **Safari**.
2. Tocca **Condividi → Aggiungi alla schermata Home**. In alternativa usa il pulsante **Installa app** in alto: spiega i passaggi.
3. Apri l'app dall'icona sulla Home: parte a tutto schermo e funziona anche offline.

Su Mac con Safari: **File → Aggiungi al Dock**. Su Chrome ed Edge il pulsante **Installa app** apre direttamente l'installazione.

Se lo standby non si blocca (interruttore arancione o rosso), la soluzione di riserva è:
Impostazioni → Schermo e luminosità → Blocco automatico → Mai.

## Aggiornamenti
L'app installata si aggiorna da sola. Controlla le novità all'apertura, quando torna in primo piano e ogni 30 minuti,
poi si ricarica, mai durante un allenamento. La versione attuale è scritta in fondo alla scheda **Allenamento**:
toccala per forzare il controllo.

## Sviluppo
È una web app (PWA) in HTML, CSS e JavaScript, senza dipendenze né build. Node serve solo per i test.

```
app/                  la web app (pubblicata così com'è)
  index.html
  style.css
  app.js
  sw.js               service worker: offline e aggiornamenti
  manifest.webmanifest
  icons/
  media/              video muto che su iPad tiene lo schermo a piena luminosità (da NoSleep.js, MIT)
.github/workflows/    pubblicazione automatica su GitHub Pages
tests/                test automatici (Playwright)
.claude/agents/qa.md  agente QA che prova l'app prima di ogni rilascio
serve.sh              server locale per provarla
```

Con `QA_FONT="Verdana" npm test` i test simulano un carattere più largo, come quello dei server Linux di GitHub.

Per provarla sul Mac:
```bash
./serve.sh
```
Poi apri http://localhost:8080.

**Tastiera:**
- **Spazio**: avvia o mette in pausa.
- **L**: giro.
- **R**: azzera il cronometro.
- **N**: salta la fase.
- **C** o **Invio**: +1 round.
- **F**: schermo intero.
- **Esc**: chiude l'allenamento.

**Test automatici** (Playwright con WebKit, il motore di Safari):
```bash
npm install && npx playwright install webkit   # la prima volta
npm test
```
- **Logica** (`tests/logica.spec.js`): ogni modalità con il tempo simulato, preset, cronometro, schermo sempre acceso.
- **Grafica** (`tests/grafica.spec.js`): su iPad, iPad in orizzontale, iPad mini, Mac e iPhone. Controlla che niente
  sia schiacciato, tagliato, coperto o fuori schermo, e salva le foto delle schermate in `qa-screenshots/`.
- **Offline** (`tests/offline.spec.js`): l'app funziona senza internet dopo il primo caricamento.

Prima di ogni rilascio l'agente QA ([.claude/agents/qa.md](.claude/agents/qa.md)) esegue i test, rivede le foto
e prova l'app a mano.

**Pubblicazione:** ogni `git push` su `main` esegue i test e, **solo se passano**, pubblica la cartella `app/`
su GitHub Pages ([pages.yml](.github/workflows/pages.yml)). Il numero di versione, cioè l'hash del commit,
viene inserito automaticamente in `sw.js` e `app.js`, quindi non va cambiato a mano.

## In futuro: Android e iOS
La cartella `app/` è già pronta per essere usata come `webDir` di [Capacitor](https://capacitorjs.com),
che la trasforma in un'app da Play Store e App Store. Vedi la roadmap in [PRODOTTO.md](PRODOTTO.md#roadmap-a-fasi).
