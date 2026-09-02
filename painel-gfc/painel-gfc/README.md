# Painel GFC — Fleet Performance Management

Painel de indicadores da frota (Sotreq / Engenharia Tradicional Norte), agora
com os dados separados do HTML.

Antes o `index.html` tinha 4,6 MB porque carregava os quatro conjuntos de dados
colados dentro dele. Agora ele tem 58 KB e busca os dados de uma pasta `data/`
em tempo de execução — local ou direto do GitHub.

## Estrutura

```
painel-gfc/
├── index.html            página + estilos + carregador dos dados
├── app.js                toda a lógica do painel (KPIs, gráficos, filtros, impressão A4)
├── data/
│   ├── raw.json          indicadores diários por equipamento   (7.714 registros)
│   ├── maint.json        ordens de manutenção                  (5.232 registros)
│   ├── components.json   forecast de reforma de componentes    (3.210 registros)
│   ├── pm.json           controle de preventiva                (2.333 registros)
│   └── manifest.json     data da última geração (criado pelo transformar.py)
└── tools/
    ├── transformar.py       planilhas  ->  data/*.json
    ├── extrair_do_html.py   index.html antigo  ->  data/*.json
    └── requirements.txt
```

## Como rodar

O painel usa `fetch`, então precisa de um servidor — abrir o arquivo com duplo
clique (`file://`) não funciona.

```bash
cd painel-gfc
python -m http.server 8000
# abra http://localhost:8000
```

## Publicando no GitHub

### Opção A — tudo no GitHub Pages (mais simples)

1. Crie o repositório e suba a pasta inteira.
2. Em **Settings → Pages**, aponte para a branch `main`, pasta `/ (root)`.
3. Pronto. O painel acha a pasta `data/` sozinho, sem configurar nada.

O arquivo `.nojekyll` já vai junto para o GitHub Pages não ignorar nada.

### Opção B — só os dados no GitHub

Use quando o `index.html` for ficar em outro lugar (SharePoint, rede interna,
pasta compartilhada). No topo do `index.html`, preencha:

```js
const GITHUB = {
  usuario: 'seu-usuario',
  repositorio: 'painel-gfc',
  branch: 'main',
  pasta: 'data'
};
```

O repositório precisa ser **público** para o `raw.githubusercontent.com`
responder sem autenticação. Se for privado, o navegador vai receber 404.

### Opção C — trocar a origem pela URL

Sem editar nada:

```
index.html?data=https://raw.githubusercontent.com/usuario/repo/main/data
```

Útil para testar uma base nova antes de publicar.

## Atualizando os dados

```bash
pip install -r tools/requirements.txt

python tools/transformar.py entradas/ -o data
```

Aponte para as planilhas soltas, para uma pasta ou direto para os `.zip` —
o script descobre o tipo de cada arquivo pela aba de dentro:

| Origem | Aba lida | Vira |
|---|---|---|
| `2026-08-S11D.xlsx` (KPI mensal) | `Dia` | `raw.json` |
| `Exportação Forecast de Reforma...xlsx` | `Componentes` | `components.json` |
| `Controle Preventiva 793/794...xlsm` | `Consolidação Preventiva` | `pm.json` |

Vários meses de KPI viram um arquivo só. Se o mesmo dia e equipamento
aparecerem em dois arquivos, vale o último lido.

```bash
# só o que mudou
python tools/transformar.py "KPI S11D/2026-09-S11D.xlsx" -o data --somente raw

# a mina inteira, não só a frota de caminhões
python tools/transformar.py entradas/ -o data --todos-modelos

# outra frota
python tools/transformar.py entradas/ -o data --modelos 7495 6050
```

Por padrão o `raw.json` fica só com os modelos **794** e **793**, que é o
escopo do painel hoje. Com esse filtro o script reproduz exatamente os 7.714
registros que estavam embutidos no HTML antigo.

### E o maint.json?

As ordens de manutenção não saem dessas três planilhas. O `maint.json` que
está na pasta veio do HTML antigo e continua valendo. Para substituir, gere um
JSON com esta forma:

```json
[{"startTime":"01/02/2026 13:20:51","endTime":"01/02/2026 16:24:46",
  "equipment":"CA1014KS110","code":"9000","description":"HMC - EXEC MANUT",
  "duration":3.065,"classification":"MOTOR DE COMBUSTAO","conjunto":"ARREFECIMENTO",
  "problema":"BAIXO NIVEL","solucao":"COMPLETAR","causa":"...","falha":"..."}]
```

O painel classifica como corretiva quando a descrição contém `HMC` ou
`Corretiva`; o resto vira preventiva.

## Migrando de um HTML antigo

Se aparecer outro `index.html` com os dados embutidos:

```bash
python tools/extrair_do_html.py index_antigo.html -o data
```

## Detalhes que valem saber

- **Impressão A4** continua funcionando igual. O overlay de carregamento não sai na impressão.
- **Cache**: os JSON são baixados com `no-cache`, então atualizar o repositório reflete no painel sem limpar cache do navegador. O CDN do GitHub pode segurar por alguns minutos.
- **Erro ao carregar**: o painel mostra qual arquivo faltou e de qual URL tentou baixar, em vez de abrir em branco.
- **Peso**: os quatro JSON somam cerca de 4,3 MB. Ficam dentro do limite do GitHub (100 MB por arquivo) com folga.
