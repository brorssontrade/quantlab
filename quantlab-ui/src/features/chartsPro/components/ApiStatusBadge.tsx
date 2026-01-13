/**
 * ApiStatusBadge.tsx
 *
 * Sprint TV-3: Visual indicator for backend API health status
 *
 * Shows:
 * - "API: ON" (green) when backend reachable
 * - "API: OFF — Start on :8000" (red) when unreachable
 * - Tooltip with last error message
 */

import { useEffect, useState } from 'react';
import {
  healthCheck,
  startHealthCheckPoll,
  stopHealthCheckPoll,
  type HealthCheckResult,
} from '../runtime/dataClient';

interface ApiStatusBadgeProps {
  className?: string;
}

export function ApiStatusBadge({ className = '' }: ApiStatusBadgeProps): JSX.Element {
  const [status, setStatus] = useState<HealthCheckResult | null>(null);

  useEffect(() => {
    // Start polling on mount
    startHealthCheckPoll(5000, (result) => {
      setStatus(result);
    });

    // Cleanup on unmount
    return () => {
      stopHealthCheckPoll();
    };
  }, []);

  if (!status) {
    return (
      <div className={`flex items-center gap-1.5 text-xs ${className}`}>
        <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
        <span className="text-gray-400">Checking...</span>
      </div>
    );
  }

  const isOnline = status.status === 'online';
  const bgColor = isOnline ? 'bg-green-500' : 'bg-red-500';
  const textColor = isOnline ? 'text-green-600' : 'text-red-600';
  const label = isOnline ? 'API: ON' : 'API: OFF — Start on :8000';

  return (
    <div
      className={`flex items-center gap-1.5 text-xs ${className}`}
      title={status.message || ''}
    >
      <div className={`w-2 h-2 rounded-full ${bgColor}`} />
      <span className={textColor}>{label}</span>
    </div>
  );
}
