#!/bin/sh
# Avvia la web app su http://localhost:8080
cd "$(dirname "$0")/app" && python3 -m http.server 8080
