import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404: rota não encontrada ->", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4">
      <div className="text-center">
        <h1 className="mb-3 text-5xl font-bold">404</h1>
        <p className="mb-4 text-muted-foreground">A página que você tentou acessar não existe.</p>
        <a href="/dashboard" className="text-primary underline underline-offset-4 hover:text-primary/80">
          Voltar para o dashboard
        </a>
      </div>
    </div>
  );
};

export default NotFound;
