import React from 'react';
import classes from './Header.module.scss'
import { NavLink } from 'react-router-dom';
import Noti from '@/assets/icons/monochrome/noti.svg'
import Default from '@/assets/icons/monochrome/default-user.svg'

const Header = () => {
    return (
        <header className={classes.container}>
            <nav className={classes.menu}>
                <div className={classes.item}>
                    HOME
                </div>
                <div className={classes.item}>
                    SPACES
                </div>
                <div className={classes.item}>
                    TO DO
                </div>
                <div className={classes.item}>
                    ABOUT
                </div>
                <div className={classes.item}>
                    PROFILE
                </div>
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