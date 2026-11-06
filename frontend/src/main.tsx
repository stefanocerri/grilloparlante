import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/index.css";

async function start() {
  // Fuori da Electron (solo anteprima in sviluppo) usa un ponte simulato.
  if (!window.grillo && import.meta.env.DEV && __DEMO_MODE__) {
    const { installDemoBridge } = await import("./lib/demoBridge");
    await installDemoBridge();
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void start();
