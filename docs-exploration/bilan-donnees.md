# Bilan : l'API Que Faire à Paris tient-elle la route ?

Exploration du 3 novembre 2026. Source : dataset `que-faire-a-paris-` sur opendata.paris.fr (API Explore v2.1, export JSON complet gratuit, sans clé).

## Volume et fraîcheur

| Mesure | Valeur |
|---|---|
| Événements dans l'export | 3 207 |
| Déjà passés (le dataset s'auto-purge) | 2 |
| Avec au moins une occurrence ce soir | 79 (59 après filtrage du bruit) |
| Ce weekend (7-8 nov.) | 869 (516 hors enfants, bibliothèques, conservatoires, sport municipal) |
| D'ici 7 jours | 1 154 |
| Se terminent d'ici 7 jours ("derniers jours") | 306 |
| Mis à jour dans les 30 derniers jours | 1 322 / 3 133 |
| Dernière mise à jour du dataset | 3 nov. 2026, 17h15 (donc quotidienne au moins) |

Durée des événements vivants : 1 587 d'un jour, 311 de 2 à 7 jours, 268 de 8 à 30 jours, 967 de plus de 30 jours (expos, spectacles en série, cours hebdos).

## Qualité des champs (sur les 3 133 événements vivants)

| Champ | Rempli |
|---|---|
| titre, accroche (`lead_text`), description, image de couverture, tags, public, texte des dates | 100 % |
| lat/lon | 99 % (aucun 0/0) |
| adresse | 97 % |
| intérieur/extérieur | 96 % |
| type de prix (gratuit / payant / sous condition) | 100 % |
| détail du prix | 62 % (HTML, texte libre : "De 15 à 42 euros", "1ère cat : 40 €") |
| lien de réservation | 63 % |
| type d'accès (réservation obligatoire / conseillée / non) | 97 % |

Points forts :
- Les occurrences sont listées une par une avec heure de début et de fin (`occurrences`, séparées par `;`). On peut donc répondre précisément à "qu'est-ce qui commence entre 19h et 21h ce soir".
- Les images sont hébergées sur cdn.paris.fr, chargent bien, en haute définition.
- Les textes sont rédigés et honnêtes, souvent avec les noms des artistes. Médiane de 800 caractères, de quoi nourrir un tagging LLM.
- Vocabulaire de tags de la Ville déjà utile (Concert, Théâtre, Expo, Humour, Balade urbaine, Nuit, Gourmand, LGBT...).

Points faibles à gérer dans le pipeline :
- **Bruit** : environ un tiers des événements sont des activités de bibliothèques, de conservatoires, du sport municipal ou pour enfants. Faciles à écarter grâce aux champs `group` et `qfap_tags`, mais à garder pour un futur mode famille.
- **Prix en texte libre** : il faut un parsing (regex suffit pour 78 % des payants, LLM pour le reste).
- **Doublons** : 81 titres en double (souvent le même événement sur deux lieux ou deux périodes).
- **Quelques fiches cassées** : un titre qui est un numéro de téléphone, des codes postaux erronés (76006 pour 75006), 95 fiches sans code postal.
- **Pas tout Paris** : c'est l'agenda participatif de la Ville. Les grosses salles privées (Olympia, Zénith, Accor Arena), les clubs, les pop-ups de marques et les restaurants éphémères y sont rares. Il faudra une deuxième source pour ça (Shotgun, Dice, Le Bonbon, Time Out).

## Ce que ça donne concrètement pour "ce soir"

Sur les 59 événements de ce mardi soir après filtrage : 10 concerts, 9 pièces, 8 expos d'art contemporain, 6 spectacles d'humour, 6 expos, 5 conférences, 4 ateliers, des soirées jeux, un ciné-club, un blues-rock gratuit au Piano Vache, Louise Bourgeois au musée, Hermeto Pascoal en concert. C'est une vraie offre, pas un agenda de mairie vide.

## Test de tagging LLM (20 événements, modèle bon marché Haiku)

Échantillon : 8 événements de ce soir, 12 du weekend, genres variés, avec quelques pièges volontaires (groupe de parole, visite bébé, prix en texte libre, fiche sans prix). Résultats complets dans `tags20.json`, source dans `sample20.json`.

Ce qui marche :
- **Tri signal/bruit** : les deux pièges (groupe de parole pour victimes de violences, visite réservée aux bébés) sont rejetés avec une raison juste. Les 18 autres sont gardés.
- **Genre, vibes, "pour qui"** : cohérents sur les 20. Une jam de jazz tombe en "festif / créatif / potes, couple, seul", une balade sur les crimes de Paris en "frisson / curieux / potes, couple, date".
- **Prix** : "1ère cat : 40 €, 2ème cat : 30 €, moins de 26 ans : 12,50 €" devient 12 à 40 euros. Les fiches sans prix donnent null au lieu d'inventer.
- **Accroches** : c'est la bonne surprise. Elles décrivent ce qu'on va vivre au lieu de répéter le titre. Exemples : "Elle entre au gouvernement, il devient le premier homme, et le couple vacille" ; "Vous menez l'enquête avec de vrais comédiens, qui réagissent à chacune de vos décisions" ; "Un pianiste invite musiciens et public à improviser sur des standards, sans complexe".
- **Note de désirabilité** : plausible (expos gratuites et concerts à 4, théâtre municipal à 3, pièges à 1).

Ce qui est à corriger dans le pipeline :
- **Ne pas demander au LLM ce que la source sait déjà.** L'échantillon ne contenait pas `access_type` (réservation obligatoire / conseillée / non), donc le modèle a mis "conseillée" par défaut partout. Même chose pour `event_indoor`. Ces champs doivent venir de l'API, le LLM ne sert qu'à inférer ce qui manque (vibes, durée, accroche, désirabilité).
- **"Spontané ce soir ?"** est trop prudent : un concert de jazz à 10 euros dans un bar est marqué "non". À calculer plutôt par règle : gratuit ou réservation non obligatoire, et pas complet.
- **Prix** : stocker séparément plein tarif et tarif réduit, sinon un minimum à 12 euros masque un billet qui en coûte 40 pour la plupart des gens.
- **Durée** : une occurrence "18h00 à 18h00" existe dans la source, il faut une valeur par défaut par genre quand l'horaire est incohérent.

Coût : un appel court par événement, uniquement sur les fiches nouvelles ou modifiées chaque nuit (quelques dizaines par jour après le premier passage). Négligeable.

## Verdict

**La base tient la route pour une v1.** Volume suffisant, données propres à 95 %, horaires précis, images, textes riches, mise à jour quotidienne, gratuit, sans clé. Le tagging par un petit modèle fait le travail dès le premier essai, avec un schéma à peine ajusté.

Les deux limites réelles sont connues et gérables : le bruit municipal (filtrable) et l'absence des grosses salles privées et pop-ups (deuxième source à ajouter en v2, pas bloquant pour commencer).

## Schéma d'événement proposé pour la v1

Venant de l'API : id, titre, accroche, description, image, occurrences (début/fin), lieu, lat/lon, arrondissement, type de prix, texte du prix, type d'accès, lien de réservation, intérieur/extérieur, tags Ville, public, date de mise à jour.

Ajouté par le LLM : genre (un seul), vibes (1 à 3), good_for, durée estimée, prix min/max plein tarif, prix réduit, accroche carte, désirabilité (1 à 5), à garder ou non, confiance.

Calculé par règle : spontané ce soir, "se termine bientôt", distance à l'utilisateur, compatible météo (extérieur et pluie annoncée).
