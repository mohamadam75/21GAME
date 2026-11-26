const RULES = {
  values: { "6":6, "7":7, "8":8, "9":9, "10":10, "J":2, "Q":3, "K":4, "A":11 },
  tieGoesTo: "BANKER"
};

function cardRank(card) {
  return String(card).slice(0, -1);
}

function cardSuit(card) {
  return String(card).slice(-1);
}

function score(hand) {
  return hand.reduce((s, c) => s + RULES.values[cardRank(c)], 0);
}

function isSpecialWin(hand) {
  const ranks = hand.map(cardRank);
  if (hand.length === 2 && ranks.filter(c => c === "A").length === 2) return true;
  if (hand.length === 2 && ranks.includes("A") && ranks.includes("10")) return true;
  if (hand.length === 5 && score(hand) === 21) return true;
  return false;
}

let tables = [200000, 300000, 400000, 500000, 500000, 600000, 700000, 800000, 900000, 1000000];
let tableStatuses = Array(tables.length).fill("waiting");
let tableOccupancy = Array(tables.length).fill(0);
let wallet = 0, currentTable = null, bank = 0, banker = 0, bankRound = 1, players = [], deck = [], activePlayer = 1, tableCapacity = 6;
let bankerHand = [], playerHand = [], playerDone = false, bankerTurn = false, askechi = true, dealTimer = null, battleSettled = false, bankerDrewThisHand = false;
let soundEnabled = true;
let battleMessage = "";
let roundEnded = false;
let pendingBankerFunding = false;
let playersHandledThisBankRound = 0;
let bankRoundNeedsEnd = false;

const names = ["بازیکن ۱", "بازیکن ۲", "بازیکن ۳", "بازیکن ۴", "بازیکن ۵", "بازیکن ۶"];
const $ = id => document.getElementById(id);
const money = n => Number(n || 0).toLocaleString("fa-IR");
window.update21GameTables = function(rows) { tables=Array(10).fill(0);tableStatuses=Array(10).fill("maintenance");rows.forEach(t=>{const i=Number(t.id)-1;if(i>=0&&i<10){tables[i]=Number(t.stake);tableStatuses[i]=t.status;}});renderTables(); };

// ===== Sound: lightweight Web Audio effects shared by solo and online play =====
let gameAudioContext = null;
function unlock21Audio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!gameAudioContext) gameAudioContext = new AudioContextClass();
    if (gameAudioContext.state === "suspended") gameAudioContext.resume().catch(() => {});
    return gameAudioContext;
  } catch (e) { return null; }
}
function play21Fx(type = "card") {
  if (!soundEnabled) return;
  const ctx = unlock21Audio();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes = type === "chips" ? [520, 760] : type === "win" ? [660, 880, 1040] : [720];
    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type === "card" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(frequency, now + index * 0.055);
      if (type === "card") osc.frequency.exponentialRampToValueAtTime(260, now + 0.105);
      gain.gain.setValueAtTime(type === "card" ? 0.075 : 0.045, now + index * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.055 + (type === "card" ? 0.11 : 0.16));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + index * 0.055);
      osc.stop(now + index * 0.055 + (type === "card" ? 0.12 : 0.18));
    });
  } catch (e) {}
}
window.play21Fx = play21Fx;
window.unlock21Audio = unlock21Audio;
function playCardSound() { play21Fx("card"); }

