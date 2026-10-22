# Atlas Deep Understanding — rapport de candidate expérimentale

Date : 22 octobre 2026. Base intouchée : PR #46, commit `b8f03f9e7b98d6ae44ba1401ff0afa76f2f06cae`. Branche : `experiment/atlas-deep-understanding-20261022`. Qualification **MACHINE**, recette **HUMAN : NOT_RUN**. Ce rapport distingue les résultats mesurés des capacités non qualifiées.

## A. Résumé exécutif

Une couche sémantique distincte d’Atlas V1 est livrée : lecture des blobs Git immuables admis par Core, analyse Python et JS/TS, admission de provenance, graphe d’appels, vues de contrôle/données et navigation vers les sources. Les analyses sont explicites, bornées, annulables et sans exécution du projet. L’interface Deep est en lecture seule ; les modèles UML déclarés restent dans l’éditeur V1 existant.

Le parcours opérationnel est : scan Core explicite → capture HEAD → analyse demandée → graphe et inspection → source exacte. Le contrat Core réel est testé séparément des manifests synthétiques du navigateur. Le runtime a un parcours distinct, limité à un exemple intégré fixe et soumis à une vérification d’isolation. Aucun projet utilisateur n’est lancé. Cette candidate ne réalise pas une compréhension complète du programme et n’est pas une nouvelle release générale.

## B. Architecture

Voir [contrat d’intégration](../architecture/ATLAS_DEEP_20261022.md), [schéma v1](../../spec/atlas-deep-v1.md) et les modules `src/atlas-deep*`. Seul `src/server.mjs` change parmi les fichiers de production préexistants. Les scripts Atlas V1, le stockage des annotations/révisions, Core, Portal, hooks, BYOK et politiques restent inchangés.

Les deux flags `IDLEPROOF_EXPERIMENTAL_ATLAS=1` et `IDLEPROOF_EXPERIMENTAL_ATLAS_DEEP=1` sont nécessaires. Le graphe porte snapshot, arbre, profil, dépôt local, hash source, coordonnées, analyseur/version et autorité. `CALLS` signifie une identité de cible statiquement résolue dans le profil annoncé ; aucune exécution n’est prouvée. `MAY_CALL`, inconnus et externes restent visibles. Proof demeure `UNKNOWN`.

Le cache mémoire garde trois graphes au plus. Aucune migration des données utilisateur. WORKTREE n’est pas pris en charge tant qu’un transport complet de ses octets capturés n’est pas qualifié. La consommation de sources est limitée à la sélection du scan ; SQL/YAML peuvent apparaître dans l’inventaire sans devenir des relations sémantiques.

## C. Python

Voir [moteur Python](../architecture/ATLAS_DEEP_PYTHON.md). AST standard Python, pas d’import du code cible. Résolution de fonctions lexicales, imports explicites capturés, alias prudents, closures, récursion, quelques références de classes/méthodes et syntaxe async. Les affectations, portées, décorateurs inconnus, appels réfléchis et dispatch non déterminé empêchent une affirmation certaine.

Une fixture d’équipe possède **16 sites : 9 résolus, 5 externes, 2 inconnus**. Chaque position et cible est vérifiée contre son oracle. Ce nombre 16 ne remplace pas les seize sites du vrai `projet-multicouche` : les octets et le snapshot WSL historiques ne sont pas accessibles ici, donc leur requalification est **NOT_RUN**.

## D. Autres langages

| Format | Capacité effectivement livrée | Limites |
|---|---|---|
| JS / JSX / TS / TSX | Parser TypeScript exact 5.9.3 ; fonctions lexicales, closures, alias const, imports/exports ESM explicites ; syntaxe await/branches/retours | Sans type-checker, compilation, résolution npm, tsconfig ou scripts ; CommonJS, dispatch dynamique, héritage et options de compilation inconnus |
| JSON | Validation du document, inventaire de clés et sections, pointeurs non ambigus | Valeurs non retenues ; coordonnées ancrées au fichier, pas à la clé |
| TOML | Même inventaire via stdlib `tomllib` disponible | Python >=3.11 pour TOML ; autres environnements explicitement unsupported |
| SQL / YAML | Inventaire Core conservé, état unsupported dans Deep | Pas de tables, requêtes, dépendances ni relations inventées |

