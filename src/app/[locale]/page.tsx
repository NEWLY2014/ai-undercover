"use client";

import { useTranslations } from "next-intl";
import { S } from "@/app/styles";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { Link } from "@/i18n/navigation";

export default function Landing() {
  const t = useTranslations("Landing");
  const modes = [t("modeSpectate"), t("modePlay"), t("modeMasterclass")];
  return (
    <div style={S.root}>
      <div style={S.grain} />
      <div style={S.shell}>
        <header style={{ ...S.header, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={S.kicker}>{t("kicker")}</div>
            <h1 style={S.title}>{t("title")}</h1>
          </div>
          <LocaleSwitcher />
        </header>

        <p style={{ ...S.sub, maxWidth: 720, fontSize: 16 }}>{t("tagline")}</p>

        <div style={{ marginTop: 22 }}>
          <Link href="/play" style={{ ...S.startBtn, textDecoration: "none", display: "inline-block" }}>
            {t("playCta")}
          </Link>
        </div>

        <h2 style={{ ...S.setupTitle, fontSize: 18, marginTop: 38, marginBottom: 12 }}>{t("modesTitle")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {modes.map((m, i) => (
            <div key={i} style={{ ...S.card, padding: 16 }}>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink)" }}>{m}</div>
            </div>
          ))}
        </div>

        <footer style={S.footer}>
          <Link href="/dashboard" style={{ color: "var(--amber)", textDecoration: "none" }}>
            {t("dashboardLink")}
          </Link>
        </footer>
      </div>
    </div>
  );
}
