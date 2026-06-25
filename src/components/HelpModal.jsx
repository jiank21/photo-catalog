import { useState } from 'react'
import {
  X,
  ChevronDown,
  Lock,
  FolderPlus,
  MonitorSmartphone,
  Bot,
  Search,
  FolderOpen,
  Layers,
  Gauge,
  RefreshCw,
  CheckSquare,
  Eye,
  Tag,
  ShieldCheck,
  Cloud,
} from 'lucide-react'

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
    icon: <MonitorSmartphone size={18} />,
    title: 'Scan Folder',
    body: 'Klik "Pilih Folder & Scan" → pilih folder di harddisk/harddisk external. Browser akan membaca semua foto secara otomatis. ⚠️ Hanya Chrome/Edge yang support fitur ini.',
  },
  {
    icon: <Bot size={18} />,
    title: 'Auto Tagging',
    body: 'Setiap foto dianalisis AI secara otomatis. Tags dibuat dalam Bahasa Inggris + Indonesia. Progress terlihat di bar atas — model AI yang aktif akan menyala.',
  },
  {
    icon: <Search size={18} />,
    title: 'Cari Foto',
    body: 'Ketik di search bar — bisa pakai kata Indonesia atau Inggris. Contoh: "kucing" atau "cat", "pernikahan" atau "wedding".',
  },
  {
    icon: <FolderOpen size={18} />,
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
    icon: <Gauge size={18} />,
    title: 'Quota Monitor',
    body: 'Bar di bawah tombol scan menampilkan sisa quota tiap model hari ini. Model yang sedang aktif akan menyala (glow biru + dot hijau).',
  },
  {
    icon: <RefreshCw size={18} />,
    title: 'Re-tag',
    body: 'Retag foto individual (dari modal), per folder, per section, atau semua sekaligus. Berguna jika kualitas tag kurang baik atau setelah update model.',
  },
  {
    icon: <CheckSquare size={18} />,
    title: 'Bulk Select',
    body: 'Klik "Mode Pilih" → centang foto → Re-tag Terpilih atau Hapus Entry. Master checkbox untuk pilih semua sekaligus.',
  },
  {
    icon: <Eye size={18} />,
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
    <div className={`faq-item${open ? ' is-open' : ''}`}>
      <button type="button" className="faq-item__q" onClick={() => setOpen((o) => !o)}>
        <span>{q}</span>
        <ChevronDown size={16} className="faq-item__chevron" />
      </button>
      {open && <div className="faq-item__a">{a}</div>}
    </div>
  )
}

export default function HelpModal({ onClose }) {
  const [tab, setTab] = useState('start')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--help" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Tutup">
          <X size={20} />
        </button>

        <div className="help">
          <h2 className="help__title">📸 Panduan Photo Catalog</h2>

          <div className="help__tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`help__tab${tab === t.id ? ' is-active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'start' && (
            <ol className="help__steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className="help-step">
                  <span className="help-step__num">{i + 1}</span>
                  <div className="help-step__body">
                    <div className="help-step__title">
                      {s.icon} {s.title}
                    </div>
                    <p className="help-step__text">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {tab === 'features' && (
            <div className="help__features">
              {FEATURES.map((f) => (
                <div key={f.title} className="feature-card">
                  <div className="feature-card__title">
                    {f.icon} {f.title}
                  </div>
                  <p className="feature-card__text">{f.body}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'faq' && (
            <div className="help__faq">
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
