import React, { useEffect, useRef } from 'react';
import AuthModal from '@/components/auth/authmodal/AuthModal';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import { useNavigate } from 'react-router-dom';
import {
  CREATE_BOARD_TITLE_MAX_LENGTH,
  useCreateBoardModalStore,
} from '@/store/createBoardModalStore';
import classes from './CreateBoardModal.module.scss';
import { useEscapeHandler } from '@/hooks/useEscapeHandler';

const CreateBoardModal: React.FC = () => {
  const navigate = useNavigate();
  const isOpen = useCreateBoardModalStore((s) => s.isOpen);
  const title = useCreateBoardModalStore((s) => s.title);
  const isSubmitting = useCreateBoardModalStore((s) => s.isSubmitting);
  const error = useCreateBoardModalStore((s) => s.error);
  const close = useCreateBoardModalStore((s) => s.close);
  const setTitle = useCreateBoardModalStore((s) => s.setTitle);
  const submit = useCreateBoardModalStore((s) => s.submit);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEscapeHandler({
    id: 'create-board-modal',
    priority: 650,
    isOpen,
    onEscape: close,
  });

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  return (
    <AuthModal isOpen={isOpen} onClose={close}>
      <div className={classes.root}>
        <h2 className={classes.title}>Создать доску</h2>

        <form
          className={classes.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) {
              inputRef.current?.focus();
              return;
            }
            submit().then((created) => {
              const boardId = Number(created?.id);
              if (Number.isFinite(boardId) && boardId > 0) {
                navigate(`/spaces/${boardId}`);
              }
            });
          }}
        >
          <div className={classes.field}>
            <input
              ref={inputRef}
              id="create-board-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Введите название"
              autoComplete="off"
              maxLength={CREATE_BOARD_TITLE_MAX_LENGTH}
              disabled={isSubmitting}
            />
          </div>

          {error ? <p className={classes.error}>{error}</p> : null}

          <div className={classes.actions}>
            <Mainbtn
              variant="mini"
              kind="button"
              type="submit"
              text={isSubmitting ? 'Создание...' : 'Создать'}
              disabled={isSubmitting || !title.trim()}
            />
            <Mainbtn
              variant="mini"
              kind="button"
              type="button"
              text="Отмена"
              onClick={close}
              disabled={isSubmitting}
            />
          </div>
        </form>
      </div>
    </AuthModal>
  );
};

export default CreateBoardModal;
