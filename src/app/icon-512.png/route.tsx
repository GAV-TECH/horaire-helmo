import { renderAppIcon } from "@/lib/pwa-icon";

export const dynamic = "force-static"; // générée une fois au build

export function GET() {
  return renderAppIcon(512);
}
