import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { authApi } from "@/integrations/api";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Array<"admin" | "supervisor" | "coordenador">;
  unauthorizedRedirect?: string;
}

interface StoredUser {
  role?: "admin" | "supervisor" | "coordenador";
}

export const ProtectedRoute = ({ children, allowedRoles, unauthorizedRedirect = "/dashboard" }: ProtectedRouteProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [hasPermission, setHasPermission] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        setIsAuthenticated(false);
        return;
      }

      try {
        await authApi.verify();
        if (allowedRoles?.length) {
          const rawUser = localStorage.getItem("user");
          if (!rawUser) {
            setHasPermission(false);
          } else {
            try {
              const parsed = JSON.parse(rawUser) as StoredUser;
              setHasPermission(Boolean(parsed.role && allowedRoles.includes(parsed.role)));
            } catch {
              setHasPermission(false);
            }
          }
        } else {
          setHasPermission(true);
        }
        setIsAuthenticated(true);
      } catch {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user");
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, [allowedRoles]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 mx-auto mb-4 rounded-full border-b-2 border-primary animate-spin" />
          <p className="text-muted-foreground">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (!hasPermission) {
    return <Navigate to={unauthorizedRedirect} replace />;
  }

  return <>{children}</>;
};
