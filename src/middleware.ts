import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// next-intl locale routing. The matcher EXCLUDES /api (the secured game/track/
// dashboard routes must not be locale-rewritten), _next, _vercel, and any path
// with a dot (static files like favicon.ico, og images, robots.txt).
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
