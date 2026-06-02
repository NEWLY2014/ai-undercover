import { defineRouting } from "next-intl/routing";

// Locale routing for the app: /zh and /en. zh is the default (the game's native
// language). Adding a locale here is all it takes to light up a new URL prefix.
export const routing = defineRouting({
  locales: ["zh", "en"],
  defaultLocale: "zh",
});

export type AppLocale = (typeof routing.locales)[number];
