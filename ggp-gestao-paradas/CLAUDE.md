# GGP – Gestão de Grandes Paradas

> Leia este arquivo inteiro antes de mexer no app. Ele existe para que você (Claude) não precise reler as ~4000 linhas do `index.html` nem re-investigar o Supabase do zero a cada sessão nova. Sempre que fizer uma alteração relevante no app, registre uma entrada em `CHANGELOG.md` (ver a última seção deste arquivo) antes de terminar a tarefa.

## O que é

Painel web para gerenciar as Grandes Paradas (trocas programadas de componentes) da frota de caminhões 794AC e 793F no site S11D (mineração). Tipos de parada: PM (preventiva, por intervalo de horas), MPNS, Parada de confiabilidade. Usuários típicos: planejamento e manutenção, com três níveis de acesso (dono/editor/viewer).

## Arquitetura

- **Frontend**: um único arquivo `index.html` (~4000 linhas, ~350 KB) nesta pasta. Sem build, sem framework, sem bundler — HTML + CSS + JS vanilla, tudo inline em um `<script>`. Abre direto no navegador.
- **Backend**: Supabase, projeto **GGP-S11D** (ref `ldvzqlnkkfbokydudlij`, URL `https://ldvzqlnkkfbokydudlij.supabase.co`). Usa:
  - **Postgres + Row Level Security (RLS)** para os dados do painel (ver "Modelo de dados" abaixo).
  - **Auth** por e-mail/senha. O app só pede um "usuário" (ex.: `joao.silva`); o login converte para e-mail `usuario@ggp.local` (domínio configurado em `CONFIG.DOMINIO_LOGIN` no `index.html`).
  - **Storage**: bucket `anexos` (evidências das ações do plano, até 50 MB/arquivo, privado) e `imagens` (fotos do plano de troca, até 10 MB/arquivo, só jpeg/png/webp/gif, privado).
  - **Edge Functions**: `admin-users` e `acao-responsavel` — código-fonte versionado em `supabase/functions/<nome>/index.ts` nesta mesma pasta. Rodam com a *service role key* (nunca exposta no cliente). Ver seção própria abaixo.
- **Hospedagem**: GitHub Pages, publicado a partir deste mesmo repositório **`danoliveira11/repositorio`** (público — Pages em repo privado exige plano pago do GitHub), pasta `ggp-gestao-paradas/`, branch `main`. `git push` nessa pasta já atualiza o site em produção em 1–2 min. URL: `https://danoliveira11.github.io/repositorio/ggp-gestao-paradas/`.
- Bibliotecas externas: `@supabase/supabase-js@2.117.2` via jsdelivr; fonte "Barlow"/"Barlow Condensed" via Google Fonts. Nenhuma outra dependência.

## Mapa do código (`index.html`)

O arquivo é dividido por comentários `/* ---------- Nome da seção ---------- */`. Para listar todas as seções com a linha atual, rode:

```
grep -n "^/\* -\{3,\}" index.html
```

Os nomes das seções (na ordem em que aparecem) já indicam o assunto: Indicadores, Feedback da parada, Datas, Status da troca, Plano de ação, Estado, Armazenamento (adapter Supabase), Usuários, Responsável da ação, Rateio de horas, Componentes visuais, Quadro (board principal), Tela da semana, Tela do card, Imagens do plano, Plano de ação (visão geral), Plano de troca do caminhão, Histórico de alterações, Modelos de plano, Alertas, Indicadores (gráficos), Report de Grandes Paradas, Cronograma/Gantt, Parque reserva, INFO CRC, Padrão de recursos, Maturidade da parada, Trava de agendamento (TAT), Planejamento, Menu lateral, Navegação, Arrastar e soltar, Cliques (delegação de eventos do board inteiro), Modal da troca, Modal da ação, Anexos por ação, Minhas ações, Minha ação (responsável), Feedback da parada (formulário), Excel import/export, Downloads, Topo.

**Antes de editar algo**, procure a seção pelo nome com `grep -n "texto da seção" index.html` em vez de ler o arquivo inteiro — os números de linha acima vão deslizar conforme o arquivo cresce.

**Depois de editar**, sempre valide a sintaxe do script antes de publicar (um erro de template literal passa despercebido num arquivo deste tamanho):

```
python3 -c "
import re
html = open('index.html', encoding='utf-8').read()
scripts = re.findall(r'<script(?:(?!src=)[^>])*>(.*?)</script>', html, re.S)
scripts.sort(key=len, reverse=True)
open('/tmp/_check.js','w',encoding='utf-8').write(scripts[0])
"
node --check /tmp/_check.js
```

## Modelo de dados (Supabase, schema `public`)

