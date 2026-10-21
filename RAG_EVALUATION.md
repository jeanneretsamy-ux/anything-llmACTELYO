# Évaluer la recherche Actelyo RAG en local

## Préparer un corpus juridique structuré

Le [projet de référence de recherche juridique arabe/anglais](https://github.com/AyaMYousef/-LLM-RAG-Arabic-Legal-Document-Q-A) décrit une recherche par article, avec citation, page source et indication d'abrogation. Actelyo reprend **ce principe** avec un convertisseur original ; ni le code ni le corpus du projet de référence ne sont inclus. N'importer que des documents que vous avez le droit d'utiliser.

Fournir un JSON `schemaVersion: 1` contenant `articles` (1 à 10 000 entrées, 50 Mo maximum). Chaque article exige un `id` stable en caractères ASCII (`article_number` peut servir d'identifiant), `citation`, `jurisdiction`, `is_repealed` (`true` ou `false`) et au moins un de `text_fr`, `text_en`, `text_ar`. Les champs `source_name`, `source_page` (numéro de page positif), `book`, `chapter` et `section` sont facultatifs. [L'exemple](examples/rag-eval/legal-articles.sample.json) contient uniquement deux articles fictifs.

```powershell
npm run rag:prepare-legal -- --input .\examples\rag-eval\legal-articles.sample.json --output .\rag-evaluation-reports\articles-prepares
```

Le dossier de sortie doit être nouveau ; son parent est créé au besoin. Le convertisseur écrit un Markdown par article, en préservant ses versions linguistiques et ses références, un `manifest.json` avec empreintes SHA-256, puis sépare `current/` et `repealed/`. Importer les fichiers de `current/` dans un workspace Actelyo RAG ; créer un workspace historique séparé pour `repealed/` seulement si nécessaire. La mention « en vigueur » reflète **la déclaration du corpus importé**, pas une vérification automatique des textes officiels. La réponse juridique doit toujours être contrôlée sur les sources et à la date pertinente. Le convertisseur fonctionne localement et ne transmet aucune donnée.

## Mesurer la recherche du workspace

Le banc d'essai interroge l'API `POST /v1/workspace/:slug/vector-search` du **vrai workspace** Actelyo RAG. Il mesure Recall@1, Recall@3, Recall@5, Hit@k, MRR et les latences p50/p95, globalement et par langue. Les requêtes ne figurent pas dans le rapport ; les identifiants des sources et les jugements restent dans des fichiers locaux. Aucun appel à Groq, MLflow, Langfuse ou à un serveur distant n'est effectué par cet outil.

1. Dans Actelyo RAG, indexer les documents du workspace et choisir son modèle d'embeddings. Un modèle multilingue compatible avec le fournisseur local configuré peut servir aux jeux français, anglais et arabes. Le choix du modèle et de la base vectorielle reste celui du workspace ; ce banc d'essai ne les remplace pas par E5 ou FAISS.
2. Créer une clé API Actelyo RAG locale et la définir dans la variable d'environnement `ACTELYO_RAG_API_KEY`. Ne pas l'inscrire dans la commande ou le fichier du benchmark.
3. Préparer dans `rag-evaluation-reports/benchmark.json` un JSON `schemaVersion: 1` avec 1 à 1000 cas `{id, language, query, relevant}`. `relevant` contient les identifiants attendus du champ choisi (`id`, `docSource`, `chunkSource`, `url` ou `title`). [L'exemple](examples/rag-eval/benchmark.sample.json) contient des références fictives ; il faut les remplacer par les identifiants réellement indexés. Ne pas confondre les scores de l'exemple cité par l'utilisateur avec ceux d'Actelyo.
4. Lancer, depuis la racine du dépôt :

```powershell
$env:ACTELYO_RAG_API_KEY = '<cle-locale>'
npm run rag:eval -- --benchmark .\rag-evaluation-reports\benchmark.json --workspace mon-dossier --source-field docSource --output .\rag-evaluation-reports\rag-eval.json --prometheus .\rag-evaluation-reports\rag-eval.prom
```

L'API du serveur lancé depuis les sources écoute par défaut sur `http://127.0.0.1:3001`. Le Desktop empaqueté choisit un port local dynamique : indiquer son URL avec `--base-url http://127.0.0.1:PORT` si l'on évalue cette installation. `--base-url` accepte uniquement HTTP sur `localhost`, `127.0.0.1` ou `::1`. `--top-n` vaut 5 par défaut (5 à 100) et `--threshold` vaut 0 par défaut (0 à 1). Les redirections HTTP sont refusées. La commande échoue sans publier de nouveau rapport si une requête ou une réponse est invalide. Elle n'active pas de collecte de données.

Le JSON de sortie contient l'empreinte SHA-256 du jeu de questions, les paramètres de recherche, les scores par cas et par langue, et les temps de réponse. Garder sous contrôle les deux fichiers, car les noms de sources du dossier peuvent être confidentiels ; `rag-evaluation-reports/` est ignoré par Git. Le fichier `.prom` peut être lu par un collecteur Prometheus local à base de fichiers ; n'ouvrir aucun endpoint de métriques sur le réseau sans contrôle d'accès. Les tests contractuels fonctionnent sans données privées avec `npm run rag:eval:test` et sont exécutés en CI.

Les fonctionnalités déjà présentes dans Actelyo RAG (ingestion, moteur d'embeddings, base vectorielle, génération, Docker) restent utilisables. BentoML, MLflow, Langfuse, Grafana, FAISS et DVC ne sont **pas** des dépendances de ce banc d'essai. Ils pourront être ajoutés en option si un besoin opérationnel précis le justifie, avec une configuration locale et une politique de conservation des données. Un score de rappel ou de MRR ne valide pas à lui seul la justesse juridique des réponses : vérifier séparément les citations et le texte généré sur un corpus autorisé.
