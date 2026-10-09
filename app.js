/* Card Scanner — everything runs in your browser. No accounts, no secret keys. */
'use strict';

/* ---------- Small helpers ---------- */
const $ = (s) => document.querySelector(s);

// Builds page elements safely. Text is always added as plain text, never as HTML,
// so nothing read from a card or a website can sneak code into the page.
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

const str = (v, n = 120) => (typeof v === 'string' || typeof v === 'number')
  ? String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
const num = (v) => { const x = (v === '' || v == null) ? NaN : Number(v); return Number.isFinite(x) && x >= 0 && x < 1e9 ? x : null; };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now() + Math.random().toString(16).slice(2));

const IMG_HOSTS = ['images.pokemontcg.io', 'cards.scryfall.io', 'images.ygoprodeck.com', 'cards.lorcast.io'];
function safeImg(u) {
  if (typeof u !== 'string') return '';
  if (u.length < 200000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u)) return u;
  try { const x = new URL(u); return x.protocol === 'https:' && IMG_HOSTS.includes(x.hostname) ? x.href : ''; } catch { return ''; }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- Card types ---------- */
const CATS = [
  { id: 'pokemon', label: 'Pokémon', db: true },
  { id: 'magic', label: 'Magic: The Gathering', db: true },
  { id: 'yugioh', label: 'Yu-Gi-Oh!', db: true },
  { id: 'lorcana', label: 'Disney Lorcana', db: true },
  { id: 'onepiece', label: 'One Piece' },
  { id: 'dragonball', label: 'Dragon Ball' },
  { id: 'digimon', label: 'Digimon' },
  { id: 'f1', label: 'Formula 1' },
  { id: 'basketball', label: 'Basketball' },
  { id: 'soccer', label: 'Soccer / Football' },
  { id: 'nfl', label: 'American Football' },
  { id: 'baseball', label: 'Baseball' },
  { id: 'afl', label: 'AFL' },
  { id: 'nrl', label: 'Rugby League' },
  { id: 'cricket', label: 'Cricket' },
  { id: 'hockey', label: 'Ice Hockey' },
  { id: 'fight', label: 'UFC / Wrestling' },
  { id: 'sports', label: 'Sports (other)' },
  { id: 'other', label: 'Other' },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
const catLabel = (id) => (CAT[id] || CAT.other).label;

// Clue words printed on cards. Each clue adds points to a card type; the highest score wins.
const CLUES = [
  ['pokemon', 4, /pok[eé]mon|nintendo|game ?freak/], ['pokemon', 2, /weakness|resistance|retreat/],
  ['pokemon', 2, /evolves from|stage [12]\b|\bbasic\b/], ['pokemon', 1, /\d{2,3} ?hp\b|\bhp ?\d{2,3}/],
  ['magic', 4, /wizards of the coast/], ['magic', 2, /\b(creature|instant|sorcery|enchantment|artifact|planeswalker)\b/],
  ['magic', 1, /\b(flying|trample|haste|vigilance|deathtouch|lifelink)\b/],
  ['yugioh', 4, /konami|kazuki takahashi/], ['yugioh', 3, /spell card|trap card|\/ ?(effect|fusion|synchro|xyz|link)\]/],
  ['yugioh', 2, /\batk\b|\bdef\b|special summon|graveyard/],
  ['lorcana', 4, /lorcana|ravensburger|storyborn|dreamborn|floodborn/], ['lorcana', 2, /disney/],
  ['onepiece', 4, /one piece/], ['onepiece', 3, /don!!|straw hat/],
  ['dragonball', 4, /dragon ?ball/], ['digimon', 4, /digimon|digivolve/],
  ['f1', 4, /formula ?(1|one)\b/], ['f1', 3, /\bf1\b/], ['f1', 2, /grand prix/],
  ['f1', 2, /ferrari|mclaren|red bull|mercedes-amg|alphatauri|haas|williams racing|alpine|aston martin|racing bulls|sauber/],
  ['f1', 3, /verstappen|hamilton|norris|leclerc|piastri|russell|sainz|alonso|ricciardo|gasly|ocon|tsunoda|albon|bottas|hulkenberg|antonelli|bearman|vettel|schumacher|senna/],
  ['basketball', 4, /\bw?nba\b/], ['basketball', 3, /basketball/],
  ['basketball', 2, /lakers|celtics|warriors|knicks|mavericks|spurs|nuggets|bucks|76ers/],
  ['soccer', 3, /premier league|uefa|champions league|fifa|la liga|bundesliga|serie a|match attax|a-league/], ['soccer', 1, /soccer|football club/],
  ['nfl', 4, /\bnfl\b/], ['nfl', 2, /quarterback|touchdown/],
  ['baseball', 4, /\bmlb\b/], ['baseball', 2, /baseball|bowman/],
  ['afl', 4, /\bafl\b|footy stars/], ['nrl', 4, /\bnrl\b/], ['nrl', 2, /rugby league|state of origin/],
  ['cricket', 3, /cricket|big bash|\bbbl\b/], ['hockey', 4, /\bnhl\b/], ['fight', 4, /\b(ufc|wwe|aew)\b/],
  ['sports', 1, /topps|panini|donruss|upper deck|fleer|futera|rookie card|autograph/],
];
const BRANDS = /(topps chrome|topps|panini prizm|panini select|panini|donruss optic|donruss|upper deck|bowman|fleer|futera)/i;
const BORING = /weakness|resistance|retreat|illus|nintendo|evolves|damage|flip a coin|wizards|konami|topps|panini|trademark|rights reserved|www\.|\.com/i;

