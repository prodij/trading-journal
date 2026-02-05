import { NextResponse } from 'next/server';

export async function GET() {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localeStr = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(now);

  return NextResponse.json({
    iso: now.toISOString(),
    epochMs: now.getTime(),
    timezone: tz,
    tzOffsetMinutes: -now.getTimezoneOffset(),
    locale: localeStr,
  });
}
