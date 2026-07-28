/**
 * ============================================================================
 * appGYM & NutriLogic — Worker
 * ----------------------------------------------------------------------------
 * Backend opcional. O app funciona 100% sem ele; ligar este Worker acrescenta:
 *
 *   1. Análise de foto por IA        POST /api/nutrition/analyze-image
 *      (contrato já esperado pelo NutriLogic em Ajustes → endpoint de IA)
 *   2. Backup/sync entre aparelhos   GET|PUT|DELETE /api/sync/:module
 *   3. Saúde                         GET /api/health
 *
 * Deploy:
 *   npm i -g wrangler
 *   wrangler kv namespace create SYNC          # anote o id no wrangler.toml
 *   wrangler secret put ANTHROPIC_API_KEY
 *   wrangler secret put SYNC_TOKEN             # senha do seu backup (invente uma)
 *   wrangler deploy
 *
 * Depois, no app: Ajustes → endpoint de IA → https://SEU-WORKER.workers.dev
 * ========================================================================== */

const MODEL = "claude-sonnet-5";
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;   // ~6 MB depois do base64
const SYNC_MODULES = new Set(["nutrilogic", "appgym"]);

/* ------------------------------------------------------------------ CORS */
function corsHeaders(env) {
  // Em produção troque "*" por ORIGIN (ex.: https://usuario.github.io)
  const origin = (env && env.ALLOWED_ORIGIN) || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (data, status, env) =>
  new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(env) },
  });
const fail = (code, message, status, env) => json({ error: code, message }, status || 400, env);

/* -------------------------------------------------------------- utils */
const num = (v) => (typeof v === "number" && isFinite(v) ? v : Number(v));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** O NutriLogic valida a resposta antes de exibir. Normalizamos aqui também,
 *  para que um deslize do modelo vire erro claro em vez de dado silenciosamente
 *  errado no diário de alguém. */
function normalizeItems(raw) {
  if (!raw || !Array.isArray(raw.items)) return null;
  const items = [];
  for (const it of raw.items.slice(0, 25)) {
    if (!it || typeof it.name !== "string" || !it.name.trim()) continue;
    const grams = num(it.estimatedGrams);
    if (!(grams > 0) || grams > 5000) continue;
    let range = null;
    if (Array.isArray(it.rangeGrams) && it.rangeGrams.length === 2) {
      const lo = num(it.rangeGrams[0]), hi = num(it.rangeGrams[1]);
      if (lo > 0 && hi >= lo && hi <= 6000) range = [Math.round(lo), Math.round(hi)];
    }
    items.push({
      name: it.name.trim().slice(0, 80),
      estimatedGrams: Math.round(grams),
      rangeGrams: range,
      preparation: typeof it.preparation === "string" ? it.preparation.slice(0, 40) : "",
      confidence: clamp(num(it.confidence) || 0.6, 0, 1),
      possibleAlternatives: Array.isArray(it.possibleAlternatives)
        ? it.possibleAlternatives.slice(0, 5).map((x) => String(x).slice(0, 60))
        : [],
    });
  }
  return items.length ? items : null;
}

const SYSTEM_PROMPT = `Você identifica alimentos em fotos de refeições e estima porções.

Responda SOMENTE com JSON válido, sem markdown, sem cercas de código, sem texto antes ou depois.

Formato exato:
{"items":[{"name":"arroz branco cozido","estimatedGrams":150,"rangeGrams":[110,190],"preparation":"cozido","confidence":0.7,"possibleAlternatives":["arroz integral"]}]}

Regras:
- "name": nome do alimento em português do Brasil, minúsculas, específico (ex.: "peito de frango grelhado", não "carne").
- "estimatedGrams": peso comestível estimado, em gramas.
- "rangeGrams": [mínimo, máximo] plausíveis. Faixa larga quando a foto for ambígua — nunca finja precisão que a imagem não permite.
- "preparation": método de preparo, até 3 palavras. Vazio se não der para saber.
- "confidence": 0 a 1 para a identificação do alimento.
- "possibleAlternatives": outros alimentos que a imagem poderia ser, se houver dúvida real.
- Separe os componentes do prato em itens distintos.
- Não inclua bebidas, talheres, louça ou temperos sem massa relevante.
- Se não houver comida identificável na imagem, responda {"items":[]}.`;

