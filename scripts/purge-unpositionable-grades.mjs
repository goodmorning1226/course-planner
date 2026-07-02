// Delete imported grade_distributions rows that can't be positioned with
// 以上/以下/中間 (i.e. buildSemester produces no bar). Keeps data == display,
// removing the "shows 3 then 1" flash. Local only (service-role).
//   node scripts/purge-unpositionable-grades.mjs           # dry-run
//   node scripts/purge-unpositionable-grades.mjs --apply   # delete
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { buildSemester } from "../lib/grades/reports.ts";
const APPLY = process.argv.includes("--apply");
const env={...process.env}; for(const f of[".env",".env.local"]){try{for(const l of readFileSync(f,"utf8").split("\n")){if(!l.includes("=")||l.trim().startsWith("#"))continue;const i=l.indexOf("=");const k=l.slice(0,i).trim();if(env[k]===undefined)env[k]=l.slice(i+1).trim().replace(/^["']|["']$/g,"");}}catch{}}
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const TEST="【測試】成績分布課程|測試老師";
async function all(t,c){let o=[],f=0;for(;;){const{data,error}=await sb.from(t).select(c).range(f,f+999);if(error)throw error;o=o.concat(data);if(data.length<1000)break;f+=1000;}return o;}
const rows=(await all("grade_distributions","id,match_key,semester,a_plus,a,a_minus,b_plus,b,b_minus,c_plus,c,c_minus,f")).filter(r=>r.match_key!==TEST);
const bad=[];
for(const r of rows){const{id,match_key,semester,...b}=r;if(buildSemester([],b).bars.length===0)bad.push(r);}
console.log(`${APPLY?"APPLYING":"DRY-RUN"} | grade_distributions 共 ${rows.length} 筆(不含測試)`);
console.log(`  無法定位(缺以上/以下)→ 刪除: ${bad.length} 筆`);
const dbm=rows.filter(r=>r.match_key.startsWith("資料庫管理"));
console.log(`\n「資料庫管理」相關: 共 ${dbm.length} 筆, 其中無效 ${dbm.filter(r=>bad.includes(r)).length} 筆`);
for(const r of dbm){const{id,match_key,semester,...b}=r;const ok=buildSemester([],b).bars.length>0;console.log(`  ${ok?"✅保留":"❌刪除"} ${match_key} ${semester}: ${Object.entries(b).filter(([,v])=>v!=null).map(([k,v])=>k+"="+v).join(",")}`);}
if(!APPLY){console.log("\n(加 --apply 才會刪除)");process.exit(0);}
const ids=bad.map(r=>r.id);
for(let i=0;i<ids.length;i+=500){const{error}=await sb.from("grade_distributions").delete().in("id",ids.slice(i,i+500));if(error)throw error;}
console.log(`\n✅ 已刪除 ${ids.length} 筆`);
