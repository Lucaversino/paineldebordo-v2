from pathlib import Path
from zipfile import ZipFile, BadZipFile

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "downloads" / "_TODAS"
OUT = ROOT / "kap"

OUT.mkdir(parents=True, exist_ok=True)

if not SRC.exists():
    raise SystemExit("Pasta downloads/_TODAS não existe. Rode primeiro: node 01_baixar_cartas.mjs")

for z in sorted(SRC.glob("*.zip")):
    chart = z.stem.split("_")[0]
    dest = OUT / chart
    dest.mkdir(parents=True, exist_ok=True)
    print(f"Extraindo {z.name} -> {dest}")
    try:
        with ZipFile(z) as f:
            f.extractall(dest)
    except BadZipFile:
        print(f"  AVISO: {z.name} não parece ser ZIP válido.")
print("Concluído. Arquivos KAP/BSB em:", OUT)
