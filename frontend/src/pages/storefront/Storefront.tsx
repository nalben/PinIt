import { useCallback, useEffect, useMemo, useState } from 'react';
import axiosInstance from '@/api/axiosInstance';
import StorefrontAdmin from './StorefrontAdmin';
import type {
  Language,
  ShopAccount,
  ShopCategory,
  ShopProduct,
  ShopProductCategory,
  ShopSection,
} from './storefrontModel';
import {
  formatPrice,
  getRequestErrorMessage,
  isShopAccount,
  isShopCategory,
  isShopProduct,
  isShopProductCategory,
  resolveImageUrl,
} from './storefrontModel';
import classes from './Storefront.module.scss';

const SHOP_SECTIONS: ShopSection[] = [
  {
    slug: 'leather-goods',
    path: '/leather',
    titleKey: 'leather',
    subtitleKey: 'leatherSubtitle',
    descriptionKey: 'leatherDescription',
    mark: 'I',
    artClass: 'leatherArt',
  },
  {
    slug: 'warhammer-art',
    path: '/warhammer',
    titleKey: 'warhammer',
    subtitleKey: 'warhammerSubtitle',
    descriptionKey: 'warhammerDescription',
    mark: 'II',
    artClass: 'warhammerArt',
  },
  {
    slug: 'comic-art',
    path: '/comics',
    titleKey: 'comics',
    subtitleKey: 'comicsSubtitle',
    descriptionKey: 'comicsDescription',
    mark: 'III',
    artClass: 'comicsArt',
  },
  {
    slug: '3d-models',
    path: '/3d-printing',
    titleKey: 'printing',
    subtitleKey: 'printingSubtitle',
    descriptionKey: 'printingDescription',
    mark: 'IV',
    artClass: 'printingArt',
  },
];

