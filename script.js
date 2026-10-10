const RULES = {
  values: { "6":6, "7":7, "8":8, "9":9, "10":10, "J":2, "Q":3, "K":4, "A":11 },
  tieGoesTo: "BANKER"
};

function score(hand) {
  return hand.reduce((s, c) => s + RULES.values[c], 0);
}

function isSpecialWin(hand) {
  if (hand.length === 2 && hand.filter(c => c === "A").length === 2) return true;
  if (hand.length === 2 && hand.includes("A") && hand.includes("10")) return true;
  if (hand.length === 5 && score(hand) === 21) return true;
  return false;
}

const tables = [20000, 30000, 40000, 50000, 50000, 60000, 70000, 80000, 90000, 100000];
let wallet = 1000000, currentTable = null, bank = 0, banker = 0, bankRound = 1, players = [], deck = [], activePlayer = 1, tableCapacity = 6;
let bankerHand = [], playerHand = [], playerDone = false, bankerTurn = false, askechi = true, dealTimer = null, battleSettled = false, bankerDrewThisHand = false;
let soundEnabled = true;
let battleMessage = "";
let roundEnded = false;
let pendingBankerFunding = false;

const names = ["بازیکن ۱", "بازیکن ۲", "بازیکن ۳", "بازیکن ۴", "بازیکن ۵", "بازیکن ۶"];
const $ = id => document.getElementById(id);
const money = n => n.toLocaleString("fa-IR");

// ===== Sound =====
function playCardSound() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
}

// ===== Cards (Clear CSS-based) =====
const suits = ["♠", "♥", "♦", "♣"];
function cardVisual(c) {
  const suit = suits[Math.floor(Math.random() * 4)]; // visual only
  const isRed = suit === "♥" || suit === "♦";
  return `<span class="playing-card ${isRed ? "red" : "black"}" title="${c}">
    <span class="rank">${c}</span>
    <span class="suit">${suit}</span>
  </span>`;
}
function cardsText(hand) {
  return hand.map(cardVisual).join("");
}
function cardBack() {
  return `<span class="playing-card card-back"></span>`;
}
function hiddenCards(count) {
  return Array.from({ length: Math.max(1, count) }, () => cardBack()).join("");
}

// ===== Deck =====
const fullDeck = () => {
  const a = [];
  for (let s = 0; s < 4; s++)
    for (const c of ["6", "7", "8", "9", "10", "J", "Q", "K", "A"]) a.push(c);
  return a;
};
function shuffle() {
  deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}
function draw() {
  if (deck.length === 0) shuffle();
  playCardSound();
  return deck.pop();
}

// ===== Tables =====
function renderTables() {
  $("tables").innerHTML = tables.map((base, i) => {
    const ok = wallet >= base * 4;
    return `<article class="table-card">
      <h3>میز ${i + 1}</h3>
      <div class="amount">${money(base)} تومان</div>
      <div class="meta">حداقل موجودی: ${money(base * 4)} تومان<br>ظرفیت: ۲ تا ۶ نفر</div>
      <button class="join" ${ok ? "" : "disabled"} onclick="joinTable(${i})">${ok ? "ورود به میز" : "موجودی کافی نیست"}</button>
    </article>`;
  }).join("");
  $("wallet").textContent = money(wallet);
}

function joinTable(i) {
  const entered = window.prompt("تعداد بازیکنان این میز را انتخاب کنید (۲ تا ۶):", "6");
  if (entered === null) return;
  const capacity = Number(entered);
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 6) {
    window.alert("تعداد بازیکنان باید عددی بین ۲ تا ۶ باشد.");
    return;
  }
  tableCapacity = capacity;
  currentTable = i;
  battleMessage = "";
  roundEnded = false;
  bank = tables[i] * 3;
  bankRound = 1;
  players = names.slice(0, tableCapacity).map(name => ({ name, hand: [], done: false, balance: 1000000 }));
  banker = null;
  activePlayer = 0;
  shuffle();
  $("modalTitle").textContent = `میز ${i + 1}`;
  $("tableInfo").textContent = `مبلغ پایه: ${money(tables[i])} تومان | بانک اولیه: ${money(bank)} تومان`;
  $("modal").classList.remove("hidden");
  startAskechi();
}

