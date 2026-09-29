@AGENTS.md

# Horaire HELMO

Application web pour étudiants HELMO : import de l'horaire personnel (flux `.ics` avec token secret) enrichi de notes, deadlines, to-do lists, rappels (Web Push) et groupes partagés. Interface en **français**, fuseau **Europe/Brussels** partout. L'utilisateur est étudiant en informatique : expliquer brièvement les choix importants.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4. **Lire `node_modules/next/dist/docs/` avant d'utiliser une API Next** : `proxy.ts` remplace `middleware.ts`, `refresh()` de `next/cache` après une mutation, `PageProps<"/route">` / `LayoutProps` globaux.
- Supabase Cloud : auth e-mail + mot de passe, Postgres + RLS (`@supabase/ssr`, `getClaims()` côté serveur). SQL dans `supabase/migrations/`, exécuté à la main dans le SQL Editor (pas de CLI).
- `ical.js` (serveur), `date-fns` v4 + `@date-fns/tz`, `zod` v4, `react-markdown`, Vitest.
- Supabase Edge Function (Deno) `supabase/functions/send-reminders`, déployée avec `npx supabase functions deploy … --use-api` (pas de Docker). Son `index.ts` est exclu de tsc (globaux Deno) ; `webpush.ts` et `message.ts` sont du TS standard, testés par Vitest.
- À venir : Realtime pour les groupes. Hébergement prévu : Vercel.
- Projet Supabase : ref `mlxgvpghjhqzfqsuekuw`. Secrets locaux dans `.env.local` (ne jamais les afficher) ; `npm run setup:push` génère VAPID + CRON_SECRET et les fichiers ignorés `supabase/.env.functions`, `supabase/cron.local.sql`.

## Commandes

`npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`

## Architecture

- Lecture : Server Components (`src/app/(app)/*/page.tsx`) → `src/lib/data/queries.ts` avec le client utilisateur (RLS) → props vers des composants client.
- Écriture : server actions `src/lib/actions/*.ts` (`"use server"`). Chacune appelle `actionContext()` (vérifie l'utilisateur), valide avec zod (`src/lib/validation.ts`), écrit via le client utilisateur, puis `refresh()`. Elles renvoient un `ActionResult`. Côté client, `useFormAction` / `useTransition` (`src/components/ui.tsx`).
- Client admin (`src/lib/supabase/admin.ts`, clé secrète, ignore le RLS) : **uniquement** pour `ics_sources` et l'écriture des `sessions` (dans `src/lib/sync.ts`, `settings.ts`). Toujours filtrer par `user_id`.
- Depuis la phase 4, les lectures de deadlines / listes / rappels ne filtrent PAS par `user_id` : le RLS renvoie les siennes + celles partagées. L'UI masque ce que le RLS refuserait (`canEdit` dans `src/lib/groups.ts`, mêmes règles) ; les actions détectent un refus RLS via `.select()` qui renvoie 0 ligne.
- Constantes de style dans `src/components/styles.ts` (module neutre) : un composant serveur ne peut pas utiliser une constante importée d'un fichier `"use client"`.
- Synchro : `syncSchedule(userId, {force})` → déchiffre le lien → `fetchIcs` → `parseIcs` → `diffSessions` (pure) → écrit → recolle notes et listes (`matchSession`). Cache de 5 min via `ics_sources.last_synced_at`. Route `POST /api/schedule/sync`.

## Conventions

- Dates : stockées et échangées en ISO **UTC**. Pour afficher ou découper en jours, passer par `src/lib/time.ts` (`formatFr`, `dayKey`, `toBrussels`, `brusselsToIso`), jamais par `Date#getHours()` ou `toLocale*` sans fuseau. Les dates venant de Postgres sont normalisées avec `toISOString()` dans les mappers (les comparaisons de chaînes en dépendent).
- Jours manipulés comme clés `"AAAA-MM-JJ"` (`src/lib/calendar.ts`).
- Séances : clé = UID (+ `#RECURRENCE-ID`). Référence d'une note ou d'une liste « séance » = `session_key` + `course_key` + `session_start` (secours si l'UID change). Les séances ne sont jamais supprimées par la synchro (futures disparues → `cancelled`).
- Secrets : lien `.ics` chiffré (`src/lib/crypto.ts`), jamais renvoyé au client ni loggé. Logs d'erreur réseau via `redactSecrets()`. Modules serveur : `import "server-only"`. Liens `.ics` limités à `ICS_ALLOWED_HOSTS` (anti-SSRF).
- Toute nouvelle table : RLS activé + politiques avec `(select auth.uid())`. Tester les politiques (ex. avec PGlite, comme fait en phase 2).
- Logique métier en fonctions pures testées (`*.test.ts` à côté). Tests uniquement avec `fixtures/exemple.ics` (fictif), **jamais** les vraies données de l'utilisateur. Vitest tourne avec `TZ=America/New_York`.
- Composants React purs : pas de `Date.now()` dans le rendu (règle `react-hooks/purity`) → `requestNow()` côté serveur, prop `now` côté client.
- Code et commentaires en français, identifiants en anglais. Un commit par phase.

## Avancement

- [x] Phase 1 : parsing `.ics`, vues semaine / jour / à venir.
- [x] Phase 2 : Supabase, auth, lien chiffré par utilisateur, synchro + badges de changement, notes (avec orphelines), deadlines, to-do lists (fait par utilisateur dans `todo_completions`), vue « Cette semaine ».
- [x] Phase 3 : rappels (table `reminders`, vue `reminder_schedule` qui calcule `fire_at`), Web Push VAPID codé en Web Crypto (`supabase/functions/send-reminders/webpush.ts`, partagé Deno/Node, testé avec le vecteur RFC 8291), Edge Function `send-reminders` appelée chaque minute par pg_cron + pg_net (secret dans Vault), page Rappels, PWA (manifest, `public/sw.js`, icônes générées par `next/og`). Push sur téléphone : nécessite un déploiement HTTPS (Vercel, pas encore fait).
- [x] Phase 4 : groupes (`groups`, `group_members` ; opérations via RPC security definer `create_group`, `join_group`, `leave_group`…), helpers RLS `is_group_member` / `is_group_admin` / `shares_group_with`. `group_id` sur deadlines, todo_lists (jamais scope session), reminders (jamais sur séance). « Fait » par membre (`deadline_completions` remplace `deadlines.done_at`). `reminder_mutes`. `claim_due_reminders` renvoie une ligne par destinataire (`recipient_id`). Realtime → `RealtimeRefresher` (router.refresh). Contextes client `GroupsProvider` / `RemindersProvider` chargés dans `(app)/layout.tsx`.

## Pistes suivantes

- Déploiement Vercel (push sur téléphone, accès pour les camarades) + mettre à jour Site URL / Redirect URLs dans Supabase.
- SMTP (Resend) pour les e-mails de confirmation des autres étudiants, puis modèles d'e-mail `token_hash`.
- Couleurs de cours personnalisables, mode hors ligne.
