# Cahier d'échecs

Arbre d'ouvertures, scores contre chaque joueur et lignes épinglées, à partir des parties publiques Chess.com.

La page : https://tlloancy.github.io/cahier-echecs/

Entre un pseudo. Le navigateur télécharge les archives, classe les douze premiers coups et garde le résultat sur cet appareil. Une ligne épinglée peut être analysée avec Stockfish, sur huit parties récentes au plus.

Les noms d'ouvertures viennent du livre [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings). Le moteur est Stockfish, sous licence GNU GPL v3.

## En local

```bash
npm install
npm run openings
npm run dev
```

`npm run openings` régénère `public/openings.json`. Le fichier déjà présent dans le dépôt suffit pour lancer la page.
