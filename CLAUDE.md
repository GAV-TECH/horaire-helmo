@AGENTS.md

# Horaire HELMO

Application web pour étudiants HELMO : import de l'horaire personnel (flux `.ics` avec token secret) enrichi de notes, deadlines, to-do lists, rappels (Web Push) et groupes partagés. Interface en **français**, fuseau **Europe/Brussels** partout. L'utilisateur est étudiant en informatique : expliquer brièvement les choix importants.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4. **Lire `node_modules/next/dist/docs/` avant d'utiliser une API Next** : la version diffère des connaissances habituelles.
- `ical.js` pour le parsing (serveur uniquement), `date-fns` v4 + `@date-fns/tz`, `zod` v4, Vitest.
- À venir : Supabase (auth email + mot de passe, Postgres + RLS, Realtime), PWA + Web Push (VAPID), Edge Function + pg_cron pour les rappels. Hébergement prévu : Vercel + Supabase Cloud.

## Commandes

`npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`

## Conventions

- Dates : stockées et échangées en ISO **UTC**. Pour afficher ou découper en jours, passer par `src/lib/time.ts` (`formatFr`, `dayKey`, `toBrussels`), jamais par `Date#getHours()` ou `toLocale*` sans fuseau.
- Jours manipulés comme clés `"AAAA-MM-JJ"` (`src/lib/calendar.ts`, `fromDayKey` = midi à Bruxelles pour éviter les changements d'heure).
- Séances : type `Session` (`src/lib/ics/types.ts`). Clé = UID, plus `#RECURRENCE-ID` pour les occurrences d'une série. `courseKey` = nom normalisé (couleurs, correspondances).
- Secrets : lien `.ics` jamais renvoyé au client ni loggé. Tout log d'erreur réseau passe par `redactSecrets()`. Les modules serveur importent `"server-only"`.
- Validation des entrées avec zod (query params, URL `.ics`).
- Logique métier en fonctions pures testées (`*.test.ts` à côté du fichier). Tests uniquement avec `fixtures/exemple.ics` (fictif), **jamais** les vraies données de l'utilisateur. Vitest tourne avec `TZ=America/New_York` pour prouver l'indépendance au fuseau de la machine.
- Code et commentaires en français, identifiants en anglais.
- Un commit par phase, message clair.

## Avancement

- [x] Phase 1 : import `.ics` via `ICS_URL`, parsing, vues semaine / jour / à venir, panneau de détail.
- [ ] Phase 2 : Supabase, auth, lien `.ics` chiffré par utilisateur (table sans politique RLS de lecture), séances en base + détection des changements (badges), notes (UID → secours cours + début → orphelines), deadlines, to-do lists, vue « Cette semaine ».
- [ ] Phase 3 : rappels, Web Push, PWA.
- [ ] Phase 4 : groupes (admin / membre, invitations), partage lié au groupe + date + cours (jamais à un UID personnel), statut fait par membre, Realtime. Les rappels partagés notifient tous les membres (chacun peut couper pour lui-même).