const COPY: Record<Language, Record<string, string>> = {
  en: {
    documentTitle: 'Potorochin Shop — Art, Craft & Collectibles',
    home: 'Home',
    language: 'Language',
    accountChecking: 'Checking account…',
    accountUnavailable: 'Account unavailable',
    account: 'Account',
    studio: 'Studio',
    closeStudio: 'Close studio',
    manageCollection: 'Manage the collection',
    administratorStudio: 'Administrator studio',
    welcomeEyebrow: 'A CABINET OF HANDMADE CURIOSITIES',
    welcomeTitle: 'Welcome to',
    welcomeName: 'Potorochin Shop',
    welcomeDescription: 'Handmade crafts, art and collectibles for enthusiasts and dreamers.',
    rooms: 'FOUR ROOMS · ONE WORKSHOP',
    explore: 'Explore the collection',
    selectedWorks: 'SELECTED WORKS',
    featuredProducts: 'Featured Products',
    openingCatalogue: 'Opening the catalogue…',
    catalogueUnavailable: 'The catalogue is temporarily unavailable.',
    newWorksSoon: 'New works will be added to the collection soon.',
    sectionCollection: 'POTOROCHIN COLLECTION',
    categoryAll: 'All works',
    categoryEmpty: 'There are no published works in this room yet.',
    categoryUnavailable: 'This room is being prepared for the collection.',
    contactUs: 'Contact us',
    commissions: 'For commissions and enquiries',
    fromYear: 'Independent workshop · Creating since 2021',
    close: 'Close',
    viewPiece: 'View piece',
    today: 'Today',
    weekAgo: 'A week ago',
    monthAgo: 'A month ago',
    edit: 'Edit',
    delete: 'Delete',
    sales: 'Sales',
    closeProduct: 'Close product details',
    previousImage: 'Previous image',
    nextImage: 'Next image',
    added: 'Added',
    order: 'Order',
    productImage: 'Product image',
    selectImage: 'Show image',
    image: 'Image',
    productsTab: 'Products',
    categoriesTab: 'Product categories',
    catalog: 'CATALOGUE',
    editProduct: 'Edit product',
    newProduct: 'New product',
    shopSection: 'Collection',
    noShopSections: 'No collections available',
    productCategory: 'Product category',
    uncategorized: 'Choose a category',
    manageCategories: 'Manage categories',
    productName: 'Name',
    description: 'Description',
    required: 'required',
    optional: 'optional',
    priceRub: 'Price, ₽',
    salesCount: 'Sales count',
    publicationDate: 'Publication date',
    productImages: 'Product images',
    multipleImagesHint: 'select multiple files',
    selectedImages: 'Images · order',
    savedImage: 'Saved image',
    viewImage: 'Preview image',
    moveImageLeft: 'Move image left',
    moveImageRight: 'Move image right',
    cropImage: 'Crop image',
    removeImage: 'Remove image',
    saving: 'Saving…',
    saveChanges: 'Save changes',
    createProduct: 'Add product',
    management: 'MANAGEMENT',
    productsInSection: 'Products in collection',
    noProducts: 'No products in this collection.',
    manageProductCategories: 'Manage product categories',
    categoryDeleteNote: 'Deleting a category leaves its products in the collection without a product category.',
    newCategoryName: 'New category name',
    addCategory: 'Add category',
    noSubcategories: 'No product categories yet.',
    productCreated: 'Product added.',
    productUpdated: 'Changes saved.',
    productDeleted: 'Product deleted.',
    subcategoryCreated: 'Category added.',
    subcategoryDeleted: 'Category deleted.',
    confirmDeleteProduct: 'Delete product',
    confirmDeleteSubcategory: 'Delete category',
    imageTypeError: 'Choose image files only.',
    imageSizeError: 'Each image must be no larger than 5 MB.',
    imageLimitError: 'A product can have up to 30 images.',
    imageReadError: 'Could not open this image for editing.',
    invalidProductResponse: 'The server returned invalid product data.',
    invalidImageResponse: 'The server returned invalid image data.',
    selectRootCategoryError: 'Select a collection first.',
    descriptionRequiredError: 'Enter a description for leather work and 3D models.',
    saveProductError: 'Could not save product.',
    deleteProductError: 'Could not delete product.',
    saveCategoryError: 'Could not create category.',
    deleteCategoryError: 'Could not delete category.',
    cropProductImage: 'Crop product image',
  },
  ru: {
    documentTitle: 'Potorochin Shop — мастерская и авторские арты',
    home: 'Главная',
    language: 'Язык',
    accountChecking: 'Проверяем аккаунт…',
    accountUnavailable: 'Аккаунт недоступен',
    account: 'Аккаунт',
    studio: 'Админка',
    closeStudio: 'Закрыть админку',
    manageCollection: 'Управление каталогом',
    administratorStudio: 'ПАНЕЛЬ АДМИНИСТРАТОРА',
    welcomeEyebrow: 'КАБИНЕТ АВТОРСКИХ РАБОТ',
    welcomeTitle: 'Добро пожаловать в',
    welcomeName: 'Potorochin Shop',
    welcomeDescription: 'Авторские изделия, арты и коллекционные вещи для увлечённых и мечтателей.',
    rooms: 'ЧЕТЫРЕ КОЛЛЕКЦИИ · ОДНА МАСТЕРСКАЯ',
    explore: 'Исследуйте коллекции',
    selectedWorks: 'ИЗБРАННЫЕ РАБОТЫ',
    featuredProducts: 'Избранные товары',
    openingCatalogue: 'Загружаем каталог…',
    catalogueUnavailable: 'Каталог временно недоступен.',
    newWorksSoon: 'Новые работы скоро появятся в каталоге.',
    sectionCollection: 'КОЛЛЕКЦИЯ POTOROCHIN',
    categoryAll: 'Все работы',
    categoryEmpty: 'В этой коллекции пока нет опубликованных работ.',
    categoryUnavailable: 'Коллекция скоро появится.',
    contactUs: 'Связаться с нами',
    commissions: 'Заказы и вопросы',
    fromYear: 'Независимая мастерская · Работаем с 2021 года',
    close: 'Закрыть',
    viewPiece: 'Подробнее',
    today: 'Сегодня',
    weekAgo: 'Неделю назад',
    monthAgo: 'Месяц назад',
    edit: 'Изменить',
    delete: 'Удалить',
    sales: 'Продаж',
    closeProduct: 'Закрыть карточку товара',
    previousImage: 'Предыдущее изображение',
    nextImage: 'Следующее изображение',
    added: 'Добавлено',
    order: 'Заказать',
    productImage: 'Фото товара',
    selectImage: 'Показать изображение',
    image: 'Изображение',
    productsTab: 'Товары',
    categoriesTab: 'Категории товаров',
    catalog: 'КАТАЛОГ',
    editProduct: 'Редактировать товар',
    newProduct: 'Новый товар',
    shopSection: 'Коллекция',
    noShopSections: 'Нет доступных коллекций',
    productCategory: 'Категория товара',
    uncategorized: 'Выберите категорию',
    manageCategories: 'Категории',
    productName: 'Название',
    description: 'Описание',
    required: 'обязательно',
    optional: 'необязательно',
    priceRub: 'Цена, ₽',
    salesCount: 'Количество продаж',
    publicationDate: 'Дата публикации',
    productImages: 'Изображения товара',
    multipleImagesHint: 'можно выбрать несколько',
    selectedImages: 'Изображения · порядок',
    savedImage: 'Загруженное изображение',
    viewImage: 'Посмотреть изображение',
    moveImageLeft: 'Переместить влево',
    moveImageRight: 'Переместить вправо',
    cropImage: 'Обрезать изображение',
    removeImage: 'Удалить изображение',
    saving: 'Сохраняем…',
    saveChanges: 'Сохранить изменения',
    createProduct: 'Добавить товар',
    management: 'УПРАВЛЕНИЕ',
    productsInSection: 'Товары в коллекции',
    noProducts: 'В этой коллекции пока нет товаров.',
    manageProductCategories: 'Управление категориями товаров',
    categoryDeleteNote: 'При удалении категории товары останутся в коллекции без категории.',
    newCategoryName: 'Название новой категории',
    addCategory: 'Добавить категорию',
    noSubcategories: 'Категорий товаров пока нет.',
    productCreated: 'Товар добавлен.',
    productUpdated: 'Изменения сохранены.',
    productDeleted: 'Товар удалён.',
    subcategoryCreated: 'Категория добавлена.',
    subcategoryDeleted: 'Категория удалена.',
    confirmDeleteProduct: 'Удалить товар',
    confirmDeleteSubcategory: 'Удалить категорию',
    imageTypeError: 'Выберите файлы изображений.',
    imageSizeError: 'Размер каждого изображения должен быть не больше 5 МБ.',
    imageLimitError: 'К товару можно добавить не более 30 изображений.',
    imageReadError: 'Не удалось открыть изображение для редактирования.',
    invalidProductResponse: 'Сервер вернул некорректные данные товара.',
    invalidImageResponse: 'Сервер вернул некорректные данные изображения.',
    selectRootCategoryError: 'Сначала выберите коллекцию.',
    descriptionRequiredError: 'Заполните описание для кожаного изделия или 3D-модели.',
    saveProductError: 'Не удалось сохранить товар.',
    deleteProductError: 'Не удалось удалить товар.',
    saveCategoryError: 'Не удалось создать категорию.',
    deleteCategoryError: 'Не удалось удалить категорию.',
    cropProductImage: 'Обрезать изображение товара',
  },
};

