# Changelog – GGP

Histórico de alterações relevantes no app. Entradas novas sempre no topo. Ver `CLAUDE.md` para o contexto de arquitetura/regras por trás de cada mudança.

## 2026-11-18 — Corrige blocos da Maturidade "abrindo sozinhos" e adiciona importação por planilha na Carteira de Backlog

Pedido: (1) os blocos (pilares) da Maturidade, dentro do Plano de ação, estavam se abrindo sozinhos sem o usuário clicar; (2) adicionar importação por planilha nas duas listas da Carteira de Backlog (OS Material de Instalação e Backlog de aplicação), que até então só aceitavam lançamento manual item por item.

- **Causa do bug**: os blocos recolhíveis (`<details>`) dos pilares da Maturidade calculavam o atributo `open` direto dos dados (`pend ? ' open' : ''`) toda vez que a tela era desenhada de novo. Isso por si parecia inofensivo, mas a tela de uma troca redesenha inteira — inclusive a Maturidade — a cada 60 segundos (atualização automática) e a cada tecla digitada nos filtros (inclusive os novos filtros de Carteira de Backlog e Responsável/Prioridade adicionados há pouco). Resultado: se o usuário fechava manualmente um bloco com pendência, o próximo redesenho silencioso reabria ele sozinho.
- **Correção**: novo helper `detOpen(key, padrão)` guarda o estado real que o usuário escolheu (aberto/fechado) num objeto `detOpenState`, atualizado por um listener global do evento `toggle`. Aplicado aos 4 pilares com detalhe (Componente reserva/Material de Instalação/Recursos/Insumos), ao "Como funciona esse índice?", ao "Configurar índice" e ao "Configurar classificação dos status" da Carteira Geral — nenhum desses blocos deve mais mudar de estado sozinho, em nenhuma tela.
- **Importação por planilha na Carteira de Backlog**: as duas listas (OS Material de Instalação, Backlog de aplicação) ganharam botão "Importar (Excel)", com as mesmas colunas aceitas da Carteira Geral (OS, Descrição, Quantidade — Quantidade só vale para Material de Instalação) e a mesma escolha adicionar/substituir das outras importações do app.
- Arquivos: `index.html` (`matInfoHtml`, `tab()` em `matHtml`, `renderCarteira`, novo handler `$('ctpIn').onchange`, botões `data-ctpimp`). Sem mudança de schema/Edge Function.
- Validado com Playwright: (a) simulei abrir → fechar manualmente → forçar um re-render (o mesmo que o refresh de 60s faria) e confirmei que o bloco continua fechado, não reabre; (b) testei a importação de ponta a ponta com um arquivo `.xlsx` real gerado para o teste, disparando o seletor de arquivo de verdade (não só manipulando o estado direto) — as OS entraram certinho, com quantidade numérica.

## 2026-11-18 — Filtros em 4 listas: Material de Instalação (Padrão de recursos), Plano de ação, OS Material de Instalação e Backlog de aplicação

Pedido: adicionar filtro nesses 4 blocos.

- **Padrão de recursos**: novo campo de busca por código/descrição/orientação dentro da categoria e componente selecionados (`recF.iq`) — antes só dava para buscar por nome de componente na lista da esquerda, não por item dentro da lista. Reseta ao trocar de categoria ou componente.
- **Plano de ação (dentro da troca)**: a tabela já tinha filtro por status e busca livre; adicionados filtro por **Responsável** (lista os responsáveis já usados naquela troca, mais "Sem responsável") e por **Prioridade**.
- **Carteira de Backlog** (as duas listas, Material de Instalação e Backlog de aplicação): cada uma ganhou seu próprio filtro — busca por OS/descrição e um select de status do DE-PARA (OK/Atenção/Pendente/Cancelada/Não encontrada). O resumo no topo de cada lista continua contando todos os itens, não só os filtrados.
- Arquivos: `index.html` (`renderRec`, `renderCard`/`acFilter`, `carteiraSecHtml`/`ctFilter`). Sem mudança de schema/Edge Function.
- Validado com Playwright: cada filtro testado isoladamente contra uma lista com itens que deveriam e não deveriam aparecer, conferindo a contagem exata de linhas resultantes.

