from pathlib import Path
import json, re, shutil, subprocess, sys

TOOLS = Path(__file__).resolve().parent
PROJECT = TOOLS.parent.parent
SRC = TOOLS / "kap"
OUT = PROJECT / "public" / "cartas"
CATALOG = OUT / "catalogo.json"
INSTALLED = OUT / "installed.json"

gdal2tiles = shutil.which("gdal2tiles.py") or shutil.which("gdal2tiles")
if not gdal2tiles:
    raise SystemExit(
        "GDAL/gdal2tiles não encontrado.\n"
        "Instale GDAL no computador antes de converter KAP para tiles XYZ.\n"
        "Windows: OSGeo4W; macOS: brew install gdal; Ubuntu/Debian: sudo apt install gdal-bin python3-gdal"
    )

OUT.mkdir(parents=True, exist_ok=True)
kaps = list(SRC.rglob("*.kap")) + list(SRC.rglob("*.KAP"))
if not kaps:
    raise SystemExit("Nenhum .KAP encontrado. Rode primeiro npm run charts:download e npm run charts:extract.")

catalog = {}
if CATALOG.exists():
    try:
        data = json.loads(CATALOG.read_text(encoding="utf-8"))
        catalog = {str(c.get("number")): c for c in data.get("charts", [])}
    except Exception:
        pass

def read_header(kap: Path):
    raw = kap.read_bytes()[:240000]
    # O cabeçalho BSB é texto ASCII/Latin-1 e termina antes do raster binário.
    text = raw.decode("latin-1", errors="ignore")
    title = None
    number = None
    scale = None
    refs = []
    for line in text.splitlines():
        if line.startswith("BSB/"):
            m = re.search(r"NA=([^,\r\n]+)", line)
            if m: title = m.group(1).strip()
            m = re.search(r"NU=([^,\r\n]+)", line)
            if m: number = m.group(1).strip()
        elif line.startswith("KNP/"):
            m = re.search(r"SC=(\d+)", line)
            if m: scale = int(m.group(1))
        elif line.startswith("REF/"):
            # REF/index,x,y,lat,lon
            parts = line[4:].split(",")
            if len(parts) >= 5:
                try:
                    lat = float(parts[3]); lon = float(parts[4])
                    if -90 <= lat <= 90 and -180 <= lon <= 180:
                        refs.append((lat, lon))
                except Exception:
                    pass
    if refs:
        lats=[x[0] for x in refs]; lons=[x[1] for x in refs]
        bounds=[min(lons), min(lats), max(lons), max(lats)] # W,S,E,N
    else:
        bounds=None
    return number, title, scale, bounds

records = {}
for kap in sorted(kaps):
    folder_number = kap.parent.name
    number, title, scale, bounds = read_header(kap)
    chart = str(number or folder_number).split("_")[0]
    meta = catalog.get(chart, {})
    title = title or meta.get("title") or chart
    dest = OUT / chart
    dest.mkdir(parents=True, exist_ok=True)
    print(f"Convertendo {kap.name} -> {dest}")
    cmd = [
        gdal2tiles,
        "--xyz",
        "--webviewer=none",
        "--processes=2",
        "--resampling=bilinear",
        str(kap),
        str(dest),
    ]
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print(f"  Falha em {kap}", file=sys.stderr)
        continue
    rec = records.setdefault(chart, {
        "number": chart,
        "title": title,
        "groups": meta.get("groups", []),
        "scale": scale,
        "bounds": bounds,
        "files": [],
    })
    rec["files"].append(kap.name)
    if scale and (not rec.get("scale") or scale < rec["scale"]):
        rec["scale"] = scale
    if bounds:
        if not rec.get("bounds"):
            rec["bounds"] = bounds
        else:
            w,s,e,n = rec["bounds"]; w2,s2,e2,n2 = bounds
            rec["bounds"] = [min(w,w2), min(s,s2), max(e,e2), max(n,n2)]

from datetime import datetime, timezone
payload = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "source": "DHN/CHM - Carta Raster KAP/BSB convertida localmente para XYZ",
    "charts": sorted(records.values(), key=lambda x: (x.get("scale") or 10**12, x["number"])),
}
INSTALLED.write_text(json.dumps(payload, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
print("Concluído. Tiles em:", OUT)
print("Manifesto de cartas instaladas:", INSTALLED)
