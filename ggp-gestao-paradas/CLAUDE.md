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
| `carteira_geral` | OS por equipamento (frota exata, ex. `CA115`) para o DE-PARA da Carteira de Backlog; também guarda o doc de config `cfg-carteira-status` | editor, dono | todos, inclusive anônimo |
| `eventos` | Histórico "geral", não ligado a um card específico (mudanças no parque, no CRC, no padrão de recursos, config de maturidade, exclusão de troca, import de modelo) | editor, dono | qualquer autenticado com perfil |
| `perfis` | `user_id, usuario, nome, perfil ('dono'\|'editor'\|'viewer'), criado_em` — uma linha por usuário Auth | só dono | qualquer autenticado com perfil |

RLS usa a função SQL `meu_perfil()` (lê `perfis` pelo `auth.uid()` da sessão). **Um viewer nunca escreve direto em nenhuma tabela.** A única exceção (responsável de uma ação) passa por Edge Function com service role — nunca por RLS alterada para permitir viewer.

Cada item de `cards[i].acoes[]` tem: `id, ponto, acao, previsto, executado, resp (texto livre, pode ter vários nomes separados por "/"), respIds (array de uuids de usuários, opcional, pode ter mais de um), obs, prioridade, impacto, anexos[]`. Use sempre o helper `respIdsOf(a)` para ler os responsáveis vinculados — ele também lê o campo antigo `respId` (singular, string) de ações criadas antes desta migração, então nunca leia `a.respId`/`a.respIds` direto. `anexos[i]` tem `id, nome, tipo, tam, ts, uid (quem enviou), path` (caminho no bucket `anexos`, formato `${cardId}/${acaoId}/${anexoId}.ext`).

`cards[i].carteiraMaterial[]` (OS Material de Instalação) e `cards[i].carteiraBacklog[]` (Backlog de aplicação) — as duas listas da Carteira de Backlog da parada, ver seção própria abaixo. Cada item: `id, os, desc, qtd` (`qtd` só é usada/mostrada em `carteiraMaterial`).

Buckets de Storage: `anexos` (INSERT/DELETE só editor/dono via RLS direta; signed upload URL contorna isso para o responsável — ver Edge Functions) e `imagens` (mesma regra, só editor/dono grava).

## Papéis e permissões

- **dono**: acesso completo, inclusive gerenciar usuários (aba "Usuários": criar/remover) e configurar pesos/mínimo do índice de maturidade.
- **editor**: edita tudo (trocas, ações, modelos, parque, CRC, recursos) menos gestão de usuários.
- **viewer**: só leitura do quadro/planejamento/plano de ação/indicadores — **exceto** quando é um dos "responsáveis" vinculados (`respIdsOf(a)` inclui seu `user_id`) de uma ação específica. Nesse caso, só para aquela ação, pode: marcar/desmarcar a data de execução e enviar/apagar os próprios anexos. Tudo isso passa pela Edge Function `acao-responsavel`; o cliente nunca grava direto na tabela `cards` nesse caminho.
- **Telas restritas a Editor e Dono** (viewer não vê nem a aba, nem a rota por hash direto): Parque reserva, Padrão de recursos, INFO CRC (sub-rota do Parque), Carteira Geral, Feedback da parada, Histórico (tanto o do card quanto "Últimas alterações" em Indicadores). Usuários continua só para Dono. Report continua Editor/Dono. A seção "Carteira de Backlog" dentro da tela da troca é diferente: todo mundo vê (é um pilar da maturidade, pública), só o lançamento/edição das OS é que é Editor/Dono (botões "+ OS" escondidos para viewer).
- No JS: `role` é `'dono'|'editor'|'viewer'|'local'|'loading'` (`'local'` = site sem Supabase configurado, tudo liberado e salvo só no navegador). `ro()` → true para viewer/loading (bloqueia escrita fora da exceção do responsável). `podeReport()`/`podeGerenciar()` → true para editor/dono/local (mesma regra hoje; mantidos como funções separadas porque o Report pode um dia ter regra própria). `podeResp(a)` → true se o usuário logado está entre os responsáveis vinculados daquela ação.
- Botões de escrita (Nova ação, Editar dados da troca, Novo card, Iniciar execução/Concluir, Importar/Aplicar modelo, Adicionar imagens, Usuários/Parque/CRC/Recursos etc.) ficam **escondidos** para `body.ro` via uma regra CSS única (`body.ro #newCard, body.ro [data-edit], ...{display:none!important}`, perto do topo do `<style>`) — ao adicionar um novo botão de escrita no quadro/card/planejamento, inclua o seletor dele nessa mesma regra em vez de confiar só no bloqueio de clique. Os anexos (`#anxAdd`, `[data-anxdel]`) são a exceção: são escondidos dinamicamente em `renderAnx()` porque a permissão depende de qual ação/anexo é (responsável só mexe na própria ação e só apaga o que o próprio usuário enviou).

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
- **`acao-responsavel`**: dá a qualquer um dos responsáveis vinculados (array `respIds`, com fallback para o antigo `respId` singular) de uma ação um caminho seguro para marcar execução e gerenciar os próprios anexos daquela ação específica, sem outro acesso de escrita. Ações aceitas: `status` (seta/limpa `executado`), `get_upload_url` (gera signed upload URL do bucket `anexos`, válida só para aquele caminho — é isso que contorna a RLS de Storage sem abrir mão dela para o resto), `confirm_anexo` (grava a entrada do anexo no card), `anexo_del` (só apaga anexo que o próprio usuário enviou, a menos que seja editor/dono).