const SECTION_COPY: Record<Language, Record<string, string>> = {
  en: {
    leather: 'Leather Work',
    leatherSubtitle: 'Crafted by hand, made to be kept.',
    leatherDescription: 'Small-batch leather goods, shaped slowly and finished by hand.',
    warhammer: 'Warhammer Art',
    warhammerSubtitle: 'Visions from grim and distant worlds.',
    warhammerDescription: 'Original illustrations, character studies and scenes of dark legend.',
    comics: 'Comics Art',
    comicsSubtitle: 'Drawn stories, one frame at a time.',
    comicsDescription: 'Character prints, original artwork and graphic studies.',
    printing: '3D Printing',
    printingSubtitle: 'Sculpted forms from another age.',
    printingDescription: 'Miniatures, busts, sculptures and architectural models.',
  },
  ru: {
    leather: 'Кожаные изделия',
    leatherSubtitle: 'Созданы вручную и надолго.',
    leatherDescription: 'Авторские изделия из кожи, бережно обработанные вручную.',
    warhammer: 'Арты Warhammer',
    warhammerSubtitle: 'Образы мрачных далёких миров.',
    warhammerDescription: 'Авторские арты, портреты персонажей и сцены из мрачных миров.',
    comics: 'Комикс-арты',
    comicsSubtitle: 'Истории, нарисованные кадр за кадром.',
    comicsDescription: 'Арты персонажей, авторские иллюстрации и графика по комиксам.',
    printing: '3D-печать',
    printingSubtitle: 'Формы из другого времени.',
    printingDescription: 'Миниатюры, бюсты, скульптуры и архитектурные модели.',
  },
};

