// Dispatch owns OAuth and validates the visitor before forwarding the request.
// A restored browser tab may retain the completed callback URL. Never exchange
// its code here: recover only when dispatch has already supplied an identity.
export function completedAuthReturn(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/callback' ||
      !request.headers.get('oai-authenticated-user-id') ||
      !request.headers.get('oai-authenticated-user-email')) return null;
  return new Response(null, {status: 303, headers: {
    Location: '/',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  }});
}
