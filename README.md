# Tabata Timer

Cronometro + timer Tabata a tutto schermo, senza pubblicità, che tiene lo schermo acceso.
Specifiche del prodotto in [PRODOTTO.md](PRODOTTO.md).

## Provarlo sul Mac
```bash
./serve.sh
```
Poi apri http://localhost:8080 (meglio in Safari o Chrome). Tasti: **Spazio** avvia/pausa, **L** giro,
**R** azzera, **N** salta fase, **F** schermo intero, **Esc** chiude il Tabata.

## Metterlo sull'iPad
L'iPad ha bisogno di un indirizzo **https** (altrimenti niente schermo sempre acceso e niente offline).
Il modo più semplice e gratuito: pubblicare la cartella `app/` su GitHub Pages o Netlify Drop
(su https://app.netlify.com/drop basta trascinare la cartella `app`).

Poi sull'iPad:
1. apri l'indirizzo in **Safari**;
2. **Condividi → Aggiungi alla schermata Home**;
3. apri l'app dall'icona: parte a tutto schermo e funziona anche offline.

L'interruttore "Schermo sempre acceso" in alto a destra blocca lo standby (verde = attivo).
Se il browser non lo supporta, la soluzione di riserva è: Impostazioni → Schermo e luminosità → Blocco automatico → Mai.

## Aggiornare l'app
Basta fare `git push`: la pubblicazione inserisce da sola il numero di versione (hash del commit).
L'app installata controlla gli aggiornamenti all'apertura, quando torna in primo piano e ogni 30 minuti,
e si ricarica da sola (mai durante un allenamento Tabata). In fondo alla scheda Tabata trovi la versione
attuale: toccala per forzare il controllo.

## Domani: Android e iOS
La cartella `app/` è già pronta per essere usata come `webDir` di [Capacitor](https://capacitorjs.com).
Vedi la roadmap in [PRODOTTO.md](PRODOTTO.md#roadmap-a-fasi).
