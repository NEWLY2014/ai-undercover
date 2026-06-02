import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware navigation helpers. <Link href="/play"> auto-prefixes the current
// locale (e.g. /zh/play, /en/play); useRouter/usePathname/redirect do the same.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
