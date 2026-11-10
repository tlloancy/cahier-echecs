# Composants tiers

## Stockfish (moteur d'analyse) : GPL-3.0

`public/engine/stockfish-19-lite-single.js` (et son fichier `.wasm`) est la version **Stockfish.js 19**, variante *lite* à un seul fil, publiée par Chess.com, LLC.

- Code source correspondant : https://github.com/nmrugg/stockfish.js (portage JavaScript / WebAssembly)
- Moteur d'origine : https://github.com/official-stockfish/Stockfish
- Réseau neuronal : `nn-61e7af4bb97d` (voir https://tests.stockfishchess.org/nns?network_name=nn-61e7af4bb97d)
- Licence : GNU GPL v3, texte complet dans `public/engine/STOCKFISH-COPYING.txt`

Le moteur est servi tel quel (non modifié) et exécuté dans un Web Worker du même site. Le code source de ce dépôt, qui l'appelle uniquement par le protocole UCI, est lui aussi publié sous GPL-3.0.

Pour obtenir le code source correspondant exact à ce binaire, ouvre une issue sur le dépôt de l'app ou récupère le tag 19 du dépôt `nmrugg/stockfish.js`.

## Livre d'ouvertures : CC0

`public/openings.json` est dérivé de https://github.com/lichess-org/chess-openings (domaine public, CC0). Voir `scripts/build-openings.mjs` pour la transformation.

## Bibliothèques

- [chessops](https://github.com/niklasf/chessops) : règles des échecs, PGN, FEN (GPL-3.0).
- [idb](https://github.com/jakearchibald/idb) : accès à IndexedDB (ISC).

## Services contactés par la page

- `api.chess.com` : API publique de Chess.com (parties, pays des joueurs).
- `flagcdn.com` : images de drapeaux.
