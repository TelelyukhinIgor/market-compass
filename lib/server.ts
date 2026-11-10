import { canReceiveViewerTelegram, telegramViewerEmail, subscriptionStart } from './telegram-viewer';
import { env } from 'cloudflare:workers';
import { instruments, activeInstruments, cleanProviderRows, intervals, defaultCalendar, analyze, validate, aggregateSessions, type Bar, selectDisplayLevels, levelPriceTolerance, etfFreshness, LEVEL_ENGINE_VERSION } from './market';
import { renderTelegramChart } from './telegram-chart';
import seed from './gold-seed.json';
const E = () => env as unknown as {
    DB: D1Database;
    CONFIG_ENCRYPTION_KEY: string;
    TWELVE_DATA_API_KEY?: string;
    TRADING_VIEWER_TELEGRAM_DISABLED?: string;
};
const db = () => { if (!E().DB)
    throw Error("Storage is temporarily unavailable"); return E().DB; };
const b64 = (a: Uint8Array) => btoa(String.fromCharCode(...a));
const bytes = (s: string) => Uint8Array.from(atob(s), x => x.charCodeAt(0));
async function key() { const hex = E().CONFIG_ENCRYPTION_KEY; if (!hex || hex.length !== 64)
    throw Error("Encrypted credential storage is not configured"); return crypto.subtle.importKey('raw', Uint8Array.from(hex.match(/../g)!, x => parseInt(x, 16)), 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function encrypt(s: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(s)); return b64(iv) + '.' + b64(new Uint8Array(c)); }
async function decrypt(s: string) { const [iv, c] = s.split('.'); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, await key(), bytes(c))); }
async function getSetting(k: string) { const r = await db().prepare('SELECT value FROM settings WHERE key=?').bind(k).first<{
    value: string;
}>(); return r?.value || ''; }
async function putSetting(k: string, v: string) { await db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, v).run(); }
const permanentStrongPrefix = 'permanentStrong:';
const permanentStrongKey = (symbol: string, tf: string, price: number) => permanentStrongPrefix + symbol + ':' + tf + ':' + Number(price.toFixed(8));
async function getPermanentStrongLevels(symbol: string, tf: string) { const rows = await db().prepare('SELECT value FROM settings WHERE key LIKE ?').bind(permanentStrongPrefix + symbol + ':' + tf + ':%').all<{
    value: string;
}>(); return rows.results.map(r => { try {
    return JSON.parse(r.value);
}
catch {
    return null;
} }).filter(Boolean); }
async function rememberStrongLevels(symbol: string, tf: string, levels: any[], lastTime: string) { const existing = await getPermanentStrongLevels(symbol, tf), known = [...existing], writes: any[] = []; for (const l of levels || []) {
    if (l?.strength !== 'strong' || l.tentative || !Number.isFinite(l.price))
        continue;
    const price = Number(l.price);
    if (known.some(x => Math.abs(Number(x.price) - price) <= levelPriceTolerance(symbol, Number(x.price), price)))
        continue;
    const record = { symbol, tf, price, strength: 'strong', permanent: true, reactions: Number(l.reactions) || 0, departure: Number(l.departure) || 0, breaches: Number(l.breaches) || 0, ageAtArchive: Number.isFinite(l.age) ? l.age : null, firstBarTime: lastTime || null, savedAt: new Date().toISOString() };
    writes.push(db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(permanentStrongKey(symbol, tf, price), JSON.stringify(record)));
    known.push(record);
} if (writes.length)
    await db().batch(writes); return known; }