/* ------------------------------------------------ POST /api/nutrition/analyze-image */
async function analyzeImage(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return fail("not_configured", "O Worker está no ar, mas sem ANTHROPIC_API_KEY configurada.", 503, env);
  }
  let body;
  try { body = await request.json(); }
  catch { return fail("bad_request", "Corpo da requisição não é JSON válido.", 400, env); }

  const { image, mimeType } = body || {};
  if (typeof image !== "string" || !image) {
    return fail("bad_request", "Campo 'image' (base64) ausente.", 400, env);
  }
  if (image.length > MAX_IMAGE_BYTES) {
    return fail("too_large", "Imagem grande demais. Reduza a resolução antes de enviar.", 413, env);
  }
  const media = /^image\/(jpeg|png|webp|gif)$/.test(mimeType || "") ? mimeType : "image/jpeg";
  const b64 = image.includes(",") ? image.split(",").pop() : image;   // aceita data-URI

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.MODEL || MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data: b64 } },
            { type: "text", text: "Identifique os alimentos e estime as porções desta refeição." },
          ],
        }],
      }),
    });
  } catch {
    return fail("upstream_unreachable", "Não foi possível falar com o serviço de análise.", 502, env);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.log("anthropic error", upstream.status, detail.slice(0, 400));
    const msg = upstream.status === 401 ? "Chave da API rejeitada."
              : upstream.status === 429 ? "Limite de uso atingido. Tente de novo em instantes."
              : "O serviço de análise respondeu com erro " + upstream.status + ".";
    return fail("upstream_" + upstream.status, msg, 502, env);
  }

  const data = await upstream.json();
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch { return fail("invalid_response", "A análise não retornou JSON utilizável.", 502, env); }

  const items = normalizeItems(parsed);
  if (!items) {
    return json({ items: [], message: "Nenhum alimento identificável na imagem." }, 200, env);
  }
  return json({ items, model: env.MODEL || MODEL, analyzedAt: new Date().toISOString() }, 200, env);
}

/* --------------------------------------------- /api/sync/:module (backup) */
function authorized(request, env) {
  if (!env.SYNC_TOKEN) return false;
  const h = request.headers.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  // comparação de tamanho fixo para não vazar o token pelo tempo de resposta
  if (token.length !== env.SYNC_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ env.SYNC_TOKEN.charCodeAt(i);
  return diff === 0;
}

async function handleSync(request, env, mod) {
  if (!env.SYNC) return fail("not_configured", "Namespace KV 'SYNC' não vinculado neste Worker.", 503, env);
  if (!SYNC_MODULES.has(mod)) return fail("bad_request", "Módulo desconhecido.", 404, env);
  if (!authorized(request, env)) return fail("unauthorized", "Token de sincronização ausente ou inválido.", 401, env);

  const key = "sync:" + mod;

  if (request.method === "GET") {
    const stored = await env.SYNC.get(key, { type: "json" });
    if (!stored) return json({ empty: true, module: mod }, 200, env);
    return json(stored, 200, env);
  }

  if (request.method === "PUT") {
    let payload;
    try { payload = await request.json(); }
    catch { return fail("bad_request", "Corpo não é JSON válido.", 400, env); }
    if (!payload || typeof payload !== "object") return fail("bad_request", "Payload vazio.", 400, env);

    const incoming = { module: mod, updatedAt: new Date().toISOString(), data: payload };

    // Guarda a versão anterior antes de sobrescrever: um backup que apaga o
    // anterior sem rede de segurança não é backup.
    const prev = await env.SYNC.get(key, { type: "json" });
    if (prev) await env.SYNC.put(key + ":prev", JSON.stringify(prev));
    await env.SYNC.put(key, JSON.stringify(incoming));
    return json({ ok: true, module: mod, updatedAt: incoming.updatedAt }, 200, env);
  }

  if (request.method === "DELETE") {
    await env.SYNC.delete(key);
    return json({ ok: true, deleted: mod }, 200, env);
  }

  return fail("method_not_allowed", "Método não suportado.", 405, env);
}

/* ------------------------------------------------------------- roteador */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (path === "/api/health") {
      return json({
        ok: true,
        service: "appgym-nutrilogic-worker",
        ai: Boolean(env.ANTHROPIC_API_KEY),
        sync: Boolean(env.SYNC && env.SYNC_TOKEN),
        time: new Date().toISOString(),
      }, 200, env);
    }

    if (path === "/api/nutrition/analyze-image") {
      if (request.method !== "POST") return fail("method_not_allowed", "Use POST.", 405, env);
      return analyzeImage(request, env);
    }

    const sync = path.match(/^\/api\/sync\/([a-z]+)$/);
    if (sync) return handleSync(request, env, sync[1]);

    return fail("not_found", "Rota inexistente.", 404, env);
  },
};
