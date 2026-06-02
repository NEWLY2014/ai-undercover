"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// zh/en toggle. usePathname (from next-intl) returns the path WITHOUT the locale
// prefix; router.replace re-renders the same page under the chosen locale.
export default function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {routing.locales.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            onClick={() => router.replace(pathname, { locale: l })}
            aria-current={active}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: active ? "var(--amber)" : "var(--muted)",
              background: active ? "rgba(232,161,58,.10)" : "transparent",
              border: `1px solid ${active ? "var(--amber-dim)" : "var(--line)"}`,
              borderRadius: 7,
              padding: "4px 9px",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