// ===== Cards (Clear CSS-based) =====
const suits = ["♠", "♥", "♦", "♣"];
function cardVisual(c) {
  const rank = cardRank(c);
  const suit = cardSuit(c);
  const isRed = suit === "♥" || suit === "♦";
  return `<span class="playing-card ${isRed ? "red" : "black"}" title="${rank}${suit}">
    <span class="rank">${rank}</span>
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
  for (let s = 0; s < suits.length; s++)
    for (const c of ["6", "7", "8", "9", "10", "J", "Q", "K", "A"]) a.push(`${c}${suits[s]}`);
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
  if (deck.length === 0) {
    if (askechi) shuffle();
    else return null;
  }
  playCardSound();
  return deck.pop();
}

// ===== Tables =====
window.setAuthenticatedWallet = function(value) { wallet = Math.max(0, Number(value) || 0); renderTables(); };

function renderTables() {
  $("tables").innerHTML = tables.map((base, i) => {
    if(!base || tableStatuses[i] === "maintenance") return "";
    const ok = wallet >= base * 4;
    return `<article class="table-card">
      <h3>میز ${i + 1}</h3>
      <div class="amount">${money(base)} ریال · ژتون</div>
      <div class="meta">حداقل موجودی: ${money(base * 4)} ریال<br>ظرفیت: ۲ تا ۶ نفر<br><strong class="online-count" id="onlineCount${i}">آنلاین: ${Number(tableOccupancy[i]||0).toLocaleString("fa-IR")} نفر</strong></div>
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
  players = names.slice(0, tableCapacity).map(name => ({ name, hand: [], done: false, balance: 10000000 }));
  banker = null;
  activePlayer = 0;
  shuffle();
  $("modalTitle").textContent = `میز ${i + 1}`;
  $("tableInfo").textContent = `مبلغ پایه: ${money(tables[i])} ریال | بانک اولیه: ${money(bank)} ریال`;
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
    if (cardRank(c) === "A") {
      banker = index;
      players[banker].balance -= tables[currentTable] * 3;
      dealTimer = setTimeout(() => {
        askechi = false;
        activePlayer = (banker + 1) % players.length;
        $("standBtn").style.display = "block";
        $("nextRoundBtn").style.display = "none";
        $("tableInfo").textContent = `مبلغ پایه: ${money(tables[currentTable])} ریال | بانکدار: ${players[banker].name} | دور بانکداری: ۱ از ۳`;
        startBankingRound(true);
      }, 900);
      return;
    }
    dealAskechi((index + 1) % players.length);
  }, 800);
}

// ===== Banking Round =====
function startBankingRound(resetDeck = false) {
  roundEnded = false;
  battleMessage = "";
  $("nextRoundBtn").style.display = "none";
  $("nextPlayerBtn").style.display = "none";
  if (resetDeck) shuffle();
  players.forEach(p => { p.hand = []; p.done = false; });
  playerHand = [];
  playerDone = false;
  bankerTurn = false;
  battleSettled = false;
  bankerDrewThisHand = false;
  playersHandledThisBankRound = 0;
  bankRoundNeedsEnd = false;
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
    battleSettled = true;
    playersHandledThisBankRound++;
    battleMessage = `${players[activePlayer].name} موجودی کافی برای این دست ندارد`;
    playerHand = [];
    bankerTurn = false;
    render();
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
  $("standBtn").style.display = "none";
  $("closeBankBtn").style.display = bankerTurn && !battleSettled && !roundEnded ? "block" : "none";
  $("nextPlayerBtn").style.display = battleSettled && !roundEnded ? "block" : "none";

  $("seats").innerHTML = players.map((p, i) => `
    <div class="seat s${i} ${i === banker ? "banker" : ""} ${i === activePlayer && !bankerTurn ? "active" : ""}">
      <div class="avatar">${i === banker ? "👑" : "👤"}</div>
      <div class="name">${p.name}</div>
      <div class="tag">${i === banker ? "بانکدار" : ""}</div>
      <div class="cards">${
        battleSettled
          ? (i === banker ? cardsText(bankerHand) : i === activePlayer ? cardsText(playerHand) : hiddenCards(p.hand.length))
          : i === banker
            ? (bankerTurn ? cardsText(bankerHand) : hiddenCards(bankerHand.length))
            : i === activePlayer
              ? (bankerTurn ? hiddenCards(playerHand.length) : cardsText(playerHand))
              : hiddenCards(p.hand.length)
      }</div>
      <div class="seat-balance">موجودی: ${money(p.balance)} ریال</div>
    </div>`).join("");

  $("handInfo").innerHTML = battleSettled
    ? `دست بانکدار: <strong>${cardsText(bankerHand)}</strong> — ${score(bankerHand)}<br>دست بازیکن: <strong>${cardsText(playerHand)}</strong> — ${score(playerHand)}`
    : bankerTurn
      ? `دست بانکدار: <strong>${cardsText(bankerHand)}</strong> — ${score(bankerHand)} <span class="privacy-note">دست بازیکن مخفی است</span>`
      : `دست بازیکن: <strong>${cardsText(playerHand)}</strong> — ${score(playerHand)} <span class="privacy-note">دست بانکدار مخفی است</span>`;

  renderChoices();
}

