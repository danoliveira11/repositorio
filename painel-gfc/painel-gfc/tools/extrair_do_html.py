#!/usr/bin/env python3
"""
extrair_do_html.py — tira os dados de dentro de um index.html antigo.

O painel original guardava tudo em quatro blocos
<script type="application/json"> colados no HTML. Este script separa
esses blocos em arquivos .json, que e o formato que o painel novo espera.

Use uma vez, para migrar. Depois disso o dia a dia e o transformar.py.

    python tools/extrair_do_html.py index_antigo.html -o data
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# id do <script> no HTML  ->  nome do arquivo de saida
BLOCOS = {
    "raw-data": "raw.json",
    "maint-data": "maint.json",
    "components-data": "components.json",
    "pm-data": "pm.json",
}


def extrair(html: str, id_script: str):
    padrao = re.compile(
        r'<script[^>]*id=["\']' + re.escape(id_script) + r'["\'][^>]*>(.*?)</script>',
        re.DOTALL,
    )
    achado = padrao.search(html)
    if not achado:
        return None
    conteudo = achado.group(1).strip()
    if not conteudo:
        return None
    return json.loads(conteudo)


def main() -> int:
    ap = argparse.ArgumentParser(description="Extrai os JSON embutidos no index.html antigo.")
    ap.add_argument("html", type=Path, help="index.html com os dados embutidos")
    ap.add_argument("-o", "--saida", type=Path, default=Path("data"), help="pasta de destino (padrao: data)")
    args = ap.parse_args()

    if not args.html.is_file():
        print(f"Arquivo nao encontrado: {args.html}", file=sys.stderr)
        return 1

    html = args.html.read_text(encoding="utf-8", errors="replace")
    args.saida.mkdir(parents=True, exist_ok=True)

    achou_algo = False
    for id_script, nome in BLOCOS.items():
        dados = extrair(html, id_script)
        if dados is None:
            print(f"  {nome:18} bloco '{id_script}' nao encontrado (pulado)")
            continue
        destino = args.saida / nome
        destino.write_text(
            json.dumps(dados, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        achou_algo = True
        mb = destino.stat().st_size / 1024 / 1024
        print(f"  {nome:18} {len(dados):>7,} registros  ({mb:.2f} MB)".replace(",", "."))

    if not achou_algo:
        print("Nenhum bloco de dados foi encontrado neste HTML.", file=sys.stderr)
        return 1

    print(f"\nPronto. Arquivos em {args.saida.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
