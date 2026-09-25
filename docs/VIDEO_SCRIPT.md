# 90-Second Walkthrough Script

**0–10s — Establish the product**

“This is Agent Control Tower: a realtime control plane for operating an AI workforce. Three simulated agents are running different jobs, and the server—not the browser—owns the canonical fleet state.”

**10–24s — Show the fleet**

“The cockpit shows live task status, drift, token use, cost, and current human gates. The 3D globe is interactive, but the important layer is the live event and control plane behind it.”

**24–38s — Human approval**

“Ledger has a refund above its autonomous limit, so the action is held and surfaced as an approval instead of executing automatically. I can approve or deny it here.”

**38–64s — Failure test**

“Now I’ll deliberately make the Deploy Agent go rogue. It tries to jump from a canary to 100% rollout after contradictory health evidence.”

Click **Run Rogue Test**.

“The control plane catches it before the write. Deploy becomes contained, drift jumps to critical, the action is recorded at risk 98, and a human override request appears.”

**64–80s — Replay + intervention**

“The flight recorder shows the structured request, plan, policy check, decision, action, and result. I can also pause, resume, or kill any agent from the operator surface.”

**80–90s — Close**

“Every intervention enters the audit history, which can be exported for compliance. The thesis is simple: as agent fleets grow, the organization that owns this control plane owns AI operations.”