function mergePermanentStrongLevels(levels: any[], permanent: any[], price: number, atr: number, symbol: string) { const archived = permanent.map(l => ({ ...l, strength: 'strong', permanent: true, tentative: false, distance: Number(l.price) - price, distanceATR: atr ? (Number(l.price) - price) / atr : 0 })); const current = (levels || []).filter(l => !archived.some(a => Math.abs(Number(a.price) - Number(l.price)) <= levelPriceTolerance(symbol, Number(a.price), Number(l.price)))); return [...archived, ...current]; }
const viewerTelegramDisabled = () => E().TRADING_VIEWER_TELEGRAM_DISABLED === 'true';
async function clearViewerTelegramSubscription() { if (!viewerTelegramDisabled())
    return; await db().batch([db().prepare('DELETE FROM settings WHERE key=?').bind('telegramSubscriber:' + telegramViewerEmail), db().prepare('DELETE FROM settings WHERE key=?').bind('telegramInvite:' + telegramViewerEmail)]); }
async function secrets() { const s = await getSetting('secrets'); const saved = s ? JSON.parse(await decrypt(s)) : {}; return { ...(E().TWELVE_DATA_API_KEY ? { twelve: E().TWELVE_DATA_API_KEY } : {}), ...saved }; }
async function config() { const s = await getSetting('config'); const cfg = s ? JSON.parse(s) : {};
    cfg.scheduleEnabled ??= false;
    cfg.sources ??= Object.fromEntries(instruments.map(i => [i.id, ''])); if (cfg.calendarPolicyVersion !== 'ljubljana-mon01-fri23-v1') {
    cfg.calendars = { ...(cfg.calendars || {}), XAUUSD: defaultCalendar('metal'), EURUSD: defaultCalendar('forex') };
    cfg.calendarPolicyVersion = 'ljubljana-mon01-fri23-v1';
    await putSetting('config', JSON.stringify(cfg));
} return cfg; }
export async function status() {
    await clearViewerTelegramSubscription();
    const cfg = await config(), sec = await secrets(), stored = await db().prepare('SELECT symbol,tf,data,updated FROM snapshots').all<{
        symbol: string;
        tf: string;
        data: string;
        updated: string;
    }>(), results: any = {};
    for (const r of stored.results) {
        results[r.symbol] ??= {};
        let data = JSON.parse(r.data);
        const instrument = instruments.find(i => i.id === r.symbol);
        if (instrument && (data.levelEngineVersion !== LEVEL_ENGINE_VERSION || data.calendarPolicyVersion !== cfg.calendarPolicyVersion || !data.levelCandidates)) {
            const previous = [...(data.levelCandidates || []), ...(data.levels || [])];
            await rememberStrongLevels(r.symbol, r.tf, previous, data.lastTime);
            const cleaned = cleanProviderRows(data.rawRows || data.rows);
            try {
                const calculated = analyze(cleaned.rows, r.tf, instrument.kind, cfg.calendars?.[r.symbol] || defaultCalendar(instrument.kind), !!data.normalized, r.symbol);
                data = { ...data, ...calculated, warnings: [...calculated.warnings, ...cleaned.warnings], calendarPolicyVersion: cfg.calendarPolicyVersion, levelEngineVersion: LEVEL_ENGINE_VERSION };
                await rememberStrongLevels(r.symbol, r.tf, data.levelCandidates, data.lastTime);
                const permanent = await getPermanentStrongLevels(r.symbol, r.tf);
                data.levelCandidates = mergePermanentStrongLevels(data.levelCandidates, permanent, data.price, data.atr, r.symbol);
                data.levels = selectDisplayLevels(data.levelCandidates, data.price, data.atr, 'intraday', r.tf, undefined, r.symbol);
                data.support = data.levels.filter((l: any) => !l.tentative && l.price < data.price).sort((a: any, b: any) => b.price - a.price)[0];
                data.resistance = data.levels.filter((l: any) => !l.tentative && l.price > data.price).sort((a: any, b: any) => a.price - b.price)[0];
                await db().prepare('UPDATE snapshots SET data=? WHERE id=?').bind(JSON.stringify(data), r.symbol + ':' + r.tf).run();
            }
            catch {
                data.warnings = [...(data.warnings || []), "Levels could not be recalculated: check candle history completeness."];
            }
        }
        if (instrument) {
            const permanent = await getPermanentStrongLevels(r.symbol, r.tf);
            if (permanent.length) {
                data.levelCandidates = mergePermanentStrongLevels(data.levelCandidates || data.levels, permanent, data.price, data.atr, r.symbol);
                data.levels = selectDisplayLevels(data.levelCandidates, data.price, data.atr, 'intraday', r.tf, undefined, r.symbol);
            }
        }
        results[r.symbol][r.tf] = { ...data, received: r.updated };
    }
    return { instruments, config: cfg, connected: { twelve: !!sec.twelve, telegram: !!sec.telegram, chat: !!cfg.chatId }, snapshots: results, lastDeliveries: { intraday: JSON.parse(await getSetting('lastDelivery:intraday') || 'null'), position: JSON.parse(await getSetting('lastDelivery:position') || 'null') }, seed, history: (await db().prepare('SELECT id,symbol,tf,created FROM reports ORDER BY id DESC LIMIT 30').all()).results, scheduling: cfg.scheduleEnabled ? 'enabled' : 'not_enabled' };
}
export async function saveSettings(input: any) {
    const cfg = await config(), sec = await secrets();
    if (typeof input.twelve === 'string' && input.twelve.trim())
        sec.twelve = input.twelve.trim();
    if (typeof input.telegram === 'string' && input.telegram.trim())
        sec.telegram = input.telegram.trim();
    if (input.clearTwelve)
        sec.twelve = "";
    if (input.clearTelegram)
        delete sec.telegram;
    if (typeof input.scheduleEnabled === 'boolean')
        cfg.scheduleEnabled = input.scheduleEnabled;
    if (typeof input.chatId === 'string' && /^\d+$/.test(input.chatId))
        cfg.chatId = input.chatId;
    if (input.sources) {
        cfg.sources = { ...(cfg.sources || {}) };
        for (const i of instruments) {
            const v = input.sources[i.id];
            if (typeof v === 'string' && v.length <= 100)
                cfg.sources[i.id] = v.trim();
        }
    }
    if (input.exchange && typeof input.exchange === 'string' && input.exchange.length < 60)
        cfg.exchange = input.exchange;
    if (input.calendars) {
        cfg.calendars = { ...(cfg.calendars || {}) };
        for (const i of instruments) {
            const c = input.calendars[i.id];
            if (!c)
                continue;
            try {
                new Intl.DateTimeFormat('en-US', { timeZone: c.zone });
            }
            catch {
                throw Error("Unknown time zone");
            }
            if (!Number.isInteger(c.rollHour) || c.rollHour < 0 || c.rollHour > 23 || !Number.isInteger(c.sundayOpen) || c.sundayOpen < 0 || c.sundayOpen > 23)
                throw Error("Invalid session hours");
            if (!Array.isArray(c.closed) || c.closed.some((v: any) => !/^\d{4}-\d{2}-\d{2}$/.test(v)))
                throw Error("Holiday dates must use YYYY-MM-DD");
            if (!c.short || typeof c.short !== 'object' || Object.entries(c.short).some(([d, h]) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || typeof h !== 'number' || h < 0 || h > 23))
                throw Error("Invalid shortened session");
            cfg.calendars[i.id] = c;
        }
    }
    await putSetting('secrets', await encrypt(JSON.stringify(sec)));
    await putSetting('config', JSON.stringify(cfg));
    return { ok: true };
}
export async function searchSymbols(q: string) { const sec = await secrets(); if (!sec.twelve)
    throw Error("Save your Twelve Data key first"); const u = new URL('https://api.twelvedata.com/symbol_search'); u.searchParams.set('symbol', q.slice(0, 100)); u.searchParams.set('outputsize', '12'); const r = await fetch(u, { headers: { Authorization: 'apikey ' + sec.twelve }, signal: AbortSignal.timeout(15000) }); if (!r.ok)
    throw Error("Provider did not respond: HTTP " + r.status); const j: any = await r.json(); return { matches: j.data || [] }; }
