"use client";

import { useRef, useState } from "react";
import { Download, FileJson, RefreshCw, ShieldCheck, Upload } from "lucide-react";

type Preview = {
  counts?: {
    boats: number;
    species: number;
    trips: number;
    sets: number;
    catches: number;
    syntheticCatches: number;
    total: number;
  };
  issues?: string[];
  valid?: boolean;
};

export default function BackupImporter({ onImported }: { onImported?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [backup, setBackup] = useState<any>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  async function chooseFile(file?: File) {
    setMessage("");
    setResult(null);
    setPreview(null);
    setBackup(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setMessage("Selecione um arquivo .json.");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      setBackup(parsed);
      setFileName(file.name);
      setBusy(true);
      const response = await fetch("/api/import-backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "preview", backup: parsed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível analisar o arquivo.");
      setPreview(data);
      setMessage(data.issues?.length ? "O backup foi lido, mas há referências que precisam ser corrigidas." : "Backup pronto para importar.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "JSON inválido.");
    } finally {
      setBusy(false);
    }
  }

  async function importBackup() {
    if (!backup || !preview?.valid) return;
    setBusy(true);
    setMessage("Importando dados para sua conta no Supabase...");
    setResult(null);
    try {
      const response = await fetch("/api/import-backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "import", backup }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível importar o backup.");
      setResult(data.summary);
      setMessage("Importação concluída. O painel já pode recarregar os dados importados.");
      onImported?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao importar o backup.");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const template = {
      sistema: "PAINEL DE BORDO",
      versaoBackup: 1,
      boats: [{ id: 1, name: "Astro Sol I", registration: "EXEMPLO-001", homePort: "Porto Belo" }],
      species: [{ id: 1, commonName: "Corvina", code: "CORVINA" }],
      trips: [{ id: 1, name: "Viagem Setembro 2026", boatId: 1, departureDate: "2026-08-26T04:00:00-03:00", expectedReturnDate: "2026-09-12T18:00:00-03:00", returnDate: "2026-09-12T18:00:00-03:00", departurePort: "Porto Belo", returnPort: "Porto Belo", captain: "Mestre", crewCount: 6, targetKg: 30000, primarySpeciesId: 1, status: "FINISHED" }],
      sets: [{ id: 1, tripId: 1, setNumber: 1, startedAt: "2026-08-26T04:24:00-03:00", finishedAt: "2026-08-26T19:20:00-03:00", depthMeters: 62, startLatitude: -25.016833, startLongitude: -46.605683, endLatitude: -25.285133, endLongitude: -46.744033, total: 1070.336 }],
      catches: [],
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-backup-painel-de-bordo.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const c = preview?.counts;
  return (
    <section className="backup-importer">
      <div className="backup-head">
        <span className="backup-icon"><FileJson /></span>
        <div>
          <small>MIGRAÇÃO DE DADOS</small>
          <h3>Importar backup JSON</h3>
          <p>Transfira embarcações, espécies, viagens, largadas e capturas do painel antigo para sua conta atual do Supabase.</p>
        </div>
      </div>

      <div className="backup-security"><ShieldCheck /><span>Os IDs antigos são remapeados para novos IDs. O importador sempre grava os registros na conta que está logada e não aceita um ownerId vindo do arquivo.</span></div>

      <input ref={inputRef} className="backup-file" type="file" accept="application/json,.json" onChange={(e) => chooseFile(e.currentTarget.files?.[0])} />
      <div className="backup-actions">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}><Upload /> {fileName ? "Escolher outro JSON" : "Selecionar backup JSON"}</button>
        <button type="button" className="backup-secondary" onClick={downloadTemplate}><Download /> Baixar modelo JSON</button>
      </div>

      {fileName && <div className="backup-file-name"><FileJson /> <span>{fileName}</span></div>}

      {c && (
        <div className="backup-preview">
          <div><small>Embarcações</small><b>{c.boats}</b></div>
          <div><small>Espécies</small><b>{c.species}</b></div>
          <div><small>Viagens</small><b>{c.trips}</b></div>
          <div><small>Largadas</small><b>{c.sets}</b></div>
          <div><small>Capturas</small><b>{c.catches + c.syntheticCatches}</b></div>
        </div>
      )}

      {!!preview?.issues?.length && (
        <div className="backup-issues">
          <b>O arquivo precisa de correção antes da importação:</b>
          {preview.issues.slice(0, 8).map((issue, i) => <p key={i}>• {issue}</p>)}
        </div>
      )}

      {message && <p className={preview?.valid || result ? "backup-message ok" : "backup-message"}>{message}</p>}

      {result && (
        <div className="backup-result">
          <b>Resumo da importação</b>
          <p>Embarcações: {result.boats.imported} novas / {result.boats.reused} já existentes</p>
          <p>Espécies: {result.species.imported} novas / {result.species.reused} já existentes</p>
          <p>Viagens: {result.trips.imported} novas / {result.trips.reused} já existentes</p>
          <p>Largadas: {result.sets.imported} novas / {result.sets.reused} já existentes</p>
          <p>Capturas: {result.catches.imported} novas ({result.catches.synthesized} criadas a partir do total das largadas)</p>
        </div>
      )}

      <button className="backup-import" type="button" disabled={busy || !preview?.valid} onClick={importBackup}>
        {busy ? <RefreshCw className="spin" /> : <Upload />}
        {busy ? "Processando..." : "Importar para o Supabase"}
      </button>
      <small className="backup-note">O processo trabalha em modo de mesclagem: registros já reconhecidos são reutilizados para reduzir o risco de duplicação se o mesmo backup for enviado novamente.</small>
    </section>
  );
}
