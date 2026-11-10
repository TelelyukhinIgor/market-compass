import { isDeskOwner } from '@/lib/desk-access';
import { status, refresh, runReport } from '@/lib/server';
export const dynamic = 'force-dynamic';
const tools = [{ name: 'trading_run_report', description: 'Refresh all six active instruments and every timeframe that can contribute a level to the chart, recalculate levels, persist snapshots, then deliver six Telegram chart images as an album: D1 position refreshes D1/W1; H1 intraday refreshes H1/H4/D1/W1. Respects API rate limits and suppresses duplicate scheduled deliveries. Calls are bounded to three fetches; if pending=true, retry after retryAfterMs with the SAME requestId (returned in pending) until sent=true. Progress is persisted across calls.', inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['position', 'intraday'] }, requestId: { type: 'string' } }, required: ['mode'], additionalProperties: false } }, { name: 'trading_overview', description: 'Read saved market snapshots, freshness and calendar warnings for the six active instruments. No credentials are returned.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } }, { name: 'trading_refresh', description: 'Fetch and persist one instrument/timeframe using the privately configured market-data key. Respects a maximum 7 requests per minute. Missing symbols or credentials cause a clear error.', inputSchema: { type: 'object', properties: { symbol: { type: 'string', enum: ['SPX500', 'USTEC', 'XAUUSD', 'XAGUSD', 'EURUSD', 'BTCUSDt', 'SPY', 'QQQ', 'USO'] }, tf: { type: 'string', enum: ['W1', 'D1', 'H4', 'H1', 'M15'] } }, required: ['symbol', 'tf'], additionalProperties: false } }, { name: 'trading_send_summary', description: 'Refresh data and recalculate chart levels before sending six Telegram chart images: D1 position refreshes D1/W1; H1 intraday refreshes H1/H4/D1/W1. Respects API limits; if pending=true, continue with trading_run_report using the returned requestId. No orders are placed.', inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['position', 'intraday'] }, requestId: { type: 'string' } }, required: ['mode'], additionalProperties: false } }];
export async function POST(req: Request) { let q: any; try {
    q = await req.json();
}
catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
} if (q.id === undefined)
    return new Response(null, { status: 202 }); try {
    let result: any;
    if (q.method === 'initialize')
        result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'market-compass', version: '1.0.0' } };
    else if (q.method === 'tools/list')
        result = { tools };
    else if (q.method === 'ping')
        result = {};
    else if (q.method === 'tools/call') {
        const { name, arguments: a = {} } = q.params || {};
        if (name !== 'trading_overview' && !isDeskOwner(req))
            return Response.json({ error: "Read-only access" }, { status: 403 });
        let out;
        if (name === 'trading_run_report')
            out = await runReport(a.mode, a.requestId);
        else if (name === 'trading_overview') {
            const s = await status();
            out = { connected: s.connected, scheduling: s.scheduling, lastDeliveries: s.lastDeliveries, markets: Object.fromEntries(Object.entries(s.snapshots).map(([symbol, frames]: any) => [symbol, Object.fromEntries(Object.entries(frames).map(([tf, r]: any) => [tf, { ...r, rows: undefined, rawRows: undefined }]))])) };
        }
        else if (name === 'trading_refresh')
            out = await refresh(a.symbol, a.tf);
        else if (name === 'trading_send_summary')
            out = await runReport(a.mode, a.requestId);
        else
            throw Error('Unknown tool');
        result = { content: [{ type: 'text', text: JSON.stringify(out) }] };
    }
    else
        return Response.json({ jsonrpc: '2.0', id: q.id, error: { code: -32601, message: 'Method not found' } });
    return Response.json({ jsonrpc: '2.0', id: q.id, result });
}
catch (e) {
    return Response.json({ jsonrpc: '2.0', id: q.id, result: { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : 'Operation failed' }] } });
} }