Todas as "coleções" do app imitam um banco de documentos (ao estilo Firestore) sobre tabelas Postgres genéricas: `id text` + `data jsonb` (+ `updated_by uuid`, `updated_at timestamptz` nas que têm autor). O JS esconde isso atrás de um adaptador (`sbAdapter()`, seção "Armazenamento") que expõe `DB.collection(nome).doc(id).set(obj)` / `.delete()` / `.onSnapshot()`.

| Tabela | O que `data` guarda | Grava (RLS) | Lê (RLS) |
|---|---|---|---|
| `cards` | Cada "troca": frota, datas, tempo, componentes, `acoes[]` (plano de ação — ver abaixo), `hist[]` (histórico desse card), imagens, feedback da parada | editor, dono | qualquer autenticado com perfil |
| `modelos` | Modelos de plano de ação salvos por componente | editor, dono | qualquer autenticado com perfil |
| `parque` | Parque reserva (estoque de componentes por frota/local) | editor, dono | todos, inclusive anônimo |
| `crc` | OS do CRC (componentes em reforma) | editor, dono | todos, inclusive anônimo |
| `recursos` | Padrão de recursos (peças/insumos/orientações) por componente; também guarda o doc de config `cfg-maturidade` | editor, dono | todos, inclusive anônimo |
| `eventos` | Histórico "geral", não ligado a um card específico (mudanças no parque, no CRC, no padrão de recursos, config de maturidade, exclusão de troca, import de modelo) | editor, dono | qualquer autenticado com perfil |
| `perfis` | `user_id, usuario, nome, perfil ('dono'\|'editor'\|'viewer'), criado_em` — uma linha por usuário Auth | só dono | qualquer autenticado com perfil |

RLS usa a função SQL `meu_perfil()` (lê `perfis` pelo `auth.uid()` da sessão). **Um viewer nunca escreve direto em nenhuma tabela.** A única exceção (responsável de uma ação) passa por Edge Function com service role — nunca por RLS alterada para permitir viewer.

Cada item de `cards[i].acoes[]` tem: `id, ponto, acao, previsto, executado, resp (texto livre), respId (uuid do usuário, opcional), obs, prioridade, impacto, anexos[]`. `anexos[i]` tem `id, nome, tipo, tam, ts, uid (quem enviou), path` (caminho no bucket `anexos`, formato `${cardId}/${acaoId}/${anexoId}.ext`).

Buckets de Storage: `anexos` (INSERT/DELETE só editor/dono via RLS direta; signed upload URL contorna isso para o responsável — ver Edge Functions) e `imagens` (mesma regra, só editor/dono grava).

## Papéis e permissões

- **dono**: acesso completo, inclusive gerenciar usuários (aba "Usuários": criar/remover) e configurar pesos/mínimo do índice de maturidade.
- **editor**: edita tudo (trocas, ações, modelos, parque, CRC, recursos) menos gestão de usuários.
- **viewer**: só leitura — **exceto** quando é o "responsável" vinculado (`acoes[i].respId === seu user_id`) de uma ação específica. Nesse caso, só para aquela ação, pode: marcar/desmarcar a data de execução e enviar/apagar os próprios anexos. Tudo isso passa pela Edge Function `acao-responsavel`; o cliente nunca grava direto na tabela `cards` nesse caminho.
- No JS: `role` é `'dono'|'editor'|'viewer'|'local'|'loading'` (`'local'` = site sem Supabase configurado, tudo liberado e salvo só no navegador). `ro()` → true para viewer/loading. `podeReport()` → true para editor/dono/local (quem pode emitir o Report de Grandes Paradas). `podeResp(a)` → true se o usuário logado é o responsável vinculado daquela ação.

## Edge Functions (Supabase)

Fonte em `supabase/functions/<nome>/index.ts`, nesta pasta. Deploy via Supabase CLI, sem precisar instalar nada localmente:

```
DUMMY="sbp_$(printf '0%.0s' {1..40})"   # formato exigido pela CLI; o valor real é injetado pelo proxy
SUPABASE_ACCESS_TOKEN="$DUMMY" SUPABASE_NO_TELEMETRY=1 npx -y supabase@latest functions deploy <nome> --project-ref ldvzqlnkkfbokydudlij --yes
```

Pré-requisitos de ambiente (fazer uma vez por sessão nova, se ainda não estiverem configurados):
1. `update_environment` adicionando `api.supabase.com` aos `allowed_hosts`.
2. `request_credential` para o host `api.supabase.com` (tipo bearer) — o usuário não sabe de cabeça onde gerar o token; oriente-o a ir em `supabase.com/dashboard/account/tokens` (é um token de **conta**, não a anon key nem a service role key do projeto — essas duas ficam noutro lugar), gerar um token do tipo "Projeto" escopado a **GGP-S11D**, permissão "Acesso total".

