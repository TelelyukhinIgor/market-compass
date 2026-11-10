import { canReceiveViewerTelegram } from '@/lib/telegram-viewer';
import { beginViewerTelegram, confirmViewerTelegram } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
    const email = req.headers.get('oai-authenticated-user-email');
    if (!canReceiveViewerTelegram(email))
        return Response.json({ error: "This connection is unavailable for your account" }, { status: 403 });
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin)
        return Response.json({ error: "Invalid request origin" }, { status: 403 });
    try {
        const body: any = await req.json();
        const data = body.action === 'begin' ? await beginViewerTelegram(email!) : body.action === 'confirm' ? await confirmViewerTelegram(email!) : null;
        if (!data)
            return Response.json({ error: "Unknown action" }, { status: 400 });
        return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : "Unable to connect Telegram" }, { status: 400 });
    }
}
