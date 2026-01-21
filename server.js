var room = HBInit({
  roomName: "2️⃣💎 4V4 IDA & VUELTA-PENALES 💎6️⃣",
  maxPlayers: 21,
  public: false,
  playerName: " ",
  noPlayer: true,
  token: window.thr1.AAAAAGlwcLvvE4wCyUHAbw.L9lS7ESEofY,
})
// ===== Cache de AUTH/CONN (porque solo vienen en onPlayerJoin) =====
var AUTH_BY_ID = Object.create(null);
var CONN_BY_ID = Object.create(null);

function getAuth(p){
  if(!p) return null;
  return (p.auth != null ? p.auth : AUTH_BY_ID[p.id]) ?? null;
}
function getConn(p){
  if(!p) return null;
  return (p.conn != null ? p.conn : CONN_BY_ID[p.id]) ?? null;
}

// ================= CONFIG TIEMPOS =================
var TIEMPO_REGLA = 120;
var EXTRAS_POSIBLES = [20, 25, 30];
var CUENTA_EXTRA = 3;
var DELAY_VUELTA_MS = 3000;
let mvpAuthIDA = null;
let mvpAuthVUELTA = null;
// ===== CHAT CONTROL =====
let CHAT_SLOW_MS = 0;               // 0 = sin slow mode. Ej: 2000 = 2 segundos
let CHAT_ONLY_COMMANDS = false;     // true = solo se permite escribir mensajes que empiecen con !
const muted = new Set();            // guarda ids muteados
const lastChatAt = new Map();       // id -> timestamp último mensaje
let PRE_BETS_SECS = 60;     // apuestas “largas” al terminar serie (cambia a 45/90)
let preBetsTimer = null;   // timer del conteo largo
let preBetsActive = false;   // ✅ NUEVO
// ================= MONEDAS (por AUTH) =================
// ✅ Persistencia en localStorage (Headless web, SIN require/fs)
const COINS_KEY = "HB_COINS_v1";

var monedasByAuth = {}; // auth -> monedas (number)
var saveCoinsTimer = null;

function loadCoins(){
  try{
    if(typeof localStorage === "undefined"){
      monedasByAuth = {};
      return;
    }
    let raw = localStorage.getItem(COINS_KEY);
    monedasByAuth = JSON.parse(raw || "{}") || {};
  } catch(e){
    monedasByAuth = {};
  }
}

function queueSaveCoins(){
  if(saveCoinsTimer) return;
  saveCoinsTimer = setTimeout(()=>{
    saveCoinsTimer = null;
    try{
      if(typeof localStorage === "undefined") return;
      localStorage.setItem(COINS_KEY, JSON.stringify(monedasByAuth));
    } catch(e){}
  }, 400);
}

function walletKey(p){
  let a = getAuth(p);
  if(a && a.length >= 5) return "AUTH:" + a;
  return null;
}





function getCoinsByAuth(auth){
  return (monedasByAuth[auth] != null ? (monedasByAuth[auth] | 0) : 0);
}
function setCoinsByAuth(auth, value){
  monedasByAuth[auth] = Math.max(0, value | 0);
  queueSaveCoins();
}
function addCoinsByAuth(auth, delta){
  setCoinsByAuth(auth, getCoinsByAuth(auth) + (delta|0));
}
function canPay(auth, amount){
  return getCoinsByAuth(auth) >= (amount|0);
}
function pay(auth, amount){
  amount = amount|0;
  if(amount <= 0) return false;
  if(!canPay(auth, amount)) return false;
  setCoinsByAuth(auth, getCoinsByAuth(auth) - amount);
  return true;
}

// Cargar al iniciar script
loadCoins();

// Inicializa monedas para un jugador (10 si es primera vez con ese AUTH)
function ensureCoinsForPlayer(player){
  let k = walletKey(player);
  if(!k) return; // <- sin auth NO crea "null"
  if(monedasByAuth[k] == null){
    monedasByAuth[k] = 10;
    queueSaveCoins();
  }
}

                                                                     


// ------ Catálogo (1 a 8) ------
var SHOP = [
  { no:1, name:"+15 segundos extra", effect:"Suma 15s al tiempo del partido", price:40 },
  { no:2, name:"-10 segundos al rival", effect:"Resta 10s al equipo contrario", price:50 },
  { no:3, name:"Power x2 (3 toques)", effect:"Balón más fuerte por 3 toques", price:60 },
  { no:4, name:"Gol doble", effect:"Suma 2 goles por uno solo", price:80 },
  { no:5, name:"Caja random", effect:"+5 monedas (50%) | Poder aleatorio (50%)", price:20 },
  { no:6, name:"Vote kick", effect:"Permite iniciar votación para kickear", price:30 },
  { no:7, name:"Vote ban 10 min", effect:"Permite ban temporal por votación", price:25 },
  { no:8, name:"Ban permanente", effect:"Banea a un jugador inmediatamente", price:1000 },
];
var golDobleUntil = 0;     // fin del efecto
var golDobleStartAt = 0;   // inicio real del efecto (anti snipe)

function shopGetItem(no){
  return SHOP.find(x => x.no === (no|0)) || null;
}

function cmdTienda(targetPlayer){
  pm(targetPlayer.id, decoTop());
  pm(targetPlayer.id, "🏪 TIENDA (1–8) | Usa: !comprar N");
  pm(targetPlayer.id, decoBot());

  for(let i=0;i<SHOP.length;i++){
    let it = SHOP[i];
    pm(targetPlayer.id, `${it.no}) ${it.name} — 💰${it.price}`);
  }

  pm(targetPlayer.id, decoTop());
  pm(targetPlayer.id, "📌 Ejemplo: !comprar 3");
  pm(targetPlayer.id, "📦 Caja random (#5): 50% +5 monedas | 50% poder aleatorio");
  pm(targetPlayer.id, decoBot());
}

function giveRandomPower(player){
  // Poder aleatorio: NO incluye Caja random (#5) ni Ban perm (#8)
  let pool = [1,2,3,4,6,7];
  let pick = pool[Math.floor(Math.random()*pool.length)];
  addItem(player, pick, 1);     // ✅ guarda en invByKey
  return pick;
}


function cmdComprar(player, no){
  no = no|0;
  let it = shopGetItem(no);
  if(!it){
    pm(player.id, "❌ Número inválido. Usa !tienda para ver 1–8.");
    return;
  }

  ensureCoinsForPlayer(player);
  ensureInvForPlayer(player); // ✅ usa el de abajo (invByKey)

  let a = walletKey(player);

  if(!pay(a, it.price)){
    pm(player.id, `⛔ No tienes monedas suficientes. Precio: ${it.price} | Tienes: ${getCoinsByAuth(a)}`);
    return;
  }

  // ✅ Compra normal: se guarda en invByKey
  if(no !== 5){
    addItem(player, no, 1); // ✅ antes era addItemByAuth
    pm(player.id, `✅ Comprado con éxito: ${it.no}) ${it.name} (-${it.price})`);
    pm(player.id, `🎒 En inventario: x${getItem(player, no)} | 💰 Saldo: ${getCoinsByAuth(a)}`);
    return;
  }

  // ✅ Caja random: se resuelve al instante
  let roll = Math.random();
  if(roll < 0.50){
    addCoinsByAuth(a, 5);
    pm(player.id, `🎁 Caja random: GANASTE +5 monedas ✅`);
    pm(player.id, `💰 Saldo: ${getCoinsByAuth(a)}`);
  } else {
    let p = giveRandomPower(player);           // ✅ ahora recibe player
    let pit = shopGetItem(p);
    pm(player.id, `🎁 Caja random: GANASTE PODER ✅ → ${p}) ${pit ? pit.name : "?"}`);
    pm(player.id, `🎒 En inventario: x${getItem(player, p)} | 💰 Saldo: ${getCoinsByAuth(a)}`);
  }
}
// ===== PRECIOS TIENDA (guardado simple) =====
const SHOP_PRICES_KEY = "HB_SHOP_PRICES_v1";

function loadShopPrices(){
  try{
    let raw = localStorage.getItem(SHOP_PRICES_KEY);
    let prices = JSON.parse(raw || "{}") || {};
    for(let i=0;i<SHOP.length;i++){
      let no = SHOP[i].no;
      if(prices[no] != null) SHOP[i].price = prices[no] | 0;
    }
  }catch(e){}
}

function saveShopPrices(){
  try{
    let prices = {};
    for(let i=0;i<SHOP.length;i++){
      prices[SHOP[i].no] = SHOP[i].price | 0;
    }
    localStorage.setItem(SHOP_PRICES_KEY, JSON.stringify(prices));
  }catch(e){}
}

// cargar precios al iniciar
loadShopPrices();

    
// ================= ECONOMÍA: GANANCIAS =================
var COIN_GOL = 1;
var COIN_WIN = 3;
var COIN_DRAW = 2;
var COIN_MVP = 4;

function awardCoinsPlayer(player, amount, reason){
  if(!player) return;
  ensureCoinsForPlayer(player);
  let a = walletKey(player);
  addCoinsByAuth(a, amount);
  pm(player.id, `💰 ${reason}: +${amount} | Saldo: ${getCoinsByAuth(a)}`);
}

function awardCoinsTeamByPhysical(physicalTeam, amount, reason){
  // physicalTeam: 1 rojo, 2 azul
  room.getPlayerList().forEach(p=>{
    if(p.team === physicalTeam){
      awardCoinsPlayer(p, amount, reason);
    }
  });
}

function awardCoinsAllPlaying(amount, reason){
  room.getPlayerList().forEach(p=>{
    if(p.team !== 0){
      awardCoinsPlayer(p, amount, reason);
    }
  });
}

// ================= CHAT QUEUE =================
var chatQueue = [];
var chatRunning = false;
var CHAT_STEP = 0;
var YIELD_EVERY = 10;
var YIELD_MS = 15;
var apuestaDeadline = 0; 
var virtualExtra = { blue: 0, red: 0 };
let helpSeen = {}; // helpSeen[auth] = true
function getKey(player){
  return (player && player.auth) ? player.auth : ("noauth_" + player.id);
}

function qChat(line){ chatQueue.push(line); runChatQueue(); }
function qLines(lines){ for (let i=0;i<lines.length;i++) chatQueue.push(lines[i]); runChatQueue(); }

function runChatQueue(){
  if(chatRunning) return;
  chatRunning = true;
  let sent = 0;

  (function tick(){
    if(chatQueue.length === 0){ chatRunning = false; return; }
    room.sendChat(chatQueue.shift());
    sent++;
    setTimeout(tick, (sent % YIELD_EVERY === 0) ? YIELD_MS : CHAT_STEP);
  })();
}

function burstChat(line){ room.sendChat(line); }
function burstLines(lines){ for(let i=0;i<lines.length;i++) room.sendChat(lines[i]); }

function decoTop(){ return "✨🌟══════════════════════════════🌟✨"; }
function decoBot(){ return "✨🌟══════════════════════════════🌟✨"; }

// ================= PM (solo 1 jugador) + HELPERS =================
function openBetsAfterSeries(secs){
  secs = Math.max(10, secs|0);

  if(preBetsTimer){
    clearInterval(preBetsTimer);
    preBetsTimer = null;
  }

  preBetsActive = true;          // ✅
  apuestasSerieActiva = true;
  apuestasPagadas = false;

  betOpen(secs);

  qChat(`🎲 APUESTAS ABIERTAS (${secs}s) para la PRÓXIMA SERIE`);
  qChat('👉 Usa: !apostar r|b|x cantidad  (r=rojo, b=blue, x=empate)');

  let left = secs;
  preBetsTimer = setInterval(()=>{
    // ✅ si ya empezó el cierre final (10s) o se apagó, no sigas
    if(!preBetsActive){
      clearInterval(preBetsTimer);
      preBetsTimer = null;
      return;
    }

    left--;

    if(left === 30 || left === 15 || left === 10 || left === 5){
      room.sendChat(`⏳ Apuestas: ${left}s`);
    }

    if(left <= 0){
      clearInterval(preBetsTimer);
      preBetsTimer = null;

      // ✅ solo cerrar si sigue activo (por si !on ya lo cerró)
      if(preBetsActive){
        betClose();
        apuestasSerieActiva = false;
        preBetsActive = false;
        room.sendChat("🔒 APUESTAS CERRADAS ✅ (esperando !on)");
      }
    }
  }, 1000);
}


function pm(id, msg){
  // En HaxBall Headless: sendAnnouncement(msg, targetId, color, style, sound)
  try { room.sendAnnouncement(msg, id, 0xFFFFFF, 0, 0); }
  catch(e){ try{ room.sendChat(msg); }catch(_){} }
}                                                                         // ================= APUESTAS (PRIMERA PARTE) =================
var apuestasHabilitadas = false;     // true SOLO durante la ventana de 10s
var apuestasCerradas = true;

var apuestasPorAuth = {};            // auth -> { pick: "red"|"blue"|"draw", amount: number }
// ✅ Estado de apuestas por SERIE (IDA+VUELTA)
var apuestasSerieActiva = false;   // hubo ventana de apuestas en esta serie
var apuestasPagadas = false;       // ya se pagaron/refundearon

// Cuotas
var CUOTA_TEAM = 2.0;
var CUOTA_DRAW = 3.0;

// Helper: buscar jugadores conectados por walletKey
function playersByKey(key){
  return room.getPlayerList().filter(p => walletKey(p) === key);
}


function refundAllBets(reason){
  // Devuelve el monto apostado a todos
  if(apuestasPagadas) return;

  let keys = Object.keys(apuestasPorAuth);
  if(keys.length === 0){
    apuestasPagadas = true;
    apuestasSerieActiva = false;
    return;
  }

  keys.forEach(k=>{
    let b = apuestasPorAuth[k];
    if(!b) return;
    addCoinsByAuth(k, b.amount); // devolución
    // avisar a quien esté conectado con esa key
    let ps = playersByKey(k);
    ps.forEach(p=>{
      pm(p.id, `↩️ Apuesta devuelta (${reason}): +${b.amount} monedas | Saldo: ${getCoinsByAuth(k)}`);
    });
  });

  apuestasPorAuth = {};
  apuestasPagadas = true;
  apuestasSerieActiva = false;
}

// outcomePick: "red" | "blue" | "draw"
function settleBets(outcomePick){
  if(apuestasPagadas) return;

  let keys = Object.keys(apuestasPorAuth);
  if(keys.length === 0){
    apuestasPagadas = true;
    apuestasSerieActiva = false;
    return;
  }

  keys.forEach(k=>{
    let b = apuestasPorAuth[k];
    if(!b) return;

    let won = (b.pick === outcomePick);
    if(won){
      let mult = (outcomePick === "draw") ? CUOTA_DRAW : CUOTA_TEAM;
      let payout = Math.floor(b.amount * mult); // redondeo hacia abajo
      addCoinsByAuth(k, payout);

      let ps = playersByKey(k);
      ps.forEach(p=>{
        pm(p.id, `✅ GANASTE apuesta: ${outcomePick.toUpperCase()} | +${payout} monedas | Saldo: ${getCoinsByAuth(k)}`);
      });
    } else {
      let ps = playersByKey(k);
      ps.forEach(p=>{
        pm(p.id, `❌ Perdiste apuesta: Apostaste ${b.pick.toUpperCase()} | Resultado ${outcomePick.toUpperCase()}`);
      });
    }
  });

  apuestasPorAuth = {};
  apuestasPagadas = true;
  apuestasSerieActiva = false;
}

// Reglas de esta fase (solo apuestas)
var APUESTA_MIN = 1;
var APUESTA_MAX_TEAM = 100;
var APUESTA_MAX_DRAW = 100;

// helper: texto equipo del jugador
function teamName(t){
  if(t===1) return "red";
  if(t===2) return "blue";
  return "spec";
}
function pickNormalize(p){
  p = (p||"").toLowerCase().trim();

  // equipos
  if(p==="red"  || p==="rojo" || p==="r") return "red";
  if(p==="blue" || p==="azul" || p==="b") return "blue";

  // empate
  if(p==="draw" || p==="empate" || p==="x" || p==="e") return "draw";

  return null;
}


function canBetNow(player){
  if(!player) return { ok:false, why:"⚠️ Jugador inválido." };

  // ✅ espectadores SÍ pueden apostar (ya NO bloqueamos team 0)

  // ventana activa
  if(!apuestasHabilitadas || apuestasCerradas) return { ok:false, why:"⚠️ Apuestas cerradas." };
  if(Date.now() > apuestaDeadline) return { ok:false, why:"⚠️ Apuestas cerradas (tiempo)." };

  return { ok:true, why:"" };
}


function betOpen(seconds){
  apuestasHabilitadas = true;
  apuestasCerradas = false;
  apuestaDeadline = Date.now() + (seconds*1000);
  apuestasPorAuth = {}; // reset por partido/serie
}
function betClose(){
  apuestasHabilitadas = false;
  apuestasCerradas = true;
   apuestaDeadline = 0; // ✅ mata la ventana (extra seguridad)
}

function showBetPM(player){

  let a = walletKey(player);
  ensureCoinsForPlayer(player);

  let b = apuestasPorAuth[a];
  if(!b){
    pm(player.id, "📌 No tienes apuesta registrada en esta ventana.");
    return;
  }
  pm(player.id, `🎲 Tu apuesta: ${b.pick.toUpperCase()} | 💰 ${b.amount} monedas`);
}

function phaseNormalize(s){
  s = (s||"").toLowerCase().trim();
  if(s === "ida" || s === "i" || s === "first" || s === "1st" || s === "leg1") return "IDA";
  if(s === "vuelta" || s === "v" || s === "second" || s === "2nd" || s === "leg2") return "VUELTA";
  return null;
}


function resetBetSystem(){
  betClose();
  refundAllBets("reset");
}
function pmSequence(playerId, blocks, delayMs = 1000){
  let i = 0;
  const interval = setInterval(() => {
    const p = room.getPlayer(playerId);
    if(!p){
      clearInterval(interval);
      return;
    }

    // manda el bloque (array de líneas)
    for(const line of blocks[i]) pm(playerId, line);

    i++;
    if(i >= blocks.length) clearInterval(interval);
  }, delayMs);
}
setInterval(() => {
  room.getPlayerList().forEach(p => {
    if(!helpSeen[getKey(p)]){
      pm(p.id, "🆘 Escribe !help para ver TIENDA y comandos con ejemplos ✅");
    }
  });
}, 30000);




// ================= BIENVENIDA (3 MENSAJES EXPLICANDO TODO) =================
var bienvenidaCooldown = {};
var BIENVENIDA_CD_MS = 90000;

function isNewAccount(player){
  return !player || !player.auth || player.auth.length < 5;
}

function sendBienvenida3(player){
  if(!player) return;
  let auth = player.auth || ("noauth_" + player.id);
  let now = Date.now();
  const id = player.id;

  // Bloque 1: MODO / SERIE
  const b1 = [
    decoTop(),
    "⚽ MODO: 4v4 COMPETITIVO",
    "📌 Serie: IDA & VUELTA + PENALES si el GLOBAL empata",
    "🆘 Ayuda rápida: !help",
    decoBot()
  ];

  // Bloque 2: ECONOMÍA
  const b2 = [
  decoTop(),
  "💰 ECONOMÍA",
  "✅ Bienvenido: 10 monedas para empezar",
  "👛 Ver saldo: !monedas",
  
  "🛒 Tienda: !tienda  | Comprar: !comprar N  (Ej: !comprar 3)",
  "🎒 Inventario: !inv",
  "✨ Tip: mira la tienda, compra un item y revísalo en tu inventario.",
  decoBot()
];


  // Bloque 3: APUESTAS
  const b3 = [
    decoTop(),
    "🎲 APUESTAS (BET)",
    "📍 Menú y ejemplos: !bet",
    "🧾 Menús: !apu (GLOBAL) | !apuida | !apuvuelta",
    "✅ Solo puedes apostar a TU equipo",
    "✅ Min: 1 | Max: Team 50 / Empate 50",
    "📈 Cuotas: Team x2 | Empate x3 (redondeo ↓)",
    "⛔ Cierran: 10s de iniciar o 1er gol",
    decoBot()
  ];

  // Bloque 4: COMANDOS ÚTILES (opcional)
  const b4 = [
    decoTop(),
    "📊 COMANDOS ÚTILES",
    "• !tienda  | !comprar N (Ej: !comprar 3) | !inv",
    "• !ida | !global | !stats \"Nombre\"",
    decoBot()
  ];

  // helper para mandar un bloque de líneas
  function sendBlock(lines){
    let p = room.getPlayer(id);
    if(!p) return;
    for(const line of lines) pm(id, line);
  }

  // 1 bloque por segundo
  sendBlock(b1);                 // ahora
  setTimeout(() => sendBlock(b2), 1000); // +1s
  setTimeout(() => sendBlock(b3), 2000); // +2s
  setTimeout(() => sendBlock(b4), 3000); // +3s

  // Si cuenta nueva, lo mandas al final (+4s)
  if(isNewAccount(player)){
    setTimeout(() => {
      sendBlock([decoTop(), "🆕 CUENTA NUEVA: Bienvenido 😄 (usa !help)", decoBot()]);
    }, 4000);
  }
}


