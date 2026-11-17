# Changelog – GGP

Histórico de alterações relevantes no app. Entradas novas sempre no topo. Ver `CLAUDE.md` para o contexto de arquitetura/regras por trás de cada mudança.

## 2026-11-17 — Explicação do índice de maturidade

Adicionado bloco recolhível "Como funciona esse índice?" na tela de cada troca, logo abaixo do título "Maturidade da parada". Mostra os 5 pilares com os pesos atualmente configurados, como a % de cada pilar e o índice final são calculados, e como as faixas (Liberada/Atenção/Não liberada/Sem dados) são definidas — inclusive a regra de bloqueio por ação Crítica/com impacto na parada ainda não executada. Visível para todos os perfis.

- Arquivos: `index.html` (função `matInfoHtml`, chamada em `matHtml`).
- Nenhuma mudança de backend.

## 2026-11-17 — Responsável da ação vinculado a usuário + "Minhas ações" + permissão por ação

Pedido: relacionar o responsável de cada ação a um usuário de verdade, sinalizar pendências por usuário ao entrar, e permitir que o editor (ou o próprio responsável) altere a ação — mas o responsável, se for apenas viewer, só pode marcar execução e anexar evidência da própria ação, nunca editar o resto.

- Novo campo opcional `acoes[i].respId` (uuid), além do texto livre `resp` que já existia (mantido por compatibilidade com filtros/exportação/modelos de plano).
- Diálogo de edição de ação (Editor/Dono) ganhou um select "Responsável (usuário do sistema)".
- Botão "Minhas ações" no topo: contador de ações pendentes (`respId === meu user_id` e `!executado`) atribuídas ao usuário logado, com lista clicável.
- Viewer vinculado como responsável de uma ação: ao clicar na própria ação (linha fica com marca amarela na lateral), abre um diálogo restrito (`#respdlg`) só com a data de execução e os anexos daquela ação — nada mais editável.
- Nova Edge Function **`acao-responsavel`** (service role): valida que quem chama é o responsável daquela ação específica (ou editor/dono) antes de gravar `executado` ou anexos. Usa signed upload URL do bucket `anexos` para o upload do responsável (a RLS de Storage continua só editor/dono; o signed URL contorna isso pontualmente, sem afrouxar a policy). O cliente nunca grava direto em `cards` nesse caminho — tudo passa pela função, que também registra no `card.hist`.
- Tabelas/colunas: nenhuma migração de schema (tudo dentro do jsonb de `cards.data`).
- Arquivos: `index.html` (múltiplos pontos — diálogo da ação, click-delegation, anexos, badge "Minhas ações"); `supabase/functions/acao-responsavel/index.ts` (novo).

## 2026-11-17 — Gestão de usuários direto pelo site (sem abrir o Supabase)

Pedido: dono conseguir criar/remover usuários do GGP pela própria aba "Usuários", sem precisar abrir o painel do Supabase toda vez.

- Nova Edge Function **`admin-users`** (service role): só age se o perfil de quem chama é `dono`. Ações: criar usuário Auth (+ linha em `perfis`) e remover usuário Auth (+ linha em `perfis`).
- Aba "Usuários" ganhou formulário "Adicionar usuário" (usuário, nome, senha inicial, nível) e botão "Remover" por linha (exceto a própria).
- Arquivos: `index.html` (seção "Usuários"); `supabase/functions/admin-users/index.ts` (novo).
- Observação de ambiente: deploy de Edge Function exige `api.supabase.com` liberado no ambiente e um personal access token da conta Supabase (não confundir com anon key/service role key do projeto) — ver `CLAUDE.md`.

## 2026-11-17 — Publicação inicial do site neste repositório

Site GGP (antes só um arquivo `.html` enviado pelo usuário) publicado em `danoliveira11/repositorio`, pasta `ggp-gestao-paradas/`, com `.nojekyll` na raiz do repositório para o GitHub Pages servir o HTML puro. Backend Supabase (projeto GGP-S11D) já existia e já estava configurado no próprio HTML (URL + anon key); nenhuma mudança de backend nesta etapa.

- Repositório escolhido por ser público (GitHub Pages em repositório privado exige plano pago) — alternativa descartada: repositório privado `danoliveira11/Performance`, usado só para a primeira tentativa antes de decidir pelo público (não é o site em produção; considerar remover essa cópia duplicada se ainda existir).
- GitHub Pages precisa ser ativado manualmente nas configurações do repositório (Settings → Pages → branch `main`, pasta `/`) — a API de Pages é bloqueada pelo proxy desta sessão, não dá para automatizar esse passo específico por aqui.
- Arquivos: `index.html` (novo, nesta pasta), `.nojekyll` (raiz do repositório).
