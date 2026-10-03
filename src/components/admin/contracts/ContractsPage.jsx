import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, RefreshCw, X, Check, Loader2, Trash2,
  FileText, Calendar, Download, ExternalLink, User,
  Upload, Eye,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/auditLog'
import { cn, sanitizeText, sanitizeDateOnly } from '@/lib/utils'

const BRAND = '#2d568e'

const PDF_BUCKET = 'contract-pdfs'
const PDF_MAX_BYTES = 15 * 1024 * 1024
const PDF_ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function pdfBytesLabel(b) {
  if (!b) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function pdfRandomId() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
}

async function pdfSniffMime(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const hex = Array.from(head).map((b) => b.toString(16).padStart(2, '0')).join('')

  if (hex.startsWith('25504446')) return 'application/pdf'
  if (hex.startsWith('ffd8ff')) return 'image/jpeg'
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png'
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp'
  return null
}

function deriveContractStatus(contract) {
  if (!contract) return 'incomplete'
  const eff = contract.effective_date ? new Date(contract.effective_date + 'T00:00:00Z') : null
  const exp = contract.expiry_date ? new Date(contract.expiry_date + 'T00:00:00Z') : null
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  if (!eff && !exp) return 'incomplete'
  if (eff && !exp) return 'active'
  if (eff && exp) {
    if (exp < today) return 'expired'
    const daysLeft = Math.round((exp - today) / 86400000)
    return daysLeft <= 60 ? 'expiring' : 'active'
  }
  return exp < today ? 'expired' : 'active'
}

const STATUS_TEXT = {
  active:     { label: 'Active',     className: 'text-emerald-600 dark:text-emerald-400' },
  expiring:   { label: 'Expiring',   className: 'text-amber-600 dark:text-amber-400' },
  expired:    { label: 'Expired',    className: 'text-red-600 dark:text-red-400' },
  incomplete: { label: 'Incomplete', className: 'text-gray-500 dark:text-gray-400' },
}

function StatusText({ contract }) {
  const status = deriveContractStatus(contract)
  const config = STATUS_TEXT[status] || STATUS_TEXT.incomplete
  return <span className={cn('text-[11px] font-semibold', config.className)}>{config.label}</span>
}

function formatDate(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00Z')
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

const ROW_GRID = 'grid grid-cols-[1.3fr_1.5fr_1fr_1fr_140px] gap-4 items-center'
const PANEL_WIDTH = 480

function DetailSection({ title, action, className, children }) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-foreground">{title}</h4>
        {action}
      </div>
      <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function PdfLightbox({ url, title = 'Contract document', onClose }) {
  const [iframeLoaded, setIframeLoaded] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 bg-black/85 backdrop-blur-sm flex flex-col"
      style={{ zIndex: 2147483647 }}
      onClick={handleBackdrop}
    >
      <div
        className="flex-shrink-0 h-14 px-4 flex items-center gap-3 border-b border-white/10 bg-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <FileText size={16} className="text-white/80 flex-shrink-0" />
        <p className="text-sm font-semibold text-white truncate flex-1">
          {title}
        </p>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold text-white/90 hover:text-white bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
          title="Open in a new browser tab"
        >
          <ExternalLink size={12} />
          <span className="hidden sm:inline">Open in new tab</span>
        </a>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold text-white/90 hover:text-white bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
          title="Close (Esc)"
        >
          <X size={12} />
          <span className="hidden sm:inline">Close</span>
        </button>
      </div>

      <div
        className="flex-1 min-h-0 p-4 sm:p-6 flex items-center justify-center"
        onClick={handleBackdrop}
      >
        <div
          className="relative w-full h-full max-w-[1100px] rounded-lg overflow-hidden bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {!iframeLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={22} className="animate-spin text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground">Loading document…</p>
              </div>
            </div>
          )}
          <iframe
            src={url}
            title={title}
            className="w-full h-full border-0"
            onLoad={() => setIframeLoaded(true)}
          />
        </div>
      </div>

      <div className="flex-shrink-0 h-10 px-4 flex items-center justify-center border-t border-white/10 bg-black/60">
        <p className="text-[11px] text-white/70">
          Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 font-mono">Esc</kbd> or click outside the document to close
        </p>
      </div>
    </motion.div>,
    document.body,
  )
}