Voir [JS/TS](../architecture/ATLAS_DEEP_JAVASCRIPT.md), [données](../architecture/ATLAS_DEEP_DATA.md) et [provenance TypeScript](../../src/vendor/typescript-5.9.3/PROVENANCE.md). TypeScript est vendored sous Apache-2.0, avec notices ; aucune installation des dépendances du projet cible.

## E. REA

[Étude et décision](../architecture/ATLAS_DEEP_RESEARCH_20261022.md) : révision demandée `d2015e94f32a51b898918b5b39b374c134119fd5`, comparaison source avec `edccb430c4ace4595ceff71e1b837351e7634938`. Les deux manifests consultés indiquent 6.7.0, 42 dépendances directes et un plancher Node supérieur à IdleProof. Licence MIT examinée.

Décision : pas de dépendance REA ni d’adaptateur revendiqué. Ses mécanismes de preuves retenues et de contextes de provenance inspirent le contrat, mais le gain d’exactitude, de rappel et de ressources n’a pas été mesuré. Comparaison comparative d’exécution REA : **NOT_RUN**. Il n’est ni déclaré inférieur ni considéré qualifié sur la base de son seul volume de relations.

## F. Runtime

[Contrat et limites](../architecture/ATLAS_DEEP_RUNTIME.md). Instrumentation Python `sys.settrace`, événements appel/retour/exception, ordre, durée, identité source et rapprochement exact avec le statique. Aucun argument, valeur de retour, texte d’exception ou sortie cible n’est conservé. Un retour de frame ne prouve pas un retour normal.

Sur cet hôte : **UNAVAILABLE / ISOLATION_TIMEOUT, executed=false**. Aucune trace réelle n’a donc été observée localement. Les tests d’événements/réconciliation utilisent des données synthétiques et ne sont pas comptés comme des observations runtime. Le seul scénario exécutable est la fixture intégrée ; réseau, montage, PID, utilisateur, environnement, droits et budgets sont vérifiés avant lancement. Aucune dégradation vers un subprocess non isolé. L’état CI est à lire dans les artefacts de son exécution exacte.

## G. UI / UX

Page distincte `/atlas-deep.html`, vues Function Call Graph, Focused Function, Control Flow, Data Flow, Runtime Trace et Observed Sequence, lien de retour Module Atlas. Inspection d’entrants/sortants et provenance, source capturée, recherche, pagination, zoom/Fit, thème et liste accessible au clavier. Une séquence provient exclusivement d’une session runtime ; elle n’est jamais fabriquée à partir des flèches statiques.

La recette navigateur comporte 1440 px et 390 px, le vrai serveur, le worker et Cytoscape, sur manifest explicitement synthétique. Localement, Chromium absent : **NOT_RUN**. Les recettes V1/section/zoom existantes restent les gates de la CI existante. Les contrôles machine ne remplacent pas l’évaluation humaine de l’ergonomie.

## H. Fiabilité

Le benchmark a un oracle de positions/cibles écrit par un agent de qualification distinct, conservé séparément du provider. Il ne s’agit pas d’une annotation humaine externe indépendante. Tous les sites inconnus et toutes les cibles attendues restent dans les dénominateurs ; les tests échouent sur faux positif **ou cible attendue manquante**.

| Corpus synthétique | Sites totaux | Résolus / attendus | Ambigus / inconnus / externes | Faux positifs / manquants | Temps total local |
|---|---:|---:|---:|---:|---:|
| 13 fichiers | 17 | 7 / 7 | 1 / 6 / 3 | 0 / 0 | 481.4 ms |
| 33 fichiers | 37 | 27 / 27 | 1 / 6 / 3 | 0 / 0 | 575.5 ms |
| 113 fichiers | 117 | 107 / 107 | 1 / 6 / 3 | 0 / 0 | 1114.7 ms |

