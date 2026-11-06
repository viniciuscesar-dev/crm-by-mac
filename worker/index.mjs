import whatsapp from '../netlify/functions/whatsapp.mjs';
import admin from '../netlify/functions/admin.mjs';
import advanced from '../netlify/functions/advanced.mjs';
import auth from '../netlify/functions/auth.mjs';
import campaigns from '../netlify/functions/campaigns.mjs';
import config from '../netlify/functions/config.mjs';
import creator from '../netlify/functions/creator.mjs';
import data from '../netlify/functions/data.mjs';
import documentExtract from '../netlify/functions/document-extract.mjs';
import notifications from '../netlify/functions/notifications.mjs';
import opportunities from '../netlify/functions/opportunities.mjs';
import privacy from '../netlify/functions/privacy.mjs';
import publicCampaign from '../netlify/functions/public-campaign.mjs';
import publicProposal from '../netlify/functions/public-proposal.mjs';

const handlers = {
  whatsapp,
  admin,
  advanced,
  auth,
  campaigns,
  config,
  creator,
  data,
  'document-extract': documentExtract,
  notifications,
  opportunities,
  privacy,
  'public-campaign': publicCampaign,
  'public-proposal': publicProposal,
};

const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function withSecurityHeaders(response) {
  const next = new Response(response.body, response);
  for (const [key, value] of Object.entries(securityHeaders)) next.headers.set(key, value);
  return next;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const prefix = '/.netlify/functions/';

    if (url.pathname.startsWith(prefix)) {
      const name = url.pathname.slice(prefix.length).split('/')[0];
      const handler = handlers[name];
      if (!handler) return withSecurityHeaders(new Response(JSON.stringify({ message: 'Função não encontrada.' }), { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } }));
      try {
        return withSecurityHeaders(await handler(request));
      } catch (error) {
        console.error('Worker route error', name, error);
        return withSecurityHeaders(new Response(JSON.stringify({ message: 'Erro interno.' }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }));
      }
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
