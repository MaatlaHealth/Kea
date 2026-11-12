"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group rounded-lg border border-border bg-card text-sm text-foreground shadow-raised",
          title: "font-medium",
          description: "text-muted-foreground",
          actionButton: "bg-plum-700 text-white",
          cancelButton: "bg-muted text-foreground",
          error: "border-coral-200",
          success: "border-emerald-200",
        },
      }}
    />
  );
}
