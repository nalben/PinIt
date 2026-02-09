import React, { useEffect } from 'react';
import { API_URL } from '@/api/axiosInstance';
import Mainbtn from '../_UI/mainbtn/Mainbtn';
import classes from './Lastdesks.module.scss';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import { useBoardsStore } from '@/store/boardsStore';

// Zustand store для последних досок
const Lastdesks: React.FC = () => {
  const recentBoards = useBoardsStore(state => state.recentBoards);
  const isLoading = useBoardsStore(state => state.isLoading);
  const loadBoards = useBoardsStore(state => state.loadBoards);

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
