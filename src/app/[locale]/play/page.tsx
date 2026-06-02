"use client";

import { useLocale } from "next-intl";
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

export default function Home() {
  const g = useGameLoop();
  const locale = useLocale() as "zh" | "en";
  const [guess, setGuess] = useState<number | null>(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const [tutorialIntro, setTutorialIntro] = useState(false);
  // The masterclass config awaiting the (skippable) rules intro before its game starts.
  const [pendingConfig, setPendingConfig] = useState<GameConfig | null>(null);
  const recordedRef = useRef(false);

  // Record the finished game exactly once (when a winner is first decided).
  useEffect(() => {
    if (g.phase === "setup") {
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
            <div style={S.kicker}>MULTI-AGENT · 社交博弈</div>
            <h1 style={S.title}>
              谁是卧底 <span style={{ color: "var(--amber)" }}>· AI 局</span>
            </h1>
            <p style={S.sub}>
              多个 AI 各执一词，其中藏着卧底，连它们自己都还蒙在鼓里。看它们如何描述、试探、互相指认——你也可以入座同桌。
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
            <LocaleSwitcher />
            <Link href="/" style={{ fontSize: 12.5, color: "var(--muted)", textDecoration: "none" }}>
              ← 首页
            </Link>
          </div>
        </header>

        {g.phase === "setup" ? (
          tutorialIntro ? (
            <TutorialIntro
              onStart={() => {
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
                onStart={(c) => {
                  setGuess(null);
                  // Carry the UI locale into the game so content can be localized.
                  const config = { ...c, locale };
                  // Masterclass shows the (skippable) rules intro first, then starts.
                  if (config.tutorial) {
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
            suspicion={g.suspicion}
            suspecting={g.suspecting}
            order={g.order}
            guess={guess}
            onGuess={setGuess}
            onDescribe={g.runDescribe}
            onVote={g.runVote}
            onNext={g.nextRound}
            onRestart={g.restart}
            onSubmitHuman={g.submitHuman}
          />
        )}

        <footer style={S.footer}>
          每个 AI 的发言与投票都由 AI / 本地模型实时生成 · 同样的词，每局走向都不同
          <span style={{ margin: "0 8px", opacity: 0.5 }}>·</span>
          <Link href="/dashboard" style={{ color: "var(--amber)", textDecoration: "none" }}>📊 数据看板</Link>
        </footer>
      </div>
    </div>
  );
}
