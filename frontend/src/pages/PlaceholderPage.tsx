interface Props {
  title: string;
  description?: string;
}

export default function PlaceholderPage({ title, description }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center h-full p-6">
      <h2 className="text-xl font-semibold text-slate-300">{title}</h2>
      {description && <p className="text-slate-500 mt-2 text-sm">{description}</p>}
      <p className="mt-4 text-xs text-slate-600">Próximamente disponible</p>
    </div>
  );
}
