# Enterprise AI Gateway and Governance | Proof of Concept

**Atlas Copco** hackathon challenge, organized by **2Hero**, powered by **Kong**.

![Hackathon Brief](docs/hackathon-brief.webp)

## The Challenge

> Organizations use many AI tools across applications, APIs, and LLMs, but usage is fragmented and ungoverned. This creates risks around sensitive data exposure, inconsistent policy enforcement, and lack of visibility into AI usage and costs across the enterprise.
>
> Build a centralized AI Gateway PoC that intercepts all AI requests, applies security and governance rules, and provides visibility into usage and costs across applications.

## The Problem

Organizations today use AI across many applications, teams, and workflows. But most of this usage is ungoverned.

- Anyone can send any data to an LLM, including sensitive information like SSNs, emails, or proprietary business data
- There is no visibility into which teams are using AI, how much they are spending, or what they are asking
- There is no way to enforce budgets, rate limits, or access controls across AI usage
- Compliance teams have no audit trail of what was sent to AI models

This creates serious risks around data exposure, cost overruns, and regulatory non-compliance (EU AI Act).

## What This Project Does

This is a centralized AI gateway that sits between all applications and the LLM. Every AI request must pass through the gateway, which applies security rules, tracks costs, and logs everything.

Think of it as a **firewall for AI**. Just like you wouldn't let employees access the internet without a firewall, you shouldn't let apps access AI models without a governance gateway.

## How It Works

```
Apps / Users
      |
      v
Kong API Gateway (authentication, rate limiting)
      |
      v
Governance Gateway (Express + TypeScript)
      |
      +-- PII Blocker        Scans for SSN, email, credit card, blocks if found
      +-- Cost Tracker        Counts tokens, enforces per-team budgets
      +-- Smart Router        Simple prompts go to cheap model, complex to expensive
      +-- API Detector        Detects business questions, fetches relevant data
      +-- Request Logger      Logs every request for audit trail
      |
      v
LLM (Cerebras / Databricks Model Serving)
```

**Example scenarios:**

| You ask | What happens |
|---|---|
| "What is Atlas Copco?" | Goes through, routed to small model, logged |
| "My SSN is 123-45-6789" | Blocked. PII detected. Never reaches the LLM |
| "Sales report for last 6 months" | Fetches business data, injects into prompt, AI responds with real numbers |
| "Analyze quarterly revenue trends" | Routed to large model (complex question), costs tracked |
| 61st request in a minute | Rate limited by Kong |

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [Docker](https://www.docker.com/products/docker-desktop/) (only needed for Kong)
- A free [Cerebras](https://cloud.cerebras.ai) API key (or any OpenAI-compatible LLM provider)

## Setup

**1. Clone the repo**

```bash
git clone https://github.com/your-username/ai-governance-kong.git
cd ai-governance-kong
```

**2. Install dependencies**

```bash
cd gateway && npm install
cd ../dashboard && npm install
```

**3. Configure environment**

```bash
cp .env.example gateway/.env
```

Open `gateway/.env` and add your LLM API key:

```
LLM_BASE_URL=https://api.cerebras.ai
LLM_API_KEY=your_cerebras_key_here
```

**4. Start the gateway**

```bash
cd gateway
npm start
```

This starts the governance gateway on http://localhost:8000. It also creates a local SQLite database for logging.

**5. Start the dashboard**

Open a new terminal:

```bash
cd dashboard
npm start
```

Dashboard runs on http://localhost:3000.

**6. Start Kong (optional)**

Kong adds authentication and rate limiting in front of the gateway. Requires Docker.

```bash
docker run -d --name kong-gateway \
  -e KONG_DATABASE=off \
  -e KONG_DECLARATIVE_CONFIG=/kong/kong.yml \
  -e KONG_ADMIN_LISTEN=0.0.0.0:8001 \
  -p 8001:8000 -p 8002:8001 \
  -v ./infra/kong:/kong \
  kong:3.6
```

With Kong running, use port 8001 instead of 8000. Kong will reject requests without a valid API key.

**7. Open the chat UI**

Go to http://localhost:3000/chat.html and start asking questions.

## API Keys

These are pre-configured for the demo. Use them in the `x-api-key` header:

| Key | Team | App |
|---|---|---|
| `eng-key-2024` | Engineering | Code Assistant |
| `ds-key-2024` | Data Science | Analytics Bot |
| `mkt-key-2024` | Marketing | Content Writer |
| `chat-key-2024` | Engineering | Chat UI |

## Project Structure

```
gateway/               Governance gateway (main application)
  src/
    config.ts          Environment and API key config
    types.ts           TypeScript interfaces
    index.ts           Express app entry point
    middleware/         Authentication and CORS
    plugins/           PII blocker, cost tracker, smart router, API detector
    routes/            Chat, admin, and business data endpoints
    services/          LLM client, SQLite logger, mock business data
    setup-konnect.ts   Script to configure Kong Konnect (cloud)

dashboard/             Web dashboard and chat interface
  public/
    index.html         Dashboard (usage, costs, blocked requests)
    chat.html          Chat UI

infra/kong/            Kong Gateway config for Docker
docs/                  Architecture diagrams
```

## Tech Stack

| Component | Technology |
|---|---|
| API Gateway | Kong OSS 3.6 |
| Governance Gateway | TypeScript, Express, Node.js |
| LLM | Cerebras (free tier, OpenAI compatible) |
| Database | SQLite (via better-sqlite3) |
| Dashboard | HTML, vanilla JavaScript |
