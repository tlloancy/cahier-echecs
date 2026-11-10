function svg(body: string, tone = ''): string {
  return `<svg class="ico${tone ? ` ${tone}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}

export const icons = {
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.2-5.5"/><path d="M20 4v5h-5"/>'),
  stop: svg('<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>'),
  flip: svg('<path d="M7 8h10l-2.5-2.5"/><path d="M17 16H7l2.5 2.5"/>'),
  pin: svg('<path d="M9 10.5 14 5.5l4.5 4.5-5 5L12 16.5 7.5 21 6 19.5 10.5 15 9 10.5z"/><path d="M14 10.5 9.5 15"/>'),
  search: svg('<circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/>'),
  close: svg('<path d="M7 7l10 10M17 7 7 17"/>'),
  home: svg('<path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M10 20v-6h4v6"/>'),
  alert: svg('<path d="M12 4 3.5 19h17z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
  spark: svg('<path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>'),
  users: svg('<circle cx="9" cy="9" r="3"/><circle cx="16" cy="10" r="2.2"/><path d="M3.5 19c.6-2.6 2.8-4 5.5-4s4.9 1.4 5.5 4"/><path d="M14 15.2c1.6-.4 3.2.2 4.2 1.8"/>'),
  bullet: svg(
    '<g transform="rotate(-40 12 12)" fill="currentColor" stroke="none"><path d="M4.2 8.6h8.2c.6 0 1.1.2 1.5.6L19.2 12l-5.3 2.8c-.4.4-.9.6-1.5.6H4.2A1.4 1.4 0 0 1 2.8 14v-4a1.4 1.4 0 0 1 1.4-1.4z"/><path d="M6.4 9.2v5.6" stroke="#f4efe6" stroke-width="1.15"/></g>',
    'tc-bullet',
  ),
  blitz: svg('<path fill="currentColor" stroke="none" d="M13.2 2.6 5.4 13.2h6.1l-1.3 8.2 8.4-11.2h-6.2z"/>', 'tc-blitz'),
  rapid: svg(
    '<path d="M9.2 3.4h5.6"/><path d="M12 3.4v2"/><path d="M16.6 6.2 18 4.8"/><circle cx="12" cy="13.2" r="6.5"/><path d="M12 13.2V9.4"/><path d="M12 13.2 14.4 14.6"/>',
    'tc-rapid',
  ),
  daily: svg(
    '<circle cx="12" cy="12" r="3.15" fill="currentColor" stroke="none"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1 5.2 18.8"/>',
    'tc-daily',
  ),
  link: svg('<path d="M14 6h4v4"/><path d="M10 14 18 6"/><path d="M10 6H6v12h12v-4"/>'),
  both: svg('<circle cx="12" cy="12" r="7"/><path d="M12 5a7 7 0 0 0 0 14z" fill="currentColor" stroke="none"/>'),
  rows: svg('<path d="M5 7h14M5 12h14M5 17h14"/>'),
  pawn: '<svg class="ico" viewBox="0 0 45 45" aria-hidden="true"><circle cx="22.5" cy="14" r="5.6" fill="currentColor"/><path d="M15.2 34c2-7.5 3.2-10.5 7.3-10.5s5.3 3 7.3 10.5z" fill="currentColor"/><rect x="13" y="33.2" width="19" height="3.6" rx="1" fill="currentColor"/></svg>',
  globe: svg('<circle cx="12" cy="12" r="8"/><path d="M4 12h16"/><path d="M12 4c2.4 2.2 3.6 5 3.6 8s-1.2 5.8-3.6 8c-2.4-2.2-3.6-5-3.6-8s1.2-5.8 3.6-8z"/>'),
  flag: svg('<path d="M6.5 20V4"/><path class="flag-fly" d="M6.5 5.2h9.4l-1.8 2.7 1.8 2.7H6.5z" fill="#fffdf9"/>'),
  hourglass: svg('<path d="M7.5 4h9M7.5 20h9"/><path d="M8.2 4.2c0 3.5 3.8 4.3 3.8 7.8s-3.8 4.3-3.8 7.8M15.8 4.2c0 3.5-3.8 4.3-3.8 7.8s3.8 4.3 3.8 7.8"/>'),
  trend: svg('<path d="M4 6.5 10 12.5l3-3 7 7"/><path d="M14 16.5h6v-6"/>'),
  chevron: svg('<path d="m9 6 6 6-6 6"/>'),
  meter: svg('<rect x="3" y="10" width="18" height="4.2" rx="2"/><rect x="3" y="10" width="8" height="4.2" rx="2" fill="currentColor" stroke="none"/>'),
  eval: '<svg class="ico eval" viewBox="0 0 24 24" aria-hidden="true"><rect x="7.5" y="2.5" width="9" height="19" rx="1.5" fill="#f4efe6" stroke="#1c1612" stroke-width="1.5"/><rect x="9" y="12" width="6" height="8.2" fill="#1c1612"/></svg>',
  arrow: svg('<path d="M4.5 12h13"/><path d="m12.5 6.5 5.5 5.5-5.5 5.5"/>'),
  out: svg('<path d="M12 14V4"/><path d="m8 7 4-4 4 4"/><path d="M5 14v5h14v-5"/>'),
  in: svg('<path d="M12 4v10"/><path d="m8 11 4 4 4-4"/><path d="M5 14v5h14v-5"/>'),
  play: svg('<path fill="currentColor" stroke="none" d="M8 5.8v12.4l10.2-6.2z"/>'),
}
