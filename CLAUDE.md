# Tabata Timer: regole del progetto

Web app (PWA) per allenamenti, usata dall'utente su iPad in palestra. Specifiche in PRODOTTO.md, sviluppo nel README.
Si parla in italiano, anche nei commit e nei commenti del codice.

## Prima di ogni rilascio (push su GitHub)
1. Esegui i test automatici e falli passare tutti:
   ```bash
   export PATH="$HOME/.local/node/bin:$PATH" && npx playwright test --reporter=line
   ```
2. Lancia l'agente **qa** (`.claude/agents/qa.md`) e correggi ciò che trova, poi rilancia test e agente finché
   l'esito è "pronto". Un problema grafico trovato dall'agente va anche coperto da un test, se possibile
   (vedi `assertUsable` in `tests/helpers.js`).
3. Solo allora chiedi all'utente il permesso di fare il push, riportando in breve l'esito del QA
   e cosa resta "da provare sull'iPad". Non fare mai push senza il suo sì.

Su GitHub gli stessi test girano prima della pubblicazione: se falliscono, la versione non va online.

## Da sapere
- La versione dell'app (`__VERSION__` in `app/sw.js` e `app/app.js`) la inserisce la pubblicazione: non cambiarla a mano.
- `ANALISI-MERCATO.md` è privata: non va mai nel repo (è esclusa in `.git/info/exclude`). Il repo è pubblico.
- Impostazioni e preset dell'utente vivono nel localStorage: ogni cambio di formato deve conservare quelli esistenti
  (c'è un test per la migrazione dalla prima versione).
- Node è installato in `~/.local/node` (non con Homebrew).
