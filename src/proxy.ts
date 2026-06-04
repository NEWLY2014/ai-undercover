// Next.js 16 renamed the `middleware` file convention to `proxy` (this file was
// src/middleware.ts). For next-intl's default-export createMiddleware setup the
// migration is just the file rename — the import stays `next-intl/middleware`
// and the config/matcher are unchanged.
//   https://nextjs.org/docs/messages/middleware-to-proxy
//   https://next-intl.dev/docs/routing/middleware
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// next-intl locale routing. The matcher EXCLUDES /api (the secured game/track/
// dashboard routes must not be locale-rewritten), _next, _vercel, and any path
// with a dot (static files like favicon.ico, og images, robots.txt).
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