function ContractPdfUploader({ contract, onSaved }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [busyRemove, setBusyRemove] = useState(false)
  const [signedUrl, setSignedUrl] = useState(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const path = contract?.contract_pdf_path || null
  const existingUrl = contract?.contract_pdf_url || null

  useEffect(() => {
    let cancelled = false
    if (!path) { setSignedUrl(null); return }
    setLoadingUrl(true)
    supabase.storage.from(PDF_BUCKET).createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.warn(error); setSignedUrl(null) }
        else setSignedUrl(data?.signedUrl || null)
      })
      .finally(() => { if (!cancelled) setLoadingUrl(false) })
    return () => { cancelled = true }
  }, [path])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > PDF_MAX_BYTES) {
      toast.error(`File too large (max ${pdfBytesLabel(PDF_MAX_BYTES)})`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    const mime = await pdfSniffMime(file)
    if (!mime || !PDF_ALLOWED_MIMES.has(mime)) {
      toast.error('Unsupported file. Use PDF, JPEG, PNG, or WebP.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      const ext = mime === 'application/pdf' ? 'pdf'
        : mime === 'image/png' ? 'png'
        : mime === 'image/webp' ? 'webp'
        : 'jpg'

      const newPath = `${contract.id}/${pdfRandomId()}.${ext}`

      const { error: upErr } = await supabase
        .storage
        .from(PDF_BUCKET)
        .upload(newPath, file, {
          cacheControl: '31536000',
          upsert: false,
          contentType: mime,
        })
      if (upErr) throw upErr

      const { data: signedData, error: signErr } = await supabase
        .storage
        .from(PDF_BUCKET)
        .createSignedUrl(newPath, 3600)
      if (signErr) throw signErr

      const { error: dbErr } = await supabase
        .from('contracts')
        .update({
          contract_pdf_path: newPath,
          contract_pdf_url: signedData?.signedUrl || existingUrl,
        })
        .eq('id', contract.id)
      if (dbErr) throw dbErr

      if (path) {
        supabase.storage.from(PDF_BUCKET).remove([path]).catch((err) => {
          console.warn('Failed to remove old contract pdf:', err)
        })
      }

      logAudit('UPLOAD_CONTRACT_PDF', 'contracts', contract.id, {
        filename: file.name,
        size: file.size,
        mime,
      }).catch(() => {})

      toast.success('Contract uploaded')
      setSignedUrl(signedData?.signedUrl || null)
      onSaved?.()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!path && !existingUrl) return
    if (!window.confirm('Remove the contract file? This cannot be undone.')) return
    setBusyRemove(true)
    try {
      if (path) {
        const { error: rmErr } = await supabase.storage.from(PDF_BUCKET).remove([path])
        if (rmErr) console.warn('Storage remove failed:', rmErr)
      }
      const { error: dbErr } = await supabase
        .from('contracts')
        .update({ contract_pdf_path: null, contract_pdf_url: null })
        .eq('id', contract.id)
      if (dbErr) throw dbErr
      logAudit('REMOVE_CONTRACT_PDF', 'contracts', contract.id, {}).catch(() => {})
      toast.success('Contract file removed')
      setSignedUrl(null)
      onSaved?.()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to remove')
    } finally {
      setBusyRemove(false)
    }
  }

  const hasFile = !!path || !!existingUrl
  const displayUrl = signedUrl || existingUrl

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
        disabled={uploading || busyRemove}
      />

      {hasFile ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-2.5 rounded-md border border-border bg-background">
            <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <FileText size={18} className="text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate">Contract document</p>
              <p className="text-[10px] text-muted-foreground font-mono truncate">
                {path || existingUrl || '—'}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {loadingUrl ? (
                <Loader2 size={12} className="animate-spin text-muted-foreground" />
              ) : displayUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Preview"
                  >
                    <Eye size={12} />
                  </button>
                  <a
                    href={displayUrl}
                    download
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Download"
                  >
                    <Download size={12} />
                  </a>
                  <a
                    href={displayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink size={12} />
                  </a>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded text-[11px] gap-1.5 flex-1"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || busyRemove}
            >
              {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              {uploading ? 'Uploading…' : 'Replace'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded text-[11px] gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
              onClick={handleRemove}
              disabled={uploading || busyRemove}
            >
              {busyRemove ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex flex-col items-center justify-center gap-1.5 py-5 rounded-md border-2 border-dashed border-border text-muted-foreground hover:bg-muted/40 active:bg-muted/60 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          <span className="text-[11px] font-semibold">
            {uploading ? 'Uploading…' : 'Upload contract document'}
          </span>
          <span className="text-[10px]">
            PDF, JPEG, PNG, WebP · max {pdfBytesLabel(PDF_MAX_BYTES)}
          </span>
        </button>
      )}

      <AnimatePresence>
        {lightboxOpen && displayUrl && (
          <PdfLightbox
            url={displayUrl}
            title={contract.contract_code ? `Contract · ${contract.contract_code}` : 'Contract document'}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function SummaryCards({ contracts }) {
  const stats = useMemo(() => {
    let active = 0, expiring = 0, expired = 0
    for (const c of contracts) {
      const s = deriveContractStatus(c)
      if (s === 'active') active++
      else if (s === 'expiring') expiring++
      else if (s === 'expired') expired++
    }
    return { total: contracts.length, active, expiring, expired }
  }, [contracts])

  const cards = [
    { label: 'Total Contracts', value: stats.total,    icon: FileText },
    { label: 'Active',          value: stats.active,   icon: Check },
    { label: 'Expiring Soon',   value: stats.expiring, icon: Calendar },
    { label: 'Expired',         value: stats.expired,  icon: X },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.25 }}
          className="rounded-md bg-card border border-border shadow-sm p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <card.icon size={15} className="text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {card.label}
            </span>
          </div>
          <p className="text-3xl font-bold text-foreground tabular-nums">{card.value}</p>
        </motion.div>
      ))}
    </div>
  )
}

const STATUS_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'expiring', label: 'Expiring' },
  { id: 'expired', label: 'Expired' },
]

const PILL_TEXT_ACTIVE = {
  all: 'text-foreground',
  active: 'text-emerald-700 dark:text-emerald-400',
  expiring: 'text-amber-700 dark:text-amber-400',
  expired: 'text-red-700 dark:text-red-400',
}

function StatusPills({ statusFilter, onStatusFilter, counts }) {
  const containerRef = useRef(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  useEffect(() => {
    if (!containerRef.current) return
    const active = containerRef.current.querySelector('[data-active="true"]')
    if (!active) return
    const cRect = containerRef.current.getBoundingClientRect()
    const aRect = active.getBoundingClientRect()
    setIndicator({ left: aRect.left - cRect.left, width: aRect.width })
  }, [statusFilter, counts])

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1 bg-muted/60 rounded-full p-1">
      <motion.div
        className="absolute top-1 bottom-1 rounded-full shadow-sm z-0 bg-card border border-border"
        animate={{ left: indicator.left, width: indicator.width }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      />
      {STATUS_PILLS.map((tab) => {
        const isActive = statusFilter === tab.id
        const count = counts[tab.id] ?? 0
        return (
          <button
            key={tab.id}
            type="button"
            data-active={isActive}
            onClick={() => onStatusFilter(tab.id)}
            className={cn(
              'relative z-10 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors duration-200 whitespace-nowrap',
              isActive ? (PILL_TEXT_ACTIVE[tab.id] || 'text-foreground') : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            <span className={cn('ml-1', isActive ? 'opacity-90' : 'opacity-60')}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

function FilterPanel({
  open, onClose, building, setBuilding,
  ownerId, setOwnerId, buildings, owners, activeCount, onClear,
}) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12 }}
          className="absolute right-0 top-full mt-2 w-[360px] max-w-[90vw] bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <h3 className="text-xs font-bold text-foreground">Filters</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={13} /></button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Building</p>
              <Select value={building} onValueChange={setBuilding}>
                <SelectTrigger className="h-8 text-xs rounded"><SelectValue placeholder="All buildings" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All buildings</SelectItem>
                  {buildings.map((b) => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Owner</p>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className="h-8 text-xs rounded"><SelectValue placeholder="All owners" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All owners</SelectItem>
                  {owners.map((o) => <SelectItem key={o.id} value={o.id} className="text-xs">{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/30">
            <Button variant="ghost" size="sm" onClick={onClear} disabled={activeCount === 0} className="text-xs h-7 rounded">Clear all</Button>
            <Button size="sm" onClick={onClose} className="text-xs h-7 rounded"><Check size={11} className="mr-1" />Done</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ContractRow({ contract, selected, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={false}
      animate={{ backgroundColor: selected ? 'rgba(45, 86, 142, 0.10)' : 'rgba(45, 86, 142, 0)' }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ backgroundColor: selected ? 'rgba(45, 86, 142, 0.14)' : 'rgba(45, 86, 142, 0.05)' }}
      whileTap={{ scale: 0.998 }}
      className={cn('group/row w-full text-left px-4 py-3 border-b border-border cursor-pointer select-none', ROW_GRID)}
    >
      <div className="min-w-0">
        <span className="font-mono text-xs font-bold text-foreground truncate block">
          {contract.contract_code || '—'}
        </span>
        <span className="text-[10px] text-muted-foreground truncate block">
          {contract.owners?.name || 'No owner'}
        </span>
      </div>

      <div className="min-w-0">
        <span className="font-mono text-xs font-bold text-foreground truncate block">
          {contract.units?.unit_code || '—'}
        </span>
        <span className="text-[10px] text-muted-foreground truncate block">
          {contract.units?.building || '—'}
        </span>
      </div>

      <div className="text-[11px] tabular-nums text-muted-foreground min-w-0">
        <div className="truncate">{formatDate(contract.effective_date)}</div>
      </div>

      <div className="text-[11px] tabular-nums text-muted-foreground min-w-0">
        <div className="truncate">{formatDate(contract.expiry_date)}</div>
      </div>

      <div className="flex items-center justify-end flex-shrink-0">
        <StatusText contract={contract} />
      </div>
    </motion.button>
  )
}

function EditableField({ label, value, type = 'text', options, onSave, auditTag, maxLength = 500 }) {
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus] = useState('idle')

  useEffect(() => { setDraft(value ?? '') }, [value])

  const commit = async () => {
    if (draft === (value ?? '')) return
    setStatus('saving')
    try {
      const cleaned = draft === '' ? null : String(draft).slice(0, maxLength)
      const next = cleaned === '' ? null : cleaned
      await onSave(next)
      setStatus('saved')
      if (auditTag) {
        logAudit(`UPDATE_CONTRACT_FIELD:${auditTag}`, 'contracts', null, { field: auditTag, from: value, to: next }).catch(() => {})
      }
      setTimeout(() => setStatus('idle'), 1200)
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Save failed')
      setDraft(value ?? '')
      setStatus('idle')
    }
  }
  const cancel = () => setDraft(value ?? '')

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {options ? (
          <Select
            value={draft || ''}
            onValueChange={async (v) => {
              setDraft(v)
              setStatus('saving')
              try {
                await onSave(v)
                setStatus('saved')
                if (auditTag) {
                  logAudit(`UPDATE_CONTRACT_FIELD:${auditTag}`, 'contracts', null, { field: auditTag, from: value, to: v }).catch(() => {})
                }
                setTimeout(() => setStatus('idle'), 1200)
              } catch (err) {
                toast.error(err?.message || 'Save failed')
                setStatus('idle')
              }
            }}
          >
            <SelectTrigger className="h-7 text-xs rounded bg-background border-border flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>{options.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Input
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.target.blur() }
              if (e.key === 'Escape') { e.preventDefault(); cancel(); e.target.blur() }
            }}
            onBlur={commit}
            maxLength={maxLength}
            className={cn(
              'h-7 text-xs rounded bg-background flex-1 transition-colors',
              !value && 'border-border',
              value && 'border-transparent hover:border-border'
            )}
            placeholder="—"
          />
        )}
        {status === 'saving' && <Loader2 size={11} className="flex-shrink-0 animate-spin text-primary" />}
        {status === 'saved' && <Check size={11} className="flex-shrink-0 text-emerald-500" />}
      </div>
    </div>
  )
}

function ContractDetailPanel({ contract, onClose, onChanged, onDelete }) {
  const status = deriveContractStatus(contract)
  const statusConfig = STATUS_TEXT[status] || STATUS_TEXT.incomplete

  const updateField = async (field, value) => {
    const { error } = await supabase.from('contracts').update({ [field]: value }).eq('id', contract.id)
    if (error) throw error
    logAudit(`UPDATE_CONTRACT_FIELD:${field}`, 'contracts', contract.id, { field, from: contract[field], to: value }).catch(() => {})
    onChanged()
  }

  const unit = contract.units
  const owner = contract.owners

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: PANEL_WIDTH, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ width: { duration: 0.32, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.2, ease: 'easeOut' } }}
      className="h-full flex-shrink-0 p-3"
      style={{ maxWidth: '100%', width: PANEL_WIDTH + 24 }}
    >
      <div className="h-full rounded-md border border-border bg-card shadow-lg overflow-hidden flex flex-col">

        <div className="flex-shrink-0 px-5 py-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <FileText size={20} className="text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-foreground font-mono truncate">{contract.contract_code || '—'}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {unit?.unit_code || '—'} · {unit?.building || '—'}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={cn('text-[11px] font-semibold', statusConfig.className)}>
                  {statusConfig.label}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0"><X size={16} /></button>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5" onClick={onDelete}>
              <Trash2 size={11} /> Delete
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <DetailSection title="Owner">
            <div className="p-3">
              <div className="flex items-center gap-2.5 pb-2 mb-2 border-b border-border">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground">
                  <User size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{owner?.name || '—'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{owner?.email || 'No email'}</p>
                </div>
              </div>
              {owner?.phone && (
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">Phone</span>
                  <span className="text-xs text-foreground">{owner.phone}</span>
                </div>
              )}
            </div>
          </DetailSection>

          <DetailSection title="Unit">
            <div className="p-3 space-y-0.5">
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">Code</span>
                <span className="text-xs font-mono text-foreground">{unit?.unit_code || '—'}</span>
              </div>
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">Building</span>
                <span className="text-xs text-foreground">{unit?.building || '—'}</span>
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Contract Terms">
            <div className="p-3 space-y-0.5">
              <EditableField
                label="Effective"
                value={contract.effective_date}
                type="date"
                onSave={(v) => updateField('effective_date', v)}
                auditTag="effective_date"
              />
              <EditableField
                label="Expiry"
                value={contract.expiry_date}
                type="date"
                onSave={(v) => updateField('expiry_date', v)}
                auditTag="expiry_date"
              />
            </div>
          </DetailSection>

          <DetailSection title="Contract Document">
            <div className="p-3">
              <ContractPdfUploader
                contract={contract}
                onSaved={onChanged}
              />
            </div>
          </DetailSection>

          <DetailSection title="Notes">
            <div className="p-3">
              <Textarea
                key={contract.id}
                defaultValue={contract.notes || ''}
                maxLength={2000}
                onBlur={async (e) => {
                  const cleaned = sanitizeText(e.target.value, { max: 2000, allowNewlines: true })
                  if (cleaned === (contract.notes || null)) return
                  try {
                    await updateField('notes', cleaned)
                    toast.success('Notes saved')
                  } catch {
                    toast.error('Failed to save')
                  }
                }}
                rows={3}
                className="text-xs rounded resize-none w-full"
                placeholder="Add notes..."
              />
            </div>
          </DetailSection>

          <div className="pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded text-xs w-full gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
              onClick={onDelete}
            >
              <Trash2 size={12} /> Delete Contract
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function ContractsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filterUnitId = searchParams.get('unit')

  const [contracts, setContracts] = useState([])
  const [units, setUnits] = useState([])
  const [owners, setOwners] = useState([])

  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [statusFilter, setStatusFilter] = useState('all')
  const [building, setBuilding] = useState('all')
  const [ownerId, setOwnerId] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  const [selectedId, setSelectedId] = useState(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async () => {
    if (!hasLoadedOnce.current) setIsFirstLoad(true)
    else setIsRefreshing(true)
    try {
      const [cRes, uRes, oRes] = await Promise.all([
        supabase
          .from('contracts')
          .select(`
            *,
            units:unit_id ( id, unit_code, building ),
            owners:owner_id ( id, name, email, phone )
          `)
          .order('effective_date', { ascending: false, nullsFirst: false }),
        supabase.from('units').select('id, unit_code, building, owner_id, current_contract_id').order('unit_code'),
        supabase.from('owners').select('id, name, email, phone').order('name'),
      ])
      if (cRes.error) throw cRes.error
      if (uRes.error) throw uRes.error
      if (oRes.error) throw oRes.error
      setContracts(cRes.data || [])
      setUnits(uRes.data || [])
      setOwners(oRes.data || [])
    } catch (err) {
      console.error('Failed to load contracts:', err)
      toast.error('Failed to load contracts')
    } finally {
      setIsFirstLoad(false)
      setIsRefreshing(false)
      hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const ch = supabase
      .channel(`contracts-realtime-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchData])

  const buildings = useMemo(() => {
    const set = new Set()
    for (const c of contracts) { if (c.units?.building) set.add(c.units.building) }
    return [...set].sort()
  }, [contracts])

  const counts = useMemo(() => {
    const c = { all: contracts.length, active: 0, expiring: 0, expired: 0 }
    for (const x of contracts) {
      const s = deriveContractStatus(x)
      if (c[s] !== undefined) c[s]++
    }
    return c
  }, [contracts])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (building !== 'all') n++
    if (ownerId !== 'all') n++
    if (filterUnitId) n++
    return n
  }, [building, ownerId, filterUnitId])

  const clearFilters = () => {
    setBuilding('all')
    setOwnerId('all')
    const next = new URLSearchParams(searchParams)
    next.delete('unit')
    setSearchParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return contracts.filter((c) => {
      if (filterUnitId && c.unit_id !== filterUnitId) return false
      const status = deriveContractStatus(c)
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (building !== 'all' && c.units?.building !== building) return false
      if (ownerId !== 'all' && c.owner_id !== ownerId) return false
      if (q) {
        const haystack = [
          c.contract_code,
          c.units?.unit_code, c.units?.building,
          c.owners?.name, c.owners?.email,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [contracts, filterUnitId, statusFilter, building, ownerId, debouncedSearch])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = a.effective_date ?? ''
      const bv = b.effective_date ?? ''
      if (av > bv) return -1
      if (av < bv) return 1
      return 0
    })
    return copy
  }, [filtered])

  const selected = useMemo(() => sorted.find((c) => c.id === selectedId) || null, [sorted, selectedId])

  const handleSelect = (contract) => setSelectedId((prev) => (prev === contract.id ? null : contract.id))

  const handleDelete = async (contract) => {
    const confirmed = window.confirm(
      `Delete this contract?\n\nCode: ${contract.contract_code || '—'}\nUnit: ${contract.units?.unit_code || '—'}\nEffective: ${formatDate(contract.effective_date)}\nExpiry: ${formatDate(contract.expiry_date)}\n\nThis cannot be undone.`
    )
    if (!confirmed) return

    try {
      if (contract.contract_pdf_path) {
        supabase.storage.from(PDF_BUCKET).remove([contract.contract_pdf_path]).catch((err) => {
          console.warn('Failed to remove contract pdf:', err)
        })
      }

      const { error } = await supabase.from('contracts').delete().eq('id', contract.id)
      if (error) throw error
      logAudit('DELETE_CONTRACT', 'contracts', contract.id, { contract_code: contract.contract_code, unit_id: contract.unit_id }).catch(() => {})
      toast.success('Contract deleted')
      setSelectedId(null)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to delete')
    }
  }

  const handleExport = () => {
    if (filtered.length === 0) { toast.error('Nothing to export'); return }
    const headers = ['Code', 'Unit', 'Building', 'Owner', 'Owner Email', 'Effective', 'Expiry', 'Status', 'Has PDF']
    const rows = filtered.map((c) => [
      c.contract_code || '',
      c.units?.unit_code || '',
      c.units?.building || '',
      c.owners?.name || '',
      c.owners?.email || '',
      c.effective_date || '',
      c.expiry_date || '',
      STATUS_TEXT[deriveContractStatus(c)]?.label || '',
      c.contract_pdf_path ? 'Yes' : 'No',
    ])
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contracts_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported')
  }

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="p-3 flex-1 min-h-0 flex flex-col gap-2.5">
          <div className="flex-shrink-0 pt-1 pb-2">
            <SummaryCards contracts={contracts} />
          </div>

          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search contract code, unit, owner, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs rounded"
              />
            </div>
            <div className="relative">
              <Button
                variant={activeFilterCount > 0 ? 'default' : 'outline'}
                size="sm"
                className="h-8 rounded text-xs transition-all duration-150"
                onClick={() => setFilterOpen((v) => !v)}
              >
                <FileText size={13} />
                <span className="hidden sm:inline ml-1">Filter</span>
                {activeFilterCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">{activeFilterCount}</span>
                )}
              </Button>
              <FilterPanel
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                building={building}
                setBuilding={setBuilding}
                ownerId={ownerId}
                setOwnerId={setOwnerId}
                buildings={buildings}
                owners={owners}
                activeCount={activeFilterCount}
                onClear={clearFilters}
              />
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={isRefreshing} className="h-8 rounded transition-all duration-150">
              <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-8 rounded transition-all duration-150">
              <Download size={13} />
            </Button>
          </div>

          {filterUnitId && (
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded bg-muted/40 border border-border">
              <span className="text-[11px] text-muted-foreground">
                Showing contracts for unit:
              </span>
              <span className="text-[11px] font-mono font-semibold text-foreground">
                {units.find((u) => u.id === filterUnitId)?.unit_code || filterUnitId}
              </span>
              <button
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  next.delete('unit')
                  setSearchParams(next, { replace: true })
                }}
                className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X size={11} />
              </button>
            </div>
          )}

          <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <StatusPills statusFilter={statusFilter} onStatusFilter={setStatusFilter} counts={counts} />
          </div>

          <div className="flex-1 min-h-0 rounded border border-border shadow-sm overflow-hidden bg-card">
            <div className="h-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <div className={cn('sticky top-0 z-10 px-4 py-2 border-b border-border bg-card', ROW_GRID)}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Contract</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Unit</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Effective</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Expiry</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right truncate">Status</span>
              </div>

              {isFirstLoad ? (
                <div className="space-y-2 p-3">
                  {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : sorted.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center py-12">
                  <div>
                    <FileText size={36} className="text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-semibold">No contracts match your filters</p>
                    <p className="text-xs text-muted-foreground mt-1">Try clearing filters</p>
                  </div>
                </div>
              ) : (
                sorted.map((contract) => (
                  <ContractRow
                    key={contract.id}
                    contract={contract}
                    selected={selectedId === contract.id}
                    onClick={() => handleSelect(contract)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <ContractDetailPanel
            key={selected.id}
            contract={selected}
            onClose={() => setSelectedId(null)}
            onChanged={fetchData}
            onDelete={() => handleDelete(selected)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}