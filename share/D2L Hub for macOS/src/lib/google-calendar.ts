interface GoogleEventInput {
  title: string;
  location?: string | null;
  startsAt: string;
  endsAt: string;
}

/** Google's template links want UTC in the compact `20261023T183000Z` form. */
function stamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * A Google Calendar "new event" page with the fields filled in. Opening it is
 * only a hand-off: the user still presses Save inside Google.
 */
export function googleCalendarUrl(input: GoogleEventInput): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${stamp(input.startsAt)}/${stamp(input.endsAt)}`,
  });
  if (input.location) params.set('location', input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
