import { create } from 'zustand';
import axiosInstance from '@/api/axiosInstance';
import { useBoardsUnifiedStore } from '@/store/boardsUnifiedStore';

export const CREATE_BOARD_TITLE_MAX_LENGTH = 20;

interface CreateBoardResponse {
  id: number;
  title: string;
  description?: string | null;
  image?: string | null;
}

interface CreateBoardModalState {
  isOpen: boolean;
  title: string;
  isSubmitting: boolean;
  error: string | null;

  open: () => void;
  close: () => void;
  setTitle: (title: string) => void;
  submit: () => Promise<CreateBoardResponse | null>;
}

const parseApiErrorMessage = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;

  const response = (error as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return null;

  const data = (response as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;

  const message = (data as { message?: unknown }).message;
  if (typeof message !== 'string') return null;

  const trimmed = message.trim();
  return trimmed ? trimmed : null;
};

export const useCreateBoardModalStore = create<CreateBoardModalState>((set, get) => ({
  isOpen: false,
  title: '',
  isSubmitting: false,
  error: null,

  open: () => set({ isOpen: true, title: '', error: null }),
  close: () => set({ isOpen: false, title: '', isSubmitting: false, error: null }),

  setTitle: (title) => set({ title: title.slice(0, CREATE_BOARD_TITLE_MAX_LENGTH), error: null }),

  submit: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ error: 'Нужно войти, чтобы создать доску' });
      return null;
    }

    const title = get().title.trim();
    if (!title) {
      set({ error: 'Введите название доски' });
      return null;
    }
    if (title.length > CREATE_BOARD_TITLE_MAX_LENGTH) {
      set({ error: `Название слишком длинное (max ${CREATE_BOARD_TITLE_MAX_LENGTH})` });
      return null;
    }

    set({ isSubmitting: true, error: null });
    try {
      const { data } = await axiosInstance.post<CreateBoardResponse>('/api/boards', { title });
      const boardId = Number(data?.id);

      void useBoardsUnifiedStore.getState().refreshMySilent();
      void useBoardsUnifiedStore.getState().refreshRecentSilent();
      void useBoardsUnifiedStore.getState().refreshPublicSilent();

      set({ isOpen: false, title: '', isSubmitting: false, error: null });
      return data ?? null;
    } catch (e) {
      const message = parseApiErrorMessage(e) ?? 'Не удалось создать доску';
      set({ error: message, isSubmitting: false });
      return null;
    }
  },
}));
