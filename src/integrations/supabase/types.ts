export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      capacidad_dia: {
        Row: {
          autorizado_por: string | null
          equipo_id: string
          fecha: string
          id: string
          minutos_extra: number
          motivo: string | null
          sin_capacidad: boolean
        }
        Insert: {
          autorizado_por?: string | null
          equipo_id: string
          fecha: string
          id?: string
          minutos_extra?: number
          motivo?: string | null
          sin_capacidad?: boolean
        }
        Update: {
          autorizado_por?: string | null
          equipo_id?: string
          fecha?: string
          id?: string
          minutos_extra?: number
          motivo?: string | null
          sin_capacidad?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "capacidad_dia_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          correo: string | null
          creado: string
          id: string
          nombre: string
          telefono: string | null
          tipo: string
        }
        Insert: {
          correo?: string | null
          creado?: string
          id?: string
          nombre: string
          telefono?: string | null
          tipo?: string
        }
        Update: {
          correo?: string | null
          creado?: string
          id?: string
          nombre?: string
          telefono?: string | null
          tipo?: string
        }
        Relationships: []
      }
      coberturas: {
        Row: {
          id: string
          nombre: string
          recargo: number
        }
        Insert: {
          id?: string
          nombre: string
          recargo?: number
        }
        Update: {
          id?: string
          nombre?: string
          recargo?: number
        }
        Relationships: []
      }
      cobros: {
        Row: {
          clave_idempotencia: string | null
          creado: string
          creado_por: string | null
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          orden_id: string
          tipo: string
        }
        Insert: {
          clave_idempotencia?: string | null
          creado?: string
          creado_por?: string | null
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          orden_id: string
          tipo: string
        }
        Update: {
          clave_idempotencia?: string | null
          creado?: string
          creado_por?: string | null
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          orden_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobros_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          caducidad: string | null
          cantidad: number
          costo: number
          creado: string
          estado: string
          fecha_llegada: string
          id: string
          insumo_id: string
        }
        Insert: {
          caducidad?: string | null
          cantidad: number
          costo: number
          creado?: string
          estado?: string
          fecha_llegada: string
          id?: string
          insumo_id: string
        }
        Update: {
          caducidad?: string | null
          cantidad?: number
          costo?: number
          creado?: string
          estado?: string
          fecha_llegada?: string
          id?: string
          insumo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      consumos: {
        Row: {
          cantidad: number
          costo: number
          creado: string
          creado_por: string | null
          id: string
          insumo_id: string
          lote_id: string
          orden_id: string
          tarea_id: string
        }
        Insert: {
          cantidad: number
          costo: number
          creado?: string
          creado_por?: string | null
          id?: string
          insumo_id: string
          lote_id: string
          orden_id: string
          tarea_id: string
        }
        Update: {
          cantidad?: number
          costo?: number
          creado?: string
          creado_por?: string | null
          id?: string
          insumo_id?: string
          lote_id?: string
          orden_id?: string
          tarea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumos_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumos_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      cotizaciones: {
        Row: {
          creado: string
          detalle: Json
          estado: string
          id: string
          orden_id: string
          precio: number
        }
        Insert: {
          creado?: string
          detalle?: Json
          estado?: string
          id?: string
          orden_id: string
          precio: number
        }
        Update: {
          creado?: string
          detalle?: Json
          estado?: string
          id?: string
          orden_id?: string
          precio?: number
        }
        Relationships: [
          {
            foreignKeyName: "cotizaciones_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipos: {
        Row: {
          costo_minuto: number
          etapa: string
          hora_fin: string
          hora_inicio: string
          id: string
          minutos_diarios: number
          nombre: string
          orden_etapa: number
          personas: number
        }
        Insert: {
          costo_minuto?: number
          etapa: string
          hora_fin?: string
          hora_inicio?: string
          id?: string
          minutos_diarios: number
          nombre: string
          orden_etapa: number
          personas?: number
        }
        Update: {
          costo_minuto?: number
          etapa?: string
          hora_fin?: string
          hora_inicio?: string
          id?: string
          minutos_diarios?: number
          nombre?: string
          orden_etapa?: number
          personas?: number
        }
        Relationships: []
      }
      factura_renglones: {
        Row: {
          cantidad: number
          concepto: string
          factura_id: string
          id: string
          importe: number
        }
        Insert: {
          cantidad?: number
          concepto: string
          factura_id: string
          id?: string
          importe: number
        }
        Update: {
          cantidad?: number
          concepto?: string
          factura_id?: string
          id?: string
          importe?: number
        }
        Relationships: [
          {
            foreignKeyName: "factura_renglones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas_internas"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas_internas: {
        Row: {
          emitida: string
          estado: string
          folio: string | null
          id: string
          motivo_cancelacion: string | null
          numero: number
          orden_id: string
          pagada: string | null
          total: number
        }
        Insert: {
          emitida?: string
          estado?: string
          folio?: string | null
          id?: string
          motivo_cancelacion?: string | null
          numero: number
          orden_id: string
          pagada?: string | null
          total?: number
        }
        Update: {
          emitida?: string
          estado?: string
          folio?: string | null
          id?: string
          motivo_cancelacion?: string | null
          numero?: number
          orden_id?: string
          pagada?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "facturas_internas_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      folios: {
        Row: {
          serie: string
          ultimo: number
        }
        Insert: {
          serie: string
          ultimo: number
        }
        Update: {
          serie?: string
          ultimo?: number
        }
        Relationships: []
      }
      insumos: {
        Row: {
          costo: number
          id: string
          nombre: string
          unidad: string
        }
        Insert: {
          costo: number
          id?: string
          nombre: string
          unidad: string
        }
        Update: {
          costo?: number
          id?: string
          nombre?: string
          unidad?: string
        }
        Relationships: []
      }
      lotes: {
        Row: {
          caducidad: string
          cantidad: number
          codigo: string
          costo: number
          disponible: number
          id: string
          insumo_id: string
          recibido: string
        }
        Insert: {
          caducidad: string
          cantidad: number
          codigo: string
          costo: number
          disponible: number
          id?: string
          insumo_id: string
          recibido?: string
        }
        Update: {
          caducidad?: string
          cantidad?: number
          codigo?: string
          costo?: number
          disponible?: number
          id?: string
          insumo_id?: string
          recibido?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_merma: {
        Row: {
          cantidad: number
          costo: number
          creado: string
          creado_por: string | null
          id: string
          insumo_id: string
          lote_id: string | null
          motivo: string
          orden_id: string | null
          tarea_id: string | null
        }
        Insert: {
          cantidad: number
          costo: number
          creado?: string
          creado_por?: string | null
          id?: string
          insumo_id: string
          lote_id?: string | null
          motivo: string
          orden_id?: string | null
          tarea_id?: string | null
        }
        Update: {
          cantidad?: number
          costo?: number
          creado?: string
          creado_por?: string | null
          id?: string
          insumo_id?: string
          lote_id?: string | null
          motivo?: string
          orden_id?: string | null
          tarea_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_merma_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_merma_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_merma_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_merma_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      niveles_diseno: {
        Row: {
          dias_plazo: number
          id: string
          minutos_por_10: number
          nombre: string
          recargo: number
        }
        Insert: {
          dias_plazo: number
          id?: string
          minutos_por_10: number
          nombre: string
          recargo?: number
        }
        Update: {
          dias_plazo?: number
          id?: string
          minutos_por_10?: number
          nombre?: string
          recargo?: number
        }
        Relationships: []
      }
      ordenes: {
        Row: {
          actualizado: string
          cliente_id: string
          cobertura_id: string
          creado: string
          creado_por: string | null
          descripcion: string | null
          direccion: string | null
          entrega_autorizada_motivo: string | null
          envio_compartido_con: string | null
          estado: Database["public"]["Enums"]["estado_orden"]
          fecha_entrega: string
          folio: number
          id: string
          modo_entrega: Database["public"]["Enums"]["modo_entrega"]
          nivel_id: string
          porciones: number
          precio: number
          recargo_urgencia: number
          relleno_id: string
          sabor_id: string
          tipo_id: string
        }
        Insert: {
          actualizado?: string
          cliente_id: string
          cobertura_id: string
          creado?: string
          creado_por?: string | null
          descripcion?: string | null
          direccion?: string | null
          entrega_autorizada_motivo?: string | null
          envio_compartido_con?: string | null
          estado?: Database["public"]["Enums"]["estado_orden"]
          fecha_entrega: string
          folio?: number
          id?: string
          modo_entrega?: Database["public"]["Enums"]["modo_entrega"]
          nivel_id: string
          porciones: number
          precio?: number
          recargo_urgencia?: number
          relleno_id: string
          sabor_id: string
          tipo_id: string
        }
        Update: {
          actualizado?: string
          cliente_id?: string
          cobertura_id?: string
          creado?: string
          creado_por?: string | null
          descripcion?: string | null
          direccion?: string | null
          entrega_autorizada_motivo?: string | null
          envio_compartido_con?: string | null
          estado?: Database["public"]["Enums"]["estado_orden"]
          fecha_entrega?: string
          folio?: number
          id?: string
          modo_entrega?: Database["public"]["Enums"]["modo_entrega"]
          nivel_id?: string
          porciones?: number
          precio?: number
          recargo_urgencia?: number
          relleno_id?: string
          sabor_id?: string
          tipo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_cobertura_id_fkey"
            columns: ["cobertura_id"]
            isOneToOne: false
            referencedRelation: "coberturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_envio_compartido_con_fkey"
            columns: ["envio_compartido_con"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_nivel_id_fkey"
            columns: ["nivel_id"]
            isOneToOne: false
            referencedRelation: "niveles_diseno"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_relleno_id_fkey"
            columns: ["relleno_id"]
            isOneToOne: false
            referencedRelation: "rellenos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_sabor_id_fkey"
            columns: ["sabor_id"]
            isOneToOne: false
            referencedRelation: "sabores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_pastel"
            referencedColumns: ["id"]
          },
        ]
      }
      recetas: {
        Row: {
          cantidad_por_10: number
          componente: Database["public"]["Enums"]["tipo_componente"]
          componente_id: string
          id: string
          insumo_id: string
        }
        Insert: {
          cantidad_por_10: number
          componente: Database["public"]["Enums"]["tipo_componente"]
          componente_id: string
          id?: string
          insumo_id: string
        }
        Update: {
          cantidad_por_10?: number
          componente?: Database["public"]["Enums"]["tipo_componente"]
          componente_id?: string
          id?: string
          insumo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recetas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      rellenos: {
        Row: {
          id: string
          nombre: string
          recargo: number
        }
        Insert: {
          id?: string
          nombre: string
          recargo?: number
        }
        Update: {
          id?: string
          nombre?: string
          recargo?: number
        }
        Relationships: []
      }
      reservas: {
        Row: {
          cantidad: number
          id: string
          insumo_id: string
          necesaria_para: string
          orden_id: string
        }
        Insert: {
          cantidad: number
          id?: string
          insumo_id: string
          necesaria_para: string
          orden_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          insumo_id?: string
          necesaria_para?: string
          orden_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      sabores: {
        Row: {
          id: string
          nombre: string
          recargo: number
        }
        Insert: {
          id?: string
          nombre: string
          recargo?: number
        }
        Update: {
          id?: string
          nombre?: string
          recargo?: number
        }
        Relationships: []
      }
      tareas: {
        Row: {
          dia: string
          editada_manual: boolean
          equipo_id: string
          estado: Database["public"]["Enums"]["estado_tarea"]
          etapa: string
          fin: string
          finalizada_en: string | null
          id: string
          iniciada_en: string | null
          inicio: string
          minutos: number
          orden_etapa: number
          orden_id: string
          requiere_revision: boolean
        }
        Insert: {
          dia: string
          editada_manual?: boolean
          equipo_id: string
          estado?: Database["public"]["Enums"]["estado_tarea"]
          etapa: string
          fin: string
          finalizada_en?: string | null
          id?: string
          iniciada_en?: string | null
          inicio: string
          minutos: number
          orden_etapa: number
          orden_id: string
          requiere_revision?: boolean
        }
        Update: {
          dia?: string
          editada_manual?: boolean
          equipo_id?: string
          estado?: Database["public"]["Enums"]["estado_tarea"]
          etapa?: string
          fin?: string
          finalizada_en?: string | null
          id?: string
          iniciada_en?: string | null
          inicio?: string
          minutos?: number
          orden_etapa?: number
          orden_id?: string
          requiere_revision?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tareas_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_pastel: {
        Row: {
          escultorico: boolean
          id: string
          max_porciones: number
          min_porciones: number
          nombre: string
          pisos: number
          precio_base: number
          requiere_montaje: boolean
        }
        Insert: {
          escultorico?: boolean
          id?: string
          max_porciones: number
          min_porciones: number
          nombre: string
          pisos?: number
          precio_base: number
          requiere_montaje?: boolean
        }
        Update: {
          escultorico?: boolean
          id?: string
          max_porciones?: number
          min_porciones?: number
          nombre?: string
          pisos?: number
          precio_base?: number
          requiere_montaje?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          correo: string | null
          creado: string
          equipo_id: string | null
          nombre: string
          user_id: string
        }
        Insert: {
          correo?: string | null
          creado?: string
          equipo_id?: string | null
          nombre: string
          user_id: string
        }
        Update: {
          correo?: string | null
          creado?: string
          equipo_id?: string | null
          nombre?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _caducar_lotes: { Args: never; Returns: number }
      _cargo_entrega: {
        Args: { m: Database["public"]["Enums"]["modo_entrega"] }
        Returns: number
      }
      _confirmar: {
        Args: {
          p_clave: string
          p_metodo: Database["public"]["Enums"]["metodo_pago"]
          p_monto: number
          p_orden: string
          p_usuario: string
        }
        Returns: Json
      }
      _descontar: {
        Args: { p_cantidad: number; p_insumo: string }
        Returns: {
          cantidad: number
          costo: number
          lote_id: string
        }[]
      }
      _disponible_para: {
        Args: { p_excluir: string; p_insumo: string; p_para: string }
        Returns: number
      }
      _generar_plan: { Args: { p_orden: string }; Returns: undefined }
      _minutos_etapa: {
        Args: {
          p_etapa: string
          p_modo: Database["public"]["Enums"]["modo_entrega"]
          p_nivel: string
          p_porciones: number
        }
        Returns: number
      }
      _necesidad: {
        Args: { p_orden: string }
        Returns: {
          cantidad: number
          insumo_id: string
        }[]
      }
      _necesidad_fechas: {
        Args: { p_orden: string }
        Returns: {
          cantidad: number
          insumo_id: string
          para: string
        }[]
      }
      _nuevo_folio: { Args: never; Returns: number }
      _planificar: { Args: { p_orden: string }; Returns: Json }
      _plazo_dias: {
        Args: { p_nivel: string; p_tipo: string }
        Returns: number
      }
      _plazo_porciones: {
        Args: { p_nivel: string; p_porciones: number }
        Returns: number
      }
      _precio: {
        Args: {
          p_cobertura: string
          p_modo: Database["public"]["Enums"]["modo_entrega"]
          p_nivel: string
          p_porciones: number
          p_relleno: string
          p_sabor: string
          p_tipo: string
        }
        Returns: number
      }
      _primera_fecha: {
        Args: { p_nivel: string; p_tipo: string }
        Returns: string
      }
      _primera_fecha_porciones: {
        Args: { p_nivel: string; p_porciones: number }
        Returns: string
      }
      _puede_tarea: {
        Args: { p_tarea: string }
        Returns: {
          dia: string
          editada_manual: boolean
          equipo_id: string
          estado: Database["public"]["Enums"]["estado_tarea"]
          etapa: string
          fin: string
          finalizada_en: string | null
          id: string
          iniciada_en: string | null
          inicio: string
          minutos: number
          orden_etapa: number
          orden_id: string
          requiere_revision: boolean
        }
        SetofOptions: {
          from: "*"
          to: "tareas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _renglones_orden: {
        Args: { p_orden: string }
        Returns: {
          cantidad: number
          concepto: string
          importe: number
        }[]
      }
      _tz: { Args: never; Returns: string }
      _usados: {
        Args: { p_dia: string; p_equipo: string; p_excluir: string }
        Returns: number
      }
      _validar_entrega: {
        Args: {
          p_fecha: string
          p_modo: Database["public"]["Enums"]["modo_entrega"]
          p_tipo: string
        }
        Returns: undefined
      }
      _validar_pedido: {
        Args: {
          p_fecha: string
          p_nivel: string
          p_porciones: number
          p_tipo: string
        }
        Returns: undefined
      }
      autorizar_horas_extra: {
        Args: {
          p_equipo: string
          p_fecha: string
          p_minutos: number
          p_motivo: string
        }
        Returns: undefined
      }
      avance_pedidos: {
        Args: { p_ordenes: string[] }
        Returns: {
          equipo: string
          estado: string
          etapa: string
          orden_etapa: number
          orden_id: string
        }[]
      }
      caducar_lotes: { Args: never; Returns: number }
      cambiar_orden: {
        Args: {
          p_cobertura: string
          p_fecha?: string
          p_orden: string
          p_porciones: number
          p_relleno: string
          p_sabor: string
        }
        Returns: Json
      }
      cancelar_factura: {
        Args: { p_factura: string; p_motivo: string }
        Returns: undefined
      }
      cancelar_orden: {
        Args: {
          p_metodo: Database["public"]["Enums"]["metodo_pago"]
          p_motivo: string
          p_orden: string
        }
        Returns: Json
      }
      compartir_envio: {
        Args: { p_compartir: boolean; p_con: string; p_orden: string }
        Returns: Json
      }
      confirmar_orden: {
        Args: {
          p_clave: string
          p_metodo: Database["public"]["Enums"]["metodo_pago"]
          p_monto: number
          p_orden: string
        }
        Returns: Json
      }
      cotizar: {
        Args: {
          p_cobertura: string
          p_fecha: string
          p_modo: Database["public"]["Enums"]["modo_entrega"]
          p_nivel: string
          p_porciones: number
          p_relleno: string
          p_sabor: string
          p_tipo: string
        }
        Returns: Json
      }
      finalizar_tarea: { Args: { p_tarea: string }; Returns: undefined }
      guardar_borrador: {
        Args: {
          p_cliente: string
          p_cobertura: string
          p_descripcion: string
          p_direccion: string
          p_fecha: string
          p_id: string
          p_modo: Database["public"]["Enums"]["modo_entrega"]
          p_nivel: string
          p_porciones: number
          p_relleno: string
          p_sabor: string
          p_tipo: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      iniciar_tarea: { Args: { p_tarea: string }; Returns: undefined }
      insumos_tarea: {
        Args: { p_tarea: string }
        Returns: {
          insumo_id: string
          nombre: string
          previsto: number
          unidad: string
        }[]
      }
      marcar_entregada: {
        Args: { p_motivo_autorizacion: string; p_orden: string }
        Returns: Json
      }
      marcar_factura_pagada: { Args: { p_factura: string }; Returns: undefined }
      marcar_sin_capacidad: {
        Args: { p_equipo: string; p_fecha: string; p_sin: boolean }
        Returns: undefined
      }
      marcar_tarea_revisada: { Args: { p_tarea: string }; Returns: undefined }
      mi_equipo: { Args: never; Returns: string }
      mi_rol: { Args: never; Returns: Database["public"]["Enums"]["app_role"] }
      mis_tareas: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          atrasada: boolean
          bloqueo_estado: string
          bloqueo_etapa: string
          cliente: string
          cobertura: string
          descripcion: string
          dia: string
          diseno: string
          editada_manual: boolean
          equipo: string
          estado: string
          etapa: string
          fecha_entrega: string
          fin: string
          folio: number
          id: string
          inicio: string
          minutos: number
          orden_id: string
          porciones: number
          relleno: string
          requiere_revision: boolean
          sabor: string
          tipo: string
        }[]
      }
      mover_tarea: {
        Args: { p_inicio: string; p_tarea: string }
        Returns: undefined
      }
      ocupacion: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          autorizado: boolean
          capacidad: number
          equipo: string
          equipo_id: string
          estado: string
          etapa: string
          fecha: string
          motivo: string
          sin_capacidad: boolean
          usados: number
        }[]
      }
      ordenes_en_riesgo: {
        Args: never
        Returns: {
          falta: number
          folio: number
          insumo: string
          necesaria_para: string
          orden_id: string
          unidad: string
        }[]
      }
      posponer_compra: {
        Args: { p_compra: string; p_fecha: string }
        Returns: undefined
      }
      recibir_compra: { Args: { p_compra: string }; Returns: undefined }
      registrar_cobro: {
        Args: {
          p_clave: string
          p_metodo: Database["public"]["Enums"]["metodo_pago"]
          p_monto: number
          p_orden: string
        }
        Returns: Json
      }
      registrar_consumo: {
        Args: { p_cantidad: number; p_insumo: string; p_tarea: string }
        Returns: Json
      }
      registrar_consumo_receta: { Args: { p_tarea: string }; Returns: Json }
      registrar_merma: {
        Args: {
          p_cantidad: number
          p_insumo: string
          p_motivo: string
          p_tarea: string
        }
        Returns: Json
      }
      rentabilidad: {
        Args: never
        Returns: {
          cliente: string
          costo_insumos: number
          costo_merma: number
          costo_minutos: number
          costo_total: number
          estado: string
          folio: number
          margen: number
          orden_id: string
          precio: number
        }[]
      }
      rol_en: {
        Args: { _roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      verificar_capacidad: {
        Args: {
          p_cobertura: string
          p_fecha: string
          p_modo: Database["public"]["Enums"]["modo_entrega"]
          p_nivel: string
          p_porciones: number
          p_relleno: string
          p_sabor: string
          p_tipo: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "administracion" | "mostrador" | "produccion" | "equipo"
      estado_orden:
        | "borrador"
        | "confirmada"
        | "en_produccion"
        | "lista"
        | "entregada"
        | "cancelada"
      estado_tarea: "pendiente" | "en_curso" | "hecha"
      metodo_pago: "efectivo" | "transferencia" | "tarjeta"
      modo_entrega: "sucursal" | "zona1" | "montaje" | "zona2" | "zona3"
      tipo_componente: "sabor" | "relleno" | "cobertura"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["administracion", "mostrador", "produccion", "equipo"],
      estado_orden: [
        "borrador",
        "confirmada",
        "en_produccion",
        "lista",
        "entregada",
        "cancelada",
      ],
      estado_tarea: ["pendiente", "en_curso", "hecha"],
      metodo_pago: ["efectivo", "transferencia", "tarjeta"],
      modo_entrega: ["sucursal", "zona1", "montaje", "zona2", "zona3"],
      tipo_componente: ["sabor", "relleno", "cobertura"],
    },
  },
} as const
