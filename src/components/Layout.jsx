import { Outlet, Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, BookOpen, Brain, Calendar,
  TrendingUp, Library, Settings, LogOut, FileText
} from "lucide-react";
import { studybridge } from "@/api/studybridgeClient";
import { useState, useEffect } from "react";
import { isDesktopApp } from "@/lib/runtime";
import { useLocale } from "@/lib/locale";
import GlobalTutorDrawer from "@/components/GlobalTutorDrawer";

const navItems = [
  { path: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { path: "/courses", labelKey: "nav.courses", icon: BookOpen },
  { path: "/study", labelKey: "nav.study", icon: Brain },
  { path: "/planner", labelKey: "nav.planner", icon: Calendar },
  { path: "/progress", labelKey: "nav.progress", icon: TrendingUp },
  { path: "/library", labelKey: "nav.library", icon: Library },
  { path: "/docs", labelKey: "nav.docs", icon: FileText },
  { path: "/settings", labelKey: "nav.settings", icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const collapsed = false;
  const { t } = useLocale();
  const isDesktop = isDesktopApp();

  useEffect(() => {
    studybridge.auth.me().then(setUser).catch(() => {});
  }, []);

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-60'} bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-200 shrink-0`}>
        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
                <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{t(item.labelKey)}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium shrink-0">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{user?.full_name || 'Student'}</p>
                <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email || ''}</p>
              </div>
            )}
            {!collapsed && !isDesktop && (
              <button 
                onClick={() => studybridge.auth.logout()} 
                className="text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full overflow-hidden">
          <Outlet />
        </div>
      </main>
      <GlobalTutorDrawer />
    </div>
  );
}
