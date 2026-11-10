'use client';
import { chartTimeMarks, spacedTimeLabels } from '@/lib/time-grid';
import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { activeInstruments as instruments, defaultCalendar, analyze, formatBarTime, composeChartLevels, composeChartExtrema, simpleMovingAverage, visibleChartRange, arrangeLevelLabels, type Bar, type ChartLevel, type ChartExtreme, type LevelSource } from '@/lib/market';
const fmt = (n: number | undefined, d = 2) => n === undefined ? '—' : n.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
const trend = (s: string) => ({ up: "Uptrend", down: "Downtrend", mixed: "Mixed structure" } as any)[s] || "No data";
const extremeName = (type: string) => type === 'high' ? "high" : "low";
function levelKind(source: LevelSource) { return source.tentative ? "tentative " + extremeName(source.extremeType || 'low') : source.permanent ? "strong \u00B7 persisted" : source.strength === 'strong' ? "strong" : source.strength === 'medium' ? "medium" : "local"; }
function sourceDescription(source: LevelSource, includeTf = false) { return (includeTf ? source.tf + ' · ' : '') + levelKind(source); }
function sourceShort(source: LevelSource) { return source.tentative ? source.tf + " tentative " + extremeName(source.extremeType || 'low') : source.tf + ' ' + (source.permanent ? "saved" : source.strength === 'strong' ? "strong" : source.strength === 'medium' ? "medium" : "local"); }
function levelSources(level: ChartLevel, tf: string): LevelSource[] { return level.sources?.length ? level.sources : [{ tf: level.origin || tf, price: level.price, strength: level.strength, permanent: level.permanent, tentative: level.tentative, extremeType: level.extremeType }]; }
function timeValue(time: string) { return Date.parse(time.includes('T') ? time : time.length === 10 ? time + 'T00:00:00Z' : time.replace(' ', 'T') + 'Z'); }
function nearestBarIndex(rows: Bar[], time: string) { const target = timeValue(time); if (!Number.isFinite(target) || !rows.length)
    return Math.max(0, rows.length - 1); let best = 0, distance = Infinity; rows.forEach((bar, index) => { const value = Math.abs(timeValue(bar.time) - target); if (value < distance) {
    best = index;
    distance = value;
} }); return best; }
function Chart({ a, symbol, zone }: {
    a: any;
    symbol: string;
    zone: string;
}) {
    const [hover, setHover] = useState<number | null>(null);
    if (!a)
        return <div className="chart-empty"><strong>Bars have not been loaded yet</strong><p>Select an instrument and refresh its data.</p></div>;
    const digits = symbol === 'EURUSD' ? 5 : 2, rows: Bar[] = a.rows.slice(-180), sma = simpleMovingAverage(a.rows, 24).slice(-180), range = visibleChartRange(a.rows), bottom = range?.min ?? 0, top = range?.max ?? 1;
    const y = (p: number) => 22 + (top - p) / (top - bottom) * 310, yForLevel = (p: number) => Math.max(22, Math.min(332, y(p))), step = 770 / Math.max(1, rows.length), x = (i: number) => 40 + (i + .5) * step;
    const smaPoints = sma.flatMap((v, i) => v === null ? [] : [`${x(i)},${y(v)}`]).join(' ');
    const marks = chartTimeMarks(rows, a.tf), timeLabels = spacedTimeLabels(marks.grid, step);
    const visibleLevels: ChartLevel[] = a.levels.filter((l: ChartLevel) => l.price >= bottom && l.price <= top), labelGap = Math.max(10, Math.min(18, 294 / Math.max(1, visibleLevels.length - 1))), levels = arrangeLevelLabels(visibleLevels, yForLevel, 22, 316, labelGap);
    const visibleExtrema: ChartExtreme[] = (a.extrema || []).filter((e: ChartExtreme) => e.price >= bottom && e.price <= top);
    const h = hover === null ? null : rows[hover];
    return <div><div className="chart-readout">{h ? <><span>{formatBarTime(h.time, a.tf, zone)}</span><span>O {fmt(h.open, digits)} · H {fmt(h.high, digits)} · L {fmt(h.low, digits)} · C {fmt(h.close, digits)}</span></> : <><span>{symbol} · {a.tf} · {rows.length} bars</span><span>OHLC bars · open on the left, close on the right</span></>}</div>
 <svg className="chart" viewBox="0 0 1140 390" role="img" aria-label={`OHLC bar chart for ${symbol}, ${a.tf}, with price levels`} onMouseLeave={() => setHover(null)}>
 <defs><clipPath id="plot-clip"><rect x="38" y="15" width="776" height="327"/></clipPath></defs>
 {Array.from({ length: 6 }, (_, i) => { const price = bottom + (top - bottom) * i / 5; return <g key={i}><line x1="38" x2="814" y1={y(price)} y2={y(price)} stroke="#e7ebf0"/><text x="828" y={y(price) + 4} fill="#697588" fontSize="12">{fmt(price, digits)}</text></g>; })}
 <g clipPath="url(#plot-clip)">{marks.grid.map((m, i) => <line key={'grid' + i} x1={40 + m.position * step} x2={40 + m.position * step} y1="15" y2="342" stroke="#e5e7eb" strokeDasharray="2 4"/>)}{rows.map((r, i) => { const color = r.close >= r.open ? '#11776a' : '#c34b50', tick = Math.min(2, step * .4); return <g key={r.time}><line x1={x(i)} x2={x(i)} y1={y(r.high)} y2={y(r.low)} stroke={color} strokeWidth="1.4"/><line x1={x(i) - tick} x2={x(i)} y1={y(r.open)} y2={y(r.open)} stroke={color} strokeWidth="1.4"/><line x1={x(i)} x2={x(i) + tick} y1={y(r.close)} y2={y(r.close)} stroke={color} strokeWidth="1.4"/><rect x={x(i) - step / 2} y="15" width={step} height="325" fill="transparent" onMouseEnter={() => setHover(i)}/></g>; })}{smaPoints && <polyline points={smaPoints} fill="none" stroke="#2875df" strokeWidth="1.3" pointerEvents="none"/>}{marks.sessions.map((m, i) => <line key={'session' + i} x1={40 + m.position * step} x2={40 + m.position * step} y1="15" y2="342" stroke={m.session === 'London' ? '#a0a5ad' : '#7d8590'} strokeWidth={a.tf === 'H4' ? 1.2 : 1.8} strokeDasharray={m.session === 'London' ? undefined : '6 4'}><title>{m.session === 'London' ? "London" : "New York"} · {m.date} {m.label} · Ljubljana</title></line>)}</g>
 {visibleExtrema.map((e, index) => { const px = x(nearestBarIndex(rows, e.sources.find(source => source.tf === a.tf)?.time || e.sources[0]?.time || '')) + ((index % 3) - 1) * 4, py = yForLevel(e.price), high = e.extremeType === 'high', d = high ? `M ${px} ${py - 5} L ${px + 5} ${py + 4} L ${px - 5} ${py + 4} Z` : `M ${px - 5} ${py - 4} L ${px + 5} ${py - 4} L ${px} ${py + 5} Z`, sourceText = e.sources.map(source => source.tf + (source.age !== undefined ? ' · ' + source.age + " bars ago" : '')).join(' / '); return <path key={'extreme-' + e.extremeType + '-' + e.price} d={d} fill="#687385" stroke="#fff" strokeWidth="1.4"><title>{`Tentative ${extremeName(e.extremeType)} · ${fmt(e.price, digits)} · ${sourceText}. Informational marker, not a confirmed level.`}</title></path>; })}
 {levels.map((l: ChartLevel) => {
            const sources = levelSources(l, a.tf), origins = [...new Set(sources.map((source: LevelSource) => source.tf))].join('+');
            const strong = l.permanent || l.strength === 'strong', medium = l.strength === 'medium', color = strong ? '#111' : medium ? '#606975' : '#929ca9';
            const lineY = yForLevel(l.price);
            return <g key={origins + ':' + l.price}>
  <line x1={38} x2={936} y1={lineY} y2={lineY} stroke={color} strokeWidth={strong ? 2.6 : medium ? 1.6 : 1} strokeDasharray={strong ? undefined : medium ? '8 5' : '3 5'}/>
  <path d={'M 936 ' + lineY + ' L 948 ' + l.labelY + ' L 955 ' + l.labelY} stroke={color} fill="none"/>
  <text x="960" y={Number(l.labelY) + 4} fontSize="10" fill={color}>{fmt(l.price, digits)} · {sources.map((source: LevelSource) => sourceShort(source)).join(' / ')}</text>
  <title>{sources.map((source: LevelSource) => sourceDescription(source, true) + ' · ' + fmt(source.price, digits)).join(' / ')}</title>
 </g>;
        })}
 <line x1="38" x2="814" y1={y(a.price)} y2={y(a.price)} stroke="#345cdf" strokeDasharray="2 4"/>
 {timeLabels.map((m, i) => <g key={i}><text x={40 + m.position * step} y="359" fontSize="12" fill="#697588" textAnchor="middle">{m.label}</text>{!['D1', 'W1'].includes(a.tf) && <text x={40 + m.position * step} y="376" fontSize="12" fill="#697588" textAnchor="middle">{m.date.slice(8, 10) + '.' + m.date.slice(5, 7)}</text>}</g>)}
 </svg><p className="muted">Time zone: Ljubljana. Grid: {a.tf === 'M15' ? "2 hours" : a.tf === 'D1' ? "weeks" : a.tf === 'W1' ? "months" : "days"}. {['M15', 'H1'].includes(a.tf) && "Session lines: London is solid; New York is dashed. Hover for the exact time."} Up to six visible annotations: up to four confirmed levels, prioritized by timeframe, and up to two tentative extremes. Available candidates fill unused slots. Tentative extremes use a dashed line, a triangle, and a tentative label; they are not confirmed levels. Search window: up to 180 closed candles, with a minimum 0.15 ATR retracement. Strong levels remain in persistent storage. Annotations outside the visible price scale are hidden.</p></div>;
}
export default function Desk() {
    const [s, setS] = useState<any>(null), [symbol, setSymbol] = useState('XAUUSD'), [mode, setMode] = useState('intraday'), [tf, setTf] = useState('H1'), [page, setPage] = useState('market'), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [twelve, setTwelve] = useState(''), [telegram, setTelegram] = useState(''), [chatId, setChatId] = useState(''), [sources, setSources] = useState<any>({}), [exchange, setExchange] = useState(''), [query, setQuery] = useState(''), [matches, setMatches] = useState<any[]>([]), [chats, setChats] = useState<any[]>([]), [telegramStart, setTelegramStart] = useState('');
    const zone = 'Europe/Ljubljana';
    async function load() { const r = await fetch('/api/desk'); const j: any = await r.json(); if (!r.ok)
        throw Error(j.error); setS(j); return j; }
    useEffect(() => { load().then(j => { setSources(j.config.sources || {}); setChatId(j.config.chatId || ''); setExchange(j.config.exchange || ''); }).catch(e => setMessage(e.message)); }, []);
    async function viewerSubscription(action: string) { const r = await fetch('/api/telegram-subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }); const j: any = await r.json(); if (!r.ok)
        throw Error(j.error); if (j.startURL)
        setTelegramStart(j.startURL); return j; }
    async function action(body: any) { if (s?.readOnly)
        throw Error("Read-only access"); const r = await fetch('/api/desk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j: any = await r.json(); if (!r.ok)
        throw Error(j.error); return j; }
    async function completeReport(mode: string) { const requestId = 'manual-' + Date.now(); for (let attempt = 0; attempt < 30; attempt++) {
        const result = await action({ action: 'runReport', mode, requestId });
        if (result.sent)
            return result;
        if (!result.pending)
            throw Error("Report incomplete");
        setMessage("Updated " + result.updated.length + ' / ' + result.tasks.length + "; processing continues");
        if (result.retryAfterMs)
            await new Promise(resolve => setTimeout(resolve, result.retryAfterMs));
    } throw Error("The report is still processing. Check its status before sending it again."); }
    async function run(fn: () => Promise<any>, success = "Done") { setBusy(true); setMessage(''); try {
        const result = await fn();
        await load();
        setMessage(result?.message || success);
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : "Operation failed");
    }
    finally {
        setBusy(false);
    } }
    useEffect(() => { if (!s?.connected.twelve || page !== 'market' || s?.readOnly === undefined)
        return; let cancelled = false; async function update() { if (document.visibilityState !== 'visible')
        return; const key = 'trading-refresh:' + symbol + ':' + tf; const last = Number(sessionStorage.getItem(key) || 0); if (Date.now() - last < 300000)
        return; sessionStorage.setItem(key, String(Date.now())); setBusy(true); try {
        if (!s?.readOnly)
            await action({ action: 'refresh', symbol, tf });
        if (!cancelled) {
            await load();
            setMessage("Updated " + symbol + ' · ' + tf);
        }
    }
    catch (e) {
        if (!cancelled)
            setMessage(e instanceof Error ? e.message : "Refresh failed");
    }
    finally {
        if (!cancelled)
            setBusy(false);
    } } void update(); const timer = setInterval(update, 900000); return () => { cancelled = true; clearInterval(timer); }; }, [symbol, tf, page, s?.connected.twelve, s?.readOnly]);
    useEffect(() => { const ctx = (document as any).modelContext; if (!ctx?.registerTool)
        return; const ac = new AbortController(); Promise.resolve(ctx.registerTool({ name: 'select_market_view', description: 'Select an instrument and analysis mode in the trading dashboard.', inputSchema: { type: 'object', properties: { symbol: { type: 'string', enum: instruments.map(i => i.id) }, mode: { type: 'string', enum: ['intraday', 'position'] } }, required: ['symbol', 'mode'], additionalProperties: false }, annotations: { readOnlyHint: true }, execute: async (i: any) => { if (!instruments.some(x => x.id === i.symbol) || !['position', 'intraday'].includes(i.mode))
            throw Error('Invalid view'); setSymbol(i.symbol); setMode(i.mode); setTf(i.mode === 'position' ? 'D1' : 'H1'); return { symbol: i.symbol, mode: i.mode }; } }, { signal: ac.signal })).catch(() => { }); return () => ac.abort(); }, []);
    const current = instruments.find(i => i.id === symbol)!;
    let a = s?.snapshots?.[symbol]?.[tf];
    let historical = false;
    if (!a && symbol === 'XAUUSD' && tf !== 'D1' && s?.seed?.[tf]) {
        historical = true;
        a = analyze(s.seed[tf], tf, 'metal', defaultCalendar('metal'), false, 'XAUUSD');
        a.received = '2026-10-01T17:19:00Z';
    }
    if (a) {
        const snapshots = historical ? {} : s?.snapshots?.[symbol] || {}, range = visibleChartRange(a.rows), levels = composeChartLevels(a, snapshots, tf, mode, range, symbol);
        a = { ...a, levels, extrema: composeChartExtrema(a, snapshots, tf, range, symbol, a.price) };
    }
    if (a) {
        a.support = a.levels.filter((l: any) => !l.tentative && l.price < a.price).sort((x: any, y: any) => y.price - x.price)[0];
        a.resistance = a.levels.filter((l: any) => !l.tentative && l.price > a.price).sort((x: any, y: any) => x.price - y.price)[0];
    }
    const frames = mode === 'intraday' ? ['D1', 'H1', 'M15'] : ['W1', 'D1', 'H4'];
    const readyCount = instruments.filter(i => s?.snapshots?.[i.id]).length;
    function selectMode(m: string) { setMode(m); setTf(m === 'position' ? 'D1' : 'H1'); }
    return <main><header className="topbar"><a className="brand" href="/">M<span className="brand-mark">/</span>ARKET <small>COMPASS</small></a><nav><button className={page === 'market' ? 'nav-active' : ''} onClick={() => setPage('market')}>Markets</button><button className={page === 'history' ? 'nav-active' : ''} onClick={() => setPage('history')}>Archive</button>{s?.readOnly === false && <button className={page === 'settings' ? 'nav-active' : ''} onClick={() => setPage('settings')}>Connections</button>}</nav><span className="privacy">{s?.readOnly ? "Read only" : "Private dashboard"}</span></header><div className="workspace"><div className="heading"><div><p className="eyebrow">SIX MARKETS / TWO HORIZONS</p><h1>{page === 'settings' ? "Connections and calendar" : page === 'history' ? "Analysis archive" : "Market overview"}</h1></div><div className="connection-strip"><span>Twelve Data: {s?.connected.twelve ? "key saved" : "not connected"}</span><span>Telegram: {s?.connected.telegram && s?.connected.chat ? "configured" : "not connected"}</span></div></div>{message && <div role="status" className="message">{message}</div>}
 {s?.viewerTelegram?.allowed && <section className="panel" style={{ marginBottom: 20 }}><h2>Telegram reports</h2>{s.viewerTelegram.subscribed ? <p>Connected. Reports follow the dashboard schedule when an external scheduler is enabled.</p> : <><p>Connect a private chat: open the bot link, press Start, then verify the connection here.</p><button disabled={busy} onClick={() => run(() => viewerSubscription('begin'), "Open the bot link below.")}>Connect Telegram</button>{telegramStart && <><p><a href={telegramStart} target="_blank" rel="noreferrer">Open bot in Telegram</a></p><button disabled={busy} onClick={() => run(() => viewerSubscription('confirm'), "Connection verified. A test message was sent to your chat.")}>Verify connection</button></>}</>}</section>}
 {page === 'market' && <><div className="toolbar"><Tabs value={mode} onValueChange={selectMode}><TabsList><TabsTrigger value="intraday">Intraday</TabsTrigger><TabsTrigger value="position">Position</TabsTrigger></TabsList></Tabs><button className="primary" disabled={busy || s?.readOnly !== false || !s?.connected.twelve} onClick={() => run(async () => { const errors: string[] = []; let count = 0; for (const i of instruments) {
        if (!(sources[i.id] ?? i.source))
            continue;
        try {
            await action({ action: 'refresh', symbol: i.id, tf });
            count++;
        }
        catch (e) {
            errors.push(i.id + ': ' + (e instanceof Error ? e.message : "error"));
        }
    } return { message: "Updated " + count + " instruments. " + errors.join('; ') }; }, "Available instruments refreshed for " + tf)}>Current overview · {tf}</button><span className="muted">{readyCount} / {instruments.length} with saved data</span></div><div className="market-grid">{instruments.map(i => { const r = s?.snapshots?.[i.id]?.[mode === 'position' ? 'D1' : 'H1']; return <button className={'market-card ' + (symbol === i.id ? 'selected' : '')} key={i.id} onClick={() => setSymbol(i.id)}><div className="card-top"><strong>{i.id}</strong><span className="card-kind">{i.kind === 'crypto' ? '24/7' : i.kind === 'etf' ? "US ETFs" : i.kind === 'index' ? 'CFD' : "FX / metals"}</span></div><span className="market-name">{i.name}</span><div className="card-price">{r ? fmt(r.price, i.kind === 'forex' ? 5 : 2) : '—'}</div><span className="card-caption">{r ? trend(r.trend) + ' · ' + formatBarTime(r.lastTime, r.tf, zone) : i.id === 'XAUUSD' ? "Historical example available" : "Source has not been verified yet"}</span></button>; })}</div><section className="chart-panel"><div className="panel-head"><div><h2>{current.name} <span>{symbol}</span></h2><p>{current.description}</p></div><Tabs value={tf} onValueChange={setTf}><TabsList>{frames.map(f => <TabsTrigger value={f} key={f}>{f}</TabsTrigger>)}</TabsList></Tabs><button disabled={busy || s?.readOnly !== false || !s?.connected.twelve} onClick={() => run(() => action({ action: 'refresh', symbol, tf }), "Candles loaded. Review the source warnings.")}>Refresh instrument</button></div>{historical && <div className="notice">Demo data is illustrative, not a live quote. Calendar rules are approximate.</div>}{a && <div className="metrics"><div><label>Snapshot price</label><strong>{fmt(a.price, current.kind === 'forex' ? 5 : 2)}</strong></div><div><label>Wilder ATR(14)</label><strong>{fmt(a.atr, current.kind === 'forex' ? 5 : 2)}</strong></div><div><label>Structure · {tf}</label><strong>{trend(a.trend)}</strong></div><div><label>Last bar · period start</label><strong className="time-value">{formatBarTime(a.lastTime, tf, zone)}</strong></div></div>}<div className="chart-readout"><span className="muted">Time · Ljubljana</span><span>Refresh: every 15 minutes while the dashboard is open, or on demand</span></div><Chart a={a} symbol={symbol} zone={zone}/><div className="legend"><span><svg width="24" height="14" aria-hidden="true"><line x1="0" x2="24" y1="7" y2="7" stroke="#2875df" strokeWidth="1.3"/></svg>SMA(24) · Close</span><span><i className="strong-line"/>Strong</span><span><i className="medium-line"/>Medium</span><span><i className="weak-line"/>Local</span><span><svg width="32" height="14" viewBox="0 0 32 14" aria-hidden="true"><path d="M 7 2 L 12 11 L 2 11 Z M 25 3 L 30 3 L 27.5 12 Z" fill="#687385"/></svg>Extremes · informational</span><span className="muted">Strength is a heuristic assessment, not a guarantee</span></div></section><div className="bottom-grid"><section className="panel"><h2>Levels and distances</h2>{a ? <Table><TableHeader><TableRow><TableHead>Level</TableHead><TableHead>Timeframe / class</TableHead><TableHead>Reactions</TableHead><TableHead>Distance / ATR</TableHead></TableRow></TableHeader><TableBody>{a.levels.map((l: any) => <TableRow key={l.price}><TableCell>{fmt(l.price, current.kind === 'forex' ? 5 : 2)}</TableCell><TableCell>{levelSources(l, tf).map((source: any) => sourceDescription(source, true)).join(' + ')}</TableCell><TableCell>{l.reactions}</TableCell><TableCell>{fmt(l.distanceATR)} ATR</TableCell></TableRow>)}</TableBody></Table> : <p className="muted">Available after candles are loaded.</p>}</section><section className="panel"><div className="panel-title"><h2>Observation scenario</h2><span className="badge">{a ? "TENTATIVE" : "NO DATA"}</span></div>{a ? <><p>Lower reference: <strong>{fmt(a.support?.price, current.kind === 'forex' ? 5 : 2)}</strong>. Upper reference: <strong>{fmt(a.resistance?.price, current.kind === 'forex' ? 5 : 2)}</strong>.</p><p>Watch how price reacts at a level: a sustained breakout, a rejection, or a breakout followed by a return. No confirmed entry, stop, or target is assigned.</p><p className="opinion">{a.note}</p>{a.warnings.map((w: string) => <p className="warning" key={w}>{w}</p>)}<p className="muted">Source: {a.source || "Synthetic historical example"} · ETF levels belong to that fund. Other quotes have not been matched to broker CFDs. Higher-timeframe levels and tentative extremes carry over to lower-timeframe charts.</p></> : <p>Select a data source and load candles to run the analysis.</p>}<button disabled={busy || s?.readOnly !== false || !s?.connected.telegram || !s?.connected.chat} onClick={() => run(() => completeReport(mode), "Charts sent to the selected Telegram chat")}>Refresh and send to Telegram</button></section></div><section className="schedule-note"><strong>Schedule · Ljubljana</strong><p>Reference schedule: intraday 06:06; position 08:05, Ljubljana time. This source package contains no active external scheduler. Configure a scheduler separately if required. Dashboard flag: {s?.config?.scheduleEnabled ? "enabled" : "configuration"}. The selected chart refreshes every 15 minutes while the dashboard is open; manual refresh is also available.</p></section></>}
 {page === 'settings' && s?.readOnly === false && <div className="settings-grid"><section className="panel"><h2>1. Market data source</h2><p>The key is encrypted on the server and is not included in responses or charts.</p><label className="field">Twelve Data API key<input type="password" autoComplete="off" value={twelve} onChange={e => setTwelve(e.target.value)} placeholder={s?.connected.twelve ? "A key is already saved. Leave blank to keep it." : "Paste the key here, not in a chat"}/></label><button className="primary" disabled={busy || s?.readOnly !== false || !twelve} onClick={() => run(async () => { await action({ action: 'settings', twelve }); setTwelve(''); }, "API key saved")}>Save key</button><h3>Instrument mappings</h3><p className="muted">Broker and data-provider symbols may differ. Indices are not silently replaced with ETFs or futures.</p>{instruments.map(i => <label className="source-row" key={i.id}><span>{i.id}</span><input aria-label={"Source " + i.id} value={sources[i.id] ?? i.source} onChange={e => setSources({ ...sources, [i.id]: e.target.value })} placeholder="Select a provider symbol"/></label>)}<label className="field">Crypto feed exchange (optional)<input value={exchange} onChange={e => setExchange(e.target.value)} placeholder="Leave blank for the aggregated BTC/USD feed"/></label><button disabled={busy} onClick={() => run(() => action({ action: 'settings', sources, exchange }), "Mappings saved")}>Save sources</button><div className="search-box"><label className="field">Search provider symbols<input value={query} onChange={e => setQuery(e.target.value)} placeholder="S&P, Nasdaq, Dollar Index"/></label><button disabled={busy || s?.readOnly !== false || !s?.connected.twelve || !query} onClick={() => run(async () => setMatches((await action({ action: 'search', query })).matches), "Search completed")}>Search</button>{matches.map((m: any, i: number) => <div className="search-result" key={i}><strong>{m.symbol}</strong><span>{m.instrument_name} · {m.exchange} · {m.instrument_type}</span><button onClick={() => { setSources({ ...sources, [symbol]: m.symbol }); setMessage("Selected for " + symbol + ". Save your source mappings."); }}>Use for {symbol}</button></div>)}</div></section><div><section className="panel"><h2>2. Telegram</h2><ol><li>Open <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>, send /newbot, and create a bot.</li><li>Paste its token below and save it.</li><li>Open your bot and send /start.</li><li>Select Find my chat, choose your private chat, and save it.</li></ol><label className="field">Bot token<input type="password" autoComplete="off" value={telegram} onChange={e => setTelegram(e.target.value)} placeholder={s?.connected.telegram ? "Token saved" : "Token from BotFather"}/></label><button disabled={busy || s?.readOnly !== false || !telegram} onClick={() => run(async () => { await action({ action: 'settings', telegram }); setTelegram(''); }, "Bot token saved")}>Save token</button><button disabled={busy || s?.readOnly !== false || !s?.connected.telegram} onClick={() => run(async () => setChats((await action({ action: 'chats' })).chats), "Review the chat list and select yourself")}>Find my chat</button>{chats.map(c => <button key={c.id} onClick={() => setChatId(c.id)}>{c.name} {c.username && '@' + c.username} · {c.id}</button>)}<label className="field">Selected private chat ID<input value={chatId} onChange={e => setChatId(e.target.value)} placeholder="Select from the list above"/></label><button disabled={busy || s?.readOnly !== false || !chatId} onClick={() => run(() => action({ action: 'settings', chatId }), "Telegram chat saved")}>Save chat</button><button disabled={busy || s?.readOnly !== false || !s?.connected.telegram || !s?.connected.chat} onClick={() => run(() => action({ action: 'telegram', mode, test: true }), "Test message sent")}>Send test</button></section><section className="panel calendar"><h2>3. Calendar · {symbol}</h2><p>{current.kind === 'crypto' ? "Bitcoin: 24 hours a day, seven days a week." : "Simplified calendar: Monday 01:00 to Friday 23:00, Europe/Ljubljana. Weekends are excluded; holidays and daily breaks are not modeled."}</p><p className="muted">This is a dashboard-specific convention. D1/W1/H4 retain Twelve Data bar boundaries; alignment with broker trading days has not been verified. Missing bars are not fabricated.</p></section></div></div>}
 <footer>Market Compass <span>Closed-candle analysis · three level classes · no order execution</span></footer></div></main>;
}
