export function PageLoader() {
  return (
    <div className="min-h-screen bg-agro-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-agro-primary/20 border-t-agro-primary rounded-full animate-spin" />
        <p className="text-agro-text/40 text-xs font-semibold uppercase tracking-widest">Cargando...</p>
      </div>
    </div>
  );
}
