# Workflow de mise à jour

Pour chaque modification de ce projet, appliquer la règle demandée par l’utilisateur :

1. Modifier les sources locales et effectuer les vérifications adaptées.
2. Créer un commit des fichiers concernés, sans inclure de secrets ni de modifications étrangères à la demande.
3. Pousser le commit sur le dépôt Git distant.
4. Mettre à jour la production depuis ce commit Git, puis reconstruire et redémarrer uniquement les services concernés.
5. Vérifier la fonctionnalité déployée et la correspondance entre le commit local, le dépôt distant et la production.

Ne pas déployer les modifications de sources par copie directe SCP ou `docker cp`. Si le push ou la synchronisation Git échoue, résoudre le problème avant le déploiement et informer l’utilisateur si une intervention est nécessaire.

Production : `inrh@172.16.10.101`, dépôt `/home/inrh/DATALAKE_LAST`.