function fmtTime(sec){
  sec = Math.max(0, sec|0);
  let m = Math.floor(sec/60), s = sec%60;
  return m + ":" + (s<10?"0":"") + s;
}

function findPlayerByNameLoose(name){
  let list = room.getPlayerList();
  let exact = list.find(p => p.name === name);
  if(exact) return exact;

  let low = (name||"").toLowerCase().trim();
  if(!low) return null;

  let eq = list.find(p => (p.name||"").toLowerCase() === low);
  if(eq) return eq;

  return list.find(p => (p.name||"").toLowerCase().includes(low)) || null;
}

// ================= COMANDOS (TODOS) =================
function settleMvpAnyLegBets(authIDA, authVUELTA){
  Object.keys(specialBets).forEach(k=>{
    let sb = specialBets[k];
    if(!sb || !sb.mvpAny) return;

    let bet = sb.mvpAny;

    let won = (bet.targetAuth === authIDA) || (bet.targetAuth === authVUELTA);

    if(won){
      let payout = Math.floor(bet.amount * 2.0); // x2
      addCoinsByAuth(k, payout);
      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `✅ GANASTE !mvp (IDA/VUELTA): ${bet.targetName} fue MVP en ida o vuelta | +${payout} (x2) | Saldo: ${getCoinsByAuth(k)}`);
      });
    } else {
      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `❌ Perdiste !mvp (IDA/VUELTA): ${bet.targetName} no fue MVP ni de ida ni de vuelta.`);
      });
    }

    clearSpecialBet(k, "mvpAny");
  });
}

function cmdHelp(targetId){
  pm(targetId, decoTop());
  pm(targetId, "📌 AYUDA — Comandos disponibles");
  pm(targetId, decoBot());

  pm(targetId, "💰 ECONOMÍA:");
  pm(targetId, "• !monedas  → ver tu saldo");
  pm(targetId, "• !tienda   → ver la tienda (items 1–8)");
  pm(targetId, "• !comprar N  → comprar un item por número");
  pm(targetId, "   Ej: !comprar 3");
  pm(targetId, "• !inv  → ver tu inventario (slots 1–8)");

  pm(targetId, decoTop());
  pm(targetId, "🎲 APUESTAS (BET):");
  pm(targetId, "• !bet  → abre el menú de apuestas y ejemplos");
  pm(targetId, "• Formato general:");
  pm(targetId, '   !gol "Jugador" cantidad');
  pm(targetId, '   !autogol "Jugador" cantidad');
  pm(targetId, '   !goles N "Jugador" cantidad   (N=1..6)');
  pm(targetId, '   !meme "Jugador" cantidad');
  pm(targetId, '   !mvp "Jugador" cantidad');
  pm(targetId, "• Si quieres apostar SOLO en ida o vuelta:");
  pm(targetId, '   !gol ida|vuelta "Jugador" cantidad');
  pm(targetId, "⚠️ Nota: solo funciona cuando las apuestas están abiertas.");

  pm(targetId, decoTop());
  pm(targetId, "📊 PARTIDO / SERIES:");
  pm(targetId, "• !ida  → info del partido ida/vuelta (si tu sistema lo usa)");
  pm(targetId, '• !stats "Nombre"  → ver stats de alguien');
  pm(targetId, "   Ej: !stats Rodrigo");
  pm(targetId, "• !global  → tabla/global (si lo tienes configurado)");

  pm(targetId, decoTop());
  pm(targetId, "🧤 ARQUERO (solo si el GLOBAL empata):");
  pm(targetId, "• !arquero / !noarquero");


  pm(targetId, decoBot());
}

function yesPlayingCount(){
  if(!vote || !vote.voters) return 0;
  let c = 0;
  for(let k in vote.voters){
    let v = vote.voters[k];
    if(v && v.yes === 1 && v.team !== 0) c++;
  }
  return c;
}
function clearAllPermBans(){
  permBansByKey = {};
  savePermBans();
}

function cmdIda(targetId){
  let sc = room.getScores();

  // si la IDA está en juego ahora mismo
  if(sc && fase === "IDA"){
    pm(targetId, `🟦 IDA (EN JUEGO): 🔵 ${sc.blue} - ${sc.red} 🔴 | ⏱️ ${sc.time}s`);
    return;
  }

  // si ya terminó la IDA (guardado)
  if(idaTermino){
    pm(targetId, `🟦 IDA (FINAL): 🔵 ${idaScore.blue} - ${idaScore.red} 🔴`);
    return;
  }

  pm(targetId, "🟦 IDA aún no se jugó.");
}
function settleMvpSerieBets(mvpPlayerId){
  // si por alguna razón no hay MVP, devolvemos
  if(!mvpPlayerId){
    Object.keys(specialBets).forEach(k=>{
      let sb = specialBets[k];
      if(sb && sb.mvpSerie){
        refundSpecialBet(k, sb.mvpSerie, "sin MVP");
        clearSpecialBet(k, "mvpSerie");
      }
    });
    return;
  }

  let mvpP = room.getPlayerList().find(p=>p.id===mvpPlayerId) || null;
  let mvpAuth = mvpP ? getAuth(mvpP) : null;
  if(!mvpAuth) return;

  Object.keys(specialBets).forEach(k=>{
    let sb = specialBets[k];
    if(!sb || !sb.mvpSerie) return;

    let bet = sb.mvpSerie;

    if(bet.targetAuth === mvpAuth){
      let payout = Math.floor(bet.amount * MVP_SERIE_MULT);
      addCoinsByAuth(k, payout);

      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `✅ GANASTE !mvp (SERIE): ${bet.targetName} fue MVP de la serie | +${payout} (x${MVP_SERIE_MULT}) | Saldo: ${getCoinsByAuth(k)}`);
      });
    } else {
      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `❌ Perdiste !mvp (SERIE): ${bet.targetName} no fue MVP de la serie.`);
      });
    }

    clearSpecialBet(k, "mvpSerie");
  });
}

function cmdGlobal(targetId){
  if(!sistemaActivo){
    pm(targetId, "⚠️ No hay serie activa.");
    return;
  }
  let A = serieGoals[1] || 0;
  let B = serieGoals[2] || 0;

  pm(targetId, decoTop());
  pm(targetId, "🌍 GLOBAL (GOLES REALES)");
  pm(targetId, `${serieLabel[1]} ${A} ─ ${B} ${serieLabel[2]}`);
  pm(targetId, `📌 Fase: ${fase}`);
  pm(targetId, decoBot());
}

function cmdStats(targetId, name){
  if(!name || !name.trim()){
    pm(targetId, 'Uso: !stats "Nombre"');
    return;
  }

  let p = findPlayerByName(name) || findPlayerByNameLoose(name);
  if(!p){
    pm(targetId, `❌ No encuentro a "${name}" (debe estar conectado).`);
    return;
  }

  let id = p.id;

  pm(targetId, `📊 ${p.name} | ⚽ ${goles[id]||0} | 🎁 ${asistencias[id]||0} | 😵 ${autogoles[id]||0} | ⏱️ ${fmtTime(tiempo[id]||0)}`);
  pm(targetId, `Partido | ⚽ ${golesPartido[id]||0} | 🎁 ${asistPartido[id]||0} | 😵 ${ogPartido[id]||0} | ⏱️ ${fmtTime(tiempoPartido[id]||0)}`);
}

// ================= UTIL =================
function parseArgs(msg){
  // soporta: !cmd a b | !cmd "nombre con espacios" "otro nombre"
  let re = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let out = [], m;
  while((m = re.exec(msg)) !== null) out.push(m[1] || m[2] || m[3]);
  return out;
}
function findPlayerByName(name){
  return room.getPlayerList().find(p => p.name === name) || null;
}
function getNameById(id){
  let p = room.getPlayerList().find(x => x.id === id);
  return p ? p.name : ("ID " + id);
}
function setAvatarSafe(id, avatar){
  try{
    room.setPlayerAvatar(id, avatar || "");
  }catch(e){}
}
function cmdAddCoins(adminPlayer, targetName, amount){
  if(!adminPlayer || !adminPlayer.admin){
    return { ok:false, msg:"⛔ Solo admin." };
  }
  if(!targetName || !targetName.trim()){
    return { ok:false, msg:'Uso: !addcoins "Nombre" cantidad' };
  }

  let p = findPlayerByName(targetName) || findPlayerByNameLoose(targetName);
  if(!p) return { ok:false, msg:`❌ No encuentro a "${targetName}" (debe estar conectado).` };

  amount = parseInt(amount, 10);
  if(!Number.isFinite(amount) || amount === 0){
    return { ok:false, msg:"❌ Cantidad inválida (usa un número distinto de 0)." };
  }

  ensureCoinsForPlayer(p);
  let a = walletKey(p);
  addCoinsByAuth(a, amount);

  return { ok:true, msg:`✅ ${p.name} ${amount>0? "recibe" : "pierde"} ${Math.abs(amount)} monedas. Nuevo saldo: ${getCoinsByAuth(a)}.` };
}

function cmdSetCoins(adminPlayer, targetName, amount){
  if(!adminPlayer || !adminPlayer.admin){
    return { ok:false, msg:"⛔ Solo admin." };
  }
  if(!targetName || !targetName.trim()){
    return { ok:false, msg:'Uso: !setcoins "Nombre" cantidad' };
  }

  let p = findPlayerByName(targetName) || findPlayerByNameLoose(targetName);
  if(!p) return { ok:false, msg:`❌ No encuentro a "${targetName}" (debe estar conectado).` };

  amount = parseInt(amount, 10);
  if(!Number.isFinite(amount) || amount < 0){
    return { ok:false, msg:"❌ Cantidad inválida (>= 0)." };
  }

  ensureCoinsForPlayer(p);
  let a = walletKey(p);
  setCoinsByAuth(a, amount);

  return { ok:true, msg:`✅ Monedas seteadas para ${p.name}: ${getCoinsByAuth(a)}.` };
}
// ===== LIMITE PODERES POR EQUIPO REAL (1 por partido: IDA y VUELTA) =====
var teamPowerUsed = {
  IDA:   { 1:false, 2:false },
  VUELTA:{ 1:false, 2:false }
};

function getRealTeamOfPlayer(p){
  // equipo REAL congelado en !on (lo correcto para ida/vuelta)
  let rt = (serieTeamOf && serieTeamOf[p.id] != null) ? serieTeamOf[p.id] : 0;
  if(rt === 1 || rt === 2) return rt;

  // fallback (por si entra alguien raro y aún no está mapeado)
  if(p.team === 1 || p.team === 2){
    try { return physicalToRealTeamNow(p.team); } catch(e){}
  }
  return 0;
}

function canUseTeamPower(player){
  if(!player) return false;
  if(!sistemaActivo || penalActivo){ pm(player.id, "⚠️ No se puede usar poder ahora."); return false; }
  if(player.team === 0){ pm(player.id, "⛔ Solo jugadores en ROJO/AZUL pueden usar poderes."); return false; }
  if(fase !== "IDA" && fase !== "VUELTA"){ pm(player.id, "⚠️ Solo en IDA o VUELTA."); return false; }

  let rt = getRealTeamOfPlayer(player);
  if(rt !== 1 && rt !== 2){ pm(player.id, "⚠️ No se pudo detectar tu equipo real."); return false; }

  if(!teamPowerUsed[fase]) teamPowerUsed[fase] = {1:false,2:false};

  if(teamPowerUsed[fase][rt]){
    pm(player.id, `⛔ Tu equipo ya usó 1 poder en este partido (${fase}).`);
    return false;
  }
  return true;
}

function markTeamPowerUsed(player){
  let rt = getRealTeamOfPlayer(player);
  if(rt === 1 || rt === 2){
    if(!teamPowerUsed[fase]) teamPowerUsed[fase] = {1:false,2:false};
    teamPowerUsed[fase][rt] = true;
  }
}

// ================= TIME MULTIPLIER =================
var timeMultiplier = 1; // 1 = normal

// ================= ESTADO =================
var sistemaActivo = false;
var fase = "IDA";
var idaScore = { blue: 0, red: 0 };
var bloqueo = false;
var enPausa = false;
var idaTermino = false; // ✅ para !ida
var powerKicksLeft = {};

var lastScore = { blue: 0, red: 0, time: 0 };
var lastScoreValido = false;

var vueltaConEquiposInvertidos = false;

// ✅ Penales solo si GLOBAL empata
var penalesHabilitados = false;

// ✅ Identidad real de la serie (para global sin confusión)
var serieTeamOf = {};        // playerId -> 1 o 2 (equipos del momento de !on)
var serieGoals = {1:0, 2:0}; // goles globales por equipo real
var serieLabel = {1:"🔴 ROJO (IDA)", 2:"🔵 AZUL (IDA)"}; // nombres para mostrar

// ================= CAPITANES + CAMBIOS =================
// 1 = ROJO (real), 2 = AZUL (real)
var capitan = { 1: null, 2: null };        // id del capitán por equipo REAL
var cambioUsado = { 1: false, 2: false };  // 1 cambio por equipo por serie

function realToPhysicalTeam(realTeam){
  // cuando ya estamos en VUELTA (swap aplicado), lo físico está invertido
  return vueltaConEquiposInvertidos ? (realTeam === 1 ? 2 : 1) : realTeam;
}

// ✅ IMPORTANTE: durante "bloqueo" (transición IDA->VUELTA) AÚN NO se aplicó swapEquipos.
// En ese momento, aunque vueltaConEquiposInvertidos ya esté true, los equipos físicos siguen siendo de IDA.
function realToPhysicalTeamNow(realTeam){
  if(vueltaConEquiposInvertidos && bloqueo) return realTeam; // todavía en layout IDA
  return realToPhysicalTeam(realTeam);
}

// conversión física->real (considerando el mismo caso especial de bloqueo)
function physicalToRealTeamNow(physicalTeam){
  if(physicalTeam === 0) return 0;
  if(vueltaConEquiposInvertidos && bloqueo) return physicalTeam; // todavía en layout IDA
  return vueltaConEquiposInvertidos ? (physicalTeam === 1 ? 2 : 1) : physicalTeam;
}

function captainRealTeamOfPlayer(p){
  if(p.id === capitan[1]) return 1;
  if(p.id === capitan[2]) return 2;
  return 0;
}

function setCaptain(realTeam, playerId){
  if(capitan[realTeam] && capitan[realTeam] !== playerId){
    try{ room.setPlayerAvatar(capitan[realTeam], ""); }catch(e){}
  }
  capitan[realTeam] = playerId;
  try{ room.setPlayerAvatar(playerId, "🧢"); }catch(e){}
}

function clearCaptain(realTeam){
  if(capitan[realTeam]){
    try{ room.setPlayerAvatar(capitan[realTeam], ""); }catch(e){}
  }
  capitan[realTeam] = null;
}

function moveRealTeamToSpec(realTeam){
  room.getPlayerList().forEach(p=>{
    if(p.team !== 0 && serieTeamOf[p.id] === realTeam){
      room.setPlayerTeam(p.id, 0);
    }
  });
}

// ================= CONTROL EXTRA =================
var extraEnCuenta = false;
var extraActivo = false;
var extraBase = 0;
var extraReal = 0;
var extraEndTime = 0;
var golDobleTeamReal = 0;           // si no lo usas puedes borrarlo
var golDobleUsos = 0;    
// ================= STATS (global) =================
var goles = {}, asistencias = {}, autogoles = {}, tiempo = {}, racha = {};
var ultimoGol = null, ultimoTocador = null, penultimoTocador = null;
var ultimoTocadorTime = 0, penultimoTocadorTime = 0;

var jugoIda = new Set(), jugoVuelta = new Set();

// ================= STATS (por partido para MVP) =================
var golesPartido = {}, asistPartido = {}, ogPartido = {}, tiempoPartido = {};

// ================= CAMISETAS =================
function ponerCamisetas() {
  room.setTeamColors(1, 1, 0x0033A0, [0xFFFFFF], 90);
  room.setTeamColors(2, 0, 0xF5F5DC, [0x8B0000], 0);
}

// ================= NARRACIÓN =================
var narracionesGol = [
  "⚽🔥 GOOOOLAZO de {p}", "🚀 Misil imparable de {p}", "🎯 Definición perfecta de {p}",
  "💥 Remate letal de {p}", "🧠 Gol inteligente de {p}", "⚡  AQQ Rayo al arco de {p}",
  "🥶 Frialdad total de {p}", "🎉 Explota el estadio, gol de {p}"
];
function narrarGol(nombre) {
  var frase = narracionesGol[Math.floor(Math.random()*narracionesGol.length)];
  room.sendChat(frase.replace("{p}", nombre));
}
function anunciarGolesEspecialesPorPartido(nombre, n){
  if(n === 6) room.sendChat(`💎⚽ SEXTETE BESTIAL de ${nombre}! (6)`);
  if(n === 7) room.sendChat(`🚨⚽⚽⚽ LOCURA TOTAL: ${nombre} lleva 7 GOLES!`);
  if(n === 8) room.sendChat(`👑🔥 HISTÓRICO: ${nombre} METIÓ 8 GOLES!!!`);
}

// ================= CUENTA REGRESIVA (3s) =================
function cuentaRegresiva3(cb) {
  qLines(["⏳ 3...", "⏳ 2...", "⏳ 1..."]);
  setTimeout(()=>{ if(cb) cb(); }, 900);
}

// ================= CAMBIO DE ARCO (SWAP EQUIPOS) =================
function swapEquipos(){
  let players = room.getPlayerList();
  players.forEach(p=>{
    if(p.team === 1) room.setPlayerTeam(p.id, 2);
    else if(p.team === 2) room.setPlayerTeam(p.id, 1);
  });
}
function randomPlayerFromSerieTeam(teamReal){
  let players = room.getPlayerList().filter(p => p.team !== 0);
  let pool = players.filter(p => serieTeamOf[p.id] === teamReal);
  if(pool.length === 0) return null;
  return pool[Math.floor(Math.random()*pool.length)];
}

// ================= MVP =================
function MVPFromMaps(ids, titulo, gMap, aMap, tMap, ogMap, instant){
if(!ids || ids.length === 0) return null;


  ids = ids.filter(id => room.getPlayerList().some(p=>p.id===id) || true);
  ids.sort((a,b)=>
    (gMap[b]||0)-(gMap[a]||0) ||
    (aMap[b]||0)-(aMap[a]||0) ||
    (tMap[b]||0)-(tMap[a]||0)
  );

  let topId = ids[0];
  let p = room.getPlayerList().find(x=>x.id===topId) || {name: `ID ${topId}`};

  let g = (gMap[topId]||0);
  let a = (aMap[topId]||0);
  let og = (ogMap[topId]||0);

  let lines = [
    decoTop(),
    "🏆 " + titulo,
    "👑 " + p.name,
    "⚽ Goles: " + g + " | 🎁 Asistencias: " + a,
    "😵 Autogoles: " + og,
    decoBot()
  ];

  if(instant) burstLines(lines);
  else qLines(lines);                                                      return topId;
  
}

function MVP_IDA(){ return MVPFromMaps([...jugoIda], "MVP DE LA IDA", golesPartido, asistPartido, tiempoPartido, ogPartido, false); }
function MVP_VUELTA(){ return MVPFromMaps([...jugoVuelta], "MVP DE LA VUELTA", golesPartido, asistPartido, tiempoPartido, ogPartido, true); }
function MVP_SERIE(){ return MVPFromMaps(Object.keys(goles).map(Number), "MVP DE LA SERIE", goles, asistencias, tiempo, autogoles, true); }



