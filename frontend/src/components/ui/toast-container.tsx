"use client";

import { Toast } from "@/hooks/use-toast";
import { X } from "lucide-react";

interface ToastContainerProps {
  toasts: Toast[];
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`max-w-sm w-full bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 p-4 ${
            toast.variant === "destructive"
              ? "border-red-500"
              : toast.variant === "success"
              ? "border-green-500"
              : "border-gray-200"
          }`}
        >
          <div className="flex items-start">
            <div className="flex-1">
              {toast.title && (
                <h4 className="text-sm font-medium text-gray-900">
                  {toast.title}
                </h4>
              )}
              {toast.description && (
                <p className="mt-1 text-sm text-gray-500">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              className="ml-4 text-gray-400 hover:text-gray-600"
              onClick={() => {
                // This would need to be passed down from the Toaster component
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
