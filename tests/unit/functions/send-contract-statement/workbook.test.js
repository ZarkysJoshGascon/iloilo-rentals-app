// @vitest-environment node
// The owner's Excel statement: receipt photos on the Receipts sheet, and the
// links to them from each expense.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { buildStatementWorkbook, computeMonth, computeTotals, imageInfo } from '../../../../supabase/functions/send-contract-statement/workbook.js'

const split = { ownerSplitPct: 75, companySplitPct: 25 }
const PNG = new Uint8Array(readFileSync('public/logo-96.png'))

// The start of a JPEG: SOI, a JFIF header, then the frame header for 600 × 800.
function jpegHeader(width, height) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9])
}

function month(key, { bills = {}, other = [], receipts = [] } = {}) {
  const m = {
    month: key, bookings: [], cancelled: [], cleanings: [],
    bills: { electricity: 0, internet: 0, water: 0, marketing: 0, ...bills },
    other, pm: null, receipts,
  }
  m.figures = computeMonth(m, split)
  return m
}

function statement(months) {
  const start = `${months[0].month}-01`
  const end = `${months[months.length - 1].month}-28`
  return {
    contract: { code: 'CT-TEST', unitCode: 'U-1', building: 'Tower', ownerName: 'Test Owner', start, end },
    months,
    totals: computeTotals({ months, start, end }),
    preparedOn: end,
    ...split,
  }
}

const photo = (bytes) => ({ buffer: bytes, ...imageInfo(bytes) })

describe('imageInfo', () => {
  it('reads the size of a PNG', () => {
    expect(imageInfo(PNG)).toEqual({ extension: 'png', width: 96, height: 96 })
  })

  it('reads the size of a JPEG', () => {
    expect(imageInfo(jpegHeader(600, 800))).toEqual({ extension: 'jpeg', width: 600, height: 800 })
  })

  it("returns null for formats Excel can't show, and for junk", () => {
    const webp = new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ' + ' '.repeat(20))
    expect(imageInfo(webp)).toBeNull()
    expect(imageInfo(new Uint8Array(4))).toBeNull()
    expect(imageInfo(null)).toBeNull()
  })
})

describe('the Receipts sheet', () => {
  const months = [
    month('2026-01', {
      bills: { electricity: 2345.5 },
      other: [{ name: 'Aircon cleaning', amount: 800 }],
      receipts: [
        { item: 'Electricity', amount: 2345.5, ref: 'electricity', image: photo(PNG) },
        { item: 'Aircon cleaning', amount: 800, ref: 'other:0', image: photo(jpegHeader(1600, 2400)) },
      ],
    }),
    month('2026-02', { bills: { water: 410 } }),
    month('2026-03', {
      bills: { water: 380 },
      receipts: [{ item: 'Water', amount: 380, ref: 'water', image: null, note: 'The photo could not be found.' }],
    }),
  ]
  const wb = buildStatementWorkbook(ExcelJS, statement(months))
  const receipts = wb.getWorksheet('Receipts')

  it('comes right after the month-by-month sheet', () => {
    expect(wb.worksheets.map((w) => w.name).slice(0, 3)).toEqual(['Summary', 'Month by month', 'Receipts'])
  })

  it('lists each receipt under its month, with the photo beside it', () => {
    expect(receipts.getRow(2).getCell(1).value).toBe('January 2026')
    expect(receipts.getRow(3).values.slice(1, 4)).toEqual(['Jan 2026', 'Electricity', 2345.5])
    expect(receipts.getRow(4).values.slice(1, 4)).toEqual(['Jan 2026', 'Aircon cleaning', 800])
    expect(receipts.getRow(5).getCell(1).value).toBe('March 2026') // February had no photos
    expect(receipts.getRow(6).getCell(4).value).toBe('The photo could not be found.')
    const images = receipts.getImages()
    expect(images.map((i) => i.range.tl.nativeRow)).toEqual([2, 3]) // rows 3 and 4
  })

  it('shrinks large photos to fit, keeping their shape', () => {
    const [small, tall] = receipts.getImages().map((i) => i.range.ext)
    expect(small).toEqual({ width: 96, height: 96 })
    expect(tall).toEqual({ width: 347, height: 520 })
    expect(receipts.getRow(4).height).toBe(396) // 520 px in points, plus a little room
  })

  it('links each expense to its photo', () => {
    const ledger = wb.getWorksheet('Month by month')
    const links = []
    ledger.eachRow((row) => {
      const v = row.getCell(9).value
      if (v && typeof v === 'object' && v.hyperlink) links.push([row.getCell(1).value, v.hyperlink])
    })
    expect(links).toEqual([
      ['Electricity', '#Receipts!A3'],
      ['Aircon cleaning', '#Receipts!A4'],
      ['Water', '#Receipts!A6'],
    ])
    const list = wb.getWorksheet('All expenses')
    expect(list.getRow(2).getCell(5).value).toEqual({ text: 'See receipt', hyperlink: '#Receipts!A3' })
    expect(list.getRow(4).getCell(5).value).toBeNull() // February's water bill had no photo
  })

  it('counts the photos on the Summary', () => {
    const summary = wb.getWorksheet('Summary')
    let count = null
    summary.eachRow((row) => { if (row.getCell(1).value === 'Receipt photos (Receipts sheet)') count = row.getCell(2).value })
    expect(count).toBe(2)
  })

  it('saves to a file that opens again with the photos and links', async () => {
    const buffer = await wb.xlsx.writeBuffer()
    const back = new ExcelJS.Workbook()
    await back.xlsx.load(buffer)
    expect(back.getWorksheet('Receipts').getImages()).toHaveLength(2)
    expect(back.model.media).toHaveLength(2)
    const links = []
    back.getWorksheet('Month by month').eachRow((row) => {
      const v = row.getCell(9).value
      if (v && typeof v === 'object' && v.hyperlink) links.push(v.hyperlink)
    })
    expect(links).toEqual(['#Receipts!A3', '#Receipts!A4', '#Receipts!A6'])
  })

  // A frozen view that froze nothing made Excel call every statement damaged
  // and offer to repair it (checked by opening the file in Excel).
  it('freezes panes only where something is frozen', async () => {
    const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer())
    const sheets = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    expect(sheets.length).toBeGreaterThan(2)
    for (const name of sheets) {
      const xml = await zip.file(name).async('string')
      for (const pane of xml.match(/<pane [^>]*>/g) || []) {
        if (pane.includes('state="frozen"')) expect(pane, `${name}: a frozen pane must freeze something`).toMatch(/[xy]Split="[1-9]/)
      }
    }
  })

  it('says so when a term has no photos', () => {
    const empty = buildStatementWorkbook(ExcelJS, statement([month('2026-01', { bills: { water: 300 } })]))
    expect(empty.getWorksheet('Receipts').getRow(2).getCell(1).value).toBe('No receipt photos were uploaded for this term.')
  })
})
