/* 21Game Supabase auth + demo-chip request UI. No real-money payment is processed here. */
(function(){
  const $=id=>document.getElementById(id); let isSignup=false,client=null,profile=null;
  function status(msg,err){const el=$("authStatus");if(el){el.textContent=msg||"";el.style.color=err?"#ff9a9a":"#b5e8cb";}}
  function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");}
  function setMode(signup){isSignup=signup;$("authHeading").textContent=signup?"ساخت حساب کاربری":"ورود به بازی ۲۱";$("authIntro").textContent=signup?"حساب بسازید تا وارد لابی بازی شوید.":"برای انتخاب میز وارد حساب خود شوید.";$("usernameLabel").classList.toggle("hidden",!signup);$("authUsername").classList.toggle("hidden",!signup);$("authUsername").required=signup;$("authPassword").autocomplete=signup?"new-password":"current-password";$("authSubmit").textContent=signup?"ثبت‌نام":"ورود";$("authModeToggle").textContent=signup?"قبلاً حساب دارید؟ وارد شوید":"حساب ندارید؟ ثبت‌نام کنید";status("");}
  function setWallet(n){n=Number(n||0);$("wallet").textContent=n.toLocaleString("fa-IR");if(typeof window.setAuthenticatedWallet==="function")window.setAuthenticatedWallet(n);}
  async function loadProfile(user){const r=await client.from("profiles").select("id,username,display_name,role,demo_chips").eq("id",user.id).single();if(r.error)throw r.error;profile=r.data;window.current21GameUser={id:user.id,email:user.email,...profile};$("signedInName").textContent=profile.display_name||profile.username;$("signOutBtn").classList.remove("hidden");$("authGate").classList.add("auth-hidden");$("adminPanelBtn").classList.toggle("hidden",profile.role!=="admin");setWallet(profile.demo_chips);window.dispatchEvent(new CustomEvent("21game:authenticated",{detail:window.current21GameUser}));}
  async function refreshProfile(){if(window.current21GameUser)await loadProfile({id:window.current21GameUser.id,email:window.current21GameUser.email});}
  window.refresh21GameProfile=refreshProfile;
  async function submitAuth(e){e.preventDefault();if(!client)return status("تنظیم Supabase کامل نیست؛ فایل SUPABASE_SETUP.md را دنبال کنید.",true);const email=$("authEmail").value.trim(),password=$("authPassword").value;$("authSubmit").disabled=true;status(isSignup?"در حال ساخت حساب...":"در حال ورود...");try{if(isSignup){const username=$("authUsername").value.trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(username))throw Error("نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط باشد.");const r=await client.auth.signUp({email,password,options:{data:{username,display_name:username}}});if(r.error)throw r.error;if(!r.data.session){status("حساب ساخته شد. ایمیل تأیید را بررسی کنید؛ سپس وارد شوید.");return;}await loadProfile(r.data.user);}else{const r=await client.auth.signInWithPassword({email,password});if(r.error)throw r.error;await loadProfile(r.data.user);}}catch(err){status(err.message||"عملیات انجام نشد.",true);}finally{$("authSubmit").disabled=false;}}
  function requestForm(type){
    if(!window.current21GameUser){alert("ابتدا وارد حساب شوید.");return;}
    const isWithdrawal=type==="withdrawal";
    const title=isWithdrawal?"درخواست کسر ژتون آزمایشی":"درخواست شارژ ژتون آزمایشی";
    const body=
      '<p>'+title+'</p>'+
      '<p>موجودی فعلی: <strong>'+Number(profile?.demo_chips||0).toLocaleString("fa-IR")+' ژتون</strong></p>'+
      '<label>مقدار ژتون</label>'+
      '<input id="reqAmount" type="number" min="1" step="1" placeholder="مقدار ژتون" style="width:100%;padding:12px;margin:8px 0;border-radius:8px;background:#1c283c;color:#fff;border:0">'+
      '<label>توضیح (اختیاری)</label>'+
      '<input id="reqRef" maxlength="250" placeholder="توضیح درخواست" style="width:100%;padding:12px;margin:8px 0;border-radius:8px;background:#1c283c;color:#fff;border:0">'+
      '<p style="font-size:12px;color:#f3c77b;line-height:1.8">این بخش فقط برای مدیریت ژتون‌های غیرنقدی بازی است. هیچ پرداخت، واریز بانکی یا برداشت پول واقعی انجام نمی‌شود.</p>'+
      '<button id="reqSubmit">ثبت درخواست</button><p id="reqStatus"></p>';
    window.open21GameAccountModal(title,body);
    $("reqSubmit").onclick=async()=>{
      const amount=Number($("reqAmount").value),reference=$("reqRef").value.trim(),msg=$("reqStatus");
      if(!Number.isSafeInteger(amount)||amount<=0){msg.textContent="مقدار معتبر وارد کنید.";return;}
      if(isWithdrawal&&amount>Number(profile?.demo_chips||0)){msg.textContent="موجودی ژتون کافی نیست.";return;}
      msg.textContent="در حال ثبت درخواست...";
      $("reqSubmit").disabled=true;
      try{
        const result=await client.from("wallet_requests").insert({
          user_id:window.current21GameUser.id,
          request_type:type,
          amount,
          method:"manual",
          reference:reference||null
        });
        if(result.error)throw result.error;
        msg.textContent="درخواست ثبت شد و پس از بررسی مدیر نتیجه مشخص می‌شود.";
      }catch(error){
        msg.textContent="ثبت درخواست انجام نشد: "+(error.message||error);
      }finally{
        $("reqSubmit").disabled=false;
      }
    };
  }
  async function adminPanel(){
    if(profile?.role!=="admin")return;
    window.open21GameAccountModal("پنل مدیریت","<p>در حال بارگذاری بخش‌های مدیریت...</p>");
    const body=$("accountBody");
    const [usersRes,tablesRes,requestsRes]=await Promise.all([
      client.from("profiles").select("id,username,display_name,role,demo_chips,created_at").order("created_at",{ascending:false}).limit(200),
      client.from("game_tables").select("id,stake,capacity,status").order("id"),
      client.from("wallet_requests").select("id,user_id,request_type,amount,method,reference,proof_path,status").eq("status","pending").order("created_at",{ascending:true}).limit(100)
    ]);
    if(usersRes.error||tablesRes.error||requestsRes.error){body.textContent="خطا در بارگذاری پنل: "+(usersRes.error||tablesRes.error||requestsRes.error).message;return;}
    const users=usersRes.data||[],tables=tablesRes.data||[],reqs=requestsRes.data||[];
    const names=Object.fromEntries(users.map(u=>[u.id,u.display_name||u.username]));
    const deposits=reqs.filter(x=>x.request_type==="chip_topup");
    const withdrawals=reqs.filter(x=>x.request_type==="withdrawal");
    const requestCard=(x,isDeposit)=>'<article class="admin-request-card"><div class="admin-request-top"><strong>'+esc(names[x.user_id]||"کاربر")+'</strong><span class="admin-request-amount">'+Number(x.amount).toLocaleString("fa-IR")+' ژتون</span></div><div class="admin-request-meta">'+(isDeposit?"درخواست شارژ ژتون آزمایشی":"درخواست کسر ژتون آزمایشی")+' · '+esc(x.method||"—")+'</div><p class="admin-request-reference">'+esc(x.reference||"بدون توضیح یا شماره پیگیری")+'</p>'+(isDeposit&&x.proof_path?'<div id="proof-'+x.id+'" class="admin-proof"></div>':"")+'<div class="admin-request-actions"><button class="admin-approve" data-review="'+x.id+'" data-approve="true">تأیید درخواست</button><button class="admin-reject" data-review="'+x.id+'" data-approve="false">رد درخواست</button></div></article>';
    body.innerHTML=
      '<nav class="admin-tabs" aria-label="بخش‌های مدیریت">'+
        '<button class="admin-tab active" data-admin-tab="tables">🃏 مدیریت میزها</button>'+
        '<button class="admin-tab" data-admin-tab="withdrawals">💸 تأیید کسر ژتون <span>'+withdrawals.length+'</span></button>'+
        '<button class="admin-tab" data-admin-tab="deposits">🪙 تأیید شارژ ژتون <span>'+deposits.length+'</span></button>'+
        '<button class="admin-tab" data-admin-tab="users">👥 کاربران و ژتون</button>'+
      '</nav>'+
      '<section class="admin-section active" data-admin-section="tables"><div class="admin-section-heading"><div><h3>مدیریت میزها</h3><p>مبلغ پایه، ظرفیت و وضعیت هر میز را جداگانه تنظیم کنید.</p></div><span class="admin-count">'+tables.length+' میز</span></div><div class="admin-table-grid">'+tables.map(t=>'<article class="settings-card admin-table-card"><div class="admin-table-title"><strong>میز شماره '+t.id+'</strong><span class="admin-table-status '+(t.status==="waiting"?"is-active":"is-off")+'">'+(t.status==="waiting"?"فعال":"غیرفعال")+'</span></div><label>مبلغ پایه ژتون</label><input type="number" min="1" id="stake-'+t.id+'" value="'+Number(t.stake)+'"><label>ظرفیت میز</label><select id="capacity-'+t.id+'">'+[2,3,4,5,6].map(n=>'<option value="'+n+'" '+(n===t.capacity?'selected':'')+'>'+n+' نفر</option>').join('')+'</select><label>وضعیت میز</label><select id="table-status-'+t.id+'"><option value="waiting" '+(t.status==="waiting"?'selected':'')+'>فعال</option><option value="maintenance" '+(t.status==="maintenance"?'selected':'')+'>غیرفعال / تعمیرات</option></select><button data-save-table="'+t.id+'">ذخیره تغییرات میز</button></article>').join("")+'</div></section>'+
      '<section class="admin-section" data-admin-section="withdrawals"><div class="admin-section-heading"><div><h3>تأیید کسر ژتون آزمایشی</h3><p>درخواست‌های کسر ژتون غیرنقدی در انتظار بررسی مدیر.</p></div><span class="admin-count">'+withdrawals.length+' درخواست</span></div>'+(withdrawals.length?'<div class="admin-request-list">'+withdrawals.map(x=>requestCard(x,false)).join("")+'</div>':'<div class="admin-empty"><span>✓</span><strong>درخواست کسر ژتونِ در انتظار ندارید</strong><p>درخواست‌های جدید در این بخش نمایش داده می‌شوند.</p></div>')+'</section>'+
      '<section class="admin-section" data-admin-section="deposits"><div class="admin-section-heading"><div><h3>تأیید شارژ ژتون آزمایشی</h3><p>درخواست‌های شارژ ژتون غیرنقدی در انتظار بررسی مدیر.</p></div><span class="admin-count">'+deposits.length+' درخواست</span></div>'+(deposits.length?'<div class="admin-request-list">'+deposits.map(x=>requestCard(x,true)).join("")+'</div>':'<div class="admin-empty"><span>✓</span><strong>درخواست شارژ ژتونِ در انتظار ندارید</strong><p>درخواست‌های جدید در این بخش نمایش داده می‌شوند.</p></div>')+'</section>'+
      '<section class="admin-section" data-admin-section="users"><div class="admin-section-heading"><div><h3>کاربران و موجودی ژتون</h3><p>مدیریت موجودی آزمایشی کاربران.</p></div><span class="admin-count">'+users.length+' کاربر</span></div>'+(users.length?users.map(u=>'<article class="user-row admin-user-card"><strong>'+esc(u.display_name||u.username)+'</strong><small>@'+esc(u.username)+' · '+esc(u.role)+' · موجودی: '+Number(u.demo_chips).toLocaleString("fa-IR")+' ژتون</small><label>تغییر موجودی (+ شارژ / − کسر)</label><input type="number" id="chip-adjust-'+u.id+'" placeholder="مثلاً 50000 یا -20000"><input id="chip-note-'+u.id+'" placeholder="دلیل تغییر موجودی"><button data-adjust-user="'+u.id+'">ثبت تغییر ژتون</button></article>').join(""):'<p>کاربری پیدا نشد.</p>')+'</section>';
    body.querySelectorAll("[data-admin-tab]").forEach(tab=>tab.onclick=()=>{
      body.querySelectorAll("[data-admin-tab]").forEach(x=>x.classList.toggle("active",x===tab));
      body.querySelectorAll("[data-admin-section]").forEach(x=>x.classList.toggle("active",x.dataset.adminSection===tab.dataset.adminTab));
    });
    for(const req of deposits){if(req.proof_path){const signed=await client.storage.from("payment-proofs").createSignedUrl(req.proof_path,3600);const host=$("proof-"+req.id);if(host&&!signed.error)host.innerHTML='<a target="_blank" rel="noopener" href="'+esc(signed.data.signedUrl)+'">مشاهده تصویر رسید</a><img class="payment-proof-preview" src="'+esc(signed.data.signedUrl)+'" alt="تصویر رسید واریز">';}}
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
      const action=b.dataset.approve==="true"?"تأیید":"رد";
      if(!confirm("از "+action+" این درخواست مطمئن هستید؟"))return;
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
  let channel=null, chatChannel=null, voiceChannel=null, seatedTable=null, actionInFlight=false, autoTurnTimer=null, autoTurnTimerKey=null;
  let voiceEnabled=false, localStream=null;
  let visualTableId=null, visualRound=null, lastVisualBankAmount=null, renderSequence=0, autoTickTimer=null;
  const seenCardKeys=new Set();
  let newCardDealtThisRender=false;
  let pauseKickTimer=null, pausedTableId=null;
  function clearPauseKickTimer(){if(pauseKickTimer)clearTimeout(pauseKickTimer);pauseKickTimer=null;pausedTableId=null;}
  function schedulePauseKick(tableId){
    clearPauseKickTimer();pausedTableId=tableId;
    pauseKickTimer=setTimeout(async()=>{
      if(pausedTableId!==tableId||seatedTable!==tableId)return;
      try{
        const {error}=await window.supabase21Game.rpc("game_kick_paused_player",{p_table_id:tableId});
        if(error)throw error;
        clearPauseKickTimer();
        clearVoiceConnections(true);
        for(const ch of [channel,chatChannel,voiceChannel])if(ch)await window.supabase21Game.removeChannel(ch);
        channel=null;chatChannel=null;voiceChannel=null;voiceChannelReady=false;seatedTable=null;
        $("leaveOnlineTable").classList.add("hidden");$("pauseOnlineTable").classList.add("hidden");$("modal").classList.add("hidden");
        await refreshOccupancy();
        alert("به دلیل ۵ دقیقه عدم حضور، از میز خارج شدید.");
      }catch(e){console.error("Auto kick after pause failed",e);}
    },5*60*1000);
  }
  const peers=new Map(), audioEls=new Map(), pendingIceCandidates=new Map();
  let voiceChannelReady=false, cachedIceServers=null, iceServersExpiresAt=0;
  async function getVoiceIceServers(forceRefresh=false){
    if(!forceRefresh&&cachedIceServers&&iceServersExpiresAt>Date.now()+60_000)return cachedIceServers;
    const {data,error}=await window.supabase21Game.functions.invoke("voice-ice-servers",{
      body:{room:"table-"+seatedTable,initiator_client:window.current21GameUser?.id}
    });
    if(error)throw new Error(error.message||"دریافت اعتبارنامه TURN انجام نشد.");
    const servers=data?.iceServers,expiresAt=Date.parse(data?.expiresAt||"");
    if(!Array.isArray(servers)||!servers.length||!Number.isFinite(expiresAt)||expiresAt<=Date.now()+60_000){
      throw new Error("اعتبارنامه TURN معتبر یا به‌اندازه کافی تازه نیست.");
    }
    cachedIceServers=servers;
    iceServersExpiresAt=expiresAt;
    return cachedIceServers;
  }
  async function syncVoicePeers(){
    if(!voiceEnabled||!seatedTable||!voiceChannelReady)return;
    const {data,error}=await window.supabase21Game.from("table_seats").select("user_id").eq("table_id",seatedTable);
    if(error)throw error;
    const ids=new Set((data||[]).map(row=>row.user_id).filter(id=>id&&id!==window.current21GameUser?.id));
    for(const id of peers.keys())if(!ids.has(id)){closePeer(id);pendingIceCandidates.delete(id);}
    for(const id of ids){
      if(peers.has(id))continue;
      if(window.current21GameUser.id<id)await makePeer(id,true);
      else await sendVoiceSignal(id,{kind:"hello"});
    }
  }
  function clearVoiceConnections(notify=false){
    if(notify)for(const id of peers.keys())sendVoiceSignal(id,{kind:"bye"});
    [...peers.keys()].forEach(closePeer);
    pendingIceCandidates.clear();
    if(localStream)localStream.getTracks().forEach(track=>track.stop());
    localStream=null;voiceEnabled=false;
    const button=$("voiceBtn"),note=$("voiceNote");
    if(button){button.classList.remove("active");button.textContent="🎙 وویس";}
    if(note)note.textContent="وویس خاموش است.";
  }
  async function flushIceCandidates(id,pc){
    const queued=pendingIceCandidates.get(id)||[];
    pendingIceCandidates.delete(id);
    for(const candidate of queued){
      try{await pc.addIceCandidate(candidate);}catch(e){console.warn("ICE candidate:",e);}
    }
  }
  let stakes=[20000,30000,40000,50000,50000,60000,70000,80000,90000,100000];
  let tableStatuses=Array(10).fill("waiting"),tableCapacities=Array(10).fill(6);
  function cash(n){return Number(n||0).toLocaleString("fa-IR");}
  function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");}
  function cardHtml(card,small=false,animate=false,index=0){
    if(!card)return "";
    const red=["♥","♦"].includes(card.suit);
    const motion=animate?' deal-in" style="--deal-delay:'+Math.min(index,5)*75+'ms':'';
    return '<span class="playing-card '+(red?"red":"black")+(small?" mini":"")+motion+'"><span class="rank">'+escapeHtml(card.rank)+'</span><span class="suit">'+escapeHtml(card.suit)+'</span></span>';
  }
  function renderCardList(cards,small,userId,unwrap=false){
    return (cards||[]).map((entry,index)=>{
      const card=unwrap?entry?.card:entry;
      if(!card)return "";
      const key=[visualTableId,visualRound,userId,index,card.rank,card.suit].join(":");
      const animate=!seenCardKeys.has(key);
      seenCardKeys.add(key);
      if(animate)newCardDealtThisRender=true;
      return cardHtml(card,small,animate,index);
    }).join("");
  }
  function animateChipTransfer(fromEl,toEl){
    const table=$("seats")?.closest(".poker-table");
    if(!table||!fromEl||!toEl)return;
    const tableRect=table.getBoundingClientRect();
    const from=fromEl.getBoundingClientRect(),to=toEl.getBoundingClientRect();
    const startX=from.left+from.width/2-tableRect.left-12;
    const startY=from.top+from.height/2-tableRect.top-12;
    const deltaX=to.left+to.width/2-from.left-from.width/2;
    const deltaY=to.top+to.height/2-from.top-from.height/2;
    for(let i=0;i<3;i++){
      const chip=document.createElement("span");
      chip.className="chip-flight-token chip-"+(i%4);
      chip.style.left=(startX+(i-1)*9)+"px";
      chip.style.top=(startY+(i-1)*5)+"px";
      chip.style.setProperty("--flight-x",deltaX+"px");
      chip.style.setProperty("--flight-y",deltaY+"px");
      chip.style.animationDelay=(i*65)+"ms";
      table.appendChild(chip);
      setTimeout(()=>chip.remove(),950);
    }
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
  function scheduleTurnAutoAction(){
    // Auto-play is server-authoritative; a browser timer must never bypass the two-hand limit.
    if(autoTurnTimer)clearTimeout(autoTurnTimer);
    autoTurnTimer=null;
    autoTurnTimerKey=null;
  }
  async function renderLobby(tableIndex){
    const client=window.supabase21Game, tableId=tableIndex+1;
    const sequence=++renderSequence;
    const [seatResult,gameResult]=await Promise.all([
      client.from("table_seats").select("seat_no,user_id,profiles(username,display_name,demo_chips)").eq("table_id",tableId).order("seat_no"),
      client.rpc("game_my_hand",{p_table_id:tableId})
    ]);
    if(seatResult.error)throw seatResult.error;
    if(sequence!==renderSequence||seatedTable!==tableId)return;
    const seats=seatResult.data||[];
    const game=gameResult.data,gameError=gameResult.error;
    const me=window.current21GameUser?.id;
    const nextRound=game?.round_no??"idle";
    if(visualTableId!==tableId||visualRound!==nextRound){
      visualTableId=tableId;visualRound=nextRound;lastVisualBankAmount=null;seenCardKeys.clear();
    }
    newCardDealtThisRender=false;
    $("seats").innerHTML=Array.from({length:6},(_,i)=>{
      const p=seats.find(s=>s.seat_no===i+1);
      if(!p)return '<div class="seat s'+i+'"><div class="avatar">＋</div><div class="name">صندلی خالی</div><div class="tag"></div><div class="cards"></div><div class="seat-balance">—</div></div>';
      const isMe=p.user_id===me, isBanker=!gameError&&game?.banker_user_id===p.user_id;
      const isActive=!gameError&&game?.active_user_id===p.user_id;
      const name=escapeHtml(p.profiles?.display_name||p.profiles?.username||"بازیکن");
      const privateCards=isMe&&!gameError?renderCardList(game?.my_hand||[],true,p.user_id):"";
      const revealedCards=game?.status==="settled"?renderCardList(game?.revealed_hands?.[p.user_id]||[],true,p.user_id):"";
      const isPaused=(game?.paused_users||[]).includes(p.user_id);
      const hiddenBackKey=[tableId,visualRound,p.user_id,"hidden-back"].join(":");
      const animateHiddenBack=!seenCardKeys.has(hiddenBackKey);
      if(game?.status==="playing"&&!isMe&&animateHiddenBack){seenCardKeys.add(hiddenBackKey);newCardDealtThisRender=true;}
      const hiddenBack=game?.status==="playing"&&!isMe?'<span class="card-back playing-card '+(animateHiddenBack?'deal-in':'')+'" style="--deal-delay:'+(i*55)+'ms"></span>':"";
      const shownCards=revealedCards || privateCards || hiddenBack;
      return '<div class="seat s'+i+' '+(isMe?"active ":"")+(isBanker?"banker ":"")+(isActive?"turn-active ":"")+(isPaused?"paused-player ":"")+'"><div class="avatar">'+(isBanker?"👑":"👤")+'</div><div class="name">'+name+'</div><div class="tag">'+(isBanker?"بانکدار":isPaused?"⏸ موقتاً آفلاین":isActive?"◀ نوبت فعلی":isMe?"شما":"بازیکن")+' · صندلی '+p.seat_no+'</div><div class="cards">'+shownCards+'</div><div class="seat-balance">موجودی: '+cash(p.profiles?.demo_chips||0)+' ژتون</div></div>';
    }).join("");
    const statusText=gameError?"خطای دریافت وضعیت بازی: "+gameError.message:(game?.message||"در انتظار شروع بازی");
    $("status").textContent=statusText;
    $("handInfo").innerHTML=gameError?"وضعیت کارت‌ها دریافت نشد.":("آس‌کشی: "+((game?.askechi_cards||[]).map(x=>escapeHtml(x.card?.rank||"")+" "+escapeHtml(x.card?.suit||"")).join("، ")||"—")+" · کارت‌های شما: "+((game?.my_hand||[]).map(x=>cardHtml(x)).join(" ")||"—")+" · امتیاز: "+(game?.my_score||0)+" · ترتیب نوبت: خلاف عقربه ساعت از نفر بعدِ بانکدار");
    if(!gameError&&newCardDealtThisRender&&window.play21Fx)window.play21Fx("card");
    $("cardChoices").innerHTML="";
    $("bankAmount").textContent=cash(game?.bank_amount??stakes[tableIndex]*3);
    const bankAmount=Number(game?.bank_amount??stakes[tableIndex]*3);
    const previousBankAmount=lastVisualBankAmount;
    const bankChanged=previousBankAmount===null||bankAmount!==previousBankAmount;
    const chipCount=Math.max(0,Math.min(12,Math.round(bankAmount/stakes[tableIndex])));
    $("bankChips").innerHTML=chipCount?Array.from({length:chipCount},(_,i)=>'<span class="chip-token chip-'+(i%4)+(bankChanged?' chip-arrive':'')+'" style="--chip-index:'+i+'"></span>').join(""):'<span class="empty-bank">بانک بازی</span>';
    if(bankChanged&&previousBankAmount!==null){
      const activeSeatIndex=Number(seats.find(x=>x.user_id===game?.active_user_id)?.seat_no||0)-1;
      const activeSeat=activeSeatIndex>=0?$("seats").querySelector(".s"+activeSeatIndex+" .avatar"):null;
      const bankEl=$("bankChips");
      if(bankAmount<previousBankAmount)animateChipTransfer(bankEl,activeSeat);
      else animateChipTransfer(activeSeat,bankEl);
      if(window.play21Fx)window.play21Fx("chips");
    }
    lastVisualBankAmount=bankAmount;
    $("tableInfo").textContent="مبلغ پایه: "+cash(stakes[tableIndex])+" ژتون آزمایشی · ظرفیت ۶ نفر · "+seats.length+" بازیکن حاضر";
    const isMyTurn=!!game&&!gameError&&game.status==="playing"&&game.active_user_id===me;
    const isPausedMe=!!me&&(game?.paused_users||[]).includes(me);
    $("drawCardBtn").dataset.action=isPausedMe?"resume":"draw";
    $("drawCardBtn").textContent=isPausedMe?"▶ بازگشت به بازی":"کارت بکش";
    scheduleTurnAutoAction(tableId,gameError?null:game,me,isMyTurn);
    $("startGameBtn").classList.toggle("hidden",!!game&&!gameError&&game.status==="playing");
    $("startGameBtn").textContent=game?.status==="settled"&&game?.banker_user_id&&Number(game?.bank_amount||0)>0&&Number(game?.banker_hands_played||0)<3&&Number(game?.bank_amount||0)<Number(stakes[tableIndex])*9?"ادامه بانکداری":"شروع دست / آس‌کشی";
    $("startGameBtn").disabled=seats.length<2;
    $("drawCardBtn").classList.toggle("hidden",!isMyTurn&&!isPausedMe);
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
  const peerSetupPromises=new Map();
  async function makePeer(id,offerer){
    if(peers.has(id))return peers.get(id);
    if(peerSetupPromises.has(id))return peerSetupPromises.get(id);
    const setup=(async()=>{
      const iceServers=await getVoiceIceServers();
      const pc=new RTCPeerConnection({iceServers,iceCandidatePoolSize:4});
      peers.set(id,pc);
      if(localStream)localStream.getTracks().forEach(track=>pc.addTrack(track,localStream));
      pc.onicecandidate=e=>{if(e.candidate)sendVoiceSignal(id,{kind:"candidate",candidate:e.candidate});};
      pc.ontrack=e=>{
        let audio=audioEls.get(id);
        if(!audio){audio=document.createElement("audio");audio.autoplay=true;audio.playsInline=true;audio.style.display="none";$("chatPanel").appendChild(audio);audioEls.set(id,audio);}
        if(e.streams?.[0])audio.srcObject=e.streams[0];
        audio.muted=false;audio.volume=1;
        audio.play().catch(()=>{$("voiceNote").textContent="برای شنیدن صدای بازیکن، یک‌بار روی صفحه لمس یا کلیک کنید."});
      };
      pc.onconnectionstatechange=()=>{
        if(pc.connectionState==="connected"){
          $("voiceNote").textContent="🎙 اتصال صوتی برقرار است.";
        }else if(pc.connectionState==="connecting"){
          $("voiceNote").textContent="در حال برقراری تماس صوتی...";
        }else if(pc.connectionState==="closed"){
          closePeer(id);
        }else if(pc.connectionState==="failed"&&voiceEnabled){
          $("voiceNote").textContent="ارتباط صوتی قطع شد؛ در حال تلاش برای اتصال مجدد...";
        }
      };
      pc.oniceconnectionstatechange=async()=>{
        if(pc.iceConnectionState!=="failed"||!voiceEnabled||!peers.has(id))return;
        try{
          const freshIceServers=await getVoiceIceServers(true);
          if(!peers.has(id)||pc.signalingState==="closed")return;
          pc.setConfiguration({...pc.getConfiguration(),iceServers:freshIceServers});
          pc.restartIce();
        }catch(error){console.warn("ICE restart could not refresh TURN credentials:",error);}
      };
      pc.onnegotiationneeded=async()=>{
        try{
          if(pc.signalingState!=="stable")return;
          const offer=await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendVoiceSignal(id,{kind:"offer",sdp:pc.localDescription});
        }catch(error){console.warn("Voice renegotiation failed:",error);}
      };
      if(offerer){const offer=await pc.createOffer();await pc.setLocalDescription(offer);await sendVoiceSignal(id,{kind:"offer",sdp:pc.localDescription});}
      return pc;
    })();
    peerSetupPromises.set(id,setup);
    try{return await setup;}finally{if(peerSetupPromises.get(id)===setup)peerSetupPromises.delete(id);}
  }
  async function handleVoiceSignal(payload){
    const me=window.current21GameUser?.id;if(!payload||payload.to!==me||payload.from===me)return;
    const from=payload.from;
    try{
      if(payload.kind==="hello"){
        if(voiceEnabled&&me<from)await makePeer(from,true);
      }else if(payload.kind==="offer"&&voiceEnabled){
        const pc=await makePeer(from,false);
        if(pc.signalingState!=="stable")await pc.setLocalDescription({type:"rollback"});
        await pc.setRemoteDescription(payload.sdp);
        await flushIceCandidates(from,pc);
        const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
        await sendVoiceSignal(from,{kind:"answer",sdp:pc.localDescription});
      }else if(payload.kind==="answer"&&peers.has(from)){
        const pc=peers.get(from);
        await pc.setRemoteDescription(payload.sdp);
        await flushIceCandidates(from,pc);
      }else if(payload.kind==="candidate"&&payload.candidate){
        const pc=peers.get(from);
        if(pc?.remoteDescription)await pc.addIceCandidate(payload.candidate);
        else pendingIceCandidates.set(from,[...(pendingIceCandidates.get(from)||[]),payload.candidate]);
      }else if(payload.kind==="bye"){closePeer(from);pendingIceCandidates.delete(from);}
    }catch(e){console.warn("voice signaling:",e);}
  }
  async function toggleVoice(){
    if(voiceEnabled){
      voiceEnabled=false;
      clearVoiceConnections(true);
      return;
    }
    if(!seatedTable){alert("ابتدا وارد یک میز شوید.");return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){alert("مرورگر شما تماس صوتی را پشتیبانی نمی‌کند.");return;}
    if(!voiceChannelReady){alert("اتصال صوتی میز هنوز آماده نیست؛ چند لحظه صبر کنید و دوباره بزنید.");return;}
    try{
      $("voiceNote").textContent="در حال آماده‌سازی سرور تماس...";
      await getVoiceIceServers();
      localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});voiceEnabled=true;
      $("voiceBtn").classList.add("active");$("voiceBtn").textContent="🎙 قطع وویس";
      $("voiceNote").textContent="میکروفون فعال شد؛ در انتظار اتصال بازیکنان دیگر...";
      await syncVoicePeers();
      if(!peers.size)$("voiceNote").textContent="میکروفون روشن است؛ منتظر فعال شدن وویس بازیکنان دیگر هستیم.";
    }catch(e){clearVoiceConnections(false);$("voiceNote").textContent="راه‌اندازی TURN ناموفق بود؛ تنظیمات سرور تماس را بررسی کنید.";alert("فعال‌سازی تماس صوتی انجام نشد: "+(e.message||e));}
  }
  async function setupTableChannels(tableId,i){
    const client=window.supabase21Game;
    if(channel)await client.removeChannel(channel);
    if(chatChannel)await client.removeChannel(chatChannel);
    if(voiceChannel)await client.removeChannel(voiceChannel);
    voiceChannelReady=false;
    channel=client.channel("table-seats-"+tableId)
      .on("postgres_changes",{event:"*",schema:"public",table:"table_seats",filter:"table_id=eq."+tableId},()=>{renderLobby(i).catch(console.error);refreshOccupancy();if(voiceEnabled)syncVoicePeers().catch(e=>console.warn("voice peer sync:",e));})
      .on("postgres_changes",{event:"*",schema:"public",table:"table_public_state",filter:"table_id=eq."+tableId},()=>renderLobby(i).catch(console.error))
      .subscribe();
    if(autoTickTimer)clearInterval(autoTickTimer);
    autoTickTimer=setInterval(async()=>{
      if(seatedTable!==tableId)return;
      try{
        const {data,error}=await client.rpc("game_auto_advance",{p_table_id:tableId});
        if(error)console.warn("auto turn tick:",error.message);
        if(data?.advanced)await renderLobby(i);
      }catch(e){console.warn("auto turn tick failed",e);}
    },3000);
    chatChannel=client.channel("table-chat-"+tableId)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"table_chat",filter:"table_id=eq."+tableId},payload=>{if(payload.new?.user_id!==window.current21GameUser?.id&&$("chatPanel").classList.contains("hidden")){$("chatUnreadDot").classList.remove("hidden");hasUnreadChat=true;}loadChat();}).subscribe();
    voiceChannel=client.channel("voice-table-"+tableId,{config:{private:true,broadcast:{self:false,ack:true}}}).on("broadcast",{event:"signal"},({payload})=>handleVoiceSignal(payload));
    await new Promise(resolve=>{let done=false;voiceChannel.subscribe(status=>{
      if(status==="SUBSCRIBED"){voiceChannelReady=true;if(!done){done=true;resolve();}}
      if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){voiceChannelReady=false;if(!done){done=true;resolve();}$("voiceNote").textContent="خطای اتصال وویس؛ ارتباط Realtime سوپابیس برقرار نشد.";}
      if(status==="CLOSED")voiceChannelReady=false;
    });});
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
      clearPauseKickTimer();const resumed=await client.rpc("game_action",{p_table_id:i+1,p_action:"resume"});if(resumed.error)throw resumed.error;
      seatedTable=i+1;
      $("modalTitle").textContent="میز "+(i+1);$("modal").classList.remove("hidden");
      $("leaveOnlineTable").classList.remove("hidden");$("pauseOnlineTable").classList.remove("hidden");
      await setupTableChannels(seatedTable,i);await renderLobby(i);
    }catch(e){alert("ورود به میز انجام نشد: "+(e.message||e));}
  }
  async function sendGameAction(action){
    const client=window.supabase21Game;if(!client||!seatedTable||actionInFlight)return;
    actionInFlight=true;
    if(window.unlock21Audio)window.unlock21Audio();
    const actionButtons=["startGameBtn","drawCardBtn","standBtn","closeBankBtn"];
    actionButtons.forEach(id=>{const el=$(id);if(el)el.disabled=true;});
    try{
      const tableAtStart=seatedTable;
      const {data,error}=await client.rpc("game_action",{p_table_id:tableAtStart,p_action:action});
      if(error)throw error;
      if(seatedTable===tableAtStart){
        if(data?.message)$("status").textContent=data.message;
        renderLobby(tableAtStart-1).catch(console.error);
      }
      if(window.refresh21GameProfile)window.refresh21GameProfile().catch(console.warn);
      if(action==="pause"){schedulePauseKick(tableAtStart);$("modal").classList.add("hidden");}
    }catch(e){alert("خطای بازی: "+(e.message||e));}
    finally{actionInFlight=false;actionButtons.forEach(id=>{const el=$(id);if(el)el.disabled=false;});}
  }
  async function leaveOnlineTable(){
    const client=window.supabase21Game,user=window.current21GameUser;if(!client||!user||!seatedTable)return;
    const tableId=seatedTable;
    clearPauseKickTimer();
    if(voiceEnabled)clearVoiceConnections(true);
    const {error}=await client.rpc("game_leave_table",{p_table_id:tableId});
    if(error){alert("ترک میز انجام نشد: "+error.message);return;}
    for(const ch of [channel,chatChannel,voiceChannel])if(ch)await client.removeChannel(ch);
    if(autoTickTimer)clearInterval(autoTickTimer);autoTickTimer=null;
    channel=null;chatChannel=null;voiceChannel=null;voiceChannelReady=false;seatedTable=null;
    $("leaveOnlineTable").classList.add("hidden");$("pauseOnlineTable").classList.add("hidden");$("modal").classList.add("hidden");
  }
  window.addEventListener("DOMContentLoaded",()=>{
    window.joinTable=joinOnlineTable;
    $("leaveOnlineTable").addEventListener("click",leaveOnlineTable);
    $("startGameBtn").addEventListener("click",()=>sendGameAction("start"));
    $("drawCardBtn").addEventListener("click",()=>sendGameAction($("drawCardBtn").dataset.action||"draw"));
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
    document.addEventListener("pointerdown",()=>{for(const audio of audioEls.values())if(audio.srcObject)audio.play().catch(()=>{});},{passive:true});
    window.addEventListener("21game:authenticated",refreshOccupancy);
    const client=window.supabase21Game;
    if(client){refreshOccupancy();client.channel("lobby-occupancy").on("postgres_changes",{event:"*",schema:"public",table:"table_seats"},refreshOccupancy).subscribe();}
    $("closeModal").addEventListener("click",()=>{if(seatedTable)$("modal").classList.add("hidden");});
  });
})();