async function claimCredit() { const minute = String(Math.floor(Date.now() / 60000)); const key = 'credits:' + minute; await db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(key, '0').run(); const result = await db().prepare("UPDATE settings SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key=? AND CAST(value AS INTEGER)<7 RETURNING value").bind(key).first(); if (!result)
    throw Error("The per-minute limit has been reached. Try again in a minute."); }
export async function refresh(symbol: string, tf: string) {
    const i = instruments.find(x => x.id === symbol);
    if (!i || !intervals[tf])
        throw Error("Unknown instrument or timeframe");
    const cfg = await config(), sec = await secrets();
    if (!sec.twelve)
        throw Error("Save an API key in settings first");
    const source = cfg.sources?.[symbol] ?? i.source;
    if (!source)
        throw Error("Select the exact provider symbol in settings");
    const calendar = cfg.calendars?.[symbol] || defaultCalendar(i.kind);
    const previousSnapshot = await db().prepare('SELECT data FROM snapshots WHERE id=?').bind(symbol + ':' + tf).first<{
        data: string;
    }>();
    if (previousSnapshot) {
        const previous = JSON.parse(previousSnapshot.data);
        await rememberStrongLevels(symbol, tf, [...(previous.levelCandidates || []), ...(previous.levels || [])], previous.lastTime);
    }
    await claimCredit();
    const u = new URL('https://api.twelvedata.com/time_series');
    u.searchParams.set('symbol', source);
    u.searchParams.set('interval', intervals[tf]);
    u.searchParams.set('outputsize', tf === 'D1' ? '300' : tf === 'H1' ? '1500' : '500');
    u.searchParams.set('timezone', 'UTC');
    if (i.kind === 'etf') {
        u.searchParams.set('prepost', 'false');
    }
    if (i.kind === 'crypto' && cfg.exchange)
        u.searchParams.set('exchange', cfg.exchange);
    const r = await fetch(u, { headers: { Authorization: 'apikey ' + sec.twelve }, signal: AbortSignal.timeout(20000) });
    const j: any = await r.json();
    if (!r.ok) {
        const msg = String(j.message || '');
        if (msg.includes('Grow'))
            throw Error("The provider requires a Grow or Venture plan for this instrument");
        if (msg.includes('Pro'))
            throw Error("The provider requires a Pro or Venture plan for this instrument");
        if (r.status === 429)
            throw Error("Twelve Data quota exhausted");
        if (r.status === 404)
            throw Error("The provider did not recognize the symbol");
        throw Error('HTTP ' + r.status + " from the provider");
    }
    if (!j.values)
        throw Error(j.code === 429 ? "Twelve Data quota exhausted" : j.code === 403 ? "Instrument unavailable on your provider plan" : "The provider returned no candles; check the symbol and your access");
    const rows: Bar[] = j.values.map((r: any) => ({ time: r.datetime, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close) }));
    const cleaned = cleanProviderRows(rows);
    const result = analyze(cleaned.rows, tf, i.kind, calendar, false, symbol);
    result.warnings.push(...cleaned.warnings);
    if (cleaned.warnings.length)
        result.status = 'PRELIMINARY';
    await rememberStrongLevels(symbol, tf, result.levelCandidates, result.lastTime);
    const permanent = await getPermanentStrongLevels(symbol, tf);
    result.levelCandidates = mergePermanentStrongLevels(result.levelCandidates, permanent, result.price, result.atr, symbol);
    result.levels = selectDisplayLevels(result.levelCandidates, result.price, result.atr, 'intraday', tf, undefined, symbol);
    result.support = result.levels.filter((l: any) => !l.tentative && l.price < result.price).sort((a: any, b: any) => b.price - a.price)[0];
    result.resistance = result.levels.filter((l: any) => !l.tentative && l.price > result.price).sort((a: any, b: any) => a.price - b.price)[0];
    const full = { ...result, calendarPolicyVersion: cfg.calendarPolicyVersion, levelEngineVersion: LEVEL_ENGINE_VERSION, providerRejected: cleaned.rejected, providerDuplicates: cleaned.duplicates, rawRows: rows, source, exchange: j.meta?.exchange || '', sourceTimezone: j.meta?.exchange_timezone || '', sourceType: j.meta?.type || '', brokerEquivalent: false };
    const created = new Date().toISOString();
    await db().batch([db().prepare('INSERT INTO snapshots(id,symbol,tf,data,updated) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated').bind(symbol + ':' + tf, symbol, tf, JSON.stringify(full), created), db().prepare('INSERT INTO reports(symbol,tf,data,created) VALUES(?,?,?,?)').bind(symbol, tf, JSON.stringify(full), created)]);
    return { symbol, tf, received: created, price: result.price, atr: result.atr, warnings: result.warnings };
}
export async function normalizeDay(symbol: string) { const i = instruments.find(x => x.id === symbol); if (!i || ['index', 'etf'].includes(i.kind))
    throw Error("An index CFD requires a verified broker calendar; automatic aggregation is unavailable"); const cfg = await config(), cal = cfg.calendars?.[symbol] || defaultCalendar(i.kind); if (!cal.confirmed && i.kind !== 'crypto')
    throw Error("Confirm the calendar in settings first"); const h = await db().prepare('SELECT data FROM snapshots WHERE id=?').bind(symbol + ':H1').first<{
    data: string;
}>(); if (!h)
    throw Error("Load H1 data first"); const raw = JSON.parse(h.data), priorDaily = await db().prepare('SELECT data FROM snapshots WHERE id=?').bind(symbol + ':D1').first<{
    data: string;
}>(); if (priorDaily) {
    const prior = JSON.parse(priorDaily.data);
    await rememberStrongLevels(symbol, 'D1', [...(prior.levelCandidates || []), ...(prior.levels || [])], prior.lastTime);
} let day = aggregateSessions(raw.rows, i.kind, cal); day = day.slice(1); const result = analyze(day, 'D1', i.kind, cal, true, symbol); await rememberStrongLevels(symbol, 'D1', result.levelCandidates, result.lastTime); const permanent = await getPermanentStrongLevels(symbol, 'D1'); result.levelCandidates = mergePermanentStrongLevels(result.levelCandidates, permanent, result.price, result.atr, symbol); result.levels = selectDisplayLevels(result.levelCandidates, result.price, result.atr, 'intraday', 'D1', undefined, symbol); result.support = result.levels.filter((l: any) => !l.tentative && l.price < result.price).sort((a: any, b: any) => b.price - a.price)[0]; result.resistance = result.levels.filter((l: any) => !l.tentative && l.price > result.price).sort((a: any, b: any) => a.price - b.price)[0]; const full = { ...result, source: raw.source, normalized: true, brokerEquivalent: false, warnings: [...result.warnings, "The daily series was built from H1: the first incomplete day was excluded; history is limited to the loaded hourly bars."] }; const created = new Date().toISOString(); await db().batch([db().prepare('INSERT INTO snapshots(id,symbol,tf,data,updated) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated').bind(symbol + ':D1', symbol, 'D1', JSON.stringify(full), created), db().prepare('INSERT INTO reports(symbol,tf,data,created) VALUES(?,?,?,?)').bind(symbol, 'D1', JSON.stringify(full), created)]); return { ok: true, bars: day.length }; }
export async function runReport(mode: string, requestId?: string) {
    if (!['position', 'intraday'].includes(mode))
        throw Error("Unknown mode");
    const cfg = await config(), sec = await secrets();
    if (!sec.twelve || !sec.telegram || !cfg.chatId)
        throw Error("The data source or Telegram is not configured");
    const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
    const effectiveRequestId = requestId && requestId.length <= 100 ? requestId : stamp;
    const jobKey = 'delivery:' + mode + ':' + effectiveRequestId;
    // Refresh every timeframe that can contribute a level to the outgoing chart.
    // D1 charts use D1/W1; H1 charts use H1/H4/D1/W1.
    const frames = mode === 'position' ? ['D1', 'W1'] : ['H1', 'H4', 'D1', 'W1'];
    const tasks = activeInstruments.flatMap(i => frames.map(tf => ({ symbol: i.id, tf })));
    const prior = JSON.parse(await getSetting(jobKey) || 'null');
    if (prior?.sent)
        return { ...prior, duplicate: true };
    if (prior?.running && Date.now() - prior.started < 90000)
        throw Error("This report is already being refreshed");
    const progress = prior?.tasks ? prior : { mode, requestId: effectiveRequestId, tasks, cursor: 0, updated: [], errors: [], sent: false };
    const running = { ...progress, started: Date.now(), running: true };
    const lock = await db().prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE COALESCE(json_extract(settings.value,'$.sent'),0)=0 AND (COALESCE(json_extract(settings.value,'$.running'),0)=0 OR CAST(json_extract(settings.value,'$.started') AS INTEGER)<?) RETURNING key").bind(jobKey, JSON.stringify(running), Date.now() - 90000).first();
    if (!lock)
        throw Error("Report already sent or currently refreshing");
    // Each call handles at most three fetches: it stays below the MCP transport timeout.
    let retryAfterMs = 0;
    for (let count = 0; progress.cursor < progress.tasks.length && count < 3; count++) {
        const task = progress.tasks[progress.cursor];
        try {
            const r = await refresh(task.symbol, task.tf);
            progress.updated.push({ symbol: r.symbol, tf: r.tf, received: r.received });
        }
        catch (e) {
            const error = e instanceof Error ? e.message : "Data loading failed";
            if (error.includes("per-minute limit")) {
                retryAfterMs = 60000 - Date.now() % 60000 + 500;
                break;
            }
            progress.errors.push({ ...task, error });
        }
        progress.cursor++;
        await putSetting(jobKey, JSON.stringify({ ...progress, started: running.started, running: true }));
    }
    if (progress.cursor < progress.tasks.length) {
        const pending = { ...progress, requestId: progress.requestId || effectiveRequestId, pending: true, running: false, started: 0, retryAfterMs };
        await putSetting(jobKey, JSON.stringify(pending));
        return pending;
    }
    try {
        const delivery = await sendTelegram(mode, false, progress.errors);
        const out = { mode, requestId: progress.requestId || effectiveRequestId, sent: true, pending: false, photos: delivery.photos || 0, missing: delivery.missing || [], subscriberErrors: delivery.subscriberErrors || [], updated: progress.updated, errors: progress.errors, finished: new Date().toISOString() };
        await putSetting(jobKey, JSON.stringify(out));
        await putSetting('lastDelivery:' + mode, JSON.stringify(out));
        return out;
    }
    catch (e) {
        await putSetting(jobKey, JSON.stringify({ ...progress, started: 0, running: false, sent: false, pending: true, error: "Delivery failed" }));
        throw e;
    }
}
async function tg(method: string, body: any) { const sec = await secrets(); if (!sec.telegram)
    throw Error("Save your Telegram bot token first"); const multipart = typeof FormData !== 'undefined' && body instanceof FormData; let r: Response; try {
    r = await fetch('https://api.telegram.org/bot' + sec.telegram + '/' + method, { method: 'POST', ...(multipart ? {} : { headers: { 'Content-Type': 'application/json' } }), body: multipart ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
}
catch {
    throw Error("Telegram is temporarily unavailable");
} let j: any; try {
    j = await r.json();
}
catch {
    throw Error("Telegram returned an invalid response");
} if (!j.ok)
    throw Error("Telegram rejected the request; check the token and start the bot"); return j.result; }
type TelegramPhoto = {
    symbol: string;
    name: string;
    tf: string;
    caption: string;
    bytes: ArrayBuffer;
};
async function sendChartPhotos(chatId: string, photos: TelegramPhoto[]) {
    if (!photos.length)
        return;
    if (photos.length === 1) {
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('photo', new Blob([photos[0].bytes], { type: 'image/png' }), photos[0].symbol + '-' + photos[0].tf + '.png');
        form.append('caption', photos[0].caption);
        await tg('sendPhoto', form);
        return;
    }
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('media', JSON.stringify(photos.map((photo, index) => ({ type: 'photo', media: 'attach://chart' + index, caption: photo.caption }))));
    photos.forEach((photo, index) => form.append('chart' + index, new Blob([photo.bytes], { type: 'image/png' }), photo.symbol + '-' + photo.tf + '.png'));
    await tg('sendMediaGroup', form);
}
export async function discoverChats() { const updates = await tg('getUpdates', { timeout: 0, allowed_updates: ['message'] }); const chats = new Map(); for (const u of updates) {
    const c = u.message?.chat;
    if (c?.type === 'private')
        chats.set(String(c.id), { id: String(c.id), name: [c.first_name, c.last_name].filter(Boolean).join(' '), username: c.username || '' });
} return { chats: [...chats.values()] }; }
export async function sendTelegram(mode: string, test = false, refreshErrors: any[] = []) {
    if (!['position', 'intraday'].includes(mode))
        throw Error("Unknown mode");
    const cfg = await config();
    if (!cfg.chatId)
        throw Error("Select your Telegram chat first");
    if (test) {
        await tg('sendMessage', { chat_id: cfg.chatId, text: "Market Compass\nConnection test. This is a test message, not a market signal." });
        return { sent: true };
    }
    const s: any = await status(), capturedAt = new Date().toISOString(), photos: TelegramPhoto[] = [], missing: string[] = [], tf = mode === 'position' ? 'D1' : 'H1';
    for (const instrument of activeInstruments) {
        const snapshot = s.snapshots[instrument.id]?.[tf];
        if (!snapshot || !Array.isArray(snapshot.rows) || snapshot.rows.length < 2) {
            missing.push(instrument.id);
            continue;
        }
        const contributingFrames = mode === 'position' ? ['D1', 'W1'] : ['H1', 'H4', 'D1', 'W1'];
        const capturedMs = Date.parse(capturedAt);
        const maxAgeByFrame: Record<string, number> = { H1: 7200000, H4: 345600000, D1: 259200000, W1: 1209600000 };
        const frameProblems = contributingFrames.flatMap(frame => {
            if (refreshErrors.some(error => error.symbol === instrument.id && error.tf === frame))
                return [frame + " was not refreshed"];
            const frameSnapshot = s.snapshots[instrument.id]?.[frame];
            if (!frameSnapshot)
                return [frame + " is missing from snapshots"];
            const time = String(frameSnapshot.lastTime || ''), parsed = Date.parse(time.includes('T') ? time : time.replace(' ', 'T') + 'Z');
            if (instrument.kind === 'etf') {
                if (etfFreshness(time, frame, capturedMs) === "stale data")
                    return [frame + " contains a stale candle"];
            }
            else if (!Number.isFinite(parsed) || capturedMs - parsed > maxAgeByFrame[frame])
                return [frame + " contains a stale candle"];
            return [];
        });
        let staleReason = frameProblems.length ? "check " + frameProblems.join(', ') : undefined;
        try {
            const rendered = await renderTelegramChart({ symbol: instrument.id, snapshot, snapshots: s.snapshots[instrument.id] || {}, mode, tf, capturedAt, staleReason });
            photos.push({ symbol: rendered.symbol, name: rendered.name, tf, caption: rendered.caption, bytes: await rendered.image.arrayBuffer() });
        }
        catch {
            missing.push(instrument.id);
        }
    }
    // Require a complete album before sending anything; a failed render must not
    // become a successful delivery or resend a partial album on the next retry.
    if (missing.length)
        throw Error("Unable to render charts " + tf + " for: " + missing.join(', '));
    if (photos.length)
        await sendChartPhotos(cfg.chatId, photos);
    let missingNotified = false;
    if (missing.length) {
        const note = photos.length ? "Missing chart " + tf + " for: " + missing.join(', ') + ". Other available charts are attached." : "Unable to render charts " + tf + " for: " + missing.join(', ') + '.';
        try {
            await tg('sendMessage', { chat_id: cfg.chatId, text: note });
            missingNotified = true;
        }
        catch { }
    }
    const subscriberErrors: string[] = [];
    const stored = await getSetting('telegramSubscriber:' + telegramViewerEmail);
    if (stored) {
        const subscriber = JSON.parse(stored);
        if (subscriber.enabled && subscriber.chatId && subscriber.chatId !== cfg.chatId) {
            try {
                await sendChartPhotos(subscriber.chatId, photos);
                if (missing.length)
                    await tg('sendMessage', { chat_id: subscriber.chatId, text: "Missing chart " + tf + " for: " + missing.join(', ') + '.' });
            }
            catch {
                subscriberErrors.push(telegramViewerEmail + ": delivery failed");
            }
        }
    }
    if (!photos.length && !missingNotified)
        throw Error("Unable to deliver charts " + tf + " or the problem notification");
    return { sent: true, photos: photos.length, missing, subscriberErrors };
}
export async function readReport(id: number) { return await db().prepare('SELECT * FROM reports WHERE id=?').bind(id).first(); }
export async function viewerTelegramState(email: string | null) {
    if (!canReceiveViewerTelegram(email))
        return { allowed: false, subscribed: false };
    if (viewerTelegramDisabled()) {
        await clearViewerTelegramSubscription();
        return { allowed: false, subscribed: false };
    }
    const saved = await getSetting('telegramSubscriber:' + telegramViewerEmail);
    return { allowed: true, subscribed: saved ? !!JSON.parse(saved).enabled : false };
}
export async function beginViewerTelegram(email: string) {
    if (!canReceiveViewerTelegram(email))
        throw Error("Connection unavailable");
    if (viewerTelegramDisabled())
        throw Error("The owner has disabled viewer Telegram reports");
    if ((await viewerTelegramState(email)).subscribed)
        return { subscribed: true };
    const bot = await tg('getMe', {});
    if (!/^[A-Za-z0-9_]+$/.test(bot.username || ''))
        throw Error("The bot did not return a name");
    const key = 'telegramInvite:' + telegramViewerEmail, saved = await getSetting(key);
    let invite = saved ? JSON.parse(saved) : null;
    if (!invite || invite.expires < Date.now()) {
        invite = { token: crypto.randomUUID().replaceAll('-', ''), created: Date.now(), expires: Date.now() + 86400000 };
        await putSetting(key, JSON.stringify(invite));
    }
    return { subscribed: false, startURL: 'https://t.me/' + bot.username + '?start=' + invite.token };
}
export async function confirmViewerTelegram(email: string) {
    if (!canReceiveViewerTelegram(email))
        throw Error("Connection unavailable");
    if (viewerTelegramDisabled())
        throw Error("The owner has disabled viewer Telegram reports");
    if ((await viewerTelegramState(email)).subscribed)
        return { subscribed: true };
    const key = 'telegramInvite:' + telegramViewerEmail, saved = await getSetting(key);
    const invite = saved ? JSON.parse(saved) : null;
    if (!invite || invite.expires < Date.now())
        throw Error("The link expired. Select Connect Telegram again.");
    const updates = await tg('getUpdates', { timeout: 0, limit: 100, allowed_updates: ['message'] });
    const start = subscriptionStart(updates, invite.token, invite.created);
    if (!start)
        throw Error("No matching start message found. Open the dashboard link, press Start in Telegram, then verify again.");
    await tg('sendMessage', { chat_id: String(start.chat.id), text: "Market Compass\nViewer connection verified. Reports require an enabled external scheduler. Dashboard access is read only." });
    await db().batch([db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('telegramSubscriber:' + telegramViewerEmail, JSON.stringify({ email: telegramViewerEmail, chatId: String(start.chat.id), enabled: true, confirmed: new Date().toISOString() })), db().prepare('DELETE FROM settings WHERE key=?').bind(key)]);
    return { subscribed: true };
}
