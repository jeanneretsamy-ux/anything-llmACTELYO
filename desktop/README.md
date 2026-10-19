# Actelyo RAG Desktop Windows

Wrapper Electron et adaptateur Windows du service local Actelyo RAG. Les données sont créées dans le dossier utilisateur, séparément des programmes. La base de préparation et les données privées ne sont pas distribuées.

Le paquet 1.0.1 disponible dans le catalogue Actelyo est un reconditionnement du runtime Windows déjà installé et audité : aucun fichier .env, base SQLite, GGUF, Safetensors ou ONNX n'a été embarqué. Les services RAG, collector et l'interface HTTP ont démarré avec une base neuve lors du contrôle local. Ce contrôle ne valide pas une réponse sémantique RAG ni tous les fournisseurs.

## Sources et compilation

Base de service : commit `f1e581b25987a6d64947bcb8c09cc28af538213b` de ce dépôt. Les adaptations de chemins, ports et données du runtime Windows distribué sont conservées dans `runtime-overrides` et appliquées pendant l'assemblage. Le code amont AnythingLLM reste sous sa licence MIT.

Prévoir plusieurs Go libres, Windows x64, Node 24, Yarn 1.22 et les outils de compilation natifs des dépendances. Depuis desktop : `npm install`, puis `npm run build:win`. Le script installe et construit les services et le frontend depuis les sources du dépôt, puis assemble Electron. Compiler ensuite `installer.iss` avec Inno Setup 6. La recette de reconstruction depuis les sources est fournie ; elle n'a pas été exécutée dans cette session sur le PC à faible espace disque.

Pour reconditionner un runtime Windows préparé et audité, définir `ACTELYO_RAG_RUNTIME` vers son dossier contenant node.exe, server, collector et default-assets. Cette voie ne réinstalle pas les services. Le paquet publié utilise cette voie avec le runtime audité localement.

Le serveur et le collector n'écoutent que sur 127.0.0.1. Les clés et documents restent dans le profil utilisateur. `--data-dir=C:\chemin\profil-isole` permet un test indépendant sans modifier le profil courant.

[Catalogue public des installateurs et modèles](https://jeanneretsamy-ux.github.io/actelyo-downloads/)
