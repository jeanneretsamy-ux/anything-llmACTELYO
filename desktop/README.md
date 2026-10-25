# Actelyo RAG Desktop Windows

Wrapper Electron et adaptateur Windows du service local Actelyo RAG. Les données sont créées dans le dossier utilisateur, séparément des programmes. La base de préparation et les données privées ne sont pas distribuées.

Le paquet 1.0.1 disponible dans le catalogue Actelyo est un reconditionnement du runtime Windows déjà installé et audité : aucun fichier .env, base SQLite, GGUF, Safetensors ou ONNX n'a été embarqué. Les services RAG, collector et l'interface HTTP ont démarré avec une base neuve lors du contrôle local. Ce contrôle ne valide pas une réponse sémantique RAG ni tous les fournisseurs.

La version 1.0.2 ajoute dans le menu **Actelyo RAG → Préparer un corpus juridique…** la sélection d'un JSON structuré et d'un dossier de destination. Elle produit un Markdown par article, avec citation et page source, et sépare les articles déclarés abrogés. L'utilisateur importe ensuite le dossier `current/` dans le workspace RAG choisi. Le convertisseur et l'évaluateur local de recherche sont inclus dans le runtime. La préparation ne vérifie pas automatiquement la validité du droit ni la date des textes ; voir [le guide](../RAG_EVALUATION.md).

## Sources et compilation

Base de service : commit `f1e581b25987a6d64947bcb8c09cc28af538213b` de ce dépôt. Les adaptations de chemins, ports et données du runtime Windows distribué sont conservées dans `runtime-overrides` et appliquées pendant l'assemblage. Le code amont AnythingLLM reste sous sa licence MIT.

Prévoir plusieurs Go libres, Windows x64, Node 24, Yarn 1.22 et les outils de compilation natifs des dépendances. Depuis desktop : `npm install`, puis `npm run build:win`. Le script installe et construit les services et le frontend depuis les sources du dépôt, puis assemble Electron. Compiler ensuite `installer.iss` avec Inno Setup 6. Si un chemin Windows trop long bloque les dépendances, choisir une sortie courte avec `ACTELYO_RAG_BUILD_DIR` et transmettre ce même dossier au compilateur Inno Setup avec `/DSourceDir=...`.

Pour reconditionner un runtime Windows préparé et audité, définir `ACTELYO_RAG_RUNTIME` vers son dossier contenant node.exe, server, collector et default-assets. Cette voie ne réinstalle pas les services. Le script de build y ajoute les outils juridiques et d'évaluation depuis la version courante des sources. La version 1.0.2 utilise comme base le runtime de la version 1.0.1 publiée ; les services de base ne sont pas recompilés par cette voie.

Le serveur et le collector n'écoutent que sur 127.0.0.1. Les clés et documents restent dans le profil utilisateur. `--data-dir=C:\chemin\profil-isole` permet un test indépendant sans modifier le profil courant.

## OpenRAG facultatif

Le connecteur disponible dans [legal_rag](../legal_rag/README.md#openrag-facultatif) cible précisément [langflow-ai/openrag](https://github.com/langflow-ai/openrag) et son API locale `POST /v1/search`. Il permet au service juridique Actelyo de rechercher dans une instance OpenRAG déjà installée, avec une clé API et un filtre de connaissance.

La source 1.0.3 ajoute au menu **Actelyo RAG → OpenRAG — vérifier et préparer ce poste…** un diagnostic de l'espace libre sur le disque du profil Actelyo, de la mémoire, d'Ubuntu WSL 2, du moteur Docker dans Ubuntu et de Docker Compose. Les seuils affichés (50 Go et 8 Go de RAM) viennent de la [documentation OpenRAG](https://docs.openr.ag/install-uv/). L'utilisateur peut lancer explicitement l'installation Windows de WSL 2 et Ubuntu, ou ouvrir la page officielle d'installation de Docker Desktop. Ces actions peuvent nécessiter les droits administrateur et un redémarrage. Le diagnostic ne télécharge aucun modèle et ne démarre aucun conteneur. Il faut aussi vérifier l'espace sur le disque où Docker stocke ses images si ce disque diffère de celui du profil Actelyo.

L'installateur 1.0.3 doit encore être assemblé et testé ; le fichier 1.0.2 existant ne contient pas ce menu.

Le Desktop ne contient toujours pas OpenRAG, WSL, Docker ou le service Python `legal_rag` ; le connecteur ne constitue donc pas encore une option activable dans l'EXE. L'installation et le démarrage d'OpenRAG, puis la configuration de sa clé API et de son filtre, restent distincts. Sur un PC sans les ressources nécessaires, le moteur RAG habituel du Desktop fonctionne sans ces prérequis.

[Catalogue public des installateurs et modèles](https://jeanneretsamy-ux.github.io/actelyo-downloads/)
