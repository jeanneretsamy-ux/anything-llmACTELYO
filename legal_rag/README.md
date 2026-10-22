# Actelyo Legal RAG optionnel — E5, FAISS et observabilité

Ce module complète Actelyo RAG Desktop : il indexe **un corpus que vous fournissez** article par article avec multilingual E5, recherche localement dans FAISS et peut demander une réponse citée à un LLM local. Il ne contient ni le Code civil égyptien ni des données issues du [projet de référence](https://github.com/AyaMYousef/-LLM-RAG-Arabic-Legal-Document-Q-A). Aucun corpus ni modèle n'est téléchargé automatiquement au démarrage.

## Mise en route locale

Depuis la racine du dépôt, préparer un JSON conforme à [l'exemple fictif](../examples/rag-eval/legal-articles.sample.json). `is_repealed` est obligatoire ; seuls les articles déclarés en vigueur sont indexés. Les fichiers et leurs empreintes sont vérifiés lors de l'indexation.

```powershell
npm run rag:prepare-legal -- --input .\mon-corpus-autorise.json --output .\legal_rag\data\corpus
```

Sur Linux, installer les dépendances Python de `requirements.txt`. Sur Windows, FAISS recommande sa distribution Conda CPU x86-64 ; installer `faiss-cpu` par Conda/Pixi, puis les autres dépendances Python de ce dossier. Télécharger volontairement le modèle `intfloat/multilingual-e5-base` avec `py -m legal_rag.cli download-model --output .\legal_rag\data\models\multilingual-e5-base`. Cette commande fixe la révision distante et conserve les SHA-256 des fichiers ; elle exige le réseau une fois. Le programme de recherche charge ensuite uniquement les fichiers présents localement (`local_files_only=True`). Il faut de l'espace disque et de la mémoire pour E5 et FAISS. Docker offre l'autre chemin d'installation, avec `legal_rag/compose.yaml`, après dépôt du modèle dans `data/models/` et construction de l'index.

```powershell
$env:ACTELYO_E5_MODEL = (Resolve-Path .\legal_rag\data\models\multilingual-e5-base).Path
py -m legal_rag.cli index --corpus .\legal_rag\data\corpus --output .\legal_rag\data\index
$env:ACTELYO_LEGAL_INDEX = (Resolve-Path .\legal_rag\data\index).Path
py -m uvicorn legal_rag.api:app --host 127.0.0.1 --port 8765
```

`POST http://127.0.0.1:8765/search` accepte `{"query":"...","limit":5}` ; `POST /answer` accepte aussi `language` (`fr`, `en`, `ar`). `/health` indique le corpus et le modèle réellement chargés. Le moteur sépare les articles longs en passages, utilise les préfixes E5 `passage:` et `query:`, normalise les vecteurs, puis renvoie des articles distincts avec citation et page. L'index est distinct de la base vectorielle habituelle du Desktop ; il ne modifie aucun workspace existant.

La réponse utilise par défaut une API OpenAI compatible **locale** sur `http://127.0.0.1:1234/v1` (LM Studio, Actelyo LLM ou autre serveur compatible). Régler `ACTELYO_LOCAL_LLM_URL` et `ACTELYO_LOCAL_LLM_MODEL` selon le serveur. Avec Docker, le fichier Compose cible `host.docker.internal:1234` et autorise explicitement cette adresse locale. Le service retourne `has_verifiable_citation` pour signaler la présence de numéros de sources existants ; ce contrôle syntaxique **ne valide pas** la justesse juridique de la réponse. Vérifier les textes, leur statut et leur date sur des sources officielles avant usage.

Groq est **facultatif** : `ACTELYO_LEGAL_GENERATOR=groq`, `ACTELYO_ALLOW_CLOUD_CONTEXT=yes`, `GROQ_API_KEY` et `ACTELYO_GROQ_MODEL` sont tous requis. Ce choix envoie question et passages juridiques à Groq ; ne l'activer que pour des données autorisées. Aucun contexte n'est envoyé à Groq en mode local.

## Évaluation et exploitation

Le benchmark JSON contient `{"cases":[{"id":"q1","language":"fr","query":"...","relevant":["id-article"]}]}`. Pour chaque cas, le rapport conserve le rang du premier article attendu et mesure Recall@1/3/5, MRR et latence. Il contient l'empreinte SHA-256 du jeu de questions ; le texte des questions n'est pas recopié dans le rapport.

```powershell
py -m legal_rag.cli evaluate --index .\legal_rag\data\index --benchmark .\benchmark-prive.json --output .\legal_rag\data\evaluation.json
```

`--mlflow-local .\legal_rag\data\mlruns` active une trace d'expérience MLflow **locale** (paramètres, empreintes et métriques, sans question). Installer `requirements-ops.txt` pour MLflow et BentoML. `bentoml serve legal_rag.bento_service:ActelyoLegalRag --host 127.0.0.1` expose la même API sous `/legal` si BentoML est souhaité. `ACTELYO_LANGFUSE_HOST=http://127.0.0.1:3000` active les traces Langfuse sur une instance auto-hébergée, avec ses clés `LANGFUSE_PUBLIC_KEY` et `LANGFUSE_SECRET_KEY` ; aucune question ni passage n'est placé dans les métadonnées de recherche. Ce dépôt ne démarre pas Langfuse lui-même.

`GET /metrics` expose des compteurs et la durée cumulée. `docker compose -f legal_rag/compose.yaml --profile monitoring up --build` ajoute Prometheus et Grafana sur l'interface locale. Pour versionner un corpus privé avec DVC, initialiser DVC **dans un dépôt privé dédié**, y faire `dvc add` puis configurer un stockage local ou maîtrisé ; ne pas pousser dans ce dépôt public les pointeurs vers des données confidentielles.

Le [workflow manuel E5/FAISS](../.github/workflows/legal-rag-e5-faiss.yml) exécute une indexation réelle sur les deux articles fictifs. Les tests rapides `py -m unittest discover -s legal_rag/tests -v` vérifient également l'intégrité du corpus et les métriques sans télécharger de modèle. La disponibilité Windows du service Python et son inclusion dans le `.exe` Actelyo RAG doivent être validées séparément ; l'installateur Desktop actuel ne contient pas FAISS, E5 ou Python.
