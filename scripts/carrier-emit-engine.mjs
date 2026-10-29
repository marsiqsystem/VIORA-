// Build the app's carrier-engine-data.json from the fault-separated dataset
// (analyze_dataset.json). Full history, recent-weighted ranking, fake-RTO aware.
//   node emit-engine.mjs <dataset.json> <out.json>
import fs from "node:fs";
const [,, DS, OUT] = process.argv;
const all = JSON.parse(fs.readFileSync(DS,"utf8"));
const ACTIVE = new Set(["DTDC","Delhivery","Ekart","XpressBees","Shadowfax","Bluedart","Amazon"]);
// Carriers with a high fake-RTO (no-attempt / bogus non-serviceable) record — demoted
// so they're only chosen when nothing cleaner serves the pin. Ekart is the worst.
const AVOID = new Set(["Ekart"]);
const RW = 1.5; // recent rows weigh more in the ranking score

const resolved = all.filter(r => r.outcome==="DELIVERED" || r.outcome==="RTO");

// national
const natl = {};
for (const r of all){ if(!r.carrier||!ACTIVE.has(r.carrier)) continue;
  if(r.outcome!=="DELIVERED"&&r.outcome!=="RTO") continue;
  const a = natl[r.carrier]||(natl[r.carrier]={del:0,res:0,fake:0});
  a.res++; if(r.outcome==="DELIVERED")a.del++; else if(r.fault==="fake")a.fake++; }
const national = {};
for (const [c,v] of Object.entries(natl))
  national[c] = { delPct: Math.round(100*v.del/v.res), del: v.del, res: v.res, carrierFaultPct: Math.round(100*v.fake/v.res) };

// state RTO + state×carrier (recent-weighted for the score)
const stateTot = {}, sc = {};
for (const r of resolved){ if(!r.state) continue;
  const w = r.recent ? RW : 1;
  const st = stateTot[r.state]||(stateTot[r.state]={d:0,r:0,wd:0,wr:0,raw:0});
  st.r++; st.raw++; st.wr+=w; if(r.outcome==="DELIVERED"){st.d++; st.wd+=w;}
  if(!ACTIVE.has(r.carrier)) continue;
  const k=r.state+"|"+r.carrier; const a=sc[k]||(sc[k]={state:r.state,carrier:r.carrier,d:0,r:0,fake:0,wd:0,wr:0});
  a.r++; a.wr+=w; if(r.outcome==="DELIVERED"){a.d++; a.wd+=w;} else if(r.fault==="fake")a.fake++; }

let ND=0,NR=0; for(const v of Object.values(national)){ND+=v.del;NR+=v.res;} const natMean=NR?ND/NR:.4; const K=8;
const stateRTO = {};
for(const [st,v] of Object.entries(stateTot)) stateRTO[st] = { rtoPct: Math.round(100*(v.r-v.d)/v.r), res: v.r };

function best(state){ const sm=stateTot[state]; const prior = sm&&sm.wr ? sm.wd/sm.wr : natMean;
  return Object.values(sc).filter(a=>a.state===state&&a.r>0)
    .map(a=>{ const base=(a.wd+K*prior)/(a.wr+K); const fakeRate=a.fake/a.r;
      let score = base - 0.7*fakeRate;
      if(AVOID.has(a.carrier)) score -= 1;        // hard demotion: Ekart below any clean carrier
      return { carrier:a.carrier, adj:Math.round(100*base), del:a.d, res:a.r, fake:a.fake, score:+score.toFixed(4) }; })
    .sort((x,y)=> y.score-x.score || y.res-x.res)
    .slice(0,3)
    .map(({carrier,adj,del,res,fake})=> fake?{carrier,adj,del,res,fake}:{carrier,adj,del,res}); }

const bestByState = {};
for(const st of Object.keys(stateTot)){ const b=best(st); if(b.length) bestByState[st]=b; }

const fakeNonServiceable = {};
for(const [c,v] of Object.entries(natl)) if(v.fake) fakeNonServiceable[c]=v.fake;

const outObj = {
  generated: new Date().toISOString(),
  source: "Velocity iq-system exports (full history to 2026-10-28), fault-separated (fake vs genuine RTO), recent-weighted",
  national, stateRTO, bestByState, fakeNonServiceable,
};
fs.writeFileSync(OUT, JSON.stringify(outObj, null, 1));
console.log("wrote", OUT);
console.log("national:", JSON.stringify(national));
console.log("fakeNonServiceable:", JSON.stringify(fakeNonServiceable));
console.log("states:", Object.keys(bestByState).length);
