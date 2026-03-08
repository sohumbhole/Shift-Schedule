import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home, Users, Settings, Flame, CalendarDays, LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

const navItems = [
  { name: "Home", page: "Home", icon: Home },
  { name: "Dashboard", page: "Dashboard", icon: CalendarDays },
  { name: "Employees", page: "Employees", icon: Users },
  { name: "Settings", page: "Settings", icon: Settings },
];

export default function Layout({ children, currentPageName }) {
  const { logout } = useAuth();

  if (currentPageName === "Home") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Top nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <Link
              to={createPageUrl("Home")}
              className="flex items-center gap-2.5"
            >
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-sm">
                <Flame className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-gray-900 text-lg tracking-tight hidden sm:block">
                Restaurant Scheduler
              </span>
            </Link>

            <div className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = currentPageName === item.page;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.page}
                    to={createPageUrl(item.page)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200
                      ${isActive
                        ? "bg-orange-50 text-orange-600"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{item.name}</span>
                  </Link>
                );
              })}

              {/* Sign Out button */}
              <button
                onClick={() => logout()}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-gray-500 hover:text-red-600 hover:bg-red-50 ml-1"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}