// ===== Askechi =====
function startAskechi() {
  askechi = true;
  banker = null;
  bankerHand = [];
  playerHand = [];
  players.forEach(p => p.hand = []);
  shuffle();
  const start = Math.floor(Math.random() * players.length);
  activePlayer = start;
  renderAskechi(start);
  dealAskechi(start);
}

function renderAskechi(current) {
  $("bankAmount").textContent = money(bank);
  $("status").textContent = "آس‌کشی";
  $("handInfo").innerHTML = "";
  $("cardChoices").innerHTML = "";
  $("standBtn").style.display = "none";
  $("closeBankBtn").style.display = "none";
  $("nextRoundBtn").style.display = "none";
  $("nextPlayerBtn").style.display = "none";
  $("seats").innerHTML = players.map((p, i) => `
    <div class="seat s${i} ${i === current ? "active" : ""}">
      <div class="avatar">👤</div>
      <div class="name">${p.name}</div>
      <div class="tag">${i === current ? "نوبت آس‌کشی" : ""}</div>
      <div class="cards">${p.hand.length ? cardsText(p.hand) : "—"}</div>
    </div>`).join("");
}

function dealAskechi(index) {
  clearTimeout(dealTimer);
  dealTimer = setTimeout(() => {
    const c = draw();
    players[index].hand.push(c);
    renderAskechi(index);
    if (c === "A") {
      banker = index;
      players[banker].balance -= tables[currentTable] * 3;
      dealTimer = setTimeout(() => {
        askechi = false;
        activePlayer = (banker + 1) % players.length;
        $("standBtn").style.display = "block";
        $("nextRoundBtn").style.display = "none";
        $("tableInfo").textContent = `مبلغ پایه: ${money(tables[currentTable])} تومان | بانکدار: ${players[banker].name} | دور بانکداری: ۱ از ۳`;
        startBankingRound();
      }, 900);
      return;
    }
    dealAskechi((index + 1) % players.length);
  }, 800);
}

// ===== Banking Round =====
function startBankingRound() {
  roundEnded = false;
  battleMessage = "";
  $("nextRoundBtn").style.display = "none";
  $("nextPlayerBtn").style.display = "none";
  shuffle();
  players.forEach(p => { p.hand = []; p.done = false; });
  playerHand = [];
  playerDone = false;
  bankerTurn = false;
  battleSettled = false;
  bankerDrewThisHand = false;
  activePlayer = (banker + 1) % players.length;

  for (let i = 0; i < players.length; i++) {
    const idx = (banker + 1 + i) % players.length;
    players[idx].hand.push(draw());
  }
  bankerHand = [draw()];
  render();
  beginPlayer();
}

function beginPlayer() {
  if (roundEnded) return;
  const base = tables[currentTable];
  if (bank < base) {
    endBankRound();
    return;
  }
  if (activePlayer === banker) {
    nextPlayer();
    return;
  }
  if (players[activePlayer].balance < base) {
    players[activePlayer].done = true;
    nextPlayer();
    return;
  }
  players[activePlayer].balance -= base;
  playerHand = [...players[activePlayer].hand];
  playerDone = false;
  bankerTurn = false;
  battleSettled = false;
  render();
  if (score(playerHand) >= 21) finishPlayer();
}

