export type Bar = {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
};
export type LevelSource = {
    tf: string;
    price: number;
    strength?: string;
    permanent?: boolean;
    tentative?: boolean;
    extremeType?: 'high' | 'low' | null;
};
export type ChartLevel = {
    price: number;
    strength?: string;
    reactions?: number;
    departure?: number;
    breaches?: number;
    age?: number;
    permanent?: boolean;
    tentative?: boolean;
    extremeType?: 'high' | 'low';
    origin?: string;
    sources?: LevelSource[];
    distance?: number;
    distanceATR?: number;
    mergeAtr?: number;
    labelY?: number;
    [key: string]: unknown;
};
export type ChartExtremeSource = {
    tf: string;
    time?: string;
    age?: number;
};
export type ChartExtreme = {
    price: number;
    extremeType: 'high' | 'low';
    sources: ChartExtremeSource[];
};
export type ChartLevelSnapshot = {
    price?: number;
    atr?: number;
    levels?: ChartLevel[];
    levelCandidates?: ChartLevel[];
    extrema?: ChartExtreme[];
};
export const LEVEL_ENGINE_VERSION = 'levels-2026-11-02-v10';
export const instruments = [
    { id: 'SPX500', name: 'S&P 500', source: 'SPX', kind: 'index', description: 'Index CFD reference; a broker contract may differ' },
    { id: 'USTEC', name: 'Nasdaq-100', source: 'NDX', kind: 'index', description: 'Index CFD reference; a broker contract may differ' },
    { id: 'XAUUSD', name: "Gold", source: 'XAU/USD', kind: 'metal', description: "Spot reference for CFD analysis" },
    { id: 'XAGUSD', name: "Silver", source: 'XAG/USD', kind: 'metal', description: "Spot reference for CFD analysis" },
    { id: 'EURUSD', name: "Euro / US dollar", source: 'EUR/USD', kind: 'forex', description: "Currency pair" },
    { id: 'BTCUSDt', name: "Bitcoin / US dollar", source: 'BTC/USD', kind: 'crypto', description: "Bitcoin/USD reference feed; broker CFD prices may differ" },
    { id: 'SPY', name: 'S&P 500 · SPY', source: 'SPY', kind: 'etf', description: "S&P 500 ETF \u00B7 fund-specific prices and levels" },
    { id: 'QQQ', name: 'Nasdaq-100 · QQQ', source: 'QQQ', kind: 'etf', description: "Nasdaq-100 ETF \u00B7 fund-specific prices and levels" },
    { id: 'USO', name: "Oil futures \u00B7 USO", source: 'USO', kind: 'etf', description: "Oil futures ETF \u00B7 fund-specific prices and levels" },
    { id: 'DXf', name: "US Dollar Index", source: '', kind: 'index', description: "CFD; underlying contract not verified" }
];
export const intervals: Record<string, string> = { W1: '1week', D1: '1day', H4: '4h', H1: '1h', M15: '15min' };
export type Calendar = {
    zone: string;
    rollHour: number;
    sundayOpen: number;
    dailyBreak: boolean;
    closed: string[];
    short: Record<string, number>;
    confirmed: boolean;
    weeklyPolicy?: string;
};
export const defaultCalendar = (kind: string): Calendar => ({ zone: kind === 'crypto' ? 'UTC' : kind === 'etf' ? 'America/New_York' : 'Europe/Ljubljana', rollHour: 23, sundayOpen: 1, dailyBreak: false, closed: [], short: {}, confirmed: true, ...(['forex', 'metal'].includes(kind) ? { weeklyPolicy: 'ljubljana-mon01-fri23-v1' } : {}) });
export function localParts(time: string, zone: string) { const d = new Date(time.includes('T') ? time : time.replace(' ', 'T') + 'Z'); const p = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(d); const get = (t: string) => p.find(x => x.type === t)?.value || ''; return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')) }; }
const nextDate = (date: string) => new Date(Date.parse(date + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
export function sessionFilter(rows: Bar[], kind: string, cal: Calendar, duration = 0) { if (kind === 'crypto')
    return rows; if (cal.weeklyPolicy) {
    return rows.filter(r => { const start = Date.parse(r.time.includes('T') ? r.time : r.time.replace(' ', 'T') + 'Z'); for (let t = start; t <= start + Math.max(0, duration - 1); t += 900000) {
        const p = localParts(new Date(t).toISOString(), 'Europe/Ljubljana');
        if (p.day >= 1 && p.day <= 5 && !(p.day === 1 && p.hour < 1) && !(p.day === 5 && p.hour >= 23))
            return true;
    } return false; });
} return rows.filter(r => { const p = localParts(r.time, cal.zone); if (p.day === 6 || p.day === 0 && p.hour < cal.sundayOpen || p.day === 5 && p.hour >= cal.rollHour)
    return false; if (cal.dailyBreak && p.hour === cal.rollHour)
    return false; const tradeDate = p.hour >= cal.rollHour ? nextDate(p.date) : p.date; if (cal.closed.includes(tradeDate))
    return false; return !(tradeDate in cal.short && p.hour >= cal.short[tradeDate] && p.hour < cal.rollHour); }); }
export function aggregateSessions(rows: Bar[], kind: string, cal: Calendar) { const clean = sessionFilter(rows, kind, cal); const groups = new Map<string, Bar[]>(); for (const r of clean) {
    let day = r.time.slice(0, 10);
    if (kind !== 'crypto') {
        const p = localParts(r.time, cal.zone);
        day = p.hour >= cal.rollHour ? nextDate(p.date) : p.date;
    }
    const group = groups.get(day) || [];
    group.push(r);
    groups.set(day, group);
} return [...groups].map(([time, a]) => ({ time, open: a[0].open, high: Math.max(...a.map(x => x.high)), low: Math.min(...a.map(x => x.low)), close: a[a.length - 1].close })); }
export const activeInstruments = instruments.filter(i => ['XAUUSD', 'EURUSD', 'BTCUSDt', 'SPY', 'USO', 'QQQ'].includes(i.id));
export function cleanProviderRows(input: Bar[]) {
    const byTime = new Map<string, Bar[]>(), rejected: string[] = [], duplicates: string[] = [];
    for (const r of input) {
        if (![r.open, r.high, r.low, r.close].every(Number.isFinite) || r.high < Math.max(r.open, r.close) || r.low > Math.min(r.open, r.close) || r.high < r.low) {
            rejected.push(r.time);
            continue;
        }
        const g = byTime.get(r.time) || [];
        g.push(r);
        byTime.set(r.time, g);
    }
    const rows: Bar[] = [];
    for (const [time, g] of byTime) {
        if (g.length > 1) {
            if (g.some(r => ['open', 'high', 'low', 'close'].some(k => r[k as keyof Bar] !== g[0][k as keyof Bar]))) {
                rejected.push(time + " (conflicting OHLC)");
                continue;
            }
            duplicates.push(time);
        }
        rows.push(g[0]);
    }
    const warnings: string[] = [];
    if (rejected.length)
        warnings.push("Source: invalid bars excluded: " + rejected.length + '; ' + rejected.slice(0, 4).join(', '));
    if (duplicates.length)
        warnings.push("Source: exact timestamp duplicates removed: " + duplicates.length);
    return { rows, warnings, rejected, duplicates };
}
export function formatBarTime(time: string, tf: string, zone: string) { if (['D1', 'W1'].includes(tf))
    return time.slice(0, 10) + " \u00B7 trading date"; const d = new Date(time.includes('T') ? time : time.replace(' ', 'T') + 'Z'); if (zone === 'MT5') {
    return new Date(d.getTime() + 3 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
} return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d); }
export function validate(rows: Bar[]) { if (rows.length < 20)
    throw Error("At least 20 candles are required"); const seen = new Set(); for (const r of rows) {
    if (seen.has(r.time) || ![r.open, r.high, r.low, r.close].every(Number.isFinite) || r.high < Math.max(r.open, r.close) || r.low > Math.min(r.open, r.close) || r.high < r.low)
        throw Error("Invalid OHLC or duplicate timestamp");
    seen.add(r.time);
} return rows.sort((a, b) => a.time.localeCompare(b.time)); }
const timeframeWeight: Record<string, number> = { M15: 1, H1: 2, H4: 3, D1: 4, W1: 5 };
const strengthWeight: Record<string, number> = { weak: 1, medium: 2, strong: 3 };
const priceTickSize: Record<string, number> = { SPX500: .01, USTEC: .01, XAUUSD: .01, XAGUSD: .001, EURUSD: .00001, BTCUSDt: .01, SPY: .01, QQQ: .01, USO: .01 };
export function levelPriceTolerance(symbol: string, a: number, b: number) { const tick = priceTickSize[symbol] || .01; return Math.max(tick * 2, Math.max(Math.abs(a), Math.abs(b)) * Number.EPSILON * 16, 1e-9); }
function roundLevelPrice(price: number, symbol: string) { const tick = priceTickSize[symbol] || .01; return Number((Math.round(price / tick) * tick).toFixed(8)); }
function levelSourcesOf(level: any, fallbackTf = ''): {
    tf: string;
    price: number;
    strength?: string;
    permanent?: boolean;
    tentative?: boolean;
    extremeType?: 'high' | 'low' | null;
}[] {
    return Array.isArray(level?.sources) && level.sources.length ? level.sources : [{ tf: level?.origin || level?.tf || fallbackTf, price: Number(level?.price), strength: level?.strength, permanent: !!level?.permanent, tentative: !!level?.tentative, extremeType: level?.extremeType || null }];
}
function isDisplayCandidate(level: any) {
    const sources = levelSourcesOf(level);
    if (level?.tentative || sources.every(source => source.tentative))
        return false;
    return level?.permanent || sources.some(source => source.permanent) || level?.reactions >= 2 && level?.departure >= .5 && level?.breaches < 4 && (level?.strength === 'strong' || level?.age <= (level?.strength === 'medium' ? 720 : 360));
}
function levelRank(level: any, price: number, fallbackTf = '') {
    const sources = levelSourcesOf(level, fallbackTf), permanent = !!level?.permanent || sources.some(source => source.permanent);
    const strength = Math.max(strengthWeight[level?.strength] || 0, ...sources.map(source => strengthWeight[source.strength || ''] || 0));
    const tentative = level?.sources?.length ? sources.every(source => source.tentative) : !!level?.tentative;
    const timeframe = Math.max(timeframeWeight[level?.origin || level?.tf || fallbackTf] || 0, ...sources.map(source => timeframeWeight[source.tf] || 0));
    return { permanent, strength, tentative, timeframe, reactions: Number(level?.reactions) || 0, departure: Number(level?.departure) || 0, breaches: Number(level?.breaches) || 0, age: Number.isFinite(Number(level?.age)) ? Number(level.age) : Infinity, distance: Math.abs(Number(level?.price) - price) };
}
function compareLevelPriority(a: any, b: any, price: number, fallbackTf = '') {
    const x = levelRank(a, price, fallbackTf), y = levelRank(b, price, fallbackTf);
    return y.timeframe - x.timeframe || Number(x.tentative) - Number(y.tentative) || Number(y.permanent) - Number(x.permanent) || y.strength - x.strength || y.reactions - x.reactions || y.departure - x.departure || x.breaches - y.breaches || x.age - y.age || x.distance - y.distance;
}
export function selectDisplayLevels(input: any[], price: number, atr: number, mode = 'intraday', tf = '', range?: {
    min: number;
    max: number;
} | null, symbol = '') {
    const ranked = [...(input || [])].filter(level => Number.isFinite(Number(level?.price)) && isDisplayCandidate(level) && (!range || Number(level.price) >= range.min && Number(level.price) <= range.max)).sort((a, b) => compareLevelPriority(a, b, price, tf));
    const result: any[] = [];
    for (const level of ranked) {
        if (result.some(selected => Math.abs(Number(selected.price) - Number(level.price)) <= levelPriceTolerance(symbol, Number(selected.price), Number(level.price))))
            continue;
        result.push({ ...level, origin: level.origin || tf || level.tf });
        if (result.length === 6)
            break;
    }
    return result.sort((a, b) => Math.abs(Number(a.price) - price) - Math.abs(Number(b.price) - price));
}
const chartTimeframeOrder = ['M15', 'H1', 'H4', 'D1', 'W1'];
export function visibleChartRange(bars: Bar[], period = 24, visible = 180) {
    const rows = bars.slice(-visible);
    if (!rows.length)
        return null;
    const average = simpleMovingAverage(bars, period).slice(-visible).filter((value): value is number => value !== null);
    const low = Math.min(...rows.map(row => row.low), ...average), high = Math.max(...rows.map(row => row.high), ...average), padding = (high - low) * .12 || 1;
    return { min: low - padding, max: high + padding };
}
export function composeChartLevels(base: ChartLevelSnapshot | null | undefined, snapshots: Record<string, ChartLevelSnapshot | undefined>, currentTf: string, mode = 'intraday', range?: {
    min: number;
    max: number;
} | null, symbol = ''): ChartLevel[] {
    if (!base)
        return [];
    const currentAtr = Number(base.atr) || 0, currentPrice = Number(base.price) || 0, currentIndex = chartTimeframeOrder.indexOf(currentTf);
    const items: ChartLevel[] = [];
    const add = (raw: ChartLevel, tf: string, atr: number) => {
        if (!Number.isFinite(Number(raw?.price)) || !isDisplayCandidate(raw))
            return;
        const price = Number(raw.price);
        const source: LevelSource = { tf, price, strength: raw.strength || 'weak', permanent: !!raw.permanent, tentative: !!raw.tentative, extremeType: raw.extremeType || null };
        items.push({ ...raw, price, origin: tf, sources: [source], distance: price - currentPrice, distanceATR: currentAtr ? (price - currentPrice) / currentAtr : 0 });
    };
    const higher = currentIndex < 0 ? [] : chartTimeframeOrder.slice(currentIndex + 1).reverse();
    for (const tf of higher) {
        const snapshot = snapshots?.[tf];
        if (!snapshot)
            continue;
        const levels = Array.isArray(snapshot.levelCandidates) && snapshot.levelCandidates.length ? snapshot.levelCandidates : snapshot.levels || [];
        for (const level of levels)
            add(level, tf, Number(snapshot.atr) || currentAtr);
    }
    const baseLevels = Array.isArray(base.levelCandidates) && base.levelCandidates.length ? base.levelCandidates : base.levels || [];
    for (const level of baseLevels)
        add(level, currentTf, currentAtr);
    const combined: ChartLevel[] = [];
    for (const item of items) {
        const match = combined.find(level => Math.abs(level.price - item.price) <= levelPriceTolerance(symbol, item.price, level.price));
        if (match) {
            const sources = [...(match.sources || []), ...(item.sources || [])].filter((source, index, list) => list.findIndex(candidate => candidate.tf === source.tf && candidate.price === source.price && candidate.tentative === source.tentative && candidate.extremeType === source.extremeType) === index);
            const preferred = compareLevelPriority(item, match, currentPrice, currentTf) < 0 ? item : match;
            const strength = Math.max(strengthWeight[match.strength || ''] || 0, strengthWeight[item.strength || ''] || 0, ...sources.map(source => strengthWeight[source.strength || ''] || 0));
            combined[combined.indexOf(match)] = { ...preferred, sources, permanent: !!match.permanent || !!item.permanent || sources.some(source => source.permanent), strength: strength === 3 ? 'strong' : strength === 2 ? 'medium' : 'weak', tentative: sources.every(source => source.tentative) };
        }
        else
            combined.push({ ...item, sources: [...(item.sources || [])] });
    }
    const ranked = selectDisplayLevels(combined, currentPrice, currentAtr, mode, currentTf, range, symbol).sort((a, b) => compareLevelPriority(a, b, currentPrice, currentTf));
    const extremes = collectChartExtrema(base, snapshots, currentTf, range, symbol, currentPrice);
    const separation = Math.max(currentAtr * .2, range ? (range.max - range.min) * .015 : 0);
    const distinct = ranked.filter((level, index) => !ranked.slice(0, index).some(prior => !level.permanent && Math.abs(prior.price - level.price) < separation));
    // Two preliminary points get room when real swing candidates exist.
    const selected: ChartLevel[] = distinct.slice(0, extremes.length ? 4 : 6);
    for (const extreme of extremes) {
        if (selected.length >= 6)
            break;
        if (selected.some(level => Math.abs(level.price - extreme.price) <= Math.max(levelPriceTolerance(symbol, level.price, extreme.price), separation)))
            continue;
        const sources: LevelSource[] = extreme.sources.map(source => ({ tf: source.tf, price: extreme.price, strength: 'weak', tentative: true, extremeType: extreme.extremeType }));
        selected.push({ price: extreme.price, origin: sources[0]?.tf || currentTf, strength: 'weak', tentative: true, extremeType: extreme.extremeType, sources, extremeSources: extreme.sources });
    }
    for (const level of distinct) {
        if (selected.length >= 6)
            break;
        if (!selected.some(existing => existing.price === level.price))
            selected.push(level);
    }
    return selected.map(level => ({ ...level, distance: Number(level.price) - currentPrice, distanceATR: currentAtr ? (Number(level.price) - currentPrice) / currentAtr : 0 }));
}
function collectChartExtrema(base: ChartLevelSnapshot | null | undefined, snapshots: Record<string, ChartLevelSnapshot | undefined>, currentTf: string, range?: {
    min: number;
    max: number;
} | null, symbol = '', currentPrice = Number(base?.price) || 0): ChartExtreme[] {
    if (!base)
        return [];
    const currentIndex = chartTimeframeOrder.indexOf(currentTf), higher = currentIndex < 0 ? [] : chartTimeframeOrder.slice(currentIndex + 1).reverse();
    const frames = [...higher.map(tf => ({ tf, snapshot: snapshots?.[tf] })), { tf: currentTf, snapshot: base }].filter(item => item.snapshot);
    const confirmed: number[] = [];
    for (const { snapshot } of frames) {
        const levels = Array.isArray(snapshot?.levelCandidates) ? snapshot!.levelCandidates! : snapshot?.levels || [];
        for (const level of levels)
            if (!level?.tentative && Number.isFinite(Number(level?.price)))
                confirmed.push(Number(level.price));
    }
    const result: ChartExtreme[] = [];
    for (const { tf, snapshot } of frames) {
        const legacy = Array.isArray(snapshot?.extrema) ? snapshot!.extrema! : ((snapshot?.levelCandidates || snapshot?.levels || []).filter((level: any) => level?.tentative && level?.extremeType).map((level: any) => ({ ...level, time: level.time || level.barTime })));
        for (const raw of legacy) {
            const price = Number(raw?.price), extremeType = raw?.extremeType;
            if (!Number.isFinite(price) || (extremeType !== 'high' && extremeType !== 'low') || (range && (price < range.min || price > range.max)))
                continue;
            if (confirmed.some(levelPrice => Math.abs(levelPrice - price) <= levelPriceTolerance(symbol, levelPrice, price)))
                continue;
            const match = result.find(item => item.extremeType === extremeType && Math.abs(item.price - price) <= levelPriceTolerance(symbol, item.price, price));
            const source: ChartExtremeSource = { tf, time: typeof raw.time === 'string' ? raw.time : typeof raw.barTime === 'string' ? raw.barTime : undefined, age: Number.isFinite(Number(raw.age)) ? Number(raw.age) : Number.isFinite(Number(raw.barsSinceExtreme)) ? Number(raw.barsSinceExtreme) : undefined };
            if (match) {
                if (!match.sources.some(item => item.tf === source.tf && item.time === source.time))
                    match.sources.push(source);
            }
            else
                result.push({ price, extremeType, sources: [source] });
        }
    }
    return result.sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice));
}
export function composeChartExtrema(base: ChartLevelSnapshot | null | undefined, snapshots: Record<string, ChartLevelSnapshot | undefined>, currentTf: string, range?: {
    min: number;
    max: number;
} | null, symbol = '', currentPrice = Number(base?.price) || 0): ChartExtreme[] {
    return composeChartLevels(base, snapshots, currentTf, 'intraday', range, symbol).filter(level => level.tentative).map(level => ({ price: level.price, extremeType: level.extremeType!, sources: level.extremeSources as ChartExtremeSource[] }));
}
export function arrangeLevelLabels(levels: any[], y: (n: number) => number, min = 22, max = 316, gap = 32) {
    const sorted = [...levels].sort((a, b) => y(a.price) - y(b.price));
    const positions: number[] = [];
    for (const l of sorted)
        positions.push(Math.max(y(l.price), positions.length ? positions.at(-1)! + gap : min));
    if (positions.length && positions.at(-1)! > max) {
        positions[positions.length - 1] = max;
        for (let i = positions.length - 2; i >= 0; i--)
            positions[i] = Math.min(positions[i], positions[i + 1] - gap);
    }
    return sorted.map((l, i) => ({ ...l, labelY: positions[i] }));
}
// ETFs use exchange-local dates for D1/W1 and UTC timestamps intraday.
export function etfBarClosed(time: string, tf: string, now = Date.now()) {
    const p = localParts(new Date(now).toISOString(), 'America/New_York');
    const minute = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', minute: '2-digit' }).format(new Date(now)));
    if (tf === 'D1')
        return time.slice(0, 10) < p.date || time.slice(0, 10) === p.date && p.hour >= 16;
    if (tf === 'W1') {
        const date = time.slice(0, 10);
        const d = new Date(date + 'T12:00:00Z');
        const friday = new Date(d.getTime() + ((5 - d.getUTCDay() + 7) % 7) * 86400000).toISOString().slice(0, 10);
        return friday < p.date || friday === p.date && p.hour >= 16;
    }
    const start = Date.parse(time.includes('T') ? time : time.replace(' ', 'T') + 'Z');
    const duration = ({ M15: 900000, H1: 3600000, H4: 14400000 } as Record<string, number>)[tf];
    const b = localParts(new Date(start).toISOString(), 'America/New_York');
    return start + duration <= now || b.date < p.date || b.date === p.date && p.hour * 60 + minute >= 960;
}
export function etfFreshness(time: string, tf: string, now = Date.now()) {
    const p = localParts(new Date(now).toISOString(), 'America/New_York');
    const minute = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', minute: '2-digit' }).format(new Date(now)));
    const open = p.day >= 1 && p.day <= 5 && p.hour * 60 + minute >= 570 && p.hour < 16;
    let expected = p.date;
    if (!open && p.hour < 16 || p.day === 0 || p.day === 6) {
        let d = new Date(p.date + 'T12:00:00Z');
        do {
            d = new Date(d.getTime() - 86400000);
        } while ([0, 6].includes(d.getUTCDay()));
        expected = d.toISOString().slice(0, 10);
    }
    const actual = ['D1', 'W1'].includes(tf) ? time.slice(0, 10) : localParts(time, 'America/New_York').date;
    const stale = actual < expected || open && !['D1', 'W1'].includes(tf) && now - Date.parse(time.replace(' ', 'T') + 'Z') > 7200000;
    return stale ? "stale data" : open ? "US session open" : "US session closed \u00B7 latest completed session";
}
export function analyze(input: Bar[], tf: string, kind: string, calendar: Calendar, normalized = false, symbol = '') {
    let rows = validate([...input]);
    const rawCount = rows.length;
    let warnings: string[] = [];
    if (kind !== 'crypto' && ['D1'].includes(tf) && !normalized)
        rows = rows.filter(r => ![0, 6].includes(new Date(r.time.slice(0, 10) + 'T12:00:00Z').getUTCDay()));
    if (kind !== 'crypto' && ['H4', 'H1', 'M15'].includes(tf) && !['index', 'etf'].includes(kind))
        rows = sessionFilter(rows, kind, calendar, ({ H4: 14400000, H1: 3600000, M15: 900000 } as Record<string, number>)[tf]);
    if (kind !== 'crypto' && kind !== 'etf' && ['D1', 'W1', 'H4'].includes(tf) && !normalized)
        warnings.push("D1/W1/H4 retain Twelve Data bar boundaries; they have not been rebuilt around broker trading days.");
    if (!calendar.confirmed && kind !== 'crypto')
        warnings.push("Custom calendar has not been confirmed.");
    if (kind === 'etf')
        warnings.push("ETF prices belong to the fund; its levels are not transferred to index or oil CFDs. Regular US sessions are used; holidays and shortened sessions are not modeled.");
    if (kind === 'index')
        warnings.push("An external index or futures series is not assumed to match a broker CFD.");
    if (rows.length < 20)
        throw Error("Fewer than 20 candles remain after filtering");
    const duration = ({ M15: 900000, H1: 3600000, H4: 14400000, D1: 86400000, W1: 604800000 } as Record<string, number>)[tf];
    const now = Date.now();
    const localNow = localParts(new Date(now).toISOString(), calendar.zone);
    const closed = rows.filter(r => kind === 'etf' ? etfBarClosed(r.time, tf, now) : normalized && tf === 'D1' && kind !== 'crypto' ? (r.time.slice(0, 10) < localNow.date || r.time.slice(0, 10) === localNow.date && localNow.hour >= calendar.rollHour) : Date.parse(r.time.includes('T') ? r.time : r.time.replace(' ', 'T') + (r.time.length === 10 ? 'T00:00:00Z' : 'Z')) + duration <= now);
    if (closed.length < 20)
        throw Error("Not enough closed bars for analysis");
    const tr = closed.slice(1).map((r, i) => Math.max(r.high - r.low, Math.abs(r.high - closed[i].close), Math.abs(r.low - closed[i].close)));
    let atr = tr.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
    for (const v of tr.slice(14))
        atr = (atr * 13 + v) / 14;
    const piv: {
        price: number;
        index: number;
        type: string;
    }[] = [];
    for (let i = 3; i < closed.length - 3; i++) {
        const a = closed.slice(i - 3, i + 4);
        if (closed[i].high === Math.max(...a.map(x => x.high)))
            piv.push({ price: closed[i].high, index: i, type: 'high' });
        if (closed[i].low === Math.min(...a.map(x => x.low)))
            piv.push({ price: closed[i].low, index: i, type: 'low' });
    }
    const groups: typeof piv[] = [];
    for (const p of [...piv].sort((a, b) => a.price - b.price)) {
        const g = groups[groups.length - 1], mean = g ? g.reduce((s, p) => s + p.price, 0) / g.length : 0;
        if (g && Math.abs(p.price - mean) <= Math.max(levelPriceTolerance(symbol, p.price, mean), atr * .03))
            g.push(p);
        else
            groups.push([p]);
    }
    const latest = rows.at(-1)!;
    const candidates: any[] = groups.map(g => { const indices = [...new Set(g.map(p => p.index))].sort((a, b) => a - b); const independent: number[] = []; for (const i of indices)
        if (!independent.length || i - independent.at(-1)! >= 4)
            independent.push(i); const price = roundLevelPrice(g[Math.floor((g.length - 1) / 2)].price, symbol); const age = closed.length - 1 - indices.at(-1)!; const reactions = independent.length; const departures = independent.map(i => { const a = closed.slice(i + 1, i + 6); return a.length ? Math.max(...a.map(r => Math.max(Math.abs(r.high - price), Math.abs(r.low - price)))) / atr : 0; }); const departure = departures.reduce((a, b) => a + b, 0) / Math.max(1, departures.length); const breaches = closed.slice(indices.at(-1)! + 1).filter((r, i, a) => i > 0 && (r.close - price) * (a[i - 1].close - price) < 0).length; const score = (tf === 'W1' ? 3 : tf === 'D1' ? 2 : tf === 'H4' ? 1 : 0) + (reactions >= 3 ? 1 : 0) + (departure >= 1 ? 1 : 0) + (age <= 40 ? 1 : 0) - (breaches >= 3 ? 2 : 0); const strength = score >= 5 && ['W1', 'D1'].includes(tf) ? 'strong' : score >= 3 ? 'medium' : 'weak'; return { price, reactions, age, departure, breaches, strength, distance: price - latest.close, distanceATR: (price - latest.close) / atr }; }).filter(l => l.reactions >= 2 && l.departure >= .5 && l.breaches < 4 && (l.strength === 'strong' || l.age <= (l.strength === 'medium' ? 720 : 360)));
    const locals: any[] = [];
    const preliminaryHorizon = 180;
    const recentStart = Math.max(2, closed.length - preliminaryHorizon);
    for (let idx = closed.length - 1; idx >= recentStart; idx--) {
        const age = closed.length - 1 - idx;
        if (age < 1 || age > preliminaryHorizon)
            continue;
        const before = closed.slice(idx - 2, idx), after = closed.slice(idx + 1, Math.min(closed.length, idx + 3));
        if (before.length < 2 || !after.length)
            continue;
        for (const type of ['low', 'high'] as const) {
            const price = closed[idx][type];
            const beforeValues = before.map(r => r[type]), afterValues = after.map(r => r[type]);
            const isPivot = type === 'high' ? price >= Math.max(...beforeValues) && price > Math.max(...afterValues) : price <= Math.min(...beforeValues) && price < Math.min(...afterValues);
            if (!isPivot)
                continue;
            const departure = type === 'low' ? Math.max(...after.map(r => r.high - price)) / atr : Math.max(...after.map(r => price - r.low)) / atr;
            if (departure < .15)
                continue;
            const broken = closed.slice(idx + 1).some(r => type === 'high' ? r.close > price + Math.max(levelPriceTolerance(symbol, price, r.close), atr * .15) : r.close < price - Math.max(levelPriceTolerance(symbol, price, r.close), atr * .15));
            if (broken)
                continue;
            const coincident = candidates.some(l => Math.abs(l.price - price) <= levelPriceTolerance(symbol, l.price, price));
            if (coincident || locals.some(l => l.extremeType === type && Math.abs(l.price - price) <= levelPriceTolerance(symbol, l.price, price)))
                continue;
            locals.push({ price, time: closed[idx].time, reactions: 1, age, departure, breaches: 0, strength: 'weak', tentative: true, extremeType: type, barsSinceExtreme: age, distance: price - latest.close, distanceATR: (price - latest.close) / atr });
        }
    }
    const levels = selectDisplayLevels(candidates, latest.close, atr, 'intraday', tf, undefined, symbol);
    const h = piv.filter(x => x.type === 'high'), l = piv.filter(x => x.type === 'low');
    let trend = 'mixed';
    if (h.length >= 2 && l.length >= 2) {
        if (h.at(-1)!.price > h.at(-2)!.price && l.at(-1)!.price > l.at(-2)!.price)
            trend = 'up';
        if (h.at(-1)!.price < h.at(-2)!.price && l.at(-1)!.price < l.at(-2)!.price)
            trend = 'down';
    }
    const support = levels.filter(l => !l.tentative && l.price < latest.close).sort((a, b) => b.price - a.price)[0];
    const resistance = levels.filter(l => !l.tentative && l.price > latest.close).sort((a, b) => a.price - b.price)[0];
    const near = levels.some(l => Math.abs(l.distanceATR) <= .3);
    return { tf, levelEngineVersion: LEVEL_ENGINE_VERSION, rows, rawCount, excluded: rawCount - rows.length, closedCount: closed.length, price: latest.close, lastTime: latest.time, atr, trend, levels, extrema: locals, levelCandidates: candidates, support, resistance, warnings, status: warnings.length ? 'PRELIMINARY' : near ? 'NEAR_LEVEL' : 'OBSERVE', note: "Scenarios are conditional. Approaching a level does not confirm an entry. Level strength is a heuristic score, not a probability of success." };
}
export function simpleMovingAverage(rows: Bar[], period = 24): (number | null)[] {
    if (!Number.isInteger(period) || period < 1)
        throw Error("Invalid SMA period");
    let sum = 0;
    return rows.map((r, i) => { sum += r.close; if (i >= period)
        sum -= rows[i - period].close; return i >= period - 1 ? sum / period : null; });
}
