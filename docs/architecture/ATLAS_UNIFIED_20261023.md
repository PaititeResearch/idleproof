# Atlas unifié — contrat d'intégration expérimentale

Date : 23 octobre 2026. Branche candidate empilée sur PR #50. **Ne pas fusionner, déployer ou remplacer la recette humaine sans validation explicite.**

## Décision produit

**Un seul Atlas visible dans IdleProof** sur /atlas.html, avec deux espaces dans le même document de navigation :

1. **Structure & UML** : Atlas V1 inchangé comme propriétaire du modèle utilisateur versionné. Conserve lecture des modules et composants, diagrammes UML, classes/interfaces, annotations et alias, **Private note**, éléments et relations déclarés, positions, sauvegarde explicite, restauration de révisions, historique, export JSON/Mermaid, sélection HEAD/WORKTREE, source capturée, signaux d'activité et contexte Core.
2. **Deep understanding** : vues d'appels, graphe global avec tous les types de relations disponibles, fonction focalisée, Control Flow, Data Flow, runtime/observed-sequence explicitement indisponibles sans observation, recherche, incertitude, contexte source et provenance immuable. Utilise le moteur Deep **inchangé**, exige les deux flags Atlas et Deep.

Ce ne sont **pas deux produits** ni deux registres de vérité fusionnés. L'interface Atlas est unique, mais les deux propriétaires de données restent séparés :
- Atlas V1 conserve OBSERVED/INFERRED Core **et** DECLARED de l'utilisateur sans convertir les notes en preuve.
- Deep conserve ses faits statiques source-bound et leurs statuts CALLS, MAY_CALL, UNKNOWN, EXTERNAL. Proof reste UNKNOWN ; une relation statique ne démontre pas une exécution.
- **Private notes et révisions** sont conservées dans le modèle versionné V1. Cette candidate **n'invente pas d'association persistante entre un nœud Deep et un nœud V1** : leurs identités diffèrent. Pour éditer la note, revenir sur Structure & UML. Une éventuelle correspondance cross-view source/hash est un projet séparé qui nécessite un contrat qualifié.

## Routage et isolation

- Le serveur injecte un bandeau d'onglets et les ressources publiques atlas-unified.* **uniquement lorsque les deux flags sont activés**.
- Le document atlas.html conserve dans son DOM les contrôles et dialogues V1 originaux. Son module atlas.js n'est pas modifié. Passer à Deep masque seulement le DOM V1 : cela ne supprime ni les formulaires ni l'état du modèle.
- Si Save view ou Discard edits est actif (modifications non enregistrées), le changement vers Deep est bloqué avec une explication. Revenir de Deep à Structure n'efface aucune révision. Un garde avertit aussi à la fermeture.
- L'iframe Deep est chargée **paresseusement à la première sélection de son onglet**, via atlas-deep.html?embedded=1, sur la même origine loopback et le même cwd. Cela permet à V1 et Deep de conserver des JS/DOM indépendants, évitant collisions d'identifiants et migrations.
- **Seul** atlas-deep.html?embedded=1 reçoit CSP frame-ancestors 'self' et X-Frame-Options SAMEORIGIN. La page Deep normale, les API, le cockpit et les autres ressources restent DENY/frame-ancestors 'none'. Le serveur Local valide Host/Origin de chaque requête.
- Des messages parent/frame n'acceptent que l'origine exacte et le contentWindow attendu ; ils ne transmettent **aucun code source, clé, discussion, budget, modèle, note ou trace**. Seuls taille, visibilité, thème et demande de retour à Structure sont relayés.
- Deep n'exécute aucun scan au chargement, ne lit pas de WORKTREE et n'appelle aucun fournisseur BYOK. La source HEAD est explicitement sélectionnée, une analyse ne démarre qu'au clic Analyze captured source. L'exemple runtime reste une option synthétique explicitement isolée, non une exécution du dépôt cible.
- L'ancienne URL atlas-deep.html existe temporairement pour les liens de recette ou diagnostic mais n'est **plus** une deuxième entrée produit ; sa page directe reste read-only et refuse l'embedding. Sa suppression éventuelle exige une étape de compatibilité distincte.

## Tests et gate de fusion

1. Tests unitaires : compatibilité de l'injection, présence intégrale de l'éditeur V1, Deep original non altéré et état désactivé inchangé.
2. Sécurité serveur : refus hors origine, refus de framing pour pages standalone, framing same-origin du seul Deep embarqué, API/Host/Origin inchangés.
3. Navigateurs réels à 1440 et 390 : ouverture Atlas sans Deep à l'insu de l'utilisateur, note non enregistrée bloque le changement, note/alias sauvegardés et révision conservés après passage Deep, retour V1, rechargement et consultation historique.
4. Vues Deep : analyse explicite depuis un **dépôt synthétique Git aux octets immuables**, graphe statique, incertitude, cartes globale et focalisée accessibles, aucune génération facturée, aucune mutation de source ou du modèle utilisateur.
5. Gates Core/V1/Deep/UX #47 inchangées sur les mêmes commits de référence, plus intégration installée depuis le package.
6. Recette WSL humaine **sur instance séparée**, en partant du pilote projet-multicouche sur l'arbre connu. Vérifier V1 note, Deep sur le même HEAD, conservation après retour, navigation sur mobile et depuis l'onglet Atlas imbriqué de Local. Ne pas recopier les clés ou historiques d'un serveur existant.

**Non encore qualifié ici** : carte d'exécution runtime d'un vrai projet, compréhension Deep intégrale de grands repos dépassant les plafonds, couverture WORKTREE Deep, fusion des IDs V1/Deep, propagation des notes par identité de fonction, persistance d'analyses Deep après redémarrage, signification métier automatique, publication dans main.

## Critère d'acceptation

L'interface doit paraître être une **fonctionnalité Atlas unique**, et non forcer deux applications indépendantes. Le modèle utilisateur V1 doit être préservé à l'octet au niveau du contrat de stockage ; Deep doit conserver sa provenance et ses garde-fous, y compris ses limites. Pas de merge de cette branche, ni des PR #46–#50 empilées, avant qualification exacte et accord humain explicite.
