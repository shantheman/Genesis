import {config} from './config.js';
const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date());
$('month').value = parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
let client;
let generation = 0;
let signedIn = false;
function clear(){ generation++; $('report').hidden=true; $('rows').replaceChildren(); for(const id of ['revenue','expenses','net']) $(id).textContent=''; }
async function load(){ if(!signedIn)return; clear(); const request=generation; $('status').textContent='Loading'; try {
 const {data,error}=await client.rpc('genesis_admin_pnl',{report_month:$('month').value+'-01'});
 if(request!==generation || !signedIn)return;
 if(error) throw error;
 $('revenue').textContent=money(data.revenue_cents); $('expenses').textContent=money(data.expense_cents); $('net').textContent=money(data.revenue_cents-data.expense_cents);
 for(const item of data.lines){const tr=document.createElement('tr'); for(const value of [item.name,money(item.accrued_cents),money(item.monthly_cents)]){const td=document.createElement('td');td.textContent=value;tr.append(td);} $('rows').append(tr);}
 $('period').textContent=`Through ${data.through_date}. Revenue tracking is not connected. Expenses are estimates, not paid invoices.`;
 $('report').hidden=false; $('status').textContent='';
 }catch(error){if(request===generation && signedIn)$('status').textContent=error.message;}}
if(!config.publishableKey){$('status').textContent='Setup pending: Genesis authentication and database access have not been activated.'; $('google').disabled=true;}
else {client=supabase.createClient(config.url,config.publishableKey,{auth:{flowType:'pkce'}});
 $('google').onclick=async()=>{const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('./',location.href).href}});if(error)$('status').textContent=error.message;};
 $('logout').onclick=async()=>{signedIn=false;clear();const {error}=await client.auth.signOut();$('status').textContent=error?.message||'';};
 client.auth.onAuthStateChange((event,session)=>{signedIn=!!session;clear();$('login').hidden=!!session; $('logout').hidden=!session;if(session)setTimeout(load,0);});
 $('refresh').onclick=load; $('month').onchange=load;
}