function renderChoices() {
  const box = $("cardChoices");
  box.innerHTML = "";
  if (battleSettled || roundEnded) return;
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
  const takeCard = document.createElement("button");
  takeCard.textContent = "کارت بده";
  takeCard.onclick = () => requestCards(1);
  box.appendChild(takeCard);
  const standButton = document.createElement("button");
  standButton.textContent = "بستم";
  standButton.className = "secondary";
  standButton.onclick = stand;
  box.appendChild(standButton);
}

function requestCards(n) {
  if (roundEnded || battleSettled || bankerTurn || playerDone) return;
  for (let i = 0; i < n; i++) {
    const nextCard = draw();
    if (!nextCard) {
      battleMessage = "دسته کارت تمام شده؛ دست با کارت‌های موجود ادامه پیدا می‌کند";
      players[activePlayer].hand = [...playerHand];
      playerDone = true;
      bankerPlay();
      return;
    }
    playerHand.push(nextCard);
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
  const nextCard = draw();
  if (!nextCard) {
    battleMessage = "دسته کارت تمام شده؛ بانکدار کارت دیگری ندارد";
    finishBattle();
    return;
  }
  bankerHand.push(nextCard);
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
      $("cardChoices").innerHTML = "";
      $("nextRoundBtn").style.display = "none";
      render();
      return;
    }
    bank -= base;
    players[activePlayer].balance += base * 2;
    battleMessage = `${players[activePlayer].name} برنده شد • ${money(base)} ریال از بانک گرفت`;
  } else {
    bank += base;
    battleMessage = `بانکدار برنده شد • ${money(base)} ریال به بانک اضافه شد`;
  }

  players[activePlayer].hand = [...playerHand];
  playersHandledThisBankRound++;

  // Keep both hands visible until the banker presses the next-player button.
  bankRoundNeedsEnd = bank <= 0 || bank >= base * 9;
  render();
  // حرکت به نفر بعد فقط با فشردن دکمه توسط بانکدار/کاربر انجام می‌شود.
}

function nextPlayer() {
  if (roundEnded || !battleSettled) return;
  $("nextPlayerBtn").style.display = "none";
  if (bankRoundNeedsEnd) {
    bankRoundNeedsEnd = false;
    endBankRound();
    render();
    return;
  }
  if (playersHandledThisBankRound >= players.length - 1) {
    endBankRound();
    render();
    return;
  }
  battleMessage = "";
  if (bankerDrewThisHand) bankerHand = [];
  let next = (activePlayer + 1) % players.length;
  if (next === banker) next = (next + 1) % players.length;
  activePlayer = next;
  playerHand = [];
  playerDone = false;
  bankerTurn = false;
  battleSettled = false;
  bankerDrewThisHand = false;
  if (bankerHand.length === 0) {
    const nextBankerCard = draw();
    if (!nextBankerCard) {
      battleMessage = "دسته کارت تمام شده؛ این دور بانکداری پایان می‌یابد";
      endBankRound();
      render();
      return;
    }
    bankerHand = [nextBankerCard];
  }
  render();
  setTimeout(beginPlayer, 300);
}

function endBankRound() {
  roundEnded = true;
  battleMessage = "";
  $("cardChoices").innerHTML = "";
  const base = tables[currentTable];
  const canContinue = bank >= base && bank < base * 9 && bankRound < 3 && deck.length >= players.length + 1;
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
  $("tableInfo").textContent = `مبلغ پایه: ${money(base)} ریال | بانکدار جدید: ${players[banker].name} | دور بانکداری: ۱ از ۳`;
  startBankingRound(true);
}