Qualquer Edge Function nova: sempre valide o JWT de quem chama (`admin.auth.getUser(token)`) e o perfil real (`perfis`, lido com o client de *service role*) — nunca confie em nada que o corpo da requisição diga sobre "quem está chamando".

## Modelos de plano por componente (versionados, com propagação para trocas pendentes)

Um modelo guarda o plano de ação "padrão" de um componente (`state.modelos`, tabela `modelos`), aplicado automaticamente quando uma troca com aquele componente é criada (`applyModels`, também usado pelo botão manual "Aplicar modelo"). Salvar um modelo para um componente que já tem um **nunca sobrescreve sem guardar o anterior**: use sempre o helper `salvarModelo(comp, acoes, origem)` (perto de `modelAcao`) para gravar — ele incrementa `versao` e empilha a edição anterior em `historico[]` (até 20 entradas) dentro do próprio documento do modelo. `modelFor`/`modelsForCard`/`applyModels` (quem auto-aplica o modelo numa troca nova) só enxergam a edição atual (`m.acoes`); `historico` é só para consulta/auditoria, em `modelosHtml()` (seção "Modelos de plano por componente", tela "Plano de troca do caminhão"). Nunca volte a fazer um `modelos().filter(m=>m.comp!==comp)` seguido de `push` direto num novo evento de salvar — isso perde a edição anterior; passe sempre por `salvarModelo`.

**Propagação para trocas já existentes**: toda ação inserida por `applyModels` carrega `origemComp`/`origemVersao` (de qual modelo/edição ela veio). Ao salvar uma nova edição (`$('mdOk').onclick`, modo 'save', e o branch `model` do import por planilha em `$('xlsIn').onchange`), o app calcula `trocasPendentesDoComp(comp, idDaTrocaOrigem)` — trocas com esse componente cujo `statusOf(c)` **não** é `'execucao'` nem `'concluido'` (planejado/pendente contam) — e, se houver alguma e o usuário confirmar, chama `propagarEdicaoModelo(cards, comp, versao, acoesModelo)`: remove dessas trocas só as ações com `origemComp===comp` (preserva ações manuais e as de outros componentes) e insere as da nova edição, já tagueadas. Trocas em execução ou concluídas nunca são tocadas, mesmo que o usuário confirme. A troca de onde o modelo foi salvo (`mdCard`) é sempre excluída da lista de "pendentes a atualizar" (ela já está com as ações certas — propagar nela de novo apagaria qualquer dado específico que não entra no modelo, como `previsto`). **Limitação conhecida**: ações aplicadas por modelo antes desta funcionalidade existir não têm `origemComp`/`origemVersao` — uma propagação futura não vai substituí-las (ficam duplicadas ao lado da edição nova) até serem recriadas manualmente.

## Carteira de Backlog (OS Material de Instalação + Backlog de aplicação, com DE-PARA automático)