// ================= RESET PARTIDO =================
function resetPorPartido(){
  TIEMPO_REGLA = 120;
 var tiempoDelta = 0;

 function endRegTime(){
  return TIEMPO_REGLA + (tiempoDelta|0);
 }

  extraEnCuenta = false;
  extraActivo = false;
  extraBase = 0;
  extraReal = 0;
  extraEndTime = 0;

  lastScoreValido = false;
  lastScore = { blue: 0, red: 0, time: 0 };

  ultimoTocador = null;
  penultimoTocador = null;
  ultimoTocadorTime = 0;
  penultimoTocadorTime = 0;

  golesPartido = {};
  asistPartido = {};
  ogPartido = {};
  tiempoPartido = {};
  ultimoGol = null;
  racha = {};                               
    // ---- TIENDA EFECTOS POR PARTIDO ----
  tiempoDelta = 0;
  virtualExtra = { blue:0, red:0 };
  golDobleTeamReal = 0;
  golDobleUsos = 0;
 golDobleUntil = 0; // timestamp ms hasta cuándo dura el gol doble

  // no resetear powerKicksLeft global aquí (depende del jugador), pero lo normal es resetear:
  powerKicksLeft = {};
  // reset del límite de poderes por equipo para ESTE partido (según fase actual)
 if(fase === "IDA" || fase === "VUELTA"){
  teamPowerUsed[fase] = { 1:false, 2:false };
  }   

}

// ================= GAME START =================
room.onGameStart = function () {
  bloqueo = false;
  ponerCamisetas();
  resetPorPartido();
  tiempoDelta = 0;

  // ✅ Anunciar capitanes al iniciar (CAPITANES REALES)
  let capR = capitan[1] ? getNameById(capitan[1]) : "—";
  let capB = capitan[2] ? getNameById(capitan[2]) : "—";
  room.sendChat(`🧢 CAPITANES | 🔴 ROJO: ${capR}  |  🔵 AZUL: ${capB}`);

  room.getPlayerList().forEach(p=>{
    if(p.team !== 0){
      if(fase==="IDA") jugoIda.add(p.id);
      if(fase==="VUELTA") jugoVuelta.add(p.id);
    }
  });
};

// ================= PAUSA =================
room.onGamePause = ()=> enPausa = true;
room.onGameUnpause = ()=> enPausa = false;

// ================= CONTADOR TIEMPO =================
setInterval(()=>{
  if(!sistemaActivo || bloqueo || enPausa) return;

  for(let i = 0; i < timeMultiplier; i++){
    room.getPlayerList().forEach(p=>{
      if(p.team!==0){
        tiempo[p.id] = (tiempo[p.id]||0) + 1;
        tiempoPartido[p.id] = (tiempoPartido[p.id]||0) + 1;

        if(fase==="IDA") jugoIda.add(p.id);
        if(fase==="VUELTA") jugoVuelta.add(p.id);
      }
    });
  }
},1000);

// ================= RECORDATORIO CAPITANES (PM cada 35s) =================
setInterval(()=>{
  if(!sistemaActivo || fase === "FIN") return;

  [1,2].forEach(rt=>{
    let capId = capitan[rt];
    if(!capId) return;

    // debe estar conectado
    let capP = room.getPlayerList().find(p=>p.id===capId);
    if(!capP) return;

    // si ya usó cambio, no recordar
    if(cambioUsado[rt]) return;

    pm(capId, `🧢 Capitán ${rt===1?"🔴 ROJO":"🔵 AZUL"}: tienes 1 cambio ✅ Usa: !cambio "Sale" "Entra" (si no pones Entra, entra espectador al azar)`);
  });
}, 35000);

// ================= TOQUES =================
room.onPlayerBallKick = p=>{
  if(p.team===0) return;
    // ===== POWER x2 (3 toques) =====
  if(powerKicksLeft[p.id] && powerKicksLeft[p.id] > 0){
    powerKicksLeft[p.id]--;

    // duplicar velocidad de la pelota justo después del kick
    setTimeout(()=>{
      try{
        let d = room.getDiscProperties(0);
        if(!d) return;
        room.setDiscProperties(0, {
          xspeed: (d.xspeed||0) * 2,
          yspeed: (d.yspeed||0) * 2
        });
      }catch(e){}
    }, 0);

    if(powerKicksLeft[p.id] === 0){
      room.sendChat(`💥 ${p.name} terminó su POWER x2.`);
    }
  }

  // penales
  if(penalActivo){
    if(p.id === penShooterId){
      penShooterKickTime = Date.now();
      penKeeperTouched = false;

      lastBallPos = room.getBallPosition();
      lastBallMoveTime = Date.now();
    } else if(p.id === penKeeperId){
      if(penShooterKickTime > 0 && (Date.now() - penShooterKickTime) <= PENAL_TOUCH_WINDOW_MS){
        penKeeperTouched = true;
      }
    }
  }

  penultimoTocador = ultimoTocador;
  penultimoTocadorTime = ultimoTocadorTime;

  ultimoTocador = p;
  ultimoTocadorTime = Date.now();
};
var tiempoDelta = 0;
function endRegTime(){
  return TIEMPO_REGLA + (tiempoDelta|0);
}

// ================= GAME TICK =================
room.onGameTick = function(){
  if(penalActivo){
    penTryResolveMissByBall();
    return;
  }

  if(!sistemaActivo) return;

  let s = room.getScores();
  if(!s) return;

  lastScore.blue = s.blue;
  lastScore.red = s.red;
  lastScore.time = s.time;
  lastScoreValido = true;

  // ✅ activar tiempo extra al llegar al reglamentario real
  if(!extraActivo && !extraEnCuenta && s.time >= endRegTime()){
    let diff = Math.abs(s.blue - s.red);

    if(diff >= 4){ room.stopGame(); return; }
    if(diff === 3 && Math.random() < 0.60){ room.stopGame(); return; }

    extraEnCuenta = true;
    room.pauseGame(true);

    qLines([decoTop(), "⏱️ FIN DEL REGLAMENTARIO (" + TIEMPO_REGLA + "s)", "⚡ TIEMPO EXTRA EN:", decoBot()]);

    cuentaRegresiva3(()=>{
      extraBase = EXTRAS_POSIBLES[Math.floor(Math.random()*EXTRAS_POSIBLES.length)];
      extraReal = extraBase + CUENTA_EXTRA;
      extraEndTime = endRegTime() + extraReal;

      extraActivo = true;

      qLines([
        decoTop(),
        "✨ TIEMPO EXTRA",
        "➕ Base: " + extraBase + "s  |  ⏳ +" + CUENTA_EXTRA + "s = " + extraReal + "s",
        "🏁 Termina en: " + extraEndTime + "s",
        decoBot()
      ]);

      room.pauseGame(false);
    });
  }

  // ✅ fin del partido al terminar el extra
  if(extraActivo && s.time >= extraEndTime){
    room.stopGame();
  }
};

// ================= GOLES =================
room.onTeamGoal = function(team){

  // =============== PENALES ===============
  if(penalActivo){
    if(!penAttemptLive) return;
    penAttemptLive = false;

    let logicalKickTeam = penTurnTeam;
    let kickReal = mapTeam(logicalKickTeam);
    let defReal  = (kickReal === 1 ? 2 : 1);

    penShots[logicalKickTeam]++;

    let kp = penPlayerById(penKeeperId);
    let sp = penPlayerById(penShooterId);

    if(team === kickReal){
      penGoals[logicalKickTeam]++;
      penResolveAndNext(`✅ GOL de ${sp ? sp.name : "el tirador"}!`);
    } else if(team === defReal){
      if(penKeeperTouched) penResolveAndNext(`🧤 ATAJÓ ${kp ? kp.name : "el arquero"}!`);
      else penResolveAndNext(`❌ ERRÓ ${sp ? sp.name : "el tirador"}!`);
    } else {
      penResolveAndNext("⚠️ Resultado raro (fin del intento).");
    }
    return;
  }

  // =============== PARTIDO NORMAL ===============
  if(!sistemaActivo || !ultimoTocador) return;

  // Autogol
if(ultimoTocador.team !== team){
  autogoles[ultimoTocador.id] = (autogoles[ultimoTocador.id]||0) + 1;
  ogPartido[ultimoTocador.id] = (ogPartido[ultimoTocador.id]||0) + 1;

  room.sendChat("😵 AUTOGOL de " + ultimoTocador.name);


  // equipo REAL del que hizo el autogol
  let ogReal = serieTeamOf[ultimoTocador.id];
  if(ogReal !== 1 && ogReal !== 2){
    ogReal = physicalToRealTeamNow(ultimoTocador.team); // fallback seguro
  }

  // el beneficiado REAL es el contrario
  let benefReal = (ogReal === 1) ? 2 : (ogReal === 2 ? 1 : 0);

  // suma el gol al GLOBAL (equipo beneficiado)
  if(benefReal){
    serieGoals[benefReal]++;

    // ===== GOL DOBLE (afecta a ambos equipos) =====
    let now = Date.now();
    if(now >= (golDobleStartAt||0) && now < (golDobleUntil||0)){
      serieGoals[benefReal]++;

      if(team === 1) virtualExtra.red++;
      if(team === 2) virtualExtra.blue++;

      room.sendChat("⚽✨ GOL DOBLE APLICADO (+1 extra al GLOBAL)");
    }
  } else {
    room.sendChat("⚠️ No pude detectar equipo real del autogol (no se sumó al GLOBAL).");
  }
  // ====== PAGAR BETS ESPECIALES !autogol ======
(function payAutogolSpecialBets(ogPlayer){
  let ogAuth = getAuth(ogPlayer);
  if(!ogAuth) return;

  Object.keys(specialBets).forEach(k=>{
    let sb = specialBets[k];
    if(!sb) return;

    // !autogol partido
    if(sb.autogolMatch && sb.autogolMatch.targetAuth === ogAuth){
      let payout = Math.floor(sb.autogolMatch.amount * AUTOGOL_MATCH_MULT);
      addCoinsByAuth(k, payout);

      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `✅ GANASTE !autogol (PARTIDO): ${sb.autogolMatch.targetName} hizo autogol | +${payout} (x${AUTOGOL_MATCH_MULT}) | Saldo: ${getCoinsByAuth(k)}`);
      });

      clearSpecialBet(k, "autogolMatch");
    }

    // !autogol fase (ida/vuelta)
    if(sb.autogolPhase && sb.autogolPhase.phase === fase && sb.autogolPhase.targetAuth === ogAuth){
      let payout = Math.floor(sb.autogolPhase.amount * AUTOGOL_PHASE_MULT);
      addCoinsByAuth(k, payout);

      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `✅ GANASTE !autogol ${fase}: ${sb.autogolPhase.targetName} hizo autogol | +${payout} (x${AUTOGOL_PHASE_MULT}) | Saldo: ${getCoinsByAuth(k)}`);
      });

      clearSpecialBet(k, "autogolPhase");
    }
  });
})(ultimoTocador);

  return;
}



  // Gol normal
  let s = ultimoTocador;
  narrarGol(s.name);
// ====== PAGAR BETS ESPECIALES !gol (solo goles normales) ======
(function payGolSpecialBets(scorer){
  let scorerAuth = getAuth(scorer);
  if(!scorerAuth) return;

  // recorre todos los apostadores
  Object.keys(specialBets).forEach(k=>{
    let sb = specialBets[k];
    if(!sb) return;
    
    // !gol (partido actual)
    if(sb.golMatch && sb.golMatch.targetAuth === scorerAuth){
      let payout = Math.floor(sb.golMatch.amount * GOL_MATCH_MULT);
      addCoinsByAuth(k, payout);

      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `✅ GANASTE !gol: ${sb.golMatch.targetName} metió gol | +${payout} (x${GOL_MATCH_MULT}) | Saldo: ${getCoinsByAuth(k)}`);
      });

      clearSpecialBet(k, "golMatch");
    }

    // !gol ida/vuelta (fase específica)
    if(sb.golPhase && sb.golPhase.targetAuth === scorerAuth && sb.golPhase.phase === fase){
      let payout = Math.floor(sb.golPhase.amount * GOL_PHASE_MULT);
      addCoinsByAuth(k, payout);

      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `✅ GANASTE !gol ${sb.golPhase.phase}: ${sb.golPhase.targetName} metió gol | +${payout} (x${GOL_PHASE_MULT}) | Saldo: ${getCoinsByAuth(k)}`);
      });

      clearSpecialBet(k, "golPhase");
    }
  });
})(s);

  goles[s.id] = (goles[s.id]||0) + 1;
  // ====== PAGAR BET ESPECIAL !goles N (SERIE: suma IDA+VUELTA) ======
(function payGolesSerieBets(scorer){
  let scorerAuth = getAuth(scorer);
  if(!scorerAuth) return;

  let totalGolesSerie = (goles[scorer.id] || 0); // ya incrementado arriba

  Object.keys(specialBets).forEach(k=>{
    let sb = specialBets[k];
    if(!sb || !sb.golesSerie) return;

    let bet = sb.golesSerie;

    if(bet.targetAuth !== scorerAuth) return;

    let n = bet.n|0;
    let mult = GOLES_MULT[n];
    if(!mult) return;

    if(totalGolesSerie >= n){
      let payout = Math.floor(bet.amount * mult);
      addCoinsByAuth(k, payout);

      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `✅ GANASTE !goles ${n} (SERIE): ${bet.targetName} llegó a ${totalGolesSerie} goles | +${payout} (x${mult}) | Saldo: ${getCoinsByAuth(k)}`);
      });

      clearSpecialBet(k, "golesSerie");
    }
  });
})(s);

 awardCoinsPlayer(s, COIN_GOL, "Gol");

  golesPartido[s.id] = (golesPartido[s.id]||0) + 1;
  let gp = golesPartido[s.id];

  let realTeam = serieTeamOf[s.id];
  if(realTeam === 1) serieGoals[1]++; else if(realTeam === 2) serieGoals[2]++;
    // ===== GOL DOBLE (afecta a ambos equipos) =====
 let now = Date.now();
 if(now >= golDobleStartAt && now < golDobleUntil){
  if(realTeam === 1) serieGoals[1]++; else if(realTeam === 2) serieGoals[2]++;

  if(team === 1) virtualExtra.red++;
  if(team === 2) virtualExtra.blue++;

  room.sendChat("⚽✨ GOL DOBLE APLICADO (+1 extra al GLOBAL)");
 }



  if(gp === 3) room.sendChat(`🎩⚽ HATTRICK de ${s.name}!`);
  if(gp === 4) room.sendChat(`🔥⚽ PÓKER de ${s.name}!`);
  if(gp === 5) room.sendChat(`👑⚽ REPOKER de ${s.name}!`);
  if(gp === 6 || gp === 7 || gp === 8) anunciarGolesEspecialesPorPartido(s.name, gp);

  var ventanaEntreToques = 6000;
  if(
    penultimoTocador &&
    penultimoTocador.team === s.team &&
    penultimoTocador.id !== s.id &&
    penultimoTocadorTime > 0 &&
    (ultimoTocadorTime - penultimoTocadorTime) <= ventanaEntreToques
  ){
    asistencias[penultimoTocador.id] = (asistencias[penultimoTocador.id]||0) + 1;
    asistPartido[penultimoTocador.id] = (asistPartido[penultimoTocador.id]||0) + 1;
    room.sendChat("🎁 Asistencia de " + penultimoTocador.name);
  }

  if(ultimoGol===s.id){
    racha[s.id] = (racha[s.id]||1) + 1;
    if(racha[s.id]===2) room.sendChat("🔥 Está en racha!");
  } else {
    ultimoGol = s.id;
    racha[s.id] = 1;
  }
};

// ================= GAME STOP =================
room.onGameStop = function(){
  timeMultiplier = 1;

  if(stopFuePenal){ stopFuePenal = false; return; }
  if(!sistemaActivo) return;
  if(!lastScoreValido) return;

  let s = {
  blue: lastScore.blue + (virtualExtra.blue||0),
  red:  lastScore.red  + (virtualExtra.red||0)
 };
 function closeGolesSerieBets(){
  Object.keys(specialBets).forEach(k=>{
    let sb = specialBets[k];
    if(!sb || !sb.golesSerie) return;

    let bet = sb.golesSerie;

    connectedPlayersByKey(k).forEach(p=>{
      pm(p.id, `❌ Perdiste !goles ${bet.n} (SERIE): ${bet.targetName} no llegó a ${bet.n} goles en toda la serie.`);
    });

    clearSpecialBet(k, "golesSerie");
  });
}

  // ====== CERRAR BETS ESPECIALES !gol (los que no ganaron) ======
(function closeGolSpecialBets(){
  Object.keys(specialBets).forEach(k=>{
    let sb = specialBets[k];
    if(!sb) return;

    // pierde el !mvp partido al terminar este partido
    if(sb.mvpMatch){
      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `❌ Perdiste !mvp (PARTIDO): ${sb.mvpMatch.targetName} no fue MVP.`);
      });
      clearSpecialBet(k, "mvpMatch");
    }

    // pierde el !mvp IDA/VUELTA si justo terminó esa fase
    if(sb.mvpPhase && sb.mvpPhase.phase === fase){
      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `❌ Perdiste !mvp ${sb.mvpPhase.phase}: ${sb.mvpPhase.targetName} no fue MVP.`);
      });
      clearSpecialBet(k, "mvpPhase");
    }

    // pierde el !gol (partido actual) al terminar este partido
    if(sb.golMatch){
      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `❌ Perdiste !gol: ${sb.golMatch.targetName} no metió gol en este partido.`);
      });
      clearSpecialBet(k, "golMatch");
    }

    // pierde el !gol IDA/VUELTA si justo terminó esa fase
    if(sb.golPhase && sb.golPhase.phase === fase){
      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `❌ Perdiste !gol ${sb.golPhase.phase}: ${sb.golPhase.targetName} no metió gol.`);
      });
      clearSpecialBet(k, "golPhase");
    }

    // ================= AUTOGOL (ACA VA LA 4) =================

    // pierde el !autogol partido al terminar este partido
    if(sb.autogolMatch){
      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `❌ Perdiste !autogol (PARTIDO): ${sb.autogolMatch.targetName} no hizo autogol.`);
      });
      clearSpecialBet(k, "autogolMatch");
    }

    // pierde el !autogol IDA/VUELTA si justo terminó esa fase
    if(sb.autogolPhase && sb.autogolPhase.phase === fase){
      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `❌ Perdiste !autogol ${sb.autogolPhase.phase}: ${sb.autogolPhase.targetName} no hizo autogol.`);
      });
      clearSpecialBet(k, "autogolPhase");
    }

  });
})();




 // ✅ Ganancia por resultado del PARTIDO (no global)
 if(s.blue === s.red){
  awardCoinsAllPlaying(COIN_DRAW, "Empate (Partido)");
 } else {
  let winnerPhysical = (s.red > s.blue) ? 1 : 2; // rojo=1, azul=2
  awardCoinsTeamByPhysical(winnerPhysical, COIN_WIN, "Victoria (Partido)");
 }
  if(fase === "IDA"){
    idaScore.blue = s.blue;
    idaScore.red = s.red;
    idaTermino = true;
    qChat(`🏁 🔵 IDA → ${idaScore.blue} - ${idaScore.red} 🔴 🏁`);
    let mvpId = MVP_IDA();
    // ====== PAGAR BETS !mvp (PARTIDO y FASE IDA) ======
(function payMvpBets(mvpPlayerId){
  if(!mvpPlayerId) return;

  let mvpP = room.getPlayerList().find(p=>p.id===mvpPlayerId);
  if(!mvpP) return;

  let mvpAuth = getAuth(mvpP);
  if(!mvpAuth) return;

  Object.keys(specialBets).forEach(k=>{
    let sb = specialBets[k];
    if(!sb) return;

    // !mvp partido (IDA termina aquí)
    if(sb.mvpMatch && sb.mvpMatch.targetAuth === mvpAuth){
      let payout = Math.floor(sb.mvpMatch.amount * MVP_MATCH_MULT);
      addCoinsByAuth(k, payout);

      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `✅ GANASTE !mvp (PARTIDO): ${sb.mvpMatch.targetName} fue MVP | +${payout} (x${MVP_MATCH_MULT}) | Saldo: ${getCoinsByAuth(k)}`);
      });

      clearSpecialBet(k, "mvpMatch");
    }

    // !mvp ida
    if(sb.mvpPhase && sb.mvpPhase.phase === "IDA" && sb.mvpPhase.targetAuth === mvpAuth){
      let payout = Math.floor(sb.mvpPhase.amount * MVP_PHASE_MULT);
      addCoinsByAuth(k, payout);

      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `✅ GANASTE !mvp IDA: ${sb.mvpPhase.targetName} fue MVP | +${payout} (x${MVP_PHASE_MULT}) | Saldo: ${getCoinsByAuth(k)}`);
      });

      clearSpecialBet(k, "mvpPhase");
    }
  });
})(mvpId);
mvpAuthIDA = null;
if(mvpId){
  let pMvp = room.getPlayerList().find(p=>p.id===mvpId);
  if(pMvp) mvpAuthIDA = getAuth(pMvp);
}


 if(mvpId){
  let pMvp = room.getPlayerList().find(p=>p.id===mvpId);
  if(pMvp) awardCoinsPlayer(pMvp, COIN_MVP, "MVP");
 }


    // ✅ desde aquí marcamos que en VUELTA será invertido (pero el swap se hace luego)
    vueltaConEquiposInvertidos = true;
    qChat("🔄 CAMBIO DE ARCO: 🔵↔🔴 (se invierten equipos)");

    fase = "VUELTA";
    bloqueo = true;

    qChat("⏳ Cambio de partido...");
    qChat("🔁 VUELTA inicia en 3 segundos");

    setTimeout(()=>{
      swapEquipos();
      bloqueo = false;
      room.setScoreLimit(0);
      room.setTimeLimit(0);
      room.startGame();
    }, DELAY_VUELTA_MS);

    return;
  }

  if(fase === "VUELTA"){
    burstChat(`🏁 🔁 VUELTA → ${s.blue} - ${s.red} 🏁`);
    let mvpV = MVP_VUELTA();
    mvpAuthVUELTA = null;
if(mvpV){
  let pMvp = room.getPlayerList().find(p=>p.id===mvpV);
  if(pMvp) mvpAuthVUELTA = getAuth(pMvp);
}

    // ====== PAGAR BETS !mvp (PARTIDO y FASE VUELTA) ======
(function payMvpBets(mvpPlayerId){
  if(!mvpPlayerId) return;

  let mvpP = room.getPlayerList().find(p=>p.id===mvpPlayerId);
  if(!mvpP) return;

  let mvpAuth = getAuth(mvpP);
  if(!mvpAuth) return;

  Object.keys(specialBets).forEach(k=>{
    let sb = specialBets[k];
    if(!sb) return;

    // !mvp partido (VUELTA termina aquí)
    if(sb.mvpMatch && sb.mvpMatch.targetAuth === mvpAuth){
      let payout = Math.floor(sb.mvpMatch.amount * MVP_MATCH_MULT);
      addCoinsByAuth(k, payout);

      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `✅ GANASTE !mvp (PARTIDO): ${sb.mvpMatch.targetName} fue MVP | +${payout} (x${MVP_MATCH_MULT}) | Saldo: ${getCoinsByAuth(k)}`);
      });

      clearSpecialBet(k, "mvpMatch");
    }

    // !mvp vuelta
    if(sb.mvpPhase && sb.mvpPhase.phase === "VUELTA" && sb.mvpPhase.targetAuth === mvpAuth){
      let payout = Math.floor(sb.mvpPhase.amount * MVP_PHASE_MULT);
      addCoinsByAuth(k, payout);

      connectedPlayersByKey(k).forEach(p=>{
        pm(p.id, `✅ GANASTE !mvp VUELTA: ${sb.mvpPhase.targetName} fue MVP | +${payout} (x${MVP_PHASE_MULT}) | Saldo: ${getCoinsByAuth(k)}`);
      });

      clearSpecialBet(k, "mvpPhase");
    }
  });
})(mvpV);

