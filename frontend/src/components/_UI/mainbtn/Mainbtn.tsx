import React from 'react';
import classes from './Mainbtn.module.scss';
import { NavLink } from 'react-router-dom';

export type ButtonType = 'button' | 'submit' | 'reset';
export type Variant = 'auth' | 'none';             // можно добавлять другие варианты
export type Type = 'button' | 'link' | 'navlink';

interface MainbtnProps {
  text: string;
  variant?: Variant;
  kind?: Type;
  type?: ButtonType; // применяется только если kind === 'button'
  href?: string;     // применяется для link/navlink
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

const Mainbtn: React.FC<MainbtnProps> = ({
  text,
  variant = 'auth',
  kind = 'button',
  type = 'button',
  href = '#',
  onClick,
}) => {
  const className = `${classes.mainBtn} ${classes[variant]}`;

  if (kind === 'button') {
    return (
      <button type={type} className={className} onClick={onClick}>
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
