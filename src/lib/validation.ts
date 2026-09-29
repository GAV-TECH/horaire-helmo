import { z } from "zod";
import { courseKey } from "@/lib/courses";
import { brusselsToIso } from "@/lib/time";

/**
 * Schémas de validation des formulaires. Ils tournent côté serveur (dans les server actions) :
 * tout ce qui vient du navigateur est considéré comme non fiable, même si le formulaire HTML
 * a déjà ses propres contrôles.
 */

const trimmed = (max: number, label: string) =>
  z.string().trim().min(1, `${label} est obligatoire.`).max(max, `${label} : ${max} caractères maximum.`);

/** Champ facultatif : une chaîne vide devient null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.");
const timeField = z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide.");
const isoField = z.iso.datetime({ offset: true });
export const idSchema = z.uuid();

export const displayNameSchema = trimmed(60, "Le nom affiché");
export const emailSchema = z.email("Adresse e-mail invalide.").trim().toLowerCase();
export const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .max(72, "Le mot de passe est trop long (72 caractères maximum).");

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Mot de passe requis.") });
export const signUpSchema = z.object({ email: emailSchema, password: passwordSchema, displayName: displayNameSchema });

/**
 * N'accepte que les hôtes autorisés (par défaut mon-espace.helmo.be).
 * Sans cette liste, n'importe qui pourrait faire télécharger au serveur une URL de son choix,
 * y compris une adresse interne (attaque "SSRF").
 */
export function isAllowedIcsUrl(url: string, allowedHosts: string[]): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && allowedHosts.includes(hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const noteCreateSchema = z.object({
  sessionKey: trimmed(1000, "La séance"),
  courseTitle: trimmed(300, "Le cours"),
  sessionStart: isoField,
  body: trimmed(20000, "La note"),
});
export const noteUpdateSchema = z.object({ id: idSchema, body: trimmed(20000, "La note") });

export const deadlineSchema = z
  .object({
    title: trimmed(200, "Le titre"),
    date: dateField,
    time: timeField.optional().or(z.literal("")).transform((v) => v || "23:59"),
    courseName: optionalText(300),
    priority: z.coerce.number().int().min(1).max(3).default(2),
    details: optionalText(5000),
  })
  .transform((d) => ({
    title: d.title,
    due_at: brusselsToIso(d.date, d.time),
    course_name: d.courseName,
    course_key: d.courseName ? courseKey(d.courseName) : null,
    priority: d.priority,
    details: d.details,
  }));

export const todoListSchema = z
  .discriminatedUnion("scope", [
    z.object({ scope: z.literal("global"), title: trimmed(200, "Le titre") }),
    z.object({ scope: z.literal("course"), title: trimmed(200, "Le titre"), courseName: trimmed(300, "Le cours") }),
    z.object({
      scope: z.literal("session"),
      title: trimmed(200, "Le titre"),
      courseName: trimmed(300, "Le cours"),
      sessionKey: trimmed(1000, "La séance"),
      sessionStart: isoField,
    }),
  ])
  .transform((l) => ({
    title: l.title,
    scope: l.scope,
    course_name: l.scope === "global" ? null : l.courseName,
    course_key: l.scope === "global" ? null : courseKey(l.courseName),
    session_key: l.scope === "session" ? l.sessionKey : null,
    session_start: l.scope === "session" ? l.sessionStart : null,
  }));

export const todoItemSchema = z
  .object({
    listId: idSchema,
    title: trimmed(300, "La tâche"),
    dueDate: dateField.optional().or(z.literal("")),
    dueTime: timeField.optional().or(z.literal("")),
  })
  .transform((t) => ({
    list_id: t.listId,
    title: t.title,
    due_at: t.dueDate ? brusselsToIso(t.dueDate, t.dueTime || "23:59") : null,
  }));

/** Premier message d'erreur lisible d'une validation zod ratée. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Données invalides.";
}
