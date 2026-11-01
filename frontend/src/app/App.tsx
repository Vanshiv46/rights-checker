import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAppBootstrap } from '../features/session/hooks';
import { Layout } from './Layout';
import { RequireSession } from './RequireSession';

const Language = lazy(() => import('../screens/Language'));
const Consent = lazy(() => import('../screens/Consent'));
const Household = lazy(() => import('../screens/Household'));
const Results = lazy(() => import('../screens/Results'));
const SchemeDetail = lazy(() => import('../screens/SchemeDetail'));
const Checklist = lazy(() => import('../screens/Checklist'));
const SavedResults = lazy(() => import('../screens/SavedResults'));
const OperatorLogin = lazy(() => import('../screens/OperatorLogin'));
const AdminRules = lazy(() => import('../screens/AdminRules'));

export function App() {
  useAppBootstrap();
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Language />} />
        <Route path="consent" element={<Consent />} />
        <Route path="saved" element={<SavedResults />} />
        <Route path="operator" element={<OperatorLogin />} />
        <Route path="admin" element={<AdminRules />} />
        <Route element={<RequireSession />}>
          <Route path="household" element={<Household />} />
          <Route path="results" element={<Results />} />
          <Route path="scheme/:code" element={<SchemeDetail />} />
          <Route path="checklist/:code" element={<Checklist />} />
        </Route>
        <Route path="questions" element={<Navigate to="/household" replace />} />
      </Route>
    </Routes>
  );
}