Funções hoje:
- **`admin-users`**: cria/remove usuários Auth. Só age se `perfis.perfil(caller)==='dono'`. Usado pela aba "Usuários" (botões "Adicionar usuário"/"Remover").
- **`acao-responsavel`**: dá ao responsável (viewer vinculado) de uma ação um caminho seguro para marcar execução e gerenciar os próprios anexos daquela ação específica, sem outro acesso de escrita. Ações aceitas: `status` (seta/limpa `executado`), `get_upload_url` (gera signed upload URL do bucket `anexos`, válida só para aquele caminho — é isso que contorna a RLS de Storage sem abrir mão dela para o resto), `confirm_anexo` (grava a entrada do anexo no card), `anexo_del` (só apaga anexo que o próprio usuário enviou, a menos que seja editor/dono).

Qualquer Edge Function nova: sempre valide o JWT de quem chama (`admin.auth.getUser(token)`) e o perfil real (`perfis`, lido com o client de *service role*) — nunca confie em nada que o corpo da requisição diga sobre "quem está chamando".

## Índice de maturidade da parada

Calculado em `maturidade(c)` (seção "Maturidade da parada" em `index.html`). 5 pilares com peso configurável — Componente reserva, Peças, Recursos, Insumos, Plano de ação. Por pilar: `% = itens "Disponível" ÷ total de itens`; pilar sem nenhum item não entra na conta (vira aviso). Índice final = média dos pilares com item, ponderada pelos pesos. Faixas: **Liberada** (índice ≥ mínimo configurado e nenhum bloqueio) · **Atenção** (abaixo do mínimo, sem bloqueio) · **Não liberada** (existe ação Crítica ou com Impacto=SIM ainda não executada — bloqueio sempre vence o índice, mesmo a 100%) · **Sem dados** (nenhum pilar com item). Pesos/mínimo configuráveis por editor/dono em "Configurar índice" (fica na própria tela da maturidade), guardados no documento `cfg-maturidade` dentro da tabela `recursos`.

Há uma explicação disso já embutida no site para qualquer usuário (bloco recolhível "Como funciona esse índice?", logo abaixo do título "Maturidade da parada"). **Se mudar a fórmula/pesos padrão/faixas, atualize esse bloco também** (função `matInfoHtml`, perto de `maturidade()`).

## Convenções do código

- Sem build: edite `index.html` direto, nenhum passo de compilação.
- Estilo do JS existente: compacto (poucos espaços supérfluos), `const nome = x => ...` para helpers puros, `function nome(){}` quando precisa estar disponível antes de ser definido no arquivo (hoisting). Siga o estilo ao redor do trecho que for tocar; não reformate o que não for alterar.
- Sem comentários de explicação espalhados pelo meio das funções — o "porquê" de cada seção já está no cabeçalho `/* ---------- ... ---------- */` dela, e decisões maiores ficam aqui no CLAUDE.md, não inline no código.
- `log(card, tipo, detalhe)` grava no histórico do próprio card (`card.hist`, salvo no próximo `save()`, aparece na aba "Histórico" do card). `log(null, tipo, detalhe)` ou `log(card, tipo, detalhe, true)` grava na tabela global `eventos` (RLS editor/dono) — use isso para algo que não é sobre uma troca específica (parque, CRC, recursos, config de maturidade) ou quando o card está sendo excluído.
- Para vincular qualquer campo de texto livre a um usuário cadastrado, siga o padrão já usado em `acoes[i].resp`/`respId`: mantenha o campo de texto livre (compatibilidade com filtros/exportação/modelos existentes) e **adicione** um campo `*Id` (uuid) à parte — nunca substitua o texto livre por uma referência obrigatória, porque quebra dados históricos e fluxos de import de planilha.
- Toda gravação de viewer (fora do board/leitura) tem que passar por Edge Function com service role, nunca por afrouxar uma policy de RLS para aceitar o role `viewer`.

## Deploy / publicar uma alteração

1. Editar `index.html` (e `supabase/functions/*/index.ts` se mexer em Edge Function).
2. Validar a sintaxe do script (comando na seção "Mapa do código").
3. Se mudou uma Edge Function: fazer o deploy dela (seção "Edge Functions") **antes** de publicar um `index.html` que já dependa do novo comportamento.
4. Commit + `git push origin main` neste repositório (`danoliveira11/repositorio`) — isso já atualiza o GitHub Pages em produção.
5. Registrar a alteração em `CHANGELOG.md` (seção abaixo) **antes de considerar a tarefa concluída**.

## Registrando alterações

Toda vez que uma alteração relevante for feita neste app — nova funcionalidade, mudança de regra/permissão, mudança de schema ou de Edge Function, correção de bug não trivial — adicione uma entrada no **topo** de `CHANGELOG.md`, com data, resumo do que mudou e por quê, e quais arquivos/Edge Functions foram tocados. O objetivo é que uma sessão futura (sua, Claude, ou de outra pessoa) entenda o histórico lendo só esse arquivo, sem precisar reler o `index.html` inteiro nem o histórico do `git log`.
