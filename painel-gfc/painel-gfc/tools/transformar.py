#!/usr/bin/env python3
"""
transformar.py — converte as planilhas de origem nos JSON do painel.

Le tres tipos de arquivo (soltos, em pasta ou dentro de .zip):

  KPI mensal        2026-08-S11D.xlsx          aba "Dia"        -> raw.json
  Forecast reforma  Exportacao ... 794.xlsx    aba "Componentes"-> components.json
  Controle PM       Controle Preventiva ....xlsm
                                    aba "Consolidacao Preventiva" -> pm.json

maint.json (ordens de manutencao) nao sai destas planilhas. Ele e
mantido como esta na pasta data; para trocar, gere o arquivo pela sua
rotina de OS ou use tools/extrair_do_html.py.

Exemplos
--------
    python tools/transformar.py entradas/ -o data
    python tools/transformar.py KPI_S11D.zip PM.zip Exporta*.xlsx -o data
    python tools/transformar.py entradas/ -o data --somente raw pm
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

try:
    import openpyxl
except ImportError:  # pragma: no cover
    print("Falta a biblioteca openpyxl. Rode: pip install -r tools/requirements.txt", file=sys.stderr)
    raise SystemExit(1)


# --------------------------------------------------------------------------
# utilitarios de leitura de celula
# --------------------------------------------------------------------------

def texto(v) -> str:
    """Devolve a celula como texto limpo. Vazio vira string vazia."""
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def numero(v, padrao: float = 0.0) -> float:
    """Converte celula em float aceitando virgula decimal e sinal de %."""
    if v is None or v == "":
        return padrao
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    s = str(v).strip().replace("%", "").replace(" ", "")
    if not s or s == "-":
        return padrao
    # 1.234,56 -> 1234.56   |   1234,56 -> 1234.56
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return padrao


def para_data(v):
    """Devolve um datetime.date a partir de datetime, date ou texto."""
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    s = texto(v)
    if not s:
        return None
    s = s.split(" ")[0]
    for formato in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return dt.datetime.strptime(s, formato).date()
        except ValueError:
            continue
    return None


def iso(v):
    d = para_data(v)
    return d.isoformat() if d else None


def horas(v) -> float:
    """Duracao em horas. Aceita timedelta, hora do Excel e texto h:mm:ss."""
    if v is None or v == "":
        return 0.0
    if isinstance(v, dt.timedelta):
        return round(v.total_seconds() / 3600, 4)
    if isinstance(v, dt.time):
        return round(v.hour + v.minute / 60 + v.second / 3600, 4)
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        # numero puro ja e a quantidade de horas
        return round(float(v), 4)
    s = texto(v)
    if ":" in s:
        partes = s.split(":")
        try:
            h = float(partes[0])
            m = float(partes[1]) if len(partes) > 1 else 0
            seg = float(partes[2]) if len(partes) > 2 else 0
            return round(h + m / 60 + seg / 3600, 4)
        except ValueError:
            return 0.0
    return round(numero(s), 4)


def abrir(caminho: Path, dados=True):
    """
    Abre a planilha em modo leitura. O reset_dimensions e necessario porque
    varios arquivos exportados declaram um tamanho errado no XML e o openpyxl
    acaba cortando colunas ou linhas de verdade.
    """
    wb = openpyxl.load_workbook(caminho, data_only=dados, read_only=True)
    for ws in wb.worksheets:
        try:
            ws.reset_dimensions()
        except AttributeError:
            pass
    return wb


def achar_cabecalho(ws, obrigatorias, limite: int = 30):
    """Procura a linha de cabecalho e devolve (indice_linha, {nome: coluna})."""
    alvo = {c.lower() for c in obrigatorias}
    for i, linha in enumerate(ws.iter_rows(min_row=1, max_row=limite, values_only=True), start=1):
        mapa = {}
        for col, celula in enumerate(linha, start=1):
            nome = texto(celula)
            if nome:
                mapa[nome.lower()] = col
        if alvo.issubset(mapa.keys()):
            return i, mapa
    return None, {}


def normalizar_frota(valor: str) -> str:
    """
    'CA1014KS110 / MT500186' -> 'CA1014KS110'
    'CA110'                  -> 'CA1014KS110'
    """
    s = texto(valor)
    if not s:
        return ""
    s = s.split("/")[0].strip()
    curto = re.fullmatch(r"CA(\d{2,3})", s, flags=re.IGNORECASE)
    if curto:
        return "CA1014KS" + curto.group(1)
    return s


# --------------------------------------------------------------------------
# leitores por tipo de planilha
# --------------------------------------------------------------------------

COLUNAS_KPI = ["equipamento", "data inicial", "hc", "hd", "ht"]


def ler_kpi(caminho: Path, modelos: list[str] | None = None) -> list[dict]:
    """
    Aba 'Dia' do relatorio mensal de indicadores -> registros de raw.json.

    'modelos' filtra pela coluna Modelo (comparacao por trecho, sem acento
    de maiuscula). O painel foi montado para a frota de caminhoes, entao o
    padrao e 794 e 793; use --todos-modelos para trazer a mina inteira.
    """
    wb = abrir(caminho)
    try:
        nome_aba = next((n for n in wb.sheetnames if n.strip().lower() == "dia"), None)
        if not nome_aba:
            return []
        ws = wb[nome_aba]
        linha_cab, cab = achar_cabecalho(ws, COLUNAS_KPI)
        if not linha_cab:
            return []

        def c(nome):
            return cab.get(nome.lower())

        col = {k: c(k) for k in (
            "Data Inicial", "Equipamento", "Modelo", "Fase Produtiva", "Categoria",
            "Classe", "HC", "HM", "HMC", "HAC", "MPS", "MPNS", "HD", "HT", "NIC", "NIM",
        )}

        def val(linha, chave):
            idx = col.get(chave)
            return linha[idx - 1] if idx and idx <= len(linha) else None

        saida = []
        for linha in ws.iter_rows(min_row=linha_cab + 1, values_only=True):
            data = iso(val(linha, "Data Inicial"))
            eq = texto(val(linha, "Equipamento"))
            if not data or not eq:
                continue
            modelo = texto(val(linha, "Modelo"))
            if modelos and not any(m.lower() in modelo.lower() for m in modelos):
                continue
            saida.append({
                "d": data,
                "eq": eq,
                "md": modelo,
                "fa": texto(val(linha, "Fase Produtiva")),
                "ct": texto(val(linha, "Categoria")),
                "cl": texto(val(linha, "Classe")),
                "hc": round(numero(val(linha, "HC")), 4),
                "hm": round(numero(val(linha, "HM")), 4),
                "hmc": round(numero(val(linha, "HMC")), 4),
                "hac": round(numero(val(linha, "HAC")), 4),
                "mps": round(numero(val(linha, "MPS")), 4),
                "mpns": round(numero(val(linha, "MPNS")), 4),
                "hd": round(numero(val(linha, "HD")), 4),
                "ht": round(numero(val(linha, "HT")), 4),
                "nic": int(numero(val(linha, "NIC"))),
                "nim": int(numero(val(linha, "NIM"))),
                "prod": 0,
            })
        return saida
    finally:
        wb.close()


COLUNAS_COMP = ["componente", "posição", "nº de série do componente", "% da vida útil"]


def ler_componentes(caminho: Path) -> list[dict]:
    """Aba 'Componentes' do forecast de reforma -> registros de components.json."""
    wb = abrir(caminho)
    try:
        nome_aba = next((n for n in wb.sheetnames if n.strip().lower().startswith("componente")), None)
        if not nome_aba:
            return []
        ws = wb[nome_aba]
        linha_cab, cab = achar_cabecalho(ws, COLUNAS_COMP)
        if not linha_cab:
            return []

        col = {k: cab.get(k.lower()) for k in (
            "Componente", "Posição", "Nº de Série do Componente", "Modelo do Equipamento",
            "Nº de Frota / Nº de Série do Equipamento", "% da Vida Útil",
            "Horímetro Atual Estimado", "Último Horímetro",
            "Data de Vencimento Prevista", "Part Number",
        )}

        def val(linha, chave):
            idx = col.get(chave)
            return linha[idx - 1] if idx and idx <= len(linha) else None

        saida = []
        for linha in ws.iter_rows(min_row=linha_cab + 1, values_only=True):
            eq = normalizar_frota(val(linha, "Nº de Frota / Nº de Série do Equipamento"))
            comp = texto(val(linha, "Componente"))
            if not eq or not comp:
                continue

            bruto_venc = val(linha, "Data de Vencimento Prevista")
            if isinstance(bruto_venc, (dt.datetime, dt.date)):
                venc = para_data(bruto_venc).strftime("%d/%m/%Y")
            else:
                venc = texto(bruto_venc) or "-"

            saida.append({
                "equipment": eq,
                "modelo": texto(val(linha, "Modelo do Equipamento")),
                "componente": comp,
                "posicao": texto(val(linha, "Posição")) or "UN",
                "serie": texto(val(linha, "Nº de Série do Componente")) or "-",
                "vidaUtilPct": round(numero(val(linha, "% da Vida Útil")), 2),
                "horimetroAtual": texto(val(linha, "Horímetro Atual Estimado")) or "-",
                "ultimoHorimetro": texto(val(linha, "Último Horímetro")) or "-",
                "vencimento": venc,
                "partNumber": texto(val(linha, "Part Number")) or "-",
            })
        # pior vida util primeiro, igual ao painel mostra
        saida.sort(key=lambda r: (r["equipment"], -r["vidaUtilPct"]))
        return saida
    finally:
        wb.close()


COLUNAS_PM = ["equipamento", "data prog. inicial", "sa"]


def ler_pm(caminho: Path) -> list[dict]:
    """Aba 'Consolidacao Preventiva' do controle de PM -> registros de pm.json."""
    wb = abrir(caminho)
    try:
        nome_aba = next(
            (n for n in wb.sheetnames
             if n.strip().lower().startswith(("consolidação preventiva", "consolidacao preventiva"))),
            None,
        )
        if not nome_aba:
            return []
        ws = wb[nome_aba]
        linha_cab, cab = achar_cabecalho(ws, COLUNAS_PM)
        if not linha_cab:
            return []

        col = {k: cab.get(k.lower()) for k in (
            "Equipamento", "Data Prog. Inicial", "Data Prog. Término",
            "Duração Programado", "Duração Real", "Término Realizado",
            "BL's Prog.", "BL's Executados", "BL's P0", "BL's P1", "SA",
        )}

        def val(linha, chave):
            idx = col.get(chave)
            return linha[idx - 1] if idx and idx <= len(linha) else None

        saida = []
        for linha in ws.iter_rows(min_row=linha_cab + 1, values_only=True):
            data = iso(val(linha, "Data Prog. Inicial"))
            eq = normalizar_frota(val(linha, "Equipamento"))
            if not data or not eq:
                continue
            saida.append({
                "d": data,
                "eq": eq,
                "p0": int(numero(val(linha, "BL's P0"))),
                "p1": int(numero(val(linha, "BL's P1"))),
                "blProg": int(numero(val(linha, "BL's Prog."))),
                "blExec": int(numero(val(linha, "BL's Executados"))),
                "hProg": horas(val(linha, "Duração Programado")),
                "hReal": horas(val(linha, "Duração Real")),
                "progFim": iso(val(linha, "Data Prog. Término")) or data,
                "realFim": iso(val(linha, "Término Realizado")) or data,
                "sa": int(numero(val(linha, "SA"))),
            })
        saida.sort(key=lambda r: (r["d"], r["eq"]))
        return saida
    finally:
        wb.close()


# --------------------------------------------------------------------------
# descoberta dos arquivos de entrada
# --------------------------------------------------------------------------

EXTENSOES = {".xlsx", ".xlsm"}


def classificar(caminho: Path) -> str | None:
    """Adivinha o tipo pela aba de dentro; cai para o nome do arquivo se falhar."""
    try:
        wb = abrir(caminho, dados=False)
        abas = {n.strip().lower() for n in wb.sheetnames}
        wb.close()
    except Exception:
        abas = set()

    if "dia" in abas and "filtros" in abas:
        return "raw"
    if any(a.startswith("componente") for a in abas):
        return "components"
    if any(a.startswith(("consolidação preventiva", "consolidacao preventiva")) for a in abas):
        return "pm"

    nome = caminho.name.lower()
    if "s11d" in nome and re.search(r"20\d\d[-_]\d\d", nome):
        return "raw"
    if "forecast" in nome or "componente" in nome:
        return "components"
    if "preventiva" in nome:
        return "pm"
    return None


def coletar(entradas: list[Path], temp: Path) -> list[Path]:
    """Expande pastas e zips e devolve a lista de planilhas encontradas."""
    achados: list[Path] = []
    for entrada in entradas:
        if not entrada.exists():
            print(f"  aviso: {entrada} nao existe, pulando")
            continue
        if entrada.is_dir():
            achados += [p for p in sorted(entrada.rglob("*")) if p.suffix.lower() in EXTENSOES]
            achados += coletar(sorted(entrada.rglob("*.zip")), temp)
        elif entrada.suffix.lower() == ".zip":
            destino = temp / entrada.stem
            destino.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(entrada) as z:
                z.extractall(destino)
            achados += [p for p in sorted(destino.rglob("*")) if p.suffix.lower() in EXTENSOES]
        elif entrada.suffix.lower() in EXTENSOES:
            achados.append(entrada)
    # ignora arquivos temporarios do Excel (~$nome.xlsx)
    return [p for p in achados if not p.name.startswith("~$")]


# --------------------------------------------------------------------------
# principal
# --------------------------------------------------------------------------

LEITORES = {"raw": ler_kpi, "components": ler_componentes, "pm": ler_pm}
MODELOS_PADRAO = ["794", "793"]
NOMES = {"raw": "raw.json", "components": "components.json", "pm": "pm.json"}


def chave_unica(tipo: str, registro: dict) -> tuple:
    if tipo == "raw":
        return (registro["d"], registro["eq"])
    if tipo == "components":
        return (registro["equipment"], registro["componente"], registro["posicao"], registro["serie"])
    return (registro["d"], registro["eq"], registro["progFim"], registro["hProg"])


def main() -> int:
    ap = argparse.ArgumentParser(description="Converte as planilhas do GFC nos JSON do painel.")
    ap.add_argument("entradas", nargs="+", type=Path, help="planilhas, pastas ou arquivos .zip")
    ap.add_argument("-o", "--saida", type=Path, default=Path("data"), help="pasta de destino (padrao: data)")
    ap.add_argument("--somente", nargs="+", choices=sorted(LEITORES), help="gerar so estes conjuntos")
    ap.add_argument("--modelos", nargs="+", default=MODELOS_PADRAO,
                    metavar="TRECHO",
                    help='modelos a manter no raw.json (padrao: %s)' % " ".join(MODELOS_PADRAO))
    ap.add_argument("--todos-modelos", action="store_true",
                    help="nao filtrar por modelo; traz a frota inteira para o raw.json")
    ap.add_argument("--indentar", action="store_true", help="JSON legivel (arquivo fica maior)")
    args = ap.parse_args()

    tipos = set(args.somente) if args.somente else set(LEITORES)
    modelos = None if args.todos_modelos else args.modelos
    temp = Path(tempfile.mkdtemp(prefix="gfc_"))
    try:
        planilhas = coletar(args.entradas, temp)
        if not planilhas:
            print("Nenhuma planilha .xlsx ou .xlsm encontrada nas entradas.", file=sys.stderr)
            return 1

        print(f"{len(planilhas)} planilha(s) encontrada(s)")
        print("Modelos no raw.json: " + ("todos" if modelos is None else ", ".join(modelos)) + "\n")
        juntado: dict[str, dict] = {t: {} for t in LEITORES}

        for caminho in planilhas:
            tipo = classificar(caminho)
            if tipo is None:
                print(f"  ? {caminho.name:52} tipo nao reconhecido, pulando")
                continue
            if tipo not in tipos:
                print(f"  - {caminho.name:52} {tipo} (fora do --somente)")
                continue
            try:
                registros = ler_kpi(caminho, modelos) if tipo == "raw" else LEITORES[tipo](caminho)
            except Exception as e:
                print(f"  ! {caminho.name:52} erro na leitura: {e}")
                continue
            for r in registros:
                juntado[tipo][chave_unica(tipo, r)] = r  # o mais recente vence
            print(f"  + {caminho.name:52} {tipo:10} {len(registros):>6} linhas")

        args.saida.mkdir(parents=True, exist_ok=True)
        print()
        resumo = {}
        for tipo in sorted(tipos):
            registros = list(juntado[tipo].values())
            if not registros:
                print(f"  {NOMES[tipo]:18} nada gerado, arquivo existente preservado")
                continue
            if tipo == "raw":
                registros.sort(key=lambda r: (r["d"], r["eq"]))
            destino = args.saida / NOMES[tipo]
            destino.write_text(
                json.dumps(registros, ensure_ascii=False,
                           indent=2 if args.indentar else None,
                           separators=None if args.indentar else (",", ":")),
                encoding="utf-8",
            )
            resumo[tipo] = len(registros)
            mb = destino.stat().st_size / 1024 / 1024
            print(f"  {NOMES[tipo]:18} {len(registros):>7} registros  ({mb:.2f} MB)")

        manifesto = args.saida / "manifest.json"
        manifesto.write_text(json.dumps({
            "gerado_em": dt.datetime.now().isoformat(timespec="seconds"),
            "registros": resumo,
            "origem": [p.name for p in planilhas],
        }, ensure_ascii=False, indent=2), encoding="utf-8")

        print(f"\nPronto. Arquivos em {args.saida.resolve()}")
        if "maint" not in resumo:
            print("Lembrete: maint.json nao vem destas planilhas e ficou como estava.")
        return 0
    finally:
        shutil.rmtree(temp, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
