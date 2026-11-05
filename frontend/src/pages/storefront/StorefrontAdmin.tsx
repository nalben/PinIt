import { useEffect, useMemo, useState, type FormEvent } from 'react';
import axiosInstance from '@/api/axiosInstance';
import ImageCropModal, { type ImageCropConfig } from '@/components/_UI/imagecropmodal/ImageCropModal';
import type {
  Language,
  ShopCategory,
  ShopProduct,
  ShopProductCategory,
  ShopProductImage,
} from './storefrontModel';
import {
  formatPrice,
  getRequestErrorMessage,
  isShopProduct,
  isShopProductCategory,
  isShopProductImage,
  resolveImageUrl,
} from './storefrontModel';
import classes from './Storefront.module.scss';

type AdminView = 'products' | 'categories';

type ImageItem =
  | { key: string; kind: 'existing'; image: ShopProductImage }
  | { key: string; kind: 'new'; file: File; replacesImageId?: number };

type CropTarget = {
  key: string;
  file: File;
};

type StorefrontAdminProps = {
  categories: ShopCategory[];
  subcategoriesByCategory: Record<number, ShopProductCategory[]>;
  products: ShopProduct[];
  initialProduct: ShopProduct | null;
  language: Language;
  text: (key: string) => string;
  onSaved: () => Promise<void>;
  onClose: () => void;
};

const PRODUCT_IMAGE_CROP_PRESET: ImageCropConfig = {
  aspect: 1,
  outputWidth: 1200,
  fileName: 'potorochin-product.jpg',
  title: 'Crop product image',
};

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_PRODUCT_IMAGES = 30;

const getTodayInputValue = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const getDateInputValue = (value: string | null | undefined) => {
  if (!value) return getTodayInputValue();
  return value.slice(0, 10);
};

const createSlug = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9а-яё]+/gi, '-')
  .replace(/^-+|-+$/g, '');