CPython `colorsys.py` 3.12.0 est un module externe réellement récupéré et épinglé, avec licence et hashes. Ses **8 sites** incluent **3 appels locaux attendus et retrouvés**, **5 externes**, aucun faux positif et aucune cible locale manquante. C’est un petit corpus externe et un oracle d’équipe, pas une qualification générale de CPython.

La revue sémantique indépendante comprend **29 tests CLI**. Elle a reproduit des faux certains sur imports/préinitialisation Python, alias de réflexion, portée switch, rest-destructuring, enum, valeurs par défaut, décorateurs et héritage JS. Ces cas ont été corrigés puis passent. Historique conservé : première revue 12/20 pass, 8 échecs ; une édition transitoire a provoqué une erreur d’indentation logique Python, corrigée. Le test CFG initial n’avait pas de successeur après try/finally et a été rectifié pour exercer effectivement la continuation possible. Aucune gate préexistante n’a été supprimée ni assouplie.

Le résultat zéro faux positif est borné à ces corpus. Il ne certifie ni exhaustivité, ni absence de défauts inconnus, ni validité universelle de la résolution.

Un essai supplémentaire a utilisé la vraie capture Core du dépôt IdleProof à la base PR #46 : **588 entrées, 435 sources**, dont **256 fichiers / 1,98 Mo** admis par Deep, 50 omis par limite. Résultat **INCOMPLETE** : plus de 19 000 sites JS, plafond atteint, aucun graphe agrégé publié. Sans oracle, exactitude **NOT_MEASURED**. Le [rapport](../../qualification-evidence/atlas-deep/idleproof-real-repository.json) conserve ce résultat et le diagnostic par provider. Cette mesure a motivé un diagnostic de budget explicite dans l’API, sans relever le plafond ni présenter un graphe tronqué comme complet.

## I. Performance

Les durées du tableau mesurent la lecture Git, le démarrage des workers, l’analyse et l’admission, pas seulement la projection. Le benchmark rapporte séparément la projection V1, les temps provider, CPU/RSS disponibles et les limites de mesure. Le RSS de l’orchestrateur est un pic sur la durée du processus ; il ne mesure pas tous les descendants.

V1, même test 1 000 fichiers / 3 000 nœuds : baseline locale 69,96 ms ; contrôle Atlas final reporté dans le log. Seuil inchangé de 5 000 ms. Cette mesure unique n’est pas une preuve statistique de latence ou de performance utilisateur. Deep ajoute un coût seulement lors de l’action explicite, sans chargement de parser à l’ouverture ordinaire ni analyse continue. Projets massifs, mémoires agrégées OS et latence humaine : non qualifiés.

## J. Sécurité

Tests de hash, chemin, symlink, exclusion, source périmée, provider usurpé, cible pendante, autorité gonflée, colonnes invalides, sortie excessive, délais et annulation. Git ne peut ni lancer fsmonitor, ni télécharger paresseusement un blob promisor via un helper. Pas de lecture du contenu source de WORKTREE ni d’élargissement à Markdown/secrets. Le worker statique est une frontière de ressources, pas un sandbox permettant d’exécuter le projet.

Limites : 256 fichiers, 256 KiB par fichier, 4 MiB total ; 60 s ensemble capture/analyse ; Git 10 s par commande ; Node old-space 384 MiB ; sortie 16 MiB ; 30 000 nœuds / 60 000 relations / 20 000 appels ; projection 150 nœuds / 600 relations. Les descendants POSIX sont arrêtés par groupe de processus ; l’annulation de tous descendants Windows reste **NOT_QUALIFIED**. Aucun accès réseau nécessaire à l’analyse, aucune requête BYOK ni dépense déclenchée.

## K. Non-régression

| Contrôle local | Réussites | Échecs | Non exécutés | Statut |
|---|---:|---:|---:|---|
| Baseline complète au SHA PR #46 | 766 | 3 | 7 | FAIL préexistant |
| Implémentation initiale `2192496`, 891 tests | 880 | 3 | 8 | FAIL, mêmes trois cas |
| Candidate finale Atlas + Deep avec vrai Core épinglé | 149 | 0 | 0 | PASS |
| Revue sémantique indépendante | 29 | 0 | 0 | PASS borné |
| Navigateur local | 0 | 0 | 1 lancement | NOT_RUN, binaire absent |
| Observation runtime locale | 0 | 0 | 1 scénario | NOT_RUN, isolation indisponible |

