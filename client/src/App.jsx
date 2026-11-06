import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth.jsx";
import { AppLayout } from "./layouts/AppLayout.jsx";
import { Login } from "./pages/Login.jsx";
import { Home } from "./pages/Home.jsx";
import { Roles } from "./pages/Roles.jsx";
import { Audit } from "./pages/Audit.jsx";
import { Catalogs } from "./pages/Catalogs.jsx";
import { Cases } from "./pages/Cases.jsx";
import { CaseForm } from "./pages/CaseForm.jsx";
import { CaseDetail } from "./pages/CaseDetail.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
function Permission({ code, children }) {
  return useAuth().user.permissoes.includes(code) ? (
    children
  ) : (
    <Navigate to="/" replace />
  );
}
function SessionRoutes() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="boot" role="status">
        Carregando ambiente seguro…
      </div>
    );
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          index
          element={
            user.permissoes.includes("indicadores.consultar") ? (
              <Dashboard />
            ) : (
              <Home />
            )
          }
        />
        <Route
          path="cadastros"
          element={
            <Permission code="cadastros.gerenciar">
              <Catalogs />
            </Permission>
          }
        />
        <Route path="manifestacoes" element={<Cases />} />
        <Route
          path="manifestacoes/nova"
          element={
            <Permission code="manifestacoes.criar">
              <CaseForm />
            </Permission>
          }
        />
        <Route path="manifestacoes/:id" element={<CaseDetail />} />
        <Route
          path="manifestacoes/:id/editar"
          element={
            <Permission code="manifestacoes.editar">
              <CaseForm />
            </Permission>
          }
        />
        <Route
          path="relatorios"
          element={
            <Permission code="indicadores.consultar">
              <Dashboard reports />
            </Permission>
          }
        />
        <Route
          path="perfis"
          element={
            <Permission code="usuarios.gerenciar">
              <Roles />
            </Permission>
          }
        />
        <Route
          path="auditoria"
          element={
            <Permission code="auditoria.consultar">
              <Audit />
            </Permission>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
export function App() {
  return (
    <AuthProvider>
      <SessionRoutes />
    </AuthProvider>
  );
}
