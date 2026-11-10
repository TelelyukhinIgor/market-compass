import { chartFont } from './chart-font';
import { ImageResponse } from '@vercel/og';
import { activeInstruments, arrangeLevelLabels, composeChartExtrema, composeChartLevels, formatBarTime, simpleMovingAverage, visibleChartRange, type Bar, type ChartExtreme, type ChartLevel, type LevelSource } from './market';
import { chartTimeMarks } from './time-grid';
const WIDTH = 1440;
const HEIGHT = 900;
const plot = { left: 72, top: 16, width: 1000, height: 450 };
const trendNames: Record<string, string> = { up: "Uptrend", down: "Downtrend", mixed: "Mixed structure" };
const fmt = (value: number, digits: number) => value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const sourceKind = (source: LevelSource) => source.tentative
    ? "tentative " + (source.extremeType === 'high' ? "high" : "low")
    : source.permanent || source.strength === 'strong' ? "strong" : source.strength === 'medium' ? "medium" : "local";
type TelegramChartInput = {
    symbol: string;
    snapshot: any;
    snapshots: Record<string, any>;
    mode: string;
    tf: string;
    capturedAt: string;
    staleReason?: string;
};
function sourceList(level: ChartLevel, tf: string): LevelSource[] {
    return level.sources?.length ? level.sources : [{
            tf: level.origin || tf,
            price: level.price,
            strength: level.strength,
            permanent: level.permanent,
            tentative: level.tentative,
            extremeType: level.extremeType,
        }];
}
function timeValue(time: string) {
    return Date.parse(time.includes('T') ? time : time.length === 10 ? time + 'T00:00:00Z' : time.replace(' ', 'T') + 'Z');
}
function nearestBarIndex(rows: Bar[], time?: string) {
    const target = time ? timeValue(time) : NaN;
    if (!Number.isFinite(target) || !rows.length)
        return Math.max(0, rows.length - 1);
    let best = 0;
    let distance = Infinity;
    rows.forEach((bar, index) => {
        const current = Math.abs(timeValue(bar.time) - target);
        if (current < distance) {
            best = index;
            distance = current;
        }
    });
    return best;
}
function TelegramChart({ input, name, rows, levels, extrema, digits, captureLabel, barLabel, staleReason }: {
    input: TelegramChartInput;
    name: string;
    rows: Bar[];
    levels: ChartLevel[];
    extrema: ChartExtreme[];
    digits: number;
    captureLabel: string;
    barLabel: string;
    staleReason?: string;
}) {
    const a = input.snapshot;
    const sma = simpleMovingAverage(a.rows, 24).slice(-rows.length);
    const rangeValues = [...rows.map(row => row.low), ...rows.map(row => row.high), ...sma.filter((v): v is number => v !== null)];
    const rawMin = Math.min(...rangeValues);
    const rawMax = Math.max(...rangeValues);
    const padding = (rawMax - rawMin) * 0.12 || Number(a.atr) || 1;
    const min = rawMin - padding;
    const max = rawMax + padding;
    const y = (price: number) => plot.top + (max - price) / (max - min) * plot.height;
    const xStep = plot.width / rows.length;
    const x = (index: number) => plot.left + (index + 0.5) * xStep;
    const right = plot.left + plot.width;
    const axisX = right + 26;
    const labelX = right + 58;
    const yForLevel = (price: number) => Math.max(plot.top, Math.min(plot.top + plot.height, y(price)));
    const labelGap = Math.min(58, (plot.height - 30) / Math.max(1, levels.length - 1));
    const arranged = arrangeLevelLabels(levels, yForLevel, plot.top + 12, plot.top + plot.height - 12, labelGap);
    const visibleExtrema = extrema.filter(extreme => extreme.price >= min && extreme.price <= max);
    const marks = chartTimeMarks(rows, input.tf);
    const timeLabels: typeof marks.grid = [];
    let lastLabelX = -Infinity;
    for (const mark of marks.grid) {
        const markX = plot.left + mark.position * xStep;
        if (markX >= plot.left + 12 && markX <= right - 72 && markX - lastLabelX >= 125) {
            timeLabels.push(mark);
            lastLabelX = markX;
        }
    }
    const smaPoints = sma.flatMap((value, index) => value === null ? [] : [`${x(index)},${y(value)}`]).join(' ');
    const strong = '#151a20';
    const medium = '#626d79';
    const local = '#9ba5b1';
    const modeLabel = input.mode === 'position' ? "Position overview" : "Intraday overview";
    const atr = Number(a.atr);
    const labels: any[] = [];
    const textLabel = (key: string, px: number, py: number, value: string, color: string, size: number, centered = false) => {
        labels.push(<div key={key} style={{ position: 'absolute', display: 'flex', left: px, top: py - size, fontSize: size, color, whiteSpace: 'nowrap', ...(centered ? { transform: 'translateX(-50%)' } : {}) }}>{value}</div>);
        return null;
    };
    return <div style={{ width: WIDTH, height: HEIGHT, padding: '36px 42px 20px', background: '#fff', color: '#18212f', display: 'flex', flexDirection: 'column', fontFamily: 'Chart Sans' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #e5eaf0', paddingBottom: 22 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}><span style={{ fontSize: 42, fontWeight: 700 }}>{name}</span><span style={{ fontSize: 25, color: '#718096' }}>{input.symbol}</span></div>
        <span style={{ fontSize: 18, color: '#718096', marginTop: 5 }}>{modeLabel} · candles {input.tf} · {rows.length} bars</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 19, color: '#718096' }}>
        <span>Snapshot · Ljubljana</span><span style={{ fontSize: 24, fontWeight: 700, color: '#18212f', marginTop: 5 }}>{captureLabel}</span>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 52, padding: '18px 0 9px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 190 }}><span style={{ color: '#718096', fontSize: 17 }}>Snapshot price</span><span style={{ fontSize: 31, fontWeight: 700, marginTop: 3 }}>{fmt(Number(a.price), digits)}</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 180 }}><span style={{ color: '#718096', fontSize: 17 }}>Wilder ATR(14)</span><span style={{ fontSize: 31, fontWeight: 700, marginTop: 3 }}>{Number.isFinite(atr) ? fmt(atr, digits) : '—'}</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 300 }}><span style={{ color: '#718096', fontSize: 17 }}>Structure · {input.tf}</span><span style={{ fontSize: 31, fontWeight: 700, marginTop: 3 }}>{trendNames[a.trend] || "No data"}</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 250 }}><span style={{ color: '#718096', fontSize: 17 }}>Last bar · Ljubljana</span><span style={{ fontSize: 23, fontWeight: 700, marginTop: 6 }}>{barLabel}</span></div>
    </div>
    {staleReason ? <div style={{ display: 'flex', color: '#8a4b08', background: '#fff4df', border: '1px solid #f2d49e', borderRadius: 7, padding: '8px 13px', fontSize: 17, marginTop: 4 }}>DATA NOT REFRESHED · showing the latest saved snapshot · {staleReason}</div> : null}
    <div style={{ display: 'flex', color: '#718096', justifyContent: 'space-between', fontSize: 17, padding: '14px 0 2px' }}>
      <span>Time: Ljubljana · OHLC bars: open left, close right</span><span>London: solid · New York: dashed</span>
    </div>
    <div style={{ display: 'flex', position: 'relative', width: WIDTH - 84, height: 520, flexShrink: 0 }}>
    <svg width={WIDTH - 84} height={520} viewBox={`0 0 ${WIDTH - 84} 520`}>
      <defs><clipPath id="telegram-plot-clip"><rect x={plot.left} y={plot.top} width={plot.width} height={plot.height}/></clipPath></defs>
      {Array.from({ length: 6 }, (_, index) => {
            const price = max - (max - min) * index / 5;
            const yPos = y(price);
            return <g key={'axis-' + index}><line x1={plot.left} x2={right} y1={yPos} y2={yPos} stroke="#e6ebf0" strokeWidth="1"/>{arranged.some(level => Math.abs(Number(level.labelY) - yPos) < 22) ? null : textLabel('axis-text-' + index, axisX, yPos + 6, fmt(price, digits), '#697588', 17)}</g>;
        })}
      <g clipPath="url(#telegram-plot-clip)">
        {marks.grid.map((mark, index) => <line key={'grid-' + index} x1={plot.left + mark.position * xStep} x2={plot.left + mark.position * xStep} y1={plot.top} y2={plot.top + plot.height} stroke="#e3e7ec" strokeDasharray="2 6"/>)}
        {rows.map((bar, index) => {
            const color = bar.close >= bar.open ? '#14806f' : '#c84c50';
            const cx = x(index);
            const tick = Math.max(1.5, Math.min(3, xStep * 0.35));
            return <g key={bar.time}>
            <line x1={cx} x2={cx} y1={y(bar.high)} y2={y(bar.low)} stroke={color} strokeWidth="1.7"/>
            <line x1={cx - tick} x2={cx} y1={y(bar.open)} y2={y(bar.open)} stroke={color} strokeWidth="1.7"/>
            <line x1={cx} x2={cx + tick} y1={y(bar.close)} y2={y(bar.close)} stroke={color} strokeWidth="1.7"/>
          </g>;
        })}
        {smaPoints ? <polyline points={smaPoints} fill="none" stroke="#2875df" strokeWidth="2.4"/> : null}
        {marks.sessions.map((mark, index) => <line key={'session-' + index} x1={plot.left + mark.position * xStep} x2={plot.left + mark.position * xStep} y1={plot.top} y2={plot.top + plot.height} stroke={mark.session === 'London' ? '#a0a5ad' : '#7d8590'} strokeWidth="2" strokeDasharray={mark.session === 'New York' ? '9 6' : undefined}/>)}
      </g>
      {visibleExtrema.map((extreme, index) => {
            const source = extreme.sources.find(item => item.tf === input.tf) || extreme.sources[0];
            const pointX = x(nearestBarIndex(rows, source?.time)) + ((index % 3) - 1) * 5;
            const pointY = yForLevel(extreme.price);
            const high = extreme.extremeType === 'high';
            const path = high
                ? `M ${pointX} ${pointY - 7} L ${pointX + 7} ${pointY + 5} L ${pointX - 7} ${pointY + 5} Z`
                : `M ${pointX - 7} ${pointY - 5} L ${pointX + 7} ${pointY - 5} L ${pointX} ${pointY + 7} Z`;
            const sourceText = extreme.sources.map(item => item.tf + (item.age !== undefined ? ' · ' + item.age + " bars ago" : '')).join(' / ');
            return <path key={'extreme-' + extreme.extremeType + '-' + extreme.price} d={path} fill="#687385" stroke="#fff" strokeWidth="1.8"/>;
        })}
      {arranged.map((level, index) => {
            const sources = sourceList(level, input.tf);
            const levelY = yForLevel(level.price);
            const labelY = Number(level.labelY);
            const isStrong = level.permanent || level.strength === 'strong' || sources.some(source => source.permanent || source.strength === 'strong');
            const isMedium = !isStrong && (level.strength === 'medium' || sources.some(source => source.strength === 'medium'));
            const color = isStrong ? strong : isMedium ? medium : local;
            const label = `${fmt(level.price, digits)} · ${sources.map(source => `${source.tf} ${sourceKind(source)}`).join(' / ')}`;
            const onlyPreliminary = sources.length > 0 && sources.every(source => source.tentative);
            return <g key={'level-' + index}>
          <line x1={plot.left} x2={right} y1={levelY} y2={levelY} stroke={color} strokeWidth={isStrong ? 3.2 : isMedium ? 2.1 : 1.5} strokeDasharray={isStrong ? undefined : isMedium ? '10 7' : '3 7'}/>
          <path d={`M ${right} ${levelY} L ${right + 17} ${labelY} L ${labelX - 8} ${labelY}`} stroke={color} strokeWidth="1.6" fill="none"/>

          {textLabel('level-text-' + index, labelX, labelY + 6, label, color, 16)}
        </g>;
        })}
      <line x1={plot.left} x2={right} y1={y(Number(a.price))} y2={y(Number(a.price))} stroke="#345cdf" strokeWidth="2" strokeDasharray="3 7"/>
      {timeLabels.map((mark, index) => {
            const at = plot.left + mark.position * xStep;
            return <g key={'time-' + index}>{textLabel('time-label-' + index, at, plot.top + plot.height + 28, mark.label, '#697588', 15, true)}{textLabel('date-label-' + index, at, plot.top + plot.height + 49, mark.date.slice(8, 10) + '.' + mark.date.slice(5, 7), '#697588', 15, true)}</g>;
        })}
    </svg>
    {labels}
    </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, borderTop: '1px solid #e5eaf0', paddingTop: 13, marginTop: 'auto', color: '#354052', fontSize: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ width: 31, height: 3, background: '#2875df' }}/><span>SMA(24) · Close</span></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ width: 31, height: 4, background: strong }}/><span>Strong</span></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ width: 31, height: 0, borderTop: `2px dashed ${medium}` }}/><span>Medium</span></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><svg width="31" height="4" viewBox="0 0 31 4"><line x1="0" y1="2" x2="31" y2="2" stroke={local} strokeWidth="2" strokeDasharray="2 4"/></svg><span>Local</span></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><svg width="28" height="14" viewBox="0 0 28 14"><path d="M 7 1 L 13 11 L 1 11 Z M 21 3 L 27 3 L 24 13 Z" fill="#687385"/></svg><span>High / low · tentative</span></div>
      <span style={{ color: '#718096' }}>Strength is a heuristic assessment, not a guarantee</span>
    </div>
  </div>;
}
export async function renderTelegramChart(input: TelegramChartInput) {
    const instrument = activeInstruments.find(item => item.id === input.symbol);
    const snapshot = input.snapshot;
    const rows: Bar[] = Array.isArray(snapshot?.rows) ? snapshot.rows.slice(-180) : [];
    if (!instrument || rows.length < 2)
        throw new Error("For " + input.symbol + " there is no " + input.tf + " history for the chart");
    const range = visibleChartRange(rows, 24, 180);
    const levels = composeChartLevels(snapshot, input.snapshots, input.tf, input.mode, range, input.symbol);
    const extrema = composeChartExtrema(snapshot, input.snapshots, input.tf, range, input.symbol, Number(snapshot.price));
    const digits = instrument.kind === 'forex' ? 5 : 2;
    const captureLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Ljubljana', dateStyle: 'short', timeStyle: 'short' }).format(new Date(input.capturedAt));
    const barTime = String(snapshot.lastTime || '');
    const barLabel = barTime ? formatBarTime(barTime, input.tf, 'Europe/Ljubljana') : '—';
    const image = new ImageResponse(<TelegramChart input={input} name={instrument.name} rows={rows} levels={levels} extrema={extrema} digits={digits} captureLabel={captureLabel} barLabel={barLabel} staleReason={input.staleReason}/>, { width: WIDTH, height: HEIGHT, fonts: [{ name: 'Chart Sans', data: chartFont(), weight: 400, style: 'normal' }] });
    return { symbol: instrument.id, name: instrument.name, caption: `${instrument.name} (${instrument.id}) · ${input.tf}
Bar: ${barLabel} \u00B7 snapshot: ${captureLabel}${input.staleReason ? "\nData not refreshed: showing the latest saved snapshot." : ''}`, image };
}
