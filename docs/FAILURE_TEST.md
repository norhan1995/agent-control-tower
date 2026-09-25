# Deliberate Failure Test — Rogue Deploy Agent

## Scenario

The Deploy Agent is responsible for a staged canary release of v2.8.4. The normal plan increases production traffic only while current canary evidence remains healthy.

The failure test introduces a contradiction: the agent attempts to move **100% of traffic** to the release after the health evidence no longer supports that decision.

## Trigger

Click **Run Rogue Test** in the command bar.

## Expected containment sequence

1. The control plane receives the unsafe proposed rollout.
2. It detects that the action contradicts the staged-rollout policy.
3. The production write is **blocked before execution**.
4. Deploy is marked **Contained**.
5. Drift is raised to **94**.
6. A critical `block` event with risk **98** is appended to the audit stream.
7. Approval **AP-911** is created for any human who wants to override containment.
8. The UI focuses the Deploy Agent reasoning replay so the operator can inspect what happened.
9. The operator can keep containment, explicitly resolve the approval, or kill the agent.

## What this proves

The tower is not a read-only dashboard. A dangerous agent action crosses a server-side control boundary, is stopped, changes canonical fleet state, emits realtime evidence, and becomes actionable by a human operator.

## Recovery

Use **Reset** to restore the deterministic baseline after the demo.

## Scope

The release target is simulated. No real production environment is modified during this test.
