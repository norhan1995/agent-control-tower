# Submission Notes

## Live demo

https://agent-control-tower-pi7tsy.v2.appdeploy.ai/

## What to look at

- Realtime server-backed fleet state
- Interactive 3D mission-control globe
- Approval queue for high-risk actions
- Pause / resume / kill controls
- Token and cost accounting by agent
- Structured decision replay
- Rogue Deploy Agent failure test
- CSV audit export
- Multi-team filter

## AI tools used

AI-assisted coding and design were used to accelerate implementation, UI iteration, debugging, documentation, and test planning. The final architecture, product behavior, control boundaries, failure scenario, and submission scope were selected and reviewed for this project.

## Key decisions

1. **Control surface, not chatbot.** The product is organized around live fleet state and interventions.
2. **Canonical state lives server-side.** UI state is a projection of the control plane.
3. **Risk gates are explicit.** A risky action becomes an approval object.
4. **Failure is visible and testable.** The rogue scenario is a first-class demo path.
5. **Replay is structured.** It exposes auditable decision records rather than hidden chain-of-thought.
6. **The local repo is standalone.** It uses Express + WebSockets so judges can clone and run it without the hosted deployment platform.

## Out of scope

- Real credentials for production systems
- Real refunds or production deployments
- Enterprise authentication / RBAC
- Long-term event warehouse
- Multi-region failover
- Model-provider-specific hidden reasoning
