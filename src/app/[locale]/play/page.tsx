"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import Board from "@/components/Board";
import Setup from "@/components/Setup";
import StatsPanel from "@/components/StatsPanel";
import { TutorialIntro } from "@/components/Tutorial";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import type { GameConfig } from "@/game/types";
import { S } from "@/app/styles";
import { Link } from "@/i18n/navigation";
import { recordGame } from "@/lib/stats";
import { useGameLoop } from "@/store/useGameLoop";

// The masterclass rules intro is shown only on a user's first entry. We persist
// the flag in localStorage so it sticks across tabs/sessions (unlike the
// per-session setup prefs).
const INTRO_SEEN_KEY = "undercover:seenMasterclassIntro";
function hasSeenIntro(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
function markIntroSeen(): void {
  try {
    window.localStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    /* non-fatal */
  }
}

export default function Home() {
  const g = useGameLoop();
  const t = useTranslations("Play");
  const locale = useLocale() as "zh" | "en";
  // Developer mode is admin-only: unlocked only with ?dev=1, never a casual toggle.
  // Read from the URL after mount (matches the dashboard's pattern; avoids the
  // useSearchParams Suspense requirement).
  const [devUnlocked, setDevUnlocked] = useState(false);
  useEffect(() => {
    try {
      setDevUnlocked(new URL(window.location.href).searchParams.get("dev") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const [guess, setGuess] = useState<number | null>(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const [tutorialIntro, setTutorialIntro] = useState(false);
  // The masterclass config awaiting the (skippable) rules intro before its game starts.
  const [pendingConfig, setPendingConfig] = useState<GameConfig | null>(null);
  const recordedRef = useRef(false);

  // Record the finished game exactly once (when a winner is first decided). Reset
  // the guard whenever there's no winner yet — covers a fresh setup AND "play
  // again" (which jumps straight back into a new game without visiting setup).
  useEffect(() => {
    if (g.winner == null) {
      recordedRef.current = false;
      return;
    }
    if ((g.winner === "civ" || g.winner === "spy") && !recordedRef.current) {
      recordedRef.current = true;
      const hasHuman = g.players.some((p) => p.kind === "human");
      const spectatorBet = hasHuman
        ? undefined
        : { made: guess != null, correct: guess != null && !!g.players.find((p) => p.id === guess)?.isSpy };
      recordGame({ winner: g.winner, players: g.players, spectatorBet });
      setStatsVersion((v) => v + 1);
    }
  }, [g.winner, g.phase, g.players, guess]);

  return (
    <div style={S.root}>
      <div style={S.grain} />
      <div style={S.shell}>
        <header style={{ ...S.header, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={S.kicker}>{t("kicker")}</div>
            <h1 style={S.title}>
              {t("titleMain")} <span style={{ color: "var(--amber)" }}>{t("titleSuffix")}</span>
            </h1>
            <p style={S.sub}>{t("tagline")}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
            <LocaleSwitcher />
            <Link href="/" style={{ fontSize: 12.5, color: "var(--muted)", textDecoration: "none" }}>
              {t("home")}
            </Link>
          </div>
        </header>

        {g.phase === "setup" ? (
          tutorialIntro ? (
            <TutorialIntro
              onStart={() => {
                markIntroSeen();
                if (pendingConfig) g.startGame(pendingConfig);
                setTutorialIntro(false);
                setPendingConfig(null);
              }}
              onBack={() => {
                setTutorialIntro(false);
                setPendingConfig(null);
              }}
            />
          ) : (
            <>
              <Setup
                devUnlocked={devUnlocked}
                onStart={(c) => {
                  setGuess(null);
                  // Carry the UI locale into the game so content can be localized.
                  const config = { ...c, locale };
                  // Masterclass shows the (skippable) rules intro — but only on the
                  // user's first entry; afterwards it starts straight away.
                  if (config.tutorial && !hasSeenIntro()) {
                    setPendingConfig(config);
                    setTutorialIntro(true);
                  } else {
                    g.startGame(config);
                  }
                }}
              />
              <StatsPanel version={statsVersion} />
            </>
          )
        ) : (
          <Board
            players={g.players}
            log={g.log}
            busy={g.busy}
            speakingId={g.speakingId}
            phase={g.phase}
            round={g.round}
            winner={g.winner}
            error={g.error}
            pair={g.pair}
            humanTurn={g.humanTurn}
            devMode={g.devMode}
            tutorial={g.tutorial}
            coachTip={g.coachTip}
            coachLoading={g.coachLoading}
            suspicion={g.suspicion}
            suspecting={g.suspecting}
            order={g.order}
            guess={guess}
            onGuess={setGuess}
            onDescribe={g.runDescribe}
            onVote={g.runVote}
            onNext={g.nextRound}
            onRestart={g.restart}
            onPlayAgain={() => {
              setGuess(null);
              g.playAgain();
            }}
            onSubmitHuman={g.submitHuman}
          />
        )}

        <footer style={S.footer}>
          {t("footer")}
        </footer>
      </div>
    </div>
  );
}
