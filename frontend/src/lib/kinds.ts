import type { BookView, ContentKind } from "@shared/contracts";
import { BookOpen, FileText, Newspaper, ScrollText, type LucideIcon } from "lucide-react";

export interface KindInfo {
  id: ContentKind;
  label: string;
  plural: string;
  icon: LucideIcon;
}

export const KINDS: KindInfo[] = [
  { id: "libro", label: "Libro", plural: "Libri", icon: BookOpen },
  { id: "articolo", label: "Articolo", plural: "Articoli", icon: FileText },
  { id: "notiziario", label: "Notiziario", plural: "Notizie", icon: Newspaper },
  { id: "documentazione", label: "Documento", plural: "Documenti", icon: ScrollText }
];

export function kindOf(book: BookView): KindInfo {
  return KINDS.find((kind) => kind.id === (book.kind ?? "libro")) ?? KINDS[0];
}
