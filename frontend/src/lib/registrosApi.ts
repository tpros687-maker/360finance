import { api } from "./axios";
import type {
  ExportFilters,
  ExtraerComprobanteResponse,
  PaginatedRegistros,
  Registro,
  RegistroCreate,
  RegistroFilters,
  RegistroUpdate,
  ResumenResponse,
} from "@/types/registros";

export async function getRegistros(filters: RegistroFilters): Promise<PaginatedRegistros> {
  const params: Record<string, string | number> = {
    page: filters.page,
    limit: filters.limit,
  };
  if (filters.tipo) params.tipo = filters.tipo;
  if (filters.categoria_id) params.categoria_id = filters.categoria_id;
  if (filters.potrero_id) params.potrero_id = filters.potrero_id;
  if (filters.fecha_desde) params.fecha_desde = filters.fecha_desde;
  if (filters.fecha_hasta) params.fecha_hasta = filters.fecha_hasta;
  if (filters.q) params.q = filters.q;

  const res = await api.get<PaginatedRegistros>("/registros", { params });
  return res.data;
}

export async function createRegistro(data: RegistroCreate): Promise<Registro> {
  const res = await api.post<Registro>("/registros", data);
  return res.data;
}

export async function updateRegistro(id: number, data: RegistroUpdate): Promise<Registro> {
  const res = await api.put<Registro>(`/registros/${id}`, data);
  return res.data;
}

export async function deleteRegistro(id: number): Promise<void> {
  await api.delete(`/registros/${id}`);
}

export async function getResumen(): Promise<ResumenResponse> {
  const res = await api.get<ResumenResponse>("/registros/resumen");
  return res.data;
}

export async function uploadComprobante(registroId: number, file: File): Promise<Registro> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<Registro>(`/registros/${registroId}/comprobante`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function extraerComprobante(file: File): Promise<ExtraerComprobanteResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<ExtraerComprobanteResponse>(
    "/registros/extraer-comprobante",
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return res.data;
}

export async function exportarRegistros(filters: ExportFilters): Promise<void> {
  const params: Record<string, string | number> = { formato: filters.formato };
  if (filters.tipo) params.tipo = filters.tipo;
  if (filters.categoria_id) params.categoria_id = filters.categoria_id;
  if (filters.potrero_id) params.potrero_id = filters.potrero_id;
  if (filters.fecha_desde) params.fecha_desde = filters.fecha_desde;
  if (filters.fecha_hasta) params.fecha_hasta = filters.fecha_hasta;
  if (filters.q) params.q = filters.q;

  const res = await api.get("/registros/exportar", {
    params,
    responseType: "blob",
  });

  const ext = filters.formato === "excel" ? "xlsx" : "pdf";
  const mime =
    filters.formato === "excel"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/pdf";

  const blob = new Blob([res.data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `registros.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
