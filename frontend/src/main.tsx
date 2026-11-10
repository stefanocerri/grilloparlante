import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { LibraryWindow } from "./components/LibraryWindow";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.hash.startsWith("#library") ? <LibraryWindow /> : <App />}
  </React.StrictMode>
);
