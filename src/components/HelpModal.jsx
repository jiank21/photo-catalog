import { useState } from 'react'
import {
  X,
  ChevronDown,
  Lock,
  FolderPlus,
  ScanLine,
  Sparkles,
  Bot,
  Search,
  FileSearch,
  Layers,
  BarChart3,
  Wand2,
  CheckSquare,
  LayoutDashboard,
  Tag,
  ShieldCheck,
  Cloud,
  Camera,
} from 'lucide-react'
import { cn } from '../lib/cn'

const STEPS = [
  {
    icon: <Lock size={18} />,
    title: 'Login',
    body: 'Masukkan PIN 6 digit untuk akses. PIN default: 123123. Ganti PIN di Settings → Keamanan.',
  },
  {
    icon: <FolderPlus size={18} />,
    title: 'Buat Section',
    body: 'Klik "+ Section Baru" di sidebar kiri. Section adalah grup folder foto (contoh: "Pernikahan 2024", "Produk Toko").',
  },
  {
    icon: <ScanLine size={18} />,
    title: 'Scan Folder',
    body: 'Klik "Pilih Folder & Scan" → pilih folder di harddisk/harddisk external. Browser akan membaca semua foto secara otomatis. ⚠️ Hanya Chrome/Edge yang support fitur ini.',
  },
  {
    icon: <Sparkles size={18} />,
    title: 'Auto Tagging',
    body: 'Setiap foto dianalisis AI secara otomatis. Tags dibuat dalam Bahasa Inggris + Indonesia. Progress terlihat di bar atas — model AI yang aktif akan menyala.',
  },
  {
    icon: <Search size={18} />,
    title: 'Cari Foto',
    body: 'Ketik di search bar — bisa pakai kata Indonesia atau Inggris. Contoh: "kucing" atau "cat", "pernikahan" atau "wedding".',
  },
  {
    icon: <FileSearch size={18} />,
    title: 'Temukan File Asli',
    body: 'Klik foto → lihat PATH LENGKAP → klik Copy → paste di File Explorer. File asli TIDAK disimpan ke cloud, hanya thumbnail & tags.',
  },
]

const FEATURES = [
  {
    icon: <Search size={18} />,
    title: 'Smart Search',
    body: 'Cari foto berdasarkan tag, nama file, atau nama folder. Support pencarian bilingual (EN + ID).',
  },
  {
    icon: <Layers size={18} />,
    title: 'Sections & Folders',
    body: 'Organisir foto dalam sections. Tiap section berisi folder-folder. Klik section/folder di sidebar untuk filter tampilan.',
  },
  {
    icon: <Bot size={18} />,
    title: 'AI Auto-Tag',
    body: 'Model AI dengan fallback otomatis: Gemini → OpenRouter → Groq → HuggingFace → Gemma. Jika satu model kena limit, otomatis pindah ke model berikutnya.',
  },
  {
    icon: <Camera size={18} />,
    title: 'EXIF & Metadata',
    body: 'Data teknis foto diekstrak otomatis: kamera, lensa, aperture, ISO, focal length. Foto dengan GPS otomatis mendapat tag lokasi (kota & negara). Semua data EXIF juga masuk sebagai tags yang bisa dicari.',
  },
  {
    icon: <BarChart3 size={18} />,
    title: 'Quota Monitor',
    body: 'Bar di bawah tombol scan menampilkan sisa quota tiap model hari ini. Model yang sedang aktif akan menyala (glow biru + dot hijau).',
  },
  {
    icon: <Wand2 size={18} />,
    title: 'Re-tag',
    body: 'Retag foto individual (dari modal), per folder, per section, atau semua sekaligus. Berguna jika kualitas tag kurang baik atau setelah update model.',
  },
  {
    icon: <CheckSquare size={18} />,
    title: 'Bulk Select',
    body: 'Klik "Mode Pilih" → centang foto → Re-tag Terpilih atau Hapus Entry. Master checkbox untuk pilih semua sekaligus.',
  },
  {
    icon: <LayoutDashboard size={18} />,
    title: '3 Mode Tampilan',
    body: 'Grid: thumbnail medium, cocok browse cepat. Large: thumbnail besar, detail jelas. List: tabel dengan path lengkap, ukuran, tanggal, tags.',
  },
  {
    icon: <Tag size={18} />,
    title: 'Edit Tag Manual',
    body: 'Buka foto → klik tag untuk cari foto serupa, atau tambah tag manual di kotak bawah.',
  },
  {
    icon: <ShieldCheck size={18} />,
    title: 'PIN Protection',
    body: 'App dilindungi PIN 6 digit. Session aktif 8 jam. Ganti PIN di Settings (ikon gear di sidebar bawah).',
  },
  {
    icon: <Cloud size={18} />,
    title: 'Always Online',
    body: 'Data (thumbnail + tags) tersimpan di cloud (Supabase). Bisa diakses dari mana saja meski harddisk tidak terhubung. File foto asli tetap aman di harddisk lokal.',
  },
]