const getRouteSection = (pathname: string) => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  return SHOP_SECTIONS.find(section => section.path === normalizedPath) || null;
};

const getLanguage = (): Language => {
  try {
    return localStorage.getItem('pinit_shop_language') === 'ru' ? 'ru' : 'en';
  } catch {
    return 'en';
  }
};

const formatPublicationDate = (
  value: string | null,
  language: Language,
  text: (key: string) => string
) => {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return '';
  const daysSince = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  if (daysSince < 1) return text('today');
  if (daysSince <= 7) return text('weekAgo');
  if (daysSince <= 35) return text('monthAgo');
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const formatProductDate = (
  value: string | null,
  language: Language,
  text: (key: string) => string
) => formatPublicationDate(value, language, text) || null;

type ProductCardProps = {
  product: ShopProduct;
  section: ShopSection;
  language: Language;
  text: (key: string) => string;
  sectionText: (key: string) => string;
  onSelect: (product: ShopProduct) => void;
};

const ProductCard = ({ product, section, language, text, sectionText, onSelect }: ProductCardProps) => (
  <button className={classes.productCard} type="button" onClick={() => onSelect(product)}>
    <span className={classes.productVisual}>
      {product.images[0] ? (
        <img src={resolveImageUrl(product.images[0].image_path)} alt="" loading="lazy" />
      ) : (
        <span className={`${classes.artworkPlaceholder} ${classes[section.artClass]}`} aria-hidden="true">
          <span>{sectionText(section.titleKey)}</span>
        </span>
      )}
      <span className={classes.productNumber}>{formatPublicationDate(product.publication_date, language, text)}</span>
      <span className={classes.viewProduct}>{text('viewPiece')} ↗</span>
    </span>
    <span className={classes.productDetails}>
      <span className={classes.productTitle}>{product.title}</span>
      <span className={classes.productPrice}>{formatPrice(product.price, language)}</span>
      {product.description && <span className={classes.productDescription}>{product.description}</span>}
    </span>
  </button>
);

type ProductDetailProps = {
  product: ShopProduct;
  section: ShopSection;
  language: Language;
  text: (key: string) => string;
  sectionText: (key: string) => string;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const ProductDetail = ({
  product,
  section,
  language,
  text,
  sectionText,
  isAdmin,
  onClose,
  onEdit,
  onDelete,
}: ProductDetailProps) => {
  const [imageIndex, setImageIndex] = useState(0);
  const image = product.images[imageIndex];
  const productDate = formatProductDate(product.publication_date, language, text);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && product.images.length > 1) {
        setImageIndex(index => (index + 1) % product.images.length);
      }
      if (event.key === 'ArrowLeft' && product.images.length > 1) {
        setImageIndex(index => (index - 1 + product.images.length) % product.images.length);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, product.images.length]);

  return (
    <div className={classes.modalBackdrop} onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={classes.productModal} role="dialog" aria-modal="true" aria-labelledby="product-title">
        <button className={classes.modalClose} type="button" onClick={onClose} aria-label={text('closeProduct')}>×</button>
        <div className={classes.modalGallery}>
          <div className={`${classes.modalImage} ${classes[section.artClass]}`}>
            {image ? (
              <img src={resolveImageUrl(image.image_path)} alt={product.title} />
            ) : (
              <div className={classes.artworkPlaceholder} aria-hidden="true">
                <span>{sectionText(section.titleKey)}</span>
              </div>
            )}
            {product.images.length > 1 && (
              <>
                <span className={classes.galleryCounter}>{imageIndex + 1} / {product.images.length}</span>
                <button
                  type="button"
                  className={`${classes.galleryArrow} ${classes.galleryPrevious}`}
                  aria-label={text('previousImage')}
                  onClick={() => setImageIndex(index => (index - 1 + product.images.length) % product.images.length)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                </button>
                <button
                  type="button"
                  className={`${classes.galleryArrow} ${classes.galleryNext}`}
                  aria-label={text('nextImage')}
                  onClick={() => setImageIndex(index => (index + 1) % product.images.length)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
                </button>
              </>
            )}
          </div>
          {product.images.length > 1 && (
            <div className={classes.galleryThumbnails} aria-label={text('productImage')}>
              {product.images.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className={index === imageIndex ? classes.galleryThumbnailActive : classes.galleryThumbnail}
                  aria-label={`${text('selectImage')} ${index + 1}`}
                  aria-pressed={index === imageIndex}
                  onClick={() => setImageIndex(index)}
                >
                  <img src={resolveImageUrl(item.image_path)} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={classes.modalInfo}>
          <h2 id="product-title">{product.title}</h2>
          <span className={classes.productCategoryTag}>{product.subcategory_name || product.category_name || sectionText(section.titleKey)}</span>
          {product.description && <p className={classes.modalDescription}>{product.description}</p>}
          <p className={classes.modalPrice}>{formatPrice(product.price, language)}</p>
          <div className={classes.productMetadata}>
            {productDate && (
              <span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
                {text('added')}: {productDate}
              </span>
            )}
            <span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20v-6M10 20V9M16 20V4M22 20V12" /></svg>
              {text('sales')}: {product.sales_count}
            </span>
          </div>
          {!isAdmin && (
            <a className={classes.orderButton} href="https://t.me/PotAndrey" target="_blank" rel="noreferrer">
              {text('order')}
            </a>
          )}
          {isAdmin && (
            <div className={classes.productAdminActions}>
              <button type="button" className={classes.primaryButton} onClick={onEdit}>{text('edit')}</button>
              <button type="button" className={classes.deleteButton} onClick={onDelete}>{text('delete')}</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

const Storefront = () => {
  const initialRoute = getRouteSection(window.location.pathname);
  const [language, setLanguage] = useState<Language>(getLanguage);
  const [account, setAccount] = useState<ShopAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountError, setAccountError] = useState(false);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [subcategoriesByCategory, setSubcategoriesByCategory] = useState<Record<number, ShopProductCategory[]>>({});
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(initialRoute?.slug || null);
  const [activeSubcategorySlug, setActiveSubcategorySlug] = useState<string | null>(
    new URLSearchParams(window.location.search).get('subcategory')
  );
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminProduct, setAdminProduct] = useState<ShopProduct | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [productActionError, setProductActionError] = useState('');
  const section = SHOP_SECTIONS.find(item => item.slug === activeSlug) || null;
  const text = useCallback((key: string) => COPY[language][key] || key, [language]);
  const sectionText = useCallback((key: string) => SECTION_COPY[language][key] || key, [language]);

  const refreshCatalog = useCallback(async () => {
    const [categoriesResponse, productsResponse] = await Promise.all([
      axiosInstance.get<unknown>('/api/shop/categories'),
      axiosInstance.get<unknown>('/api/shop/products'),
    ]);
    if (!Array.isArray(categoriesResponse.data) || !categoriesResponse.data.every(isShopCategory)) {
      throw new Error('Invalid shop categories response');
    }
    if (!Array.isArray(productsResponse.data) || !productsResponse.data.every(isShopProduct)) {
      throw new Error('Invalid shop products response');
    }
    const loadedCategories = categoriesResponse.data;
    const childResponses = await Promise.all(
      loadedCategories.map(category => axiosInstance.get<unknown>(`/api/shop/categories/${category.id}/subcategories`))
    );
    const children: Record<number, ShopProductCategory[]> = {};
    for (let index = 0; index < childResponses.length; index += 1) {
      const response = childResponses[index];
      if (!Array.isArray(response.data) || !response.data.every(isShopProductCategory)) {
        throw new Error('Invalid shop product categories response');
      }
      children[loadedCategories[index].id] = response.data;
    }
    setCategories(loadedCategories);
    setSubcategoriesByCategory(children);
    setProducts(productsResponse.data);
  }, []);

  useEffect(() => {
    document.title = text('documentTitle');
    document.documentElement.lang = language;
    try {
      localStorage.setItem('pinit_shop_language', language);
    } catch {
      // The language switch remains functional when storage is unavailable.
    }
  }, [language, text]);

  useEffect(() => {
    axiosInstance.get<unknown>('/api/shop/session')
      .then(({ data }) => {
        if (!isShopAccount(data)) throw new Error('Invalid shop session response');
        setAccount(data);
      })
      .catch(error => {
        if (typeof error !== 'object' || error === null || !('response' in error)) {
          setAccountError(true);
          return;
        }
        const response = error.response;
        if (typeof response !== 'object' || response === null || !('status' in response) || response.status !== 401) {
          setAccountError(true);
        }
      })
      .then(() => setAccountLoading(false));

    refreshCatalog()
      .catch(() => setCatalogError(true))
      .then(() => setCatalogLoading(false));
  }, [refreshCatalog]);

  useEffect(() => {
    const handlePopState = () => {
      setActiveSlug(getRouteSection(window.location.pathname)?.slug || null);
      setActiveSubcategorySlug(new URLSearchParams(window.location.search).get('subcategory'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const activeCategory = section ? categories.find(category => category.slug === section.slug) || null : null;
  const activeSubcategories = activeCategory ? subcategoriesByCategory[activeCategory.id] || [] : [];
  const activeSubcategory = activeSubcategories.find(category => category.slug === activeSubcategorySlug) || null;
  const visibleProducts = useMemo(() => {
    if (!activeCategory) return [];
    return products.filter(product => (
      product.category_id === activeCategory.id
      && (!activeSubcategory || product.subcategory_id === activeSubcategory.id)
    ));
  }, [activeCategory, activeSubcategory, products]);
  const featuredProducts = useMemo(() => SHOP_SECTIONS.flatMap(shopSection => {
    const category = categories.find(item => item.slug === shopSection.slug);
    const product = category && products.find(item => item.category_id === category.id);
    return product ? [{ product, section: shopSection }] : [];
  }), [categories, products]);

  const navigateHome = useCallback(() => {
    window.history.pushState(null, '', '/');
    setActiveSlug(null);
    setActiveSubcategorySlug(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateSection = useCallback((slug: string) => {
    const target = SHOP_SECTIONS.find(item => item.slug === slug);
    if (!target) return;
    window.history.pushState(null, '', target.path);
    setActiveSlug(target.slug);
    setActiveSubcategorySlug(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateSubcategory = (slug: string | null) => {
    if (!section) return;
    const url = new URL(section.path, window.location.origin);
    if (slug) url.searchParams.set('subcategory', slug);
    window.history.pushState(null, '', `${url.pathname}${url.search}`);
    setActiveSubcategorySlug(slug);
  };

  const closeSelectedProduct = useCallback(() => setSelectedProduct(null), []);

  const handleDeleteSelectedProduct = async () => {
    if (!selectedProduct || !window.confirm(`${text('confirmDeleteProduct')} «${selectedProduct.title}»?`)) return;
    setProductActionError('');
    try {
      await axiosInstance.delete(`/api/shop/products/${selectedProduct.id}`);
      setSelectedProduct(null);
      await refreshCatalog();
    } catch (error) {
      setProductActionError(getRequestErrorMessage(error, text('deleteProductError')));
    }
  };

  const openAdmin = (product: ShopProduct | null = null) => {
    setAdminProduct(product);
    setSelectedProduct(null);
    setAdminOpen(true);
  };

  const selectedProductSection = selectedProduct
    ? SHOP_SECTIONS.find(item => item.slug === categories.find(category => category.id === selectedProduct.category_id)?.slug) || SHOP_SECTIONS[0]
    : null;

  return (
    <main className={classes.page} lang={language}>
      <div className={classes.paperTexture} aria-hidden="true" />
      <header className={classes.header}>
        <div className={classes.headerTop}>
          <button
            type="button"
            className={classes.languageToggle}
            aria-label={text('language')}
            onClick={() => setLanguage(value => value === 'en' ? 'ru' : 'en')}
          >
            <span className={language === 'en' ? classes.languageActive : ''}>EN</span>
            <span className={classes.languageDivider}>/</span>
            <span className={language === 'ru' ? classes.languageActive : ''}>RU</span>
          </button>
          <a className={classes.wordmark} href="/" aria-label="Potorochin Shop" onClick={event => {
            event.preventDefault();
            navigateHome();
          }}>
            POTOROCHIN SHOP
          </a>
          <div className={classes.headerAccount}>
            {accountLoading && <span className={classes.accountMuted}>{text('accountChecking')}</span>}
            {!accountLoading && account && (
              <>
                <span className={classes.accountIdentity}>
                  {account.nickname || account.username}
                  <small>{text('account')} · {account.id}</small>
                </span>
                {account.isAdmin && (
                  <button type="button" className={classes.adminToggle} onClick={() => openAdmin()} aria-haspopup="dialog">
                    {text('studio')}
                  </button>
                )}
              </>
            )}
            {!accountLoading && accountError && <span className={classes.accountMuted}>{text('accountUnavailable')}</span>}
          </div>
        </div>
        <div className={classes.crestRule} aria-hidden="true">
          <span />
          <span className={classes.crest}>✦</span>
          <span />
        </div>
        <nav className={classes.tabs} role="tablist" aria-label={text('explore')}>
          {SHOP_SECTIONS.map(item => (
            <button
              className={activeSlug === item.slug ? classes.tabActive : classes.tab}
              type="button"
              role="tab"
              aria-selected={activeSlug === item.slug}
              key={item.slug}
              onClick={() => navigateSection(item.slug)}
            >
              {sectionText(item.titleKey)}
            </button>
          ))}
        </nav>
      </header>

      <div className={classes.pageContent}>
        {!section ? (
          <>
            <section className={classes.welcome}>
              <p className={classes.eyebrow}>{text('welcomeEyebrow')}</p>
              <h1>{text('welcomeTitle')}<br /><em>{text('welcomeName')}</em></h1>
              <p className={classes.welcomeText}>{text('welcomeDescription')}</p>
              <div className={classes.welcomeOrnament} aria-hidden="true">❦</div>
            </section>

            <section className={classes.collectionSection} aria-labelledby="collections-title">
              <div className={classes.sectionHeading}>
                <span className={classes.eyebrow}>{text('rooms')}</span>
                <h2 id="collections-title">{text('explore')}</h2>
              </div>
              <div className={classes.categoryGrid}>
                {SHOP_SECTIONS.map(item => {
                  const category = categories.find(value => value.slug === item.slug);
                  const firstProduct = category && products.find(value => value.category_id === category.id);
                  const categoryImage = firstProduct?.images[0];
                  return (
                    <button className={classes.categoryCard} type="button" key={item.slug} onClick={() => navigateSection(item.slug)}>
                      <span className={classes.categoryVisual}>
                        {categoryImage ? (
                          <img src={resolveImageUrl(categoryImage.image_path)} alt="" loading="lazy" />
                        ) : (
                          <span className={`${classes.artworkPlaceholder} ${classes[item.artClass]}`} aria-hidden="true" />
                        )}
                        <span className={classes.categoryNumber}>{item.mark}</span>
                      </span>
                      <span className={classes.categoryLabel}>
                        <span>
                          <strong>{sectionText(item.titleKey)}</strong>
                          <small>{sectionText(item.subtitleKey)}</small>
                        </span>
                        <span className={classes.categoryArrow}>↗</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={classes.featuredSection} aria-labelledby="featured-title">
              <div className={classes.sectionHeading}>
                <span className={classes.eyebrow}>{text('selectedWorks')}</span>
                <h2 id="featured-title">{text('featuredProducts')}</h2>
              </div>
              {catalogLoading && <p className={classes.catalogMessage}>{text('openingCatalogue')}</p>}
              {!catalogLoading && catalogError && <p className={classes.catalogMessage} role="alert">{text('catalogueUnavailable')}</p>}
              {!catalogLoading && !catalogError && featuredProducts.length === 0 && (
                <p className={classes.catalogMessage}>{text('newWorksSoon')}</p>
              )}
              <div className={classes.productGrid}>
                {featuredProducts.map(({ product, section: productSection }) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    section={productSection}
                    language={language}
                    text={text}
                    sectionText={sectionText}
                    onSelect={setSelectedProduct}
                  />
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className={`${classes.categoryIntro} ${classes[section.artClass]}`}>
              <p className={classes.eyebrow}>{section.mark} · {text('sectionCollection')}</p>
              <h1>{sectionText(section.titleKey)}</h1>
              <p>{sectionText(section.descriptionKey)}</p>
            </section>
            <section className={classes.categoryCatalog} aria-label={sectionText(section.titleKey)}>
              <div className={classes.subcategoryTabs} role="tablist" aria-label={text('productCategory')}>
                <button
                  type="button"
                  className={!activeSubcategory ? classes.subcategoryTabActive : classes.subcategoryTab}
                  role="tab"
                  aria-selected={!activeSubcategory}
                  onClick={() => navigateSubcategory(null)}
                >
                  {text('categoryAll')}
                </button>
                {activeSubcategories.map(category => (
                  <button
                    type="button"
                    className={activeSubcategory?.id === category.id ? classes.subcategoryTabActive : classes.subcategoryTab}
                    role="tab"
                    aria-selected={activeSubcategory?.id === category.id}
                    key={category.id}
                    onClick={() => navigateSubcategory(category.slug)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
              {catalogLoading && <p className={classes.catalogMessage}>{text('openingCatalogue')}</p>}
              {!catalogLoading && catalogError && <p className={classes.catalogMessage} role="alert">{text('catalogueUnavailable')}</p>}
              {!catalogLoading && !catalogError && !activeCategory && <p className={classes.catalogMessage}>{text('categoryUnavailable')}</p>}
              {!catalogLoading && !catalogError && activeCategory && visibleProducts.length === 0 && (
                <p className={classes.catalogMessage}>{text('categoryEmpty')}</p>
              )}
              <div className={classes.productGrid}>
                {visibleProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    section={section}
                    language={language}
                    text={text}
                    sectionText={sectionText}
                    onSelect={setSelectedProduct}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      <footer className={classes.footer}>
        <div className={classes.footerBlock}>
          <span className={classes.footerHeading}>{text('contactUs')}</span>
          <span>{text('commissions')}</span>
          <span className={classes.socialLinks}>
            <a href="https://www.instagram.com/artistpotorochin" target="_blank" rel="noreferrer" aria-label="Instagram">
              <img src="/instagram.svg" alt="" />
            </a>
            <a href="https://t.me/PotAndrey" target="_blank" rel="noreferrer" aria-label="Telegram">
              <img src="/telegram.svg" alt="" />
            </a>
          </span>
        </div>
        <a className={classes.footerBrand} href="/" onClick={event => {
          event.preventDefault();
          navigateHome();
        }}>POTOROCHIN SHOP</a>
        <p className={classes.footerHistory}>{text('fromYear')}</p>
      </footer>

      {adminOpen && account?.isAdmin && (
        <div className={classes.adminModalBackdrop} role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setAdminOpen(false);
        }}>
          <section className={classes.adminModal} role="dialog" aria-modal="true" aria-labelledby="admin-title">
            <div className={classes.adminHeader}>
              <div>
                <p className={classes.eyebrow}>{text('administratorStudio')}</p>
                <h2 id="admin-title">{text('manageCollection')}</h2>
              </div>
              <button className={classes.adminClose} type="button" onClick={() => setAdminOpen(false)} aria-label={text('close')}>×</button>
            </div>
            <StorefrontAdmin
              key={adminProduct?.id || 'new-product'}
              categories={categories}
              subcategoriesByCategory={subcategoriesByCategory}
              products={products}
              initialProduct={adminProduct}
              language={language}
              text={text}
              onSaved={refreshCatalog}
              onClose={() => {
                setAdminOpen(false);
                setAdminProduct(null);
              }}
            />
          </section>
        </div>
      )}

      {selectedProduct && selectedProductSection && (
        <ProductDetail
          product={selectedProduct}
          section={selectedProductSection}
          language={language}
          text={text}
          sectionText={sectionText}
          isAdmin={Boolean(account?.isAdmin)}
          onClose={closeSelectedProduct}
          onEdit={() => openAdmin(selectedProduct)}
          onDelete={() => void handleDeleteSelectedProduct()}
        />
      )}
      {productActionError && <p className={classes.productActionError} role="alert">{productActionError}</p>}
    </main>
  );
};

export default Storefront;
