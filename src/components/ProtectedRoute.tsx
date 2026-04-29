import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { authApi } from "@/integrations/api";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Array<"admin" | "supervisor" | "coordenador" | "aguardando">;
  unauthorizedRedirect?: string;
  allowPendingUser?: boolean;
}

interface StoredUser {
  role?: "admin" | "supervisor" | "coordenador" | "aguardando";
}

export const ProtectedRoute = ({
  children,
  allowedRoles,
  unauthorizedRedirect = "/dashboard",
  allowPendingUser = false,
}: ProtectedRouteProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [hasPermission, setHasPermission] = useState(true);
  const [userRole, setUserRole] = useState<StoredUser["role"] | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        setIsAuthenticated(false);
        return;
      }

      try {
        const response = await authApi.verify();
        const verifiedUser = response.data?.user as StoredUser | undefined;

        if (verifiedUser) {
          localStorage.setItem("user", JSON.stringify(verifiedUser));
        }

        const rawUser = localStorage.getItem("user");
        let parsedRole: StoredUser["role"] | null = null;
        if (rawUser) {
          try {
            const parsed = JSON.parse(rawUser) as StoredUser;
            parsedRole = parsed.role || null;
          } catch {
            parsedRole = null;
          }
        }

        setUserRole(verifiedUser?.role || parsedRole || null);

        if (allowedRoles?.length) {
          const effectiveRole = verifiedUser?.role || parsedRole;
          setHasPermission(Boolean(effectiveRole && allowedRoles.includes(effectiveRole)));
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
  }, [allowPendingUser, allowedRoles]);

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

  if (userRole === "aguardando" && !allowPendingUser) {
    return <Navigate to="/dashboard/aguardando" replace />;
  }

  if (!hasPermission) {
    return <Navigate to={unauthorizedRedirect} replace />;
  }

  return <>{children}</>;
};