Terceiro "insumo" da parada, ao lado do Plano de ação e da Maturidade. Duas listas digitadas à mão por troca, dentro do próprio card (`carteiraMaterial`/`carteiraBacklog`, ver "Modelo de dados"), cada item só com número de OS + descrição (+ quantidade, no Material). Seção "Carteira de Backlog" em `index.html`, renderizada em `carteiraSecHtml(c)` dentro de `renderCard()`.

**Carteira Geral** (aba própria, Editor/Dono, `renderCarteira()`/tabela `carteira_geral`): a lista mestra de OS de cada **equipamento** (frota exata, ex. `CA115` — não por tipo de frota 793F/794AC) — lançada manualmente ou importada por planilha (com a mesma escolha adicionar/substituir das outras importações do app), carregando `os, statusOS, statusOM, desc` por linha.

**DE-PARA** (`carteiraDePara(os, frota)`): cruza o número da OS de cada item das duas listas da troca com a Carteira Geral da mesma frota, e classifica em `ok` / `atencao` / `pendente` / `cancelada` / `nao_encontrada` (`carteiraClassificar`). Regra fixa, não configurável: Status OM contendo "Encerrado" → sempre `ok`; contendo "Cancelado" → sempre `cancelada`. Para o resto, usa a classificação configurada por **Status OS** (tela "Configurar classificação dos status", dentro da aba Carteira Geral — lista todo Status OS já visto, com um select OK/Atenção/Pendente/Cancelada; guardada no doc `cfg-carteira-status` da tabela `carteira_geral`), com um padrão automático se não houver configuração: Status OS contendo "Discrepância"/"Desvio"/"Reprogramação" → `atencao`; qualquer outro → `pendente`.

Entra como 6º pilar da Maturidade (`backlog`, ver seção abaixo): `tot` = total de itens nas duas listas da troca, `ok` = quantos deram `ok` ou `cancelada` no DE-PARA (cancelada não bloqueia nada, por isso conta como "pronto" na pontuação, embora apareça com seu próprio rótulo na UI).

Cada uma das duas listas tem seu próprio filtro (busca por OS/descrição + status do DE-PARA), estado em `ctFilter` (`matQ/matSt/bkQ/bkSt`), resetado junto com `acFilter` ao trocar de troca em `route()`. O filtro só afasta linhas da tabela — o resumo no cabeçalho de cada lista (`ctResumoHtml`) sempre conta os itens sem filtro.

Cada lista também aceita planilha (botão "Importar (Excel)", input `#ctpIn` compartilhado entre as duas — `dataset.tipo`/`dataset.cid` dizem qual lista e qual troca), com a mesma escolha adicionar/substituir das outras importações do app. Colunas aceitas: OS (obrigatória), Descrição, Quantidade (só é lida/gravada para `carteiraMaterial`; ignorada em `carteiraBacklog`).

Vocabulário real de Status OS/Status OM é do sistema do usuário (SAP PM): Status OS é uma sequência numerada ("1. Ag. Planej." … "13. Ag. Encerramento", mais "Desvio de Status"); Status OM é um status paralelo, frequentemente em branco até perto do fechamento ("Programação", "Encerrado", "Cancelado", "Aprovação de Custeio").

## Índice de maturidade da parada

Calculado em `maturidade(c)` (seção "Maturidade da parada" em `index.html`). 6 pilares com peso configurável — Componente reserva, Material de Instalação (categoria interna continua `peca`; só o rótulo mudou de "Peças"), Recursos, Insumos, Plano de ação, Carteira de Backlog (ver seção acima). Por pilar: `% = itens "Disponível" ÷ total de itens` (a Carteira de Backlog usa seu próprio critério de "pronto" — ver acima); pilar sem nenhum item não entra na conta (vira aviso). Índice final = média dos pilares com item, ponderada pelos pesos. Faixas: **Liberada** (índice ≥ mínimo configurado e nenhum bloqueio) · **Atenção** (abaixo do mínimo, sem bloqueio) · **Não liberada** (existe ação Crítica ou com Impacto=SIM ainda não executada — bloqueio sempre vence o índice, mesmo a 100%) · **Sem dados** (nenhum pilar com item). Pesos/mínimo configuráveis por editor/dono em "Configurar índice" (fica na própria tela da maturidade), guardados no documento `cfg-maturidade` dentro da tabela `recursos`.