/* ---------- Saving on this device ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

const CURRENCIES = {
  AUD: { label: 'Australian dollars (AUD)', ebay: 'www.ebay.com.au' },
  USD: { label: 'US dollars (USD)', ebay: 'www.ebay.com' },
  NZD: { label: 'New Zealand dollars (NZD)', ebay: 'www.ebay.com.au' },
  GBP: { label: 'British pounds (GBP)', ebay: 'www.ebay.co.uk' },
  EUR: { label: 'Euros (EUR)', ebay: 'www.ebay.ie' },
  CAD: { label: 'Canadian dollars (CAD)', ebay: 'www.ebay.ca' },
};
const ROUGH_RATES = { USD: 1, AUD: 1.44, NZD: 1.79, GBP: 0.76, EUR: 0.89, CAD: 1.43 };

// Checks every saved card so a broken or tampered backup file can't put bad data in the app.
function cleanItem(r) {
  if (!r || typeof r !== 'object') return null;
  const name = str(r.name);
  if (!name) return null;
  const my = r.my && typeof r.my === 'object' && num(r.my.amt) != null && CURRENCIES[r.my.cur]
    ? { amt: num(r.my.amt), cur: r.my.cur } : null;
  return {
    uid: str(r.uid, 64) || newId(),
    src: r.src === 'db' ? 'db' : 'manual',
    cat: CAT[r.cat] ? r.cat : 'other',
    id: str(r.id, 80), name, set: str(r.set), year: /^(19|20)\d\d$/.test(str(r.year, 4)) ? str(r.year, 4) : '',
    number: str(r.number, 20), rarity: str(r.rarity, 60), img: safeImg(r.img),
    usd: num(r.usd), priceLabel: str(r.priceLabel, 80), my,
    qty: Math.min(9999, Math.max(1, Math.floor(num(r.qty) || 1))),
    added: num(r.added) || Date.now(),
  };
}

let collection = (Array.isArray(store.get('cs.collection', [])) ? store.get('cs.collection', []) : []).map(cleanItem).filter(Boolean);
let settings = { currency: 'AUD', ...store.get('cs.settings', {}) };
if (!CURRENCIES[settings.currency]) settings.currency = 'AUD';
let rates = { ...ROUGH_RATES };
let ratesAreLive = false;

function save() {
  if (!store.set('cs.collection', collection)) toast('Storage is full. Save a backup, then remove some cards.');
  renderTotals();
}

/* ---------- Money ---------- */
const rate = (c) => rates[c] || ROUGH_RATES[c] || 1;
const convert = (amt, from, to) => (amt / rate(from)) * rate(to);
const fromUsd = (usd) => convert(usd, 'USD', settings.currency);
function money(amt, cur = settings.currency) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(amt); }
  catch { return cur + ' ' + amt.toFixed(2); }
}
// What one copy of a card is worth, in the chosen currency. Your own price wins over the database price.
function worth(it) {
  if (it.my) return convert(it.my.amt, it.my.cur, settings.currency);
  return it.usd != null ? fromUsd(it.usd) : null;
}

async function loadRates() {
  const cached = store.get('cs.rates', null);
  const okRates = (r) => r && typeof r === 'object' && Object.keys(ROUGH_RATES).every((c) => c === 'USD' || (typeof r[c] === 'number' && r[c] > 0 && r[c] < 1000));
  if (cached && okRates(cached.rates)) { rates = { USD: 1, ...cached.rates }; ratesAreLive = true; }
  if (!cached || !okRates(cached.rates) || Date.now() - cached.at > 864e5) {
    try {
      const j = await getJson('https://api.frankfurter.dev/v1/latest?base=USD&symbols=AUD,CAD,EUR,GBP,NZD');
      if (j && okRates(j.rates)) {
        const r = {}; for (const c of Object.keys(ROUGH_RATES)) if (c !== 'USD') r[c] = j.rates[c];
        rates = { USD: 1, ...r }; ratesAreLive = true;
        store.set('cs.rates', { at: Date.now(), rates: r });
      }
    } catch { /* keep what we have */ }
  }
  renderAll();
}

