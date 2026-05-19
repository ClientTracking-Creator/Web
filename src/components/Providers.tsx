"use client";

import { AuthProvider } from "@/context/AuthContext";
import { ClientProvider } from "@/context/ClientContext";
import { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ClientProvider>{children}</ClientProvider>
    </AuthProvider>
  );
}

