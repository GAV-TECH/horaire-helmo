import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { syncSchedule } from "@/lib/sync";

/**
 * POST /api/schedule/sync — bouton "Actualiser".
 * Télécharge et parse le .ics de l'utilisateur connecté côté serveur, puis met à jour ses séances.
 * La réponse ne contient jamais le lien : seulement le statut et l'heure de synchro.
 * (POST plutôt que GET : l'appel modifie des données.)
 */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const result = await syncSchedule(user.id, { force: true });
  const status = result.status === "error" ? 502 : result.status === "no-source" ? 409 : 200;
  return NextResponse.json(result, { status, headers: { "Cache-Control": "private, no-store" } });
}
