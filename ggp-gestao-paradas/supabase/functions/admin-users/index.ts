// Gestão de usuários do GGP (criar/remover), chamada pelo site com o token do usuário logado.
// Só executa a ação se quem chama tiver perfil "dono" na tabela perfis.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOMINIO_LOGIN = "ggp.local";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Não autenticado" }, 401);

  const { data: { user }, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user) return json({ error: "Sessão inválida, entre novamente" }, 401);

  const { data: perfil } = await admin.from("perfis").select("perfil").eq("user_id", user.id).maybeSingle();
  if (!perfil || perfil.perfil !== "dono") return json({ error: "Somente o Dono pode gerenciar usuários" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  if (body.action === "create") {
    const usuario = String(body.usuario || "").trim();
    const nome = String(body.nome || "").trim();
    const senha = String(body.senha || "");
    const nivel = ["viewer", "editor", "dono"].includes(String(body.perfil)) ? String(body.perfil) : "viewer";
    if (!usuario || !senha) return json({ error: "Informe usuário e senha" }, 400);
    if (senha.length < 8) return json({ error: "A senha precisa ter pelo menos 8 caracteres" }, 400);

    const email = usuario.includes("@") ? usuario : `${usuario.toLowerCase()}@${DOMINIO_LOGIN}`;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const uid = created.user.id;
    const { error: profErr } = await admin.from("perfis").upsert({
      user_id: uid,
      usuario: email.split("@")[0].toLowerCase(),
      nome,
      perfil: nivel,
    });
    if (profErr) {
      await admin.auth.admin.deleteUser(uid);
      return json({ error: "Não foi possível salvar o perfil: " + profErr.message }, 400);
    }
    return json({ ok: true, user_id: uid });
  }

  if (body.action === "delete") {
    const targetId = String(body.user_id || "");
    if (!targetId) return json({ error: "Informe o usuário a remover" }, 400);
    if (targetId === user.id) return json({ error: "Você não pode remover a si mesmo" }, 400);

    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) return json({ error: delErr.message }, 400);
    await admin.from("perfis").delete().eq("user_id", targetId);
    return json({ ok: true });
  }

  return json({ error: "Ação desconhecida" }, 400);
});