function showBankerFundingError() {
  const base = tables[currentTable];
  const missing = Math.max(0, base * 3 - players[banker].balance);
  accountModal("موجودی بانکدار کافی نیست", `
    <p>نوبت بانکداری به <strong>${players[banker].name}</strong> رسیده، اما موجودی او برای شروع بانکداری کافی نیست.</p>
    <p>موجودی لازم: <strong>${money(base * 3)} ریال</strong></p>
    <p>کسری موجودی: <strong>${money(missing)} ریال</strong></p>
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
  $("tableInfo").textContent = `مبلغ پایه: ${money(base)} ریال | بانکدار جدید: ${players[banker].name} | دور بانکداری: ۱ از ۳`;
  startBankingRound(true);
}

function newBankRound() {
  if (!roundEnded || currentTable === null || bankRound >= 3 || bank < tables[currentTable] || bank >= tables[currentTable] * 9) return;
  roundEnded = false;
  battleMessage = "";
  $("nextRoundBtn").style.display = "none";
  bankRound++;
  $("tableInfo").textContent = `مبلغ پایه: ${money(tables[currentTable])} ریال | بانکدار: ${players[banker].name} | دور بانکداری: ${bankRound} از ۳`;
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
    <p>موجودی فعلی: <strong>${money(wallet)} ریال</strong></p>
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
  accountModal("کارت به کارت", `<p>درخواست شارژ به مبلغ <strong>${money(n)} ریال</strong> با شماره پیگیری <strong>${escapeHTML(ref)}</strong> ثبت شد.</p>`);
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
    <p>موجودی قابل برداشت: <strong>${money(wallet)} ریال</strong></p>
    <input id="withdrawAmount" type="number" min="0" placeholder="مبلغ برداشت" style="width:100%;padding:10px;margin:8px 0;border-radius:8px;border:0;background:#1c283c;color:#fff">
    <button onclick="requestWithdraw()">ثبت درخواست</button>`);
}

function requestWithdraw() {
  const n = Number($("withdrawAmount").value);
  if (!Number.isFinite(n) || n <= 0 || n > wallet) return;
  wallet -= n;
  renderTables();
  accountModal("درخواست برداشت", `
    <p>درخواست برداشت <strong>${money(n)} ریال</strong> ثبت شد.</p>
    <p>موجودی فعلی: <strong>${money(wallet)} ریال</strong></p>`);
}

// ===== Events =====
$("standBtn").onclick = () => { if (!window.supabase21Game) stand(); };
$("closeBankBtn").onclick = () => { if (!window.supabase21Game && bankerTurn && !battleSettled && !roundEnded) finishBattle(); };
$("nextRoundBtn").onclick = () => { if (!window.supabase21Game) newBankRound(); };
$("nextPlayerBtn").onclick = () => { if (!window.supabase21Game) nextPlayer(); };
$("closeModal").onclick = () => $("modal").classList.add("hidden");
$("modal").addEventListener("click", e => {
  if (e.target === $("modal")) $("modal").classList.add("hidden");
});

$("chatBtn").onclick = () => { if (!window.supabase21Game) document.getElementById("chatPanel").classList.toggle("hidden"); };
$("voiceBtn").onclick = () => { if (window.supabase21Game) return;
  const b = document.getElementById("voiceBtn");
  b.classList.toggle("active");
  b.textContent = b.classList.contains("active") ? "🎙 وویس روشن" : "🎙 وویس";
  document.getElementById("voiceNote").textContent = b.classList.contains("active") ? "وویس روشن است." : "وویس خاموش است.";
};
$("sendChat").onclick = () => { if (window.supabase21Game) return;
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
  if (e.key === "Enter" && !window.supabase21Game) $("sendChat").click();
});

$("menuBtn").onclick = bankMenu;
$("menuClose").onclick = bankMenu;
$("menuOverlay").onclick = bankMenu;
$("rulesBtn").onclick = () => { $("rulesModal").classList.remove("hidden"); bankMenu(); };
$("balanceBtn").onclick = () => { if (!window.supabase21Game) { showBalance(); bankMenu(); } };
$("withdrawBtn").onclick = () => { if (!window.supabase21Game) { showWithdraw(); bankMenu(); } };
$("accountClose").onclick = closeAccount;
$("rulesClose").onclick = () => $("rulesModal").classList.add("hidden");

// Sound toggle
$("soundToggle").onclick = () => {
  soundEnabled = !soundEnabled;
  const btn = $("soundToggle");
  btn.textContent = soundEnabled ? "🔊 صدای بازی روشن" : "🔇 صدای بازی خاموش";
  btn.classList.toggle("muted", !soundEnabled);
  if (soundEnabled) unlock21Audio();
};

// Init
renderTables();
