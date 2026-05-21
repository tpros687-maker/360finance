export interface NotaCuaderno {
  id: number;
  user_id: number;
  potrero_id: number | null;
  texto: string;
  created_at: string;
}

export interface NotaCreate {
  texto: string;
  potrero_id?: number | null;
}

export interface TareaCuaderno {
  id: number;
  user_id: number;
  potrero_id: number | null;
  texto: string;
  fecha_planificada: string | null;
  completada: boolean;
  completed_at: string | null;
  notificar_dias_antes: number | null;
  created_at: string;
}

export interface TareaCreate {
  texto: string;
  fecha_planificada?: string | null;
  potrero_id?: number | null;
  notificar_dias_antes?: number | null;
}
