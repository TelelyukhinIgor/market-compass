import {env} from 'cloudflare:workers';
export const telegramViewerEmail=(env as unknown as {TELEGRAM_VIEWER_EMAIL?:string}).TELEGRAM_VIEWER_EMAIL?.trim().toLowerCase()||'';
export const canReceiveViewerTelegram=(email:string|null)=>Boolean(telegramViewerEmail && email?.toLowerCase()===telegramViewerEmail);

export function subscriptionStart(updates:any[],token:string,created:number){
 return updates.map(u=>u.message).find(m=>m?.chat?.type==='private'&&String(m.chat.id)===String(m.from?.id)&&!m.from?.is_bot&&m.text==='/start '+token&&m.date*1000>=created-1000);
}