if(mvpV){
  let pMvp = room.getPlayerList().find(p=>p.id===mvpV);
  if(pMvp) awardCoinsPlayer(pMvp, COIN_MVP, "MVP");
}
    let A = serieGoals[1];
    let B = serieGoals[2];

    burstLines([
      decoTop(),
      "🌍 RESULTADO GLOBAL (POR GOLES REALES)",
      `${serieLabel[1]} ${A} ─ ${B} ${serieLabel[2]}`,
      decoBot()
    ]);

// ✅ PAGO APUESTAS por GLOBAL (IDA+VUELTA)
// ROJO real = serieGoals[1] | AZUL real = serieGoals[2]
// OJO: pick "red/blue/draw" lo definimos por el marcador GLOBAL
if(apuestasSerieActiva && !apuestasPagadas){
  let outcomePick = (A > B) ? "red" : (B > A) ? "blue" : "draw";
  settleBets(outcomePick);
  betClose();
apuestasPagadas = true;
apuestasSerieActiva = false;
apuestasPorAuth = {};

}
// ✅ CERRAR !goles (serie completa) si no se cumplió
closeGolesSerieBets();
    let mvpS = MVP_SERIE();
    settleMvpAnyLegBets(mvpAuthIDA, mvpAuthVUELTA);


if(mvpS){
  let pMvp = room.getPlayerList().find(p=>p.id===mvpS);
  if(pMvp) awardCoinsPlayer(pMvp, COIN_MVP, "MVP (Serie)");
}

    if(A > B){
      penalesHabilitados = false;

      burstChat(`🏆🔥 GANADOR GLOBAL: ${serieLabel[1]}`);
      let elegido = randomPlayerFromSerieTeam(1);
      if(elegido) burstChat(`🎲 SACA A: ${elegido.name}`);

      // ✅ perdedor a spec + capitán pierde cargo (SOLO AL FINAL DE LA SERIE)
      moveRealTeamToSpec(2);
      clearCaptain(2);

      burstChat("⛔ SERIE TERMINADA");
      sistemaActivo = false; fase = "FIN";
      openBetsAfterSeries(PRE_BETS_SECS);

    } else if(B > A){
      penalesHabilitados = false;

      burstChat(`🏆🔥 GANADOR GLOBAL: ${serieLabel[2]}`);
      let elegido = randomPlayerFromSerieTeam(2);
      if(elegido) burstChat(`🎲 SACA A: ${elegido.name}`);

      // ✅ perdedor a spec + capitán pierde cargo (SOLO AL FINAL DE LA SERIE)
      moveRealTeamToSpec(1);
      clearCaptain(1);

      burstChat("⛔ SERIE TERMINADA");
      sistemaActivo = false; fase = "FIN";
      openBetsAfterSeries(PRE_BETS_SECS);

    } else {
      // ✅ empate => nadie pierde capitán
      burstChat("🤝 EMPATE GLOBAL (NO HAY GANADOR)");
      burstChat("🧤 Cada equipo elige su arquero con: !arquero");
      burstChat("🔁 Si te equivocas: !noarquero");
      burstChat("✅ Cuando estén los 2 arqueros, el ADMIN usa: !penal");

      penalesHabilitados = true;
      keeperBlueId = null;
      keeperRedId  = null;
    }
  }
};
// ================= PARTE 2/2 (CORREGIDA) =================
// ✅ Pégala DESPUÉS de la PARTE 1/2

// ===================================================================
// ===================== PENALES (FIX + REPETIR TIRADOR) ==============
// ===================================================================

var penalActivo = false;
var stopFuePenal = false;

var keeperBlueId = null; // AZUL (team 2 en ese momento)
var keeperRedId  = null; // ROJO (team 1 en ese momento)

var PENAL_BASE_SHOTS = 4;

var penShots = { 1: 0, 2: 0 };
var penGoals = { 1: 0, 2: 0 };
var penTurnTeam = 1;

var penTeamIds = { 1: [], 2: [] };
var penShooters = { 1: [], 2: [] };
var penShooterIdx = { 1: 0, 2: 0 };

var penalOriginalTeams = {};

var penShooterId = null;
var penKeeperId  = null;

var penAttemptLive = false;
var penAttemptStart = 0;
var penShooterKickTime = 0;
var penKeeperTouched = false;

var PENAL_TOUCH_WINDOW_MS = 900;
var lastBallPos = null;
var lastBallMoveTime = 0;
var PENAL_IDLE_MS = 700;
var PENAL_MAX_MS  = 20000;
var BALL_EPS2 = 0.20 * 0.20;
var PENAL_MIN_CHECK_AFTER_KICK_MS = 900;

var penSideFlip = 0;
function mapTeam(logicalTeam){
  return penSideFlip ? (logicalTeam === 1 ? 2 : 1) : logicalTeam;
}

function penPlayerById(id){
  return room.getPlayerList().find(p=>p.id===id) || null;
}
function penIsInFrozenTeam(id, logicalTeam){
  return penTeamIds[logicalTeam].indexOf(id) !== -1;
}
function penBuildFrozenTeams(){
  penTeamIds[1] = room.getPlayerList().filter(p=>p.team===1).map(p=>p.id);
  penTeamIds[2] = room.getPlayerList().filter(p=>p.team===2).map(p=>p.id);
}
function penBuildShootersFromFrozen(){
  penShooters[1] = penTeamIds[1].filter(id => id !== keeperBlueId && id !== keeperRedId);
  penShooters[2] = penTeamIds[2].filter(id => id !== keeperBlueId && id !== keeperRedId);
  penShooterIdx[1] = 0;
  penShooterIdx[2] = 0;
}

// repetir tirador si hay 1
function penNextShooter(logicalTeam, keeperId){
  let arr = penShooters[logicalTeam];
  if(!arr || arr.length === 0) return null;

  let connected = room.getPlayerList().map(p=>p.id);
  let triesMax = arr.length + 10;

  for(let tries=0; tries<triesMax; tries++){
    let id = arr[penShooterIdx[logicalTeam] % arr.length];
    penShooterIdx[logicalTeam]++;

    if(id === keeperId) continue;
    if(id === keeperBlueId || id === keeperRedId) continue;
    if(connected.indexOf(id) === -1) continue;
    if(!penIsInFrozenTeam(id, logicalTeam)) continue;

    return id;
  }
  return null;
}

function penSetOnlyShooterAndKeeper(logicalKickTeam, shooterId, keeperId){
  let kickReal = mapTeam(logicalKickTeam);
  let defReal  = (kickReal === 1 ? 2 : 1);

  room.getPlayerList().forEach(p => room.setPlayerTeam(p.id, 0));
  room.setPlayerTeam(shooterId, kickReal);
  room.setPlayerTeam(keeperId, defReal);
}

function penShowScore(){
  let phase = (penShots[1] >= PENAL_BASE_SHOTS && penShots[2] >= PENAL_BASE_SHOTS) ? "🔥 MUERTE SÚBITA" : "🎯 PENALES (4)";
  room.sendChat(`${phase} | 🔴 ${penGoals[1]} (${penShots[1]}) - (${penShots[2]}) ${penGoals[2]} 🔵`);
}

function penEarlyWinner(){
  if(penShots[1] >= PENAL_BASE_SHOTS && penShots[2] >= PENAL_BASE_SHOTS) return 0;

  let rS = penShots[1], bS = penShots[2];
  let rG = penGoals[1], bG = penGoals[2];

  let rRem = Math.max(0, PENAL_BASE_SHOTS - rS);
  let bRem = Math.max(0, PENAL_BASE_SHOTS - bS);

  if(rG > bG + bRem) return 1;
  if(bG > rG + rRem) return 2;
  return 0;
}

function penSuddenDeathWinner(){
  if(penShots[1] === penShots[2] && penShots[1] > PENAL_BASE_SHOTS){
    if(penGoals[1] > penGoals[2]) return 1;
    if(penGoals[2] > penGoals[1]) return 2;
  }
  return 0;
}

function penResetAttemptState(){
  penAttemptLive = true;
  penAttemptStart = Date.now();
  penShooterKickTime = 0;
  penKeeperTouched = false;

  lastBallPos = room.getBallPosition();
  lastBallMoveTime = Date.now();
}

function penAfterAttemptNext(){
  penSideFlip = penSideFlip ? 0 : 1;
  penTurnTeam = (penTurnTeam === 1 ? 2 : 1);
  setTimeout(penStartAttempt, 250);
}

function penFinish(winnerLogicalTeam){
  // restaurar equipos antes de cerrar
  for(let id in penalOriginalTeams) room.setPlayerTeam(Number(id), penalOriginalTeams[id]);

  penalActivo = false;
  penAttemptLive = false;

  room.setScoreLimit(0);
  room.setTimeLimit(0);

  // reset para próxima tanda
  keeperBlueId = null;
  keeperRedId  = null;
  penSideFlip  = 0;
  penalesHabilitados = false;

  let ganadorFisico = (winnerLogicalTeam === 1) ? "🔴 ROJO" : "🔵 AZUL";
  burstLines([decoTop(), "🏁 PENALES TERMINADOS", `🏆 GANADOR POR PENALES: ${ganadorFisico}`, decoBot()]);

  // ✅ convertir ganador físico -> ganador REAL (para “saca” + castigo correcto)
  let winnerReal = physicalToRealTeamNow(winnerLogicalTeam);
  let loserReal  = (winnerReal === 1 ? 2 : 1);

  let elegido = randomPlayerFromSerieTeam(winnerReal);
  if(elegido) burstChat(`🎲 SACA A: ${elegido.name}`);

  // perdedor real a spec + capitán real pierde cargo
  moveRealTeamToSpec(loserReal);
  clearCaptain(loserReal);

  burstChat("⛔ SERIE TERMINADA");
  sistemaActivo = false;
  fase = "FIN";
  openBetsAfterSeries(PRE_BETS_SECS);

}

function penResolveAndNext(message){
  if(message) room.sendChat(message);
  penShowScore();

  setTimeout(()=>{
    stopFuePenal = true;
    room.stopGame();

    let early = penEarlyWinner();
    if(early){ penFinish(early); return; }

    if(penShots[1] >= PENAL_BASE_SHOTS && penShots[2] >= PENAL_BASE_SHOTS){
      // si terminó justo el 4/4
      if(penShots[1] === PENAL_BASE_SHOTS && penShots[2] === PENAL_BASE_SHOTS){
        if(penGoals[1] > penGoals[2]) return penFinish(1);
        if(penGoals[2] > penGoals[1]) return penFinish(2);
      }

      // muerte súbita: misma cantidad >4
      let sd = penSuddenDeathWinner();
      if(sd) return penFinish(sd);
    }

    penAfterAttemptNext();
  }, 1000);
}

function penStartAttempt(){
  if(!penalActivo) return;

  let ids = room.getPlayerList().map(p=>p.id);
  if(ids.indexOf(keeperBlueId) === -1 || ids.indexOf(keeperRedId) === -1){
    room.sendChat("⚠️ Se fue un arquero. Vuelvan a elegir con !arquero");
    penalActivo = false;
    for(let id in penalOriginalTeams) room.setPlayerTeam(Number(id), penalOriginalTeams[id]);
    keeperBlueId = null; keeperRedId = null;
    return;
  }

  let logicalKickTeam = penTurnTeam;
  let keeper = (logicalKickTeam === 1 ? keeperBlueId : keeperRedId);

  let shooter = penNextShooter(logicalKickTeam, keeper);
  if(!shooter){
    room.sendChat("⚠️ Ese equipo no tiene tirador (solo arquero).");
    penFinish(logicalKickTeam === 1 ? 2 : 1);
    return;
  }

  penShooterId = shooter;
  penKeeperId  = keeper;

  let sp = penPlayerById(shooter);
  let kp = penPlayerById(keeper);

  let nShot = (logicalKickTeam === 1 ? penShots[1] : penShots[2]) + 1;
  let phaseTxt = (penShots[1] >= PENAL_BASE_SHOTS && penShots[2] >= PENAL_BASE_SHOTS)
    ? "🔥 MUERTE SÚBITA"
    : `🎯 Penal ${nShot}/${PENAL_BASE_SHOTS}`;

  qLines([
    decoTop(),
    `${phaseTxt} | Patea ${logicalKickTeam===1 ? "🔴 ROJO" : "🔵 AZUL"} (bando ${penSideFlip ? "INVERTIDO" : "NORMAL"})`,
    `⚽ Tira: ${sp ? sp.name : "?"}`,
    `🧤 Ataja: ${kp ? kp.name : "?"}`,
    decoBot()
  ]);

  stopFuePenal = true;
  room.stopGame();

  setTimeout(()=>{
    penSetOnlyShooterAndKeeper(logicalKickTeam, shooter, keeper);
    room.setScoreLimit(1);
    room.setTimeLimit(0);

    penResetAttemptState();

    stopFuePenal = true;
    room.startGame();
  }, 250);
}

function iniciarPenales(){
  if(!penalesHabilitados){
    room.sendChat("⚠️ Los penales solo se habilitan si el GLOBAL termina empatado.");
    return;
  }

  penBuildFrozenTeams();

  if(penTeamIds[1].length === 0 || penTeamIds[2].length === 0){
    room.sendChat("⚠️ Debe haber jugadores en ROJO y AZUL.");
    return;
  }

  if(!keeperBlueId || !keeperRedId){
    room.sendChat("⚠️ Falta arquero. ROJO y AZUL deben usar !arquero");
    return;
  }
  if(keeperBlueId === keeperRedId){
    room.sendChat("❌ No puede ser el MISMO arquero para ambos.");
    return;
  }

  if(!penIsInFrozenTeam(keeperBlueId, 2)){
    room.sendChat("❌ El arquero AZUL no está en AZUL ahora. Vuelvan a elegir con !arquero");
    return;
  }
  if(!penIsInFrozenTeam(keeperRedId, 1)){
    room.sendChat("❌ El arquero ROJO no está en ROJO ahora. Vuelvan a elegir con !arquero");
    return;
  }

  penalOriginalTeams = {};
  room.getPlayerList().forEach(p=>{
    if(p.team !== 0) penalOriginalTeams[p.id] = p.team;
  });

  penShots[1]=0; penShots[2]=0;
  penGoals[1]=0; penGoals[2]=0;
  penTurnTeam = 1;
  penSideFlip = 0;

  penBuildShootersFromFrozen();

  if(penShooters[1].length === 0 || penShooters[2].length === 0){
    room.sendChat("⚠️ Cada equipo debe tener AL MENOS 1 tirador (aparte del arquero).");
    return;
  }

  penalActivo = true;
  penalesHabilitados = false;

  var kBlue = penPlayerById(keeperBlueId);
  var kRed  = penPlayerById(keeperRedId);

  qLines([
    decoTop(),
    "🎯 PENALES (4 TIROS C/U)",
    `🧤 Arquero AZUL: ${kBlue ? kBlue.name : "?"}`,
    `🧤 Arquero ROJO: ${kRed ? kRed.name : "?"}`,
    "📌 Patea ROJO primero, luego AZUL",
    "🔁 Si hay 1 tirador por equipo, se REPITE en sus 4 tiros",
    decoBot()
  ]);

  penStartAttempt();
}

// detector “sin gol”
function penTryResolveMissByBall(){
  if(!penalActivo) return;
  if(!penAttemptLive) return;
  if(penShooterKickTime <= 0) return;

  let now = Date.now();
  if(now - penShooterKickTime < PENAL_MIN_CHECK_AFTER_KICK_MS) return;

  let sc = room.getScores();
  if(sc && (sc.red + sc.blue) > 0) return;

  let bp = room.getBallPosition();

  if(lastBallPos){
    let dx = bp.x - lastBallPos.x;
    let dy = bp.y - lastBallPos.y;
    if((dx*dx + dy*dy) > BALL_EPS2){
      lastBallMoveTime = now;
      lastBallPos = bp;
    }
  } else {
    lastBallPos = bp;
    lastBallMoveTime = now;
  }

  if(now - penAttemptStart > PENAL_MAX_MS){
    lastBallMoveTime = now - PENAL_IDLE_MS - 1;
  }

  if(now - lastBallMoveTime < PENAL_IDLE_MS) return;

  penAttemptLive = false;

  let logicalKickTeam = penTurnTeam;
  penShots[logicalKickTeam]++;

  let kp = penPlayerById(penKeeperId);
  let sp = penPlayerById(penShooterId);

  if(penKeeperTouched) penResolveAndNext(`🧤 ATAJÓ ${kp ? kp.name : "el arquero"}!`);
  else penResolveAndNext(`❌ ERRÓ ${sp ? sp.name : "el tirador"}!`);
}

