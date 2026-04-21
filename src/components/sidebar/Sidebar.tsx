import { useTranslation } from 'react-i18next'
import { Route, Flag, MapPin, Users, List } from 'lucide-react'
import { useUiStore, type SidebarTab } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import TracksPanel from './TracksPanel'
import PointsPanel from './PointsPanel'
import VolunteersPanel from './VolunteersPanel'
import LegendPanel from './LegendPanel'
import SectorsPanel from './SectorsPanel'

const TABS: { id: SidebarTab; icon: typeof Route; labelKey: string }[] = [
  { id: 'tracks', icon: Route, labelKey: 'project.tabs.tracks' },
  { id: 'sectors', icon: Flag, labelKey: 'project.tabs.sectors' },
  { id: 'points', icon: MapPin, labelKey: 'project.tabs.points' },
  { id: 'volunteers', icon: Users, labelKey: 'project.tabs.volunteers' },
  { id: 'legend', icon: List, labelKey: 'project.tabs.legend' },
]

export default function Sidebar() {
  const { t } = useTranslation()
  const activeTab = useUiStore((s) => s.activeTab)
  const setActiveTab = useUiStore((s) => s.setActiveTab)

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-background">
      <nav className="flex gap-1 border-b border-border p-2">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 rounded-md px-2 py-2 text-[11px] font-medium transition-colors',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
              title={t(tab.labelKey)}
              aria-pressed={active}
            >
              <Icon className="size-4" />
              <span className="truncate">{t(tab.labelKey)}</span>
            </button>
          )
        })}
      </nav>
      <div className="flex-1 overflow-auto p-3">
        {activeTab === 'tracks' && <TracksPanel />}
        {activeTab === 'sectors' && <SectorsPanel />}
        {activeTab === 'points' && <PointsPanel />}
        {activeTab === 'volunteers' && <VolunteersPanel />}
        {activeTab === 'legend' && <LegendPanel />}
      </div>
    </aside>
  )
}
