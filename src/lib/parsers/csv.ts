export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0

  const pushCell = () => {
    cur.push(cell)
    cell = ''
  }
  const pushRow = () => {
    pushCell()
    if (cur.length > 0 && !(cur.length === 1 && cur[0] === '')) rows.push(cur)
    cur = []
  }

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',' || c === ';' || c === '\t') {
      pushCell()
      i++
      continue
    }
    if (c === '\r') {
      if (text[i + 1] === '\n') i++
      pushRow()
      i++
      continue
    }
    if (c === '\n') {
      pushRow()
      i++
      continue
    }
    cell += c
    i++
  }
  if (cell.length > 0 || cur.length > 0) pushRow()
  return rows
}

const COLUMN_ALIASES: Record<string, string[]> = {
  name: ['nombre', 'name', 'voluntario', 'persona'],
  phone: ['telefono', 'teléfono', 'phone', 'movil', 'móvil', 'tel'],
  email: ['email', 'correo', 'e-mail', 'mail'],
  role: ['rol', 'role', 'puesto', 'función', 'funcion'],
  shirtSize: ['talla', 'size', 'camiseta'],
  notes: ['notas', 'notes', 'observaciones', 'comentarios'],
  track: ['track', 'recorrido', 'trackid', 'track id', 'track_id', 'carrera', 'circuito'],
  km: ['km', 'kilometro', 'kilómetro', 'pk', 'punto km', 'distancia'],
  pointName: ['punto', 'nombre del punto', 'lugar', 'nombre punto'],
  pointType: ['tipo', 'tipo punto', 'tipo de punto'],
}

function normalize(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export type CsvVolunteerRow = {
  name: string
  phone: string | null
  email: string | null
  role: string
  shirtSize: string | null
  notes: string
  track: string | null
  km: number | null
  pointName: string | null
  pointType: string | null
  rowNumber: number
}

function parseLooseNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalised = trimmed.replace(',', '.').replace(/[^\d.\-]/g, '')
  if (!normalised) return null
  const n = Number(normalised)
  return Number.isFinite(n) ? n : null
}

export function parseVolunteersCsv(text: string): CsvVolunteerRow[] {
  const rows = parseCsv(text)
  if (rows.length < 1) return []
  const header = rows[0]?.map((h) => normalize(h)) ?? []

  const col = (field: keyof typeof COLUMN_ALIASES): number => {
    const aliases = COLUMN_ALIASES[field]!.map(normalize)
    for (let i = 0; i < header.length; i++) {
      if (aliases.includes(header[i] ?? '')) return i
    }
    return -1
  }

  const idx = {
    name: col('name'),
    phone: col('phone'),
    email: col('email'),
    role: col('role'),
    shirtSize: col('shirtSize'),
    notes: col('notes'),
    track: col('track'),
    km: col('km'),
    pointName: col('pointName'),
    pointType: col('pointType'),
  }

  const out: CsvVolunteerRow[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const pick = (k: number) => (k >= 0 ? (row[k] ?? '').trim() : '')
    const name = pick(idx.name)
    if (!name) continue
    out.push({
      name,
      phone: pick(idx.phone) || null,
      email: pick(idx.email) || null,
      role: pick(idx.role),
      shirtSize: pick(idx.shirtSize) || null,
      notes: pick(idx.notes),
      track: pick(idx.track) || null,
      km: idx.km >= 0 ? parseLooseNumber(pick(idx.km)) : null,
      pointName: pick(idx.pointName) || null,
      pointType: pick(idx.pointType) || null,
      rowNumber: r + 1,
    })
  }
  return out
}