//funcion power !usar n 
function usePowerX2(player){
  if(!canUseTeamPower(player)) return;

  if(!sistemaActivo){
    pm(player.id, "⚠️ Solo durante una serie activa.");
    return;
  }
  if(!useItem(player, 3)){
    pm(player.id, "⛔ No tienes el ítem 3.");
    return;
  }
  powerKicksLeft[player.id] = 3;
  room.sendChat(`💥 ${player.name} activó POWER x2 por 3 toques ✅`);
  markTeamPowerUsed(player);

}

// ================= !USAR N =================
// Nota: por ahora aplica efectos “seguros” sin romper tu sistema.
// Lo demás lo dejamos listo y lo terminamos cuando quieras.
function cmdUsar(player, nRaw, targetName){
  let n = parseInt(nRaw, 10);
  if(!Number.isFinite(n) || n < 1 || n > 8){
    pm(player.id, "Uso: !usar 1-8");
    return;
  }

  let have = getItem(player, n);
  if(have <= 0){
    pm(player.id, `⛔ No tienes ese ítem.`);
    return;
  }

  if(n === 1){
  if(!canUseTeamPower(player)) return;
  if(!sistemaActivo){ pm(player.id, "⚠️ Solo durante una serie activa."); return; }

  // consumir item
  if(!useItem(player, 1)){
    pm(player.id, "⛔ No tienes el ítem 1.");
    return;
  }

  // ✅ si ya estamos en EXTRA, mueve el fin del extra
  let sc = room.getScores();
  if(extraActivo && sc){
    extraEndTime += 15;
    room.sendChat(`✅ ${player.name} usó 🕒 +15s (TIEMPO EXTRA) | ahora termina en: ${extraEndTime}s`);
  } else {
    // reglamentario normal
    TIEMPO_REGLA += 15;
    room.sendChat(`✅ ${player.name} usó 🕒 +15s (nuevo reglamentario: ${TIEMPO_REGLA}s)`);
  }

  markTeamPowerUsed(player);
  return;
}


  if(n === 2){
  if(!canUseTeamPower(player)) return;
  if(!sistemaActivo){ pm(player.id, "⚠️ Solo durante una serie activa."); return; }

  // consumir item
  if(!useItem(player, 2)){
    pm(player.id, "⛔ No tienes el ítem 2.");
    return;
  }

  let sc = room.getScores();

  // ✅ si ya estamos en EXTRA, resta al final del extra
  if(extraActivo && sc){
    // no dejes que termine “instant” (mínimo +2s desde ahora)
    let minEnd = sc.time + 2;
    extraEndTime = Math.max(minEnd, extraEndTime - 10);

    room.sendChat(`✅ ${player.name} usó ⏬ -10s (TIEMPO EXTRA) | ahora termina en: ${extraEndTime}s`);
  } else {
    // reglamentario normal
    TIEMPO_REGLA = Math.max(60, TIEMPO_REGLA - 10);
    room.sendChat(`✅ ${player.name} usó ⏬ -10s (nuevo reglamentario: ${TIEMPO_REGLA}s)`);
  }

  markTeamPowerUsed(player);
  return;
}


  if(n === 3){
    usePowerX2(player);
    return;
  }

  if(n === 4){
    useGolDoble(player);
    return;
  }

  if(n === 6){
    useVoteKick(player, targetName);
    return;
  }
if(n === 7){
  // primero intenta iniciar la votación
  let ok = useVoteBan10(player, targetName);
  if(ok){
    // si inició, consumimos 1 item 7
    if(!useItem(player, 7)){
      pm(player.id, "⚠️ Error: no pude consumir el ítem 7.");
    }
  } else {
    pm(player.id, "⚠️ No se consumió.");
  }
  return;
}

if(n === 8){
  let ok = useBanPerm(player, targetName);
  if(!ok) pm(player.id, "⚠️ No se consumió.");
  return;
}

  pm(player.id, "⚠️ Ese ítem aún no está implementado en !usar. (NO se consumió)");
}

function useGolDoble(player){
  if(!canUseTeamPower(player)) return;

  if(!sistemaActivo){ pm(player.id, "⚠️ Solo durante una serie activa."); return; }
  if(penalActivo){ pm(player.id, "⛔ No durante penales."); return; }

  // ❌ si ya está activo, no refresca (evita abuso)
  let now = Date.now();
  if(now < golDobleUntil){
    let faltan = Math.ceil((golDobleUntil - now)/1000);
    pm(player.id, `⛔ Gol Doble ya está activo. Espera ${faltan}s.`);
    return;
  }

  // consumir item 4
  if(!useItem(player, 4)){
    pm(player.id, "⛔ No tienes el ítem 4.");
    return;
  }

  // ✅ Anti-snipe: empieza después de 2s (opcional pero recomendado)
  golDobleStartAt = now + 2000;      // empieza en 2s
  golDobleUntil   = golDobleStartAt + 25000; // dura 25s reales

  room.sendChat(`⚽✨ ${player.name} ACTIVÓ GOL DOBLE (25s) | afecta a AMBOS equipos ✅`);
  room.sendChat(`⏳ Empieza en 2s (anti-snipe).`);

  markTeamPowerUsed(player);
}

// ================= VOTE KICK (ITEM 6) =================
var vote = null; // { type, targetId, targetName, endsAt, yes, no, voters:{} }
var voteCooldownUntil = 0;
var VOTE_SECONDS = 20;
var VOTE_COOLDOWN_MS = 90000;
var lastVoteAt = 0;

function eligibleVotersCount(targetId){
  // ✅ cuentan TODOS (incluye admins), excepto el objetivo
  return room.getPlayerList().filter(p => p.id !== targetId).length;
}

function neededYes(targetId){
  // ✅ mayoría simple: floor(n/2)+1
  let n = eligibleVotersCount(targetId);
  return Math.max(1, Math.floor(n/2) + 1);
}




function voteEnd(force){
  if(!vote) return;

  // Snapshot por seguridad (por si luego pones vote=null)
  const v = vote;

  let need = neededYes(v.targetId);
  let passed = (v.yes >= need || yesPlayingCount() >= 4);


  if(passed){

    // Normaliza el type (por si viene con espacios raros)
    const t = ((v.type || "") + "").trim();

    if(t === "kick"){
      room.sendChat(`✅ Votación aprobada. Se kickea a ${v.targetName}.`);
      room.kickPlayer(v.targetId, "Votación aprobada", false);
    }
    else if(t === "ban10"){
      // Buscar al jugador (porque a veces targetId puede variar en algunos casos raros)
      let tp = room.getPlayerList().find(p => p.id === v.targetId) || null;

      room.sendChat(`✅ Votación aprobada (ban10).`);

      if(tp){
        // aplica el registro de ban 10 min
        applyTempBan10(tp, 10, "Votación aprobada", v.initiatorName || "");
        // y lo saca
        room.kickPlayer(tp.id, "Baneado 10 min (votación)", false);
      } else {
        room.sendChat("⚠️ No pude kickear: objetivo no encontrado en sala.");
      }
    }
    else {
      room.sendChat(`✅ Votación aprobada (${t}).`);
    }

  } else {
    room.sendChat(`❌ Votación rechazada. No pasa nada.`);
  }
    // 🔓 Restaurar modo chat al terminar votación
  if(typeof v.onlyCmdPrev !== "undefined"){
    CHAT_ONLY_COMMANDS = !!v.onlyCmdPrev;
    if(!CHAT_ONLY_COMMANDS){
      room.sendChat("✅ Chat normal restaurado (fin votación).");
    }
  }

  voteCooldownUntil = Date.now() + VOTE_COOLDOWN_MS;  
  vote = null;
}


function voteTick(){
  if(!vote) return;
  if(Date.now() >= vote.endsAt){
    voteEnd(); // ✅ voteEnd ya se encarga del kick/ban si corresponde
  }
}
setInterval(voteTick, 300);


function voteCast(player, isYes){
  if(!vote){
    pm(player.id, "⚠️ No hay votación activa.");
    return;
  }

  if(player.id === vote.targetId){
    pm(player.id, "⛔ El objetivo no puede votar.");
    return;
  }

  // ✅ primero valida AUTH
  let k = walletKey(player);
  if(!k){
    pm(player.id, "⚠️ No se pudo validar tu AUTH para votar.");
    return;
  }

  vote.voters = vote.voters || {};

  if(vote.voters[k] != null){
    pm(player.id, "⚠️ Ya votaste.");
    return;
  }

  vote.voters[k] = { yes: isYes ? 1 : 0, id: player.id, team: player.team };
  if(isYes) vote.yes++; else vote.no++;

  let need = neededYes(vote.targetId);
  room.sendChat(`🗳️ VOTO ${isYes ? "✅ SI" : "❌ NO"} de ${player.name} | SI:${vote.yes}/${need} | NO:${vote.no}`);

  let yesPlay = yesPlayingCount();
  if(vote.yes >= need || yesPlay >= 4){
    voteEnd(true);
  }
}


function useVoteKick(player, targetName){
  if(Date.now() < voteCooldownUntil){
  let faltan = Math.ceil((voteCooldownUntil - Date.now())/1000);
  pm(player.id, `⏳ Espera ${faltan}s para iniciar otra votación.`);
  return;
}

  if(vote){
    pm(player.id, "⚠️ Ya hay una votación activa. Usa !si / !no.");
    return;
  }
  if(!targetName || !targetName.trim()){
    pm(player.id, 'Uso: !usar 6 "Nombre"');
    return;
  }

  let target = findPlayerByName(targetName) || findPlayerByNameLoose(targetName);
  if(!target){
    pm(player.id, `❌ No encuentro a "${targetName}" (debe estar conectado).`);
    return;
  }
  // ✅ Anti-team abuse: si el que inicia está jugando, NO puede apuntar al otro equipo
if(player.team !== 0 && target.team !== 0 && player.team !== target.team){
  pm(player.id, "⛔ No puedes votar contra el OTRO equipo. Solo contra espectador o tu equipo.");
  return;
}

  if(target.id === player.id){
    pm(player.id, "⛔ No puedes votekickearte a ti mismo.");
    return;
  }
  if(target.admin){
    pm(player.id, "⛔ No puedes votekickear a un admin.");
    return;
  }

  // consumo del ítem 6
  if(!useItem(player, 6)){
    pm(player.id, "⛔ No tienes el ítem 6.");
    return;
  }

  // Debe haber suficientes votantes
  let elig = eligibleVotersCount(target.id);
  if(elig < 3){
    pm(player.id, "⚠️ No hay suficientes jugadores para una votación.");
    // opcional: devolver ítem si quieres:
    // addItem(player, 6, 1);
    return;
  }

  vote = {
    type: "kick",
    targetId: target.id,
    targetName: target.name,
    endsAt: Date.now() + (VOTE_SECONDS*1000),
    yes: 0,
    no: 0,
    voters: {}
  };
  // 🔇 Anti-spam: durante votación => SOLO comandos con "!"
  vote.onlyCmdPrev = CHAT_ONLY_COMMANDS; // guarda estado anterior
  if(!CHAT_ONLY_COMMANDS){
    CHAT_ONLY_COMMANDS = true;
    room.sendChat("⛔ CHAT BLOQUEADO: solo comandos (!) mientras dura la votación.");
  }

  let need = neededYes(target.id);

  room.sendChat(`🗳️ VOTEKICK iniciado por ${player.name} contra ${target.name}`);
  room.sendChat(`✅ Requiere ${need} votos SI. Duración: ${VOTE_SECONDS}s`);

  room.sendChat(`👉 Vota con: !si   o   !no`);
}
function useVoteBan10(initiator, targetName){
  if(!initiator) return false;

  // cooldown igual que el votekick
  if(Date.now() < voteCooldownUntil){
  let faltan = Math.ceil((voteCooldownUntil - Date.now())/1000);
  pm(initiator.id, `⏳ Espera ${faltan}s para iniciar otra votación.`);
  return false;
}


  // ya existe una votación (kick o ban)
  if(vote){
    pm(initiator.id, "⚠️ Ya hay una votación activa. Usa !si / !no.");
    return false;
  }

  if(!targetName || !targetName.trim()){
    pm(initiator.id, 'Uso: !usar 7 "Nombre"');
    return false;
  }

  let target = findPlayerByName(targetName) || findPlayerByNameLoose(targetName);
  if(!target){
    pm(initiator.id, `❌ No encuentro a "${targetName}" (debe estar conectado).`);
    return false;
  }
  // ✅ Anti-team abuse: si el que inicia está jugando, NO puede apuntar al otro equipo
if(initiator.team !== 0 && target.team !== 0 && initiator.team !== target.team){
  pm(initiator.id, "⛔ No puedes votar contra el OTRO equipo. Solo contra espectador o tu equipo.");
  return false;
}

  if(target.id === initiator.id){
    pm(initiator.id, "⛔ No puedes votarte a ti mismo.");
    return false;
  }

  if(target.admin){
    pm(initiator.id, "⛔ No puedes votarbanear a un admin.");
    return false;
  }

  // Debe haber suficientes votantes
  let elig = eligibleVotersCount(target.id);
  if(elig < 3){
    pm(initiator.id, "⚠️ No hay suficientes jugadores para una votación.");
    return false;
  }


  // iniciar votación usando el MISMO objeto vote del sistema actual
  vote = {
    type: "ban10",
    targetId: target.id,
    targetName: target.name,
    endsAt: Date.now() + (VOTE_SECONDS * 1000),
    yes: 0,
    no: 0,
    voters: {},
    initiatorId: initiator.id,
    initiatorName: initiator.name
  };
  // 🔇 Anti-spam: durante votación => SOLO comandos con "!"
  vote.onlyCmdPrev = CHAT_ONLY_COMMANDS; // guarda estado anterior
  if(!CHAT_ONLY_COMMANDS){
    CHAT_ONLY_COMMANDS = true;
    room.sendChat("⛔ CHAT BLOQUEADO: solo comandos (!) mientras dura la votación.");
  }

  let need = neededYes(target.id);
  room.sendChat(`🗳️ VOTEBAN 10m iniciado por ${initiator.name} contra ${target.name}`);
  room.sendChat(`✅ Requiere ${need} votos SI (no admins). Duración: ${VOTE_SECONDS}s`);
  room.sendChat(`👉 Vota con: !si   o   !no`);

  return true;
}
//===================BET================
function cmdBetMenu(player){
  pm(player.id, decoTop());
  pm(player.id, "🎲 BET — Menú de apuestas");
  pm(player.id, "👉 Para apostar usa EXACTAMENTE estos formatos:");
  pm(player.id, decoBot());

  pm(player.id, "✅ PARTIDO ACTUAL (sin ida/vuelta):");
  pm(player.id, '• !gol "Jugador" cantidad      (x1.5)');
  pm(player.id, '   Ej: !gol "Rodrigo" 200');
  pm(player.id, '• !autogol "Jugador" cantidad  (x4)');
  pm(player.id, '   Ej: !autogol "Pepe" 50');
  pm(player.id, '• !goles N "Jugador" cantidad  (N=1..6)');
  pm(player.id, '   Ej: !goles 3 "Rodrigo" 40   (3 goles paga x5)');
  pm(player.id, '• !meme "Jugador" cantidad     (x2)--en mantenimiento');
  pm(player.id, '   Ej: !meme "Luis" 100 por aora inactivo');
  pm(player.id, '• !mvp "Jugador" cantidad      (x2)');
  pm(player.id, '   Ej: !mvp "Ana" 150');

  pm(player.id, decoTop());
  pm(player.id, "✅ IDA / VUELTA (elige fase):");
  pm(player.id, '• !gol ida|vuelta "Jugador" cantidad     (x2)');
  pm(player.id, '   Ej: !gol ida "Rodrigo" 100');
  pm(player.id, '• !autogol ida|vuelta "Jugador" cantidad (x4)');
  pm(player.id, '• !meme ida|vuelta "Jugador" cantidad    (x3)--en mantenimiento');
  pm(player.id, '• !mvp ida|vuelta "Jugador" cantidad     (x3)');

  pm(player.id, decoTop());
  pm(player.id, "ℹ️ Tips:");
  pm(player.id, "• Si el nombre tiene espacios, pon comillas \" \"");
  pm(player.id, "• Revisa tu saldo con: !monedas");
  pm(player.id, "⚠️ Si apuestas están cerradas, el bot te lo dirá.");
  pm(player.id, decoBot());
}

 // ================= BET ESPECIALES: !gol =================
var specialBets = {}; 
// specialBets[bettorKey] = { 
//    golMatch: { targetAuth, targetName, amount },
//    golPhase: { phase:"IDA"|"VUELTA", targetAuth, targetName, amount }
// };
// ===== !goles N (serie completa: IDA+VUELTA) =====
var GOLES_MULT = {
  1: 1.5,   // opcional (si no quieres 1, lo puedes quitar)
  2: 2.5,
  3: 4.0,
  4: 6.0,
  5: 9.0,
  6: 12.0
};

var GOL_MATCH_MULT = 1.5;
var GOL_PHASE_MULT = 2.0;
var MVP_MATCH_MULT = 2.0;
var MVP_PHASE_MULT = 3.0;
var MVP_SERIE_MULT = 2.0; // (ajusta si quieres)
var AUTOGOL_MATCH_MULT = 4.0;
var AUTOGOL_PHASE_MULT = 4.0;


function getKey(p){
  return walletKey(p);
}

function connectedPlayersByKey(key){
  return room.getPlayerList().filter(p => walletKey(p) === key);
}

function refundSpecialBet(key, betObj, why){
  if(!betObj) return;
  addCoinsByAuth(key, betObj.amount);
  connectedPlayersByKey(key).forEach(p=>{
    pm(p.id, `↩️ Apuesta devuelta (${why}): +${betObj.amount} | Saldo: ${getCoinsByAuth(key)}`);
  });
}

function setSpecialBet(key, slot, betObj){
  if(!specialBets[key]) specialBets[key] = {};
  specialBets[key][slot] = betObj;
}

function clearSpecialBet(key, slot){
  if(specialBets[key]) delete specialBets[key][slot];

  if(specialBets[key] &&
     !specialBets[key].golMatch &&
     !specialBets[key].golPhase &&
     !specialBets[key].autogolMatch &&
     !specialBets[key].autogolPhase &&
     !specialBets[key].golesSerie &&
     !specialBets[key].mvpMatch &&
     !specialBets[key].mvpPhase &&
     !specialBets[key].mvpSerie &&
     !specialBets[key].mvpAny 
  ){
    delete specialBets[key];
  }
}
// ================== MENU APUESTAS: !apu ==================
var apuSessions = {};                // key -> { step, pick, type, list, expiresAt }
var APU_TIMEOUT_MS = 20000;

function apuKey(player){
  // walletKey suele existir en tu script; si falla, cae a id
  try{
    return walletKey(player) || ("noauth_" + player.id);
  }catch(e){
    return "noauth_" + player.id;
  }
}

function apuCancel(player, why){
  let k = apuKey(player);
  if(apuSessions[k]) delete apuSessions[k];
  pm(player.id, `⏹️ !apu cancelado (${why}). Escribe !apu para empezar de nuevo.`);
}

function apuTouch(player){
  let k = apuKey(player);
  if(apuSessions[k]) apuSessions[k].expiresAt = Date.now() + APU_TIMEOUT_MS;
}

function apuGet(player){
  return apuSessions[apuKey(player)];
}

function apuStart(player, forcedPhase){
  let k = apuKey(player);
  apuSessions[k] = {
    step: 1,
    pick: null,
    type: null,
    list: null,
    target: null,
    forcedPhase: forcedPhase || null, // "ida" | "vuelta" | null
    expiresAt: Date.now() + APU_TIMEOUT_MS
  };

  let tag = forcedPhase ? (forcedPhase === "ida" ? " (IDA)" : " (VUELTA)") : "";
  pm(player.id, `🎲 MENÚ APUESTAS${tag} (20s por paso)`);
  pm(player.id, "1) 🔴 Apostar al ROJO");
  pm(player.id, "2) 🔵 Apostar al AZUL");
  pm(player.id, "✍️ Responde con: 1 o 2  (o escribe !apu off para salir)");
}


function apuMenuType(player){
  pm(player.id, "📌 ¿Qué quieres apostar?");
  pm(player.id, "1) 🏁 Ganador del partido");
  pm(player.id, "2) ⭐ MVP");
  pm(player.id, "3) ⚽ Gol de jugador");
  pm(player.id, "4) ❌ Autogol de jugador");
  pm(player.id, "5) 🔥 Goles de jugador (SERIE)");
  pm(player.id, "✍️ Responde con: 1, 2, 3, 4 o 5");
}


