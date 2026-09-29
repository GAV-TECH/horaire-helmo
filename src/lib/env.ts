import "server-only";
import { z } from "zod";

/**
 * Variables d'environnement serveur, validées une fois au premier usage.
 * En cas d'oubli, le message cite le NOM de la variable manquante, jamais sa valeur.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  ICS_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "doit être 32 octets encodés en base64"),
  ICS_ALLOWED_HOSTS: z
    .string()
    .default("mon-espace.helmo.be")
    .transform((v) => v.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)),
  // Web Push (phase 3) : facultatives, les notifications sont simplement désactivées sans elles.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(40).optional(),
  VAPID_PRIVATE_KEY: z.string().min(20).optional(),
  VAPID_SUBJECT: z.string().startsWith("mailto:").optional(),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => `${i.path.join(".")} (${i.message})`).join(", ");
    throw new Error(`Configuration incomplète dans .env.local : ${names}. Voir README.`);
  }
  cached = parsed.data;
  return cached;
}
