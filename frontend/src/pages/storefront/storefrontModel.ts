import { API_URL } from '@/api/axiosInstance';

export type ShopCategory = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
};

export type ShopProductCategory = {
  id: number;
  shop_category_id: number;
  name: string;
  slug: string;
};

export type ShopProductImage = {
  id: number;
  image_path: string;
  is_primary?: number | boolean;
  sort_order?: number;
};

export type ShopProduct = {
  id: number;
  category_id: number;
  subcategory_id: number | null;
  category_name: string | null;
  subcategory_name: string | null;
  title: string;
  description: string | null;
  price: string | number;
  publication_date: string | null;
  sales_count: number;
  images: ShopProductImage[];
};

export type ShopAccount = {
  id: number;
  username: string;
  nickname: string | null;
  isAdmin: boolean;
};

export type ShopSection = {
  slug: string;
  path: string;
  titleKey: string;
  subtitleKey: string;
  descriptionKey: string;
  mark: string;
  artClass: string;
};

export type Language = 'en' | 'ru';

export const resolveImageUrl = (imagePath: string) => {
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const normalizedPath = imagePath.replace(/^\/+/, '').replace(/^uploads\//, '');
  return `${API_URL}/uploads/${normalizedPath}`;
};

export const isShopCategory = (value: unknown): value is ShopCategory => (
  typeof value === 'object'
  && value !== null
  && 'id' in value
  && typeof value.id === 'number'
  && 'name' in value
  && typeof value.name === 'string'
  && 'slug' in value
  && typeof value.slug === 'string'
  && 'description' in value
  && (typeof value.description === 'string' || value.description === null)
);

export const isShopProductCategory = (value: unknown): value is ShopProductCategory => (
  typeof value === 'object'
  && value !== null
  && 'id' in value
  && typeof value.id === 'number'
  && 'shop_category_id' in value
  && typeof value.shop_category_id === 'number'
  && 'name' in value
  && typeof value.name === 'string'
  && 'slug' in value
  && typeof value.slug === 'string'
);

export const isShopAccount = (value: unknown): value is ShopAccount => (
  typeof value === 'object'
  && value !== null
  && 'id' in value
  && typeof value.id === 'number'
  && 'username' in value
  && typeof value.username === 'string'
  && 'isAdmin' in value
  && typeof value.isAdmin === 'boolean'
  && 'nickname' in value
  && (typeof value.nickname === 'string' || value.nickname === null)
);

export const isShopProductImage = (value: unknown): value is ShopProductImage => (
  typeof value === 'object'
  && value !== null
  && 'id' in value
  && typeof value.id === 'number'
  && 'image_path' in value
  && typeof value.image_path === 'string'
);

export const isShopProduct = (value: unknown): value is ShopProduct => (
  typeof value === 'object'
  && value !== null
  && 'id' in value
  && typeof value.id === 'number'
  && 'category_id' in value
  && typeof value.category_id === 'number'
  && 'title' in value
  && typeof value.title === 'string'
  && 'price' in value
  && (typeof value.price === 'string' || typeof value.price === 'number')
  && 'subcategory_id' in value
  && (typeof value.subcategory_id === 'number' || value.subcategory_id === null)
  && 'category_name' in value
  && (typeof value.category_name === 'string' || value.category_name === null)
  && 'subcategory_name' in value
  && (typeof value.subcategory_name === 'string' || value.subcategory_name === null)
  && 'description' in value
  && (typeof value.description === 'string' || value.description === null)
  && 'publication_date' in value
  && (typeof value.publication_date === 'string' || value.publication_date === null)
  && 'sales_count' in value
  && typeof value.sales_count === 'number'
  && 'images' in value
  && Array.isArray(value.images)
  && value.images.every(isShopProductImage)
);

export const formatPrice = (price: string | number, language: Language) => (
  `${new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 2 }).format(Number(price))} ₽`
);

export const getRequestErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== 'object' || error === null || !('response' in error)) return fallback;
  const response = error.response;
  if (typeof response !== 'object' || response === null || !('data' in response)) return fallback;
  const data = response.data;
  if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') {
    return data.message;
  }
  return fallback;
};