const FAQS = [
  {
    q: 'Kenapa foto saya tagged "pending"?',
    a: 'Semua model AI sudah mencapai limit harian. Quota reset setiap tengah malam (UTC+0 / jam 07.00 WIB). Buka app besok dan klik "Re-tag Semua" atau scan ulang folder yang sama.',
  },
  {
    q: 'Berapa banyak foto yang bisa di-tag per hari?',
    a: 'Tergantung model yang tersedia:\n- Gemini: ~500 foto/hari\n- OpenRouter Free: ~200 foto/hari\n- Groq: ~100 foto/hari\n- HuggingFace: ~300 foto/jam\n- Total estimasi: ~1.100+ foto/hari\nSemua GRATIS, tidak perlu kartu kredit.',
  },
  {
    q: 'File foto asli saya aman?',
    a: 'Ya. App hanya menyimpan thumbnail kecil (max 400px) dan metadata ke cloud. File asli tidak pernah diupload ke mana pun dan tetap di harddisk kamu.',
  },
  {
    q: 'Kenapa scan hanya bisa di Chrome/Edge?',
    a: 'Fitur "pilih folder dari browser" menggunakan File System Access API yang hanya tersedia di Chrome dan Edge. Firefox dan Safari belum support.',
  },
  {
    q: 'Bisa scan harddisk external?',
    a: 'Ya! Saat klik "Pilih Folder & Scan", pilih folder dari harddisk external yang sudah terhubung ke komputer.',
  },
  {
    q: 'Bagaimana jika tag hasilnya kurang akurat?',
    a: 'Klik foto → tombol "Re-tag foto ini" untuk retag ulang dengan model terbaru. Atau pilih beberapa foto → "Re-tag Terpilih". Bisa juga tambah tag manual langsung dari modal foto.',
  },
  {
    q: 'Kenapa ada 2 bahasa di tags?',
    a: 'Sengaja! Setiap konsep dibuat dalam Bahasa Inggris DAN Indonesia supaya foto bisa dicari dengan kata apapun. Contoh: foto kucing akan punya tag "cat" DAN "kucing".',
  },
  {
    q: 'Bagaimana cara ganti PIN?',
    a: 'Klik ikon ⚙️ Settings di sidebar kiri bawah → Keamanan → isi PIN lama dan PIN baru.',
  },
  {
    q: 'Apakah data saya private?',
    a: 'Data tersimpan di Supabase project milik kamu sendiri. Hanya kamu yang punya akses (dilindungi PIN + Supabase credentials). Thumbnail foto tidak bisa diakses publik tanpa URL spesifik.',
  },
]

const TABS = [
  { id: 'start', label: 'Mulai Cepat' },
  { id: 'features', label: 'Fitur' },
  { id: 'faq', label: 'Tips & FAQ' },
]

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-200 dark:border-navy-700">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-sm font-medium"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{q}</span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-gray-400 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <div
        className={cn(
          'grid transition-all duration-200',
          open ? 'grid-rows-[1fr] pb-3.5' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden whitespace-pre-line text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {a}
        </div>
      </div>
    </div>
  )
}

export default function HelpModal({ onClose }) {
  const [tab, setTab] = useState('start')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-[680px] overflow-auto rounded-3xl border border-gray-100 bg-white shadow-2xl dark:border-navy-700 dark:bg-navy-800"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 dark:hover:bg-navy-700"
          onClick={onClose}
          aria-label="Tutup"
        >
          <X size={20} />
        </button>

        <div className="p-6">
          <h2 className="text-xl font-bold">📸 Panduan Photo Catalog</h2>

          <div className="mb-5 mt-4 flex gap-1 border-b border-gray-200 dark:border-navy-700" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={cn(
                  '-mb-px border-b-2 px-4 py-2.5 text-sm transition',
                  tab === t.id
                    ? 'border-brand-500 font-semibold text-brand-500'
                    : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200',
                )}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'start' && (
            <ol className="flex flex-col gap-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-purple-500 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <div className="mb-1 flex items-center gap-2 font-semibold">
                      {s.icon} {s.title}
                    </div>
                    <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {tab === 'features' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl bg-gray-50 p-4 dark:bg-navy-700"
                >
                  <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                    <span className="text-brand-500">{f.icon}</span> {f.title}
                  </div>
                  <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{f.body}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'faq' && (
            <div className="flex flex-col">
              {FAQS.map((f) => (
                <FaqItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
