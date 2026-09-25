import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ws } from './controlClient';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BellRing,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Download,
  FileText,
  Gauge,
  LayoutGrid,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Square,
  TimerReset,
  X,
  Zap,
} from 'lucide-react';
import './control.css';
import MissionGlobe3D from './MissionGlobe3D';

type AgentStatus = 'running' | 'paused' | 'contained' | 'killed';

type Agent = {
  id: string;
  name: string;
  role: string;
  team: string;
  status: AgentStatus;
  task: string;
  step: string;
  progress: number;
  drift: number;
  tokens: number;
  cost: number;
  accent: string;
};

type FleetEvent = {
  id: number;
  time: string;
  agentId: string;
  agent: string;
  kind: 'action' | 'decision' | 'block' | 'operator';
  text: string;
  risk: number;
};

type Approval = {
  id: string;
  agentId: string;
  agent: string;
  action: string;
  rationale: string;
  risk: number;
  reversible: boolean;
  status: 'pending' | 'approved' | 'rejected';
};

type TowerState = {
  agents: Agent[];
  events: FleetEvent[];
  approvals: Approval[];
  failureArmed: boolean;
};

const traces: Record<string, string[]> = {
  'A-17': [
    'User request: qualify the renewal portfolio.',
    'Plan: combine CRM activity, support sentiment, and contract age.',
    'Policy check: outbound contact requires a verified account owner.',
    'Decision: exclude stale records and continue with verified accounts.',
    'Action: write qualification tags through the control plane.',
    'Result: classified records remain inside the delegated scope.',
  ],
  'F-04': [
    'User request: reconcile finance exception batch #819.',
    'Plan: verify invoice total, duplicate payment flag, and account tier.',
    'Policy check: autonomous refunds are capped at $3,000.',
    'Decision: $4,820 exceeds delegated authority.',
    'Action: hold the transaction and request human approval.',
    'Result: funds remain untouched until an operator decides.',
  ],
  'D-09': [
    'User request: deploy release v2.8.4 to production.',
    'Plan: use a staged canary and observe health signals.',
    'Policy check: production writes require healthy canary evidence.',
    'Decision: reject any rollout that contradicts current health data.',
    'Action: route the proposed traffic change through the policy gate.',
    'Result: unsafe writes are contained before reaching production.',
  ],
};

const replayLabels = ['User Request', 'Plan', 'Policy Check', 'Decision', 'Action', 'Result'];

const displayNames: Record<string, string> = {
  'A-17': 'Research Agent',
  'F-04': 'Ops Agent',
  'D-09': 'Deploy Agent',
};

function riskLabel(risk: number) {
  if (risk >= 80) return 'critical';
  if (risk >= 55) return 'high';
  if (risk >= 25) return 'guarded';
  return 'low';
}

