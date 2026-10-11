/* 21Game Supabase auth + demo-chip request UI. No real-money payment is processed here. */
(function(){
  const $=id=>document.getElementById(id); let isSignup=false,client=null,profile=null;
  function status(msg,err){const el=$("authStatus");if(el){el.textContent=msg||"";el.style.color=err?"#ff9a9a":"#b5e8cb";}}
  function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");}
  function setMode(signup){isSignup=signup;$("authHeading").textContent=signup?"ساخت حساب کاربری":"ورود به بازی ۲۱";$("authIntro").textContent=signup?"حساب بسازید تا وارد لابی بازی شوید.":"برای انتخاب میز وارد حساب خود شوید.";$("usernameLabel").classList.toggle("hidden",!signup);$("authUsername").classList.toggle("hidden",!signup);$("authUsername").required=signup;$("authPassword").autocomplete=signup?"new-password":"current-password";$("authSubmit").textContent=signup?"ثبت‌نام":"ورود";$("authModeToggle").textContent=signup?"قبلاً حساب دارید؟ وارد شوید":"حساب ندارید؟ ثبت‌نام کنید";status("");}
  function setWallet(n){n=Number(n||0);$("wallet").textContent=n.toLocaleString("fa-IR");if(typeof window.setAuthenticatedWallet==="function")window.setAuthenticatedWallet(n);}
  async function loadProfile(user){const r=await client.from("profiles").select("id,username,display_name,role,demo_chips").eq("id",user.id).single();if(r.error)throw r.error;profile=r.data;window.current21GameUser={id:user.id,email:user.email,...profile};$("signedInName").textContent=profile.display_name||profile.username;$("signOutBtn").classList.remove("hidden");$("authGate").classList.add("auth-hidden");$("adminPanelBtn").classList.toggle("hidden",profile.role!=="admin");setWallet(profile.demo_chips);window.dispatchEvent(new CustomEvent("21game:authenticated",{detail:window.current21GameUser}));}
  async function refreshProfile(){if(window.current21GameUser)await loadProfile({id:window.current21GameUser.id,email:window.current21GameUser.email});}
  async function submitAuth(e){e.preventDefault();if(!client)return status("تنظیم Supabase کامل نیست؛ فایل SUPABASE_SETUP.md را دنبال کنید.",true);const email=$("authEmail").value.trim(),password=$("authPassword").value;$("authSubmit").disabled=true;status(isSignup?"در حال ساخت حساب...":"در حال ورود...");try{if(isSignup){const username=$("authUsername").value.trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(username))throw Error("نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط باشد.");const r=await client.auth.signUp({email,password,options:{data:{username,display_name:username}}});if(r.error)throw r.error;if(!r.data.session){status("حساب ساخته شد. ایمیل تأیید را بررسی کنید؛ سپس وارد شوید.");return;}await loadProfile(r.data.user);}else{const r=await client.auth.signInWithPassword({email,password});if(r.error)throw r.error;await loadProfile(r.data.user);}}catch(err){status(err.message||"عملیات انجام نشد.",true);}finally{$("authSubmit").disabled=false;}}
  function requestForm(type){if(!window.current21GameUser){alert("ابتدا وارد حساب شوید.");return;}const wd=type==="withdrawal";const body=['<p>'+(wd?"درخواست برداشت ژتون آزمایشی":"درخواست شارژ ژتون آزمایشی")+'</p>','<p>موجودی: <strong>'+Number(profile?.demo_chips||0).toLocaleString("fa-IR")+' ژتون</strong></p>','<label>مبلغ ژتون</label><input id="reqAmount" type="number" min="1" step="1" placeholder="مبلغ" style="width:100%;padding:12px;margin:8px 0;border-radius:8px;background:#1c283c;color:#fff;border:0">',wd?'<input id="reqRef" placeholder="توضیح درخواست" style="width:100%;padding:12px;margin:8px 0;border-radius:8px;background:#1c283c;color:#fff;border:0">':'<label>روش درخواست</label><select id="reqMethod" style="width:100%;padding:12px;margin:8px 0;border-radius:8px;background:#1c283c;color:#fff"><option value="card_transfer">کارت به کارت (بررسی دستی)</option><option value="voucher">ووچر (بررسی دستی)</option><option value="manual">هماهنگی با مدیر</option></select><input id="reqRef" placeholder="شماره پیگیری یا توضیح" style="width:100%;padding:12px;margin:8px 0;border-radius:8px;background:#1c283c;color:#fff;border:0">','<p style="font-size:12px;color:#9fb0c6">این نسخه فقط ژتون آزمایشی ثبت می‌کند؛ پرداخت واقعی انجام نمی‌شود.</p><button id="reqSubmit">ثبت درخواست</button><p id="reqStatus"></p>'].join("");window.open21GameAccountModal(wd?"درخواست برداشت ژتون":"درخواست شارژ ژتون",body);$("reqSubmit").onclick=async()=>{const amount=Number($("reqAmount").value),ref=$("reqRef").value.trim(),method=wd?"manual":$("reqMethod").value,msg=$("reqStatus");if(!Number.isSafeInteger(amount)||amount<=0){msg.textContent="مبلغ معتبر وارد کنید.";return;}if(wd&&amount>Number(profile?.demo_chips||0)){msg.textContent="موجودی ژتون کافی نیست.";return;}msg.textContent="در حال ثبت...";$("reqSubmit").disabled=true;const r=await client.from("wallet_requests").insert({user_id:window.current21GameUser.id,request_type:type,amount,method,reference:ref||null});$("reqSubmit").disabled=false;if(r.error){msg.textContent="ثبت نشد: "+r.error.message;return;}msg.textContent="درخواست ثبت شد و پس از بررسی مدیر نتیجه اعلام می‌شود.";};}
  async function adminPanel(){
    if(profile?.role!=="admin")return;
    window.open21GameAccountModal("تنظیمات مدیریت","<p>در حال بارگذاری کاربران، میزها و درخواست‌ها...</p>");
    const body=$("accountBody");
    const [usersRes,tablesRes,requestsRes]=await Promise.all([
      client.from("profiles").select("id,username,display_name,role,demo_chips,created_at").order("created_at",{ascending:false}).limit(200),
      client.from("game_tables").select("id,stake,capacity,status").order("id"),
      client.from("wallet_requests").select("id,user_id,request_type,amount,method,reference,status").eq("status","pending").order("created_at",{ascending:true}).limit(100)
    ]);
    if(usersRes.error||tablesRes.error||requestsRes.error){body.textContent="خطا: "+(usersRes.error||tablesRes.error||requestsRes.error).message;return;}
    const users=usersRes.data||[],tables=tablesRes.data||[],reqs=requestsRes.data||[];
    const names=Object.fromEntries(users.map(u=>[u.id,u.display_name||u.username]));
    body.innerHTML='<h3>تنظیم میزها و مبالغ ژتون</h3>'+tables.map(t=>'<div class="settings-card"><strong>میز '+t.id+'</strong><label>مبلغ پایه ژتون</label><input type="number" min="1" id="stake-'+t.id+'" value="'+Number(t.stake)+'"><label>ظرفیت (۲ تا ۶ نفر)</label><select id="capacity-'+t.id+'">'+[2,3,4,5,6].map(n=>'<option value="'+n+'" '+(n===t.capacity?'selected':'')+'>'+n+' نفر</option>').join('')+'</select><label>وضعیت میز</label><select id="table-status-'+t.id+'"><option value="waiting" '+(t.status==="waiting"?'selected':'')+'>فعال</option><option value="maintenance" '+(t.status==="maintenance"?'selected':'')+'>غیرفعال / تعمیرات</option></select><button data-save-table="'+t.id+'">ذخیره تنظیم میز</button></div>').join('')+
    '<h3>کاربران و موجودی ژتون</h3>'+users.map(u=>'<div class="user-row"><strong>'+esc(u.display_name||u.username)+'</strong><small>@'+esc(u.username)+' · '+esc(u.role)+' · موجودی: '+Number(u.demo_chips).toLocaleString("fa-IR")+'</small><label>تغییر موجودی (+ شارژ / − کسر)</label><input type="number" id="chip-adjust-'+u.id+'" placeholder="مثلاً 50000 یا -20000"><input id="chip-note-'+u.id+'" placeholder="دلیل تغییر موجودی"><button data-adjust-user="'+u.id+'">ثبت تغییر ژتون</button></div>').join('')+
    '<h3>درخواست‌های ژتون در انتظار</h3>'+(reqs.length?reqs.map(x=>'<div class="user-row"><strong>'+esc(names[x.user_id]||"کاربر")+'</strong><p>'+(x.request_type==="chip_topup"?"شارژ":"برداشت")+' · '+Number(x.amount).toLocaleString("fa-IR")+' ژتون</p><small>'+esc(x.method)+' · '+esc(x.reference||"—")+'</small><button data-review="'+x.id+'" data-approve="true">تأیید</button> <button data-review="'+x.id+'" data-approve="false">رد</button></div>').join(''):'<p>درخواستی در انتظار نیست.</p>');
    body.querySelectorAll("[data-save-table]").forEach(b=>b.onclick=async()=>{
      const id=Number(b.dataset.saveTable),stake=Number($("stake-"+id).value),capacity=Number($("capacity-"+id).value),status=$("table-status-"+id).value;
      if(!Number.isSafeInteger(stake)||stake<1){alert("مبلغ میز معتبر نیست.");return;}
      b.disabled=true;const z=await client.rpc("admin_update_table",{p_table_id:id,p_stake:stake,p_capacity:capacity,p_status:status});b.disabled=false;
      if(z.error){alert("ذخیره نشد: "+z.error.message);return;}await refreshOccupancy();await adminPanel();
    });
    body.querySelectorAll("[data-adjust-user]").forEach(b=>b.onclick=async()=>{
      const id=b.dataset.adjustUser,amount=Number($("chip-adjust-"+id).value),note=$("chip-note-"+id).value.trim();
      if(!Number.isSafeInteger(amount)||amount===0){alert("مبلغ تغییر ژتون را با علامت مثبت یا منفی وارد کنید.");return;}
      b.disabled=true;const z=await client.rpc("admin_adjust_user_chips",{p_user_id:id,p_amount:amount,p_note:note});b.disabled=false;
      if(z.error){alert("تغییر موجودی انجام نشد: "+z.error.message);return;}await adminPanel();await refreshProfile();
    });
    body.querySelectorAll("[data-review]").forEach(b=>b.onclick=async()=>{
      b.disabled=true;const z=await client.rpc("admin_review_wallet_request",{p_request_id:b.dataset.review,p_approve:b.dataset.approve==="true",p_note:"بررسی از پنل مدیر"});
      if(z.error){alert("انجام نشد: "+z.error.message);b.disabled=false;return;}await adminPanel();await refreshProfile();
    });
  }
  async function profileSettings(){
    if(!window.current21GameUser)return alert("ابتدا وارد حساب شوید.");
    const p=window.current21GameUser;
    window.open21GameAccountModal("تنظیمات حساب کاربری",'<div class="settings-card"><label>نام کاربری (۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط)</label><input id="profileUsername" maxlength="24" value="'+esc(p.username||"")+'"><label>نام نمایشی</label><input id="profileDisplayName" maxlength="40" value="'+esc(p.display_name||"")+'"><button id="saveProfileBtn">ذخیره تغییرات</button><p id="profileSaveStatus"></p></div>');
    $("saveProfileBtn").onclick=async()=>{
      const username=$("profileUsername").value.trim().toLowerCase(),display_name=$("profileDisplayName").value.trim();
      const msg=$("profileSaveStatus");$("saveProfileBtn").disabled=true;msg.textContent="در حال ذخیره...";
      const z=await client.rpc("user_update_profile",{p_username:username,p_display_name:display_name||null});$("saveProfileBtn").disabled=false;
      if(z.error){msg.textContent="ذخیره نشد: "+z.error.message;return;}
      profile=z.data;window.current21GameUser={...window.current21GameUser,...z.data};$("signedInName").textContent=z.data.display_name||z.data.username;
      msg.textContent="تغییرات ذخیره شد.";
      window.dispatchEvent(new CustomEvent("21game:profile-updated",{detail:window.current21GameUser}));
    };
  }
  async function init(){const url=window.SUPABASE_URL,key=window.SUPABASE_ANON_KEY;if(!window.supabase||!url||!key||url.includes("YOUR_SUPABASE")||key.includes("YOUR_SUPABASE")){status("تنظیم Supabase هنوز انجام نشده است. فایل SUPABASE_SETUP.md را دنبال کنید.",true);return;}client=window.supabase.createClient(url,key);window.supabase21Game=client;const r=await client.auth.getSession();if(r.error){status(r.error.message,true);return;}if(r.data.session){try{await loadProfile(r.data.session.user);}catch(e){status("پروفایل پیدا نشد. schema.sql را در Supabase اجرا کنید.",true);}}client.auth.onAuthStateChange(async(_ev,s)=>{if(s&&!window.current21GameUser){try{await loadProfile(s.user);}catch(e){status(e.message,true);}}});}
  window.open21GameAccountModal=(title,body)=>{$("accountTitle").textContent=title;$("accountBody").innerHTML=body;$("accountModal").classList.remove("hidden");};
  window.addEventListener("DOMContentLoaded",()=>{$("authForm").addEventListener("submit",submitAuth);$("authModeToggle").addEventListener("click",()=>setMode(!isSignup));$("signOutBtn").addEventListener("click",async()=>{if(client)await client.auth.signOut();profile=null;window.current21GameUser=null;$("signedInName").textContent="مهمان";$("signOutBtn").classList.add("hidden");$("adminPanelBtn").classList.add("hidden");setWallet(0);$("authGate").classList.remove("auth-hidden");setMode(false);});$("chipRequestBtn").addEventListener("click",()=>requestForm("chip_topup"));$("withdrawBtn").addEventListener("click",()=>requestForm("withdrawal"));$("adminPanelBtn").addEventListener("click",adminPanel);$("profileSettingsBtn").addEventListener("click",profileSettings);$("balanceBtn").addEventListener("click",()=>requestForm("chip_topup"));init();});
})();
/* Live lobby, private hand display, shared chat and WebRTC voice. */
(function(){
  const $=id=>document.getElementById(id);
  let channel=null, chatChannel=null, voiceChannel=null, seatedTable=null;
  let voiceEnabled=false, localStream=null, shownAskechiRound=null, askechiVisibleUntil=0;
  const peers=new Map(), audioEls=new Map();
  let stakes=[20000,30000,40000,50000,50000,60000,70000,80000,90000,100000];
  let tableStatuses=Array(10).fill("waiting"),tableCapacities=Array(10).fill(6);
  function cash(n){return Number(n||0).toLocaleString("fa-IR");}
  function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");}
  function cardHtml(card,small=false){
    if(!card)return "";
    const red=["♥","♦"].includes(card.suit);
    return '<span class="playing-card '+(red?"red":"black")+(small?" mini":"")+'"><span class="rank">'+escapeHtml(card.rank)+'</span><span class="suit">'+escapeHtml(card.suit)+'</span></span>';
  }
  async function refreshOccupancy(){
    const client=window.supabase21Game;if(!client)return;
    const [seatResult,tableResult]=await Promise.all([client.from("table_seats").select("table_id"),client.from("game_tables").select("id,stake,capacity,status").order("id")]);
    const data=seatResult.data,error=seatResult.error;if(error)return;
    if(tableResult.data?.length){stakes=Array(10).fill(0);tableStatuses=Array(10).fill("waiting");tableCapacities=Array(10).fill(6);tableResult.data.forEach(t=>{stakes[t.id-1]=Number(t.stake);tableStatuses[t.id-1]=t.status;tableCapacities[t.id-1]=Number(t.capacity);});window.update21GameTables?.(tableResult.data);}
    const counts=Array(10).fill(0);
    (data||[]).forEach(row=>{const i=Number(row.table_id)-1;if(i>=0&&i<counts.length)counts[i]++;});
    counts.forEach((n,i)=>{const el=$("onlineCount"+i);if(el)el.textContent="آنلاین: "+cash(n)+" نفر";});
  }
  async function renderLobby(tableIndex){
    const client=window.supabase21Game, tableId=tableIndex+1;
    const {data,error}=await client.from("table_seats").select("seat_no,user_id,profiles(username,display_name)").eq("table_id",tableId).order("seat_no");
    if(error)throw error;
    const seats=data||[];
    const {data:game,error:gameError}=await client.rpc("game_my_hand",{p_table_id:tableId});
    const me=window.current21GameUser?.id;
    const askechi=(!gameError&&Array.isArray(game?.askechi_cards))?game.askechi_cards:[];
    if(!gameError&&game?.status==="playing"&&askechi.length&&shownAskechiRound!==game.round_no){
      shownAskechiRound=game.round_no;askechiVisibleUntil=Date.now()+2400;
      setTimeout(()=>{if(seatedTable===tableId)renderLobby(tableIndex).catch(console.error);},2450);
    }
    const showAskechi=Date.now()<askechiVisibleUntil;
    $("seats").innerHTML=Array.from({length:6},(_,i)=>{
      const p=seats.find(s=>s.seat_no===i+1);
      if(!p)return '<div class="seat s'+i+'"><div class="avatar">＋</div><div class="name">صندلی خالی</div><div class="tag"></div><div class="cards"></div></div>';
      const isMe=p.user_id===me, isBanker=!gameError&&game?.banker_user_id===p.user_id;
      const isActive=!gameError&&game?.active_user_id===p.user_id;
      const name=escapeHtml(p.profiles?.display_name||p.profiles?.username||"بازیکن");
      const initialCards=showAskechi?askechi.filter(x=>x.user_id===p.user_id).map(x=>cardHtml(x.card,true)).join(""):"";
      const privateCards=isMe&&!gameError?(game?.my_hand||[]).map(x=>cardHtml(x,true)).join(""):"";
      const revealedCards=game?.status==="settled"?(game?.revealed_hands?.[p.user_id]||[]).map(x=>cardHtml(x,true)).join(""):"";
      const shownCards=initialCards || revealedCards || privateCards || (game?.status==="playing"&&!isMe?'<span class="card-back playing-card"></span>':"");
      return '<div class="seat s'+i+' '+(isMe?"active ":"")+(isBanker?"banker ":"")+(isActive?"turn-active":"")+'"><div class="avatar">'+(isBanker?"👑":"👤")+'</div><div class="name">'+name+'</div><div class="tag">'+(isBanker?"بانکدار":isMe?"شما":isActive?"نوبت بازی":"بازیکن")+'</div><div class="cards">'+shownCards+'</div></div>';
    }).join("");
    const statusText=gameError?"خطای دریافت وضعیت بازی: "+gameError.message:(game?.message||"در انتظار شروع بازی");
    $("status").textContent=statusText;
    $("handInfo").innerHTML=gameError?"وضعیت کارت‌ها دریافت نشد.":("کارت‌های شما: "+((game?.my_hand||[]).map(x=>cardHtml(x)).join(" ")||"—")+" · امتیاز: "+(game?.my_score||0));
    $("cardChoices").innerHTML="";
    $("bankAmount").textContent=cash(game?.bank_amount??stakes[tableIndex]*3);
    const chipCount=Math.max(0,Math.min(12,Math.round(Number(game?.bank_amount||0)/stakes[tableIndex])));
    $("bankChips").innerHTML=chipCount?Array.from({length:chipCount},(_,i)=>'<span class="chip-token chip-'+(i%4)+'" style="--chip-index:'+i+'"></span>').join(""):'<span class="empty-bank">بانک بازی</span>';
    $("tableInfo").textContent="مبلغ پایه: "+cash(stakes[tableIndex])+" ژتون آزمایشی · ظرفیت ۶ نفر · "+seats.length+" بازیکن حاضر";
    const isMyTurn=!!game&&!gameError&&game.status==="playing"&&game.active_user_id===me;
    $("startGameBtn").classList.toggle("hidden",!!game&&!gameError&&game.status==="playing");
    $("startGameBtn").disabled=seats.length<2;
    $("drawCardBtn").classList.toggle("hidden",!isMyTurn);
    $("standBtn").style.display=isMyTurn&&!game?.is_banker?"inline-block":"none";
    $("closeBankBtn").style.display=isMyTurn&&game?.is_banker?"inline-block":"none";
    $("nextPlayerBtn").style.display="none";$("nextRoundBtn").style.display="none";
  }
  let lastChatIds=new Set(),hasUnreadChat=false;
  async function loadChat(){
    const client=window.supabase21Game;if(!client||!seatedTable)return;
    const {data,error}=await client.from("table_chat").select("id,user_id,message,created_at").eq("table_id",seatedTable).order("created_at",{ascending:true}).limit(100);
    if(error){$("chatMessages").textContent="پیام‌ها بارگذاری نشد: "+error.message;return;}
    const ids=[...new Set((data||[]).map(x=>x.user_id))];
    let profiles=[];
    if(ids.length){const p=await client.from("profiles").select("id,username,display_name").in("id",ids);profiles=p.data||[];}
    const names=Object.fromEntries(profiles.map(p=>[p.id,p.display_name||p.username||"بازیکن"]));
    const box=$("chatMessages");box.innerHTML="";
    (data||[]).forEach(row=>{const el=document.createElement("div");el.className="chat-msg";el.textContent=(names[row.user_id]||"بازیکن")+": "+row.message;box.appendChild(el);});
    box.scrollTop=box.scrollHeight;
  }
  async function sendChat(){
    const client=window.supabase21Game,user=window.current21GameUser,input=$("chatInput"),message=input.value.trim();
    if(!client||!user||!seatedTable){alert("برای ارسال پیام باید وارد میز شوید.");return;}
    if(!message)return;
    const {error}=await client.from("table_chat").insert({table_id:seatedTable,user_id:user.id,message:message.slice(0,500)});
    if(error){alert("ارسال پیام انجام نشد: "+error.message);return;}
    input.value="";await loadChat();
  }
  async function sendVoiceSignal(to,payload){
    if(!voiceChannel)return;
    return voiceChannel.send({type:"broadcast",event:"signal",payload:{from:window.current21GameUser.id,to,...payload}});
  }
  function closePeer(id){
    const pc=peers.get(id);if(pc){pc.onicecandidate=null;pc.ontrack=null;pc.close();peers.delete(id);}
    const audio=audioEls.get(id);if(audio){audio.srcObject=null;audio.remove();audioEls.delete(id);}
  }
  async function makePeer(id,offerer){
    if(peers.has(id))return peers.get(id);
    const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    peers.set(id,pc);
    if(localStream)localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));
    pc.onicecandidate=e=>{if(e.candidate)sendVoiceSignal(id,{kind:"candidate",candidate:e.candidate});};
    pc.ontrack=e=>{
      let audio=audioEls.get(id);
      if(!audio){audio=document.createElement("audio");audio.autoplay=true;audio.playsInline=true;audio.style.display="none";$("chatPanel").appendChild(audio);audioEls.set(id,audio);}
      audio.srcObject=e.streams[0];audio.muted=false;audio.volume=1;audio.play().catch(()=>{$("voiceNote").textContent="اتصال برقرار شده اما پخش صدا مسدود است؛ روی صفحه کلیک کنید و صدای مرورگر را بررسی کنید.";});
    };
    pc.onconnectionstatechange=()=>{if(["failed","closed"].includes(pc.connectionState))closePeer(id);};
    if(offerer){const offer=await pc.createOffer();await pc.setLocalDescription(offer);await sendVoiceSignal(id,{kind:"offer",sdp:pc.localDescription});}
    return pc;
  }
  async function handleVoiceSignal(payload){
    const me=window.current21GameUser?.id;if(!payload||payload.to!==me||payload.from===me)return;
    const from=payload.from;
    try{
      if(payload.kind==="hello"){
        if(voiceEnabled&&me<from)await makePeer(from,true);
      }else if(payload.kind==="offer"&&voiceEnabled){
        const pc=await makePeer(from,false);await pc.setRemoteDescription(payload.sdp);
        const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
        await sendVoiceSignal(from,{kind:"answer",sdp:pc.localDescription});
      }else if(payload.kind==="answer"&&peers.has(from)){
        await peers.get(from).setRemoteDescription(payload.sdp);
      }else if(payload.kind==="candidate"&&peers.has(from)&&payload.candidate){
        await peers.get(from).addIceCandidate(payload.candidate);
      }else if(payload.kind==="bye"){closePeer(from);}
    }catch(e){console.warn("voice signaling:",e);}
  }
  async function toggleVoice(){
    if(voiceEnabled){
      voiceEnabled=false;
      for(const id of peers.keys())sendVoiceSignal(id,{kind:"bye"});
      [...peers.keys()].forEach(closePeer);
      if(localStream)localStream.getTracks().forEach(t=>t.stop());
      localStream=null;$("voiceBtn").classList.remove("active");$("voiceBtn").textContent="🎙 وویس";
      $("voiceNote").textContent="وویس خاموش است.";return;
    }
    if(!seatedTable){alert("ابتدا وارد یک میز شوید.");return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){alert("مرورگر شما تماس صوتی را پشتیبانی نمی‌کند.");return;}
    try{
      localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});voiceEnabled=true;
      $("voiceBtn").classList.add("active");$("voiceBtn").textContent="🎙 قطع وویس";
      $("voiceNote").textContent="میکروفون فعال شد؛ در انتظار اتصال بازیکنان دیگر...";
      const {data}=await window.supabase21Game.from("table_seats").select("user_id").eq("table_id",seatedTable);
      for(const row of data||[])if(row.user_id!==window.current21GameUser.id){if(window.current21GameUser.id<row.user_id)await makePeer(row.user_id,true);else await sendVoiceSignal(row.user_id,{kind:"hello"});}
    }catch(e){voiceEnabled=false;if(localStream)localStream.getTracks().forEach(t=>t.stop());localStream=null;alert("فعال‌سازی میکروفون انجام نشد: "+e.message);}
  }
  async function setupTableChannels(tableId,i){
    const client=window.supabase21Game;
    if(channel)await client.removeChannel(channel);
    if(chatChannel)await client.removeChannel(chatChannel);
    if(voiceChannel)await client.removeChannel(voiceChannel);
    channel=client.channel("table-seats-"+tableId)
      .on("postgres_changes",{event:"*",schema:"public",table:"table_seats",filter:"table_id=eq."+tableId},()=>{renderLobby(i).catch(console.error);refreshOccupancy();})
      .on("postgres_changes",{event:"*",schema:"public",table:"table_public_state",filter:"table_id=eq."+tableId},()=>renderLobby(i).catch(console.error))
      .subscribe();
    chatChannel=client.channel("table-chat-"+tableId)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"table_chat",filter:"table_id=eq."+tableId},payload=>{if(payload.new?.user_id!==window.current21GameUser?.id&&$("chatPanel").classList.contains("hidden")){$("chatUnreadDot").classList.remove("hidden");hasUnreadChat=true;}loadChat();}).subscribe();
    voiceChannel=client.channel("voice-table-"+tableId,{config:{broadcast:{self:false,ack:true}}}).on("broadcast",{event:"signal"},({payload})=>handleVoiceSignal(payload));
    await new Promise(resolve=>{let done=false;voiceChannel.subscribe(status=>{if(status==="SUBSCRIBED"&&!done){done=true;resolve();}if((status==="CHANNEL_ERROR"||status==="TIMED_OUT")&&!done){done=true;resolve();$("voiceNote").textContent="خطای اتصال وویس؛ تنظیمات Realtime را بررسی کنید.";}});});
    await loadChat();
  }
  async function joinOnlineTable(i){
    const client=window.supabase21Game,user=window.current21GameUser;
    if(!client||!user){alert("برای ورود به میز ابتدا وارد حساب شوید.");return;}
    const stake=stakes[i];
    if(Number(user.demo_chips||0)<stake*4){alert("برای این میز حداقل "+cash(stake*4)+" ژتون آزمایشی لازم است. از منو درخواست شارژ ژتون بدهید.");return;}
    try{
      const {data:existing,error:existingErr}=await client.from("table_seats").select("table_id,seat_no").eq("user_id",user.id);
      if(existingErr)throw existingErr;
      if(existing?.length&&existing[0].table_id!==i+1){alert("شما هم‌اکنون روی میز دیگری نشسته‌اید. ابتدا آن میز را ترک کنید.");return;}
      if(!existing?.length){
        const {data:occupied,error}=await client.from("table_seats").select("seat_no").eq("table_id",i+1);
        if(error)throw error;if((occupied||[]).length>=tableCapacities[i]){alert("ظرفیت این میز تکمیل است.");return;}const used=new Set((occupied||[]).map(x=>x.seat_no));
        let seatNo=1;while(used.has(seatNo)&&seatNo<=6)seatNo++;
        if(seatNo>6){alert("این میز پر است. میز دیگری انتخاب کنید.");return;}
        const {error:insertErr}=await client.from("table_seats").insert({table_id:i+1,user_id:user.id,seat_no:seatNo});
        if(insertErr)throw insertErr;
      }
      seatedTable=i+1;
      $("modalTitle").textContent="میز "+(i+1);$("modal").classList.remove("hidden");
      $("leaveOnlineTable").classList.remove("hidden");$("pauseOnlineTable").classList.remove("hidden");
      await setupTableChannels(seatedTable,i);await renderLobby(i);
    }catch(e){alert("ورود به میز انجام نشد: "+(e.message||e));}
  }
  async function sendGameAction(action){
    const client=window.supabase21Game;if(!client||!seatedTable)return;
    const {data,error}=await client.rpc("game_action",{p_table_id:seatedTable,p_action:action});
    if(error){alert("خطای بازی: "+error.message);return;}
    await refreshProfile();
    await renderLobby(seatedTable-1);if(data?.message)$("status").textContent=data.message;
    if(action==="pause")$("modal").classList.add("hidden");
  }
  async function leaveOnlineTable(){
    const client=window.supabase21Game,user=window.current21GameUser;if(!client||!user||!seatedTable)return;
    const tableId=seatedTable;
    if(voiceEnabled)await toggleVoice();
    const {error}=await client.from("table_seats").delete().eq("table_id",tableId).eq("user_id",user.id);
    if(error){alert("ترک میز انجام نشد: "+error.message);return;}
    for(const ch of [channel,chatChannel,voiceChannel])if(ch)await client.removeChannel(ch);
    channel=null;chatChannel=null;voiceChannel=null;seatedTable=null;
    $("leaveOnlineTable").classList.add("hidden");$("pauseOnlineTable").classList.add("hidden");$("modal").classList.add("hidden");
  }
  window.addEventListener("DOMContentLoaded",()=>{
    window.joinTable=joinOnlineTable;
    $("leaveOnlineTable").addEventListener("click",leaveOnlineTable);
    $("startGameBtn").addEventListener("click",()=>sendGameAction("start"));
    $("drawCardBtn").addEventListener("click",()=>sendGameAction("draw"));
    $("standBtn").addEventListener("click",()=>sendGameAction("stand"));
    $("closeBankBtn").addEventListener("click",()=>sendGameAction("close"));
    $("pauseOnlineTable").textContent="خروج موقت";
    $("pauseOnlineTable").addEventListener("click",()=>sendGameAction("pause"));
    $("chatBtn").onclick=()=>{$("chatPanel").classList.toggle("hidden");if(!$("chatPanel").classList.contains("hidden")){$("chatUnreadDot").classList.add("hidden");hasUnreadChat=false;loadChat();}};
    $("stickerBtn").onclick=()=>$("stickerPicker").classList.toggle("hidden");
    $("stickerPicker").querySelectorAll("[data-sticker]").forEach(b=>b.onclick=()=>{$("chatInput").value+=b.dataset.sticker;$("chatInput").focus();});
    $("sendChat").onclick=sendChat;
    $("chatInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();sendChat();}});
    $("voiceBtn").onclick=toggleVoice;
    window.addEventListener("21game:authenticated",refreshOccupancy);
    const client=window.supabase21Game;
    if(client){refreshOccupancy();client.channel("lobby-occupancy").on("postgres_changes",{event:"*",schema:"public",table:"table_seats"},refreshOccupancy).subscribe();}
    $("closeModal").addEventListener("click",()=>{if(seatedTable)$("modal").classList.add("hidden");});
  });
})();