"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AuthContextType {
  isLoggedIn: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// 默认账户密码
const VALID_CREDENTIALS = {
  username: "tantan2024",
  password: "tantan2024",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // 从 localStorage 恢复登录状态
  useEffect(() => {
    const saved = localStorage.getItem("tantan_auth");
    if (saved === "true") {
      setIsLoggedIn(true);
    }
    setIsHydrated(true);
  }, []);

  const login = (username: string, password: string) => {
    if (username === VALID_CREDENTIALS.username && 
        password === VALID_CREDENTIALS.password) {
      setIsLoggedIn(true);
      localStorage.setItem("tantan_auth", "true");
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem("tantan_auth");
  };

  // 避免 hydration 不匹配
  if (!isHydrated) {
    return <>{children}</>;
  }

  return (
    <AuthContext.Provider value={{ isLoggedIn, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

