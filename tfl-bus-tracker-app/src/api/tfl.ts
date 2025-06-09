const BASE = "https://api.tfl.gov.uk";
const KEY = "f17d0725d1654338ab02a361fe41abad";

export async function searchStops(query: string) {
  const res = await fetch(`${BASE}/StopPoint/Search/${encodeURIComponent(query)}?app_key=${KEY}`);
  return res.json();
}
export async function getArrivals(stopId: string) {
  const res = await fetch(`${BASE}/StopPoint/${stopId}/Arrivals?app_key=${KEY}`);
  return res.json();
}
export async function getNearbyStops(lat: number, lon: number) {
  const res = await fetch(`${BASE}/StopPoint?lat=${lat}&lon=${lon}&stopTypes=NaptanPublicBusCoachTram&app_key=${KEY}`);
  return res.json();
}
export async function getServiceStatus() {
  const res = await fetch(`${BASE}/Line/Mode/bus/Status?app_key=${KEY}`);
  return res.json();
}
export async function searchVehicleArrivals(reg: string) {
  const res = await fetch(`${BASE}/Vehicle/${reg}/Arrivals?app_key=${KEY}`);
  return res.json();
}