function apuBuildPlayerList(){
  // solo jugadores con equipo (no specs)
  let arr = room.getPlayerList().filter(p => p.team !== 0);
  // opcional: ordenar por team y nombre
  arr.sort((a,b)=> (a.team-b.team) || a.name.localeCompare(b.name));
  return arr;
}
function apuMenuGolesN(player){
  pm(player.id, "🔥 ¿Cuántos goles apostaras que hará? (SERIE)");
  pm(player.id, "1) 1 gol");
  pm(player.id, "2) 2 goles");
  pm(player.id, "3) 3 goles");
  pm(player.id, "4) 4 goles");
  pm(player.id, "5) 5 goles");
  pm(player.id, "6) 6 goles");
  pm(player.id, "✍️ Responde con: 1 a 6");
}

function apuMenuPlayers(player, list){
  pm(player.id, "👤 Elige jugador (solo jugadores con equipo):");
  if(!list || list.length === 0){
    pm(player.id, "❌ No hay jugadores con equipo ahora.");
    return;
  }

  // manda en varias líneas para que no se corte
  for(let i=0;i<list.length;i++){
    let p = list[i];
    let t = (p.team === 1) ? "🔴" : (p.team === 2) ? "🔵" : "⚪";
    pm(player.id, `${i+1}) ${t} ${p.name}`);
  }
  pm(player.id, "✍️ Responde con el número del jugador (ej: 3)");
}

function apuAskAmount(player, min, max){
  pm(player.id, `💰 Escribe monto (${min}-${max})`);
}

function apuHandleInput(player, rawMsg){
  let s = apuGet(player);
  if(!s) return false;

  // timeout
  if(Date.now() > s.expiresAt){
    apuCancel(player, "tiempo agotado");
    return true;
  }

  let msg = (rawMsg || "").trim().toLowerCase();
  if(!msg) return true;

  // pasos esperan NUMERO
  let n = parseInt(msg, 10);
  if(!Number.isFinite(n)){
    pm(player.id, "❌ Debes responder con un número.");
    apuTouch(player);
    return true;
  }

  // STEP 1: equipo
  if(s.step === 1){
    if(n === 1){ s.pick = "red"; }
    else if(n === 2){ s.pick = "blue"; }
    else { pm(player.id, "❌ Solo 1 (rojo) o 2 (azul)."); apuTouch(player); return true; }

    s.step = 2;
    apuTouch(player);
    apuMenuType(player);
    return true;
  }

  // STEP 2: tipo
  // STEP 2: tipo
if(s.step === 2){
  if(n < 1 || n > 5){
    pm(player.id, "❌ Elige 1,2,3,4 o 5.");
    apuTouch(player);
    return true;
  }

  s.type = n;

  // 1) ganador => pedir monto 1-100
  if(s.type === 1){
    s.step = 3;
    apuTouch(player);
    apuAskAmount(player, 1, 100);
    return true;
  }

  // 5) goles de jugador (SERIE) => pedir N (1..6)
  if(s.type === 5){
    s.step = 25;          // step especial solo para elegir N
    apuTouch(player);
    apuMenuGolesN(player); // tu menú de N=1..6
    return true;
  }

  // 2/3/4 => pedir jugador
  s.list = apuBuildPlayerList();
  if(!s.list || s.list.length === 0){
    apuCancel(player, "no hay jugadores con equipo");
    return true;
  }

  s.step = 3; // ahora este step será "jugador"
  apuTouch(player);
  apuMenuPlayers(player, s.list);
  return true;
}

  // STEP 2.5: elegir N de goles (solo si type=5)
if(s.step === 25){
  let golesN = n;
  if(golesN < 1 || golesN > 6){
    pm(player.id, "❌ Elige un número válido (1-6).");
    apuTouch(player);
    return true;
  }

  s.golesN = golesN;

  // ahora pedir jugador
  s.list = apuBuildPlayerList();
  if(!s.list || s.list.length === 0){
    apuCancel(player, "no hay jugadores con equipo");
    return true;
  }

  s.step = 3; // jugador
  apuTouch(player);
  apuMenuPlayers(player, s.list);
  return true;
}


  // STEP 3:
  // - si type=1 => monto ganador
  // - si type!=1 => jugador
  if(s.step === 3 && s.type === 1){
    let amount = n;
    if(amount < 1 || amount > 100){
      pm(player.id, "❌ Monto inválido (1-100).");
      apuTouch(player);
      return true;
    }

    // cerrar menú ANTES de ejecutar el comando
    delete apuSessions[apuKey(player)];

    // ejecuta tu comando existente
    // (así no duplicas lógica ni rompes canBetNow/pay/etc.)
    room.onPlayerChat(player, `!apostar ${s.pick} ${amount}`);
    return true;
  }

  if(s.step === 3 && s.type !== 1){
    let idx = n - 1;
    if(idx < 0 || idx >= s.list.length){
      pm(player.id, "❌ Número de jugador inválido.");
      apuTouch(player);
      return true;
    }

    s.target = s.list[idx];
    s.step = 4;
    apuTouch(player);

    // monto para especiales 1-50
    apuAskAmount(player, 1, 50);
    return true;
  }

  // STEP 4: monto especiales
  if(s.step === 4){
    let amount = n;
    if(amount < 1 || amount > 50){
      pm(player.id, "❌ Monto inválido (1-50).");
      apuTouch(player);
      return true;
    }

        let t = s.target;
    if(!t){
      apuCancel(player, "sin jugador");
      return true;
    }

    // cerrar menú
    delete apuSessions[apuKey(player)];

    // si es apuida / apuvuelta, forzamos fase en comandos especiales
    let ph = s.forcedPhase ? ` ${s.forcedPhase}` : "";

    if(s.type === 2){
      room.onPlayerChat(player, `!mvp${ph} "${t.name}" ${amount}`);
    } else if(s.type === 3){
      room.onPlayerChat(player, `!gol${ph} "${t.name}" ${amount}`);
    } else if(s.type === 4){
      room.onPlayerChat(player, `!autogol${ph} "${t.name}" ${amount}`);
    }
    else if(s.type === 5){
  // !goles N "Jugador" cantidad   (serie)
  room.onPlayerChat(player, `!goles ${s.golesN} "${t.name}" ${amount}`);
   }
    return true;
  }

  // fallback
  apuCancel(player, "estado inválido");
  return true;
}
// ================== FIN MENU APUESTAS: !apu ==================

