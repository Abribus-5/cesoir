# Ce soir ?

Des idées de sorties à Paris quand tu ne sais pas quoi faire. Une PWA : tu l'ouvres, tu dis quand, avec qui, dans quel état d'esprit, et tu as trois idées. Deux dans tes goûts, une à côté.

## Lancer en local

```bash
npm install
npm run ingest     # télécharge l'agenda Que Faire à Paris (Mairie, ouvert, ~3 000 événements)
npm run tag        # tague les événements (LLM si une clé Anthropic est configurée, sinon par règles)
npm run dev        # http://localhost:5173
```

Pour la prod : `npm run build` puis `npm start` (Express sert `dist/` et l'API sur le même port).

## Données

- **Source** : l'API ouverte "Que Faire à Paris ?" (opendata.paris.fr), sans clé. `scripts/ingest.js` charge l'export complet dans SQLite (`data/app.db`), marque le bruit (bibliothèques, conservatoires, sport municipal, enfants) et retire ce qui a disparu du site.
- **Tagging** : `scripts/tag.js` enrichit chaque événement : genre, vibes, pour qui, durée, prix, accroche de carte, désirabilité. Avec `ANTHROPIC_API_KEY` dans l'environnement (ou un profil `ant auth login`), c'est Claude Haiku 5.5 qui tague, en sortie structurée. Sans clé, un tagging par règles à partir des tags de la Ville prend le relais : plus grossier, mais l'app tourne. Relancer `npm run tag` avec une clé retague tout ce qui a été fait par règles.
- **Rafraîchissement** : `npm run refresh` enchaîne les deux, à mettre dans un cron chaque nuit. Seuls les événements nouveaux ou modifiés repassent au tagging.
- **Météo** : Open-Meteo, sans clé, pour pénaliser l'extérieur quand il pleut.
- **Idées maison** : `server/home-ideas.json`, catalogue curé à la main, servi quand il pleut, qu'il est tard, ou qu'on choisit "Chez moi".

## Le moteur (`server/reco.js`)

Score = désirabilité + affinité apprise (genres et vibes pondérés par tes actions : gardé, fait, écarté) + contexte explicite (avec qui, envie, budget) + météo + urgence (se termine bientôt, date unique) + historique (déjà vu, déjà écarté).

Trois recos : les deux meilleures de genres différents, puis une "pas de chez toi" : un genre que tu n'as pas encore aimé, mais désirable et compatible avec le reste du contexte. Si tu l'écartes, le moteur apprend ; si tu la fais, ton profil s'élargit.

## Identité

Pour l'instant un cookie anonyme par appareil. Les comptes (lien magique) viendront quand il faudra synchroniser entre appareils.

## Structure

```
server/   index.js (API Express), db.js (SQLite), reco.js (moteur), time.js (fenêtres Paris), weather.js, home.js, taxonomy.js, text.js
scripts/  ingest.js, tag.js
src/      React : screens/ (Tonight, Explore, Saved, Detail), components/, styles.css
public/   manifest, service worker, icônes
```

## Mettre en ligne

L'app est un seul processus Node avec SQLite sur disque, donc il lui faut un hébergeur avec un volume persistant. Le `Dockerfile` à la racine marche partout ; le plus simple est Railway (volume en deux clics), `fly.toml` est fourni en alternative.

Le serveur gère ses données tout seul : au premier démarrage sur une base vide il télécharge et tague tout (quelques secondes avec le tagging par règles, quelques minutes avec le LLM), puis il se rafraîchit chaque nuit à 4h heure de Paris (`REFRESH_HOUR` pour changer).

Railway, depuis le dépôt GitHub :
1. New Project → Deploy from GitHub repo → choisir `cesoir`. Railway lit `railway.json` et construit le Dockerfile.
2. Dans le service → Variables : `DATA_DIR=/data`, et si tu veux le tagging LLM `ANTHROPIC_API_KEY=…`. `PORT` est fourni par Railway.
3. Dans le service → Volumes : ajouter un volume monté sur `/data`.
4. Settings → Networking → Generate Domain. L'app est en ligne, installable sur téléphone depuis Safari ou Chrome (Partager → Sur l'écran d'accueil).

Variables utiles : `DATA_DIR` (dossier de la base), `REFRESH_HOUR` (heure du rafraîchissement), `NO_SCHEDULER=1` (désactive le rafraîchissement automatique), `TAGGER=rules|llm` (force un mode de tagging).