const StorefrontAdmin = ({
  categories,
  subcategoriesByCategory,
  products,
  initialProduct,
  language,
  text,
  onSaved,
  onClose,
}: StorefrontAdminProps) => {
  const [view, setView] = useState<AdminView>('products');
  const [editingProduct, setEditingProduct] = useState<ShopProduct | null>(initialProduct);
  const [title, setTitle] = useState(initialProduct?.title || '');
  const [description, setDescription] = useState(initialProduct?.description || '');
  const [price, setPrice] = useState(initialProduct ? String(initialProduct.price) : '');
  const [categoryId, setCategoryId] = useState(initialProduct ? String(initialProduct.category_id) : String(categories[0]?.id || ''));
  const [subcategoryId, setSubcategoryId] = useState(initialProduct?.subcategory_id ? String(initialProduct.subcategory_id) : '');
  const [publicationDate, setPublicationDate] = useState(getDateInputValue(initialProduct?.publication_date));
  const [salesCount, setSalesCount] = useState(initialProduct ? String(initialProduct.sales_count || 0) : '0');
  const [imageItems, setImageItems] = useState<ImageItem[]>(() => (
    initialProduct?.images.map(image => ({ key: `existing-${image.id}`, kind: 'existing', image })) || []
  ));
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedCategory = categories.find(category => String(category.id) === categoryId);
  const descriptionRequired = selectedCategory?.slug === 'leather-goods' || selectedCategory?.slug === '3d-models';
  const subcategories = selectedCategory ? subcategoriesByCategory[selectedCategory.id] || [] : [];
  const retainedImageIds = useMemo(
    () => new Set(imageItems.flatMap(item => item.kind === 'existing' ? [item.image.id] : [])),
    [imageItems]
  );

  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const item of imageItems) {
      if (item.kind === 'new') urls[item.key] = URL.createObjectURL(item.file);
    }
    setPreviewUrls(urls);
    return () => {
      Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [imageItems]);

  useEffect(() => {
    if (categories.length > 0 && !categories.some(category => String(category.id) === categoryId)) {
      setCategoryId(String(categories[0].id));
      setSubcategoryId('');
    }
  }, [categories, categoryId]);

  useEffect(() => {
    if (!subcategories.some(category => String(category.id) === subcategoryId)) {
      setSubcategoryId('');
    }
  }, [subcategoryId, subcategories]);

  const resetProductForm = () => {
    setEditingProduct(null);
    setTitle('');
    setDescription('');
    setPrice('');
    setCategoryId(String(categories[0]?.id || ''));
    setSubcategoryId('');
    setPublicationDate(getTodayInputValue());
    setSalesCount('0');
    setImageItems([]);
    setError('');
    setNotice('');
  };

  const startEditing = (product: ShopProduct) => {
    setEditingProduct(product);
    setTitle(product.title);
    setDescription(product.description || '');
    setPrice(String(product.price));
    setCategoryId(String(product.category_id));
    setSubcategoryId(product.subcategory_id ? String(product.subcategory_id) : '');
    setPublicationDate(getDateInputValue(product.publication_date));
    setSalesCount(String(product.sales_count || 0));
    setImageItems(product.images.map(image => ({ key: `existing-${image.id}`, kind: 'existing', image })));
    setError('');
    setNotice('');
    setView('products');
  };

  const addImages = (files: FileList | null) => {
    if (!files?.length) return;
    const additions: ImageItem[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setError(text('imageTypeError'));
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        setError(text('imageSizeError'));
        continue;
      }
      if (imageItems.length + additions.length >= MAX_PRODUCT_IMAGES) {
        setError(text('imageLimitError'));
        break;
      }
      additions.push({ key: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`, kind: 'new', file });
    }
    setImageItems(current => [...current, ...additions]);
    if (additions.length && !error) setError('');
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= imageItems.length) return;
    setImageItems(current => {
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const cropImage = async (item: ImageItem) => {
    setError('');
    try {
      let file: File;
      if (item.kind === 'new') {
        file = item.file;
      } else {
        const { data } = await axiosInstance.get<Blob>(resolveImageUrl(item.image.image_path), { responseType: 'blob' });
        file = new File([data], `product-image-${item.image.id}`, { type: data.type || 'image/jpeg' });
      }
      setCropTarget({ key: item.key, file });
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError, text('imageReadError')));
    }
  };

  const handleCropApplied = (file: File) => {
    if (!cropTarget) return;
    const target = imageItems.find(item => item.key === cropTarget.key);
    if (!target) {
      setCropTarget(null);
      return;
    }
    setImageItems(current => current.map(item => {
      if (item.key !== cropTarget.key) return item;
      return {
        key: item.key,
        kind: 'new',
        file,
        ...(item.kind === 'existing' ? { replacesImageId: item.image.id } : item.replacesImageId ? { replacesImageId: item.replacesImageId } : {}),
      };
    }));
    setCropTarget(null);
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!selectedCategory) {
      setError(text('selectRootCategoryError'));
      return;
    }
    if (descriptionRequired && !description.trim()) {
      setError(text('descriptionRequiredError'));
      return;
    }
    setSaving(true);
    let productId = editingProduct?.id;
    try {
      const productPayload = {
        category_id: Number(categoryId),
        subcategory_id: subcategoryId ? Number(subcategoryId) : null,
        title: title.trim(),
        description: description.trim() || null,
        price: Number(price),
        publication_date: publicationDate,
        sales_count: Number(salesCount),
      };
      if (editingProduct) {
        await axiosInstance.patch(`/api/shop/products/${editingProduct.id}`, productPayload);
      } else {
        const { data } = await axiosInstance.post<unknown>('/api/shop/products', productPayload);
        if (!isShopProduct(data)) throw new Error(text('invalidProductResponse'));
        productId = data.id;
        const nextProduct = data;
        setEditingProduct(nextProduct);
      }
      if (!productId) throw new Error(text('invalidProductResponse'));

      const previousImages = editingProduct?.images || [];
      const obsoleteImages = previousImages.filter(image => !retainedImageIds.has(image.id));
      const workingItems = [...imageItems];
      const orderedIds: number[] = [];

      for (let index = 0; index < workingItems.length; index += 1) {
        const item = workingItems[index];
        if (item.kind === 'existing') {
          orderedIds.push(item.image.id);
          continue;
        }

        const formData = new FormData();
        formData.append('image', item.file);
        const { data } = await axiosInstance.post<unknown>(`/api/shop/products/${productId}/images`, formData);
        if (!isShopProductImage(data)) throw new Error(text('invalidImageResponse'));
        orderedIds.push(data.id);
        workingItems[index] = {
          key: item.key,
          kind: 'existing',
          image: data,
        };
        setImageItems([...workingItems]);
      }

      for (const image of obsoleteImages) {
        await axiosInstance.delete(`/api/shop/products/${productId}/images/${image.id}`);
      }

      await axiosInstance.patch(`/api/shop/products/${productId}/images/order`, { image_ids: orderedIds });
      await onSaved();
      resetProductForm();
      setNotice(editingProduct ? text('productUpdated') : text('productCreated'));
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError, text('saveProductError')));
      if (productId) {
        try {
          await onSaved();
        } catch {
          setNotice('');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (product: ShopProduct) => {
    if (!window.confirm(`${text('confirmDeleteProduct')} «${product.title}»?`)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await axiosInstance.delete(`/api/shop/products/${product.id}`);
      if (editingProduct?.id === product.id) resetProductForm();
      await onSaved();
      setNotice(text('productDeleted'));
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError, text('deleteProductError')));
    } finally {
      setSaving(false);
    }
  };

  const addSubcategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCategory || !categoryName.trim()) return;
    setSavingCategory(true);
    setError('');
    setNotice('');
    try {
      await axiosInstance.post(`/api/shop/categories/${selectedCategory.id}/subcategories`, {
        name: categoryName.trim(),
        slug: createSlug(categoryName),
      });
      setCategoryName('');
      await onSaved();
      setNotice(text('subcategoryCreated'));
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError, text('saveCategoryError')));
    } finally {
      setSavingCategory(false);
    }
  };

  const deleteSubcategory = async (category: ShopProductCategory) => {
    if (!window.confirm(`${text('confirmDeleteSubcategory')} «${category.name}»?`)) return;
    setSavingCategory(true);
    setError('');
    setNotice('');
    try {
      await axiosInstance.delete(`/api/shop/subcategories/${category.id}`);
      if (subcategoryId === String(category.id)) setSubcategoryId('');
      await onSaved();
      setNotice(text('subcategoryDeleted'));
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError, text('deleteCategoryError')));
    } finally {
      setSavingCategory(false);
    }
  };

  const categoryProducts = selectedCategory
    ? products.filter(product => product.category_id === selectedCategory.id)
    : [];
  const previewSrc = previewImage
    || (imageItems[0]?.kind === 'existing'
      ? resolveImageUrl(imageItems[0].image.image_path)
      : imageItems[0]?.kind === 'new' ? previewUrls[imageItems[0].key] : null);

  return (
    <div className={classes.adminContent}>
      <nav className={classes.adminTabs} aria-label={text('manageCollection')}>
        <button type="button" className={view === 'products' ? classes.adminTabActive : classes.adminTab} onClick={() => setView('products')}>
          {text('productsTab')}
        </button>
        <button type="button" className={view === 'categories' ? classes.adminTabActive : classes.adminTab} onClick={() => setView('categories')}>
          {text('categoriesTab')}
        </button>
      </nav>

      {view === 'products' ? (
        <div className={classes.adminLayout}>
          <form className={classes.editorForm} onSubmit={saveProduct}>
            <div className={classes.panelHeading}>
              <span className={classes.eyebrow}>{text('catalog')}</span>
              <h2>{editingProduct ? text('editProduct') : text('newProduct')}</h2>
            </div>
            <label className={classes.field}>
              <span>{text('shopSection')}</span>
              <select
                value={categoryId}
                onChange={event => {
                  setCategoryId(event.target.value);
                  setSubcategoryId('');
                }}
                required
                disabled={categories.length === 0 || saving}
              >
                {categories.length === 0 && <option value="">{text('noShopSections')}</option>}
                {categories.map(category => (
                  <option value={category.id} key={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <div className={classes.subcategoryField}>
              <label className={classes.field}>
                <span>{text('productCategory')}</span>
                <select
                  value={subcategoryId}
                  onChange={event => setSubcategoryId(event.target.value)}
                  disabled={!selectedCategory || saving}
                >
                  <option value="">{text('uncategorized')}</option>
                  {subcategories.map(category => (
                    <option value={category.id} key={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <button type="button" className={classes.inlineManageButton} onClick={() => setView('categories')}>
                {text('manageCategories')}
              </button>
            </div>
            <label className={classes.field}>
              <span>{text('productName')}</span>
              <input value={title} onChange={event => setTitle(event.target.value)} maxLength={255} required disabled={saving} />
            </label>
            <label className={classes.field}>
              <span>
                {text('description')}
                {descriptionRequired ? <small>{text('required')}</small> : <small>{text('optional')}</small>}
              </span>
              <textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} required={descriptionRequired} disabled={saving} />
            </label>
            <div className={classes.adminFieldRow}>
              <label className={classes.field}>
                <span>{text('priceRub')}</span>
                <input type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} required disabled={saving} />
              </label>
              <label className={classes.field}>
                <span>{text('salesCount')}</span>
                <input type="number" min="0" step="1" value={salesCount} onChange={event => setSalesCount(event.target.value)} required disabled={saving} />
              </label>
            </div>
            <label className={classes.field}>
              <span>{text('publicationDate')}</span>
              <span className={classes.dateInputRow}>
                <input type="date" value={publicationDate} onChange={event => setPublicationDate(event.target.value)} required disabled={saving} />
                <button type="button" className={classes.textButton} onClick={() => setPublicationDate(getTodayInputValue())} disabled={saving}>
                  {text('today')}
                </button>
              </span>
            </label>
            <label className={classes.fileField}>
              <span>{text('productImages')} <small>{text('multipleImagesHint')}</small></span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                disabled={saving || imageItems.length >= MAX_PRODUCT_IMAGES}
                onChange={event => {
                  addImages(event.currentTarget.files);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            {imageItems.length > 0 && (
              <div className={classes.imageManager}>
                <div className={classes.imageManagerHeading}>
                  <strong>{text('selectedImages')}</strong>
                  <span>{imageItems.length} / {MAX_PRODUCT_IMAGES}</span>
                </div>
                <div className={classes.imageThumbnailGrid}>
                  {imageItems.map((item, index) => {
                    const src = item.kind === 'existing'
                      ? resolveImageUrl(item.image.image_path)
                      : previewUrls[item.key];
                    return (
                      <article className={classes.imageThumbnail} key={item.key}>
                        <button className={classes.imagePreviewButton} type="button" onClick={() => src && setPreviewImage(src)} aria-label={text('viewImage')}>
                          {src && <img src={src} alt="" />}
                        </button>
                        <span className={classes.imageThumbnailName}>{item.kind === 'new' ? item.file.name : text('savedImage')}</span>
                        <div className={classes.imageThumbnailActions}>
                          <button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0 || saving} aria-label={text('moveImageLeft')}>←</button>
                          <button type="button" onClick={() => moveImage(index, 1)} disabled={index === imageItems.length - 1 || saving} aria-label={text('moveImageRight')}>→</button>
                          <button type="button" onClick={() => void cropImage(item)} disabled={saving} aria-label={text('cropImage')}>⌗</button>
                          <button type="button" onClick={() => {
                            setImageItems(current => current.filter(image => image.key !== item.key));
                            setError('');
                          }} disabled={saving} aria-label={text('removeImage')}>×</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
            <div className={classes.formActions}>
              <button className={classes.primaryButton} type="submit" disabled={saving || categories.length === 0}>
                {saving ? text('saving') : editingProduct ? text('saveChanges') : text('createProduct')}
              </button>
              {editingProduct && <button className={classes.textButton} type="button" onClick={resetProductForm} disabled={saving}>{text('newProduct')}</button>}
            </div>
            {error && <p className={classes.formError} role="alert">{error}</p>}
            {notice && <p className={classes.formNotice} role="status">{notice}</p>}
          </form>

          <section className={classes.adminProducts}>
            <div className={classes.panelHeading}>
              <span className={classes.eyebrow}>{text('management')}</span>
              <h2>{text('productsInSection')} <span>{categoryProducts.length}</span></h2>
            </div>
            {categoryProducts.length === 0 && <p className={classes.adminEmpty}>{text('noProducts')}</p>}
            <div className={classes.adminProductList}>
              {categoryProducts.map(product => (
                <article className={classes.adminProduct} key={product.id}>
                  {product.images[0] && <img src={resolveImageUrl(product.images[0].image_path)} alt="" />}
                  <div className={classes.adminProductInfo}>
                    <strong>{product.title}</strong>
                    <span>{product.subcategory_name || product.category_name} · {formatPrice(product.price, language)}</span>
                  </div>
                  <button className={classes.textButton} type="button" onClick={() => startEditing(product)}>{text('edit')}</button>
                  <button className={classes.deleteButton} type="button" onClick={() => void deleteProduct(product)} disabled={saving}>{text('delete')}</button>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <section className={classes.categoryManager}>
          <div className={classes.panelHeading}>
            <span className={classes.eyebrow}>{text('categoriesTab')}</span>
            <h2>{text('manageProductCategories')}</h2>
            <p>{text('categoryDeleteNote')}</p>
          </div>
          <label className={classes.field}>
            <span>{text('shopSection')}</span>
            <select value={categoryId} onChange={event => {
              setCategoryId(event.target.value);
              setSubcategoryId('');
            }}>
              {categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select>
          </label>
          <form className={classes.addCategoryForm} onSubmit={addSubcategory}>
            <label className={classes.field}>
              <span>{text('newCategoryName')}</span>
              <input value={categoryName} onChange={event => setCategoryName(event.target.value)} maxLength={255} required />
            </label>
            <button className={classes.primaryButton} type="submit" disabled={savingCategory || !selectedCategory}>
              {savingCategory ? text('saving') : text('addCategory')}
            </button>
          </form>
          {subcategories.length === 0
            ? <p className={classes.adminEmpty}>{text('noSubcategories')}</p>
            : (
              <div className={classes.subcategoryList}>
                {subcategories.map(category => (
                  <div className={classes.subcategoryRow} key={category.id}>
                    <span>{category.name}</span>
                    <button className={classes.deleteButton} type="button" onClick={() => void deleteSubcategory(category)} disabled={savingCategory}>
                      {text('delete')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          {error && <p className={classes.formError} role="alert">{error}</p>}
          {notice && <p className={classes.formNotice} role="status">{notice}</p>}
        </section>
      )}

      <div className={classes.adminModalFooter}>
        <button className={classes.textButton} type="button" onClick={onClose}>{text('close')}</button>
      </div>

      {cropTarget && (
        <ImageCropModal
          isOpen
          sourceFile={cropTarget.file}
          config={{ ...PRODUCT_IMAGE_CROP_PRESET, title: text('cropProductImage') }}
          onClose={() => setCropTarget(null)}
          onApply={handleCropApplied}
        />
      )}

      {previewSrc && previewImage && (
        <div className={classes.imageLightbox} role="dialog" aria-modal="true" aria-label={text('viewImage')} onMouseDown={event => {
          if (event.target === event.currentTarget) setPreviewImage(null);
        }}>
          <button type="button" onClick={() => setPreviewImage(null)} aria-label={text('close')}>×</button>
          <img src={previewImage} alt="" />
        </div>
      )}
    </div>
  );
};

export default StorefrontAdmin;
