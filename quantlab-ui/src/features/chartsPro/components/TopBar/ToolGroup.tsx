/**
 * ToolGroup.tsx
 * Wrapper for organizing toolbar controls into logical groups.
 * Provides consistent spacing, borders, and visual separation.
 */

interface ToolGroupProps {
  children: React.ReactNode;
  label?: string;
  className?: string;
}

export function ToolGroup({ children, label, className = "" }: ToolGroupProps) {
  return (
    <div
        className={`
          flex items-center
          border-r border-slate-700/30 last:border-r-0
          w-full md:w-auto md:flex-none
          ${className}
        `}
        style={{
          gap: 'var(--cp-gap-xs)',
          padding: 'var(--cp-pad-xs) var(--cp-pad-sm)',
        }}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}
