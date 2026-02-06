import { useEffect, useState } from "react";

export default function TimeBanner() {
  const [display, setDisplay] = useState<string>("");

  useEffect(() => {
    // Fetch server time once on mount
    (async () => {
      try {
        const res = await fetch("/api/server-time");
        if (res.ok) {
          const data = await res.json();
          setDisplay(`${data.locale} (${data.timezone})`);
        }
      } catch {
        // ignore and fallback to client time
      }
    })();

    // Update client time every second as fallback
    const id = setInterval(() => {
      setDisplay((prev) => {
        // Only use client time if server time hasn't loaded yet
        if (!prev || prev === "") return new Date().toLocaleString();
        return prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-full bg-muted text-muted-foreground px-4 py-2 text-sm flex justify-center">
      <span>Current time: {display}</span>
    </div>
  );
}