## 2026-11-18 — Nova funcionalidade: Carteira de Backlog (OS Material de Instalação + Backlog de aplicação) com DE-PARA automático

Pedido: criar um novo item da parada — Carteira de Backlog, com duas carteiras (OS Material de Instalação e Backlog de aplicação/carteira de criticidade). Depois desse cadastro fixo por parada, o Editor lança a carteira geral do equipamento, e o site faz o DE-PARA automático entre as duas, para saber o status real de cada OS (ok/pendente/etc). A pedido do usuário, entra também como 6º pilar do índice de maturidade.

- **Nova tabela Supabase `carteira_geral`** (RLS idêntica a `parque`/`crc`: editor/dono gravam, leitura pública), adicionada à publicação de realtime. Guarda OS por **equipamento** (frota exata, ex. `CA115` — confirmado com o usuário que "equipamento" aqui é o caminhão específico, não o tipo de frota 793F/794AC).
- **Nova aba "Carteira Geral"** (Editor/Dono): seletor de equipamento, lista de OS (Status OS/Status OM/Descrição), lançamento manual e importação por planilha (com a opção adicionar/substituir). Inclui um painel "Configurar classificação dos status" que lista todo Status OS já visto e deixa escolher OK/Atenção/Pendente/Cancelada para cada um.
- **DE-PARA automático**: Status OM com "Encerrado" → sempre OK; com "Cancelado" → sempre Cancelada (regra fixa); o resto segue a classificação configurada (ou um padrão automático: Discrepância/Desvio/Reprogramação → Atenção, resto → Pendente). Vocabulário real de status (SAP PM) recebido do usuário e usado para validar a lógica.
- **Nova seção "Carteira de Backlog"** na tela de cada troca: duas listas (OS Material de Instalação, com quantidade; Backlog de aplicação), cada OS mostrando o badge de status do DE-PARA (com Status OS/OM real no tooltip). Visível para todos (é um pilar público da maturidade); lançar/editar OS é só Editor/Dono.
- **6º pilar da Maturidade**: "Carteira de Backlog", peso padrão 1 — conta como pronto quando o DE-PARA dá OK ou Cancelada.
- Arquivos: `index.html` (nova seção "Carteira de Backlog", integração em `maturidade()`/`MAT_PIL`, sincronização em `flush()`/`startSession()`/`applyPending()`, tab/rota `#/carteira`). SQL aplicado direto no Supabase (tabela + RLS + realtime), sem Edge Function nova.
- Validado com Playwright/`role='local'` e `role='viewer'` simulado: DE-PARA testado com os 5 valores reais de status, resultado conferido linha a linha (ok/pendente/não encontrada/atenção/cancelada); pilar da maturidade calculando `tot`/`ok`/`pct` corretos; aba Carteira Geral e botões de lançamento corretamente escondidos para Visualizador, com a seção da troca continuando visível e só leitura.
- De brinde, a mesma escolha "adicionar ou substituir" pedida para esta importação foi aplicada também à importação do Padrão de recursos (pedido anterior do usuário que ainda não tinha sido feito).

## 2026-11-18 — Corrige import de planilha (coluna QNTD) e renomeia "Peças" para "Material de Instalação"

Pedido: a importação da planilha de peças (padrão da base, ex.: MATERIAL DE R&I MOTOR DIESEL) não estava trazendo a quantidade dos itens; e renomear a categoria "Peças" para "Material de Instalação".

- **Bug de import**: o leitor de planilha do Padrão de recursos só reconhecia as colunas de quantidade como `QUANTIDADE` ou `QTD`. A planilha padrão do usuário usa `QNTD` (ordem de letras diferente de `QTD`), que não batia com nenhum dos dois — por isso a quantidade ficava sempre vazia. Também percebi, pelo mesmo motivo, que a coluna `Orientações` (plural) não batia com o `ORIENTAÇÃO` (singular) esperado — mesma classe de bug, mesmo não reportado. Ampliei os sinônimos aceitos para PART NUMBER/CÓDIGO/COD/PN, QUANTIDADE/QTD/QNTD/QTDE/QUANT, UNIDADE/UN/UND, DESCRIÇÃO (+variações) e ORIENTAÇÃO/ORIENTAÇÕES (+variações). Validado reproduzindo os cabeçalhos exatos da planilha do usuário.
- **Renomeação**: "Peças" virou "Material de Instalação" em toda a interface — aba/categoria em Padrão de recursos, pilar do índice de maturidade, textos descritivos. A chave interna da categoria continua `peca` (não mudei o dado gravado, só o rótulo), então nada quebra em itens já cadastrados.
- Arquivos: `index.html` (`REC_CAT`, `MAT_PIL`, import da planilha de recursos). Sem mudança de schema/Edge Function.

