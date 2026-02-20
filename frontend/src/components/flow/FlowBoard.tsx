import React, { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import ReactFlow, { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import classes from './FlowBoard.module.scss'
import Close from '@/assets/icons/monochrome/back.svg'
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import { API_URL } from '@/api/axiosInstance';
import { Board as BoardEntity, useBoardsStore } from '@/store/boardsStore';
import { useSpacesBoardsStore } from '@/store/spacesBoardsStore';

const FlowBoard: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const location = useLocation();

  const boards = useBoardsStore((s) => s.boards);
  const recentBoards = useBoardsStore((s) => s.recentBoards);
  const publicBoards = useSpacesBoardsStore((s) => s.publicBoards);
  const friendsBoards = useSpacesBoardsStore((s) => s.friendsBoards);
  const guestBoards = useSpacesBoardsStore((s) => s.guestBoards);

  const boardInfo = useMemo(() => {
    const id = Number(boardId);
    if (!Number.isFinite(id) || id <= 0) return null;

    const stateBoard = (location.state as { board?: Partial<BoardEntity> } | null)?.board;
    const fromState = stateBoard && Number(stateBoard.id) === id ? stateBoard : undefined;

    const fromBoards = boards.find((b) => b.id === id);
    const fromRecent = recentBoards.find((b) => b.id === id);
    const fromPublic = publicBoards.find((b) => b.id === id);
    const fromFriends = friendsBoards.find((b) => b.id === id);
    const fromGuest = guestBoards.find((b) => b.id === id);

    const merged: Partial<BoardEntity> = {
      ...(fromPublic ?? {}),
      ...(fromFriends ?? {}),
      ...(fromGuest ?? {}),
      ...(fromRecent ?? {}),
      ...(fromBoards ?? {}),
      ...(fromState ?? {}),
      id,
    };

    const imageSrc = merged.image
      ? merged.image.startsWith('/uploads/')
        ? `${API_URL}${merged.image}`
        : merged.image
      : null;

    return {
      id,
      title: typeof merged.title === 'string' && merged.title.trim() ? merged.title : `Board ${id}`,
      description: typeof merged.description === 'string' ? merged.description : null,
      imageSrc,
    };
  }, [boardId, boards, friendsBoards, guestBoards, location.state, publicBoards, recentBoards]);

  return (
    <div className={classes.board_container}>
      <div style={{ width: '100%', height: '100vh' }} className={classes.space_container}>
        <ReactFlowProvider>
          <ReactFlow nodes={[]} edges={[]} fitView />
        </ReactFlowProvider>
      </div>
      <div className={classes.board_menu_con}>
        <div className={classes.close_btn}>
          <Close />
        </div>
        <div className={classes.board_menu_}>
          <div className={classes.board_info}>
            {boardInfo?.imageSrc ? <img src={boardInfo.imageSrc} alt={boardInfo.title} width={120} height={120} /> : <Default />}
            <span>{boardInfo ? boardInfo.title : 'Board'}</span>
            <p>{boardInfo?.description ?? ''}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowBoard;