/* ---------- Talking to the free card databases ---------- */
async function getJson(url, ms = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
    if (res.status === 404 || res.status === 400) return null; // these databases use 404/400 to mean "no cards found"
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

const eurToUsd = (eur) => eur / rate('EUR');
const price = (label, usd, extra) => { const v = num(usd); return v != null && v > 0 ? [{ label, usd: v, ...extra }] : []; };
const nameForQuery = (s) => s.replace(/[^\p{L}\p{N} '’.\-&]/gu, ' ').replace(/\s+/g, ' ').trim();

const PK_VARIANTS = { normal: 'Normal', holofoil: 'Holo', reverseHolofoil: 'Reverse holo', '1stEditionHolofoil': '1st Edition holo', '1stEditionNormal': '1st Edition', unlimitedHolofoil: 'Unlimited holo', unlimitedNormal: 'Unlimited' };
function pkCard(c) {
  const opts = [];
  for (const [k, v] of Object.entries((c.tcgplayer && c.tcgplayer.prices) || {})) {
    opts.push(...price((PK_VARIANTS[k] || k) + ' · TCGplayer', v && (v.market ?? v.mid)));
  }
  if (!opts.length && c.cardmarket && c.cardmarket.prices) {
    const eur = num(c.cardmarket.prices.averageSellPrice);
    if (eur) opts.push(...price('Cardmarket average', eurToUsd(eur)));
  }
  return {
    cat: 'pokemon', id: str(c.id, 80), name: str(c.name), set: str(c.set && c.set.name),
    year: str(c.set && c.set.releaseDate, 4), number: str(c.number, 20), rarity: str(c.rarity, 60),
    img: safeImg(c.images && c.images.small), options: opts,
  };
}
function mtgCard(c) {
  const p = c.prices || {};
  const imgs = c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris) || {};
  return {
    cat: 'magic', id: str(c.id, 80), name: str(c.name), set: str(c.set_name), year: str(c.released_at, 4),
    number: str(c.collector_number, 20), rarity: str(c.rarity, 60), img: safeImg(imgs.small || imgs.normal),
    options: [...price('Normal · TCGplayer', p.usd), ...price('Foil · TCGplayer', p.usd_foil), ...price('Etched · TCGplayer', p.usd_etched)],
  };
}
function ygoCard(c) {
  const p = (c.card_prices && c.card_prices[0]) || {};
  const base = num(p.tcgplayer_price) || (num(p.cardmarket_price) ? eurToUsd(num(p.cardmarket_price)) : null);
  const opts = price('Average of all versions · TCGplayer', base);
  for (const s of (c.card_sets || []).slice(0, 60)) {
    const sp = num(s.set_price) || base;
    opts.push(...price(`${str(s.set_name, 50)} · ${str(s.set_rarity, 30)}`, sp, { set: str(s.set_name), rarity: str(s.set_rarity, 60), number: str(s.set_code, 20) }));
  }
  const first = (c.card_sets || [])[0] || {};
  const img = c.card_images && c.card_images[0];
  return {
    cat: 'yugioh', id: str(c.id, 80), name: str(c.name), set: str(first.set_name),
    year: str(c.misc_info && c.misc_info[0] && c.misc_info[0].tcg_date, 4), number: str(first.set_code, 20),
    rarity: str(first.set_rarity, 60), img: safeImg(img && img.image_url_small), options: opts,
  };
}
function lorCard(c) {
  const p = c.prices || {};
  const imgs = (c.image_uris && c.image_uris.digital) || {};
  return {
    cat: 'lorcana', id: str(c.id, 80), name: str(c.version ? `${c.name} – ${c.version}` : c.name), set: str(c.set && c.set.name),
    year: str(c.released_at, 4), number: str(c.collector_number, 20), rarity: str(c.rarity, 60).replace(/_/g, ' '),
    img: safeImg(imgs.small || imgs.normal), options: [...price('Normal · TCGplayer', p.usd), ...price('Foil · TCGplayer', p.usd_foil)],
  };
}

const PK = 'https://api.pokemontcg.io/v2/cards';
const PK_FIELDS = '&select=id,name,number,rarity,images,set,tcgplayer,cardmarket';
const SOURCES = {
  pokemon: {
    async search(name, n) {
      const q = nameForQuery(name).replace(/[’]/g, "'");
      const part = /\s/.test(q) ? `name:"${q}"` : `name:${q}*`;
      const run = async (extra) => {
        const j = await getJson(`${PK}?q=${encodeURIComponent(part + extra)}&orderBy=-set.releaseDate&pageSize=24${PK_FIELDS}`);
        return ((j && j.data) || []).map(pkCard);
      };
      let out = n ? await run(` number:${n}`) : [];
      if (!out.length) out = await run('');
      return out;
    },
    async byId(it) { const j = await getJson(`${PK}/${encodeURIComponent(it.id)}?${PK_FIELDS.slice(1)}`); return j && j.data ? pkCard(j.data) : null; },
  },
  magic: {
    async search(name) {
      const j = await getJson(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(nameForQuery(name))}&unique=prints&order=released`);
      return ((j && j.data) || []).slice(0, 24).map(mtgCard);
    },
    async byId(it) { const j = await getJson(`https://api.scryfall.com/cards/${encodeURIComponent(it.id)}`); return j && j.id ? mtgCard(j) : null; },
  },
  yugioh: {
    async search(name) {
      const j = await getJson(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(nameForQuery(name))}&num=12&offset=0&misc=yes`);
      return ((j && j.data) || []).map(ygoCard);
    },
    async byId(it) { const j = await getJson(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(it.id)}&misc=yes`); return j && j.data && j.data[0] ? ygoCard(j.data[0]) : null; },
  },
  lorcana: {
    async search(name) {
      const j = await getJson(`https://api.lorcast.com/v0/cards/search?q=${encodeURIComponent(nameForQuery(name))}`);
      return ((j && j.results) || []).slice(0, 24).map(lorCard);
    },
    async byId(it) { const all = await this.search(it.name.split(' – ')[0]); return all.find((c) => c.id === it.id) || null; },
  },
};

/* ---------- Rarity ---------- */
const TIERS = {
  very: { label: 'Very rare', stars: '★★★', cls: 'rare-very' },
  rare: { label: 'Rare', stars: '★★', cls: 'rare-very' },
  uncommon: { label: 'Uncommon', stars: '★', cls: '' },
  common: { label: 'Common', stars: '', cls: '' },
  unknown: { label: 'Not sure', stars: '', cls: '' },
};
function tierOf(rarity) {
  const r = (rarity || '').toLowerCase();
  if (!r) return TIERS.unknown;
  if (/secret|hyper|ultra|illustration|special|rainbow|starlight|ghost|mythic|legendary|enchanted|gold|prismatic|quarter century|amazing|shiny|very rare|super|holo|promo|collector|platinum/.test(r)) return TIERS.very;
  if (/uncommon/.test(r)) return TIERS.uncommon;
  if (/rare/.test(r)) return TIERS.rare;
  if (/common|short print/.test(r)) return TIERS.common;
  return TIERS.unknown;
}

/* ---------- Reading the card photo (all on this device) ---------- */
let workerPromise = null;
let onProgress = null;
function getReader() {
  if (!window.Tesseract) return Promise.reject(new Error('reader missing'));
  if (!workerPromise) {
    const base = new URL('vendor', document.baseURI).href; // our own copy of the reader, no outside code
    workerPromise = Tesseract.createWorker('eng', 1, {
      workerPath: base + '/worker.min.js', corePath: base, langPath: base, workerBlobURL: false, gzip: true,
      logger: (m) => { if (onProgress) onProgress(m); },
    }).catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

async function photoToCanvas(file, maxSide) {
  let src;
  try { src = await createImageBitmap(file); }
  catch {
    src = await new Promise((ok, bad) => {
      const url = URL.createObjectURL(file); const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); ok(im); };
      im.onerror = () => { URL.revokeObjectURL(url); bad(new Error('bad image')); };
      im.src = url;
    });
  }
  const w = src.width, ht = src.height, k = Math.min(1, maxSide / Math.max(w, ht));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(ht * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}
function shrink(canvas, width) {
  const k = Math.min(1, width / canvas.width);
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.6);
}

// Turns the raw words read off the card into: likely name lines, card number, year and card type.
function analyze(text) {
  const low = text.toLowerCase();
  const lines = [];
  for (const raw of text.split('\n')) {
    if (BORING.test(raw)) continue;
    let s = raw.replace(/\b\d{2,3}\s*HP\b|\bHP\s*\d{2,3}\b/gi, ' ').replace(/[^\p{L}\p{N} '’\-.&]/gu, ' ');
    s = s.replace(/^\s*(basic|stage\s*\d?)\s+/i, ' ');
    let words = s.split(/\s+/).filter((w) => /\p{L}/u.test(w));
    while (words.length && words[0].length === 1) words.shift();
    while (words.length && words[words.length - 1].length === 1 && !/[VX]/.test(words[words.length - 1])) words.pop();
    s = words.join(' ').replace(/^[.\-'&]+|[.\-'&]+$/g, '');
    const letters = (s.match(/\p{L}/gu) || []).length;
    if (letters >= 3 && s.length <= 40 && letters / s.length >= 0.7 && !lines.includes(s)) lines.push(s);
    if (lines.length >= 8) break;
  }
  const score = {};
  for (const [cat, pts, re] of CLUES) if (re.test(low)) score[cat] = (score[cat] || 0) + pts;
  let cat = null, best = 0;
  for (const [c, s] of Object.entries(score)) if (c !== 'sports' && s > best) { cat = c; best = s; }
  if (best < 2) cat = score.sports ? 'sports' : null;
  const m = text.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
  const thisYear = new Date().getFullYear();
  const years = (text.match(/\b(19[5-9]\d|20\d\d)\b/g) || []).map(Number).filter((y) => y <= thisYear + 1);
  const brand = (text.match(BRANDS) || [])[1];
  const code = (text.match(/\b([A-Z0-9]{3,5}-[A-Z]{0,3}\d{3})\b/) || [])[1];
  return {
    lines, cat, number: m ? String(parseInt(m[1], 10)) : ((text.match(/#\s?(\d{1,4})\b/) || [])[1] || ''), year: years.length ? String(Math.max(...years)) : '',
    brand: brand ? brand.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase()) : '', setCode: code || '',
  };
}

let lastScan = null; // { thumb, info }

async function handlePhoto(file) {
  if (!file) return;
  if (!/^image\//.test(file.type) || file.size > 40e6) { toast('Please pick a photo.'); return; }
  const status = $('#scan-status'), msg = $('#scan-msg'), bar = $('#scan-progress');
  $('#read-box').hidden = true; $('#results').replaceChildren(); $('#result-msg').hidden = true;
  status.hidden = false; bar.hidden = false; bar.removeAttribute('value');
  msg.textContent = 'Getting the card reader ready…';
  let canvas;
  try { canvas = await photoToCanvas(file, 1600); }
  catch { msg.textContent = "I couldn't open that photo. Try another one."; bar.hidden = true; return; }
  const thumb = shrink(canvas, 200);
  $('#scan-thumb').src = thumb;
  let text = '';
  try {
    onProgress = (m) => {
      if (m.status === 'recognizing text') { msg.textContent = 'Reading the card…'; bar.value = m.progress || 0; }
    };
    const reader = await getReader();
    text = (await reader.recognize(canvas)).data.text || '';
  } catch {
    msg.textContent = "The card reader couldn't start. You can still type the card's name below.";
    bar.hidden = true; lastScan = { thumb, info: null }; return;
  } finally { onProgress = null; }
  bar.hidden = true;
  const info = analyze(text);
  lastScan = { thumb, info };
  showRead(info);
  if (!info.lines.length) {
    msg.textContent = "I couldn't read any words. Try again with more light and less glare, or type the name below.";
    return;
  }
  msg.textContent = 'Done reading!';
  $('#q').value = info.lines[0]; $('#q-num').value = info.number;
  if (info.cat && !CAT[info.cat].db) {
    $('#q-cat').value = info.cat;
    showNotice(`This looks like a ${catLabel(info.cat)} card. There is no free price list for these, so check the details, then look up sold prices on eBay.`);
    openSheet(manualDraft(info.lines[0]));
    return;
  }
  $('#q-cat').value = info.cat || 'auto';
  runSearch(info.lines.slice(0, 3), info.cat || 'auto', info.number);
}

function showRead(info) {
  const box = $('#read-box');
  box.hidden = !info.lines.length;
  $('#read-cat').textContent = info.cat ? `I think this is a ${catLabel(info.cat)} card.` : "I'm not sure what type of card this is yet.";
  $('#read-lines').replaceChildren(...info.lines.map((l) => h('button', {
    class: 'chip', type: 'button', text: l,
    onclick: () => { $('#q').value = l; runSearch([l], $('#q-cat').value, $('#q-num').value.trim()); },
  })));
}

/* ---------- Searching ---------- */
let searchRun = 0;
function showNotice(text) { const n = $('#result-msg'); n.textContent = text; n.hidden = !text; }

async function runSearch(names, cat, number) {
  names = names.map((n) => str(n, 80)).filter((n) => n.length >= 2);
  if (!names.length) { showNotice("Type the card's name first."); return; }
  number = /^[A-Za-z0-9-]{1,12}$/.test(number || '') ? number : '';
  if (cat !== 'auto' && !(CAT[cat] && CAT[cat].db)) { openSheet(manualDraft(names[0], cat)); return; }
  const mine = ++searchRun;
  const keys = cat === 'auto' ? Object.keys(SOURCES) : [cat];
  showNotice('Looking up the card…');
  $('#results').replaceChildren();
  let found = [], failed = 0;
  for (const name of names) {
    const done = await Promise.allSettled(keys.map((k) => SOURCES[k].search(name, number)));
    if (mine !== searchRun) return;
    failed = done.filter((d) => d.status === 'rejected').length;
    found = done.flatMap((d) => (d.status === 'fulfilled' ? d.value : [])).filter((c) => c.name);
    if (found.length) { $('#q').value = name; break; }
  }
  if (number) found.sort((a, b) => (b.number === number) - (a.number === number));
  const wanted = names[0].toLowerCase();
  found.sort((a, b) => (b.name.toLowerCase() === wanted) - (a.name.toLowerCase() === wanted));
  const missing = failed ? ' Some card databases did not answer, so results may be missing.' : '';
  if (!found.length) {
    showNotice(failed === keys.length
      ? "I couldn't reach the card databases. Check your internet and try again."
      : 'No match found. Check the spelling, tap a different line, or add it by hand.' + missing);
    return;
  }
  showNotice(`Found ${found.length} ${found.length === 1 ? 'card' : 'cards'}. Tap the one that matches yours.` + missing);
  $('#results').replaceChildren(...found.map((c) => itemRow({
    img: c.img, name: c.name, num: [c.number && '#' + c.number, c.year].filter(Boolean).join(' · '), sub: c.set,
    cat: c.cat, price: c.options[0] ? money(fromUsd(c.options[0].usd)) : '',
    onclick: () => openSheet(dbDraft(c)),
  })));
}

function itemRow({ img, name, sub, cat, num: n, price: p, onclick }) {
  const pic = safeImg(img)
    ? h('img', { src: safeImg(img), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
    : h('span', { class: 'noimg', 'aria-hidden': 'true', text: '🃏' });
  return h('button', { class: 'item', type: 'button', onclick },
    h('span', { class: 'item-pic' }, pic),
    n && h('span', { class: 'item-num', text: n }),
    h('span', { class: 'item-name', text: name }),
    h('span', { class: 'pill cat-' + cat, text: catLabel(cat) }),
    sub && h('span', { class: 'item-sub', text: sub }),
    p && h('span', { class: 'item-price', text: p }));
}

/* ---------- Card details sheet ---------- */
function dbDraft(c) {
  let sel = 0;
  const code = lastScan && lastScan.info && lastScan.info.setCode;
  if (code) { const i = c.options.findIndex((o) => o.number === code); if (i >= 0) sel = i; }
  const d = { src: 'db', cat: c.cat, id: c.id, name: c.name, set: c.set, year: c.year, number: c.number, rarity: c.rarity, img: c.img, options: c.options, sel, my: null, qty: 1 };
  pick(d, sel);
  return d;
}
function pick(d, i) {
  const o = d.options[i];
  d.sel = i; d.usd = o ? o.usd : null; d.priceLabel = o ? o.label : '';
  if (o && o.set) { d.set = o.set; d.rarity = o.rarity; d.number = o.number; }
}
function manualDraft(name, cat) {
  const info = (lastScan && lastScan.info) || {};
  return {
    src: 'manual', cat: (cat && CAT[cat] && cat) || info.cat || 'other', id: '', name: str(name), set: info.brand || '', year: info.year || '',
    number: info.number || '', rarity: '', img: lastScan ? lastScan.thumb : '', options: [], sel: 0, usd: null, priceLabel: '', my: null, qty: 1,
  };
}

function ebayUrl(d) {
  const words = d.src === 'manual' ? [d.year, d.set, d.name, d.number && '#' + d.number] : [d.name, d.number, d.set];
  const q = words.filter(Boolean).join(' ').slice(0, 200);
  // LH_Sold + LH_Complete = sold items only. _sop=13 = newest sales first.
  return `https://${CURRENCIES[settings.currency].ebay}/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sop=13`;
}

let draft = null;
function openSheet(d) { draft = d; renderSheet(); $('#sheet').hidden = false; $('#sheet-close').focus(); }
function closeSheet() { $('#sheet').hidden = true; draft = null; }

function field(label, input) { return h('label', { class: 'field' }, h('span', { text: label }), input); }
function select(options, value, onchange) {
  const s = h('select', { onchange: (e) => onchange(e.target.value) }, options.map(([v, t]) => h('option', { value: v, text: t })));
  s.value = value; return s;
}

function renderSheet() {
  const d = draft, cur = settings.currency, body = $('#sheet-body');
  const manual = d.src === 'manual', saved = !!d.uid;
  const ebay = h('a', { class: 'btn blue', href: ebayUrl(d), target: '_blank', rel: 'noopener noreferrer', text: 'See most recent sold on eBay ↗' });
  const sync = () => { ebay.href = ebayUrl(d); };
  const text = (key, max, ph) => h('input', { type: 'text', maxlength: max, value: d[key], placeholder: ph, oninput: (e) => { d[key] = e.target.value; sync(); } });

  const pic = safeImg(d.img)
    ? h('img', { src: safeImg(d.img), alt: 'Picture of the card', referrerpolicy: 'no-referrer' })
    : h('span', { class: 'noimg', 'aria-hidden': 'true', text: '🃏' });
  const head = h('div', { class: 'detail-head' }, h('div', { class: 'detail-pic' }, pic), h('div', null,
    h('span', { class: 'pill cat-' + d.cat, text: catLabel(d.cat) }),
    h('h2', { id: 'sheet-title', text: d.name || 'New card' }),
    !manual && h('p', { class: 'muted', text: [d.set, d.year].filter(Boolean).join(' · ') })));

  const parts = [head];
  if (manual) {
    parts.push(h('div', { class: 'card-box' },
      h('h2', { text: 'Card details' }),
      field('Name (player, driver or character)', text('name', 120, 'e.g. Oscar Piastri')),
      field('Card type', select(CATS.map((c) => [c.id, c.label]), d.cat, (v) => { d.cat = v; })),
      h('div', { class: 'row' },
        h('div', { class: 'grow' }, field('Year', h('input', { type: 'text', inputmode: 'numeric', maxlength: 4, value: d.year, placeholder: 'e.g. 2023', oninput: (e) => { d.year = e.target.value; sync(); } }))),
        h('div', { class: 'grow' }, field('Card number', text('number', 20, 'e.g. 12')))),
      field('Set or brand', text('set', 120, 'e.g. Topps Chrome')),
      field('How rare is it?', select([['', 'Not sure'], ['Common', 'Common'], ['Uncommon', 'Uncommon'], ['Rare', 'Rare'], ['Very rare', 'Very rare (numbered, autograph, special)']], d.rarity, (v) => { d.rarity = v; }))));
  } else {
    const t = tierOf(d.rarity);
    const fact = (k, v) => h('div', { class: 'fact' }, h('dt', { text: k }), h('dd', { text: v || 'Unknown' }));
    parts.push(h('dl', { class: 'facts' },
      fact('Is it rare?', [t.label, t.stars].filter(Boolean).join(' ')),
      fact('Rarity on the card', d.rarity), fact('Came out in', d.year), fact('Card number', d.number)));
  }

  // Price
  const priceBox = h('div', { class: 'card-box' }, h('h2', { text: 'Average price' }));
  if (d.usd != null) {
    priceBox.append(h('p', { class: 'price-big', text: money(fromUsd(d.usd)) }),
      h('p', { class: 'muted small', text: `${d.priceLabel || 'Market price'}. This is the usual selling price, not one single sale.${ratesAreLive ? '' : ' Converted with rough exchange rates.'}` }));
  } else {
    priceBox.append(h('p', { class: 'muted', text: manual ? 'No free price list covers this kind of card. Tap the eBay button to see what it really sold for, then type that price below.' : 'No price found for this card. Check eBay and type the price below.' }));
  }
  if (d.options.length > 1) {
    priceBox.append(h('p', { class: 'small muted', text: 'Which version do you have?' }),
      h('div', { class: 'opts' }, d.options.map((o, i) => h('button', {
        class: 'opt', type: 'button', 'aria-pressed': String(i === d.sel), onclick: () => { pick(d, i); renderSheet(); },
      }, h('span', { text: o.label }), h('b', { text: money(fromUsd(o.usd)) })))));
  }
  priceBox.append(ebay,
    field(`Price you saw it sell for, in ${cur} (optional)`, h('input', {
      type: 'number', inputmode: 'decimal', min: '0', step: '0.01', placeholder: '0.00',
      value: d.my ? convert(d.my.amt, d.my.cur, cur).toFixed(2) : '',
      oninput: (e) => { const v = num(e.target.value); d.my = v != null && e.target.value !== '' ? { amt: v, cur } : null; },
    })),
    h('p', { class: 'muted small', text: 'If you fill this in, your collection uses your price instead.' }));
  parts.push(priceBox);

  // Quantity + save
  const out = h('output', { text: d.qty });
  const step = (n) => { d.qty = Math.min(9999, Math.max(1, d.qty + n)); out.textContent = d.qty; };
  parts.push(h('div', { class: 'card-box' },
    h('h2', { text: 'How many do you have?' }),
    h('div', { class: 'qty' },
      h('button', { class: 'btn', type: 'button', 'aria-label': 'One less', text: '−', onclick: () => step(-1) }), out,
      h('button', { class: 'btn', type: 'button', 'aria-label': 'One more', text: '+', onclick: () => step(1) }))));
  parts.push(h('div', { class: 'stack' },
    h('button', { class: 'btn primary', type: 'button', text: saved ? 'Save changes' : 'Add to my collection', onclick: saveDraft }),
    saved && h('button', { class: 'btn danger', type: 'button', text: 'Remove from my collection', onclick: removeDraft })));
  body.replaceChildren(...parts);
  body.scrollTop = 0;
}

function saveDraft() {
  const item = cleanItem({ ...draft, added: draft.added || Date.now() });
  if (!item) { toast('Please give the card a name first.'); return; }
  const i = collection.findIndex((c) => c.uid === item.uid);
  if (i >= 0) collection[i] = item;
  else {
    // Scanning the same card again just adds to the count instead of making a copy.
    const same = item.src === 'db' ? collection.find((c) => c.src === 'db' && c.cat === item.cat && c.id === item.id && c.priceLabel === item.priceLabel) : null;
    if (same) { same.qty = Math.min(9999, same.qty + item.qty); if (item.my) same.my = item.my; }
    else collection.push(item);
  }
  save(); closeSheet(); renderCollection();
  toast(i >= 0 ? 'Saved.' : 'Added to your collection!');
}
function removeDraft() {
  if (!confirm('Remove this card from your collection?')) return;
  collection = collection.filter((c) => c.uid !== draft.uid);
  save(); closeSheet(); renderCollection(); toast('Removed.');
}

/* ---------- Collection ---------- */
let colFilter = 'all';
const totalOf = (list) => list.reduce((sum, it) => sum + (worth(it) || 0) * it.qty, 0);
const countOf = (list) => list.reduce((n, it) => n + it.qty, 0);

function renderTotals() {
  $('#top-total').textContent = collection.length ? money(totalOf(collection)) : '';
}
function renderCollection() {
  renderTotals();
  const n = countOf(collection);
  $('#col-total').textContent = money(totalOf(collection));
  const unpriced = collection.filter((c) => worth(c) == null).length;
  $('#col-count').textContent = `${n} ${n === 1 ? 'card' : 'cards'}` + (unpriced ? ` · ${unpriced} without a price yet` : '');
  $('#col-empty').hidden = collection.length > 0;

  const cats = [...new Set(collection.map((c) => c.cat))];
  if (colFilter !== 'all' && !cats.includes(colFilter)) colFilter = 'all';
  const chip = (id, label, list) => h('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(colFilter === id),
    text: `${label} · ${money(totalOf(list))}`, onclick: () => { colFilter = id; renderCollection(); },
  });
  $('#col-cats').replaceChildren(...(cats.length > 1
    ? [chip('all', 'All', collection), ...cats.map((c) => chip(c, catLabel(c), collection.filter((x) => x.cat === c)))] : []));

  const list = collection.filter((c) => colFilter === 'all' || c.cat === colFilter);
  const sort = $('#col-sort').value;
  list.sort(sort === 'value' ? (a, b) => (worth(b) || 0) * b.qty - (worth(a) || 0) * a.qty
    : sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.added - a.added);
  $('#col-list').replaceChildren(...list.map((it) => {
    const w = worth(it);
    return itemRow({
      img: it.img, name: (it.qty > 1 ? `${it.qty} × ` : '') + it.name,
      num: [it.number && '#' + it.number, it.year].filter(Boolean).join(' · '),
      sub: [it.set, tierOf(it.rarity) !== TIERS.unknown && tierOf(it.rarity).label].filter(Boolean).join(' · '),
      cat: it.cat, price: w == null ? 'No price' : money(w * it.qty),
      onclick: () => openSheet({ ...it, my: it.my && { ...it.my }, options: [], sel: 0 }),
    });
  }));
}

async function refreshPrices() {
  const btn = $('#btn-refresh'), note = $('#col-msg');
  const todo = collection.filter((c) => c.src === 'db' && c.id && SOURCES[c.cat]);
  if (!todo.length) { toast('No cards with database prices to update.'); return; }
  btn.disabled = true; note.hidden = false;
  let ok = 0, bad = 0;
  for (const [i, it] of todo.entries()) {
    note.textContent = `Updating prices… ${i + 1} of ${todo.length}`;
    try {
      const fresh = await SOURCES[it.cat].byId(it);
      const o = fresh && (fresh.options.find((x) => x.label === it.priceLabel) || (!it.priceLabel && fresh.options[0]));
      if (o) { it.usd = o.usd; it.priceLabel = o.label; ok++; } else bad++;
    } catch { bad++; }
    await new Promise((r) => setTimeout(r, 150)); // be polite to the free databases
  }
  btn.disabled = false;
  note.textContent = `Updated ${ok} ${ok === 1 ? 'price' : 'prices'}.` + (bad ? ` ${bad} could not be updated.` : '');
  save(); renderCollection();
}

/* ---------- Backup ---------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: 'card-scanner', version: 1, saved: new Date().toISOString(), cards: collection }, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `card-collection-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function importBackup(file) {
  if (!file) return;
  if (file.size > 8e6) { toast('That file is too big to be a backup.'); return; }
  let cards;
  try { const j = JSON.parse(await file.text()); cards = Array.isArray(j) ? j : j.cards; } catch { cards = null; }
  if (!Array.isArray(cards)) { toast("That doesn't look like a backup file."); return; }
  const have = new Set(collection.map((c) => c.uid));
  const fresh = cards.slice(0, 5000).map(cleanItem).filter((c) => c && !have.has(c.uid));
  if (!fresh.length) { toast('Nothing new in that backup.'); return; }
  if (!confirm(`Add ${fresh.length} ${fresh.length === 1 ? 'card' : 'cards'} from this backup to your collection?`)) return;
  collection.push(...fresh); save(); renderCollection(); toast('Backup loaded.');
}

/* ---------- Tabs and start-up ---------- */
function showView(name) {
  for (const v of ['scan', 'collection', 'settings']) $('#view-' + v).hidden = v !== name;
  document.querySelectorAll('.tab').forEach((t) => (t.dataset.view === name ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
  if (name === 'collection') renderCollection();
  window.scrollTo(0, 0);
}
function renderAll() {
  renderCollection();
  $('#rate-note').textContent = ratesAreLive
    ? 'Card prices come in US dollars and are converted with today\'s exchange rate.'
    : 'Could not get today\'s exchange rate, so prices use a rough one for now.';
  if (draft) renderSheet();
}

function start() {
  $('#q-cat').append(h('option', { value: 'auto', text: 'Any (work it out)' }), ...CATS.map((c) => h('option', { value: c.id, text: c.label })));
  $('#set-currency').append(...Object.entries(CURRENCIES).map(([k, v]) => h('option', { value: k, text: v.label })));
  $('#set-currency').value = settings.currency;

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
  for (const id of ['#in-camera', '#in-photo']) {
    $(id).addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; handlePhoto(f); });
  }
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch([$('#q').value], $('#q-cat').value, $('#q-num').value.trim());
  });
  $('#btn-manual').addEventListener('click', () => {
    const c = $('#q-cat').value;
    openSheet(manualDraft($('#q').value, c === 'auto' ? null : c));
  });
  $('#sheet-close').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && draft) closeSheet(); });
  $('#col-sort').addEventListener('change', renderCollection);
  $('#btn-refresh').addEventListener('click', refreshPrices);
  $('#set-currency').addEventListener('change', (e) => {
    if (CURRENCIES[e.target.value]) { settings.currency = e.target.value; store.set('cs.settings', settings); renderAll(); $('#results').replaceChildren(); showNotice(''); }
  });
  $('#btn-export').addEventListener('click', exportBackup);
  $('#in-import').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; importBackup(f); });
  $('#btn-wipe').addEventListener('click', () => {
    if (!collection.length) { toast('Your collection is already empty.'); return; }
    if (!confirm('Delete every card in your collection? This cannot be undone.')) return;
    collection = []; save(); renderCollection(); toast('Collection deleted.');
  });

  renderAll();
  loadRates();
}
start();
