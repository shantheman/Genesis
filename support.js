// Owner-only support UI. All access is enforced again by the protected RPC.
export function supportAdmin(client, signedIn) {
 const root=document.getElementById('support');
 root.innerHTML=`<h1>Support</h1><div class="support-toolbar"><select aria-label="Ticket status" id="support-filter"><option value="open">Open</option><option value="awaiting_reply">Awaiting reply</option><option value="resolved">Resolved</option><option value="all">All</option></select><input id="support-search" placeholder="Search requests or player ID" maxlength="120"><button id="support-refresh">Search / refresh</button></div><p id="support-error" role="status"></p><div class="support-layout"><div><div id="support-list"></div><button id="support-older" hidden>Older requests</button></div><section id="support-detail" hidden></section></div>`;
 const $=id=>document.getElementById(id);
 let generation=0, cursor=null, selected=null, busy=false, ticketData=null;
 const drafts=new Map();
 const current=g=>signedIn() && generation===g;
 function clear(){root.querySelectorAll('dialog').forEach(dialog=>dialog.close('cancel'));generation++;cursor=null;selected=null;ticketData=null;busy=false;drafts.clear();root.querySelectorAll('button,textarea,select,input').forEach(el=>el.disabled=false);$('support-search').value='';$('support-older').hidden=true;$('support-list').replaceChildren();$('support-detail').replaceChildren();$('support-detail').hidden=true;$('support-error').textContent='';}
 function message(text){$('support-error').textContent=text;}
 async function rpc(operation,payload={}){const {data,error}=await client.rpc('genesis_admin_support',{operation,payload});if(error)throw Error(error.message);return data;}
 function date(at){return new Date(Number(at)).toLocaleString();}
 function text(tag,value,parent){const node=document.createElement(tag);node.textContent=value??'';parent.append(node);return node;}
 async function load(older=false){if(!signedIn())return;const g=++generation;message('Loading');if(!older){cursor=null;$('support-list').replaceChildren();selected=null;$('support-detail').hidden=true;}
  try{const data=await rpc('queue',{status:$('support-filter').value,search:$('support-search').value,...older?cursor:{}});if(!current(g))return;
   for(const ticket of data.items){const button=document.createElement('button');button.className='support-ticket';button.dataset.ticketId=ticket.id;text('strong',ticket.body,button);text('small',`${ticket.status} · ${date(ticket.updatedAt)} · ${ticket.player.slice(0,8)}`,button);button.onclick=()=>detail(ticket.id);$('support-list').append(button);}
   cursor=data.next;$('support-older').hidden=!cursor;message(data.items.length?'':'No requests.');
  }catch(e){if(current(g))message(e.message);}}
 async function detail(id,older=null){if(!signedIn())return;selected=id;const g=++generation;message('Loading conversation');
  // Old private content is removed before loading another player's ticket.
  if(!older){$('support-detail').replaceChildren();$('support-detail').hidden=true;ticketData=null;}
  try{const data=await rpc('detail',{ticket:id,...older??{}});if(!current(g)||selected!==id)return;
   if(older && ticketData)data.messages=[...data.messages,...ticketData.messages];ticketData=data;render(data);message('');
  }catch(e){if(current(g))message(e.message);}}
 function render(data){const panel=$('support-detail');panel.replaceChildren();panel.hidden=false;const t=data.ticket;
  const row=[...$('support-list').children].find(row=>row.dataset.ticketId===t.id);if(row){if(!['all',t.status].includes($('support-filter').value))row.remove();else row.querySelector('small').textContent=`${t.status} · ${date(t.updatedAt)} · ${t.player.slice(0,8)}`;}
  text('h2','Conversation',panel);text('p',`Player ${t.player}`,panel);text('p',`Opened ${date(t.at)} · ${t.status}`,panel);
  text('p',`First response: ${t.firstResponseAt?date(t.firstResponseAt):'None'}`,panel);
  text('p',Object.entries(t.context??{}).map(([k,v])=>`${k}: ${v}`).join(' · '),panel);
  if(t.email)text('p',`Contact email: ${t.email}`,panel);
  if(data.attachment && ['image/png','image/jpeg'].includes(data.attachment.mime) && /^[A-Za-z0-9+/]+={0,2}$/.test(data.attachment.base64) && data.attachment.base64.length<350000){const image=document.createElement('img');image.alt='Player screenshot';image.className='support-screenshot';image.src=`data:${data.attachment.mime};base64,${data.attachment.base64}`;panel.append(image);}
  if(data.next){const older=text('button','Older messages',panel);older.onclick=()=>detail(t.id,data.next);}
  for(const m of data.messages){const article=document.createElement('article');article.className='support-message';text('strong',`${m.from==='support'?'Support':'Player'} · ${date(m.at)}`,article);text('p',m.body,article);panel.append(article);}
  const editor=document.createElement('textarea');editor.rows=5;editor.maxLength=3000;editor.placeholder='Reply or internal note';editor.setAttribute('aria-label','Reply or internal note');editor.value=drafts.get(t.id)??'';editor.oninput=()=>drafts.set(t.id,editor.value);panel.append(editor);
  const status=document.createElement('select');status.setAttribute('aria-label','Status after action');for(const value of ['awaiting_reply','resolved','open']){const option=document.createElement('option');option.value=value;option.textContent=value.replace('_',' ');status.append(option);}panel.append(status);
  const controls=document.createElement('div');controls.className='support-toolbar';panel.append(controls);
  for(const [action,label] of [['reply','Send reply'],['note','Save internal note'],['status','Update status']]){const button=text('button',label,controls);button.onclick=()=>mutate(action,t.id,editor.value,status.value);}
  if(data.notes.length){text('h3','Internal history',panel);for(const note of data.notes){text('small',`${date(note.at)} · ${note.action}`,panel);text('p',note.body,panel);}}
 }
 // Retain the same operation ID after uncertain delivery; edits get a new ID.
 const operations=new Map();
 function confirmReply(player,body){return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Confirm support reply');
  text('h2','Send reply?',dialog);text('p',`Player ${player}`,dialog);text('p',body,dialog);
  const cancel=text('button','Cancel',dialog);cancel.onclick=()=>dialog.close('cancel');
  const send=text('button','Send reply now',dialog);send.onclick=()=>dialog.close('send');
  dialog.onclose=()=>{const accepted=dialog.returnValue==='send';dialog.remove();resolve(accepted);};
  $('support-detail').append(dialog);dialog.showModal();cancel.focus();
 });}
 async function mutate(action,ticket,body,status){if(busy||!signedIn())return;if(action!=='status' && body.trim().length<3){message('Use 3 to 3000 characters.');return;}
  const confirmationGeneration=generation;
  if(action==='reply' && !await confirmReply(ticketData.ticket.player,body))return;
  if(!current(confirmationGeneration)||selected!==ticket)return;
  const key=JSON.stringify([action,ticket,body.trim(),status]);const id=operations.get(key)??crypto.randomUUID();operations.set(key,id);
  busy=true;const g=generation;root.querySelectorAll('button,textarea,select').forEach(el=>el.disabled=true);message('Saving');
  try{await rpc(action,{ticket,id,body:body.trim(),status});if(!current(g))return;operations.delete(key);drafts.delete(ticket);await detail(ticket);}
  catch(e){if(current(g))message(e.message);}
  finally{busy=false;if(current(g))root.querySelectorAll('button,textarea,select').forEach(el=>el.disabled=false);else if(signedIn())root.querySelectorAll('button,textarea,select').forEach(el=>el.disabled=false);}}
 $('support-refresh').onclick=()=>load();$('support-filter').onchange=()=>load();$('support-older').onclick=()=>load(true);
 return {load,clear:()=>{operations.clear();clear();}};
}
