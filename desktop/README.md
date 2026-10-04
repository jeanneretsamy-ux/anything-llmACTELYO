# Actelyo LLMQushu pour Windows

Cette enveloppe Electron Actelyo embarque le serveur, le collecteur, Node.js et l'interface du dépôt. Elle est indépendante de l'enveloppe desktop distribuée par l'équipe AnythingLLM, qui ne figure pas dans ce dépôt.

Le raccourci Windows et l'exécutable utilisent `branding/actelyo.ico`. Le chargement utilise le logo officiel `branding/actelyo-logo.png`, également utilisé par l'interface Actelyo. L'installateur crée un raccourci « Actelyo LLMQushu » sur le bureau et dans le menu Démarrer.

Les services démarrent sur des ports libres de `127.0.0.1`. Les données et les secrets restent dans le dossier utilisateur de l'application. Le menu « Dossier de données locales » permet d'y accéder. La fermeture de l'application arrête ses services. La désinstallation conserve les documents.

## Compilation Windows x64

Installer Node.js et les dépendances du serveur et du collecteur. Les modules natifs doivent correspondre à la version de Node utilisée pour préparer le runtime. Autoriser uniquement les scripts d'installation nécessaires aux dépendances de confiance. Le collecteur nécessite Chromium pour l'importation d'URLs et FFmpeg pour la conversion audio ; les documents texte n'en dépendent pas.

Depuis PowerShell, dans le dossier `frontend` :

```powershell
$env:VITE_API_BASE='/api'
npm run build
```

Puis dans `desktop` :

```powershell
npm ci
npm run build:win
```

Le script de préparation vérifie les dépendances et génère Prisma. Les outils de fabrication sont mis en cache dans `desktop/.cache/builder`, sans dépendre des permissions d'un ancien cache Windows. L'installateur est produit dans `desktop/release`. Il contient la licence du cœur du projet. Les bibliothèques embarquées conservent leurs licences.

Cette application ne contient pas de modèle de langage. Configurer un fournisseur dans l'interface, ou connecter Actelyo Legal Inference/Ollama. Les téléchargements de modèles peuvent nécessiter Internet. Une signature Authenticode de l'installateur nécessite un certificat Actelyo ; aucune identité d'éditeur tiers n'est réutilisée. La mise à jour est manuelle via un nouvel installateur Actelyo.

La compilation actuelle utilise `win.signExecutable: false` et conserve l'édition de l'icône et des métadonnées. Retirer ce réglage et fournir le certificat Actelyo pour une diffusion signée. Pour une vérification avec des données isolées, lancer l'exécutable avec `--data-dir=C:\chemin\de\test`.

## Version web locale : Actelyo RAG

Après compilation du frontend et préparation du runtime ci-dessus, lancer
`node desktop/scripts/start-web.cjs`. Le navigateur ouvre l’interface complète
sur `http://127.0.0.1:3001`. Le serveur et le collecteur sont liés uniquement à
la boucle locale ; `--port=PORT` et `--data-dir=CHEMIN` sont disponibles.
Le profil web par défaut est séparé des données de l’application Desktop.
La commande conserve les données entre redémarrages ; Ctrl+C arrête ses services.
Configurer le modèle et l’embedder dans l’application. Aucun modèle n’est téléchargé
par ce lanceur. Le nom du nouvel espace web est Actelyo RAG ; l’ancien installateur
Desktop publié précédemment conserve son nom jusqu’à une nouvelle compilation.