// ====== UTILIDADES / CHAT ======
function qChat(msg){
  room.sendAnnouncement(`🤖 ${msg}`, null, 0x00E5FF, "bold", 1);
}
// (tu pm normal)
function pm(id, msg){
  room.sendAnnouncement(msg, id, 0xFFA500

, "normal", 1); // celeste
}

  
// ================= CHAT =================
room.onPlayerChat = function(player,msg){
      // ====== LA 2: FILTRO CHAT (slow / solo comandos / mute) ======

  // Si está muteado
  if (muted.has(player.id)) {
    pm(player.id, "🔇 Estás muteado.");
    return false; // bloquea el mensaje
  }

      // Modo solo comandos (pero si está en menú !apu, dejamos números)
  let apuS = apuGet(player);
  let isApuAnswer = apuS && !msg.startsWith("!");
  if (CHAT_ONLY_COMMANDS && !msg.startsWith("!") && !isApuAnswer) {
    pm(player.id, "⛔ Solo se permite escribir comandos (empieza con !).");
    return false;
  }


  // Slow mode (cooldown por jugador)
  if (CHAT_SLOW_MS > 0) {
    const now = Date.now();
    const last = lastChatAt.get(player.id) || 0;

    if (now - last < CHAT_SLOW_MS) {
      const wait = Math.ceil((CHAT_SLOW_MS - (now - last)) / 1000);
      pm(player.id, `🐢 Slow mode: espera ${wait}s.`);
      return false;
    }

    lastChatAt.set(player.id, now);
  }

  // ====== FIN LA 2 ======

  let A = parseArgs(msg);
  let cmd = A[0] || "";
    if(cmd === "!apuida"){
    let v = (A[1] || "").toLowerCase();
    if(v === "off" || v === "cancel"){
      apuCancel(player, "manual");
      return false;
    }
    apuStart(player, "ida"); // ✅ forzado a IDA
    return false;
  }
   if(cmd === "!apuvuelta"){
  apuStart(player, "vuelta"); // ✅ fuerza VUELTA
  return false;
}
    // ================== !apu (menu apuestas) ==================
  if(cmd === "!apu"){
    let v = (A[1] || "").toLowerCase();
    if(v === "off" || v === "cancel"){
      apuCancel(player, "manual");
      return false;
    }
    apuStart(player, null);
    return false;
  }

  // Si el jugador está en menú !apu y escribió un número (sin !), lo consumimos
  if(!msg.startsWith("!") && apuGet(player)){
    if(apuHandleInput(player, msg)) return false;
  }
  // ================== fin !apu ==================

  // ===== ATAJO SOLO PARA APUESTAS: !a r 50  |  !a b 20 =====
if(cmd === "!a"){
  // uso: !a r 50  |  !a b 20
  if(A.length < 3){
    pm(player.id, "Uso: !a r|b cantidad   (r=red, b=blue)");
    return false;
  }

  let p = (A[1] || "").toLowerCase();
  if(p === "r") p = "red";
  else if(p === "b") p = "blue";
  // (opcional) empate:
  else if(p === "e") p = "empate";

  // si no es r/b (o e si activas), bloquea
  if(p !== "red" && p !== "blue" /* && p !== "empate" */){
    pm(player.id, "❌ Usa: !a r 50  o  !a b 50");
    return false;
  }

  let amount = parseInt(A[2], 10);
  if(!Number.isFinite(amount) || amount <= 0){
    pm(player.id, "❌ Cantidad inválida.");
    return false;
  }

  // ✅ reusar tu comando existente sin tocar nada más
  A = ["!apostar", p, String(amount)];
  cmd = "!apostar";
}
// ===== FIN ATAJO =====

  

  // ====== CHAT ESPECIAL ADMIN (corona + dorado) ======
  // Solo para mensajes normales (no comandos)
  if (!cmd.startsWith("!") && player.admin) {
    room.sendAnnouncement(`👑 ${player.name}: ${msg}`, null, 0xFFD700, "bold", 1);
    return false; // cancela el chat normal para que no salga duplicado
  }
  // ====== FIN CHAT ESPECIAL ADMIN ======

  // ====== LA 3: COMANDOS CHAT (ADMIN) ======

// !slow 2  (segundos)  |  !slow off
if(cmd === "!slow"){
  if(!player.admin){ pm(player.id, "⛔ Solo admins."); return false; }

  let v = (A[1] || "").toLowerCase();
  if(v === "off" || v === "0"){
    CHAT_SLOW_MS = 0;
    room.sendChat("🐢 Slow mode desactivado.");
    return false;
  }

  let secs = parseFloat(v);
  if(!isFinite(secs) || secs < 0){
    pm(player.id, "Uso: !slow 2  |  !slow off");
    return false;
  }

  CHAT_SLOW_MS = Math.floor(secs * 1000);
  room.sendChat(`🐢 Slow mode activado: ${secs}s.`);
  return false;
}

// !onlycmd on/off
if(cmd === "!onlycmd"){
  if(!player.admin){ pm(player.id, "⛔ Solo admins."); return false; }

  let v = (A[1] || "").toLowerCase();
  if(v === "on"){
    CHAT_ONLY_COMMANDS = true;
    room.sendChat("⛔ Modo SOLO COMANDOS activado (solo mensajes con !).");
    return false;
  }
  if(v === "off"){
    CHAT_ONLY_COMMANDS = false;
    room.sendChat("✅ Modo SOLO COMANDOS desactivado.");
    return false;
  }

  pm(player.id, "Uso: !onlycmd on | off");
  return false;
}

// (Opcional) !mute "Nombre"  |  !unmute "Nombre"
if(cmd === "!mute"){
  if(!player.admin){ pm(player.id, "⛔ Solo admins."); return false; }
  if(A.length < 2){ pm(player.id, 'Uso: !mute "Nombre"'); return false; }

  let t = findPlayerByName(A[1]) || findPlayerByNameLoose(A[1]);
  if(!t){ pm(player.id, "❌ Jugador no encontrado."); return false; }

  muted.add(t.id);
  room.sendChat(`🔇 ${t.name} fue muteado.`);
  return false;
}

if(cmd === "!unmute"){
  if(!player.admin){ pm(player.id, "⛔ Solo admins."); return false; }
  if(A.length < 2){ pm(player.id, 'Uso: !unmute "Nombre"'); return false; }

  let t = findPlayerByName(A[1]) || findPlayerByNameLoose(A[1]);
  if(!t){ pm(player.id, "❌ Jugador no encontrado."); return false; }

  muted.delete(t.id);
  room.sendChat(`🔊 ${t.name} fue desmuteado.`);
  return false;
}

// ====== FIN LA 3 ======

if(cmd === "!usar"){
  if(A.length < 2){ pm(player.id, "Uso: !usar 1-8"); return false; }
  let n = parseInt(A[1],10);
  let targetName = A[2] || "";
 // opcional
  cmdUsar(player, n, targetName);
  return false;
}


if(cmd === "!si"){
  voteCast(player, true);
  return false;
}
if(cmd === "!no"){
  voteCast(player, false);
  return false;
}

  // ================== COMANDOS PÚBLICOS ==================
  if(cmd === "!help"){
    helpSeen[getKey(player)] = true;
    cmdHelp(player.id);
    return false;
  }
 if(cmd === "!inv"){
  pm(player.id, `🎒 INV 1:${getItem(player,1)} 2:${getItem(player,2)} 3:${getItem(player,3)} 4:${getItem(player,4)} 5:${getItem(player,5)} 6:${getItem(player,6)} 7:${getItem(player,7)} 8:${getItem(player,8)}`);
  return false;
 }

  if(cmd === "!ida"){
    cmdIda(player.id);
    return false;
  }
if(cmd === "!monedas"){
  let k = walletKey(player); // tu función ya hace AUTH -> IP -> ID
 if(!k){
  pm(player.id, "⚠️ No se pudo generar wallet.");
  return;
 }
  // ya no bloquees por no-auth

  ensureCoinsForPlayer(player);
  pm(player.id, `💰 Tus monedas: ${getCoinsByAuth(k)} (wallet: ${k})`);
  return false;
}


  if(cmd === "!global"){
    cmdGlobal(player.id);
    return false;
  }

  if(cmd === "!stats"){
  let name = A[1] || "";
  cmdStats(player.id, name);
  return false;
}


  if(cmd === "!avatar"){
    // !avatar 😎   |   !avatar
    if(A.length === 1){
      setAvatarSafe(player.id, "");
      room.sendChat(`🧑 ${player.name} quitó su avatar`);
      return false;
    }

    let av = A[1];

    // limitar longitud (evita spam)
    if(av.length > 2){
      room.sendChat("⚠️ Avatar demasiado largo (máx 1–2 caracteres).");
      return false;
    }

    setAvatarSafe(player.id, av);
    room.sendChat(`🧑 ${player.name} cambió su avatar a ${av}`);
    return false;
  }                                                                       
   if(cmd === "!tienda"){
  cmdTienda(player);
  return false;
     }
    if(cmd === "!bet"){
  cmdBetMenu(player);
  return false;
   }
   // ================== BET ESPECIAL: !gol ==================
if(cmd === "!gol"){
  let check = canBetNow(player);
if(!check.ok){
  pm(player.id, check.why);   // "⚠️ Apuestas cerradas."
  return false;
}

  // ✅ Permite apostar si la ventana está abierta (apuestasSerieActiva),
// aunque la serie anterior haya terminado.
if(!apuestasSerieActiva && (!sistemaActivo || fase === "FIN")){
  pm(player.id, "⚠️ No hay serie activa.");
  return false;
}


  // formatos:
  // !gol "Jugador" cantidad
  // !gol ida "Jugador" cantidad
  // !gol vuelta "Jugador" cantidad

  let phaseOpt = null;
  let nameArg = null;
  let amountArg = null;

  let ph = phaseNormalize(A[1]);

if(A.length >= 4 && ph){
  phaseOpt = ph;      // "IDA" o "VUELTA"
  nameArg = A[2];
  amountArg = A[3];
} else {
  nameArg = A[1];
  amountArg = A[2];
}

  

  if(!nameArg || A.length < 3){
    pm(player.id, 'Uso: !gol "Jugador" cantidad   |   !gol ida|vuelta "Jugador" cantidad');
    return false;
  }

  let target = findPlayerByName(nameArg) || findPlayerByNameLoose(nameArg);
  if(!target){
    pm(player.id, `❌ No encuentro a "${nameArg}" (debe estar conectado).`);
    return false;
  }

  let amount = parseInt(amountArg, 10);
  if(!Number.isFinite(amount) || amount <= 0){
    pm(player.id, "❌ Cantidad inválida.");
    return false;
  }

  ensureCoinsForPlayer(player);
  let k = getKey(player);
  if(!k){
    pm(player.id, "⚠️ No se pudo validar tu AUTH (walletKey).");
    return false;
  }

  // NO permitir apostar a autogol raro: aquí es normal (apostar al que mete gol)
  let targetAuth = getAuth(target);
  if(!targetAuth){
    pm(player.id, "⚠️ Ese jugador no tiene AUTH válido.");
    return false;
  }

  // slot según tipo
  let slot = phaseOpt ? "golPhase" : "golMatch";

  // si ya tenía una apuesta en ese slot, devolvemos antes
  if(specialBets[k] && specialBets[k][slot]){
    refundSpecialBet(k, specialBets[k][slot], "edit");
    clearSpecialBet(k, slot);
  }

  // cobrar
  if(!pay(k, amount)){
    pm(player.id, `⛔ No tienes monedas. Tienes: ${getCoinsByAuth(k)}`);
    return false;
  }

  if(!phaseOpt){
    setSpecialBet(k, "golMatch", {
      targetAuth: targetAuth,
      targetName: target.name,
      amount: amount
    });
    pm(player.id, `✅ Apuesta !gol registrada: ${target.name} | 💰${amount} | paga x${GOL_MATCH_MULT}`);
  } else {
    setSpecialBet(k, "golPhase", {
      phase: phaseOpt,
      targetAuth: targetAuth,
      targetName: target.name,
      amount: amount
    });
    pm(player.id, `✅ Apuesta !gol ${phaseOpt} registrada: ${target.name} | 💰${amount} | paga x${GOL_PHASE_MULT}`);
  }

  pm(player.id, `💳 Saldo: ${getCoinsByAuth(k)}`);
  return false;
}
// ================== BET ESPECIAL: !autogol ==================
if(cmd === "!autogol"){
  let check = canBetNow(player);
  if(!check.ok){
    pm(player.id, check.why);
    return false;
  }

  // ✅ Permite apostar si la ventana está abierta (apuestasSerieActiva),
// aunque la serie anterior haya terminado.
if(!apuestasSerieActiva && (!sistemaActivo || fase === "FIN")){
  pm(player.id, "⚠️ No hay serie activa.");
  return false;
}


  // formatos:
  // !autogol "Jugador" cantidad
  // !autogol ida "Jugador" cantidad
  // !autogol vuelta "Jugador" cantidad

  let phaseOpt = null;
  let nameArg = null;
  let amountArg = null;

  let ph = phaseNormalize(A[1]);

if(A.length >= 4 && ph){
  phaseOpt = ph;      // "IDA" o "VUELTA"
  nameArg = A[2];
  amountArg = A[3];
} else {
  nameArg = A[1];
  amountArg = A[2];
}
 

  if(!nameArg || !amountArg){
    pm(player.id, 'Uso: !autogol "Jugador" cantidad | !autogol ida|vuelta "Jugador" cantidad');
    return false;
  }

  let target = findPlayerByName(nameArg) || findPlayerByNameLoose(nameArg);
  if(!target){
    pm(player.id, `❌ No encuentro a "${nameArg}" (debe estar conectado).`);
    return false;
  }

  let amount = parseInt(amountArg, 10);
  if(!Number.isFinite(amount) || amount <= 0){
    pm(player.id, "❌ Cantidad inválida.");
    return false;
  }

  ensureCoinsForPlayer(player);
  let k = getKey(player);
  if(!k){
    pm(player.id, "⚠️ No se pudo validar tu walletKey.");
    return false;
  }

  let targetAuth = getAuth(target);
  if(!targetAuth){
    pm(player.id, "⚠️ Ese jugador no tiene AUTH válido.");
    return false;
  }
    // 🚫 No permitir apostar autogol a ti mismo
  let myAuth = getAuth(player);
  if((myAuth && targetAuth === myAuth) || target.id === player.id){
    pm(player.id, "⛔ No puedes apostar AUTOGOL a ti mismo.");
    return false;
  }

  let slot = phaseOpt ? "autogolPhase" : "autogolMatch";

  // si ya tenía, devuelve antes
  if(specialBets[k] && specialBets[k][slot]){
    refundSpecialBet(k, specialBets[k][slot], "edit");
    clearSpecialBet(k, slot);
  }

  if(!pay(k, amount)){
    pm(player.id, `⛔ No tienes monedas. Tienes: ${getCoinsByAuth(k)}`);
    return false;
  }

  if(slot === "autogolMatch"){
    setSpecialBet(k, "autogolMatch", {
      targetAuth: targetAuth,
      targetName: target.name,
      amount: amount
    });
    pm(player.id, `✅ Apuesta !autogol (PARTIDO) registrada: ${target.name} | 💰${amount} | paga x${AUTOGOL_MATCH_MULT}`);
  } else {
    setSpecialBet(k, "autogolPhase", {
      phase: phaseOpt,
      targetAuth: targetAuth,
      targetName: target.name,
      amount: amount
    });
    pm(player.id, `✅ Apuesta !autogol ${phaseOpt} registrada: ${target.name} | 💰${amount} | paga x${AUTOGOL_PHASE_MULT}`);
  }

  pm(player.id, `💳 Saldo: ${getCoinsByAuth(k)}`);
  return false;
}

// ================== BET ESPECIAL: !goles N (serie completa) ==================
if(cmd === "!goles"){
  let check = canBetNow(player);
  if(!check.ok){
    pm(player.id, check.why);
    return false;
  }

  // ✅ Permite apostar si la ventana está abierta (apuestasSerieActiva),
// aunque la serie anterior haya terminado.
if(!apuestasSerieActiva && (!sistemaActivo || fase === "FIN")){
  pm(player.id, "⚠️ No hay serie activa.");
  return false;
}


  // formato: !goles N "Jugador" cantidad
  if(A.length < 4){
    pm(player.id, 'Uso: !goles N "Jugador" cantidad   (N=1..6)');
    return false;
  }

  let n = parseInt(A[1], 10);
  if(!Number.isFinite(n) || n < 1 || n > 6){
    pm(player.id, "❌ N inválido. Usa 1..6");
    return false;
  }

  let nameArg = A[2];
  let amountArg = A[3];

  let target = findPlayerByName(nameArg) || findPlayerByNameLoose(nameArg);
  if(!target){
    pm(player.id, `❌ No encuentro a "${nameArg}" (debe estar conectado).`);
    return false;
  }

  let amount = parseInt(amountArg, 10);
  if(!Number.isFinite(amount) || amount <= 0){
    pm(player.id, "❌ Cantidad inválida.");
    return false;
  }

  ensureCoinsForPlayer(player);
  let k = getKey(player);
  if(!k){
    pm(player.id, "⚠️ No se pudo validar tu walletKey.");
    return false;
  }

  let targetAuth = getAuth(target);
  if(!targetAuth){
    pm(player.id, "⚠️ Ese jugador no tiene AUTH válido.");
    return false;
  }

  let mult = GOLES_MULT[n];
  if(!mult){
    pm(player.id, "⚠️ No hay cuota para ese N.");
    return false;
  }

  // slot único para esta apuesta
  let slot = "golesSerie";

  // si ya tenía una apuesta, devolvemos antes
  if(specialBets[k] && specialBets[k][slot]){
    refundSpecialBet(k, specialBets[k][slot], "edit");
    clearSpecialBet(k, slot);
  }

  // cobrar
  if(!pay(k, amount)){
    pm(player.id, `⛔ No tienes monedas. Tienes: ${getCoinsByAuth(k)}`);
    return false;
  }

  setSpecialBet(k, slot, {
    n: n,
    targetAuth: targetAuth,
    targetName: target.name,
    amount: amount
  });

  pm(player.id, `✅ Apuesta !goles ${n} (SERIE) registrada: ${target.name} | 💰${amount} | paga x${mult}`);
  pm(player.id, `💳 Saldo: ${getCoinsByAuth(k)}`);
  return false;
}

// ================== BET ESPECIAL: !mvp ==================
if(cmd === "!mvp" || cmd === "!mpv"){ // alias
  let check = canBetNow(player);
  if(!check.ok){ pm(player.id, check.why); return false; }

  // ✅ Permite apostar si la ventana está abierta (apuestasSerieActiva),
// aunque la serie anterior haya terminado.
if(!apuestasSerieActiva && (!sistemaActivo || fase === "FIN")){
  pm(player.id, "⚠️ No hay serie activa.");
  return false;
}


  // formatos:
  // !mvp "Jugador" cantidad                  -> MVP SERIE (IDA+VUELTA)
  // !mvp ida|vuelta "Jugador" cantidad       -> MVP de fase
  // !mvp partido|match "Jugador" cantidad    -> MVP del partido actual

  let phaseOpt = null;
  let matchOpt = false;
  let nameArg = null;
  let amountArg = null;

  let ph = phaseNormalize(A[1]);

if(A.length >= 4 && ph){
  phaseOpt = ph;      // "IDA" o "VUELTA"
  nameArg = A[2];
  amountArg = A[3];
} else {
  nameArg = A[1];
  amountArg = A[2];
}
 

  if(!nameArg || !amountArg){
    pm(player.id, 'Uso: !mvp "Jugador" cantidad | !mvp ida|vuelta "Jugador" cantidad | !mvp partido "Jugador" cantidad');
    return false;
  }

  let target = findPlayerByName(nameArg) || findPlayerByNameLoose(nameArg);
  if(!target){ pm(player.id, `❌ No encuentro a "${nameArg}" (debe estar conectado).`); return false; }

  let amount = parseInt(amountArg, 10);
  if(!Number.isFinite(amount) || amount <= 0){ pm(player.id, "❌ Cantidad inválida."); return false; }

  ensureCoinsForPlayer(player);
  let k = getKey(player);
  if(!k){ pm(player.id, "⚠️ No se pudo validar tu walletKey."); return false; }

  let targetAuth = getAuth(target);
  if(!targetAuth){ pm(player.id, "⚠️ Ese jugador no tiene AUTH válido."); return false; }

  // ✅ slot correcto:
  // - con ida/vuelta => mvpPhase
  // - con "partido"  => mvpMatch
  // - SIN nada       => mvpSerie  (FIX)
  let slot = phaseOpt ? "mvpPhase" : (matchOpt ? "mvpMatch" : "mvpAny");


  if(specialBets[k] && specialBets[k][slot]){
    refundSpecialBet(k, specialBets[k][slot], "edit");
    clearSpecialBet(k, slot);
  }

  if(!pay(k, amount)){
    pm(player.id, `⛔ No tienes monedas. Tienes: ${getCoinsByAuth(k)}`);
    return false;
  }

  if(slot === "mvpMatch"){
  setSpecialBet(k, "mvpMatch", { targetAuth, targetName: target.name, amount });
  pm(player.id, `✅ Apuesta !mvp (PARTIDO) registrada: ${target.name} | 💰${amount} | paga x${MVP_MATCH_MULT}`);

} else if(slot === "mvpPhase"){
  setSpecialBet(k, "mvpPhase", { phase: phaseOpt, targetAuth, targetName: target.name, amount });
  pm(player.id, `✅ Apuesta !mvp ${phaseOpt} registrada: ${target.name} | 💰${amount} | paga x${MVP_PHASE_MULT}`);

} else {
  // ✅ DEFAULT: IDA O VUELTA (CUALQUIERA)
  setSpecialBet(k, "mvpAny", { targetAuth, targetName: target.name, amount });
  pm(player.id, `✅ Apuesta !mvp (IDA o VUELTA) registrada: ${target.name} | 💰${amount} | paga x2`);
}


  pm(player.id, `💳 Saldo: ${getCoinsByAuth(k)}`);
  return false;
}


if(cmd === "!comprar"){
  // Uso: !comprar 3
  if(A.length < 2){
    pm(player.id, "Uso: !comprar N  (ver lista con !tienda)");
    return false;
  }
  let no = parseInt(A[1], 10);
  if(!Number.isFinite(no)){
    pm(player.id, "❌ Número inválido. Ej: !comprar 3");
    return false;
  }
  cmdComprar(player, no);
  return false;
}

  // ================== APUESTAS (PUBLICO) ==================
  if(cmd === "!apuestas"){
    showBetPM(player);
    return false;
  }

if(cmd === "!apostar"){
  // Formato: !apostar blue 3  |  !apostar red 2  |  !apostar empate 2
  let check = canBetNow(player);
  if(!check.ok){
    pm(player.id, check.why);
    return false;
  }

  if(A.length < 3){
    pm(player.id, 'Uso: !apostar red|blue|empate cantidad');
    return false;
  }

  let pick = pickNormalize(A[1]);
  if(!pick){
    pm(player.id, '❌ Pick inválido. Usa: red | blue | empate');
    return false;
  }

  let amount = parseInt(A[2], 10);
  if(!Number.isFinite(amount) || amount <= 0){
    pm(player.id, "❌ Cantidad inválida.");
    return false;
  }

  // ✅ Jugando: solo a tu equipo (o empate). Spec: libre
  if(player.team !== 0){
    if(pick === "red" && player.team !== 1){
      pm(player.id, "⛔ Solo puedes apostar a TU equipo (o empate).");
      return false;
    }
    if(pick === "blue" && player.team !== 2){
      pm(player.id, "⛔ Solo puedes apostar a TU equipo (o empate).");
      return false;
    }
  }

  // límites
  if(amount < APUESTA_MIN){
    pm(player.id, `⛔ Apuesta mínima: ${APUESTA_MIN}`);
    return false;
  }
  if(pick === "draw" && amount > APUESTA_MAX_DRAW){
    pm(player.id, `⛔ Máximo empate: ${APUESTA_MAX_DRAW}`);
    return false;
  }
  if((pick === "red" || pick === "blue") && amount > APUESTA_MAX_TEAM){
    pm(player.id, `⛔ Máximo a equipo: ${APUESTA_MAX_TEAM}`);
    return false;
  }

  ensureCoinsForPlayer(player);
  let a = walletKey(player); // ✅ FIX: ahora sí existe

  // Si ya apostó, devolvemos lo anterior antes de cambiar (para que no “pierda” por editar)
  let prev = apuestasPorAuth[a];
  if(prev){
    addCoinsByAuth(a, prev.amount); // devolución
  }
 
  // cobrar nueva apuesta
  if(!pay(a, amount)){
    pm(player.id, `⛔ No tienes monedas suficientes. Tienes: ${getCoinsByAuth(a)}`);

    // si devolvimos previa y no pudo pagar, restauramos previa
    if(prev){
      if(pay(a, prev.amount)){
        apuestasPorAuth[a] = prev;
      } else {
        delete apuestasPorAuth[a];
      }
    }
    return false;
  }

  apuestasPorAuth[a] = { pick, amount };

  pm(player.id, `✅ Apuesta registrada: ${pick.toUpperCase()} | 💰 ${amount} monedas`);
  pm(player.id, `💳 Saldo actual: ${getCoinsByAuth(a)} monedas`);
  return false;
}


  // ================== AUTO-ARQUERO (TODOS) ==================
  if(cmd === "!arquero"){
    if(!penalesHabilitados){
      room.sendChat("⚠️ Aún no hay penales habilitados. Solo cuando el GLOBAL empata.");
      return false;
    }
    if(player.team === 0){
      room.sendChat(`❌ ${player.name} debes estar en ROJO o AZUL para ser arquero.`);
      return false;
    }

    // AZUL = team 2
    if(player.team === 2){
      if(keeperBlueId === player.id){
        room.sendChat(`🧤 ${player.name} ya eres el arquero AZUL.`);
        return false;
      }
      if(keeperBlueId && keeperBlueId !== player.id){
        let kb = room.getPlayerList().find(p=>p.id===keeperBlueId);
        room.sendChat(`🧤 Ya hay arquero AZUL: ${kb ? kb.name : "?"} (si se equivocó: !noarquero)`);
        return false;
      }
      if(player.id === keeperRedId){
        room.sendChat("❌ No puedes ser arquero en ambos equipos.");
        return false;
      }
      keeperBlueId = player.id;
      room.sendChat(`🧤 Arquero AZUL seteado: ${player.name}`);
      return false;
    }

    // ROJO = team 1
    if(player.team === 1){
      if(keeperRedId === player.id){
        room.sendChat(`🧤 ${player.name} ya eres el arquero ROJO.`);
        return false;
      }
      if(keeperRedId && keeperRedId !== player.id){
        let kr = room.getPlayerList().find(p=>p.id===keeperRedId);
        room.sendChat(`🧤 Ya hay arquero ROJO: ${kr ? kr.name : "?"} (si se equivocó: !noarquero)`);
        return false;
      }
      if(player.id === keeperBlueId){
        room.sendChat("❌ No puedes ser arquero en ambos equipos.");
        return false;
      }
      keeperRedId = player.id;
      room.sendChat(`🧤 Arquero ROJO seteado: ${player.name}`);
      return false;
    }
  }

  if(cmd === "!noarquero"){
    if(player.id === keeperBlueId){
      keeperBlueId = null;
      room.sendChat(`🧤 ${player.name} dejó de ser arquero AZUL.`);
      return false;
    }
    if(player.id === keeperRedId){
      keeperRedId = null;
      room.sendChat(`🧤 ${player.name} dejó de ser arquero ROJO.`);
      return false;
    }
    room.sendChat("❌ No eres arquero.");
    return false;
  }

  // ================== CAMBIO (SOLO CAPITANES) ==================
  let capTeam = captainRealTeamOfPlayer(player);

  if(cmd === "!cambio"){
    // ✅ Permite apostar si la ventana está abierta (apuestasSerieActiva),
// aunque la serie anterior haya terminado.
if(!apuestasSerieActiva && (!sistemaActivo || fase === "FIN")){
  pm(player.id, "⚠️ No hay serie activa.");
  return false;
}

    if(capTeam === 0){
      room.sendChat("❌ Solo capitanes pueden usar !cambio.");
      return false;
    }
    if(cambioUsado[capTeam]){
      room.sendChat("❌ Ya usaste el ÚNICO cambio de tu equipo en esta serie.");
      return false;
    }
    if(penalActivo){
      room.sendChat("⛔ No durante penales.");
      return false;
    }

    if(A.length < 2){
      room.sendChat('Uso: !cambio "Sale" ["Entra"]  (si no pones Entra, entra 1 espectador al azar)');
      return false;
    }

    let outName = A[1];
    let outP = findPlayerByName(outName);
    if(!outP){ room.sendChat("❌ No encuentro a: " + outName); return false; }

    // Debe estar jugando (no espectador)
    if(outP.team === 0){
      room.sendChat("❌ El que SALE debe estar jugando (no espectador).");
      return false;
    }

    // no permitir sacar al capitán
    if(outP.id === capitan[capTeam]){
      room.sendChat("❌ No puedes sacarte a ti mismo (capitán).");
      return false;
    }

    // Solo puede sacar a alguien de SU equipo real de la serie
    if(serieTeamOf[outP.id] !== capTeam){
      room.sendChat("❌ Ese jugador no es de tu equipo (serie).");
      return false;
    }

    let inP = null;
    if(A.length >= 3){
      let inName = A[2];
      inP = findPlayerByName(inName);
      if(!inP){ room.sendChat("❌ No encuentro a: " + inName); return false; }
      if(inP.team !== 0){ room.sendChat("❌ El que ENTRA debe estar de ESPECTADOR."); return false; }
    } else {
      let specs = room.getPlayerList().filter(p=>p.team===0);
      if(specs.length === 0){ room.sendChat("❌ No hay espectadores para entrar."); return false; }
      inP = specs[Math.floor(Math.random()*specs.length)];
    }

    // no permitir meter un capitán
    if(inP.id === capitan[1] || inP.id === capitan[2]){
      room.sendChat("❌ Ese jugador es capitán, no puede entrar por cambio.");
      return false;
    }

    // ✅ Si el partido está corriendo, pausamos un toque para que el cambio sea limpio
    let sc = room.getScores();
    let alreadyPaused = enPausa === true;
    if(sc && !alreadyPaused) room.pauseGame(true);

    // ✅ equipo físico correcto según momento (incluye transición IDA->VUELTA)
    let physTeam = realToPhysicalTeamNow(capTeam);

    room.setPlayerTeam(outP.id, 0);
    room.setPlayerTeam(inP.id, physTeam);

    // actualizar identidad de serie para el GLOBAL
    delete serieTeamOf[outP.id];
    serieTeamOf[inP.id] = capTeam;

    cambioUsado[capTeam] = true;

    room.sendChat(`🔁 CAMBIO ${capTeam===1?"🔴":"🔵"}: SALE ${outP.name} / ENTRA ${inP.name} ✅ (1 cambio usado)`);

    if(sc && !alreadyPaused){
      setTimeout(()=> room.pauseGame(false), 250);
    }

    return false;
  }

  // ================== ADMIN ONLY (TODO LO DEMÁS) ==================
  if(!player.admin) return true;
  if(cmd === "!unban"){
  // Uso: !unban "Nombre"
  if(A.length < 2){ room.sendChat('Uso: !unban "Nombre"'); return false; }

  let target = findPlayerByName(A[1]) || findPlayerByNameLoose(A[1]);
  if(!target){ room.sendChat("❌ Jugador no encontrado (debe estar conectado)."); return false; }

  let r = unbanByPlayer(target);
  room.sendChat(r.msg + ` | (${target.name})`);
  return false;
}
if(cmd === "!clearpermbans"){
  clearAllPermBans();
  room.sendChat("✅ Todos los PERM BANS fueron borrados.");
  return false;
}

if(cmd === "!unbanauth"){
  // Uso: !unbanauth AUTH:xxxxx   o  !unbanauth xxxxx
  if(A.length < 2){ room.sendChat('Uso: !unbanauth AUTH:xxxxx'); return false; }

  let r = unbanByAuthString(A[1]);
  room.sendChat(r.msg);
  return false;
}

if(cmd === "!addcoins"){
  // Uso: !addcoins "Nombre" 50
  if(A.length < 3){ room.sendChat('Uso: !addcoins "Nombre" cantidad'); return false; }

  let targetName = A[1];
  let amount = A[2];

  let r = cmdAddCoins(player, targetName, amount);
  room.sendChat(r.msg);
  return false;
}
if(cmd === "!tadd"){
  if(!player.admin){ room.sendChat("⛔ Solo admin."); return false; }

  if(A.length < 3){ room.sendChat("Uso: !tadd 1-8 nuevoPrecio"); return false; }

  let no = parseInt(A[1], 10);
  let price = parseInt(A[2], 10);

  if(!(no>=1 && no<=8)){ room.sendChat("❌ Ítem inválido (1-8)."); return false; }
  if(!(price>=0)){ room.sendChat("❌ Precio inválido (>=0)."); return false; }

  let it = SHOP.find(x => x.no === no);
  if(!it){ room.sendChat("❌ No existe ese ítem."); return false; }

  it.price = price;
  saveShopPrices();

  room.sendChat(`✅ Precio cambiado: ${no}) ${it.name} = 💰${it.price}`);
  return false;
}

if(cmd === "!setcoins"){
  // Uso: !setcoins "Nombre" 100
  if(A.length < 3){ room.sendChat('Uso: !setcoins "Nombre" cantidad'); return false; }

  let targetName = A[1];
  let amount = A[2];

  let r = cmdSetCoins(player, targetName, amount);
  room.sendChat(r.msg);
  return false;
}

  if(cmd === "!time"){
    if(A.length < 2){
      room.sendChat("Uso: !time x2 | x3 | x4");
      return false;
    }

    let s = room.getScores();
    if(!s){
      room.sendChat("⚠️ No hay partido activo.");
      return false;
    }

    let diff = Math.abs(s.blue - s.red);
    if(diff < 4){
      room.sendChat("⚠️ Solo puedes acelerar si hay diferencia de 4 goles o más.");
      return false;
    }

    let mult = parseInt(A[1].replace("x",""));
    if(![2,3,4].includes(mult)){
      room.sendChat("⚠️ Valores permitidos: x2, x3, x4");
      return false;
    }

    timeMultiplier = mult;
    room.sendChat(`⏩ TIEMPO ACELERADO x${mult}`);
    return false;
  }

  if(cmd === "!timeoff"){
    timeMultiplier = 1;
    room.sendChat("⏱️ Tiempo normal restaurado");
    return false;
  }

  // ---------- CAPITÁN / NO CAPITÁN (solo admin) ----------
  if(cmd === "!capitan"){
    if(A.length < 2){ room.sendChat('Uso: !capitan "Nombre exacto"'); return false; }

    let target = findPlayerByName(A[1]);
    if(!target){ room.sendChat("❌ Jugador no encontrado"); return false; }
    if(target.team === 0){ room.sendChat("❌ Debe estar en ROJO o AZUL."); return false; }

    let realTeam = sistemaActivo
      ? (serieTeamOf[target.id] != null ? serieTeamOf[target.id] : physicalToRealTeamNow(target.team))
      : target.team;

    if(realTeam !== 1 && realTeam !== 2){
      room.sendChat("❌ No se pudo determinar el equipo real.");
      return false;
    }

    if(capitan[realTeam] && capitan[realTeam] !== target.id){
      room.sendChat(`❌ Ya hay CAPITÁN ${realTeam===1?"ROJO":"AZUL"}: ${getNameById(capitan[realTeam])}`);
      return false;
    }

    if(capitan[1] === target.id && realTeam !== 1) clearCaptain(1);
    if(capitan[2] === target.id && realTeam !== 2) clearCaptain(2);

    setCaptain(realTeam, target.id);
    room.sendChat(`🧢 Capitán ${realTeam===1?"🔴 ROJO":"🔵 AZUL"} asignado: ${target.name}`);
    return false;
  }

  if(cmd === "!nocapitan"){
    if(A.length < 2){ room.sendChat('Uso: !nocapitan "Nombre exacto"'); return false; }

    let target = findPlayerByName(A[1]);
    if(!target){ room.sendChat("❌ Jugador no encontrado (debe estar conectado)."); return false; }

    if(capitan[1] === target.id){ clearCaptain(1); room.sendChat(`🧢 ${target.name} ya no es CAPITÁN ROJO.`); return false; }
    if(capitan[2] === target.id){ clearCaptain(2); room.sendChat(`🧢 ${target.name} ya no es CAPITÁN AZUL.`); return false; }

    room.sendChat("❌ Ese jugador no es capitán.");
    return false;
  }

  // ---------- (manual por si quieres, pero auto-arquero ya existe) ----------
  if(cmd === "!tapa" && A.length >= 2){
    let target = findPlayerByName(A[1]);
    if(!target){ room.sendChat("❌ Jugador no encontrado"); return false; }

    if(!keeperBlueId){
      keeperBlueId = target.id;
      room.sendChat(`🧤 Arquero AZUL seteado: ${target.name}`);
    } else if(!keeperRedId){
      if(target.id === keeperBlueId){
        room.sendChat("❌ Ese ya es el arquero AZUL. El ROJO debe ser otro.");
        return false;
      }
      keeperRedId = target.id;
      room.sendChat(`🧤 Arquero ROJO seteado: ${target.name}`);
    } else {
      if(target.id === keeperBlueId){
        room.sendChat("❌ Ese ya es el arquero AZUL. El ROJO debe ser otro.");
        return false;
      }
      keeperRedId = target.id;
      room.sendChat(`🧤 Arquero ROJO actualizado: ${target.name}`);
    }
    return false;
  }

  if(cmd === "!penal"){
    iniciarPenales();
    return false;
  }

  if(cmd === "!on"){
    // reset penales
    penalActivo = false;
    penAttemptLive = false;
    penalOriginalTeams = {};
    keeperBlueId = null;
    keeperRedId  = null;
    penSideFlip = 0;

    // reset habilitación de penales
    penalesHabilitados = false;

    // reset cambios
    cambioUsado = { 1:false, 2:false };

    // ✅ reset serie global
    serieTeamOf = {};
    serieGoals = {1:0, 2:0};
    serieLabel = {1:"🔴 ROJO (IDA)", 2:"🔵 AZUL (IDA)"};

    // congelar identidad real de cada jugador al prender sistema
    room.getPlayerList().forEach(p=>{
      if(p.team === 1) serieTeamOf[p.id] = 1;
      if(p.team === 2) serieTeamOf[p.id] = 2;
    });

    // ✅ NO borrar capitanes por swap/teams; SOLO si ya no están conectados
    if(capitan[1]){
      let p1 = room.getPlayerList().find(p=>p.id===capitan[1]);
      if(!p1) clearCaptain(1);
    }
    if(capitan[2]){
      let p2 = room.getPlayerList().find(p=>p.id===capitan[2]);
      if(!p2) clearCaptain(2);
    }

    sistemaActivo = true;
    fase = "IDA";
    idaScore = {blue:0, red:0};
    idaTermino = false;

    vueltaConEquiposInvertidos = false;
    bloqueo = false;

    goles={}; asistencias={}; autogoles={}; tiempo={}; racha={};
    ultimoGol=null; ultimoTocador=null; penultimoTocador=null;
    ultimoTocadorTime=0; penultimoTocadorTime=0;

    jugoIda.clear(); jugoVuelta.clear();
    resetPorPartido();

    room.setTimeLimit(0);
    room.setScoreLimit(0);

    qChat("IDA & VUELTA");
    qChat("⏱️ Regla: 120s + extra (20/25/30)");
    qChat("🧢 Capitanes: ADMIN !capitan / !nocapitan | Capitanes: !cambio (1 por serie)");
    qChat("🎯 Penales (solo si GLOBAL empata): !arquero / !noarquero y luego ADMIN: !penal");
   
        // ✅ cortar la cuenta larga (60s) para que NO cierre después
preBetsActive = false;
if(preBetsTimer){
  clearInterval(preBetsTimer);
  preBetsTimer = null;
}


     // ------------------ APUESTAS: ventana 10s ANTES de iniciar ------------------
room.stopGame();

// asegura que no quede “pegado” en pausa
try{ room.pauseGame(false); }catch(e){}
apuestasSerieActiva = true;
apuestasPagadas = false;

betOpen(10);

// ✅ arrancamos el partido pero PAUSADO (para que nadie se mueva durante apuestas)
room.startGame();
room.pauseGame(true);

qChat("🎲 APUESTAS ABIERTAS (10s)");
qChat('👉 Usa: !apostar red|blue|empate cantidad o !a r|b|e cantidad--atajo ');
qChat("✅ Jugando: solo a tu equipo (o empate). | Espectador: puede apostar a cualquiera.");

// cuenta regresiva 10..1
for(let i=10;i>=1;i--){
  ((n)=>{
    setTimeout(()=> room.sendChat(`⏳ Apostar: ${n}s`), (10-n)*1000);
  })(i);
}

setTimeout(()=>{
  betClose();
  room.sendChat("🔒 APUESTAS CERRADAS ✅");

  // ✅ ahora sí empieza de verdad
  room.pauseGame(false);
}, 10000);

return false;

  }

  if(cmd === "!off"){  
    resetBetSystem();
try{ room.pauseGame(false); }catch(e){}
try{ room.stopGame(); }catch(e){}

                                                        betClose();
refundAllBets("reinicio manual !off");

    sistemaActivo=false;
    penalesHabilitados=false;
    keeperBlueId=null;
    keeperRedId=null;
    idaTermino = false;

    room.sendChat("🔁 Reinicio cuto de MRD");
    return false;
  }

  return true;
};

