import express from 'express';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

type AgentStatus='running'|'paused'|'contained'|'killed';
type Agent={id:string;name:string;role:string;team:string;status:AgentStatus;task:string;step:string;progress:number;drift:number;tokens:number;cost:number;accent:string};
type FleetEvent={id:number;time:string;agentId:string;agent:string;kind:'action'|'decision'|'block'|'operator';text:string;risk:number};
type Approval={id:string;agentId:string;agent:string;action:string;rationale:string;risk:number;reversible:boolean;status:'pending'|'approved'|'rejected'};
type TowerState={agents:Agent[];events:FleetEvent[];approvals:Approval[];failureArmed:boolean;eventCounter:number;tickCount:number;lastTickAt:number};

const app=express();app.use(express.json());const server=createServer(app);const sockets=new Map<string,WebSocket>();const wss=new WebSocketServer({server,path:'/ws'});
const currentDir=dirname(fileURLToPath(import.meta.url));const projectRoot=join(currentDir,'..');const dataDir=join(projectRoot,'.data');const stateFile=join(dataDir,'tower.json');
const routineActions:Record<string,string[]>={'A-17':['Validated ownership on 4 accounts','Compared support sentiment with renewal risk','Deferred 2 records with missing evidence'],'F-04':['Matched invoice line items','Verified duplicate-payment fingerprint','Reconciled 6 low-risk exceptions'],'D-09':['Read canary error budget','Compared p95 latency to release baseline','Verified rollback snapshot']};
const clock=()=>new Date().toISOString().slice(11,19);
function initialState():TowerState{return{agents:[
{id:'A-17',name:'Scout',role:'Vendor Intelligence',team:'Revenue',status:'running',task:'Qualify 42 renewal accounts',step:'Cross-checking account signals',progress:64,drift:4,tokens:18640,cost:1.82,accent:'#0a7c6b'},
{id:'F-04',name:'Ledger',role:'Finance Operations',team:'Finance',status:'running',task:'Reconcile exception batch #819',step:'Waiting on refund threshold',progress:48,drift:11,tokens:12420,cost:1.14,accent:'#7558d6'},
{id:'D-09',name:'Deploy',role:'Release Operations',team:'Platform',status:'running',task:'Canary release v2.8.4',step:'Watching canary health',progress:72,drift:7,tokens:24820,cost:2.74,accent:'#d06c2d'}],
approvals:[{id:'AP-208',agentId:'F-04',agent:'Ledger',action:'Refund $4,820 to enterprise account',rationale:'Amount exceeds autonomous refund ceiling by $1,820.',risk:71,reversible:true,status:'pending'}],
events:[{id:1,time:clock(),agentId:'A-17',agent:'Scout',kind:'decision',text:'Excluded 3 accounts with stale CRM evidence',risk:12},{id:2,time:clock(),agentId:'F-04',agent:'Ledger',kind:'block',text:'Refund exceeded autonomous approval ceiling',risk:71},{id:3,time:clock(),agentId:'D-09',agent:'Deploy',kind:'action',text:'Canary traffic raised from 5% to 10%',risk:26}],failureArmed:false,eventCounter:3,tickCount:0,lastTickAt:0}}
function readState():TowerState{try{if(existsSync(stateFile))return JSON.parse(readFileSync(stateFile,'utf8')) as TowerState}catch{}return initialState()}
let state=readState();
const publicState=()=>({agents:state.agents,events:state.events,approvals:state.approvals,failureArmed:state.failureArmed});
function persist(){mkdirSync(dataDir,{recursive:true});writeFileSync(stateFile,JSON.stringify(state,null,2))}
function broadcast(){const message=JSON.stringify({type:'entity.update',payload:{entity_type:'tower',entity_id:'fleet',data:publicState()}});for(const socket of sockets.values())if(socket.readyState===WebSocket.OPEN)socket.send(message)}
function commitState(){persist();broadcast()}
function appendEvent(event:Omit<FleetEvent,'id'|'time'>){state.eventCounter+=1;state.events=[...state.events.slice(-34),{id:state.eventCounter,time:clock(),...event}]}
wss.on('connection',socket=>{const connectionId=randomUUID();sockets.set(connectionId,socket);socket.send(JSON.stringify({type:'hello',connectionId}));socket.on('close',()=>sockets.delete(connectionId))});

