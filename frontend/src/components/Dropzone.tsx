import { useState, type DragEvent } from "react";
import { FileAudio, FileUp, RotateCcw } from "lucide-react";
import type { InputFileMeta } from "@shared/contracts";
import { formatBytes, metaFromPath } from "@/lib/defaults";

interface DropzoneProps {
  file: InputFileMeta | null;
  isBusy: boolean;
  isPickingFile: boolean;
  canConvert: boolean;
  canReset: boolean;
  onStart: () => void;
  onReset: () => void;
  onPick: () => void;
  onFileDrop: (file: InputFileMeta, source: "picker" | "drop") => void;
  onSelectionError: (message: string) => void;
}

export function Dropzone({
  file,
  isBusy,
  isPickingFile,
  canConvert,
  canReset,
  onStart,
  onReset,
  onPick,
  onFileDrop,
  onSelectionError
}: DropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);

    const dropped = event.dataTransfer.files?.[0] as (File & { path?: string }) | undefined;
    console.log("[grillo] drop event", {
      fileCount: event.dataTransfer.files?.length ?? 0,
      types: Array.from(event.dataTransfer.types ?? []),
      droppedName: dropped?.name,
      droppedSize: dropped?.size,
      droppedType: dropped?.type,
      droppedPath: dropped?.path,
      webkitRelativePath: dropped?.webkitRelativePath
    });

    if (!dropped) {
      onSelectionError("Nessun file rilevato nel trascinamento.");
      return;
    }

    const filePath = dropped.path;

    if (!filePath) {
      console.warn("[grillo] dropped file has no direct path, importing via temp cache");

      try {
        const bytes = await dropped.arrayBuffer();
        const imported = await window.grillo.importFileBuffer(dropped.name, bytes);
        console.log("[grillo] dropped file imported via temp cache", imported);
        onFileDrop(imported, "drop");
        return;
      } catch (error) {
        console.error("[grillo] dropped file temp import failed", error);
        onSelectionError("Non sono riuscito a importare il file trascinato.");
        return;
      }
    }

    const meta = metaFromPath(filePath, dropped.size);
    console.log("[grillo] dropped file resolved from direct path", meta);

    if (meta.type === "unknown") {
      onSelectionError("Formato non supportato. Usa PDF, EPUB, TXT o MD.");
      return;
    }

    onFileDrop(meta, "drop");
  }

  function openPicker() {
    void onPick();
  }

  return (
    <section
      className={`dropzone-minimal ${isBusy ? "is-busy" : ""} ${isDragOver ? "is-dragging" : ""}`}
      onDrop={handleDrop}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
    >
      <div className="section-head">
        <span>File</span>
        <span>PDF / EPUB / TXT</span>
      </div>

      <div className="dropzone-body">
        <div className="dropzone-surface">
          <div
            className="dropzone-target"
            onClick={openPicker}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openPicker();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="dropzone-copy">
              <strong>Trascina qui</strong>
              <p>PDF, EPUB o testo. Puoi anche cliccare l'area tratteggiata.</p>
              <span className="dropzone-feedback">
                {isPickingFile ? "Selettore file aperto..." : "Area drag & drop attiva"}
              </span>
            </div>
          </div>

          <div className="dropzone-actions">
            <div className="action-cluster">
              <button
                type="button"
                className="button"
                onClick={openPicker}
                disabled={isBusy || isPickingFile}
              >
                <FileUp className="h-4 w-4" />
                {isPickingFile ? "Apertura..." : "Scegli file"}
              </button>
              <button type="button" className="button button-ghost" onClick={onStart} disabled={!canConvert}>
                Converti
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={onReset}
                disabled={!canReset || isBusy}
              >
                <RotateCcw className="h-4 w-4" />
                Pulisci
              </button>
            </div>

            <p className="dropzone-actions-note">
              Scegli un file oppure rilascialo nella zona tratteggiata.
            </p>
          </div>
        </div>
      </div>

      <div className="file-summary">
        {file ? (
          <>
            <div className="file-summary-title">
              <FileAudio className="h-4 w-4" />
              <strong>{file.name}</strong>
            </div>
            <div className="file-status-row">
              <span className="file-status-badge">File pronto</span>
            </div>
            <p>
              {file.type.toUpperCase()} / {formatBytes(file.size)}
            </p>
            <code>{file.path}</code>
          </>
        ) : (
          <>
            <strong>Nessun file selezionato.</strong>
            <p>Quando scegli o trascini un file, qui vedrai nome, formato e percorso locale.</p>
          </>
        )}
      </div>
    </section>
  );
}
