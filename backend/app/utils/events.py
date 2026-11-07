from __future__ import annotations

import json
from datetime import datetime, timezone


class EventEmitter:
  """Eventi JSON su stdout, una riga per evento: li legge l'app Electron."""

  def emit(self, event_type: str, payload: dict) -> None:
    body = {"type": event_type, "payload": payload, "timestamp": datetime.now(timezone.utc).isoformat()}
    print(json.dumps(body, ensure_ascii=False), flush=True)

  def log(self, level: str, message: str, detail: str | None = None) -> None:
    payload = {"level": level, "message": message}
    if detail:
      payload["detail"] = detail
    self.emit("log", payload)

  def warning(self, message: str) -> None:
    self.emit("warning", {"message": message})

  def error(self, message: str, detail: str | None = None) -> None:
    payload = {"message": message}
    if detail:
      payload["detail"] = detail
    self.emit("error", payload)