function render() {
  if (askechi) return;
  $("bankAmount").textContent = money(bank);
  const base = tables[currentTable];
  const chipCount = Math.max(0, Math.min(12, Math.round(bank / base)));
  $("bankChips").innerHTML = chipCount
    ? Array.from({ length: chipCount }, (_, i) => `<span class="chip-token chip-${i % 4}" style="--chip-index:${i}" aria-hidden="true"></span>`).join("")
    : '<span class="empty-bank">—</span>';
  $("status").textContent = battleMessage || (roundEnded ? "دور بانکداری تمام شد" : (battleSettled ? "نتیجه ثبت شد" : (bankerTurn ? "نوبت بانکدار" : `نوبت ${players[activePlayer].name}`)));
  $("standBtn").style.display = bankerTurn || battleSettled || roundEnded ? "none" : "block";
  $("closeBankBtn").style.display = bankerTurn && !battleSettled && !roundEnded ? "block" : "none";
  $("nextPlayerBtn").style.display = battleSettled && !roundEnded ? "block" : "none";

  $("seats").innerHTML = players.map((p, i) => `
    <div class="seat s${i} ${i === banker ? "banker" : ""} ${i === activePlayer && !bankerTurn ? "active" : ""}">
      <div class="avatar">${i === banker ? "👑" : "👤"}</div>
      <div class="name">${p.name}</div>
      <div class="tag">${i === banker ? "بانکدار" : ""}</div>
      <div class="cards">${
        i === banker
          ? (bankerTurn ? cardsText(bankerHand) : hiddenCards(bankerHand.length))
          : i === activePlayer
            ? (bankerTurn ? hiddenCards(playerHand.length) : cardsText(playerHand))
            : hiddenCards(p.hand.length)
      }</div>
      <div class="seat-balance">موجودی: ${money(p.balance)} تومان</div>
    </div>`).join("");

  $("handInfo").innerHTML = bankerTurn
    ? `دست شما (بانکدار): <strong>${cardsText(bankerHand)}</strong> — ${score(bankerHand)} <span class="privacy-note">دست بازیکن مخفی است</span>`
    : `دست شما (بازیکن): <strong>${cardsText(playerHand)}</strong> — ${score(playerHand)} <span class="privacy-note">دست بانکدار مخفی است</span>`;

  renderChoices();
}

function renderChoices() {
  const box = $("cardChoices");
  box.innerHTML = "";
  if (bankerTurn) {
    const takeCard = document.createElement("button");
    takeCard.textContent = "کارت بانکدار";
    takeCard.onclick = bankDraw;
    box.appendChild(takeCard);
    const closeHand = document.createElement("button");
    closeHand.textContent = "بسته";
    closeHand.onclick = () => finishBattle();
    box.appendChild(closeHand);
    return;
  }
  for (let n = 1; n <= 4; n++) {
    const b = document.createElement("button");
    b.textContent = `${n} کارت`;
    b.onclick = () => requestCards(n);
    box.appendChild(b);
  }
}

function requestCards(n) {
  if (roundEnded || battleSettled || bankerTurn || playerDone) return;
  for (let i = 0; i < n; i++) {
    playerHand.push(draw());
    if (score(playerHand) > 21) break;
  }
  players[activePlayer].hand = [...playerHand];
  render();
  if (score(playerHand) > 21 || score(playerHand) === 21) finishPlayer();
}

function stand() {
  if (roundEnded || battleSettled || bankerTurn || playerDone) return;
  playerDone = true;
  players[activePlayer].hand = [...playerHand];
  bankerPlay();
}

function finishPlayer() {
  if (playerDone) return;
  playerDone = true;
  players[activePlayer].hand = [...playerHand];
  const ps = score(playerHand);
  if (ps >= 21) {
    finishBattle(ps === 21 ? "player21" : "playerBust");
    return;
  }
  bankerPlay();
}

function bankerPlay() {
  bankerTurn = true;
  render();
  const bs = score(bankerHand);
  const ps = score(playerHand);
  if (ps > 21) {
    finishBattle("playerBust");
    return;
  }
  if (bs > 21 || bs >= 20) {
    finishBattle();
    return;
  }
  // Auto handled in renderChoices
}

function bankDraw() {
  if (!bankerTurn || battleSettled) return;
  bankerHand.push(draw());
  bankerDrewThisHand = true;
  render();
  if (score(bankerHand) > 21 || score(bankerHand) >= 20) {
    finishBattle();
    return;
  }
  render();
}

