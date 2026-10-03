import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/database";

// "/blog" (prefix match, so this covers /blog/[slug] too) is public — it's part of the marketing
// site (src/app/blog/*), not gated content. Confirmed missing here by an actual redirect-to-
// /login when visiting /blog logged out while building the blog scaffold.
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth",
  "/forgot-password",
  "/reset-password",
  "/blog",
  "/account-suspended",
];

// Admin access is gated entirely by requireAdminUser()'s own role/MFA checks, independent of a
// user's own profiles.suspended_at — a suspended admin can still manage the platform; suspension
// is a regular-dashboard restriction, not an admin one. admin-mfa is included so an admin who's
// also personally suspended isn't blocked from the enroll/challenge step that gets them into /admin.
function isAdminPath(pathname: string): boolean {
  return pathname.startsWith("/admin");
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // "/" is checked for an exact match rather than folded into PUBLIC_PATHS' startsWith list —
  // startsWith("/") would match every path and disable auth-gating entirely. "/" now serves the
  // public marketing landing page (src/components/marketing/LandingPage.tsx) to logged-out
  // visitors; src/app/page.tsx itself still redirects a signed-in user on to /home.
  const isPublicPath = pathname === "/" || PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  // Suspension only blocks the regular dashboard — admin paths and public paths are exempt (see
  // isAdminPath's own comment). KNOWN LIMITATION, intentionally not fixed here: there's no single
  // requireUser() chokepoint for dashboard server actions (~15 files each call
  // supabase.auth.getUser() independently), so this only gates page *navigation* — a suspended
  // user with an already-open tab could still finish an in-flight action until they navigate
  // somewhere else, which would then redirect them here.
  if (user && !isPublicPath && !isAdminPath(pathname)) {
    const { data: profile } = await supabase.from("profiles").select("suspended_at").eq("id", user.id).maybeSingle();
    if (profile?.suspended_at) {
      const url = request.nextUrl.clone();
      url.pathname = "/account-suspended";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
