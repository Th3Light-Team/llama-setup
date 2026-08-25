import { Link, useLocation } from 'react-router-dom'
import { Home, Download, Play, Library, Settings, Cpu, BookMarked, Trophy } from 'lucide-react'
import { clsx } from 'clsx'
import HardwareBadge from '@/components/HardwareBadge'
import DiscoveryBadge from '@/components/DiscoveryBadge'
import { DownloadIndicator } from '@/components/DownloadIndicator'
import { BenchIndicator } from '@/components/BenchIndicator'
import logoWordmark from '@/assets/brand/logo-wordmark.svg'

const navItems = [
  { name: 'Home', path: '/', icon: <Home className="w-4 h-4" aria-hidden /> },
  { name: 'Hardware', path: '/hardware', icon: <Cpu className="w-4 h-4" aria-hidden /> },
  { name: 'Binaries', path: '/binaries', icon: <Download className="w-4 h-4" aria-hidden /> },
  { name: 'Launch', path: '/launch', icon: <Play className="w-4 h-4" aria-hidden /> },
  { name: 'Bench', path: '/bench', icon: <Trophy className="w-4 h-4" aria-hidden /> },
  { name: 'Library', path: '/library', icon: <BookMarked className="w-4 h-4" aria-hidden /> },
  { name: 'Registry', path: '/registry', icon: <Library className="w-4 h-4" aria-hidden /> },
  { name: 'Settings', path: '/settings', icon: <Settings className="w-4 h-4" aria-hidden /> },
]

export default function Sidebar() {
  const location = useLocation()

  return (
    <div className="w-56 border-r border-sidebar-border h-screen bg-sidebar flex flex-col">
      <div className="px-4 py-4 border-b border-sidebar-border">
        <img
          src={logoWordmark}
          alt="llama-studio"
          className="h-8 w-auto"
        />
      </div>
      <nav className="flex-1 p-3 space-y-0.5" aria-label="Main navigation">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={clsx(
              "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              location.pathname === item.path
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
          >
            {item.icon}
            <span>{item.name}</span>
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-1.5">
        <DownloadIndicator />
        <BenchIndicator />
        <HardwareBadge />
        <DiscoveryBadge />
      </div>
    </div>
  )
}