// ================= LIMPIAR ARQUEROS/CAPITANES SI SE VAN =================
room.onPlayerLeave = function(p){
   delete AUTH_BY_ID[p.id];
   delete CONN_BY_ID[p.id];
  if(p.id === keeperBlueId) keeperBlueId = null;
  if(p.id === keeperRedId)  keeperRedId  = null;

  if(p.id === capitan[1]) clearCaptain(1);
  if(p.id === capitan[2]) clearCaptain(2);
};

// ================= (opcional) si alguien entra a equipo en medio de serie y no estaba mapeado =================
room.onPlayerTeamChange = function(changedPlayer){
  if(!sistemaActivo) return;

  if(changedPlayer.team !== 0 && serieTeamOf[changedPlayer.id] == null){
    serieTeamOf[changedPlayer.id] = physicalToRealTeamNow(changedPlayer.team);
  }
};
// =========================================================
// ====== CORE HELPERS (DEBE IR ANTES DE onPlayerJoin) ======
// =========================================================

// ---------- KEYS (AUTH/IP/ID) ----------
function keysOfPlayer(p){
  let out = [];
  if(!p) return out;

  let a = getAuth(p);
  let c = getConn(p);

  if(a && a.length >= 5) out.push("AUTH:" + a);
  if(c && String(c).length > 0) out.push("IP:" + c);

  out.push("ID:" + p.id);
  return out;
}



// ---------- JOIN TIME (anti abuso / cooldowns / etc) ----------
var joinAtByKey = {}; // key -> timestamp(ms)
function ensureJoinTime(p){
  let keys = keysOfPlayer(p);
  let now = Date.now();
  for(let i=0;i<keys.length;i++){
    let k = keys[i];
    if(joinAtByKey[k] == null) joinAtByKey[k] = now;
  }
}
function getJoinTimeMs(p){
  let keys = keysOfPlayer(p);
  let best = null;
  for(let i=0;i<keys.length;i++){
    let t = joinAtByKey[keys[i]];
    if(t != null && (best == null || t < best)) best = t;
  }
  return best;
}
function getMinutesInRoom(p){
  let t = getJoinTimeMs(p);
  if(!t) return 0;
  return (Date.now() - t) / 60000;
}

// ---------- PERM BAN (localStorage) ----------
const PERM_BANS_KEY = "HB_PERMBANS_v1";
var permBansByKey = {}; // key -> { until:0, reason, at }

function loadPermBans(){
  try{
    if(typeof localStorage === "undefined"){ permBansByKey = {}; return; }
    let raw = localStorage.getItem(PERM_BANS_KEY);
    permBansByKey = JSON.parse(raw || "{}") || {};
  }catch(e){ permBansByKey = {}; }
}
function savePermBans(){
  try{
    if(typeof localStorage === "undefined") return;
    localStorage.setItem(PERM_BANS_KEY, JSON.stringify(permBansByKey));
  }catch(e){}
}
function unbanByPlayer(targetPlayer){
  if(!targetPlayer) return { ok:false, msg:"❌ Jugador inválido." };

  if(!unbanByPlayer._loaded){
    loadPermBans();
    unbanByPlayer._loaded = true;
  }

  let ks = keysOfPlayer(targetPlayer) || [];
  let removed = 0;

  for(let i=0;i<ks.length;i++){
    if(permBansByKey[ks[i]] != null){
      delete permBansByKey[ks[i]];
      removed++;
    }
  }

  savePermBans();
  return { ok:true, msg:`✅ UNBAN listo. Claves eliminadas: ${removed}` };
}

function unbanByAuthString(authStr){
  if(!authStr) return { ok:false, msg:'Uso: !unbanauth AUTH:xxxxx  (o solo xxxxx)' };

  // cargar
  loadPermBans();

  let a = (authStr + "").trim();
  if(!a) return { ok:false, msg:'Uso: !unbanauth AUTH:xxxxx' };
  if(!a.startsWith("AUTH:")) a = "AUTH:" + a;

  let removed = 0;

  // si existe el ban por AUTH, usamos ese "rec" para borrar también IP/ID asociados
  let ref = permBansByKey[a];

  if(ref){
    // borra TODO lo que tenga el mismo “rec” (mismo until/at/by/reason)
    for(let k in permBansByKey){
      let r = permBansByKey[k];
      if(!r) continue;

      if(r.until === ref.until &&
         r.at    === ref.at &&
         r.by    === ref.by &&
         r.reason=== ref.reason){
        delete permBansByKey[k];
        removed++;
      }
    }
  } else {
    // fallback: al menos borrar AUTH directo si existiera
    if(permBansByKey[a] != null){
      delete permBansByKey[a];
      removed++;
    }
  }

  savePermBans();
  return { ok:true, msg:`✅ UNBAN por AUTH listo. Eliminadas: ${removed}` };
}


function isPermBanned(p){
  if(!isPermBanned._loaded){
    loadPermBans();
    isPermBanned._loaded = true;
  }
  let keys = keysOfPlayer(p);
  for(let i=0;i<keys.length;i++){
    let rec = permBansByKey[keys[i]];
    if(rec && rec.until === 0) return true;
  }
  return false;
}
function applyPermBan(targetPlayer, reason, byName){
  if(!targetPlayer) return false;

  // asegurar carga
  if(!applyPermBan._loaded){
    loadPermBans();
    applyPermBan._loaded = true;
  }

  let rec = {
    until: 0, // 0 = permanente
    reason: reason || "",
    by: byName || "",
    at: Date.now()
  };

  let ks = keysOfPlayer(targetPlayer) || [];
  for(let i=0;i<ks.length;i++){
    permBansByKey[ks[i]] = rec;
  }

  savePermBans();
  return true;
}

function useBanPerm(player, targetName){
  if(!player) return false;

  if(!targetName || !targetName.trim()){
    pm(player.id, 'Uso: !usar 8 "Nombre"');
    return false;
  }

  let target = findPlayerByName(targetName) || findPlayerByNameLoose(targetName);
  if(!target){
    pm(player.id, `❌ No encuentro a "${targetName}" (debe estar conectado).`);
    return false;
  }

  if(target.id === player.id){
    pm(player.id, "⛔ No puedes banearte a ti mismo.");
    return false;
  }

  if(target.admin){
    pm(player.id, "⛔ No puedes banear a un admin.");
    return false;
  }

  // ✅ misma regla anti-abuso: si estás jugando, no al otro team
  if(player.team !== 0 && target.team !== 0 && player.team !== target.team){
    pm(player.id, "⛔ No puedes banear al OTRO equipo. Solo a espectador o tu equipo.");
    return false;
  }

  // consumir item 8
  if(!useItem(player, 8)){
    pm(player.id, "⛔ No tienes el ítem 8.");
    return false;
  }

  applyPermBan(target, "Ban permanente (ítem 8)", player.name);
  room.sendChat(`⛔✅ ${player.name} aplicó BAN PERMANENTE a ${target.name}.`);

  // true = ban del host (además del permaban por keys)
  room.kickPlayer(target.id, "Baneado permanentemente", true);
  return true;
}

function applyTempBan10(targetPlayer, minutes, reason, byName){
  if(!targetPlayer) return;

  // Asegurar que la tabla esté cargada
  if(typeof tempBans10ByKey !== "object") return;
  if(typeof loadTempBans10 === "function") loadTempBans10();

  let until = Date.now() + (minutes * 60 * 1000);
  let rec = {
    until: until,
    reason: reason || "",
    by: byName || "",
    at: Date.now()
  };

  // Ideal: banear por varias keys del jugador (auth/ip/id) si ya tienes keysOfPlayer()
  if(typeof keysOfPlayer === "function"){
    let ks = keysOfPlayer(targetPlayer) || [];
    for(let i=0;i<ks.length;i++){
      tempBans10ByKey[ks[i]] = rec;
    }
  } else {
    // fallback mínimo: por AUTH
    let k = (typeof walletKey === "function") ? walletKey(targetPlayer) : null;
    if(k) tempBans10ByKey[k] = rec;
  }

  if(typeof saveTempBans10 === "function") saveTempBans10();
}

// ---------- TEMP BAN 10 MIN (localStorage) ----------
const TEMP_BANS10_KEY = "HB_TEMPBANS10_v1";
var tempBans10ByKey = {}; // key -> { until(ms), reason, at }

function loadTempBans10(){
  try{
    if(typeof localStorage === "undefined"){ tempBans10ByKey = {}; return; }
    let raw = localStorage.getItem(TEMP_BANS10_KEY);
    tempBans10ByKey = JSON.parse(raw || "{}") || {};
  }catch(e){ tempBans10ByKey = {}; }
}
function saveTempBans10(){
  try{
    if(typeof localStorage === "undefined") return;
    localStorage.setItem(TEMP_BANS10_KEY, JSON.stringify(tempBans10ByKey));
  }catch(e){}
}
function isBanned10(p){
  if(!isBanned10._loaded){
    loadTempBans10();
    isBanned10._loaded = true;
  }
  let keys = keysOfPlayer(p);
  let now = Date.now();
  for(let i=0;i<keys.length;i++){
    let k = keys[i];
    let rec = tempBans10ByKey[k];
    if(!rec) continue;

    if(typeof rec.until === "number" && rec.until > now) return true;

    // expiró -> limpiar
    if(typeof rec.until === "number" && rec.until <= now){
      delete tempBans10ByKey[k];
      saveTempBans10();
    }
  }
  return false;
}

// ---------- INVENTARIO (localStorage) ----------
const INV_KEY = "HB_INV_v1";
var invByKey = {}; // key -> { "1":qty, "2":qty, ... }

function loadInv(){
  try{
    if(typeof localStorage === "undefined"){ invByKey = {}; return; }
    let raw = localStorage.getItem(INV_KEY);
    invByKey = JSON.parse(raw || "{}") || {};
  }catch(e){ invByKey = {}; }
}
function saveInv(){
  try{
    if(typeof localStorage === "undefined") return;
    localStorage.setItem(INV_KEY, JSON.stringify(invByKey));
  }catch(e){}
}

function ensureInvForPlayer(p){
  if(!ensureInvForPlayer._loaded){
    loadInv();
    ensureInvForPlayer._loaded = true;
  }
  let k = walletKey(p);
  if(!k) return;
  if(invByKey[k] == null){
    invByKey[k] = {}; // inventario vacío
    saveInv();
  }
}
function addItem(p, itemId, qty){
  ensureInvForPlayer(p);
  let k = walletKey(p);
  if(!k) return;
  let inv = invByKey[k] || (invByKey[k]={});
  inv[String(itemId)] = (inv[String(itemId)]|0) + (qty|0);
  if(inv[String(itemId)] < 0) inv[String(itemId)] = 0;
  saveInv();
}
function getItem(p, itemId){
  ensureInvForPlayer(p);
  let k = walletKey(p);
  if(!k) return 0;
  let inv = invByKey[k] || {};
  return inv[String(itemId)]|0;
}
function useItem(p, itemId){
  let have = getItem(p, itemId);
  if(have <= 0) return false;
  addItem(p, itemId, -1);
  return true;
}
function findDuplicateAuth(p){
  if(!p || !p.auth || p.auth.length < 5) return null;
  return room.getPlayerList().find(x => x.id !== p.id && x.auth === p.auth) || null;
}


room.onPlayerJoin = p => {
  AUTH_BY_ID[p.id] = p.auth ?? null;
   CONN_BY_ID[p.id] = p.conn ?? null;
    
 let k = walletKey(p);
if(k && monedasByAuth["null"] != null){
  if(monedasByAuth[k] == null) monedasByAuth[k] = 0;
  monedasByAuth[k] += (monedasByAuth["null"]|0);
  delete monedasByAuth["null"];
  queueSaveCoins();
}


  // 1) SIN AUTH => KICK
  if(!(p.auth && p.auth.length >= 5)){
    setTimeout(()=> room.kickPlayer(p.id, "Necesitas entrar con cuenta (AUTH).", false), 50);
    return;
  } 

  // 2) MISMA AUTH YA CONECTADA => KICK (multi-cuenta / multi-pestaña)
  var BLOQUEAR_MULTI = false; // luego lo vuelves a true

 if(BLOQUEAR_MULTI){
  let dup = findDuplicateAuth(p);
  if(dup){
    setTimeout(()=> room.kickPlayer(p.id, "Ya estás conectado con esta cuenta (multi-sesión).", false), 50);
    return;
  }
 }




  ensureJoinTime(p);

  if(isPermBanned(p)){
    setTimeout(()=> room.kickPlayer(p.id, "Baneado permanentemente", true), 50);
    return;
  }
  if(isBanned10(p)){
  setTimeout(()=> room.kickPlayer(p.id, "Baneado 10 min", false), 50);
  return;
 }



  setTimeout(()=> ensureInvForPlayer(p), 300);
  if(p.name==="ELBUENDELIPRIME") room.setPlayerAdmin(p.id,true);

  setTimeout(()=> ensureCoinsForPlayer(p), 300);
  setTimeout(()=> sendBienvenida3(p), 350);

};

