// Hostel layout is data-driven (hostels -> floors -> rooms). These are only the format rules.

/** Room code = 2-letter floor code + 3-digit room number, e.g. "CS240". */
export const ROOM_CODE_PATTERN = /^[A-Z]{2}\d{3}$/;
export const FLOOR_CODE_PATTERN = /^[A-Z]{2}$/;

export function roomCodeFor(floorCode: string, number: number): string {
  return `${floorCode}${String(number).padStart(3, '0')}`;
}

/** Profile display: "West CS240". */
export function roomDisplay(hostelName: string, roomCode: string): string {
  return `${hostelName} ${roomCode}`;
}
