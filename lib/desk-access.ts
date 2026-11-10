import {env} from 'cloudflare:workers';
// These identity headers must be supplied by a trusted hosting/authentication layer.
// Never expose this app behind a proxy that accepts spoofed identity headers.
export function isDeskOwner(req:Request){
 const owner=(env as unknown as {DESK_OWNER_EMAIL?:string}).DESK_OWNER_EMAIL?.trim().toLowerCase();
 return Boolean(owner && req.headers.get('oai-authenticated-user-email')?.toLowerCase()===owner);
}
