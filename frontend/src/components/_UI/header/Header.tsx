import React, { useEffect, useRef, useState } from 'react';
import classes from './Header.module.scss';
import { NavLink } from 'react-router-dom';
import Noti from '@/assets/icons/monochrome/noti.svg';
import Default from '@/assets/icons/monochrome/default-user.svg';
import Burger from '@/assets/icons/monochrome/burger.svg';

const Header = () => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLElement | null>(null);
    const burgerRef = useRef<HTMLButtonElement | null>(null);

    const linkClass = ({ isActive }: { isActive: boolean }) =>
        isActive
            ? `${classes.item} ${classes.active}`
            : classes.item;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node) &&
                burgerRef.current &&
                !burgerRef.current.contains(e.target as Node)
            ) {
                setMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className={classes.container}>
            <div className={classes.burger_con}>
                <button
                    ref={burgerRef}
                    className={classes.burger}
                    onClick={() => setMenuOpen(prev => !prev)}
                >
                    <Burger />
                </button>
            </div>

            <nav
                ref={menuRef}
                className={`${classes.menu} ${menuOpen ? classes.active_menu : ''}`}
            >
                <NavLink to="/home" className={linkClass}>
                    HOME
                </NavLink>
                <NavLink to="/spaces" className={linkClass}>
                    SPACES
                </NavLink>
                <NavLink to="/todo" className={linkClass}>
                    TO DO
                </NavLink>
                <NavLink to="/about" className={linkClass}>
                    ABOUT
                </NavLink>
                <NavLink to="/profile" className={linkClass}>
                    PROFILE
                </NavLink>
            </nav>

            <div className={classes.user}>
                <div className={classes.noti}>
                    <Noti />
                </div>
                <div className={classes.profile}>
                    <Default />
                    Nalben
                </div>
            </div>
        </header>
    );
};

export default Header;
