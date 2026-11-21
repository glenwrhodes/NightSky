export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
  tz: string;
}

export const PLACES: Place[] = [
  { id: 'maunakea', name: 'Mauna Kea, Hawaii', lat: 19.8207, lon: -155.4681, tz: 'Pacific/Honolulu' },
  { id: 'atacama', name: 'Atacama Desert, Chile', lat: -22.9087, lon: -68.1997, tz: 'America/Santiago' },
  { id: 'namibrand', name: 'NamibRand, Namibia', lat: -24.95, lon: 16.0, tz: 'Africa/Windhoek' },
  { id: 'tekapo', name: 'Lake Tekapo, New Zealand', lat: -44.0047, lon: 170.4775, tz: 'Pacific/Auckland' },
  { id: 'cherrysprings', name: 'Cherry Springs, Pennsylvania', lat: 41.6626, lon: -77.8234, tz: 'America/New_York' },
  { id: 'jasper', name: 'Jasper, Alberta', lat: 52.8734, lon: -118.0814, tz: 'America/Edmonton' },
  { id: 'tromso', name: 'Tromsø, Norway', lat: 69.6492, lon: 18.9553, tz: 'Europe/Oslo' },
  { id: 'toronto', name: 'Toronto', lat: 43.6532, lon: -79.3832, tz: 'America/Toronto' },
  { id: 'london', name: 'London', lat: 51.5074, lon: -0.1278, tz: 'Europe/London' },
  { id: 'sydney', name: 'Sydney', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney' },
  { id: 'quito', name: 'Quito, on the equator', lat: -0.1807, lon: -78.4678, tz: 'America/Guayaquil' },
  { id: 'northpole', name: 'North Pole', lat: 90, lon: 0, tz: 'Etc/UTC' },
  { id: 'southpole', name: 'South Pole', lat: -90, lon: 0, tz: 'Etc/UTC' },
];

export function findPlace(id: string): Place | undefined {
  return PLACES.find((p) => p.id === id);
}
