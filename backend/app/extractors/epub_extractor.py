from __future__ import annotations

import posixpath
import re
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from app.chaptering.toc_detector import sections_from_marks
from app.jobs.models import ExtractedDocument
from app.utils.files import compact_whitespace


MARK_PREFIX = "\u2063GRILLOMARK"
MARK_PATTERN = re.compile("\u2063GRILLOMARK(\\d+)\u2063")
BLOCK_TAGS = [
  "p", "div", "section", "article", "blockquote", "li", "tr",
  "h1", "h2", "h3", "h4", "h5", "h6", "pre", "dd", "dt", "figcaption"
]
SKIP_TAGS = ["script", "style", "head", "title", "nav"]


def _flatten_toc(items: list, sink: list[tuple[str, str]]) -> None:
  """Collect (title, href) pairs from the ebooklib TOC tree, in reading order."""
  for item in items:
    if isinstance(item, (tuple, list)) and item:
      section = item[0]
      label = getattr(section, "title", None)
      href = getattr(section, "href", None) or getattr(section, "file_name", None) or ""
      if label:
        sink.append((str(label), str(href)))
      if len(item) > 1 and isinstance(item[1], (list, tuple)):
        _flatten_toc(list(item[1]), sink)
      continue

    label = getattr(item, "title", None)
    href = getattr(item, "href", None) or getattr(item, "file_name", None) or ""
    if label:
      sink.append((str(label), str(href)))


def _normalize_href(href: str) -> tuple[str, str]:
  path, _, fragment = unquote(href or "").partition("#")
  return posixpath.normpath(path).lstrip("./") if path else "", fragment


def _match_document(path: str, documents: dict[str, Any]) -> str | None:
  if not path:
    return None
  if path in documents:
    return path
  # TOC hrefs are relative to the NCX/nav location, manifest names to the OPF:
  # fall back to suffix / basename matching.
  for name in documents:
    if name.endswith("/" + path) or path.endswith("/" + name):
      return name
  base = posixpath.basename(path)
  candidates = [name for name in documents if posixpath.basename(name) == base]
  return candidates[0] if len(candidates) == 1 else None


def _spine_documents(book: Any, item_document: int, item_navigation: int) -> list[Any]:
  from ebooklib import epub

  ordered: list[Any] = []
  seen: set[str] = set()

  for entry in book.spine:
    idref = entry[0] if isinstance(entry, (tuple, list)) else entry
    item = book.get_item_with_id(idref)
    if item is None or isinstance(item, epub.EpubNav):
      continue
    if item.get_type() != item_document:
      continue
    if item.file_name in seen:
      continue
    seen.add(item.file_name)
    ordered.append(item)

  if not ordered:  # malformed spine: keep the old manifest order as fallback
    for item in book.get_items():
      if isinstance(item, epub.EpubNav) or item.get_type() in (item_navigation,):
        continue
      if item.get_type() == item_document and item.file_name not in seen:
        seen.add(item.file_name)
        ordered.append(item)

  return ordered


def _html_to_text(soup: Any) -> str:
  for tag in soup.find_all(SKIP_TAGS):
    tag.decompose()
  for br in soup.find_all("br"):
    br.replace_with("\n")
  for tag in soup.find_all(BLOCK_TAGS):
    tag.insert_before("\n\n")
    tag.insert_after("\n\n")

  body = soup.body or soup
  raw = body.get_text()
  # Inside a paragraph, newlines are only source formatting: turn them into spaces.
  paragraphs = [re.sub(r"\s+", " ", block).strip() for block in re.split(r"\n\s*\n", raw)]
  return "\n\n".join(block for block in paragraphs if block)


def _guess_extension(item: Any) -> str | None:
  file_name = getattr(item, "file_name", "") or getattr(item, "get_name", lambda: "")()
  suffix = Path(str(file_name)).suffix.lower().lstrip(".")
  if suffix:
    return suffix

  media_type = getattr(item, "media_type", "") or ""
  if "jpeg" in media_type or "jpg" in media_type:
    return "jpg"
  if "png" in media_type:
    return "png"
  if "webp" in media_type:
    return "webp"

  return None


