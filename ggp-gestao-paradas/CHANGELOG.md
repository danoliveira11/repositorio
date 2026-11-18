# Changelog – GGP

Histórico de alterações relevantes no app. Entradas novas sempre no topo. Ver `CLAUDE.md` para o contexto de arquitetura/regras por trás de cada mudança.

## 2026-11-18 — Layout da tabela de ações, maturidade reformatada, múltiplos responsáveis e telas restritas a Editor/Dono

Pedido: (1) a tabela do plano de ação obrigava a rolar pro lado para ver as últimas colunas; (2) o bloco de pilares da maturidade estava "desordenado"; (3) uma ação devia poder ter mais de um responsável; (4) Histórico, Feedback da parada, Padrão de recursos e Parque reserva deveriam ficar visíveis só para Editor e Dono (confirmado com o usuário que isso inclui o Dono, não só o Editor); (5) nenhum botão de lançar/alterar deve aparecer para quem não tem permissão naquele lugar.

- **Tabela do plano de ação** (por card e a lista global "Plano de ação"): mescladas as colunas Farol+Status e Peso+%avanço+Peso realizado, títulos de coluna encurtados, nova classe `.tbl-ac` com fonte/padding mais compactos. Resultado: cabe sem rolagem horizontal a partir de ~1366px de largura; abaixo disso (ex.: 1024px) ainda pode precisar de uma rolagem pequena — não dava para eliminar de vez sem sacrificar legibilidade dos badges de status.
- **Maturidade da parada**: a lista de pilares (`.mat-pls`) não tinha nenhum estilo próprio (sem borda, sem fundo, sem título) — por isso parecia uma lista solta "desordenada", principalmente quando a tela ficava estreita e ela caía para baixo do resto. Agora é um card com borda/fundo e título "Pilares do índice".
- **Múltiplos responsáveis por ação**: `acoes[i].respId` (uuid único) virou `acoes[i].respIds` (array de uuids); o campo antigo continua lido via o novo helper `respIdsOf(a)` para não quebrar ações já salvas. O select de responsável no diálogo da ação virou multi-seleção (`<select multiple>`). `podeResp`, `respLabel`, `minhasAcoes()` e a Edge Function `acao-responsavel` foram todos atualizados para considerar a lista inteira, não só um uuid.
- **Telas restritas a Editor/Dono**: Parque reserva, Padrão de recursos, INFO CRC (sub-rota do Parque), Feedback da parada (seção no card e "Últimas alterações" em Indicadores) e Histórico de cada card agora escondem a aba E bloqueiam a rota por hash direto para Visualizador (nova função `podeGerenciar()`, mesma regra de `podeReport()` hoje). Usuários continua só Dono; Report continua Editor/Dono (sem mudança, já estava certo).
- **Auditoria de botões**: a maior parte dos botões de escrita (Nova ação, Editar dados da troca, Novo card, status da troca, importar/aplicar modelo, adicionar imagens etc.) já ficava escondida para Visualizador por uma regra CSS única (`body.ro ...{display:none!important}`) que já existia no projeto — nada a mudar aí. Os dois pontos que vazavam um botão sem checar a permissão certa: o botão "Adicionar arquivos" e o "Excluir" de cada anexo dentro do diálogo de Anexos, que agora só aparecem conforme a regra do responsável (própria ação / próprio upload), em vez de aparecer sempre e só falhar no clique.
- Arquivos: `index.html` (várias seções — ver `CLAUDE.md`); `supabase/functions/acao-responsavel/index.ts` (redeploy, suporte a `respIds`).
- Validado visualmente com Playwright, sem precisar de login real (`role='local'` para layout geral; `role='viewer'` forçado via `page.evaluate` para conferir a regra de visibilidade) — ver seção "Testar visualmente sem credenciais reais do Supabase" no `CLAUDE.md`.

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
