import { app, Menu, nativeImage, Tray } from "electron";
import path from "node:path";
import type { AppSnapshot } from "../shared/contracts";
import { hidePopover, popoverVisible, showPopover } from "./popover";

let tray: Tray | null = null;
let lastTitle = "";

function iconPath() {
  return path.join(app.getAppPath(), "assets", "trayTemplate.png");
}

export function createTray(handlers: { onFilesDropped: (files: string[]) => void; onQuit: () => void }): Tray {
  if (tray) return tray;
  const image = nativeImage.createFromPath(iconPath());
  image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip("Grillo parlante");

  tray.on("click", () => {
    if (popoverVisible()) {
      hidePopover();
      return;
    }
    showPopover(tray?.getBounds());
  });

  // Trascinare un PDF/EPUB/JSON sull'icona lo apre direttamente nel pannello.
  tray.on("drop-files", (_event, files) => {
    showPopover(tray?.getBounds());
    handlers.onFilesDropped(files);
  });

  tray.on("right-click", () => {
    tray?.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: "Apri Grillo parlante", click: () => showPopover(tray?.getBounds()) },
        { type: "separator" },
        { label: "Esci", click: handlers.onQuit }
      ])
    );
  });

  return tray;
}

/** Accanto all'icona: la percentuale mentre converte, niente quando e fermo. */
export function updateTray(snapshot: AppSnapshot) {
  if (!tray) return;
  const { running, progress, importing } = snapshot.queue;
  let title = "";
  let tooltip = "Grillo parlante";

  if (running) {
    const percent = Math.round((progress?.progress ?? 0) * 100);
    const book = snapshot.books.find((item) => item.id === running.bookId);
    title = ` ${percent}%`;
    tooltip = `${book?.title ?? "Conversione"} — ${progress?.label ?? "avvio…"}`;
  } else if (importing) {
    title = " …";
    tooltip = `Importo ${importing}`;
  } else {
    const uploading = snapshot.channels.find((channel) => channel.sync.state === "uploading");
    if (uploading) {
      title = " ↑";
      tooltip = `${uploading.name}: ${uploading.sync.message}`;
    }
  }

  if (title !== lastTitle) {
    lastTitle = title;
    tray.setTitle(title, { fontType: "monospacedDigit" });
  }
  tray.setToolTip(tooltip);
}
