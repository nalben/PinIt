import React from 'react';
import classes from './Mainbtn.module.scss';
import { NavLink } from 'react-router-dom';

export type ButtonType = 'button' | 'submit' | 'reset';
export type Variant = 'auth' | 'none' | 'mini';             // можно добавлять другие варианты
export type Type = 'button' | 'link' | 'navlink';

export interface MainbtnProps {
  text: string;
  variant?: Variant;
  kind?: Type;
  type?: ButtonType;
  href?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}

const Mainbtn: React.FC<MainbtnProps> = ({
  text,
  variant = 'auth',
  kind = 'button',
  type = 'button',
  href = '#',
  onClick,
  disabled = false,
}) => {
  const className = `${classes.mainBtn} ${classes[variant]}`;

  if (kind === 'button') {
  return (
    <button
      type={type}
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {text}
    </button>
  );
}

  if (kind === 'link') {
    return (
      <a href={href} className={className}>
        {text}
      </a>
    );
  }

  if (kind === 'navlink') {
    return (
      <NavLink to={href} className={className}>
        {text}
      </NavLink>
    );
  }

  return null;
};

export default Mainbtn;