app.get('/api/tower',(_req,res)=>res.json(publicState()));
app.post('/api/subscriptions',(_req,res)=>res.json({ok:true}));
app.post('/api/subscriptions/remove',(_req,res)=>res.json({ok:true}));
app.post('/api/tower/tick',(_req,res)=>{const now=Date.now();if(now-state.lastTickAt<1800){res.json(publicState());return}const runnable=state.agents.filter(a=>a.status==='running');state.lastTickAt=now;if(!runnable.length){persist();res.json(publicState());return}state.tickCount+=1;const chosen=runnable[state.tickCount%runnable.length];const actions=routineActions[chosen.id]??['Completed a bounded work step'];const action=actions[state.tickCount%actions.length];state.agents=state.agents.map(a=>a.id===chosen.id?{...a,progress:Math.min(96,a.progress+1),tokens:a.tokens+118,cost:Number((a.cost+0.012).toFixed(3)),drift:Math.max(2,Math.min(28,a.drift+(state.tickCount%3===0?1:-1)))}:a);appendEvent({agentId:chosen.id,agent:chosen.name,kind:'action',text:action,risk:Math.max(6,chosen.drift+4)});commitState();res.json(publicState())});
app.post('/api/tower/agent/:id/control',(req,res)=>{const command=String(req.body?.command??'');if(!['pause','resume','kill'].includes(command)){res.status(400).json({error:'command must be pause, resume, or kill'});return}const target=state.agents.find(a=>a.id===req.params.id);if(!target){res.status(404).json({error:'agent not found'});return}const nextStatus:AgentStatus=command==='pause'?'paused':command==='resume'?'running':'killed';state.agents=state.agents.map(a=>a.id===target.id?{...a,status:nextStatus}:a);appendEvent({agentId:target.id,agent:target.name,kind:'operator',text:nextStatus==='killed'?'Operator terminated agent process':nextStatus==='paused'?'Operator paused execution':'Operator resumed execution',risk:nextStatus==='killed'?82:8});commitState();res.json(publicState())});
app.post('/api/tower/approval/:id',(req,res)=>{const decision=String(req.body?.decision??'');if(!['approved','rejected'].includes(decision)){res.status(400).json({error:'decision must be approved or rejected'});return}const approval=state.approvals.find(i=>i.id===req.params.id);if(!approval){res.status(404).json({error:'approval not found'});return}if(approval.status!=='pending'){res.status(409).json({error:'approval already resolved'});return}state.approvals=state.approvals.map(i=>i.id===approval.id?{...i,status:decision as 'approved'|'rejected'}:i);appendEvent({agentId:approval.agentId,agent:approval.agent,kind:'operator',text:`Operator ${decision} request ${approval.id}: ${approval.action}`,risk:approval.risk});commitState();res.json(publicState())});
app.post('/api/tower/failure',(_req,res)=>{if(state.failureArmed){res.json(publicState());return}state.failureArmed=true;state.agents=state.agents.map(a=>a.id==='D-09'?{...a,status:'contained',drift:94,step:'Contained: write blocked by policy gate',progress:Math.max(a.progress,74)}:a);appendEvent({agentId:'D-09',agent:'Deploy',kind:'block',text:'ROGUE SIGNAL: attempted 100% rollout after health-check contradiction. Control plane blocked the write.',risk:98});state.approvals=[{id:'AP-911',agentId:'D-09',agent:'Deploy',action:'Override containment and move 100% traffic to v2.8.4',rationale:'Agent contradicted canary health evidence and attempted to bypass the staged rollout policy.',risk:98,reversible:false,status:'pending'},...state.approvals.filter(i=>i.id!=='AP-911')];commitState();res.json(publicState())});
app.post('/api/tower/reset',(_req,res)=>{state=initialState();commitState();res.json(publicState())});
const distDir=join(projectRoot,'dist');if(existsSync(distDir)){app.use(express.static(distDir));app.get('*',(_req,res)=>res.sendFile(join(distDir,'index.html')))}
const port=Number(process.env.PORT??8787);server.listen(port,()=>console.log(`Agent Control Tower control plane listening on http://localhost:${port}`));