## 2026-11-18 — Nova edição de modelo propaga para as trocas pendentes do componente

Pedido: quando um novo plano/edição é salvo para um componente, ele deve substituir o plano de ação em todas as trocas que ainda estão **pendentes** (planejado/pendente) daquele componente. Trocas em execução ou já concluídas não devem ser alteradas.

- Toda ação inserida por um modelo (`applyModels`, tanto automático na criação da troca quanto pelo botão "Aplicar modelo") agora carrega `origemComp`/`origemVersao`, para dar pra saber depois "esta ação veio do modelo X, edição Y".
- Ao salvar uma nova edição (botão "Salvar plano como modelo" ou importação de modelo por planilha), o app lista as trocas desse componente que ainda não estão em execução/concluídas e pergunta (confirm) se quer aplicar a edição nova nelas também. Confirmando, a nova função `propagarEdicaoModelo` troca só as ações que vieram daquele modelo (preserva ações digitadas manualmente e as de outros componentes) e registra no histórico de cada troca afetada.
- A troca de onde o modelo foi salvo nunca entra nessa lista (ela já está com o plano certo).
- Limitação conhecida, documentada no `CLAUDE.md`: ações aplicadas por um modelo antes desta mudança não têm a marcação de origem, então uma propagação futura não vai substituí-las automaticamente — isso só vale a partir de agora.
- Arquivos: `index.html` (seção "Modelos de plano por componente"). Sem mudança de schema/Edge Function.
- Validado com Playwright/`role='local'`: criei 3 trocas do mesmo componente (planejado, execução, concluído), salvei uma nova edição do modelo e confirmei que só a troca "planejado" teve a ação substituída — as outras duas ficaram exatamente como estavam.

## 2026-11-18 — Modelos de plano por componente agora são versionados

Pedido: o Editor não conseguia salvar uma nova edição do plano-modelo de um componente (ex.: "plano de motor") — o sistema só sabia **substituir** o modelo existente (um `confirm()` de "Substituir?" e, se confirmado, a edição anterior era perdida de vez). Pedido do usuário: permitir lançar uma nova edição e manter um histórico das anteriores.

- Novo helper `salvarModelo(comp, acoes, origem)`: em vez de apagar e recriar o documento do modelo, incrementa `versao` e empilha a edição anterior inteira (ações, origem, data) em `historico[]` (até 20 entradas) dentro do mesmo documento. Usado tanto no botão "Salvar plano como modelo" quanto na importação de modelo por planilha (esse segundo caminho nem avisava antes de sobrescrever — agora também versiona).
- Removido o `confirm()` de "Já existe modelo... Substituir?": não faz mais sentido pedir confirmação para algo que não é mais destrutivo.
- Tela "Modelos de plano por componente" (em "Plano de troca do caminhão") agora mostra a coluna "Edição" e, dentro de cada componente, um bloco recolhível "Histórico (N edição(ões) anterior(es))" com as ações, origem e data de cada edição anterior.
- `applyModels()`/`modelFor()` continuam usando só a edição atual (`m.acoes`) para auto-aplicar o modelo numa troca nova — o histórico é só para consulta, não existe (ainda) um "restaurar edição antiga".
- Arquivos: `index.html` (seção "Modelos de plano por componente"). Nenhuma mudança de schema/Edge Function — o histórico mora dentro do mesmo jsonb que já existia.
- Validado com o truque do `role='local'` + Playwright (ver `CLAUDE.md`): salvei duas edições seguidas do mesmo componente e confirmei que a edição 1 aparece no histórico da edição 2, com as ações certas.

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
