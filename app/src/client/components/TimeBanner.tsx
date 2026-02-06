import { useEffect, useState } from "react";

const PST_FORMATTER = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'full',
  timeStyle: 'long',
  timeZone: 'America/Los_Angeles',
});

function getPstTime(): string {
  return PST_FORMATTER.format(new Date());
}

export default function TimeBanner() {
  const [display, setDisplay] = useState<string>(getPstTime);

  useEffect(() => {
    const id = setInterval(() => setDisplay(getPstTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-full bg-muted text-muted-foreground px-4 py-2 text-sm flex justify-center">
      <span>Current time: {display}</span>
    </div>
  );
}
