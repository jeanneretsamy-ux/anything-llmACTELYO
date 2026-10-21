# Évaluer la recherche Actelyo RAG en local

Le banc d'essai interroge l'API `POST /v1/workspace/:slug/vector-search` du **vrai workspace** Actelyo RAG. Il mesure Recall@1, Recall@3, Recall@5, Hit@k, MRR et les latences p50/p95, globalement et par langue. Les requêtes ne figurent pas dans le rapport ; les identifiants des sources et les jugements restent dans des fichiers locaux. Aucun appel à Groq, MLflow, Langfuse ou à un serveur distant n'est effectué par cet outil.

1. Dans Actelyo RAG, indexer les documents du workspace et choisir son modèle d'embeddings. Un modèle multilingue compatible avec le fournisseur local configuré peut servir aux jeux français, anglais et arabes. Le choix du modèle et de la base vectorielle reste celui du workspace ; ce banc d'essai ne les remplace pas par E5 ou FAISS.
2. Créer une clé API Actelyo RAG locale et la définir dans la variable d'environnement `ACTELYO_RAG_API_KEY`. Ne pas l'inscrire dans la commande ou le fichier du benchmark.
3. Préparer dans `rag-evaluation-reports/benchmark.json` un JSON `schemaVersion: 1` avec 1 à 1000 cas `{id, language, query, relevant}`. `relevant` contient les identifiants attendus du champ choisi (`id`, `docSource`, `chunkSource`, `url` ou `title`). [L'exemple](examples/rag-eval/benchmark.sample.json) contient des références fictives ; il faut les remplacer par les identifiants réellement indexés. Ne pas confondre les scores de l'exemple cité par l'utilisateur avec ceux d'Actelyo.
4. Lancer, depuis la racine du dépôt :

```powershell
$env:ACTELYO_RAG_API_KEY = '<cle-locale>'
npm run rag:eval -- --benchmark .\rag-evaluation-reports\benchmark.json --workspace mon-dossier --source-field docSource --output .\rag-evaluation-reports\rag-eval.json --prometheus .\rag-evaluation-reports\rag-eval.prom
```

L'API écoute par défaut sur `http://127.0.0.1:3001`. `--base-url` accepte uniquement HTTP sur `localhost`, `127.0.0.1` ou `::1`. `--top-n` vaut 5 par défaut (5 à 100) et `--threshold` vaut 0 par défaut (0 à 1). Les redirections HTTP sont refusées. La commande échoue sans publier de nouveau rapport si une requête ou une réponse est invalide. Elle n'active pas de collecte de données.

Le JSON de sortie contient l'empreinte SHA-256 du jeu de questions, les paramètres de recherche, les scores par cas et par langue, et les temps de réponse. Garder sous contrôle les deux fichiers, car les noms de sources du dossier peuvent être confidentiels ; `rag-evaluation-reports/` est ignoré par Git. Le fichier `.prom` peut être lu par un collecteur Prometheus local à base de fichiers ; n'ouvrir aucun endpoint de métriques sur le réseau sans contrôle d'accès. Les tests contractuels fonctionnent sans données privées avec `npm run rag:eval:test` et sont exécutés en CI.

Les fonctionnalités déjà présentes dans Actelyo RAG (ingestion, moteur d'embeddings, base vectorielle, génération, Docker) restent utilisables. BentoML, MLflow, Langfuse, Grafana, FAISS et DVC ne sont **pas** des dépendances de ce banc d'essai. Ils pourront être ajoutés en option si un besoin opérationnel précis le justifie, avec une configuration locale et une politique de conservation des données. Un score de rappel ou de MRR ne valide pas à lui seul la justesse juridique des réponses : vérifier séparément les citations et le texte généré sur un corpus autorisé.
