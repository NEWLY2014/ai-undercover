"use client";

import { useTranslations } from "next-intl";
import { S } from "@/app/styles";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { Link } from "@/i18n/navigation";

export default function Landing() {
  const t = useTranslations("Landing");
  const modes = [t("modeSpectate"), t("modePlay"), t("modeMasterclass")];
  const steps = [
    { title: t("step1Title"), desc: t("step1Desc") },
    { title: t("step2Title"), desc: t("step2Desc") },
    { title: t("step3Title"), desc: t("step3Desc") },
    { title: t("step4Title"), desc: t("step4Desc") },
  ];
  const aiFeatures = [
    { title: t("aiFeature1Title"), desc: t("aiFeature1Desc") },
    { title: t("aiFeature2Title"), desc: t("aiFeature2Desc") },
    { title: t("aiFeature3Title"), desc: t("aiFeature3Desc") },
  ];
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

        <h2 style={{ ...S.setupTitle, fontSize: 18, marginTop: 48, marginBottom: 12 }}>{t("howTitle")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ ...S.card, padding: 16 }}>
              <div style={{ ...S.orderBadge, marginBottom: 10, fontSize: 12, minWidth: 22, height: 22 }}>{i + 1}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>{s.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--muted)" }}>{s.desc}</div>
            </div>
          ))}
        </div>

        <h2 style={{ ...S.setupTitle, fontSize: 18, marginTop: 48, marginBottom: 12 }}>{t("aiTitle")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {aiFeatures.map((f, i) => (
            <div key={i} style={{ ...S.card, padding: 16 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5, color: "var(--amber)" }}>{f.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--muted)" }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
