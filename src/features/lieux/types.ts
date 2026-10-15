import type { BuildSystemPromptLieu } from "@/lib/buildSystemPrompt";

/**
 * Lieux screen types — extracted from App.jsx's MesLieux component props
 * (line 3559) and its CATEGORIES_LIEUX constant (lines 3473-3479).
 */
export type LieuCategorie = "domicile" | "travail" | "famille" | "service" | "business";

export interface Lieu extends BuildSystemPromptLieu {
  id: number;
  categorie: LieuCategorie;
}

export interface LieuForm {
  nom: string;
  ville: string;
  categorie: LieuCategorie;
  notes: string;
}

export interface LieuxScreenProps {
  userId?: string;
  onLieuxUpdated?: (lieux: Lieu[]) => void;
}
