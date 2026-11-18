// Permite que o "responsável" de uma ação (vinculado por user_id em acoes[i].respId),
// mesmo sendo Visualizador, marque a data de execução e envie/apague os próprios anexos
// dessa ação específica — sem poder alterar mais nada no card. Editor/Dono também podem
// usar este caminho (já têm acesso direto, mas fica consistente).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANX_BUCKET = "anexos";
const ANX_MAX = 50 * 1024 * 1024;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function extOf(nome: string) {
  const m = /\.([a-z0-9]{1,6})$/i.exec(nome || "");
  return m ? "." + m[1].toLowerCase() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Não autenticado" }, 401);

  const { data: { user }, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user) return json({ error: "Sessão inválida, entre novamente" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const cardId = String(body.card_id || "");
  const acaoId = String(body.acao_id || "");
  if (!cardId || !acaoId) return json({ error: "Informe card_id e acao_id" }, 400);

  const { data: row, error: rowErr } = await admin.from("cards").select("data").eq("id", cardId).maybeSingle();
  if (rowErr || !row) return json({ error: "Troca não encontrada" }, 404);

  const card = row.data as any;
  const acoes: any[] = Array.isArray(card.acoes) ? card.acoes : [];
  const idx = acoes.findIndex((a) => a.id === acaoId);
  if (idx < 0) return json({ error: "Ação não encontrada" }, 404);
  const acao = acoes[idx];

  const { data: perfil } = await admin.from("perfis").select("perfil").eq("user_id", user.id).maybeSingle();
  const souEditor = !!perfil && (perfil.perfil === "editor" || perfil.perfil === "dono");
  const respIds: string[] = Array.isArray(acao.respIds) && acao.respIds.length ? acao.respIds : (acao.respId ? [acao.respId] : []);
  const souResponsavel = respIds.includes(user.id);
  if (!souEditor && !souResponsavel) return json({ error: "Você não pode alterar esta ação" }, 403);

  const numAcao = idx + 1;
  const pushHist = (tipo: string, det: string) => {
    const hist = Array.isArray(card.hist) ? card.hist : (card.hist = []);
    hist.push({ id: crypto.randomUUID(), ts: new Date().toISOString(), cid: cardId, frota: card.frota || "", tipo, det, uid: user.id });
    if (hist.length > 200) hist.splice(0, hist.length - 200);
  };
  const salvar = async () => {
    const { error } = await admin.from("cards").update({ data: card, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", cardId);
    if (error) throw error;
  };

  if (body.action === "status") {
    const executado = body.executado ? String(body.executado) : "";
    const antes = acao.executado || "";
    acao.executado = executado;
    pushHist(executado ? "Ação executada" : "Ação desfeita", `Ação ${numAcao}: ${executado ? "data executado " + executado : "voltou a pendente"}`);
    try { await salvar(); } catch (e) { return json({ error: "Não foi possível salvar: " + (e as Error).message }, 400); }
    return json({ ok: true, executado });
  }

  if (body.action === "get_upload_url") {
    const nome = String(body.nome || "arquivo");
    const tam = Number(body.tam || 0);
    if (tam > ANX_MAX) return json({ error: "Arquivo passa de 50 MB" }, 400);
    const id = crypto.randomUUID();
    const path = `${cardId}/${acaoId}/${id}${extOf(nome)}`;
    const { data: signed, error: signErr } = await admin.storage.from(ANX_BUCKET).createSignedUploadUrl(path);
    if (signErr || !signed) return json({ error: "Não foi possível preparar o envio: " + (signErr?.message || "") }, 400);
    return json({ id, path, token: signed.token });
  }

  if (body.action === "confirm_anexo") {
    const path = String(body.path || "");
    if (!path.startsWith(`${cardId}/${acaoId}/`)) return json({ error: "Caminho inválido" }, 400);
    const anexo = {
      id: String(body.id || crypto.randomUUID()),
      nome: String(body.nome || "arquivo"),
      tipo: String(body.tipo || ""),
      tam: Number(body.tam || 0),
      ts: new Date().toISOString(),
      uid: user.id,
      path,
    };
    if (!Array.isArray(acao.anexos)) acao.anexos = [];
    acao.anexos.push(anexo);
    pushHist("Anexos adicionados", `Ação ${numAcao}: 1 arquivo (${anexo.nome})`);
    try { await salvar(); } catch (e) { return json({ error: "Não foi possível salvar: " + (e as Error).message }, 400); }
    return json({ ok: true, anexo });
  }

  if (body.action === "anexo_del") {
    const anexoId = String(body.anexo_id || "");
    const anexos: any[] = Array.isArray(acao.anexos) ? acao.anexos : [];
    const alvo = anexos.find((x) => x.id === anexoId);
    if (!alvo) return json({ error: "Anexo não encontrado" }, 404);
    if (!souEditor && alvo.uid !== user.id) return json({ error: "Você só pode excluir anexos que você mesmo enviou" }, 403);
    if (alvo.path) await admin.storage.from(ANX_BUCKET).remove([alvo.path]);
    acao.anexos = anexos.filter((x) => x.id !== anexoId);
    pushHist("Anexo excluído", `Ação ${numAcao}: ${alvo.nome}`);
    try { await salvar(); } catch (e) { return json({ error: "Não foi possível salvar: " + (e as Error).message }, 400); }
    return json({ ok: true });
  }

  return json({ error: "Ação desconhecida" }, 400);
});
