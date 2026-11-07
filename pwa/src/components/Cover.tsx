import { useEffect, useState } from "react";
import type { Connection } from "../lib/config";
import { coverUrl, RemoteBook } from "../lib/library";

export function useCover(connection: Connection, book: RemoteBook | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (book) void coverUrl(connection, book).then((value) => alive && setUrl(value)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [connection, book?.id, book?.coverSize]);
  return url;
}

export function Cover({ url, title, className = "" }: { url: string | null; title: string; className?: string }) {
  if (url) return <img src={url} alt="" className={`object-cover ${className}`} />;
  return (
    <div className={`flex items-end bg-gradient-to-br from-[#2a2420] to-[#15120f] p-3 ${className}`}>
      <span className="line-clamp-4 text-left text-sm font-semibold leading-tight text-[#f4f1eb]">{title}</span>
    </div>
  );
}