Há uma explicação disso já embutida no site para qualquer usuário (bloco recolhível "Como funciona esse índice?", logo abaixo do título "Maturidade da parada"). **Se mudar a fórmula/pesos padrão/faixas, atualize esse bloco também** (função `matInfoHtml`, perto de `maturidade()`).

## Convenções do código

- Sem build: edite `index.html` direto, nenhum passo de compilação.
- Estilo do JS existente: compacto (poucos espaços supérfluos), `const nome = x => ...` para helpers puros, `function nome(){}` quando precisa estar disponível antes de ser definido no arquivo (hoisting). Siga o estilo ao redor do trecho que for tocar; não reformate o que não for alterar.
- **`<details>` dentro de telas que recarregam sozinhas** (qualquer página sob o `setInterval` de 60s em `refresh()`, ou com filtro de busca que re-renderiza a cada tecla, como `#acQ`/`#recIq`/os filtros da Carteira de Backlog): nunca calcule o atributo `open` só a partir dos dados (ex.: `pend?' open':''`) — isso reabre/fecha sozinho a cada re-render, undoing o clique do usuário. Dê ao `<details>` um `data-pkey="algumaChave"` e use `detOpen(key, valorPadrao)` (perto de `wireDetOpen`) para decidir o atributo `open`. O estado do usuário é lembrado em `detOpenState`, atualizado por `wireDetOpen(root)` — essa função varre `root.querySelectorAll('details[data-pkey]')` e liga o `.ontoggle` de cada um diretamente (não um listener global delegado, que se mostrou pouco confiável para alguns elementos). **Toda função `renderX()` que gera algum `<details data-pkey="...">` no seu HTML precisa chamar `wireDetOpen($('idDoContainer'))` no final, depois de setar o `innerHTML`** — senão aquele bloco especificamente perde a persistência mesmo que o mecanismo em si esteja certo. Pontos de chamada hoje: `renderCard`/`renderTrocas` → `wireDetOpen($('vCard'))` (cobre `matinfo`, `pil-*`, `matcfg`, `modelo-*`, `modelo-hist-*`), `renderInd` → `wireDetOpen($('vInd'))` (`indhist`), `renderCarteira` → `wireDetOpen($('vCarteira'))` (`ctcfg`). Ao adicionar um `<details data-pkey>` novo em qualquer outra tela, adicione o `wireDetOpen(...)` correspondente nessa mesma função — confira com `grep -n "data-pkey=" index.html` e `grep -n "wireDetOpen" index.html` que todo pkey tem uma chamada cobrindo o container onde ele é renderizado.
- **Escolher vários itens de uma lista (ex.: vincular mais de um usuário a algo)**: nunca use `<select multiple>` — ele exige Ctrl/Cmd+clique pra desmarcar um item sem limpar o resto, o que não é intuitivo e já gerou reclamação de usuário. Use o padrão `.complist` (já existente, reusado em mais de um lugar do app): uma `<div class="complist">` com uma lista de `<label><input type="checkbox" value="...">Texto</label>`, e leia a seleção com `[...container.querySelectorAll('input:checked')].map(i=>i.value)`. Exemplo: campo "Responsável (usuário do sistema)" na ação (`#aRespList`, dentro de `openAc()`).
- Sem comentários de explicação espalhados pelo meio das funções — o "porquê" de cada seção já está no cabeçalho `/* ---------- ... ---------- */` dela, e decisões maiores ficam aqui no CLAUDE.md, não inline no código.
- `log(card, tipo, detalhe)` grava no histórico do próprio card (`card.hist`, salvo no próximo `save()`, aparece na aba "Histórico" do card). `log(null, tipo, detalhe)` ou `log(card, tipo, detalhe, true)` grava na tabela global `eventos` (RLS editor/dono) — use isso para algo que não é sobre uma troca específica (parque, CRC, recursos, config de maturidade) ou quando o card está sendo excluído.
- Para vincular qualquer campo de texto livre a um usuário cadastrado, siga o padrão já usado em `acoes[i].resp`/`respIds`: mantenha o campo de texto livre (compatibilidade com filtros/exportação/modelos existentes) e **adicione** um campo `*Id`/`*Ids` (uuid ou array de uuids) à parte — nunca substitua o texto livre por uma referência obrigatória, porque quebra dados históricos e fluxos de import de planilha. Ao ler esse vínculo, sempre passe por um helper tipo `respIdsOf()` que também entende o formato antigo, em vez de ler o campo novo direto — evita quebrar dado gravado antes da migração.
- Toda gravação de viewer (fora do board/leitura) tem que passar por Edge Function com service role, nunca por afrouxar uma policy de RLS para aceitar o role `viewer`.
- Tabelas com muitas colunas (ex.: as duas tabelas de "Plano de ação") ganharam a classe `.tbl-ac`, com fonte/padding mais compactos e colunas mescladas (Farol+Status, Peso+%avanço+Peso realizado) para caber sem rolagem horizontal em telas de notebook (~1366px). Ao adicionar coluna numa tabela densa, prefira mesclar numa célula existente (com `<br><small>`) a criar uma `<th>` nova.

