from __future__ import annotations

import json
from datetime import datetime, timezone


class EventEmitter:
  def emit(self, event_type: str, payload: dict) -> None:
    body = {
      "type": event_type,
      "payload": payload,
      "timestamp": datetime.now(timezone.utc).isoformat()
    }
    print(json.dumps(body, ensure_ascii=False), flush=True)

  def stage(self, stage: str, label: str, message: str) -> None:
    self.emit(
      "stage",
      {
        "stage": stage,
        "label": label,
        "message": message
      }
    )

  def progress(self, stage: str, progress: float, label: str | None = None) -> None:
    payload = {
      "stage": stage,
      "progress": round(max(0.0, min(progress, 1.0)), 4)
    }

    if label:
      payload["label"] = label

    self.emit("progress", payload)

  def stats(self, payload: dict) -> None:
    self.emit("stats", payload)

  def log(self, level: str, message: str, detail: str | None = None) -> None:
    payload = {
      "level": level,
      "message": message
    }

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
