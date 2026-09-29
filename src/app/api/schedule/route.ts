import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { IcsFetchError } from "@/lib/ics/fetch";
import { IcsParseError } from "@/lib/ics/parse";
import { redactSecrets } from "@/lib/ics/redact";
import { getSchedule } from "@/lib/schedule-cache";

const querySchema = z.object({
  refresh: z.enum(["0", "1"]).optional(),
});

/**
 * GET /api/schedule[?refresh=1]
 * Renvoie les séances parsées. Le lien .ics reste sur le serveur : il n'apparaît
 * ni dans la réponse, ni dans les messages d'erreur, ni dans les logs.
 */
export async function GET(request: NextRequest) {
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  const url = process.env.ICS_URL;
  if (!url) {
    return NextResponse.json(
      { error: "ICS_URL n'est pas défini dans .env.local (voir README)." },
      { status: 500 },
    );
  }

  try {
    const { sessions, syncedAt, fromCache } = await getSchedule(url, { force: query.data.refresh === "1" });
    return NextResponse.json(
      { sessions, syncedAt: new Date(syncedAt).toISOString(), fromCache },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof IcsFetchError || error instanceof IcsParseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("[api/schedule] erreur inattendue :", redactSecrets(String(error)));
    return NextResponse.json({ error: "Erreur inattendue lors de l'import de l'horaire." }, { status: 500 });
  }
}