## Testar visualmente sem credenciais reais do Supabase

Não é preciso logar de verdade para ver o layout funcionando. O Playwright já vem instalado neste ambiente (`require('playwright')` do Node). Truque:

1. Sirva o arquivo local: `python3 -m http.server 8731` nesta pasta.
2. No Playwright, bloqueie o script do Supabase antes de navegar: `page.route('**/supabase.js', route => route.abort())`. Sem `window.supabase`, o app entra sozinho em `role='local'` (modo totalmente liberado, sem tela de login) — bom para ver o layout geral e qualquer tela de Editor/Dono.
3. Para simular especificamente um **Visualizador** (`ro()`, botões escondidos, exceção do responsável) sem precisar de login real: depois de carregado, rode via `page.evaluate` algo como `role='viewer'; myId='algum-uuid'; sb={}; DB={}; applyRole();` e então `go('#/card/...')`. Isso é só manipulação de variáveis globais do próprio JS (todas `let` no escopo do `<script>`, acessíveis sem o prefixo `window.`), não fala com o Supabase de verdade — serve só para checar visual/condicional, nunca para testar a regra de RLS/Edge Function em si (essa só se confirma com um usuário real).
4. Para inspecionar overflow/largura de tabela sem depender de print: `el.getBoundingClientRect()` e `wrap.scrollWidth > wrap.clientWidth` via `page.evaluate`, mais barato em tokens do que só olhar screenshot.
5. Para testar de verdade um import de planilha (não só a lógica de parsing isolada): `cdnjs.cloudflare.com` (de onde vem a lib XLSX) precisa estar liberado no `allowed_hosts` do ambiente (`update_environment`) — já está liberado neste ambiente. Gere um `.xlsx` mínimo com `openpyxl` (Python, já disponível), dispare o seletor de arquivo clicando no botão real (`page.waitForEvent('filechooser')` + `page.click(...)`) e dê o arquivo com `fileChooser.setFiles(caminho)` — isso testa o fluxo inteiro (detecção de cabeçalho, parsing, confirm de adicionar/substituir), não só uma simulação de dados.

## Deploy / publicar uma alteração

1. Editar `index.html` (e `supabase/functions/*/index.ts` se mexer em Edge Function).
2. Validar a sintaxe do script (comando na seção "Mapa do código").
3. Se mudou uma Edge Function: fazer o deploy dela (seção "Edge Functions") **antes** de publicar um `index.html` que já dependa do novo comportamento.
4. Commit + `git push origin main` neste repositório (`danoliveira11/repositorio`) — isso já atualiza o GitHub Pages em produção.
5. Registrar a alteração em `CHANGELOG.md` (seção abaixo) **antes de considerar a tarefa concluída**.

## Registrando alterações

Toda vez que uma alteração relevante for feita neste app — nova funcionalidade, mudança de regra/permissão, mudança de schema ou de Edge Function, correção de bug não trivial — adicione uma entrada no **topo** de `CHANGELOG.md`, com data, resumo do que mudou e por quê, e quais arquivos/Edge Functions foram tocados. O objetivo é que uma sessão futura (sua, Claude, ou de outra pessoa) entenda o histórico lendo só esse arquivo, sem precisar reler o `index.html` inteiro nem o histórico do `git log`.