function finishBattle(reason = "normal") {
  if (battleSettled || roundEnded) return;
  battleSettled = true;
  const base = tables[currentTable];
  const ps = score(playerHand);
  const bs = score(bankerHand);
  const playerSpecial = isSpecialWin(playerHand);
  const bankerSpecial = isSpecialWin(bankerHand);

  let playerWins = false;
  if (playerSpecial) playerWins = true;
  else if (bankerSpecial) playerWins = false;
  else if (reason === "player21") playerWins = true;
  else if (reason === "playerBust") playerWins = false;
  else if (ps > 21) playerWins = false;
  else if (bs > 21) playerWins = true;
  else if (ps === bs) playerWins = RULES.tieGoesTo !== "BANKER";
  else playerWins = ps > bs;

  if (playerWins) {
    // A battle may only be settled as a player win when the bank can cover the stake.
    if (bank < base) {
      battleMessage = "موجودی بانک برای پرداخت این دست کافی نیست";
      roundEnded = true;
      players[activePlayer].hand = [];
      playerHand = [];
      $("cardChoices").innerHTML = "";
      $("nextRoundBtn").style.display = "none";
      render();
      return;
    }
    bank -= base;
    players[activePlayer].balance += base * 2;
    battleMessage = `${players[activePlayer].name} برنده شد • ${money(base)} تومان از بانک گرفت`;
  } else {
    bank += base;
    battleMessage = `بانکدار برنده شد • ${money(base)} تومان به بانک اضافه شد`;
  }

  players[activePlayer].hand = [];
  playerHand = [];
  if (bankerDrewThisHand) bankerHand = [];

  if (bank <= 0 || bank >= base * 9) {
    endBankRound();
    render();
    return;
  }
  render();
  // حرکت به نفر بعد فقط با فشردن دکمه توسط بانکدار/کاربر انجام می‌شود.
}

function nextPlayer() {
  if (roundEnded || !battleSettled) return;
  $("nextPlayerBtn").style.display = "none";
  battleMessage = "";
  let next = (activePlayer + 1) % players.length;
  if (next === banker) next = (next + 1) % players.length;
  if (next === banker) {
    endBankRound();
    return;
  }
  activePlayer = next;
  playerHand = [];
  playerDone = false;
  bankerTurn = false;
  battleSettled = false;
  bankerDrewThisHand = false;
  if (bankerHand.length === 0) bankerHand = [draw()];
  render();
  setTimeout(beginPlayer, 300);
}

function endBankRound() {
  roundEnded = true;
  battleMessage = "";
  $("cardChoices").innerHTML = "";
  const base = tables[currentTable];
  const canContinue = bank >= base && bank < base * 9 && bankRound < 3;
  if (canContinue) {
    $("status").textContent = "دور تمام شد — برای ادامه، شروع دور بعد را بزنید";
    $("nextRoundBtn").style.display = "block";
    return;
  }

  // بانک باقی‌مانده به بانکدار قبلی برمی‌گردد؛ نوبت بانکداری بدون رد کردن نفر بعدی می‌چرخد.
  if (banker !== null && players[banker]) players[banker].balance += Math.max(0, bank);
  const previousBanker = banker ?? 0;
  const nextBanker = (previousBanker + 1) % players.length;
  bank = 0;
  banker = nextBanker;
  bankRound = 1;
  $("nextRoundBtn").style.display = "none";

  if (players[banker].balance < base * 3) {
    roundEnded = true;
    pendingBankerFunding = true;
    $("status").textContent = "موجودی بانکدار بعدی کافی نیست";
    render();
    showBankerFundingError();
    return;
  }

  players[banker].balance -= base * 3;
  bank = base * 3;
  roundEnded = false;
  pendingBankerFunding = false;
  $("tableInfo").textContent = `مبلغ پایه: ${money(base)} تومان | بانکدار جدید: ${players[banker].name} | دور بانکداری: ۱ از ۳`;
  startBankingRound();
}