function App() {
  const [tower, setTower] = useState<TowerState | null>(null);
  const [selectedAgent, setSelectedAgent] = useState('D-09');
  const [teamFilter, setTeamFilter] = useState('All teams');
  const [connectionState, setConnectionState] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [errorMessage, setErrorMessage] = useState('');
  const [fullTrace, setFullTrace] = useState(false);
  const [activeSection, setActiveSection] = useState('fleet');
  const connectionRef = useRef<ReturnType<typeof ws.connect> | null>(null);

  useEffect(() => {
    let mounted = true;
    const connection = ws.connect();
    connectionRef.current = connection;

    connection.onMessage(message => {
      const payload = message?.payload;
      if (
        message?.type === 'entity.update' &&
        payload?.entity_type === 'tower' &&
        payload?.entity_id === 'fleet' &&
        payload?.data
      ) {
        setTower(payload.data as TowerState);
      }
    });
    connection.onOpen(() => setConnectionState('live'));
    connection.onClose(() => setConnectionState('offline'));
    connection.onError(() => setConnectionState('offline'));

    const boot = async () => {
      try {
        const response = await api.get('/api/tower');
        if (!mounted) return;
        setTower(response.data as TowerState);
        await connection.ready;
        if (!mounted) return;
        const connectionId = connection.connectionId;
        if (connectionId) {
          await api.post('/api/subscriptions', {
            entity_type: 'tower',
            entity_id: 'fleet',
            connection_id: connectionId,
          });
          setConnectionState('live');
        }
      } catch {
        if (mounted) setErrorMessage('Control plane connection failed. Refresh to retry.');
      }
    };

    void boot();
    const tickTimer = window.setInterval(() => {
      void api.post('/api/tower/tick').catch(() => undefined);
    }, 2400);

    return () => {
      mounted = false;
      window.clearInterval(tickTimer);
      const connectionId = connection.connectionId;
      if (connectionId) {
        void api
          .post('/api/subscriptions/remove', {
            entity_type: 'tower',
            entity_id: 'fleet',
            connection_id: connectionId,
          })
          .catch(() => undefined);
      }
      connection.disconnect();
    };
  }, []);

  const agents = tower?.agents ?? [];
  const approvals = tower?.approvals ?? [];
  const events = tower?.events ?? [];
  const selected = agents.find(agent => agent.id === selectedAgent) ?? agents[0];
  const pendingApprovals = approvals.filter(item => item.status === 'pending');
  const visibleAgents = useMemo(
    () => (teamFilter === 'All teams' ? agents : agents.filter(agent => agent.team === teamFilter)),
    [agents, teamFilter]
  );
  const activeCount = agents.filter(agent => agent.status === 'running').length;
  const totalTokens = agents.reduce((sum, agent) => sum + agent.tokens, 0);
  const totalCost = agents.reduce((sum, agent) => sum + agent.cost, 0);
  const criticalEvents = [...events].reverse().filter(event => event.risk >= 55).slice(0, 2);
  const completedTasks = Math.max(12, Math.round(agents.reduce((sum, agent) => sum + agent.progress, 0) / 7));

  const hasPendingApproval = (agentId: string) =>
    pendingApprovals.some(item => item.agentId === agentId);

  const updateFromResponse = (data: unknown) => {
    if (data && typeof data === 'object') setTower(data as TowerState);
  };

  const setAgentStatus = async (id: string, command: 'pause' | 'resume' | 'kill') => {
    try {
      const response = await api.post('/api/tower/agent/' + id + '/control', { command });
      updateFromResponse(response.data);
    } catch {
      setErrorMessage('Intervention failed. The agent was not changed.');
    }
  };

  const decideApproval = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      const response = await api.post('/api/tower/approval/' + id, { decision });
      updateFromResponse(response.data);
    } catch {
      setErrorMessage('Approval action failed. Nothing was executed.');
    }
  };

  const runFailureTest = async () => {
    try {
      const response = await api.post('/api/tower/failure');
      updateFromResponse(response.data);
      setSelectedAgent('D-09');
      setFullTrace(false);
      setActiveSection('replay');
      window.setTimeout(() => {
        document.getElementById('replay')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    } catch {
      setErrorMessage('Failure test could not be started.');
    }
  };

  const resetDemo = async () => {
    try {
      const response = await api.post('/api/tower/reset');
      updateFromResponse(response.data);
      setSelectedAgent('D-09');
      setFullTrace(false);
      setActiveSection('fleet');
      setErrorMessage('');
    } catch {
      setErrorMessage('Reset failed.');
    }
  };

  const exportAudit = () => {
    const header = 'time,agent,type,risk,event';
    const rows = events.map(event =>
      [event.time, event.agent, event.kind, event.risk, '"' + event.text.replaceAll('"', '""') + '"'].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'control-tower-audit.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const goTo = (section: string) => {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!tower || !selected) {
    return (
      <div className="mc-boot">
        <div className="mc-logo-mark"><span /><span /></div>
        <p>INITIALIZING AGENT CONTROL TOWER</p>
        <div className="boot-line"><i /></div>
        <span>{errorMessage || 'Connecting to realtime control plane…'}</span>
      </div>
    );
  }

  return (
    <div className="mc-shell">
      <header className="mc-topbar">
        <div className="mc-brand">
          <div className="mc-logo-mark"><span /><span /></div>
          <b>AGENT CONTROL TOWER</b>
          <span className={'top-live ' + connectionState}><i />{connectionState.toUpperCase()}</span>
        </div>
        <div className="workforce-summary">
          <span>AI Workforce</span><i />
          <span>{agents.length} Agents</span><i />
          <span>{pendingApprovals.length} Pending Approval{pendingApprovals.length === 1 ? '' : 's'}</span>
        </div>
        <div className="top-actions">
          <button className="danger-command" onClick={() => void runFailureTest()} disabled={tower.failureArmed}>
            <Play size={14} /> {tower.failureArmed ? 'Rogue Test Contained' : 'Run Rogue Test'}
          </button>
          <button className="top-ghost" onClick={() => void resetDemo()}><RotateCcw size={14} /> Reset</button>
          <button className="top-ghost" onClick={exportAudit}><Download size={14} /> Export Audit</button>
          <div className="operator-avatar">N</div>
        </div>
      </header>

      <aside className="mc-nav" aria-label="Control tower navigation">
        <button className={activeSection === 'fleet' ? 'active' : ''} onClick={() => goTo('fleet')}>
          <LayoutGrid size={20} /><span>Fleet</span>
        </button>
        <button className={activeSection === 'approvals' ? 'active' : ''} onClick={() => goTo('approvals')}>
          <ShieldCheck size={20} /><span>Approvals</span>
          {pendingApprovals.length > 0 ? <em>{pendingApprovals.length}</em> : null}
        </button>
        <button className={activeSection === 'replay' ? 'active' : ''} onClick={() => goTo('replay')}>
          <Radio size={20} /><span>Replay</span>
        </button>
        <button className={activeSection === 'analytics' ? 'active' : ''} onClick={() => goTo('fleet')}>
          <BarChart3 size={20} /><span>Analytics</span>
        </button>
        <button className={activeSection === 'audit' ? 'active' : ''} onClick={exportAudit}>
          <FileText size={20} /><span>Audit</span>
        </button>
        <button className={activeSection === 'settings' ? 'active' : ''} onClick={() => setActiveSection('settings')}>
          <Settings size={20} /><span>Settings</span>
        </button>
      </aside>

      <main className="mc-main">
        {errorMessage ? (
          <div className="error-banner">
            <AlertTriangle size={15} />
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage('')}><X size={14} /></button>
          </div>
        ) : null}

        <section className="mission-hero">
          <div className="orbital-map" aria-label="Live agent network">
            <div className="map-kicker"><Activity size={14} /> LIVE OPERATIONS MAP</div>
            <div className="globe-wrap">
              <div className="globe-glow" />
              <MissionGlobe3D
                deployCritical={Boolean(agents.find(agent => agent.id === 'D-09' && (agent.status === 'contained' || agent.status === 'killed')))}
                opsWaiting={hasPendingApproval('F-04')}
              />
              <svg className="globe-svg" viewBox="0 0 1100 470" role="img" aria-label="Illuminated global agent network">
                <defs>
                  <radialGradient id="earthOcean" cx="45%" cy="35%" r="68%">
                    <stop offset="0%" stopColor="#1262b7" />
                    <stop offset="38%" stopColor="#073f7e" />
                    <stop offset="72%" stopColor="#032657" />
                    <stop offset="100%" stopColor="#010b22" />
                  </radialGradient>
                  <radialGradient id="earthShine" cx="38%" cy="26%" r="62%">
                    <stop offset="0%" stopColor="#59c7ff" stopOpacity="0.3" />
                    <stop offset="42%" stopColor="#178bff" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#00152e" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="landFill" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#188bdc" stopOpacity="0.5" />
                    <stop offset="55%" stopColor="#0d5b9d" stopOpacity="0.38" />
                    <stop offset="100%" stopColor="#062c5e" stopOpacity="0.28" />
                  </linearGradient>
                  <linearGradient id="arcBlue" x1="0" x2="1">
                    <stop offset="0%" stopColor="#24caff" stopOpacity="0" />
                    <stop offset="45%" stopColor="#28b6ff" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#24caff" stopOpacity="0.06" />
                  </linearGradient>
                  <linearGradient id="arcAmber" x1="0" x2="1">
                    <stop offset="0%" stopColor="#ffc044" stopOpacity="0" />
                    <stop offset="50%" stopColor="#ffc044" stopOpacity="0.92" />
                    <stop offset="100%" stopColor="#ff6b55" stopOpacity="0.08" />
                  </linearGradient>
                  <filter id="earthGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="9" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <filter id="cityGlow" x="-300%" y="-300%" width="700%" height="700%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <clipPath id="earthClip">
                    <ellipse cx="550" cy="246" rx="336" ry="221" />
                  </clipPath>
                </defs>

                <ellipse cx="550" cy="252" rx="352" ry="235" fill="none" stroke="#46c2ff" strokeOpacity="0.12" strokeWidth="19" filter="url(#earthGlow)" />
                <ellipse cx="550" cy="246" rx="336" ry="221" fill="url(#earthOcean)" stroke="#35adff" strokeOpacity="0.9" strokeWidth="2.2" />
                <ellipse cx="550" cy="246" rx="330" ry="216" fill="url(#earthShine)" />

                <g clipPath="url(#earthClip)">
                  <ellipse cx="550" cy="246" rx="334" ry="146" fill="none" stroke="#48b8f7" strokeOpacity="0.17" />
                  <ellipse cx="550" cy="246" rx="334" ry="78" fill="none" stroke="#48b8f7" strokeOpacity="0.13" />
                  <ellipse cx="550" cy="246" rx="158" ry="220" fill="none" stroke="#48b8f7" strokeOpacity="0.16" />
                  <ellipse cx="550" cy="246" rx="64" ry="220" fill="none" stroke="#48b8f7" strokeOpacity="0.11" />

                  <path d="M245 154 L278 128 L322 118 L361 128 L391 154 L420 158 L435 178 L414 193 L389 189 L371 207 L349 199 L338 217 L315 218 L301 239 L277 233 L263 207 L241 192 L225 169 Z"
                    fill="url(#landFill)" stroke="#42baff" strokeOpacity="0.7" strokeWidth="1.5" />
                  <path d="M326 234 L356 244 L373 270 L369 297 L351 321 L341 351 L318 376 L299 355 L304 329 L290 308 L294 282 L307 264 Z"
                    fill="url(#landFill)" stroke="#42baff" strokeOpacity="0.64" strokeWidth="1.4" />
                  <path d="M455 124 L488 111 L527 119 L546 137 L575 139 L597 156 L624 156 L644 174 L675 177 L702 195 L735 194 L768 211 L804 210 L836 233 L820 254 L787 257 L759 245 L729 251 L699 234 L676 241 L650 221 L626 225 L601 206 L580 210 L553 192 L529 200 L510 184 L488 187 L471 169 L447 162 Z"
                    fill="url(#landFill)" stroke="#42baff" strokeOpacity="0.7" strokeWidth="1.5" />
                  <path d="M525 199 L552 207 L574 230 L581 260 L570 289 L550 323 L529 348 L506 332 L495 303 L482 278 L488 245 L500 219 Z"
                    fill="url(#landFill)" stroke="#42baff" strokeOpacity="0.64" strokeWidth="1.4" />
                  <path d="M785 303 L813 296 L840 313 L833 337 L805 346 L784 330 Z"
                    fill="url(#landFill)" stroke="#42baff" strokeOpacity="0.55" strokeWidth="1.2" />
                  <path d="M838 220 L855 214 L869 224 L864 239 L848 242 L838 233 Z"
                    fill="url(#landFill)" stroke="#42baff" strokeOpacity="0.55" strokeWidth="1" />

                  <g fill="#71cfff" opacity="0.23">
                    {Array.from({ length: 78 }).map((_, index) => (
                      <circle key={'grid-' + index} cx={205 + ((index * 91) % 690)} cy={96 + ((index * 53) % 285)} r={0.7 + (index % 3) * 0.35} />
                    ))}
                  </g>

                  <g filter="url(#cityGlow)">
                    {[
                      [303,171],[318,178],[333,165],[350,183],[366,175],[378,190],[393,184],
                      [332,250],[344,264],[351,280],[346,303],
                      [486,154],[502,162],[518,151],[531,166],[545,157],[558,170],[571,164],[586,178],
                      [610,180],[623,193],[639,184],[655,199],[670,191],[687,207],[704,198],[721,214],
                      [739,205],[758,221],[777,217],[795,232],[815,229],
                      [526,223],[539,236],[550,250],[544,269],[558,286],
                      [798,315],[815,322]
                    ].map(([cx, cy], index) => (
                      <circle key={'city-' + index} cx={cx} cy={cy} r={index % 5 === 0 ? 2.2 : 1.35} fill={index % 4 === 0 ? '#ffd36a' : '#83d9ff'} opacity={0.88} />
                    ))}
                  </g>

                  <path d="M298 177 C410 86 616 75 760 195" fill="none" stroke="url(#arcBlue)" strokeWidth="2.2" />
                  <path d="M304 184 C470 320 624 305 760 202" fill="none" stroke="#20b9ff" strokeOpacity="0.46" strokeWidth="1.5" />
                  <path d="M360 208 C468 116 622 122 704 205" fill="none" stroke="#22d8ff" strokeOpacity="0.56" strokeWidth="1.5" strokeDasharray="3 7" />
                  <path d="M704 205 C650 259 608 294 550 307" fill="none" stroke="url(#arcAmber)" strokeWidth="2.2" />
                  <path d="M298 177 C405 241 479 273 550 307" fill="none" stroke="#25baff" strokeOpacity="0.34" strokeWidth="1.2" />
                  <path d="M550 307 C639 335 725 315 812 257" fill="none" stroke="#ff5b72" strokeOpacity="0.38" strokeWidth="1.4" />
                </g>

                <ellipse cx="550" cy="252" rx="405" ry="88" fill="none" stroke="#2eb1ff" strokeOpacity="0.29" strokeWidth="1.25" transform="rotate(-6 550 252)" />
                <ellipse cx="550" cy="252" rx="432" ry="120" fill="none" stroke="#218edc" strokeOpacity="0.15" strokeWidth="1" transform="rotate(7 550 252)" />

                <g filter="url(#cityGlow)">
                  <circle cx="302" cy="178" r="6" fill="#1ee7b0" />
                  <circle cx="704" cy="205" r="6" fill="#ffc044" />
                  <circle cx="550" cy="307" r="7" fill="#ff4d64" />
                </g>
                <circle cx="302" cy="178" r="16" fill="none" stroke="#1ee7b0" strokeOpacity="0.28" />
                <circle cx="704" cy="205" r="16" fill="none" stroke="#ffc044" strokeOpacity="0.28" />
                <circle cx="550" cy="307" r="18" fill="none" stroke="#ff4d64" strokeOpacity="0.36" />
                <circle cx="550" cy="307" r="29" fill="none" stroke="#ff4d64" strokeOpacity="0.13" />
              </svg>

              {agents.map(agent => {
                const pending = hasPendingApproval(agent.id);
                const stateClass = agent.status === 'contained' || agent.status === 'killed'
                  ? 'node-critical'
                  : pending
                    ? 'node-waiting'
                    : 'node-running';
                return (
                  <button
                    key={agent.id}
                    className={'agent-map-node node-' + agent.id.replace(/[^A-Z0-9]/g, '').toLowerCase() + ' ' + stateClass}
                    onClick={() => setSelectedAgent(agent.id)}
                  >
                    <span className="node-pulse" />
                    <div>
                      <small>{displayNames[agent.id]}</small>
                      <b>{pending && agent.status === 'running' ? 'Approval required' : agent.status}</b>
                      <em>{agent.step}</em>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="hero-caption">
              <span><i className="legend running" /> Autonomous</span>
              <span><i className="legend waiting" /> Human gate</span>
              <span><i className="legend contained" /> Contained</span>
            </div>
          </div>

          <div className="hero-side">
            <article className="glass-panel health-panel">
              <div className="panel-title">
                <div><Activity size={17} /><b>System Health</b></div>
                <span className={connectionState === 'live' ? 'healthy-pill' : 'warning-pill'}>
                  <i /> {connectionState === 'live' ? 'Healthy' : connectionState}
                </span>
              </div>
              <div className="health-grid">
                <div><Bot size={18} /><strong>{agents.length}</strong><span>Agents</span></div>
                <div><Check size={18} /><strong>{completedTasks}</strong><span>Tasks</span></div>
                <div><CircleDollarSign size={18} /><strong>{'$' + totalCost.toFixed(2)}</strong><span>Cost Today</span></div>
                <div><Zap size={18} /><strong>{(totalTokens / 1000).toFixed(1)}k</strong><span>Tokens</span></div>
              </div>
            </article>

            <article className="glass-panel alerts-panel" id="approvals">
              <div className="panel-title">
                <div><BellRing size={17} /><b>Active Alerts</b><span className="alert-count">{criticalEvents.length + pendingApprovals.length}</span></div>
                <button onClick={() => setActiveSection('approvals')}>Live queue <ChevronRight size={13} /></button>
              </div>

              <div className="alert-stack">
                {criticalEvents.length > 0 ? criticalEvents.slice(0, 1).map(event => (
                  <div className="alert-item critical-alert" key={event.id}>
                    <AlertTriangle size={18} />
                    <div>
                      <b>{displayNames[event.agentId] ?? event.agent}</b>
                      <span>{event.text}</span>
                    </div>
                    <em>R{event.risk}</em>
                  </div>
                )) : (
                  <div className="alert-item safe-alert">
                    <ShieldCheck size={18} />
                    <div><b>No critical incidents</b><span>All agent actions are inside policy envelopes.</span></div>
                  </div>
                )}

                {pendingApprovals.slice(0, 2).map(item => (
                  <div className={'approval-alert ' + (item.risk >= 90 ? 'critical-approval' : '')} key={item.id}>
                    <div className="approval-copy">
                      <span className={'risk-dot ' + riskLabel(item.risk)} />
                      <div><b>{item.action}</b><span>{displayNames[item.agentId]} · Risk {item.risk}</span></div>
                    </div>
                    <div className="approval-inline-actions">
                      <button className="deny-small" onClick={() => void decideApproval(item.id, 'rejected')}>Deny</button>
                      <button className="approve-small" onClick={() => void decideApproval(item.id, 'approved')}>Approve</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="fleet-section" id="fleet">
          <div className="section-bar">
            <div className="section-name"><LayoutGrid size={18} /><h2>Agent Fleet</h2><span>{agents.length}</span></div>
            <div className="fleet-filters">
              <label><Search size={14} /><span>Live agent view</span></label>
              <select value={teamFilter} onChange={event => setTeamFilter(event.target.value)}>
                <option>All teams</option>
                <option>Revenue</option>
                <option>Finance</option>
                <option>Platform</option>
              </select>
            </div>
          </div>

          <div className="fleet-list">
            {visibleAgents.map(agent => {
              const pending = hasPendingApproval(agent.id);
              const visualStatus = pending && agent.status === 'running' ? 'waiting' : agent.status;
              return (
                <article
                  key={agent.id}
                  className={'fleet-row ' + visualStatus + (selectedAgent === agent.id ? ' selected' : '')}
                  onClick={() => setSelectedAgent(agent.id)}
                >
                  <div className="agent-avatar"><Bot size={21} /></div>
                  <div className="agent-main">
                    <b>{displayNames[agent.id]}</b>
                    <span>{agent.role}</span>
                  </div>
                  <div className={'fleet-status ' + visualStatus}>
                    <i /> {visualStatus === 'waiting' ? 'WAITING' : visualStatus.toUpperCase()}
                  </div>
                  <div className="agent-work">
                    <b>{pending ? 'Approval required' : agent.task}</b>
                    <span>{agent.step}</span>
                  </div>
                  <div className="signal-bars" aria-label="Live activity">
                    {Array.from({ length: 14 }).map((_, index) => (
                      <i key={index} style={{ height: 7 + ((index * 11 + agent.id.charCodeAt(0)) % 25) }} />
                    ))}
                  </div>
                  <div className="usage-block">
                    <b>{'$' + agent.cost.toFixed(2)}</b>
                    <span>{agent.tokens.toLocaleString()} tokens</span>
                  </div>
                  <div className="drift-block">
                    <Gauge size={13} />
                    <span>Drift</span>
                    <b>{agent.drift}</b>
                  </div>
                  <div className="row-actions" onClick={event => event.stopPropagation()}>
                    {pending ? (
                      <button className="review-btn" onClick={() => goTo('approvals')}><ShieldCheck size={14} /> Review</button>
                    ) : agent.status === 'running' ? (
                      <button onClick={() => void setAgentStatus(agent.id, 'pause')}><Pause size={14} /> Pause</button>
                    ) : agent.status === 'paused' ? (
                      <button onClick={() => void setAgentStatus(agent.id, 'resume')}><Play size={14} /> Resume</button>
                    ) : (
                      <button className="resume-contained" onClick={() => void setAgentStatus(agent.id, 'resume')} disabled={agent.status === 'killed'}>
                        <Play size={14} /> {agent.status === 'killed' ? 'Killed' : 'Resume'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="replay-panel" id="replay">
          <div className="replay-toolbar">
            <div className="section-name"><FileText size={18} /><h2>Agent Reasoning Replay</h2></div>
            <div className="replay-controls">
              <select value={selectedAgent} onChange={event => setSelectedAgent(event.target.value)}>
                {agents.map(agent => <option key={agent.id} value={agent.id}>{displayNames[agent.id]}</option>)}
              </select>
              <span className="trace-range">Last 6 steps</span>
              <button className="kill-switch" onClick={() => void setAgentStatus(selected.id, 'kill')} disabled={selected.status === 'killed'}>
                <Square size={13} /> Kill Switch
              </button>
              <button className="trace-button" onClick={() => setFullTrace(value => !value)}>
                <FileText size={14} /> {fullTrace ? 'Collapse Trace' : 'View Full Trace'}
              </button>
            </div>
          </div>

          <div className="replay-track">
            {traces[selected.id].map((step, index) => (
              <div className={'replay-step step-' + (index + 1)} key={step}>
                <div className="step-head">
                  <span>{index + 1}</span>
                  <b>{replayLabels[index]}</b>
                  <time>{events.find(event => event.agentId === selected.id)?.time ?? '--:--:--'}</time>
                </div>
                <p>{step}</p>
                {index < 5 ? <ChevronRight className="step-arrow" size={16} /> : null}
              </div>
            ))}
          </div>

          {fullTrace ? (
            <div className="full-trace">
              <div className="trace-header"><Radio size={15} /><b>Live audit trace · {displayNames[selected.id]}</b></div>
              {[...events].reverse().filter(event => event.agentId === selected.id).slice(0, 8).map(event => (
                <div className="trace-row" key={event.id}>
                  <time>{event.time}</time>
                  <span className={'trace-kind ' + event.kind}>{event.kind}</span>
                  <p>{event.text}</p>
                  <em className={riskLabel(event.risk)}>R{event.risk}</em>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <footer className="mc-footer">
          <span><TimerReset size={13} /> Realtime server-backed control plane · shared fleet state · bounded audit history</span>
          <span>{activeCount} autonomous · {pendingApprovals.length} gated · {criticalEvents.length} elevated</span>
        </footer>
      </main>
    </div>
  );
}

export default App;