def _extract_cover(book: Any) -> tuple[bytes | None, str | None]:
  cover_metadata = book.get_metadata("OPF", "cover")
  if cover_metadata:
    _, attributes = cover_metadata[0]
    cover_id = attributes.get("content")
    if cover_id:
      item = book.get_item_with_id(cover_id)
      if item:
        return item.get_content(), _guess_extension(item)

  for item in book.get_items():
    file_name = str(getattr(item, "file_name", "") or "").lower()
    item_id = str(getattr(item, "id", "") or getattr(item, "get_id", lambda: "")()).lower()
    media_type = str(getattr(item, "media_type", "") or "").lower()

    if "image" not in media_type:
      continue

    if "cover" in file_name or "cover" in item_id:
      return item.get_content(), _guess_extension(item)

  return None, None


def extract_epub(file_path: str) -> ExtractedDocument:
  try:
    from bs4 import BeautifulSoup
    from ebooklib import ITEM_DOCUMENT, ITEM_NAVIGATION, epub
  except ImportError as error:  # pragma: no cover - dependency availability
    raise RuntimeError(
      "Mancano le dipendenze Python 'ebooklib' e/o 'beautifulsoup4'."
    ) from error

  book = epub.read_epub(file_path)
  documents = _spine_documents(book, ITEM_DOCUMENT, ITEM_NAVIGATION)
  by_name = {item.file_name: item for item in documents}

  toc_pairs: list[tuple[str, str]] = []
  _flatten_toc(list(book.toc), toc_pairs)

  # Attach every TOC entry to the spine document (and anchor) it points to.
  marks_by_doc: dict[str, list[tuple[int, str]]] = {}
  for mark_id, (_, href) in enumerate(toc_pairs):
    path, fragment = _normalize_href(href)
    target = _match_document(path, by_name)
    if target:
      marks_by_doc.setdefault(target, []).append((mark_id, fragment))

  text_blocks: list[str] = []
  for item in documents:
    soup = BeautifulSoup(item.get_content(), "html.parser")
    leading: list[str] = []
    for mark_id, fragment in marks_by_doc.get(item.file_name, []):
      sentinel = f"{MARK_PREFIX}{mark_id}\u2063"
      anchor = soup.find(id=fragment) if fragment else None
      if anchor is not None:
        anchor.insert_before(f"\n\n{sentinel}")
      else:
        leading.append(sentinel)
    content = _html_to_text(soup)
    if leading:
      content = "".join(leading) + ("\n\n" + content if content else "")
    if content.strip():
      text_blocks.append(content)

  joined = compact_whitespace("\n\n".join(text_blocks))

  # Resolve sentinels into character offsets and strip them from the text.
  toc_marks: list[tuple[int, str]] = []
  parts: list[str] = []
  cursor = 0
  length = 0
  for match in MARK_PATTERN.finditer(joined):
    piece = joined[cursor:match.start()]
    parts.append(piece)
    length += len(piece)
    toc_marks.append((length, toc_pairs[int(match.group(1))][0]))
    cursor = match.end()
  parts.append(joined[cursor:])
  text = "".join(parts)
  stripped_left = len(text) - len(text.lstrip())
  text = text.strip()
  toc_marks = [
    (max(0, min(len(text), offset - stripped_left)), title) for offset, title in toc_marks
  ]

  toc = [title for title, _ in toc_pairs]
  cover_bytes, cover_extension = _extract_cover(book)

  title = ""
  if book.get_metadata("DC", "title"):
    title = str(book.get_metadata("DC", "title")[0][0]).strip()
  author = ""
  if book.get_metadata("DC", "creator"):
    author = str(book.get_metadata("DC", "creator")[0][0]).strip()

  return ExtractedDocument(
    title=title or Path(file_path).stem.replace("_", " "),
    author=author,
    file_type="epub",
    text=text,
    toc=toc,
    toc_marks=toc_marks,
    sections=sections_from_marks(text, toc_marks),
    metadata={"toc_entries": str(len(toc))},
    cover_bytes=cover_bytes,
    cover_extension=cover_extension
  )
