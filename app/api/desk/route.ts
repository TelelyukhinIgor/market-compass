import { isDeskOwner } from '@/lib/desk-access';
import { status, saveSettings, refresh, searchSymbols, discoverChats, sendTelegram, normalizeDay, readReport, runReport, viewerTelegramState } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { try {
    const u = new URL(req.url);
    const id = u.searchParams.get('report');
    const owner = isDeskOwner(req);
    const data: any = id ? await readReport(Number(id)) : await status();
    if (!id) {
        data.readOnly = !owner;
        data.viewerTelegram = await viewerTelegramState(req.headers.get('oai-authenticated-user-email'));
        if (!owner) {
            const { chatId, ...safe } = data.config;
            data.config = safe;
        }
    }
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
catch {
    return Response.json({ error: "Unable to load storage. Please try again later." }, { status: 503 });
} }
export async function POST(req: Request) { if (!isDeskOwner(req))
    return Response.json({ error: "Read-only access" }, { status: 403 }); const origin = req.headers.get('origin'); if (origin && origin !== new URL(req.url).origin)
    return Response.json({ error: "Invalid request origin" }, { status: 403 }); try {
    const b: any = await req.json();
    let data;
    switch (b.action) {
        case 'settings':
            data = await saveSettings(b);
            break;
        case 'refresh':
            data = await refresh(b.symbol, b.tf);
            break;
        case 'search':
            data = await searchSymbols(String(b.query || ''));
            break;
        case 'chats':
            data = await discoverChats();
            break;
        case 'telegram':
            data = b.test ? await sendTelegram(b.mode, true) : await runReport(b.mode, b.requestId);
            break;
        case 'runReport':
            data = await runReport(b.mode, b.requestId);
            break;
        case 'normalize':
            data = await normalizeDay(b.symbol);
            break;
        default: throw Error("Unknown action");
    }
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Operation failed" }, { status: 400 });
} }
