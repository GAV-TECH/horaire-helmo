# Horaire HELMO

Application web qui importe l'horaire HELMO (flux iCalendar `.ics`) et permet de l'enrichir : annotations, deadlines, to-do lists, rappels et groupes d'étudiants.

> **État actuel : phase 4 (toutes les phases prévues).** Comptes, lien `.ics` personnel chiffré, synchronisation avec détection des changements, échéances (évaluations détectées automatiquement), tâches façon To Do, projets, vue « Cette semaine », rappels avec notifications Web Push, PWA installable, **groupes d'étudiants avec partage et temps réel**.

## Prérequis

- **Node.js 24 LTS** (`winget install OpenJS.NodeJS.LTS`, puis redémarrer VS Code)
- Git
- Un compte gratuit sur [supabase.com](https://supabase.com)

## 1. Installation

```powershell
cd C:\Users\gille\dev\horaire-helmonpm run dev
npm install
```

## 2. Configuration Supabase (à faire une fois, dans l'interface web)

1. **Créer le projet** : *New project*, région **Europe (Frankfurt)**. Note le mot de passe de la base (il ne sert pas à l'app, mais garde-le).
2. **Créer les tables** : menu **SQL Editor** → *New query* → colle tout le contenu de [`supabase/migrations/0001_phase2.sql`](supabase/migrations/0001_phase2.sql) → **Run**. Résultat attendu : *Success. No rows returned*. Dans **Table Editor**, tu dois voir `profiles`, `ics_sources`, `sessions`, `notes` (supprimée plus tard par la migration 0005), `deadlines`, `todo_lists`, `todo_items`, `todo_completions`, toutes marquées « RLS enabled ».
3. **Adresses du site** : **Authentication → URL Configuration**
   - *Site URL* : `http://localhost:3000`
   - *Redirect URLs* : ajoute `http://localhost:3000/**`
4. **Modèles d'e-mail (facultatif, nécessite un SMTP personnel)** : Supabase ne permet de modifier les modèles qu'après avoir configuré un SMTP (*Authentication → Emails → Set up SMTP*). Sans ça, l'app fonctionne avec les modèles par défaut, mais **le lien reçu par e-mail doit être ouvert dans le même navigateur que celui où tu as fait la demande** (inscription ou mot de passe oublié). Une fois un SMTP configuré, remplace `{{ .ConfirmationURL }}` dans :
   - *Confirm signup* : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
   - *Reset password* : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

   Avec ce format, le lien fonctionne même ouvert sur un autre appareil.

   Pour tester sans e-mail : *Sign In / Providers → Email* → décocher *Confirm email*.
5. **Connexion par e-mail** : **Authentication → Sign In / Providers → Email** : activé, avec *Confirm email* coché (recommandé).
6. **Récupérer les clés** : **Project Settings → API Keys**
   - *Publishable key* (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - *Secret key* (`sb_secret_…`, bouton *Reveal*) → `SUPABASE_SECRET_KEY`
   - L'URL du projet (bouton **Connect** en haut, ou *Project Settings → Data API*) → `NEXT_PUBLIC_SUPABASE_URL`

   Les anciennes clés *anon* / *service_role* (onglet *Legacy*) fonctionnent aussi.

> ℹ️ Sans configuration SMTP, Supabase n'envoie qu'environ 2 e-mails par heure et **uniquement aux adresses des membres de ton organisation Supabase**. Suffisant pour toi ; pour inviter d'autres étudiants (phase 4), il faudra configurer un SMTP (ex. Resend, gratuit) dans *Authentication → Emails → SMTP Settings*.

## 3. Variables d'environnement

```powershell
Copy-Item .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Remplis `.env.local` (la commande `node` ci-dessus génère `ICS_ENCRYPTION_KEY`) :

| Variable | Visible par le navigateur ? | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | oui | Adresse du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | oui | Clé publique : ne donne accès qu'à ce que le RLS autorise |
| `SUPABASE_SECRET_KEY` | **non** | Clé secrète, contourne le RLS : serveur uniquement |
| `ICS_ENCRYPTION_KEY` | **non** | Clé AES-256 qui chiffre les liens `.ics` en base |
| `ICS_ALLOWED_HOSTS` | **non** | Domaines acceptés pour les liens `.ics` (défaut : `mon-espace.helmo.be`) |

`ICS_URL` (phase 1) ne sert plus : tu peux la supprimer, le lien se colle maintenant dans **Réglages**.

## 4. Lancement

```powershell
npm run dev        # http://localhost:3000
npm test           # tests unitaires (Vitest)
npm run typecheck  # vérification TypeScript
npm run lint       # ESLint
npm run build      # build de production
```

Premier lancement : **Créer un compte** → clique le lien reçu par e-mail → connecte-toi → **Réglages** → colle ton lien `.ics`.

Sur téléphone (même Wi-Fi) : ouvre l'adresse « Network » affichée par `npm run dev`. Confirme ton e-mail depuis le PC : le lien de l'e-mail pointe vers `localhost`.

## 5. Notifications (phase 3, à faire une fois)

Les rappels s'affichent toujours dans la page **Rappels**. Pour recevoir aussi des **notifications** :

1. **Tables** : SQL Editor → *New query* → colle [`supabase/migrations/0002_phase3.sql`](supabase/migrations/0002_phase3.sql) → **Run**.
2. **Clés** (dans le terminal VS Code, dossier du projet) :
   ```powershell
   npm run setup:push
   ```
   Le script ajoute à `.env.local` les clés VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) et `CRON_SECRET`, puis génère deux fichiers ignorés par Git : `supabase/.env.functions` et `supabase/cron.local.sql`. Tu peux remplacer `mailto:admin@example.com` par ton e-mail dans `VAPID_SUBJECT` (contact transmis aux services de push).
3. **Connexion de l'outil Supabase** (ouvre le navigateur, une seule fois) :
   ```powershell
   npx supabase login
   ```
4. **Déployer l'Edge Function et lui donner ses secrets** :
   ```powershell
   npx supabase functions deploy send-reminders --project-ref mlxgvpghjhqzfqsuekuw --no-verify-jwt --use-api
   npx supabase secrets set --env-file supabase/.env.functions --project-ref mlxgvpghjhqzfqsuekuw
   ```
   `--no-verify-jwt` : la fonction est protégée par son propre secret (`CRON_SECRET`), pas par une session utilisateur.
5. **Planifier l'envoi chaque minute** : ouvre `supabase/cron.local.sql` dans VS Code, copie tout, colle dans SQL Editor → **Run**.
6. **Activer sur l'appareil** : relance `npm run dev`, ouvre **Rappels** → *Activer les notifications* → *Envoyer un test*.

Vérifier que la tâche planifiée tourne (SQL Editor) :
```sql
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
select status_code, content from net._http_response order by created desc limit 5;
```
Journaux de la fonction : dashboard → *Edge Functions* → *send-reminders* → *Logs*.

> 📱 **Sur téléphone**, les notifications exigent une adresse **HTTPS** : `http://192.168.x.x:3000` ne suffit pas (seul `localhost` est toléré, sur le PC). Il faut déployer l'app (Vercel) — ce sera l'étape suivante. Sur iPhone, l'app doit en plus être **installée sur l'écran d'accueil** (Safari → Partager → *Sur l'écran d'accueil*).

## 6. Groupes (phase 4, à faire une fois)

1. **Tables** : SQL Editor → *New query* → colle [`supabase/migrations/0003_phase4.sql`](supabase/migrations/0003_phase4.sql) → **Run**.
2. **Juste après**, redéploie la fonction d'envoi (elle envoie maintenant une notification par membre) :
   ```powershell
   npx supabase functions deploy send-reminders --project-ref mlxgvpghjhqzfqsuekuw --no-verify-jwt --use-api
   ```
3. Relance `npm run dev`.

Tester seul avec deux comptes : Chrome normal (compte 1) + fenêtre de navigation privée (compte 2). Pour créer le 2e compte sans recevoir d'e-mail : *Authentication → Sign In / Providers → Email* → décocher *Confirm email* le temps du test.

> Pour de vrais camarades, il faudra : l'app en ligne (Vercel) et un SMTP (ex. Resend) pour que Supabase puisse leur envoyer les e-mails de confirmation.

## 7. Page Tâches façon To Do (à faire une fois)

SQL Editor → *New query* → colle [`supabase/migrations/0004_taches_perso.sql`](supabase/migrations/0004_taches_perso.sql) → **Run**. Ce script ajoute les marqueurs personnels « Important » (étoile) et « Ma journée ». Sans lui, les pages Tâches, Semaine et Groupes ne peuvent pas charger les tâches.

## 8. Projets (à faire une fois)

SQL Editor → *New query* → colle [`supabase/migrations/0005_projets.sql`](supabase/migrations/0005_projets.sql) → **Run**. Ce script autorise les listes de type « projet » et **supprime la table des notes de séance, avec son contenu**.

## 9. Débrief quotidien (à faire une fois)

1. SQL Editor → *New query* → colle [`supabase/migrations/0006_debrief.sql`](supabase/migrations/0006_debrief.sql) → **Run**.
2. Redéploie la fonction d'envoi (elle envoie maintenant aussi le débrief) :
   ```powershell
   npx supabase functions deploy send-reminders --project-ref mlxgvpghjhqzfqsuekuw --no-verify-jwt --use-api
   ```
3. Dans l'app : **Rappels** → *Débrief quotidien* → activé, heure au choix (20 h par défaut).

## 10. Partager toutes ses tâches (à faire une fois)

SQL Editor → *New query* → colle [`supabase/migrations/0007_partage_taches.sql`](supabase/migrations/0007_partage_taches.sql) → **Run**. Ce script crée le partage d'étudiant à étudiant (table `task_shares`, recherche par nom, accord du destinataire) et autorise le partage des listes de séance. Ensuite : **Tâches** → **Toutes** → *Partager toutes mes tâches*, ou menu **⋯** d'une liste.

## Fonctionnement

### Synchronisation de l'horaire
- Le lien `.ics` est chiffré (AES-256-GCM) avant d'être stocké dans `ics_sources`, une table **sans aucune politique RLS** : seule la clé secrète du serveur peut la lire. Le lien n'est jamais renvoyé au navigateur ni écrit dans les logs.
- À l'ouverture de l'horaire, le serveur resynchronise si la dernière synchro date de plus de **5 minutes**. Le bouton **Actualiser** appelle `POST /api/schedule/sync` (au plus une fois toutes les 30 s).
- Chaque synchro compare le nouvel horaire à l'ancien (`src/lib/sessions/diff.ts`) : séance **déplacée**, **changement de local**, **annulée** (ou disparue du flux), **ajoutée** dans les 14 jours → badge orange jusqu'à ce que tu cliques « OK, vu ».
- Les séances ne sont jamais supprimées : les listes de tâches liées à une séance la retrouvent toujours.

### Projets
Un projet est une liste de tâches d'un type particulier (`scope = 'project'`) : chaque tâche peut avoir une échéance (jalon), des rappels, et le projet peut être partagé avec un groupe (chacun coche pour soi). L'onglet **Projets** montre l'avancement et la prochaine échéance de chaque projet. Les anciennes notes de séance ont été retirées (migration 0005).

### Partage des tâches
- **Avec un étudiant** : on tape son nom (suggestions pendant la frappe, `find_students` : 2 lettres minimum, 6 résultats, adresse e-mail masquée), il reçoit une demande (bandeau en haut de l'app) et l'**accepte** ou la refuse. Une liste précise (menu **⋯**) ou toutes ses tâches (vue **Toutes** ; séances comprises, listes créées ensuite aussi, pas les projets).
- Une fois accepté : les deux voient les mêmes tâches **en temps réel** et peuvent les **modifier** (titre, échéance) ou en ajouter. **Cocher reste personnel** : si l'un valide une tâche, elle n'est validée que pour lui (`todo_completions`). Seuls l'auteur et le propriétaire peuvent supprimer une tâche.
- Chacun peut arrêter : le propriétaire (« Arrêter ») ou le destinataire (« Quitter »).
- **Avec un groupe** : toujours possible depuis le menu **⋯** d'une liste.

### Rappels et notifications
- Un rappel vise une séance, une deadline ou une tâche : **15 min / 1 h / 1 jour avant**, ou une **date précise**. Un rappel relatif suit sa cible si elle est déplacée (l'heure est recalculée par la vue `reminder_schedule`).
- Chaque minute, **pg_cron** appelle l'**Edge Function** `send-reminders` (Supabase, Deno). Elle « réserve » les rappels dus (`claim_due_reminders`, jamais deux fois le même), puis envoie une notification Web Push à chaque appareil abonné. Pas d'envoi si la séance est annulée ou la tâche déjà faite.
- Choix : une Edge Function + pg_cron plutôt qu'un cron Vercel, car le plan gratuit de Vercel ne lance ses crons qu'une fois par jour, et la fonction marche quel que soit l'hébergement de l'app.
- Le chiffrement Web Push (RFC 8291) et la signature VAPID (RFC 8292) sont codés avec l'API standard Web Crypto (`supabase/functions/send-reminders/webpush.ts`), sans bibliothèque : le même fichier tourne dans Deno et dans Node, et il est validé par le vecteur de test officiel de la RFC.

### Tâches
- Mise en page inspirée de Microsoft To Do : listes à gauche, tâches au centre, détail à droite (sur téléphone : un écran à la fois).
- Listes intelligentes : **Ma journée** (se vide toute seule le lendemain), **Important** (étoile), **Planifié** (en retard, aujourd'hui, demain, 7 jours, plus tard), **Toutes**, **Séances** (les tâches ajoutées depuis une séance de l'horaire, regroupées par séance).
- Ajout rapide : « ＋ Ajouter une tâche », puis Entrée. Depuis une liste intelligente, la tâche va dans la liste personnelle « Tâches » (créée au besoin).
- L'étoile et « Ma journée » sont **personnelles**, même sur une tâche partagée (table `todo_item_flags`).
- Les tâches terminées sont repliées dans « Terminées ». Les clics s'affichent immédiatement (`useOptimistic`), puis sont enregistrés.

### Groupes et partage
- Un groupe a des **administrateurs** (gèrent les membres, renomment, régénèrent le code, suppriment) et des **membres**. On rejoint avec un **code** (12 caractères) ou un **lien** `/groupes/rejoindre?code=…` (avec confirmation). Si le dernier admin part, le membre le plus ancien le devient ; si le dernier membre part, le groupe est supprimé.
- On partage des **deadlines**, des **listes de tâches** (toutes leurs tâches) et des **rappels** posés sur ces éléments (« pour tout le groupe »). Un élément partagé est lié au **groupe + date + nom de cours**, jamais à l'UID d'une séance personnelle (deux étudiants n'ont pas les mêmes UID). Une liste liée à une séance ne peut donc pas être partagée.
- « Fait » est **par membre** (`deadline_completions`, `todo_completions`) : chacun coche pour soi, et voit « ✓ 2/4 · Alice, Bob ».
- Un rappel partagé notifie tous les membres ; chacun peut le **couper pour lui** (`reminder_mutes`).
- Modifier/supprimer : l'auteur ou un admin du groupe. Tous les membres peuvent ajouter des tâches à une liste partagée.
- **Temps réel** : Supabase Realtime prévient les navigateurs connectés d'un changement (en respectant le RLS), et la page se recharge depuis le serveur (`router.refresh()`).
- **Confidentialité** : séances, lien `.ics`, abonnements push restent invisibles aux autres membres ; ils ne voient que ton nom affiché et ce que tu partages (vérifié par des tests RLS à 3 utilisateurs).

### Sécurité
- **RLS** sur toutes les tables : chacun ne voit que ses données.
- Les server actions vérifient l'utilisateur et valident les entrées avec **zod**.
- Seuls les liens `https://mon-espace.helmo.be/…` sont acceptés (sinon le serveur pourrait être utilisé pour télécharger n'importe quelle URL, y compris interne).

## Structure

```
supabase/migrations/          Scripts SQL à exécuter dans Supabase
fixtures/exemple.ics          Horaire FICTIF utilisé par les tests
supabase/functions/send-reminders/  Edge Function d'envoi des rappels (Deno) + chiffrement Web Push
supabase/cron.sql             Modèle de planification (rempli par npm run setup:push)
scripts/setup-push.mjs        Génère les clés VAPID et le secret de la tâche planifiée
public/sw.js                  Service worker : reçoit les notifications
src/proxy.ts                  Rafraîchit la session et protège les pages (ex-middleware)
src/app/(auth)/               Connexion, inscription, mot de passe oublié
src/app/(app)/                Pages connectées : horaire, semaine, tâches, échéances, groupes, projets, rappels, réglages
src/app/api/schedule/sync/    Route API de synchronisation
src/app/auth/confirm/         Arrivée depuis les liens reçus par e-mail
src/components/               Interface (schedule/, items/, deadlines/, todos/, settings/, auth/)
src/lib/actions/              Server actions (écritures), toujours validées par zod
src/lib/data/                 Lecture des données et types
src/lib/ics/                  Téléchargement, parsing, masquage des secrets
src/lib/sessions/             Comparaison des synchros et rattachement des listes de séance (fonctions pures testées)
src/lib/supabase/             Clients Supabase (utilisateur / admin)
src/lib/sync.ts               Synchronisation d'un utilisateur
src/lib/crypto.ts             Chiffrement du lien .ics
```
