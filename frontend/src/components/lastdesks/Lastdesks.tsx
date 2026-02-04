import React, { useEffect } from 'react';
import axiosInstance, { API_URL } from '@/../axiosInstance';
import Mainbtn from '../_UI/mainbtn/Mainbtn';
import classes from '../../pages/home/Home.module.scss';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import { create } from 'zustand';

// Zustand store для последних досок
interface Board {
  id: number;
  title: string;
  description?: string | null;
  created_at: string;
  last_visited_at?: string | null;
  image?: string | null;
}

interface BoardsState {
  recentBoards: Board[];
  isLoading: boolean;
  loadBoards: () => Promise<void>;
}

export const useBoardsStore = create<BoardsState>((set) => ({
  recentBoards: [],
  isLoading: false,
  loadBoards: async () => {
    set({ isLoading: true });
    try {
      const { data } = await axiosInstance.get<Board[]>('/api/boards/recent');
      set({ recentBoards: Array.isArray(data) ? data : [] });
    } catch (err) {
      console.error(err);
      set({ recentBoards: [] });
    } finally {
      set({ isLoading: false });
    }
  },
}));

const Lastdesks: React.FC = () => {
  const { recentBoards, isLoading, loadBoards } = useBoardsStore();

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  if (isLoading) return <p>Загрузка досок...</p>;

  return (
    <section className={classes.desks_container}>
      <h2>Последние открытые доски:</h2>
      {recentBoards.length > 0 ? (
        <div className={classes.desks_list}>
          {recentBoards.slice(0, 3).map(board => {
            const imgSrc = board.image
              ? board.image.startsWith('/uploads/')
                ? `${API_URL}${board.image}`
                : board.image
              : null;

            return (
              <div key={board.id} className={classes.desks_item}>
                {imgSrc ? <img src={imgSrc} alt={board.title} /> : <Default />}
                <div className={classes.board_info_con}>
                  <h3>{board.title}</h3>
                  <p>{board.description || 'Нет описания'}</p>
                </div>
                <Mainbtn variant="mini" text="Открыть" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className={classes.desks_empty}>
          <h3>Досок не найдено</h3>
          <Mainbtn variant="mini" text="Создать доску" />
        </div>
      )}
    </section>
  );
};

export default Lastdesks;
