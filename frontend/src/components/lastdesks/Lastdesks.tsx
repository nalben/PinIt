import React, { useEffect, useState } from 'react';
import axiosInstance, { API_URL } from '@/../axiosInstance';
import Mainbtn from '../_UI/mainbtn/Mainbtn';
import classes from '../../pages/home/Home.module.scss';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';

interface Board {
  id: number;
  title: string;
  description?: string | null;
  created_at: string;
  last_visited_at?: string | null;
  image?: string | null;
}

const Lastdesks = () => {
  const [boards, setBoards] = useState<Board[]>([]);
  const [recentBoards, setRecentBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadBoards = async () => {
      try {
        const { data: myBoards } = await axiosInstance.get<Board[]>('/api/boards');
        setBoards(myBoards);

        const { data: recent } = await axiosInstance.get<Board[]>('/api/boards/recent');
        setRecentBoards(recent);
      } catch (err) {
        console.error('Ошибка загрузки досок', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadBoards();
  }, []);

  if (isLoading) return <p>Загрузка досок...</p>;

  return (
    <section className={classes.desks_container}>
      <h2>Последние открытые доски:</h2>
      {recentBoards.length > 0 ? (
        <div className={classes.desks_list}>
            {recentBoards.slice(0, 3).map(board => (
            <div key={board.id} className={classes.desks_item}>
                {board.image ? (
                <img
                    src={board.image.startsWith('/uploads/') ? `${API_URL}${board.image}` : board.image}
                    alt={board.title}
                />
                ) : (
                <Default />
                )}
                <div className={classes.board_info_con}>
                <h3>{board.title}</h3>
                <p>{board.description || 'Нет описания'}</p>
                </div>
                <Mainbtn variant="mini" text="открыть" />
            </div>
            ))}
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
