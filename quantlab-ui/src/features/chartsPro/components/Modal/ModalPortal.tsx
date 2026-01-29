/**
 * ModalPortal.tsx
 * 
 * TV-18.1: Central Modal Framework (Portal)
 * 
 * Generic modal component that renders via React portal (over entire app).
 * Features:
 * - Overlay with click-outside to close
 * - Esc key to close
 * - Focus trap (initial focus on first focusable element)
 * - data-testid for modal-root, modal-overlay, modal-content
 * - Integrates with dump().ui.modal = { open, kind }
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ModalPortalProps {
  open: boolean;
  kind: string;
  onClose: () => void;
  children: React.ReactNode;
  initialFocusSelector?: string; // Optional CSS selector for initial focus
}

export function ModalPortal({ open, kind, onClose, children, initialFocusSelector }: ModalPortalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Handle Esc key
  useEffect(() => {
    if (!open) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleEsc, true); // Capture phase for priority
    return () => window.removeEventListener("keydown", handleEsc, true);
  }, [open, onClose]);

  // Handle click-outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (overlayRef.current && e.target === overlayRef.current) {
        onClose();
      }
    };

    // Slight delay to avoid closing on same click that opened modal
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, onClose]);

  // Initial focus management
  useEffect(() => {
    if (!open || !contentRef.current) return;

    const focusableElements = contentRef.current.querySelectorAll<HTMLElement>(
      initialFocusSelector || 'input, button, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }, [open, initialFocusSelector]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      data-testid="modal-overlay"
      data-overlay-ui="true"
      className="fixed inset-0 z-[100] flex items-center justify-center cp-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={contentRef}
        data-testid="modal-content"
        data-modal-kind={kind}
        className="relative max-h-[80vh] mx-4"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
