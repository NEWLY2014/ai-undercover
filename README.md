# 谁是卧底 · AI 局 (ai-undercover)

> 多智能体社交博弈 —— 一桌性格各异的 AI 各执一词,其中藏着卧底,连它们自己都还蒙在鼓里。看它们如何描述、试探、互相指认;你也可以入座同桌。
>
> A full-stack, multi-agent "Who is the Undercover" (谁是卧底) game where each AI player thinks, remembers, and learns independently.

## ✨ 特性

**真正的多智能体(不是套人设的同一个 prompt)**
- **独立思考**:每个 Agent 只看到它该看到的信息,独立给出推理 (`reasoning`)。
- **独立记忆空间**:局内"私人笔记"逐回合自更新、只回灌给自己。
- **不同思维方式**:演绎 / 直觉 / 心机 / 概率 / 保守…… 每个角色可选,注入各自提示词。
- **初始素质**:推理力 / 谨慎度 / 伪装力 / 表达力(0–10),作为人设影响发言风格。
- **跨局学习**:每局结束后 Agent 自己复盘、写下经验,下一局自动召回——同一个"老K"越玩越会打。

**完整玩法**
- 可配置总人数 / 卧底数 / 是否含白板;纯观战 或 你 + 多 AI 同桌。
- 多卧底、**卧底猜词反杀**、平票 PK 重投、**白板**角色。
- 词库分主题 / 难度,可筛选。
- **计分与成就**:胜率、连胜、押中率、成就解锁(localStorage)。

**开发者模式**
- 每句发言后,所有 AI 实时输出对每个人的"卧底嫌疑分" → **嫌疑矩阵热力图 + 时间轴回放**,直观看到怀疑如何随线索流动。

## 🧱 技术栈

- **Next.js 16**(App Router)+ **TypeScript**,纯前端 React + 服务端 API Route。
- **可切换 LLM provider**:`volcengine`(火山方舟 Ark)/ `ollama`(本地免费)/ `anthropic`。
- 服务端 `/api/agent` 持有密钥,浏览器永不接触 key。
- 结构化输出:Anthropic 用 tool-use、Ollama 用 `format` JSON schema、火山方舟用 JSON 提示 + 稳健抽取。

## 🏛 架构

- **纯函数引擎** `src/game/engine.ts` 负责确定性的"裁判"工作:发牌、按实际投出的票计票、票出得票最高者、判定胜负与轮次。
- **AI 的发言、投票、嫌疑分、跨局复盘经验都由 LLM 产出**,前端负责把它们存储、回灌与渲染。
- 投票不合法时**重新询问同一个 agent**,直到拿到一个合法选择。

## 🚀 本地运行

```bash
npm install
cp .env.example .env.local   # 然后按下面填好 provider
npm run dev                  # 打开 http://localhost:3000
```

### 配置 provider(`.env.local`)

**A. 本地 Ollama(免费 / 离线)**
```env
UNDERCOVER_PROVIDER=ollama
UNDERCOVER_OLLAMA_HOST=http://127.0.0.1:11434
UNDERCOVER_OLLAMA_MODEL=qwen2.5:7b   # 或 qwen2.5:3b(更快)
```
需先 `ollama pull qwen2.5:7b`。

**B. 火山方舟 Ark(云端,OpenAI 兼容)**
```env
UNDERCOVER_PROVIDER=volcengine
ARK_API_KEY=你的key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=你的接入点ep-...或已开通的模型名   # 例 doubao-seed-2-0-mini-...
```
> 注意:火山方舟需先在控制台**开通模型**或**创建在线推理接入点(ep-...)**才能调用。

**C. Anthropic**
```env
UNDERCOVER_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

### 局域网联机(同一 WiFi)

```bash
npm run build && npm run start:lan   # 监听 0.0.0.0:3000
```
本机用 `http://localhost:3000`;其它设备用 `http://<你的局域网IP>:3000`(Windows 需放行 3000 入站防火墙)。

## 📁 结构

```
src/
  app/            页面 + /api/agent 后端代理
  game/           engine(纯规则)/ words / prompts / thinkingStyles / types
  ai/             agent(client→后端)/ memory(跨局记忆)
  components/     Setup / Board / SuspicionPanel / MemoryPanel / StatsPanel / AISlotEditor
  store/          useGameLoop(驱动 describe/vote/round)
  lib/            stats(计分成就)
```

## 📌 状态

阶段 A(能跑)、A.5(本地 provider + 开发者模式)、B(多智能体:记忆 / 思维 / 学习)、C(多卧底 / 反杀 / PK / 白板 / 词库)、D 部分(计分成就、局域网)均已完成。后续:教学模式、移动端适配、性能优化、公网部署(含防滥用)。

---