function showBankerFundingError() {
  const base = tables[currentTable];
  const missing = Math.max(0, base * 3 - players[banker].balance);
  accountModal("موجودی بانکدار کافی نیست", `
    <p>نوبت بانکداری به <strong>${players[banker].name}</strong> رسیده، اما موجودی او برای شروع بانکداری کافی نیست.</p>
    <p>موجودی لازم: <strong>${money(base * 3)} تومان</strong></p>
    <p>کسری موجودی: <strong>${money(missing)} تومان</strong></p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
      <button onclick="leaveTableDueToFunds()">ترک میز</button>
      <button onclick="openBankerTopUp()">افزایش موجودی</button>
    </div>`);
}

function leaveTableDueToFunds() {
  pendingBankerFunding = false;
  closeAccount();
  $("modal").classList.add("hidden");
  currentTable = null;
  renderTables();
}

function openBankerTopUp() {
  showBalance();
  const note = document.createElement("p");
  note.textContent = "پس از شارژ حساب، موجودی بانکدار را دوباره بررسی کنید.";
  $("accountBody").appendChild(note);
  const retry = document.createElement("button");
  retry.textContent = "بررسی مجدد و ادامه بازی";
  retry.style.marginTop = "12px";
  retry.onclick = retryBankerFunding;
  $("accountBody").appendChild(retry);
}

function retryBankerFunding() {
  if (!pendingBankerFunding || currentTable === null || !players[banker]) return;
  const base = tables[currentTable];
  if (players[banker].balance < base * 3) {
    showBankerFundingError();
    return;
  }
  closeAccount();
  players[banker].balance -= base * 3;
  bank = base * 3;
  bankRound = 1;
  pendingBankerFunding = false;
  roundEnded = false;
  $("tableInfo").textContent = `مبلغ پایه: ${money(base)} تومان | بانکدار جدید: ${players[banker].name} | دور بانکداری: ۱ از ۳`;
  startBankingRound();
}

function newBankRound() {
  if (!roundEnded || currentTable === null || bankRound >= 3 || bank < tables[currentTable] || bank >= tables[currentTable] * 9) return;
  roundEnded = false;
  battleMessage = "";
  $("nextRoundBtn").style.display = "none";
  bankRound++;
  $("tableInfo").textContent = `مبلغ پایه: ${money(tables[currentTable])} تومان | بانکدار: ${players[banker].name} | دور بانکداری: ${bankRound} از ۳`;
  startBankingRound();
}

// ===== UI Helpers =====
function bankMenu() {
  document.getElementById("sideMenu").classList.toggle("open");
  document.getElementById("menuOverlay").classList.toggle("show");
}

