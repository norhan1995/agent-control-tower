# Agent Control Tower

A real-time operator control plane for supervising, auditing, and intervening on a fleet of autonomous AI agents.

**Live demo:** https://agent-control-tower-pi7tsy.v2.appdeploy.ai/

## Why this exists

As agents move from chat interfaces into systems that can spend money, change production state, and act across teams, humans need an operations layer built around control rather than conversation. Agent Control Tower is a working prototype of that layer.

It gives an operator one place to see what agents are doing, understand why a risky action was blocked, approve or reject human-gated work, pause or kill an agent, inspect cost and token usage, and export an audit trail.

## What is implemented

- Real-time fleet view with **3 running simulated agents**
- Shared control-plane state exposed through HTTP APIs
- WebSocket event stream for live cross-client updates
- Human approval queue for risky actions
- Per-agent pause, resume, and kill controls
- Drift / risk indicators
- Per-agent token and cost tracking
- Structured six-step decision replay
- Deliberate rogue-agent containment scenario
- Multi-team filtering
- Exportable CSV audit trail
- Interactive WebGL 3D operations globe

## Demo path

1. Open the live demo.
2. Click **Run Rogue Test**.
3. Watch the Deploy Agent attempt a 100% rollout after contradictory health evidence.
4. The control plane blocks the write and marks the agent **Contained**.
5. Review the new high-risk approval.
6. Inspect the Deploy Agent reasoning replay.
7. Pause, resume, or kill another agent.
8. Export the audit trail.

That path demonstrates the core control-plane loop: **signal → policy gate → containment → human intervention → audit**.

## Architecture

```text
Simulated agents
      │
      ▼
Agent events / proposed actions
      │
      ▼
┌─────────────────────────────┐
│       CONTROL PLANE         │
│                             │
│  state + policy gates       │
│  approvals + interventions  │
│  cost / token accounting    │
│  bounded audit history      │
└─────────────┬───────────────┘
              │
      ┌───────┴────────┐
      ▼                ▼
 HTTP commands     WebSocket stream
      │                │
      └───────┬────────┘
              ▼
     Operator cockpit
      │
      ├─ approve / deny
      ├─ pause / resume
      ├─ kill
      ├─ replay
      └─ export audit
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Local quick start

Requires Node.js 20+.

```bash
git clone https://github.com/norhan1995/agent-control-tower.git
cd agent-control-tower
npm install
npm run dev
```

Then open the Vite URL shown in the terminal. The local app starts an Express control-plane server on port **8787** and proxies the frontend to it.

For a production-style local run:

```bash
npm run build
npm start
```

## Tech

- React 19 + TypeScript
- Vite
- Three.js / WebGL
- Express
- WebSocket (`ws`)
- Server-side shared fleet state with bounded JSON persistence

## Repository guide

- `src/` — operator UI and interactive 3D globe
- `server/` — standalone control-plane API + WebSocket server
- `tests/tests.json` — judge/demo QA scenarios
- `docs/ARCHITECTURE.md` — architecture snapshot
- `docs/FAILURE_TEST.md` — deliberate rogue-agent test
- `docs/TWO_YEAR_THESIS.md` — future thesis
- `docs/VIDEO_SCRIPT.md` — 90-second walkthrough script
- `docs/SUBMISSION_NOTES.md` — AI usage, decisions, and scope

## Failure test

The Deploy Agent deliberately receives a contradictory production signal and attempts to jump from a staged canary to a 100% rollout. The control plane blocks the write, raises drift to a critical level, contains the agent, emits an audit event, and creates a human approval request.

The failure is concrete, visible, and recoverable. More detail: [docs/FAILURE_TEST.md](docs/FAILURE_TEST.md).

## Scope

This is a competition prototype. The agents are deterministic simulations and no external production systems are modified. The important part is real: the control-plane state, intervention APIs, WebSocket event stream, policy/approval flow, and operator actions all execute end to end.

## License

MIT
