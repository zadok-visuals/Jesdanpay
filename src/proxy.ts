import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // `api` is excluded outright — every route under src/app/api (the two cron reconciliation
  // endpoints, plus the Busha/Klasha webhooks) is meant to be called by an external service with
  // no Supabase session, and each already gates itself (CRON_SECRET bearer check, webhook
  // logging) inside its own handler. Before this exclusion, every one of those calls fell through
  // to the `!user` branch below and got redirected to /login — for the cron routes this broke the
  // Authorization: Bearer CRON_SECRET check from ever being reached at all, and for the Busha
  // webhook specifically this is very likely the real reason it has never once fired successfully
  // (previously suspected to be an unregistered URL on Busha's dashboard).
  // `opengraph-image`/`twitter-image` (src/app/opengraph-image.tsx, src/app/twitter-image.tsx) are
  // excluded for the same reason — a link-preview crawler (Slack, Twitter, Facebook, iMessage,
  // etc.) hits these with no Supabase session at all, and without this exclusion they fell through
  // to the same `!user` redirect-to-/login branch, so no crawler could ever actually fetch the
  // generated share image.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
