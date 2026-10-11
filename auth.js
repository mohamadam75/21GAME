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
  async function adminPanel(){if(profile?.role!=="admin")return;window.open21GameAccountModal("پنل مدیریت — درخواست‌های ژتون","<p>در حال بارگذاری...</p>");const r=await client.from("wallet_requests").select("id,user_id,request_type,amount,method,reference,status").eq("status","pending").order("created_at",{ascending:true}).limit(100);if(r.error){$("accountBody").textContent="خطا: "+r.error.message;return;}if(!r.data.length){$("accountBody").innerHTML="<p>درخواستی در انتظار بررسی نیست.</p>";return;} const userIds=[...new Set(r.data.map(x=>x.user_id))];const pr=await client.from("profiles").select("id,username,display_name").in("id",userIds);if(pr.error){$("accountBody").textContent="خطا در دریافت اطلاعات کاربران: "+pr.error.message;return;}const byId=Object.fromEntries((pr.data||[]).map(p=>[p.id,p]));r.data.forEach(x=>{x.profiles=byId[x.user_id]||null;}); $("accountBody").innerHTML=r.data.map(x=>'<article style="padding:12px;margin:10px 0;background:#0f1724;border-radius:12px"><strong>'+esc(x.profiles?.display_name||x.profiles?.username||"کاربر")+'</strong><p>'+(x.request_type==="chip_topup"?"شارژ ژتون":"برداشت ژتون")+' · '+Number(x.amount).toLocaleString("fa-IR")+' ژتون</p><p>روش: '+esc(x.method)+' · توضیح: '+esc(x.reference||"—")+'</p><button data-review="'+x.id+'" data-approve="true">تأیید</button> <button data-review="'+x.id+'" data-approve="false">رد درخواست</button></article>').join("");$("accountBody").querySelectorAll("[data-review]").forEach(b=>b.onclick=async()=>{b.disabled=true;const z=await client.rpc("admin_review_wallet_request",{p_request_id:b.dataset.review,p_approve:b.dataset.approve==="true",p_note:"بررسی از پنل مدیر"});if(z.error){alert("انجام نشد: "+z.error.message);b.disabled=false;return;}await adminPanel();await refreshProfile();});}
  async function init(){const url=window.SUPABASE_URL,key=window.SUPABASE_ANON_KEY;if(!window.supabase||!url||!key||url.includes("YOUR_SUPABASE")||key.includes("YOUR_SUPABASE")){status("تنظیم Supabase هنوز انجام نشده است. فایل SUPABASE_SETUP.md را دنبال کنید.",true);return;}client=window.supabase.createClient(url,key);window.supabase21Game=client;const r=await client.auth.getSession();if(r.error){status(r.error.message,true);return;}if(r.data.session){try{await loadProfile(r.data.session.user);}catch(e){status("پروفایل پیدا نشد. schema.sql را در Supabase اجرا کنید.",true);}}client.auth.onAuthStateChange(async(_ev,s)=>{if(s&&!window.current21GameUser){try{await loadProfile(s.user);}catch(e){status(e.message,true);}}});}
  window.open21GameAccountModal=(title,body)=>{$("accountTitle").textContent=title;$("accountBody").innerHTML=body;$("accountModal").classList.remove("hidden");};
  window.addEventListener("DOMContentLoaded",()=>{$("authForm").addEventListener("submit",submitAuth);$("authModeToggle").addEventListener("click",()=>setMode(!isSignup));$("signOutBtn").addEventListener("click",async()=>{if(client)await client.auth.signOut();profile=null;window.current21GameUser=null;$("signedInName").textContent="مهمان";$("signOutBtn").classList.add("hidden");$("adminPanelBtn").classList.add("hidden");setWallet(0);$("authGate").classList.remove("auth-hidden");setMode(false);});$("chipRequestBtn").addEventListener("click",()=>requestForm("chip_topup"));$("withdrawBtn").addEventListener("click",()=>requestForm("withdrawal"));$("adminPanelBtn").addEventListener("click",adminPanel);$("balanceBtn").addEventListener("click",()=>requestForm("chip_topup"));init();});
})();
/* Live seating lobby: shared seats are synchronized through Supabase Realtime. Card actions remain disabled until the trusted game function is deployed. */
(function(){
  const $=id=>document.getElementById(id);
  let channel=null, seatedTable=null;
  const stakes=[20000,30000,40000,50000,50000,60000,70000,80000,90000,100000];
  function cash(n){return Number(n||0).toLocaleString("fa-IR");}
  async function refreshOccupancy(){
    const client=window.supabase21Game;
    if(!client)return;
    const {data,error}=await client.from("table_seats").select("table_id");
    if(error)return;
    const counts=Array(10).fill(0);
    (data||[]).forEach(row=>{const i=Number(row.table_id)-1;if(i>=0&&i<counts.length)counts[i]++;});
    counts.forEach((n,i)=>{const el=$("onlineCount"+i);if(el)el.textContent="آنلاین: "+cash(n)+" نفر";});
  }
  async function renderLobby(tableIndex){
    const client=window.supabase21Game;
    const tableId=tableIndex+1;
    const {data,error}=await client.from("table_seats").select("seat_no,user_id,profiles(username,display_name)").eq("table_id",tableId).order("seat_no");
    if(error)throw error;
    const seats=data||[];
    $("seats").innerHTML=Array.from({length:6},(_,i)=>{
      const p=seats.find(s=>s.seat_no===i+1);
      const name=p?(p.profiles?.display_name||p.profiles?.username||"بازیکن"):"صندلی خالی";
      const isMe=p&&p.user_id===window.current21GameUser?.id;
      return '<div class="seat s'+i+' '+(isMe?"active":"")+'"><div class="avatar">'+(p?"👤":"＋")+'</div><div class="name">'+name.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")+'</div><div class="tag">'+(isMe?"شما":p?"بازیکن":"")+'</div><div class="cards">'+(p?"● ● ●":"")+'</div></div>';
    }).join("");
    const {data:game,error:gameError}=await client.rpc("game_my_hand",{p_table_id:tableId});
    const statusText=gameError?"موتور بازی هنوز نصب نشده است؛ مدیر باید فایل supabase/game_engine.sql را در SQL Editor اجرا کند.":(game?.message||"در انتظار شروع بازی");
    $("status").textContent=statusText;
    $("handInfo").textContent=gameError?"برای پخش کارت، ابتدا نصب موتور بازی در Supabase لازم است.":("کارت‌های شما: "+(game?.my_hand||[]).map(c=>c.rank+c.suit).join("  ")+" · امتیاز: "+(game?.my_score||0));
    $("cardChoices").innerHTML="";
    $("bankAmount").textContent=cash(game?.bank_amount||stakes[tableIndex]*3);
    $("bankChips").innerHTML='<span class="empty-bank">'+(game?.status==="playing"?"بانک بازی":"لابی آنلاین")+'</span>';
    $("tableInfo").textContent="مبلغ پایه: "+cash(stakes[tableIndex])+" ژتون آزمایشی · ظرفیت ۶ نفر · "+seats.length+" بازیکن حاضر";
    const me=window.current21GameUser?.id;
    const isMyTurn=!!game&&!gameError&&game.status==="playing"&&game.active_user_id===me;
    $("startGameBtn").classList.toggle("hidden",!!game&&!gameError&&game.status==="playing");
    $("startGameBtn").disabled=seats.length<2;
    $("drawCardBtn").classList.toggle("hidden",!isMyTurn);
    $("standBtn").style.display=isMyTurn?"inline-block":"none";
    $("closeBankBtn").style.display=isMyTurn&&game?.is_banker?"inline-block":"none";
    $("nextPlayerBtn").style.display="none";
    $("nextRoundBtn").style.display="none";
  }
  async function joinOnlineTable(i){
    const client=window.supabase21Game, user=window.current21GameUser;
    if(!client||!user){alert("برای ورود به میز ابتدا وارد حساب شوید.");return;}
    const stake=stakes[i];
    if(Number(user.demo_chips||0)<stake*4){alert("برای این میز حداقل "+cash(stake*4)+" ژتون آزمایشی لازم است. از منو درخواست شارژ ژتون بدهید.");return;}
    try{
      const {data:existing,error:existingErr}=await client.from("table_seats").select("table_id,seat_no").eq("user_id",user.id);
      if(existingErr)throw existingErr;
      if(existing?.length && existing[0].table_id!==i+1){alert("شما هم‌اکنون روی میز دیگری نشسته‌اید. ابتدا آن میز را ترک کنید.");return;}
      if(!existing?.length){
        const {data:occupied,error}=await client.from("table_seats").select("seat_no").eq("table_id",i+1);
        if(error)throw error;
        const used=new Set((occupied||[]).map(x=>x.seat_no));
        let seatNo=1;while(used.has(seatNo)&&seatNo<=6)seatNo++;
        if(seatNo>6){alert("این میز پر است. میز دیگری انتخاب کنید.");return;}
        const {error:insertErr}=await client.from("table_seats").insert({table_id:i+1,user_id:user.id,seat_no:seatNo});
        if(insertErr)throw insertErr;
      }
      seatedTable=i+1;
      if(channel){await client.removeChannel(channel);channel=null;}
      channel=client.channel("table-seats-"+seatedTable)
        .on("postgres_changes",{event:"*",schema:"public",table:"table_seats",filter:"table_id=eq."+seatedTable},()=>renderLobby(i).catch(console.error))
        .subscribe();
      $("modalTitle").textContent="میز "+(i+1);
      $("modal").classList.remove("hidden");
      $("leaveOnlineTable").classList.remove("hidden");
      $("pauseOnlineTable").classList.remove("hidden");
      await renderLobby(i);
    }catch(e){alert("ورود به میز انجام نشد: "+(e.message||e));}
  }
  async function sendGameAction(action){
    const client=window.supabase21Game;
    if(!client||!seatedTable)return;
    const {data,error}=await client.rpc("game_action",{p_table_id:seatedTable,p_action:action});
    if(error){alert("خطای بازی: "+error.message);return;}
    const i=seatedTable-1;
    await renderLobby(i);
    if(data?.message)$("status").textContent=data.message;
    if(action==="pause")$("modal").classList.add("hidden");
  }
  async function leaveOnlineTable(){
    const client=window.supabase21Game,user=window.current21GameUser;
    if(!client||!user||!seatedTable)return;
    const tableId=seatedTable;
    const {error}=await client.from("table_seats").delete().eq("table_id",tableId).eq("user_id",user.id);
    if(error){alert("ترک میز انجام نشد: "+error.message);return;}
    if(channel){await client.removeChannel(channel);channel=null;}
    seatedTable=null;$("leaveOnlineTable").classList.add("hidden");$("pauseOnlineTable").classList.add("hidden");$("modal").classList.add("hidden");
  }
  window.addEventListener("DOMContentLoaded",()=>{
    window.joinTable=joinOnlineTable;
    $("leaveOnlineTable").addEventListener("click",leaveOnlineTable);
    $("startGameBtn").addEventListener("click",()=>sendGameAction("start"));
    $("drawCardBtn").addEventListener("click",()=>sendGameAction("draw"));
    $("standBtn").addEventListener("click",()=>sendGameAction("stand"));
    $("closeBankBtn").addEventListener("click",()=>sendGameAction("close"));
    $("pauseOnlineTable").addEventListener("click",()=>sendGameAction("pause").then(()=>$("modal").classList.add("hidden")));
    window.addEventListener("21game:authenticated",refreshOccupancy);
    const lobbyClient=window.supabase21Game;
    if(lobbyClient){refreshOccupancy();lobbyClient.channel("lobby-occupancy").on("postgres_changes",{event:"*",schema:"public",table:"table_seats"},refreshOccupancy).subscribe();}
    $("closeModal").addEventListener("click",()=>{if(seatedTable)$("modal").classList.add("hidden");});
  });
})();
