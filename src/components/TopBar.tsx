import { Plus } from 'lucide-react';
import type { ActiveTab } from '../types/tts';

interface TopBarProps {
  activeTab: ActiveTab;
  historyCount: number;
  onSelectTab: (tab: ActiveTab) => void;
  onNewScript: () => void;
}

export function TopBar({ activeTab, historyCount, onSelectTab, onNewScript }: TopBarProps) {
  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'studio', label: 'Studio' },
    { id: 'voices', label: 'Voices' },
    { id: 'history', label: historyCount > 0 ? `History (${historyCount})` : 'History' },
  ];

  return (
    <header className="sticky top-0 z-30 h-[60px] bg-white/95 backdrop-blur-xs border-b border-[#E2E6EC]">
      <div className="max-w-[1360px] h-full mx-auto px-3.5 sm:px-6 lg:px-8 flex items-center justify-between gap-2.5 sm:gap-8">
        <a
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('studio');
          }}
          className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#111418] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 rounded-xs"
        >
          Cadence
        </a>

        <nav aria-label="Primary navigation" className="flex items-center gap-3.5 sm:gap-7">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-2 text-xs sm:text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'text-[#111418]'
                    : 'text-[#6B7280] hover:text-[#111418]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 right-0 -bottom-[12px] sm:-bottom-[11px] h-[2px] bg-[#D94826]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onNewScript}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-medium text-[#111418] bg-[#F3F5F8] hover:bg-[#E7EBF1] border border-[#E2E6EC] rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" aria-hidden="true" />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New Script</span>
          </button>
        </div>
      </div>
    </header>
  );
}
