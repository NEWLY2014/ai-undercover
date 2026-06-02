# ai-undercover

A multi-agent take on **谁是卧底** ("Who's the Undercover"), the Chinese party word game. A table of AI players each get a secret word — most share the same one, a hidden *undercover* gets a similar-but-different word, and nobody is told which they are. They take turns describing their word without naming it, then vote someone out each round. You can watch the AIs play each other, sit down at the table yourself, or take a coached "masterclass" round to sharpen your own game.

It's built with Next.js and TypeScript. Each AI runs as its own agent — separate reasoning, its own private notes, its own thinking style — and they keep learning from one game to the next within a session.

## What's in it

**The agents are actually separate**, not one prompt wearing different hats. Every AI only sees what a real player at the table would, produces its own `reasoning`, and keeps a private running note it updates each turn and feeds back only to itself. Each seat has a thinking style (deductive, intuitive, scheming, probabilistic, cautious…) and a 0–10 attribute sheet — reasoning, caution, disguise, expressiveness — that colors how it talks. After a game, each agent reflects, writes down what it learned, and recalls those lessons next round, so the same "老K" gets sharper the longer you keep playing.

**The full game.** Set the table size, the number of spies, and whether to drop in a 白板 (a "blank" seat that gets no word at all). Multiple spies are supported, along with the eliminated spy's last-chance guess to steal the win, tie-break PK revotes, and the blank role. The word bank is tagged by theme and difficulty so you can filter it.

**Three ways to play:**
- **Spectate** — just watch, and bet on who the undercover is.
- **Sit in** — take a seat alongside the AIs.
- **Masterclass** — you play with a coach: hints when it's your turn, plus every AI's private 💭 reasoning on screen so you can see how the strong players think.

**Developer mode.** After every statement, each AI re-scores how much it suspects everyone else. You get a live suspicion heatmap with a timeline you can scrub back through, so you can watch suspicion shift as clues land.

**Dashboard.** `/dashboard` reads the backend event logs and charts agent-call performance (latency, token usage, breakdowns by provider/model), game analytics (win rates, round counts, how often the spy gets caught in round one), and a raw event browser.

## Stack

- Next.js (App Router) + TypeScript — React on the front, a few server route handlers on the back.
- A pluggable LLM provider: `volcengine` (Volcengine Ark / Doubao), `ollama` (free and local), or `anthropic`. The API key stays server-side in `/api/agent`; the browser never touches it.
- Structured output is handled per provider — tool calls for Anthropic, a `format` JSON schema for Ollama, and a JSON-shape prompt with robust extraction for Volcengine.

## How it fits together

- `src/game/engine.ts` is a pure-function referee: it deals the words, counts the votes that were actually cast, eliminates the top vote, and decides who won.
- The agents' clues, votes, suspicion scores, and post-game lessons all come from the LLM. The front end stores, replays, and renders them.
- An illegal vote gets the agent asked again rather than having a choice picked for it.
- Memory, stats, and your last setup live in `sessionStorage`: they carry across consecutive games and page reloads, and clear when you close the tab.

## Running it locally

```bash
npm install
cp .env.example .env.local   # fill in a provider (see below)
npm run dev                  # http://localhost:3000
```

### Picking a provider (`.env.local`)

**Local Ollama (free, offline)**
```env
UNDERCOVER_PROVIDER=ollama
UNDERCOVER_OLLAMA_HOST=http://127.0.0.1:11434
UNDERCOVER_OLLAMA_MODEL=qwen2.5:7b   # or qwen2.5:3b for speed
```
Pull the model first with `ollama pull qwen2.5:7b`.

**Volcengine Ark (cloud, OpenAI-compatible)**
```env
UNDERCOVER_PROVIDER=volcengine
ARK_API_KEY=your-key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=your-endpoint-ep-...   # e.g. doubao-seed-2-0-mini-...
```
Ark needs you to activate a model, or create an inference endpoint (`ep-...`), in the console before you can call it.

**Anthropic**
```env
UNDERCOVER_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

### Playing over a LAN (same Wi-Fi)

```bash
npm run build && npm run start:lan   # listens on 0.0.0.0:3000
```
Use `http://localhost:3000` on the host machine, and `http://<your-LAN-IP>:3000` from other devices. On Windows you'll need to allow inbound traffic on port 3000 through the firewall.

## Layout

```
src/
  app/            pages + /api/agent, /api/track, /api/dashboard, and the dashboard
  game/           engine (rules) / words / prompts / thinkingStyles / types
  ai/             agent (client → backend) / memory (session-scoped lessons)
  components/     Setup / Board / SuspicionPanel / MemoryPanel / StatsPanel / AISlotEditor / Tutorial
  store/          useGameLoop (drives describe / vote / round)
  lib/            stats / telemetry (client) / serverLog (backend JSONL)
```

## Status

The core game runs end to end: local and cloud providers, developer mode, the multi-agent stack (memory, thinking styles, cross-game learning), multiple spies, the spy's comeback guess, PK revotes, the blank role, the themed word bank, scoring and achievements, masterclass coaching, LAN play, telemetry, and the dashboard. Still on the list: mobile polish, performance, and a public deployment with some abuse protection.
