# Horaire HELMO

Application web qui importe l'horaire HELMO (flux iCalendar `.ics`) et permet de l'enrichir : annotations, deadlines, to-do lists, rappels et groupes d'étudiants.

> **État actuel : phase 1**. Import du flux `.ics` (depuis `ICS_URL`), parsing, vues **semaine / jour / à venir**. Pas encore d'authentification ni de base de données.

## Prérequis

- **Node.js 24 LTS** (`winget install OpenJS.NodeJS.LTS`, puis redémarrer VS Code)
- Git

## Installation

```powershell
cd C:\Users\gille\dev\horaire-helmo
npm install
Copy-Item .env.example .env.local
```

Ouvre ensuite `.env.local` et remplace la valeur de `ICS_URL` par ton lien personnel :

1. Sur mon-espace.helmo.be, ouvre **Mon horaire** et cherche l'option d'export ou d'abonnement iCalendar.
2. Copie le lien (il ressemble à `https://mon-espace.helmo.be/MonHoraire/ICalendarEtudiant/Fichier?token=…`).
3. Colle-le dans `.env.local`.

⚠️ Ce lien donne accès à ton horaire sans mot de passe. `.env.local` est ignoré par Git : ne le copie nulle part ailleurs. S'il fuit, régénère le token sur mon-espace.

## Lancement

```powershell
npm run dev        # serveur de développement : http://localhost:3000
npm test           # tests unitaires (Vitest)
npm run typecheck  # vérification TypeScript
npm run lint       # ESLint
npm run build      # build de production
```

Pour tester sur ton téléphone (même Wi-Fi) : ouvre l'adresse « Network » affichée par `npm run dev` (ex. `http://192.168.x.x:3000`).

## Variables d'environnement

| Variable | Où | Rôle |
|---|---|---|
| `ICS_URL` | serveur uniquement | Phase 1 : lien `.ics` personnel. Disparaîtra en phase 2 (lien stocké par utilisateur). |

Les variables sans préfixe `NEXT_PUBLIC_` ne sont **jamais** envoyées au navigateur par Next.js.

## Fonctionnement

1. Le navigateur appelle `GET /api/schedule` (bouton **Actualiser** : `?refresh=1`).
2. La route serveur télécharge le `.ics` (le navigateur ne le peut pas : CORS, et le lien est secret), le parse avec **ical.js**, puis renvoie les séances en JSON.
3. Le résultat est gardé en cache **5 minutes** côté serveur. Une actualisation forcée est limitée à une toutes les 30 secondes.
4. Toutes les dates sont stockées en UTC et affichées en heure de **Bruxelles**, quel que soit le fuseau du serveur (Vercel tourne en UTC).

Le lien n'apparaît ni dans les réponses de l'API, ni dans les messages d'erreur, ni dans les logs : les erreurs réseau sont filtrées par `redactSecrets()`.

## Structure

```
fixtures/exemple.ics          Horaire FICTIF utilisé par les tests
src/app/api/schedule/route.ts Route API : import de l'horaire
src/app/page.tsx              Page d'accueil (rendu serveur → ScheduleApp)
src/components/schedule/      Interface : grille horaire, listes, panneau de détail
src/lib/ics/                  Téléchargement (serveur), parsing, masquage des secrets
src/lib/calendar.ts           Jours, semaines, regroupement par jour (Bruxelles)
src/lib/layout.ts             Placement côte à côte des séances qui se chevauchent
src/lib/courses.ts            Normalisation des noms de cours et couleurs
src/lib/time.ts               Fuseau Europe/Brussels et formatage en français
```

## Configuration Supabase

Arrive en phase 2 : les étapes à faire dans l'interface Supabase seront détaillées ici.