function escapeHTML(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function accountModal(title, body) {
  $("accountTitle").textContent = title;
  $("accountBody").innerHTML = body;
  $("accountModal").classList.remove("hidden");
}

function closeAccount() {
  $("accountModal").classList.add("hidden");
}

function showBalance() {
  accountModal("موجودی و شارژ حساب", `
    <p>موجودی فعلی: <strong>${money(wallet)} تومان</strong></p>
    <div class="recharge-options" style="display:flex;gap:10px;margin-top:16px">
      <button onclick="showCardTransfer()">💳 کارت به کارت</button>
      <button onclick="showVoucher()">🎟 ووچر</button>
    </div>`);
}

function showCardTransfer() {
  accountModal("شارژ با کارت به کارت", `
    <p>در نسخه فعلی این گزینه فقط برای نمایش فرآیند است.</p>
    <input id="transferAmount" type="number" min="0" placeholder="مبلغ انتقال" style="width:100%;padding:10px;margin:8px 0;border-radius:8px;border:0;background:#1c283c;color:#fff">
    <input id="transferRef" type="text" placeholder="شماره پیگیری / رسید" style="width:100%;padding:10px;margin:8px 0;border-radius:8px;border:0;background:#1c283c;color:#fff">
    <button onclick="submitCardTransfer()" style="margin-top:10px">ثبت درخواست کارت به کارت</button>`);
}

function submitCardTransfer() {
  const n = Number($("transferAmount").value);
  const ref = $("transferRef").value.trim();
  if (!Number.isFinite(n) || n <= 0 || !ref) return;
  accountModal("کارت به کارت", `<p>درخواست شارژ به مبلغ <strong>${money(n)} تومان</strong> با شماره پیگیری <strong>${escapeHTML(ref)}</strong> ثبت شد.</p>`);
}

function showVoucher() {
  accountModal("شارژ با ووچر", `
    <p>کد ووچر خود را وارد کنید.</p>
    <input id="voucherCode" type="text" placeholder="کد ووچر" style="width:100%;padding:10px;margin:8px 0;border-radius:8px;border:0;background:#1c283c;color:#fff">
    <button onclick="submitVoucher()">ثبت ووچر</button>`);
}

function submitVoucher() {
  const code = $("voucherCode").value.trim();
  if (!code) return;
  accountModal("ووچر", `<p>کد <strong>${escapeHTML(code)}</strong> دریافت شد.</p>`);
}

function showWithdraw() {
  accountModal("درخواست برداشت", `
    <p>موجودی قابل برداشت: <strong>${money(wallet)} تومان</strong></p>
    <input id="withdrawAmount" type="number" min="0" placeholder="مبلغ برداشت" style="width:100%;padding:10px;margin:8px 0;border-radius:8px;border:0;background:#1c283c;color:#fff">
    <button onclick="requestWithdraw()">ثبت درخواست</button>`);
}

function requestWithdraw() {
  const n = Number($("withdrawAmount").value);
  if (!Number.isFinite(n) || n <= 0 || n > wallet) return;
  wallet -= n;
  renderTables();
  accountModal("درخواست برداشت", `
    <p>درخواست برداشت <strong>${money(n)} تومان</strong> ثبت شد.</p>
    <p>موجودی فعلی: <strong>${money(wallet)} تومان</strong></p>`);
}

// ===== Events =====
$("standBtn").onclick = stand;
$("closeBankBtn").onclick = () => { if (bankerTurn && !battleSettled && !roundEnded) finishBattle(); };
$("nextRoundBtn").onclick = newBankRound;
$("nextPlayerBtn").onclick = nextPlayer;
$("closeModal").onclick = () => $("modal").classList.add("hidden");
$("modal").addEventListener("click", e => {
  if (e.target === $("modal")) $("modal").classList.add("hidden");
});

$("chatBtn").onclick = () => document.getElementById("chatPanel").classList.toggle("hidden");
$("voiceBtn").onclick = () => {
  const b = document.getElementById("voiceBtn");
  b.classList.toggle("active");
  b.textContent = b.classList.contains("active") ? "🎙 وویس روشن" : "🎙 وویس";
  document.getElementById("voiceNote").textContent = b.classList.contains("active") ? "وویس روشن است." : "وویس خاموش است.";
};
$("sendChat").onclick = () => {
  const input = document.getElementById("chatInput");
  const t = input.value.trim();
  if (!t) return;
  const x = document.createElement("div");
  x.className = "chat-msg";
  x.textContent = "شما: " + t;
  document.getElementById("chatMessages").appendChild(x);
  input.value = "";
};
$("chatInput").addEventListener("keydown", e => {
  if (e.key === "Enter") $("sendChat").click();
});

$("menuBtn").onclick = bankMenu;
$("menuClose").onclick = bankMenu;
$("menuOverlay").onclick = bankMenu;
$("rulesBtn").onclick = () => { $("rulesModal").classList.remove("hidden"); bankMenu(); };
$("balanceBtn").onclick = () => { showBalance(); bankMenu(); };
$("withdrawBtn").onclick = () => { showWithdraw(); bankMenu(); };
$("accountClose").onclick = closeAccount;
$("rulesClose").onclick = () => $("rulesModal").classList.add("hidden");

// Sound toggle
$("soundToggle").onclick = () => {
  soundEnabled = !soundEnabled;
  const btn = $("soundToggle");
  btn.textContent = soundEnabled ? "🔊" : "🔇";
  btn.classList.toggle("muted", !soundEnabled);
};

// Init
renderTables();
