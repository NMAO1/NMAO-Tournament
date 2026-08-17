import { NextResponse, type NextRequest } from "next/server";

// Host-based routing so each subdomain lands on its own portal, even though
// School + Judge live in one Next.js app:
//   school.nmao.us/*  ->  /school/*   (school owner portal)
//   judge.nmao.us/    ->  /judge      (judge app; /login and /apply are already root-level)
// Any other host (localhost, the raw *.vercel.app) is left untouched, so local
// dev and preview URLs keep working with the normal /school + /judge paths.
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  const { pathname } = req.nextUrl;

  if (host.startsWith("school.")) {
    if (!pathname.startsWith("/school")) {
      const url = req.nextUrl.clone();
      url.pathname = `/school${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  } else if (host.startsWith("judge.")) {
    // The judge routes (/judge, /login, /apply, /judge/score/[id]) are already at
    // the root; only the bare landing needs to map to the app.
    if (pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/judge";
      return NextResponse.rewrite(url);
    }
  }
  return NextResponse.next();
}

// Skip static assets + Next internals so only real page requests are routed.
export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.[^/]+$).*)"],
};
