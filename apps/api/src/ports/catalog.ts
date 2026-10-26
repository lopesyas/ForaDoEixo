import type { CosmeticCategory, CosmeticProduct } from '../catalog/cosmetics';
import type { MedicineGroup, MedicineProduct } from '../catalog/medicines';

export type CatalogProduct = CosmeticProduct | MedicineProduct;

export const isMedicine = (p: CatalogProduct): p is MedicineProduct => 'substances' in p;

export interface CatalogPort {
  byCategory(category: CosmeticCategory): Promise<CosmeticProduct[]>;
  /** Medicamentos sem receita, em estoque, dos grupos pedidos. */
  otcByGroups(groups: MedicineGroup[]): Promise<MedicineProduct[]>;
  /** Procura pelo nome (e fabricante). Cosméticos podem ser mostrados direto; remédio sem receita só inicia a conversa de saúde. */
  searchByName(text: string): Promise<{ cosmetics: CosmeticProduct[]; otc: MedicineProduct[] }>;
  /** Produtos em estoque para a vitrine, variados por categoria (os mais baratos de cada uma). */
  featured(perCategory: number, categories: CosmeticCategory[]): Promise<CosmeticProduct[]>;
  /** Todo o catálogo (inclusive sem estoque): base da listagem com filtros. */
  all(): Promise<CatalogProduct[]>;
  byIds(ids: string[]): Promise<CatalogProduct[]>;
  /** Medicamentos de receita citados no texto (pelo nome ou pela substância). */
  findPrescription(text: string): Promise<MedicineProduct[]>;
}
