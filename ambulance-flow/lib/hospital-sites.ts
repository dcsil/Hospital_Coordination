export type Point = { lat: number; lng: number };
export const HOSPITAL_SITES = [
  { id: 'tgh', name: 'Toronto General', short: 'TGH', lat: 43.659, lng: -79.388, address: '200 Elizabeth Street', source: 'https://www.uhn.ca/corporate/Directions/' },
  { id: 'twh', name: 'Toronto Western', short: 'TWH', lat: 43.653, lng: -79.406, address: '399 Bathurst Street', source: 'https://www.uhn.ca/corporate/Directions/' },
  { id: 'mgh', name: 'Michael Garron', short: 'MGH', lat: 43.690, lng: -79.326, address: '825 Coxwell Avenue', source: 'https://www.tehn.ca/' },
  { id: 'sun', name: 'Sunnybrook', short: 'SUN', lat: 43.722, lng: -79.377, address: '2075 Bayview Avenue', source: 'https://sunnybrook.ca/locations/' },
  { id: 'sjh', name: 'St. Joseph’s', short: 'SJH', lat: 43.640, lng: -79.450, address: '30 The Queensway', source: 'https://www.ontario.ca/page/general-hospital-locations' },
];
