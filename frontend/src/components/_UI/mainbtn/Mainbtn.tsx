import React from 'react';
import classes from './Mainbtn.module.scss';
import { NavLink } from 'react-router-dom';

export type ButtonType = 'button' | 'submit' | 'reset';
export type Variant = 'auth' | 'none' | 'mini';             // можно добавлять другие варианты
export type Type = 'button' | 'link' | 'navlink';

export interface MainbtnProps {
  text: React.ReactNode;
  variant?: Variant;
  kind?: Type;
  type?: ButtonType;
  href?: string;
  state?: unknown;
  onClick?: React.MouseEventHandler<HTMLElement>;
  disabled?: boolean;
  className?: string;
}

const Mainbtn: React.FC<MainbtnProps> = ({
  text,
  variant = 'auth',
  kind = 'button',
  type = 'button',
  href = '#',
  state,
  onClick,
  disabled = false,
  className: classNameProp,
}) => {
  const className = `${classes.mainBtn} ${classes[variant]} ${classNameProp ?? ''}`.trim();

  if (kind === 'button') {
  return (
    <button
      type={type}
      className={className}
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
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
      <NavLink to={href} state={state} className={className} onClick={onClick as React.MouseEventHandler<HTMLAnchorElement>}>
        {text}
      </NavLink>
    );
  }

  return null;
};

export default Mainbtn;
