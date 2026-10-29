// Velocity carrier analysis — header-driven (works across both iq-system export
// layouts). Separates FAKE RTO (carrier bounced with no real attempt /
// "non-serviceable / permanent COD off") from GENUINE RTO (real attempt,
// customer-side: OTP/refused/not available). Full history + a recent slice.
//   node analyze.mjs <csv...>
import fs from "node:fs";

function parseCSV(txt){const rows=[];let f=[],cur="",q=false;for(let i=0;i<txt.length;i++){const c=txt[i];if(q){if(c==='"'){if(txt[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else{if(c==='"')q=true;else if(c===","){f.push(cur);cur="";}else if(c==="\n"){f.push(cur);rows.push(f);f=[];cur="";}else if(c==="\r"){}else cur+=c;}}if(cur.length||f.length){f.push(cur);rows.push(f);}return rows;}

const brand = s => { const n=String(s||"").toLowerCase();
  if(n.includes("dtdc"))return"DTDC"; if(n.includes("delhivery"))return"Delhivery"; if(n.includes("ekart"))return"Ekart";
  if(n.includes("xpressbee")||n.includes("xpress bee"))return"XpressBees"; if(n.includes("shadowfax"))return"Shadowfax";
  if(n.includes("bluedart")||n.includes("blue dart"))return"Bluedart"; if(n.includes("amazon"))return"Amazon";
  if(n.includes("ecom"))return"Ecom"; if(n.includes("india post")||n.includes("indiapost"))return"India Post";
  if(n.includes("smartr"))return"Smartr"; if(n.includes("shree")||n.includes("maruti"))return"Other";
  return n.trim()?("Other:"+n.trim().slice(0,14)):""; };
const ACTIVE=new Set(["DTDC","Delhivery","Ekart","XpressBees","Shadowfax","Bluedart","Amazon"]);
const STATE_ALIAS={"CHATTISGARH":"CHHATTISGARH","ORISSA":"ODISHA","PONDICHERRY":"PUDUCHERRY","UTTARANCHAL":"UTTARAKHAND"};
const normState = s => { let x=String(s||"").trim().toUpperCase().replace(/^IN-/,"").replace(/\bAND\b/g,"&").replace(/\s+/g," "); return STATE_ALIAS[x]||x; };
function outcome(status){const s=String(status||"").toUpperCase();
  if(s.includes("RTO")||s.includes("RETURN"))return"RTO"; if(s.includes("DELIVERED"))return"DELIVERED";
  if(s.includes("CANCEL")||s.includes("REJECT"))return"CANCELLED"; if(s.includes("LOST")||s.includes("DAMAG"))return"LOST";
  return"INTRANSIT";}

// 26 AWBs the user confirmed as fake-RTO in the Velocity complaint email.
const KNOWN_FAKE = new Set(["VELC0479453434","VELC1013943484","VELC2114455241","VELC0632743436","VELC2033775356","I81062218","VELC1442389064","7X110921240","VELC0286809994","VELP0624571491","VELC1416526989","VELC0508858646","VELC1792790935","7X110916378","VELC1219702319","VELC1579107045","VELC1646836420","VELC0893033110","VELC1630279186","I81054744","VELC1998438284","VELC1304172684","7X110913105","I81053916","7X110913104","7X110922673"]);

const FAKE_RE = /non.?serv|not serviceable|permanent cod|cod off|cod.*disabled|no attempt|not attempt|out of delivery area|area not serv|pincode not serv|undeliverable area|service not available|oda|embargo|address.*(incomplete|insufficient|not complete|incorrect|wrong|not found|unclear|illegible|issue)|incomplete address|insufficient address|wrong address|incorrect address|address not|incomplete.*address/i;
const CUST_RE = /otp|refus|not avail|unavailable|not contact|un-?reachable|cancel|self|door lock|premises|cash not ready|amount not ready|not interested|rejected by|customer not|consignee not|future delivery|rescheduled/i;

const files = process.argv.slice(2);
const byId = new Map(); // dedup: keep the most-progressed row per Order ID
const RANK = { DELIVERED:5, RTO:4, LOST:4, CANCELLED:3, INTRANSIT:2, "":0 };

for (const fp of files){
  const rows = parseCSV(fs.readFileSync(fp,"utf8"));
  const hdr = rows[0]||[];
  const idx = {}; hdr.forEach((h,i)=>{ idx[String(h||"").trim().toLowerCase()]=i; });
  const col = (r,...names)=>{ for(const nm of names){const i=idx[nm.toLowerCase()]; if(i!=null && r[i]!=null && r[i]!=="") return r[i];} return ""; };
  for(let i=1;i<rows.length;i++){ const r=rows[i]; if(!r||!r.length) continue;
    const id=String(col(r,"Order ID")||"").trim(); if(!id) continue;
    const car=brand(col(r,"Courier Company","Seller Owned Courier"));
    const status=col(r,"Order Status","3PL status and description");
    const rec={
      id, awb:String(col(r,"AWB No")||"").trim(), carrier:car, status, outcome:outcome(status),
      date:col(r,"Order Date","Velocity creation at"),
      payment:/cod/i.test(col(r,"Payment Method"))?"COD":"PREPAID",
      pin:String(col(r,"Customer Pincode")||"").trim(), city:col(r,"Customer City"), state:normState(col(r,"Customer State")),
      attempts:parseInt(col(r,"Attempt count"))||0,
      ofd:String(col(r,"First Out For Delivery Date")||"").trim(),
      rtoReason:col(r,"RTO Reason"), ndrReason:col(r,"Latest NDR reason"), remarks:col(r,"3PL remarks for Latest NDR"),
      value:parseFloat(String(col(r,"Order Total","COD Amount")).replace(/[^\d.]/g,""))||0,
      risk:col(r,"RTO Risk Score"),
    };
    const prev=byId.get(id);
    if(!prev || (RANK[rec.outcome]||0) >= (RANK[prev.outcome]||0)) byId.set(id, rec);
  }
}
const all=[...byId.values()];

// classify fault for RTOs
function faultOf(r){
  if(r.outcome!=="RTO") return "";
  const txt=`${r.rtoReason} ${r.ndrReason} ${r.remarks}`.toLowerCase();
  if(KNOWN_FAKE.has(r.awb)) return "fake";
  if(FAKE_RE.test(txt)) return "fake";
  const attempted = r.attempts>0 || (r.ofd && !/^0{2,}|^0000|^\s*$/.test(r.ofd));
  if(!attempted) return "fake";              // no OFD and 0 attempts => never really tried
  if(CUST_RE.test(txt)) return "genuine";
  return "genuine-ish";                      // attempted, unclear reason -> lean genuine (carrier tried)
}
for(const r of all) r.fault=faultOf(r);

// recency: recent = last 30 days
const parseDate = s=>{ const t=Date.parse(String(s||"").replace(/(\d{2})-(\d{2})-(\d{4})/,"$3-$2-$1")); return isNaN(t)?null:t; };
const now=Date.now(), DAY=86400000;
for(const r of all){ const t=parseDate(r.date); r.recent = t? (now-t)<30*DAY : false; }

console.log(`files=${files.length}  unique orders=${all.length}`);
const byOc={}; for(const r of all) byOc[r.outcome]=(byOc[r.outcome]||0)+1;
console.log("by outcome:",JSON.stringify(byOc));
const dateTs=all.map(r=>parseDate(r.date)).filter(Boolean).sort((a,b)=>a-b);
if(dateTs.length) console.log("date range:",new Date(dateTs[0]).toISOString().slice(0,10),"→",new Date(dateTs[dateTs.length-1]).toISOString().slice(0,10),` | recent(30d)=${all.filter(r=>r.recent).length}`);

function table(rows,label){
  const m={};
  for(const r of rows){ if(!r.carrier) continue; const oc=r.outcome;
    if(oc!=="DELIVERED"&&oc!=="RTO"&&oc!=="INTRANSIT"&&oc!=="LOST") continue;
    const a=m[r.carrier]||(m[r.carrier]={n:0,del:0,rto:0,fake:0,genu:0,intr:0,lost:0,att:0,attn:0,res:0});
    a.n++;
    if(oc==="DELIVERED"){a.del++;a.res++;}
    else if(oc==="RTO"){a.rto++;a.res++; if(r.fault==="fake")a.fake++; else a.genu++;}
    else if(oc==="INTRANSIT")a.intr++; else if(oc==="LOST"){a.lost++;a.res++;}
    if(r.attempts){a.att+=r.attempts;a.attn++;}
  }
  console.log(`\n=== ${label} — per carrier (resolved = delivered+RTO+lost) ===`);
  console.log("carrier".padEnd(12),"del%".padStart(5),"fakeRTO%".padStart(9),"del".padStart(4),"genuRTO".padStart(8),"fakeRTO".padStart(8),"res".padStart(4),"intransit".padStart(10));
  for(const [c,v] of Object.entries(m).sort((a,b)=> (b[1].res?b[1].del/b[1].res:0)-(a[1].res?a[1].del/a[1].res:0))){
    const delPct=v.res?Math.round(100*v.del/v.res):0; const fakePct=v.res?Math.round(100*v.fake/v.res):0;
    console.log(c.padEnd(12),String(delPct).padStart(4)+"%",String(fakePct).padStart(8)+"%",String(v.del).padStart(4),String(v.genu).padStart(8),String(v.fake).padStart(8),String(v.res).padStart(4),String(v.intr).padStart(10));
  }
  return m;
}
const allM=table(all,"ALL-TIME");
table(all.filter(r=>r.recent),"RECENT (last 30d)");

// known-fake cross-check
const foundFake=all.filter(r=>KNOWN_FAKE.has(r.awb));
console.log(`\n=== KNOWN-FAKE AWBs present: ${foundFake.length}/26 ===`);
const fkByCar={}; for(const r of foundFake){fkByCar[r.carrier]=(fkByCar[r.carrier]||0)+1;}
console.log("  by carrier:",JSON.stringify(fkByCar));

// per-state best (Bayesian, active only), delivery% with fake-RTO penalty
const resolved=all.filter(r=>(r.outcome==="DELIVERED"||r.outcome==="RTO")&&r.state&&r.carrier&&ACTIVE.has(r.carrier));
const sc={},stateTot={};
for(const r of resolved){ const st=stateTot[r.state]||(stateTot[r.state]={d:0,r:0}); st.r++; if(r.outcome==="DELIVERED")st.d++;
  const k=r.state+"|"+r.carrier; const a=sc[k]||(sc[k]={state:r.state,carrier:r.carrier,d:0,r:0,fake:0}); a.r++; if(r.outcome==="DELIVERED")a.d++; else if(r.fault==="fake")a.fake++; }
let ND=0,NR=0; for(const v of Object.values(allM)){ND+=v.del;NR+=v.res;} const natMean=NR?ND/NR:.35; const K=8;
function best(state){const sm=stateTot[state]; const prior=sm&&sm.r?sm.d/sm.r:natMean;
  return Object.values(sc).filter(a=>a.state===state&&a.r>0)
   .map(a=>{const base=(a.d+K*prior)/(a.r+K); const fakeRate=a.fake/a.r; const score=base-0.6*fakeRate;
     return {carrier:a.carrier,del:a.d,res:a.r,fake:a.fake,pct:Math.round(100*a.d/a.r),adj:Math.round(100*base),score:+(score).toFixed(3)};})
   .sort((x,y)=>y.score-x.score||y.res-x.res).slice(0,3);}
console.log("\n=== BEST CARRIER PER STATE (full history, fake-RTO-penalised, active only) ===");
for(const st of Object.keys(stateTot).sort()){ const b=best(st); if(!b.length)continue;
  console.log("  "+st.padEnd(18)+" "+b.map(x=>`${x.carrier}(${x.adj}% ${x.del}/${x.res}${x.fake?` fake${x.fake}`:""})`).join("  >  "));}

fs.writeFileSync(process.env.OUT_DATASET||"analyze_dataset.json", JSON.stringify(all,null,1));
