"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeCtxValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeCtx = createContext<ThemeCtxValue>({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("docya-theme") as Theme) ?? "dark";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("docya-theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
