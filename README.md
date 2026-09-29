# Horaire HELMO

Application web qui importe l'horaire HELMO (flux iCalendar `.ics`) et permet de l'enrichir : annotations, deadlines, to-do lists, rappels et groupes d'étudiants.

> **État actuel : phase 2.** Comptes (e-mail + mot de passe), lien `.ics` personnel chiffré, synchronisation avec détection des changements, notes, deadlines, to-do lists, vue « Cette semaine ».

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
2. **Créer les tables** : menu **SQL Editor** → *New query* → colle tout le contenu de [`supabase/migrations/0001_phase2.sql`](supabase/migrations/0001_phase2.sql) → **Run**. Résultat attendu : *Success. No rows returned*. Dans **Table Editor**, tu dois voir `profiles`, `ics_sources`, `sessions`, `notes`, `deadlines`, `todo_lists`, `todo_items`, `todo_completions`, toutes marquées « RLS enabled ».
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

## Fonctionnement

### Synchronisation de l'horaire
- Le lien `.ics` est chiffré (AES-256-GCM) avant d'être stocké dans `ics_sources`, une table **sans aucune politique RLS** : seule la clé secrète du serveur peut la lire. Le lien n'est jamais renvoyé au navigateur ni écrit dans les logs.
- À l'ouverture de l'horaire, le serveur resynchronise si la dernière synchro date de plus de **5 minutes**. Le bouton **Actualiser** appelle `POST /api/schedule/sync` (au plus une fois toutes les 30 s).
- Chaque synchro compare le nouvel horaire à l'ancien (`src/lib/sessions/diff.ts`) : séance **déplacée**, **changement de local**, **annulée** (ou disparue du flux), **ajoutée** dans les 14 jours → badge orange jusqu'à ce que tu cliques « OK, vu ».
- Les séances ne sont jamais supprimées : les notes gardent leur séance.

### Notes
Une note est liée à une séance par son UID. Si l'UID change, elle est retrouvée par **nom du cours + heure de début**. Si rien ne correspond, elle apparaît dans **Notes → Notes orphelines**.

### Sécurité
- **RLS** sur toutes les tables : chacun ne voit que ses données.
- Les server actions vérifient l'utilisateur et valident les entrées avec **zod**.
- Seuls les liens `https://mon-espace.helmo.be/…` sont acceptés (sinon le serveur pourrait être utilisé pour télécharger n'importe quelle URL, y compris interne).
- Les notes markdown ne peuvent pas contenir de HTML ni de script.

## Structure

```
supabase/migrations/          Scripts SQL à exécuter dans Supabase
fixtures/exemple.ics          Horaire FICTIF utilisé par les tests
src/proxy.ts                  Rafraîchit la session et protège les pages (ex-middleware)
src/app/(auth)/               Connexion, inscription, mot de passe oublié
src/app/(app)/                Pages connectées : horaire, semaine, tâches, deadlines, notes, réglages
src/app/api/schedule/sync/    Route API de synchronisation
src/app/auth/confirm/         Arrivée depuis les liens reçus par e-mail
src/components/               Interface (schedule/, items/, deadlines/, todos/, settings/, auth/)
src/lib/actions/              Server actions (écritures), toujours validées par zod
src/lib/data/                 Lecture des données et types
src/lib/ics/                  Téléchargement, parsing, masquage des secrets
src/lib/sessions/             Comparaison des synchros et rattachement des notes (fonctions pures testées)
src/lib/supabase/             Clients Supabase (utilisateur / admin)
src/lib/sync.ts               Synchronisation d'un utilisateur
src/lib/crypto.ts             Chiffrement du lien .ics
```