Les trois échecs baseline et candidate sont identiques, dans `portal-memory-lock.test.mjs` : PID réutilisé, propriétaire zombie, propriétaire changeant pendant l’inspection. Ils restent visibles et ne sont pas reclassés PASS. Aucun fichier de cette fonctionnalité ni seuil de test n’est modifié. Les contrats Core ciblés passent avec `7f043a3cbaf1b2c3e59d48bc6509a1ae627f8a23`; le Core installé chez l’utilisateur n’a pas été changé.

La suite complète locale précède le correctif de diagnostic de plafond. Ce correctif et son cas de régression sont inclus dans les 149 tests Atlas finaux ; la suite complète du SHA livré reste une gate CI distincte.

Le test confirme page Atlas identique avec Deep désactivé, graphes V1 et modèles capturés inchangés, notes/révisions et exclusions conservées. Package dry-run réussi avec parser, providers et licences inclus ; aucun pycache inclus. Les preuves locales sont sous [qualification-evidence/atlas-deep](../../qualification-evidence/atlas-deep/).

## L. GitHub et statut de livraison

Branche dédiée ; PR draft empilée sur `candidate/atlas-wheel-zoom-20261022`, sans modification de main ni fusion. Le SHA final, le lien de PR, les runs CI et les artefacts sont consignés dans le corps de la PR et le complément de qualification. À la rédaction initiale, la CI de cette candidate n’est pas encore exécutée : aucun PASS distant revendiqué.

Les quatre workflows attendus sont les trois existants (`test`, `project-understanding`, `repository-atlas-experimental`) et `atlas-deep-experimental` (contrats sur Linux/Windows/macOS, benchmark, navigateur et résultat runtime). Une PR en draft n’est pas une autorisation de déploiement.

## M. Recette humaine et retour arrière

Suivre [le guide isolé](../EXPERIMENTAL_ATLAS_DEEP.md). Il exige le SHA effectivement qualifié, un checkout outil séparé, une copie du projet et un autre port (4780 suggéré). Ne pas arrêter ou remplacer la recette 4778 ; ne pas importer les historiques/budgets/clefs de production ; ne pas mettre Core à jour implicitement. Le scan est une action explicite dans la copie.

Arrêter ce serveur puis omettre le flag Deep suffit au retour V1 dans la copie. Aucune migration à annuler. Aucune installation ni recette humaine WSL n’a été exécutée par cette mission.

## N. Travaux restants et objectifs non atteints

1. Requalifier les vrais 16 sites du pilote sur sa capture exacte ; obtenir une annotation humaine externe et des corpus plus grands.
2. Observer réellement le scénario runtime sur un hôte dont l’isolation passe ; instrumentation d’un projet utilisateur, async/thread/native et scénarios multiples non pris en charge.
3. Étendre CFG (exceptions, finally, match, context managers) et DFG (reaching definitions, propagation de valeurs/retours interfonctionnels), puis qualifier leurs dénominateurs. Le graphe actuel est syntaxique/lexical partiel.
4. Étendre dispatch Python d’instances, héritage, higher-order ; JS CommonJS, module loaders, type-checker, options et packages ; SQL/YAML avec parseurs sûrs qualifiés.
5. Ajouter transport WORKTREE complet, persistance/versionnement sémantique, qualification ressources OS/Windows et grands projets.
6. Une vue Focused Feature métier, une explication pédagogique liée au graphe Deep et l’enrichissement des modèles utilisateur restent à concevoir/qualifier. Le harness BYOK existant est préservé mais pas raccordé au nouveau graphe.
7. Comparaison exécutée de REA avant toute intégration. Aucune supériorité mesurée revendiquée.

Ces écarts sont explicites : cette livraison est une candidate fonctionnelle à périmètre borné, pas l’accomplissement de toutes les ambitions de la mission.
