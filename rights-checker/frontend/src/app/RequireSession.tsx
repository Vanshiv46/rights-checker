import { Navigate, Outlet } from 'react-router-dom';
import { useSessionStore } from '../features/session/store';

/** Sends people back to the start when there is no session (or no household yet). */
export function RequireSession({ needMembers = false }: { needMembers?: boolean }) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const memberCount = useSessionStore((s) => s.members.length);
  if (!sessionId || (needMembers && memberCount === 0)) return <Navigate to="/" replace />;
  return <Outlet />;
}
