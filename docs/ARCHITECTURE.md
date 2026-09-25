# Architecture Snapshot

Agent Control Tower separates **agent execution** from **operator control**.

```text
Simulated agent fleet
        │ events + proposed actions
        ▼
┌───────────────────────────────────┐
│           CONTROL PLANE           │
│ canonical state · policy gates    │
│ approvals · pause/resume/kill     │
│ drift · token/cost accounting     │
│ bounded audit history             │
└──────────────┬─────────────┬──────┘
               │ HTTP        │ WebSocket
               ▼             ▼
          interventions   live updates
               └──────┬──────┘
                      ▼
             Operator cockpit
   3D globe · fleet · alerts · replay
```

## Runtime flow

1. Simulated agents produce bounded work events through `POST /api/tower/tick`.
2. The server owns canonical state; the browser is never the source of truth.
3. Risky operations create approvals instead of silently executing.
4. Operator commands use explicit server routes for pause, resume, kill, approve, and reject.
5. Every state-changing operation appends an audit event.
6. Every canonical state update is broadcast through WebSockets.
7. The browser renders the fleet and lets the operator intervene without refreshing.

## State

The standalone repo persists demo state to `.data/tower.json`, which is gitignored. The audit history is intentionally bounded.

## Reasoning replay

Replay is a **structured decision record**, not hidden model chain-of-thought. It exposes request, plan, policy check, decision, action, and result.

## Trust boundaries

- The UI requests actions but does not directly mutate agent state.
- The server validates control commands.
- High-risk actions become explicit approval objects.
- The rogue scenario is contained before the simulated production write.
- No real external production system is modified.
