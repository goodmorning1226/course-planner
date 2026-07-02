// Delete the test course + ALL user-filled reviews and grade reports.
// Keeps imported grade_distributions (source starts with 'sheet:').
//   node scripts/cleanup-user-data.mjs           # dry-run (counts)
//   node scripts/cleanup-user-data.mjs --apply   # delete
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const APPLY = process.argv.includes("--apply");
const env={...process.env}; for(const f of[".env",".env.local"]){try{for(const l of readFileSync(f,"utf8").split("\n")){if(!l.includes("=")||l.trim().startsWith("#"))continue;const i=l.indexOf("=");const k=l.slice(0,i).trim();if(env[k]===undefined)env[k]=l.slice(i+1).trim().replace(/^["']|["']$/g,"");}}catch{}}
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const cnt=async(t,q=(x)=>x)=>{const{count}=await q(sb.from(t).select("*",{count:"exact",head:true}));return count??0;};
const testCourse=await cnt("courses",q=>q.eq("pk","TEST-GRADES"));
const reviews=await cnt("course_reviews");
const reports=await cnt("grade_reports");
const userDists=await cnt("grade_distributions",q=>q.or("source.eq.test,source.eq.user,submitted_by.not.is.null"));
console.log(`${APPLY?"APPLYING":"DRY-RUN"}`);
console.log(`  測試課程 (courses pk=TEST-GRADES): ${testCourse}`);
console.log(`  全部評論 (course_reviews):         ${reviews}`);
console.log(`  全部成績回報 (grade_reports):      ${reports}`);
console.log(`  使用者填寫的分布 (grade_distributions source=test/user 或 submitted_by): ${userDists}`);
if(!APPLY){console.log("\n(加 --apply 才會刪除；匯入的 sheet 分布會保留)");process.exit(0);}
const del=async(t,q)=>{const{error}=await q(sb.from(t).delete());if(error)throw error;};
await del("course_reviews", q=>q.not("id","is",null));
await del("grade_reports", q=>q.not("id","is",null));
await del("grade_distributions", q=>q.or("source.eq.test,source.eq.user,submitted_by.not.is.null"));
await del("courses", q=>q.eq("pk","TEST-GRADES"));
console.log("\n✅ 已刪除");
