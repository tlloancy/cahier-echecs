function svg(body: string): string {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}

export const icons = {
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.2-5.5"/><path d="M20 4v5h-5"/>'),
  download: svg('<path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/>'),
  stop: svg('<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>'),
  flip: svg('<path d="M7 8h10l-2.5-2.5"/><path d="M17 16H7l2.5 2.5"/>'),
  pin: svg('<path d="M9 10.5 14 5.5l4.5 4.5-5 5L12 16.5 7.5 21 6 19.5 10.5 15 9 10.5z"/><path d="M14 10.5 9.5 15"/>'),
  search: svg('<circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/>'),
  close: svg('<path d="M7 7l10 10M17 7 7 17"/>'),
  home: svg('<path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M10 20v-6h4v6"/>'),
  alert: svg('<path d="M12 4 3.5 19h17z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
  spark: svg('<path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>'),
  users: svg('<circle cx="9" cy="9" r="3"/><circle cx="16" cy="10" r="2.2"/><path d="M3.5 19c.6-2.6 2.8-4 5.5-4s4.9 1.4 5.5 4"/><path d="M14 15.2c1.6-.4 3.2.2 4.2 1.8"/>'),
  bolt: svg('<path d="M13 3 6 13h6l-1 8 7-10h-6z"/>'),
  flame: svg('<path d="M12 3s4 4 4 8a4 4 0 1 1-8 0c0-1.5.8-3 2-4 0 2 1.2 2.8 2 2.8C12 8 12 5 12 3z"/>'),
  clock: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>'),
  calendar: svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'),
  link: svg('<path d="M14 6h4v4"/><path d="M10 14 18 6"/><path d="M10 6H6v12h12v-4"/>'),
  both: svg('<circle cx="12" cy="12" r="7"/><path d="M12 5a7 7 0 0 0 0 14z" fill="currentColor" stroke="none"/>'),
  rows: svg('<path d="M5 7h14M5 12h14M5 17h14"/>'),
}
