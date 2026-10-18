function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export interface ApartmentTowerConfig {
  tower: string;
  floors: number;
  unitsPerFloor: number;
}

export interface PlotConfig {
  prefix: string;
  count: number;
  startNumber: number;
}

export type InventoryRequest =
  | { style: 'apartment'; towers: ApartmentTowerConfig[] }
  | { style: 'plot'; plot: PlotConfig };

/** Generates unit_no values exactly matching the schema's seed-data conventions:
 *  apartment: TOWER-FF-UU (zero-padded 2 digits each)
 *  plot:      PREFIX-### (zero-padded 3 digits)
 */
export function generateUnitNumbers(req: InventoryRequest): Array<{ unitNo: string; tower: string | null; floor: number | null }> {
  const units: Array<{ unitNo: string; tower: string | null; floor: number | null }> = [];
  if (req.style === 'apartment') {
    for (const t of req.towers) {
      for (let floor = 1; floor <= t.floors; floor++) {
        for (let u = 1; u <= t.unitsPerFloor; u++) {
          units.push({ unitNo: `${t.tower}-${pad(floor, 2)}-${pad(u, 2)}`, tower: t.tower, floor });
        }
      }
    }
  } else {
    for (let i = 0; i < req.plot.count; i++) {
      const number = req.plot.startNumber + i;
      units.push({ unitNo: `${req.plot.prefix}-${pad(number, 3)}`, tower: null, floor: null });
    }
  }
  return units;
}
